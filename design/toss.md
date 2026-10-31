# 뽀득뽀득 목욕탕: 앱인토스 (Apps in Toss) v1 — design spec

Status: **built** (spec 2026-10-27; built on `feat/toss` 2026-10-28 → 2026-10-31, after merging main's #22 relay, #23
party polish, #24 crown and #25 party trophies). What changed against this spec while building, the test results and
the open points: section 20. Online in Toss now goes through main's WebSocket relay (its own room space `t`), not
TURN: 2.5 and 20.1 replace every TURN line below that 20.1 names. The goal of v1 is one thing: a working
`ppodeuk-bath.ait` that the owner uploads in the Apps in Toss console and opens with **토스앱 테스트** (the QR code) on
real phones. Review (검토 요청), the GRAC rating (게임물 등급분류) and the store listing come later and are researched
separately. Code is referenced by function name and section, never by line number (`src/game.js` changes all the
time). Every function named here exists today unless it is marked **new**.

The owner's decisions (2026-10-27), which this spec builds on:
1. The first Toss version has **online play by the game key**. `getUserKeyForGame()`'s hash is the Toss player's
   identity, and the online rooms (같이 하기, 배틀, 파티, by room code over the relay, PeerJS behind it; 20.1) are open to any Toss player
   who has a key. **No trophy stakes in the Toss build**: battles and parties there are friendly matches (친선 경기).
   **No Google login anywhere** in the Toss build. **No server and no 사업자**, so there is no Toss login, no IAP and
   no ads.
2. The first goal is a working .ait for the console's 토스앱 테스트 QR.

Sources: the colleagues' research notes of 2026-10-27 (three agents: packaging, policy, WebView), summarised where
they are used in 1.2, and the SDK's own type file `@apps-in-toss/web-framework@3.9.0/dist/index.d.ts` (its exports
were checked on 2026-10-27). A second pass the same day (section 19) read the SDK's **code** (`dist/index.js`,
`dist/config.d.ts`) and the official pages for every call used here (`.md` versions of developers-apps-in-toss.toss.im:
hash-key, game-center, safe-area, screen/event, navigationbar, file-storage/storage, screen.setorientation,
screen/properties, sdk-3.x, checklist/app-game, console-workspace, plus the docs' own question endpoint for two gaps),
and corrected the spec where they disagreed. **UNCONFIRMED** marks anything no document, type file or SDK code
settles. Those items are listed again in 15.6 as things the QR test must answer.

---

## 0. Decisions in one table

| Question | Decision |
|---|---|
| Build target | `node build.js --toss` (also `PG_TOSS=1`) writes a **Toss variant of the deploy page** into the new Vite project `toss/`: `toss/index.html` plus the five engine files as `toss/public/pg/*.js`. With the flag it writes **only** the Toss outputs and the `TMP` fixtures: `dist/`, `deploy/`, the itch zip and `.firebaserc` are not touched, so a Toss build can never change what the web serves (2.1). In `toss/`, `npm run build` runs the page build, then `vite build`, the bundle check, `ait build` and the check again, and ends with `toss/ppodeuk-bath.ait` (2). |
| SDK hand-off | `toss/src/main.js` imports the SDK, PeerJS and the fonts, then calls `PG.Ait.boot(SDK)` from the **new** plain file `src/ait.js`. That function reads native Storage into localStorage (at most 3 s), locks landscape, sets the Safe Area CSS variables, sets `window.PG_AIT` (a small bridge, 2.4) and only **then** loads the five engine files in order. The engine never imports anything. |
| CDNs | None at run time. PeerJS comes from npm (`peerjs@1.5.4`, the same version as the deploy). The two Google Fonts come from npm `@fontsource/*` and are emitted into `dist/assets`. **No TURN** (built: 20.1): the rooms go through main's relay Worker (`window.PG_RELAY`, space `t`), PeerJS behind it with its own default ICE servers; `turn.config.json` stays the deploy's. Firebase is not in the Toss build at all. |
| Removed | Service worker and its registration, manifest and app metas, the 앱으로 설치 pill and the fullscreen button (both already disappear without a manifest link), the `FB_HOP` `location.replace`, `PG_CLOUD`, the Google Fonts links, the PeerJS CDN tag, the "open outside" links (`intent://`, `kakaotalk://`), and the Google sign-in calls (cut from the Toss copy of game.js, 2.2). |
| Online gate | **손님은 온라인 불가** (Google sign-in) is replaced by a **game-key gate**: `netGated()` is true in Toss while `AIT.hash` is empty. The friends panel then shows a card without any login button (4.2). |
| Identity uses | (1) the online gate; (2) the room's same-player check: `troDevHash` hashes the game key instead of the store's random `dev`, so the same Toss account in one room twice is a practice match (`NET.q === 2`, no coins); (3) through (2), the coin rules of friendly matches; (4) a one-way tag of the key is saved (`ppogeul-ait-who`), which is what the checklist's "사용자 식별자 값을 확인하여 저장" asks. The key itself is never shown, sent, logged or stored (4.5). |
| Trophies | **Off for online battles and parties**: no 트로피 걸기, no place points, no +5, no holds and no results. Every switch is `AIT.on`: two guards in the core (`troEscrow`, `troApply`), so no trophy can move whatever calls them, plus nine named UI / flow sites (5). The 목욕 보너스 (solo and co-op progress, nobody loses anything) stays, so leagues and the shop's league locks still work. No Toss line uses the verb 걸다 about trophies. |
| Cloud, friends, invites | **Dropped for v1. The Toss build is Firestore-free.** No `PG_CLOUD`, so `CLOUD.on` is false and 친구 순위, 친구 초대 and cloud saves are inert as on a deploy without config. Firebase anonymous auth was considered and rejected (6). |
| Leaderboard | Best **solo run score** (from 탕 1, offline solo, not the demo). It is submitted when the 목욕 끝 / ending card shows, only when it beats the last accepted score. Before the console approves the app info the call answers `LEADERBOARD_NOT_FOUND`, and the score is kept for the next run end. **토스 랭킹** in 내 기록 appears after the first success (7). |
| Storage | localStorage stays the engine's synchronous working copy. A wrapper on `Storage.prototype` (the PR preview's technique) mirrors every `ppogeul-*` write to the native `Storage`. A **lineage id** plus a write sequence number decide which side is newer at boot: sequence numbers are compared only inside one lineage, and a local copy of another lineage never overwrites a native one. A session that could not read native Storage never writes to it. Flushes happen 2 s after the last write (at most every 5 s, at the latest 20 s after the first mark) and at once when the page hides (8). |
| Screen | `Screen.setOrientation({type:'landscape'})` at boot. The rotate screen stays as the fallback for old Toss apps. Portrait is restored on `pagehide`. The Safe Area comes from `SafeAreaInsets` into `--sa-t/r/b/l` (all of page.html's `env(safe-area-inset-*)` uses become these variables; elsewhere they still equal `env()`). The game's header buttons stay out of a box reserved for the nav bar's 더보기 / X (9). |
| Sound | The existing sound button and M key. **New** `PG.Audio.hold(on)` silences at once (gain 0, then `suspend`) on `visibilitychange` hidden, `pagehide`, the SDK's overlay-visibility event and before the leaderboard opens. The iOS silent switch is respected (no `audioSession` change) (10). |
| Exit | The game nav bar's X with its automatic exit modal (SDK >= 2.9.2; we ship 3.9.0). Android back goes back on every screen. At the bare title the listener is removed, so Toss's own back applies (docs: without a listener the default is history back; what it does with an empty history is UNCONFIRMED). Fallback, if it does not exit: the game's own two-press confirm, then `Screen.close()`. Never a bare close without a confirmation (the checklist wants one). iOS swipe back is off and the screen stays awake only while a game runs; both are restored on `pagehide` (11). |
| Analytics | No `init` export exists in 3.9.0. "Analytics init" is the bridge's first `Analytics.screen({log_name:'title'})`, and then one screen log per overlay change, with no personal data (12). |
| Eval scanner | Today the five engine files contain 0 `eval(`, 0 `new Function` and 0 string timers, and so do the published files of every library the bundle pulls in (the SDK 3.9.0 and its bridge, valibot, semver, PeerJS 1.5.4 and its four dependencies: pre-scan of 2026-10-27, 13). `tools/check-toss.js` (**new**) scans the built `dist/` for a list of banned patterns and for every external host; any match fails the build. |
| Rooms | The Toss build has its **own room space** on both transports, so Toss rooms and web rooms never meet: the relay's space `t` (the Worker lets only the two Toss origins in there) and the PeerJS id prefix `ppodeuk-t-`. The web deploy has stakes and Google accounts, Toss has friendly matches and game keys. Joining is by code only (neither transport has an 열린 방 lobby). 코드 복사 copies the code and a how-to line, never a URL (3). |
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
- Exports used here (checked in the 3.9.0 code, not only the types):
  - `getUserKeyForGame()`: resolves `{type:'HASH', hash}` | `'ERROR'` | `undefined` (app older than 5.232.0). In 3.9.0
    it is a deprecated v2 alias: `const getUserKeyForGame = getAnonymousKey`, one bridge call `getAnonymousKey`, and
    **every** answer that is not a HASH becomes `'ERROR'`. So `'INVALID_CATEGORY'` never reaches the page. The docs
    (hash-key) still name `getUserKeyForGame` for games: the hash is stable per user and mini-app, across reinstalls
    and device changes, and needs no consent screen. Game mini-apps need Toss 5.232.0 **at entry** (Toss shows its own
    update screen below it), so in a real game every version gate used here (5.215.0, 5.221.0, 5.232.0) is met.
  - `Storage`: `getItem` / `setItem` / `removeItem` / `clearItems` (async, strings), plus `getItems` / `setItems`
    (Toss 5.270.0+, each with `.isSupported()`). Wiped only with the Toss app.
  - `Screen`: `setOrientation({type})` (with `.isSupported()`; throws `UNSUPPORTED_APP_VERSION` below 5.215.0),
    `setAwakeMode({enabled})`, `setIosSwipeBack({isEnabled})`, `close()` (= `closeView`). Orientation and awake mode
    apply to the whole Toss app; the docs say to restore both when leaving.
  - `SafeAreaInsets` (= `SafeArea`): `get()` (synchronous, a constant Toss injects before the page loads),
    `subscribe({onEvent})` → `{top,left,right,bottom}`. The X sits at `right + 10`, `top + 5` (iOS) / `top + 10`
    (Android); game UI that overlaps it can be rejected.
  - `graniteEvent.addEventListener('backEvent' | 'homeEvent', {onEvent, onError})` → unsubscribe. A `backEvent`
    listener blocks the default back.
  - `Game`: `setLeaderboardScore({score: string})` → `{statusCode: 'SUCCESS' | 'LEADERBOARD_NOT_FOUND' |
    'PROFILE_NOT_FOUND' | 'UNPARSABLE_SCORE'}` or `undefined` (old app); `openLeaderboard()` (sends the mini-app to the
    background); both with `.isSupported()`; `getUserProfile`, `subscribeInfoOverlayHidden`.
  - `Analytics` (`screen` / `impression` / `click` / `log`, with **no** `init`), `Environment.environment`
    (`'toss'` | `'sandbox'`; `getOperationalEnvironment()` is its deprecated twin), `isMinVersionSupported`,
    `onVisibilityChangedByTransparentServiceWeb({options: {callbackId}, onEvent(isVisible), onError})` → unsubscribe.
- How the SDK behaves (from `dist/index.js`): every call reads constants Toss injects
  (`window.__appsInTossConstants`) or asserts `window.ReactNativeWebView`. **Outside the Toss WebView** (a desktop
  browser without the devtools mock) every call, `isSupported()` included, **throws synchronously**; it does not
  return a rejected promise. The bridge is created with `timeout: 0`: **a bridge call can stay pending forever**, so
  every call this spec awaits has its own cap.
- 3.x has no `webViewProps.type`. The game navigation bar (더보기 + X only) comes from the console's **앱 유형 = 게임**
  (a field of its own, apart from the genre category; the docs' answer to that question). For a dark game the docs'
  own example is `navigationBar: { theme: 'dark', transparentBackground: true, withTitle: false }`.
- Live origin `https://ppodeuk-bath.apps.tossmini.com`, QR test origin `https://ppodeuk-bath.private-apps.tossmini.com`.
  Web storage is per origin, so test data never carries over to live. HTTPS-only and `wss://`-only. No iframes. No
  links that leave the Toss domain (`location.replace`, nested WebViews). No `eval` (the scanner also catches it inside
  third-party libraries). No install prompts. Only Toss login may be used, and Google login is explicitly refused.
- The game checklist: the first screen within 10 s; a sound on/off toggle; sound stops at once in the background and
  comes back on return; the X works; nothing intrudes into the Safe Area (Dynamic Island on the side in landscape);
  no bottom sheet opens by itself on entry; every screen has a way out; Android back goes back or exits; fullscreen;
  the chosen orientation works; responses within 2 s; an exit confirmation; records survive closing and reopening;
  "사용자 식별자 값을 확인하여 저장하고, 게임이 정상적으로 시작돼요"; the bridge is not called excessively, not from
  loops / timers / redraws, and failed calls retry a capped number of times at a controlled interval.
- The leaderboard works only after 미니앱 정보 승인 (else `LEADERBOARD_NOT_FOUND`), one per mini-app, game category
  only, Toss app 5.221.0+. It must not be called right at entry. Its policy (score unit, sort order) is set in the
  console's app info (리더보드 (게임 앱)).
- QR testing: upload the .ait in 앱 번들, press 토스앱 테스트, scan. Testers must be logged into Toss, **workspace
  members** and **19 or older**. Every upload gets a new `deploymentId` (a new QR). On the phone, 더보기 → 웹 디버그
  툴즈 shows Log / Network / Element.

UNCONFIRMED (each one is a QR-test item in 15.6): whether WebRTC data channels, the PeerJS cloud signalling server and
Metered TURN work inside the Toss WebView (staff only said "WebRTC is not blocked"); whether `env()` Safe Area values
are right inside the WebView; the nav bar's exact size; whether the exit modal fires
`onVisibilityChangedByTransparentServiceWeb`; what Toss's default Android back (history back) does at our title,
where the page has no history; the native `Storage` value size limit and whether it is shared between the QR-test
and live origins; whether the scanner treats an unused Google-named string as a problem (2.2 removes the API names,
not every word).

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
  **never read** (`fbConf` null). Because `fbConf` is null, the deploy page this run could make would lack `PG_CLOUD`,
  so a `--toss` run **writes nothing outside `toss/` and `TMP`**: no `dist/`, no `deploy/` (and so no `TMP/deploy/`
  copy), no itch zip, no `.firebaserc` (a guard around those four writes; the in-memory pages and their checks still
  run, so a broken page still stops the build). Otherwise `npm run build` in `toss/` would silently strip the cloud
  sign-in from `deploy/` the next time the owner runs `firebase deploy`. A plain `node build.js` is unchanged and
  also writes the `TMP` Toss fixtures below (not `toss/`).
- `tossOf(build)` builds the page from the same pieces as `deployOf`, in this order:
  `<!doctype html>`, `<html lang="ko" class="pg-sa pg-ait">`, charset, the same viewport (`viewport-fit=cover`,
  `user-scalable=no`), `<title>`, description, `<meta name="pg-build" content="BUILD">` (so 웹 디버그 툴즈 shows which
  build runs), the relay line (built, 20.1: `<script id="pg-relay">window.PG_RELAY={url:…,space:"t"};</script>`; never
  `PG_PEER_OPTIONS`), `<style>${RESET_SA}</style>`, `headRest`
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
  regions of 2.2 removed. (Built, 20.1: no TURN; only `PG_RELAY_URL=none` leaves the relay out, and the build then prints
  `WARNING toss: 중계 서버 없음 (PG_RELAY_URL=none) - 다른 네트워크의 친구와는 연결이 안 될 수 있어요 / no relay in the Toss build`.)
- Checks, which stop the build: the Toss page has exactly one `<script type="module">` (`/src/main.js`) and no other
  `<script src>`; none of `serviceWorker`, `rel="manifest"`, `PG_CLOUD`, `firebase`, `fonts.googleapis`,
  `fonts.gstatic`, `cdnjs`, `peerjs.min.js`, `location.replace`, `구글`, `Google` (case-sensitive); the relay line exactly when
  the build has a relay, with the space `t`, and no `PG_PEER_OPTIONS` (20.1); every pattern of 13's list absent
  from `toss/public/pg/*.js`; the cut markers balanced (2.2). The **artifact and the deploy are checked for no Toss**,
  structurally, because page.html's own CSS names `.pg-ait` (9.3) and game.js reads `window.PG_AIT` in every build:
  no `<html …pg-ait` class (`/<html\b[^>]*\bpg-ait\b/`), no assignment `/PG_AIT\s*=(?!=)/`, no `@apps-in-toss`, no
  `<script` whose `src` ends in `ait.js`. Engine and page comments must not name `@apps-in-toss` (the same rule as
  the word `firebase` today).
- Always written (with or without `--toss`, for the tests, in `TMP` only, like `deploy-cloud/`): `TMP/toss/`
  (`index.html` + `pg/*.js`, byte-equal to what `--toss` writes) and `TMP/toss-fx/` (the same page with the module
  entry replaced by `../ait.js`, the fake SDK hook and a boot line, 15.3). It also copies `src/ait.js` to `TMP/ait.js`
  and writes `test-toss.html` (15.2). The generic loop that turns every `src/tests/*.js` into `test-<name>.html`
  (artifact page + driver) must **skip `toss.js` and `toss-fake.js`**: otherwise it overwrites the special
  `test-toss.html` and makes a meaningless `test-toss-fake.html`. `toss-net.js` stays a normal driver (its page only
  hosts the two frames).
- The build hash `BUILD` for the Toss page: sha256 over `tossOf('-')` and the five `pg/` files, 12 hex chars (as
  `deployFilesOf`).
- The final log line gains: `toss/: index.html + pg/*.js (build X, relay: <url> space t | none)`.

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
    "@fontsource/black-han-sans": "5.3.0",
    "@fontsource/gowun-dodum": "5.3.0"
  },
  "devDependencies": {
    "vite": "6.3.5",
    "@apps-in-toss/devtools": "3.9.0"
  }
}
```
Every version is exact (no `^` / `~`) and frozen by the lock file. Checked on npm on 2026-10-27: both fontsource
packages are at 5.3.0 and ship `400.css` (families `'Black Han Sans'` / `'Gowun Dodum'`, woff2 + woff slices with
`unicode-range`); `@apps-in-toss/devtools` 3.9.0 declares the peer `@apps-in-toss/web-framework >=3.0.1 <4`.
(`peerjs` 1.5.5 exists; 1.5.4 stays, the deploy's version.) The SDK lists `@apps-in-toss/cli` as a runtime
dependency: it is the `ait` command, installed by `npm ci`, and nothing in the page imports it. `ait init` is **not**
run (it rewrites the build script, edits the Vite config and adds devtools with a version range). This spec writes
its outputs by hand.

`apps-in-toss.config.ts`:
```ts
import { defineConfig } from '@apps-in-toss/web-framework/config';
export default defineConfig({
  appName: 'ppodeuk-bath',                    // = the console's app name, exactly
  brand: { primaryColor: '#0a2327' },         // the page's --bg (the manifest's theme colour); the owner may change it
  permissions: [],                            // nothing: no camera, mic, clipboard permission, location
  webBundleDir: 'dist',
  webView: { bounces: false, pullToRefreshEnabled: false, overScrollMode: 'never', allowsBackForwardNavigationGestures: false },
  // the game draws under it (fullscreen); 더보기 / X float on top. theme 'dark' = light icons for the dark --bg (the
  // docs' example for a dark background): the X must be visible. withTitle false: no logo / name even if the bar
  // were ever the non-game one
  navigationBar: { transparentBackground: true, theme: 'dark', withTitle: false },
});
```
(`mediaPlaybackRequiresUserAction` stays at its default `true`; the engine already unlocks audio on the first tap.
`webViewProps.type` no longer exists in 3.x: the game nav bar (더보기 and X only) comes from the console's
**앱 유형 = 게임** (1.2), which the owner checks in 16. `config.d.ts` 3.9.0 accepts exactly these keys.)

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
uses, from `dist/assets`. The check (13) still requires the two family names and at least one `.woff2` in
`dist/assets`.
`src/ait.js` is imported here as a module (strict mode, top-level `this` undefined) and inlined as a classic script
in the test pages: it must name `window` explicitly, never `this`, and declare nothing at the top level outside its
IIFE.

### 2.4 `src/ait.js` (**new**): the boot sequence and the bridge
A plain IIFE like the engine files: no `import`, no build step. It defines `window.PG.Ait = { boot, make, store }`.
The Toss entry uses it, and so do the test fixture and `test-toss.html` (with a fake SDK). It is **not** in `ORDER`:
the artifact and the deploy never have it.

`boot(sdk, opts)`:
1. `T0 = performance.now()`; the storage wrapper is installed (8) before anything else. Every step is wrapped so that
   a throwing or missing SDK function never stops the game. One helper does it: `call(fn, ms)` runs `fn` inside
   `try` (SDK calls throw **synchronously** outside Toss, 1.2) and races the promise against `ms`; a throw, a
   rejection and the cap all come back as one "failed" value. No SDK call in this spec is awaited without it.
2. Orientation: if `sdk.Screen.setOrientation.isSupported()` (inside `try`: it throws outside Toss), call
   `setOrientation({type:'landscape'})` and do not wait more than 800 ms for it. Not supported → nothing; the rotate
   screen does the asking, as on the web.
3. Safe Area: `apply(sdk.SafeAreaInsets.get())` sets `--sa-t/r/b/l` (px) on `document.documentElement.style`, plus
   `--ait-nav-w` / `--ait-nav-h` from its own `NAV = { w: 96, h: 44 }` (9.3).
   `SafeAreaInsets.subscribe({ onEvent: apply })` follows rotation and the Dynamic Island side; each change also
   dispatches a `resize` event, so `fit()` runs again.
4. Storage: `await store(sdk.Storage, localStorage).load()` with a 3 s cap (section 8).
5. The game key: start `sdk.getUserKeyForGame()` now. The SDK checks the version itself (`undefined` below 5.232.0),
   and Toss blocks a game below 5.232.0 at entry anyway, so `.isSupported()` is only a cheap first test (a throw
   from it = not inside Toss = `err`). Do not wait for it. `PG_AIT.key()` hands out the same promise, capped at
   **8 s**: no answer by then is `err` (the bridge never times out by itself, 1.2), and a HASH that still arrives
   later upgrades the state to `ok`.
6. `window.PG_AIT = make(sdk, store)`, then `Analytics.screen({ log_name: 'title' })` once (the "init").
7. Load `opts.scripts` in order: `<script src>` with `async = false`, appended to `<body>`. `onerror` on any of them
   puts a plain line in the body: `게임을 불러오지 못했어요. 닫고 다시 열어 주세요`.
8. Page lifecycle: `visibilitychange` hidden and `pagehide` → `store.flush()`. `pagehide` → also, best effort and
   not awaited, everything the mini-app changed app-wide goes back: `setOrientation({type:'portrait'})`,
   `setAwakeMode({enabled:false})` and `setIosSwipeBack({isEnabled:true})` when `play(true)` is in force, and the
   back listener is removed.
Steps 2 to 5 run in parallel. The engine starts at most about 3 s after `T0`, well inside the 10 s first-screen rule.

`window.PG_AIT` (v 1), the only thing `game.js` ever sees of the SDK:

| Member | Does |
|---|---|
| `v: 1`, `env` | `Environment.environment` (`'toss'` / `'sandbox'`), `''` when it throws |
| `key()` | → `Promise<{st:'ok', hash} \| {st:'old'} \| {st:'err'}>`. `old`: the SDK answered `undefined` (an app below 5.232.0: in a real game Toss already blocked it at entry, so in practice only the devtools mock can show it). `err`: `'ERROR'`, a throw (also: not inside Toss), the 8 s cap, or a hash that is not a string of 8..512 characters. There is **no** category state: 3.9.0 turns every non-HASH answer into `'ERROR'` (1.2). An `ok` is cached for the page, and the bridge then writes the tag (4.5). After `err` a new SDK call is allowed at most every 5 s. One call in flight at a time. |
| `lb.ok()` | `Game.setLeaderboardScore.isSupported()` (in `try`; a throw = false) |
| `lb.submit(n)` | `Game.setLeaderboardScore({ score: String(n) })`, capped at 8 s → `'ok'` \| `'nf'` (not found) \| `'np'` (no profile) \| `'bad'` (unparsable) \| `'err'` (`undefined`, a throw, the cap) |
| `lb.open()` | `Game.openLeaderboard()` → `true` / `false` (a throw or a rejection, e.g. "LeaderBoard not found") |
| `screen(name)` | `Analytics.screen({ log_name: name })`. The same name as the last one is not sent again. |
| `back(fn)` | `fn` set: one `graniteEvent.addEventListener('backEvent', { onEvent: fn, onError: noop })`, kept until `back(null)` calls its unsubscribe. The same `fn` again: nothing. |
| `close()` | `Screen.close()` (11.2's fallback only) |
| `play(on)` | Only on a change: `Screen.setAwakeMode({ enabled: on })` and `Screen.setIosSwipeBack({ isEnabled: !on })` (option names confirmed in the 3.9.0 d.ts and the screen/properties page) |
| `onShow(fn)` | `onVisibilityChangedByTransparentServiceWeb({ options: { callbackId: 'pg' }, onEvent: fn, onError: noop })`. Before calling `fn(false)` the bridge also flushes the store. |
| `insets()`, `nav` | the last `{t, r, b, l}`; `nav` = `NAV` (`{w, h}`, the box reserved for 더보기 / X) |

`make` never exposes the SDK object, and the bridge has no "call anything" member.

### 2.5 What is bundled instead of CDNs
- **PeerJS**: `peerjs@1.5.4` from npm, set as `window.Peer` before the engine. `peerTag()` becomes
  `!!window.PG_AIT || !!document.querySelector('script[src*="peerjs"]')`, and the friends panel's `why` line uses
  `peerTag()` instead of its own `querySelector`. Signalling stays the PeerJS cloud (`wss://0.peerjs.com`, port 443),
  and the host id is `'ppodeuk-t-' + code` (14, `net.js`).
- **The relay, not TURN** (built 2026-10-31, after main's #22 replaced the paid TURN): the Toss page carries the same
  one-line `window.PG_RELAY` as the deploy, with `space:"t"` (`build.js` `tossRelayTag`). The URL is the deploy's
  (`PG_RELAY_URL` / `relay.config.json`), else `TOSS_RELAY` in `build.js` = the owner's Worker
  `https://ppodeuk-relay.ppodeuk.workers.dev` (not a secret; the Toss build runs on the owner's PC, where neither is
  set). `net.js` asks for the space `t` itself whenever `window.PG_AIT` is set, whatever the line says, and the
  Worker lets only `https://ppodeuk-bath.apps.tossmini.com` and `https://ppodeuk-bath.private-apps.tossmini.com` into
  `t` (`cloudflare/wrangler.toml` `ORIGINS`), so a Toss code never opens a web room and a web code never a Toss one.
  The relay is a WebSocket on 443 (`wss://`): no WebRTC, no TURN. PeerJS stays behind it (`ppodeuk-t-` ids) with
  its own default ICE servers; `turn.config.json` is the deploy's only and never reaches the Toss page (checked).
- **Fonts**: `@fontsource/black-han-sans` and `@fontsource/gowun-dodum` (2.3). `setupDOM`'s `#pg-fontcss` media
  switch finds no element and does nothing. `#pg-fontwarm` warms the slices as before.
- **Firebase**: nothing. `PG_CLOUD` is never written into the Toss page, and the check fails on the word `firebase`.
- **`domReady`** in `game.js`: `document.readyState === 'complete' || !!window.PG_AIT`. Under Toss the engine runs
  after `DOMContentLoaded`, and PeerJS is already there.
- **`netTransport`** in Toss (as specified here; built on main's `netOrder` as `aitOrder`, 20.1: `['ws', 'peer']` of
  what the page has): the automatic choice is `'peer'` or nothing. Today it falls back to `'bc'` when
  `window.Peer` is missing, which in a phone's single WebView would make a room nobody can join, under the line
  `지금은 이 브라우저의 다른 탭끼리만 함께 할 수 있어요`. With `AIT.on` and no `Peer`, `NET.tr` is `null` and the panel
  shows its existing `peerOff` card. `'bc'` stays reachable only when forced by `?net=bc` (`Net.fromQuery`, the
  `toss-net` test's frames).

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
| Relay room space (built, 20.1) | `w` (a PR preview `p`) | `t` (the Worker admits only the Toss origins) | `net.js` `relayInfo`, `build.js` `tossRelayTag` |
| TURN list (`PG_PEER_OPTIONS`) | with `turn.config.json` | never (the relay needs no WebRTC) | `tossOf`, checked |
| 내 기록 note | `처음 선물로 트로피 N개를 받았어요! 친구와 배틀할 때 걸어 봐요` / `오늘 트로피 보너스 d/40개 · 목욕도 배틀도 받아요` | `처음 선물로 트로피 N개를 받았어요! 목욕을 끝까지 할수록 늘어요` / `오늘 트로피 보너스 d/40개 · 혼자 하기·같이 하기에서 받아요` | `fillRec` |
| 내 기록 stats | 최고 트로피 · 배틀 · 뽀득 KO · 혼자 최고 점수 | 최고 트로피 · 혼자 최고 점수 (friendly matches record nothing, so 배틀 / 뽀득 KO would stay 0) | `fillRec` hides the 배틀 and 뽀득 KO `dt` / `dd` and puts `is-ait` on the `dl` (2 columns) |
| 내 기록 buttons | 닫기 (+ 구글로 로그인, 친구 순위 with the cloud) | 닫기 + **토스 랭킹** (after the first accepted score, 7) | **new** `#pg-ait-lb`, made by JS only when `AIT.on` |
| Analytics, back, swipe, awake | none | the bridge | 11, 12 |

---

## 4. Identity: the game key

### 4.1 State (`AIT`, **new**, game.js section "v5 앱인토스")
`const AIT = { on, br, st, hash, at, scr, back, play, lb }`:
- `on = !!window.PG_AIT && typeof window.PG_AIT.key === 'function'` (read once at load, like `clInit`)
- `st`: `'off'` (not Toss) | `'wait'` | `'ok'` | `'old'` | `'err'` (no category state: 2.4)
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
| `old` | `토스 앱을 업데이트하면 온라인으로 할 수 있어요` | `토스를 최신 버전으로 업데이트해 주세요` | none |
| `err` | `토스 정보를 불러오지 못했어요` | `인터넷을 확인하고 다시 시도해 주세요` | `다시 시도` (aria-disabled while waiting, then for 5 s) |

  All three end with a solo line. `NG_TX.solo` (`혼자 하기는 로그인 없이도 바로 할 수 있어요`) names a login that Toss
  does not have, so Toss uses `AIT_TX.solo` = `혼자 하기는 지금 바로 할 수 있어요`. (`old` names no store and links
  nowhere. `wait` lasts at most 8 s: then `err`, 2.4.) The former `cat` row ("not the game category") is dropped: the
  page cannot see that case in 3.9.0, and in an app whose 앱 유형 is not 게임 the call may even answer a non-game
  HASH, so online would open. That is why the owner checks the 앱 유형 in the console (16), not the game.
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

### 4.5 What the key is never used for, and the saved tag
It is never shown, never put in the DOM, never sent to a peer (only the 6-character FNV of `t:key:code` leaves),
never logged (no console, no `Analytics` parameter), never written to storage as it is, and never used as a nickname.
Players type their own nick as today. `Game.getUserProfile()` (the Toss game nickname) is not used in v1.

The checklist asks that the user identifier is "확인하여 저장" (checked and saved) and that play records survive.
So on the first `ok` of a page load the bridge writes a **one-way tag** of the key: `ppogeul-ait-who` = the first 16
hex characters of SHA-256(`'ppodeuk-bath:' + hash`) (`crypto.subtle`; the bundle runs on https). It is a
`ppogeul-*` key, so it is mirrored to native Storage (8). In v1 the tag only records which Toss account the
progress on this device belongs to; a different tag at a later boot changes nothing yet (8's honest limit; the
per-account split is v2, 17). `PG.debug.ait.state()` shows `who: true|false`, never the tag.

---

## 5. Trophies off: friendly matches only (친선 경기)

One predicate: `AIT.on`. Two guards in the core come first. Every trophy change of a match goes through exactly
two functions, `troEscrow` (the hold at 시작!: it takes `stake + 6` place points, `S.t -= h`) and `troApply` (the
result, the +5 included). They are reached from `troHostGo`, `troGuestGo`, `troHostResult`, `troResultIn`, and also
from `PG.debug.tro.hold` / `.result` / `.apply`. With the guards, no caller that a site below misses (today or
added later) can move a trophy:

| # | Site | Change | Effect |
|---|---|---|---|
| 0a | `troEscrow(mid, …)` | `if (AIT.on) return false;` first | no hold, ever: nothing is taken at 시작!, so nothing can be refunded, forfeited or left stale (`troClose`, `troSessionEnd`, `troStale` find no `esc` entry) |
| 0b | `troApply(mid, …)` | `if (AIT.on) return null;` first | no result, no +5, no `S.g` / `S.w` / `S.ko` count from a match |
| 1 | `stakeNow()` | `NET.mode === 'battle' && !AIT.on ? NET.opts.bet \| 0 : 0` | The stake is 0 everywhere: `troCovers`, `troSeatFree`, `canAfford` and `troLowerStake` say "nothing at stake". No 트로피 부족 or 안 걸고 참여 marks. `'bet'` in `netSetOpts` stays 0. |
| 2 | `troHostGo()` | `AIT.on \|\|` added to the early return (next to `G.party`) | no `TRO.match`, no hold, so `troHostResult` returns at its first line and no `'tro'` is ever sent |
| 3 | `troGuestGo(id)` | `if (AIT.on) return;` first | no hold on guests |
| 4 | `troWait(mid)` | `if (AIT.on) return;` first | a guest never waits for a result |
| 5 | `troResultIn(m)` | `if (AIT.on) return;` first | a `'tro'` from anyone (an older or a hostile page) changes nothing |
| 6 | `buildOpts` | the `트로피 걸기` label and its `.pg-bets` row are not made when `AIT.on` (`syncOpts` skips missing rows already) | the host has no stake to choose |
| 7 | `troCountSub` / `troCountCls` | battle, online, `AIT.on`: `NET.q ? '연습 경기 · 비누 코인 없음' : '친선 경기 · 트로피 없음'`, class `' prac'` for both | the countdown's 2 / 1 line |
| 8 | `renderRoom` | rules: in Toss the battle's trophy lines (`troRulesLine`, `troFreeLine`, the +5 line, the 견습 line) become one line: q 0 `친선 경기예요: 트로피는 늘지도 줄지도 않아요` (`AIT_TX.friendly`), q 2 `AIT_TX.same` (4.3). The coin line and the battle lines follow unchanged. The guest summary's `'트로피 ' + troStakeTxt(stake)` item becomes `친선 경기`. A party room's `PARTY_TX.noTro` (`트로피는 걸지 않아요`) becomes `AIT_TX.friendly` too (`partyRules`). | the room says what happens |
| 9 | `troPodiumTag` / `troPodiumUI` | battle, online, `AIT.on`, not practice: tag `친선 경기` (class `pg-podium-tag is-prac`). Practice keeps `연습`. The note lines about stakes cannot occur (no `TRO.lastRes`). The guest wait line drops its stake part through `stakeNow() === 0`. | the podium |

Stays as it is: the 목욕 보너스 (`troBonus`: solo, and online co-op while `NET.q === 0`; progress only, `RUN_CAP` 30,
`DAY_CAP` 40), the trophy count and leagues on the title badge and 내 기록, the seat chips in the room (a count, not
a stake), and the shop's league locks. A party already holds no trophies, so nothing changes there except 4.3's coin
line and its rules line (site 8: `PARTY_TX.noTro` says 걸지, so Toss shows `AIT_TX.friendly` instead).
Wording rule (사행성): nothing a Toss player can see may use the verb 걸다 in any form (걸기, 걸고, 걸어, 걸지, 건),
판돈 or 가져요 about trophies, not even in a negation. Sites 6 to 9 remove every such line; the remaining ones are
reachable only with a stake above 0 (`안 걸고 참여`, `안 걸고 준비`, `트로피 부족`, 내 기록's `걸어 봐요`, which
`fillRec` replaces), and `stakeNow()` is 0 in Toss. The strings stay in `TRO_TEXT` for the hidden font warm-up only.
The Toss lines, verbatim: countdown `친선 경기 · 트로피 없음` / `연습 경기 · 비누 코인 없음`; room rules
`친선 경기예요: 트로피는 늘지도 줄지도 않아요` / `연습 경기예요: 같은 토스 계정으로 들어온 친구가 있어요`; podium
tag `친선 경기` / `연습`; the podium summary adds nothing about trophies (no `TRO.pod`, so `fillPodium`'s trophy
part is empty).

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
- The console's leaderboard policy (16) must sort **higher first** and take an integer score: `G.score` is never
  fractional, so `'UNPARSABLE_SCORE'` would mean our bug (`'bad'`).
- Before 검토 요청 (not v1's goal): the Toss game SDK post lists the leaderboard as a required item. A reviewer on a
  fresh phone sees 토스 랭킹 only after their first solo run ends (the first `SUCCESS`). If review asks for it
  earlier, the button can show whenever `lb.ok()` and no `'nf'` came this page load; a failed `open()` then hides it
  for the page load. Decide that when the review is prepared.

---

## 8. Native Storage adapter (`PG.Ait.store`, in `src/ait.js`)

Why: localStorage inside the WebView can be cleared (WKWebView applies the 7-day script-storage cap; the WebView's
data can be wiped). The native `Storage` survives app restarts and is wiped only with the Toss app. The engine's
reads are synchronous, so localStorage stays the working copy and the native store is the durable mirror.

- **Which keys**: every localStorage key starting with `ppogeul-` (the engine's, `audio.js`'s `ppogeul-muted`, the
  test namespaces' suffixed keys, `ppogeul-ait-lb`, `ppogeul-ait-who`). Nothing else (PeerJS or the SDK may use storage
  too; the 3.9.0 SDK code itself touches no web storage). Internal keys, never mirrored: localStorage `pgait:lseq` and
  `pgait:gen`; native `pgait:seq`, `pgait:gen` and `pgait:keys` (a JSON list of the mirrored key names, since native
  Storage cannot list keys).
- **The lineage id** `gen` (12 random base-36 characters from `crypto.getRandomValues`) names one history of the
  store. A new one is made only when **both** sides are empty. Whichever side wins at boot, the other side takes its
  `gen` too. Sequence numbers are compared **only when both sides carry the same `gen`**: a local counter restarts
  at 0 whenever the WebView's storage is wiped, so a bare "higher seq wins" lets a fresh local copy that wrote often
  enough overwrite the real native store.
- **The wrapper** (installed in `boot` before anything else runs, `PV_STORE`'s technique): `Storage.prototype.setItem`
  / `removeItem` / `clear` are wrapped. When `this === window.localStorage` and the key matches, the original call
  runs first, then `lseq + 1` is written (with the original setter, so it is not mirrored) and the key is marked
  dirty. Reads are not wrapped. (The SDK's own export is also called `Storage`: inside `src/ait.js` the web one is
  `window.Storage`, the native one is always `sdk.Storage`.)
- **Flush**: one timer, 2 s after the last dirty mark (later marks restart it), but never more than 20 s after the
  first unflushed mark and never sooner than 5 s after the previous flush started (so a burst of writes is at most
  one flush every 5 s: the checklist's "no excessive bridge calls"). Also at once on `visibilitychange` hidden,
  `pagehide` and `onShow(false)`. One flush: the dirty keys whose value differs from the last one flushed, written
  with `Storage.setItems` when `Storage.setItems.isSupported()` (Toss 5.270.0+, one call), else `setItem` /
  `removeItem` one after the other; then `pgait:keys` if it changed; then `pgait:gen` if not yet written; then
  **last** `pgait:seq = lseq`. A flush has its own **10 s cap** (`call`, 2.4): a bridge call that never answers counts
  as a failure and releases the in-flight flag, or one hung call would stop every later flush. On a failure: one
  retry 10 s later, then nothing until the next write (the checklist: no bridge calls in loops, retries capped). At
  most one flush in flight; marks that arrive meanwhile go to the next one.
- **Boot** (`load()`, capped at 3 s). Native is read with `Storage.getItems([...])` when supported, else the
  `getItem` calls run in parallel (not one after the other), first `pgait:gen`, `pgait:seq`, `pgait:keys`, then
  the listed keys. `ngen` / `nseq` (missing = '' / 0) and `lgen` / `lseq` (local, missing = '' / 0):
  - native empty (`nseq` 0 or no keys) → local wins if it has any `ppogeul-*` key: all of them are marked dirty and
    flushed at once (with `lgen`, made now if missing). Both empty → a new `gen`, nothing to copy.
  - native has data and `lgen === ngen` → `nseq > lseq`: native wins; `lseq > nseq`: local wins (every local
    `ppogeul-*` key dirty, and every native-listed key that local no longer has dirty as a removal); equal: nothing.
  - native has data and `lgen !== ngen` (local was wiped and refilled, or made by a session that never reached native)
    → **native wins**, whatever the seqs say.
  - "native wins" = every key in `pgait:keys` copied into localStorage (original setters), the local `ppogeul-*` keys
    not in the list removed, `lgen = ngen`, `lseq = nseq`.
  The seq is written last in every flush. So `nseq` only counts flushes that completed: a write cut off mid-flush
  leaves `lseq > nseq` in the same lineage, and the next boot pushes local again.
- **Boot timeout** (native did not answer in 3 s, or threw): the engine boots on local data, and the mirror is
  **unsynced**: it marks dirty keys but **never flushes** until a read of `pgait:gen` / `pgait:seq` succeeds (tried
  again at most 3 times, 10 s apart, and once on each return to the foreground). When it succeeds: native empty, or
  the same `gen` with `nseq <=` the `lseq` **this page booted with** (not the current one, which this session's own
  writes raised) → normal mirroring from here (the dirty keys go out). Native has data of another
  lineage, or a higher seq in ours → this session **never writes native**: local `pgait:gen` is cleared, so the next
  boot restores native (the progress of this one session is lost, the long-lived store is kept). Outside Toss (a
  desktop browser) every read throws: unsynced for good, local only, nothing is ever sent.
- Honest limits: the session-loss case above (rare: a bridge slower than 3 s **and** a wiped WebView storage). The
  progress belongs to this device's mini-app storage, not to the Toss account (a second Toss account on the same phone
  sees it; 4.5's tag records whose it is, nothing in v1 is split by account). The nav bar's 더보기 → 미니앱 용량 삭제
  may wipe the web storage only, the native one, or both (UNCONFIRMED): if only the web storage goes, the next boot
  restores native, so that menu cannot be used as a reset. QR origin and live origin have separate localStorage;
  whether native `Storage` is shared between them is UNCONFIRMED. If it is, a store written by the QR build shows up
  live (same lineage, the same player's own data, valid by `troParse`), and switching between the QR and live builds
  on one phone keeps "the last one played wins", which is consistent.
- Size: the trophy store is a few KB (`troParse` caps every list). The value limit of native `Storage` is
  UNCONFIRMED; the QR test fills a store (64 items, a 10-draw log) and reopens.

---

## 9. Screen: landscape, Safe Area, the nav bar, layout

### 9.1 Landscape
- At boot: `Screen.setOrientation({type:'landscape'})` (2.4 step 2). It applies to the whole Toss app, so `pagehide`
  sets `'portrait'` again (best effort). Whether Toss restores it on its own after X is UNCONFIRMED (15.6).
- Old Toss apps (< 5.215.0, `isSupported()` false): nothing is called. In practice a game never meets one (Toss
  requires 5.232.0 to open a game, 1.2), so the real fallback case is a `setOrientation` that fails or hangs (the
  800 ms cap). Either way `.pg-sa`'s rotate screen `가로로 돌려 주세요` shows on an upright phone, as on the web.
  `orientLock` stays inert (no fullscreen, no installed app).

### 9.2 Safe Area → CSS
- `page.html`: `:root { --sa-t: env(safe-area-inset-top, 0px); --sa-r: env(safe-area-inset-right, 0px); --sa-b:
  env(safe-area-inset-bottom, 0px); --sa-l: env(safe-area-inset-left, 0px); }`, and **every**
  `env(safe-area-inset-X, 0px)` in page.html (20 today) becomes `var(--sa-X)`. `safeInsets()`'s probe in game.js uses
  the variables too. On the artifact and the deploy the values are the same `env()` as before.
- Toss: the bridge writes the SDK's insets on `<html style>` (they win over `:root`) and keeps them current
  (`SafeAreaInsets.subscribe`). If `get()` throws, nothing is written and `env()` stays.

### 9.3 The nav bar (더보기 + X) and the game's header
- The game nav bar floats over the top-right corner, with light icons (`theme: 'dark'`, 2.3) on the dark game. Its X
  sits at `right + 10, top + 5` (iOS) / `top + 10` (Android) relative to the insets (the safe-area page: a game
  button under the X "can be rejected"). Its width and height are UNCONFIRMED. One source for both:
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
Toss's own back handling applies. The docs say a `backEvent` listener blocks the default back and that without one
the default is **history back**; the page never pushes history, so what Toss then does (close, with or without its
exit modal) is UNCONFIRMED (15.6.5). If it does not exit, the fallback keeps the root listener on and, at the root,
`aitBack` is a **two-press confirm**: the first back shows the title line `한 번 더 누르면 게임을 나가요` for 2 s,
a second back inside those 2 s calls `PG_AIT.close()` (`Screen.close()`). Never a bare close on the first press: the
checklist wants an exit confirmation. The same two-press rule applies if a back reaches `aitBack` at the root anyway
(an unsubscribe still in flight). `aitBack()` elsewhere does what Escape does:

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
to normal, and `pagehide` restores both too (2.4 step 8: the docs say awake mode affects the whole Toss app). Every
screen keeps the X as its way out.

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
The libraries, pre-scanned on 2026-10-27 from their published files (unpkg) with the patterns below: 0 hits in
`@apps-in-toss/web-framework@3.9.0/dist/index.js`, `@webview-bridge/web@1.7.10` and `@webview-bridge/utils@1.7.10`,
`valibot@1.5.0`, `semver` (index), `peerjs@1.5.4/dist/bundler.mjs` and its four dependencies (`webrtc-adapter` 9,
`@msgpack/msgpack` 2.8.0, `peerjs-js-binarypack` 2, `eventemitter3` 4). The SDK names no URL and touches no web
storage or `location` (one read of `location.href` for the analytics referrer). The bundled output is still scanned by
`check-toss` on every build, because the minifier and the exact resolved versions decide what ships.
Hosts the scan will meet in the bundle, all inert strings, to be allowlisted by hand with these comments: PeerJS
embeds its own `package.json` (`peerjs.com`, `github.com`, `opencollective.com`: homepage / repo / funding fields),
and its default ICE list names `turn:eu-0.turn.peerjs.com` / `turn:us-0.turn.peerjs.com` (used only when no
`PG_PEER_OPTIONS` is set) and `stun.l.google.com`. Its signalling host `0.peerjs.com` appears without a scheme.
`webrtc-adapter` and `valibot` name hosts only in comments, which the minifier drops (if a legal comment survives,
it is reviewed and allowlisted the same way).

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
  (PeerJS signalling), the host of the page's own relay line (built, 20.1: read from `dist/index.html`, so the owner's
  Worker name never has to be listed by hand; there is no TURN list any more), `stun.l.google.com` (PeerJS's default),
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
| `src/game.js`, top constants | `AIT_TX` (every Korean line of 3, 4, 5, 7, 11.2) next to `PARTY_TX`; `AIT_TEXT` = their joined values, warmed in `setupDOM` with the others |
| `src/game.js`, trophy core | `troEscrow` and `troApply`: `if (AIT.on) return false;` / `return null;` first (5, 0a / 0b). Since main's #25 (파티 트로피, design/party-trophies.md 14): `stakeNow` = `(battle or party) && !AIT.on`, `troPartyOn()` false under `AIT.on`, `troPartyResult` returns on `AIT.on` (it clears `TRO.match` first), `troHostGo` keeps `AIT.on` first in its rewritten return line, `troGuestGo(id, party)` returns first |
| `src/game.js`, section "v5 앱인토스" (**new**, after "v4 friends", before "attract-mode autopilot") | `AIT`, `aitKey`, `aitGateBuild`, `aitGatePaint`, `aitLbRun`, `aitLbBtn`, `aitBack`, `aitSync`, `aitScreen`, and `PG.debug.ait` = `aitDebugApi()` like `troDebugApi()` (`state()` → `{on, st, hasKey, who, lb, back, play, scr}`: never the key or the tag itself) |
| `src/game.js`, hooks (one line each) | `boot` → `aitKey()` after `setupDOM`; `showOverlay` → `aitSync(); aitScreen();` and for `'over'` / `'ending'` `aitLbRun()`; `toTitle` → `aitSync()`; `fillRec` → the Toss note lines, the hidden stats, `aitLbBtn()`; `renderFriends` → 4.2; `netGated`; `troDevHash`; `peerTag`; `domReady`; `fit` (9.3); `safeInsets` probe (9.2); `inviteText` and the room hint (3); the nine trophy sites (5); `partyRules` coin2 and `noTro` (built: `AIT_TX.friendly` before main's party trophy lines); `netTransport` (2.5; built: main's `netOrder()` has an `AIT.on` branch, `aitOrder(t)` = `['ws', 'peer']` of what is there, never `room` / `bc`; `netTransport` sets `NET.tr` from it);
`Snd.hold`; the `visibilitychange` / `pagehide` listeners → `Snd.hold`; `PG_AIT.onShow` subscribed in the AIT section's init |
| `src/game.js`, cut markers | regions 1 to 6 (2.2) and the two reworded comments |
| `src/audio.js` | `hold(on)` in `PG.Audio`, and `pagehide` → hold |
| `src/net.js` | `const PEER_PREFIX = W.PG_AIT ? 'ppodeuk-t-' : 'ppodeuk-';` plus a header line saying why. The code check (`CODE_RE`), the reroll on `unavailable-id` and the rest do not change. Built on main's relay: `relayInfo()` uses the space `t` whenever `W.PG_AIT` is set; tests read `peerId(code)` and `relaySpace()` |
| `src/page.html` | `--sa-*` on `:root`, the 20 `env()` → `var()`, the `/* v5 앱인토스 */` block (9.3) |
| `build.js` | `--toss` / `PG_TOSS` (and the guard: with it, no write to `dist/`, `deploy/`, `TMP/deploy/`, the itch zip or `.firebaserc`), `tossOf`, `RESET_SA`, the cuts, the checks, the `TMP/toss/`, `TMP/toss-fx/`, `TMP/ait.js` and `test-toss.html` outputs, the generic test-page loop skipping `toss.js` / `toss-fake.js`, the structural "no Toss in the artifact / deploy" checks (2.1); header comment. Built on main: the relay line with `space:"t"` (`TOSS_RELAY`, `tossRelayTag`), never `PG_PEER_OPTIONS`; the test pages get no relay (`tossOf(build, entry, null)`) |
| `tools/relay-node-test.js`, `tools/check-integration.js` (main's) | the relay test's build copy also copies `tools/toss-rules.js`; the lobby-call scan skips a member `.lb` (the bridge's leaderboard) |
| `toss/` | **new** (2.3) |
| `tools/check-toss.js` | **new** (13) |
| `tools/run-all.js` | jobs `check-toss` (node, `--static`), `toss` (virtual time), `toss-net` (rt), `toss-fit-*` (cdp) (15.5) |
| `tools/check-pages.js` | the artifact and deploy have no `pg-ait` class on `<html>`, no `PG_AIT` assignment, no `ait.js` script tag, no `@apps-in-toss` (the same structural patterns as 2.1: page.html's `.pg-ait` CSS and game.js's `window.PG_AIT` reads are in every build) |
| `src/tests/toss.js`, `src/tests/toss-fake.js`, `src/tests/toss-net.js` | **new** (15) |
| `toss/.gitignore` | `node_modules/`, `dist/`, `*.ait`, `index.html`, `public/pg/` (2.3); the root `.gitignore` is unchanged |
| `README.md` | one paragraph: the Toss build and where this spec is |

---

## 15. Test plan (one suite run at the end; headless Chrome always with `--mute-audio`)

### 15.1 `check-toss --static` (node, every run)
Section 13's static part, plus (built, 20.1): the Toss page's relay line - the owner's Worker when nothing names
one, `PG_RELAY_URL`'s when set, none and a warning with `PG_RELAY_URL=none`, always `space:"t"` - and never a
`PG_PEER_OPTIONS`, not even with a TURN list given. A bad marker layout (an opener without a closer, nesting) stops `build.js` with its message: tried
on a copy of the repo built with `PG_BUILD_TEMP`, the way `check-cloud` builds its copy. On the same copy, with a
made-up `firebase.config.json`: a plain build, then `--toss`; `dist/`, `deploy/` and the zip are byte-equal before and
after the `--toss` run (the deploy keeps its `PG_CLOUD`), and `toss/index.html` has no `firebase`.

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
  with `pgait:seq === lseq` and one `pgait:gen` on both sides; local wiped + native full → the restored store is what
  `troLoad` reads (`TRO.s.t`, coins, items, hiscore, nick, mute); same `gen`, `lseq > nseq` → pushed at boot (removals
  included); **local of another `gen` with a higher seq than native → native still wins**; native slow ("never") →
  the engine boots at 3 s on local data and **no native write happens** while unsynced; then a late read finding
  native data of another lineage → still no write, and local `pgait:gen` cleared (the next boot restores native); a
  late read finding native empty → the dirty keys go out; a `setItem` that never answers → the flush gives up at 10 s
  and the next write flushes again; a failing `setItem` → exactly one retry 10 s later, then nothing until the next
  write; 50 writes in 10 s → at most 3 flushes; `setItems` used when the fake says supported; `visibilitychange`
  hidden flushes at once; non-`ppogeul-` keys never reach native; a flush interrupted before its seq write → the next
  boot pushes local; every fake SDK function throwing synchronously (the desktop case) → the game boots, plays and
  saves locally, zero native writes.
- **T3 the gate**: `wait` (the key "never" answers) → the card's `wait` lines, 방 만들기 / 참여 off,
  hosting and joining through `PG.debug.mp` refused, and after 8 s `err`; a HASH arriving at 12 s → `ok`;
  `ok` → the panel as usual, and `ppogeul-ait-who` written once (16 hex, not the key); `undefined` → `old`;
  `'ERROR'` or a synchronous throw → `err` + 다시 시도: one SDK call per tap, at most every 5 s; 혼자 하기 starts in
  every state; the key never shows up in the DOM, in storage, in `PG.debug.ait.state()`, in the `hi` message (`d` is
  6 base-36 characters and differs from the key's FNV with another code) or in any `Analytics` argument; with
  `AIT.on` and no `window.Peer`, `NET.tr` is `null` (no `'bc'` room) unless `?net=bc`.
- **T4 trophies off** (through `PG.debug.tro` / `PG.debug.mp`, like `trophies.js`): `stakeNow()` 0 with `opts.bet` 20;
  `troHostGo` makes no `TRO.match`; `troResultIn` with a valid-looking `'tro'` changes nothing (the store JSON is
  byte-equal); `PG.debug.tro.hold(…)` returns false and `.result(…)` null, the store byte-equal (0a / 0b);
  `troCountSub()` gives both Toss lines; the room's rules and summary lines (5, #8) match verbatim, and no text node a
  Toss player can see in the room, the countdown, the podium, the party card or 내 기록 contains `걸` + a trophy word,
  `판돈` or `가져요`; the stake row is absent in the host's options; the podium tag is `친선 경기`; `troDevHash` with
  two equal keys → `troPractice() === 2` and `coinPrac()`; different keys → 0; `partyRules(2)` takes `AIT_TX.coin2`;
  the 목욕 보너스 still pays in solo.
- **T5 leaderboard**: a solo run from 탕 1 to game over → one `setLeaderboardScore({score: '<n>'})`; `nf` → `p` kept,
  no second call this page load, 토스 랭킹 hidden; next page load, `SUCCESS` → `ok = n`, the button shows and opens
  (`hold(true)` before `openLeaderboard`); a lower run → no call; co-op, the demo, `PG.debug.gotoRound` and online →
  no call; `lb.ok()` false → no call.
- **T6 back, play, sound, screen logs**: at the bare title `back(null)`; each row of 11.2 calls the named function
  (spied); a back reaching `aitBack` at the root → the `한 번 더 누르면 게임을 나가요` line and no `close`, a second
  one inside 2 s → one `Screen.close()`, a second one after 2 s → the line again; `play(true)` once at 시작! and
  `play(false)` once at the title; `pagehide` during a game → portrait, awake off, swipe back on; `onShow(false)` pauses solo play and
  `PG.Audio._state().ctxState` is `'suspended'` at the next frame; `hold` keeps the M-key mute after `hold(false)`;
  screen names in the order of a scripted session (title → solo → over → title → friends → room …), each once.

### 15.3 `src/tests/toss-net.js` (real time, 2 iframes of `TMP/toss-fx/` over `bc`, like `party-net.js`)
The parent hands each frame a fake SDK with its own key (`?k=A` / `?k=B`). `TRO.allowBc` and `CO.allowBc` are on, so
tabs count as real players for this test. A 2-player battle to the podium with keys A / B: no `'tro'` message (a
message spy), both trophy stores unchanged in `t / w / g / ko / de / esc`, coins paid as `coinBattleNow` says, the
countdown line `친선 경기 · 트로피 없음`, the tag `친선 경기`. The same with keys A / A: `연습 경기 · 비누 코인 없음`,
`AIT_TX.same` in the rules, coins 0. A 2-player party with A / B: coins paid, no trophies. The host id starts with
`ppodeuk-t-` (the 'peer' prefix is checked as a pure call, because `bc` does not use it). Prints `TOSSNET DONE`.
Built, 20.1: the party part also checks the host's stake of 20 stays 0 there (`troPartyOn()` false on both pages), and
a fifth part runs over `serve.js`'s local relay: two Toss frames with `?relay=` and no PeerJS at all open their room
on `ws` in the space `t` (`/ws-admin/info` lists `t:<code>`), a web page (`preview.html`, space `w`) cannot join that
code, a Toss page cannot join a web room's code, and a friendly battle A / B runs over `ws` as on `bc`.

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
1. **The relay in the Toss WebView** (built, 20.1; it replaced Metered TURN): the socket to
   `wss://ppodeuk-relay.ppodeuk.workers.dev/r/t/<code>` opens (the WebView must send `Origin:
   https://ppodeuk-bath.private-apps.tossmini.com`, or the Worker answers 4403; whether Toss must allowlist the
   workers.dev host is UNCONFIRMED). Rooms with 2, 3 and 4 phones in 같이 하기, 배틀 and 파티; Wi-Fi ↔ cellular; two
   different home networks; `?netinfo=1` is not reachable in Toss, so the room hint shows no transport - 웹 디버그
   툴즈 → Network shows the `r/t/` socket. PeerJS (`wss://0.peerjs.com` + a DataChannel) is only the fallback when the
   relay is down or capped (the room then says 직접 연결로 열었어요); it is seen only if that happens, nothing on the
   phone can force it. Network shows only the relay / peerjs / SDK traffic.
2. Landscape locks at entry, the game is fullscreen, and Toss is upright again after X (and the screen dims again
   normally: awake mode restored). A Toss app below 5.232.0 cannot open the game at all (Toss's own update screen);
   the rotate screen is only the fallback for a failed `setOrientation`.
3. Real Safe Area (iPhone notch and Dynamic Island on either side, Android cutouts) and the **real capsule size**.
   Correct `NAV` in `src/ait.js` afterwards; no game button under 더보기 / X. The insets are CSS px (compare
   `SafeAreaInsets.get()` in 웹 디버그 툴즈 → Log with the screenshot). The 더보기 / X icons are **visible** on the dark
   game (`theme: 'dark'`); if they are dark-on-dark, flip the theme.
4. X → the exit modal appears; the game pauses and is silent under it; confirming closes the game.
5. Android back on every row of 11.2; at the title: does Toss's default (history back, empty history) close the
   mini-app, and with its exit modal? If it does nothing, or closes without any confirmation, turn on 11.2's
   two-press fallback.
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
15. Storage across builds: play on QR build A, upload build B, open its new QR on the same phone → the progress is
    there (same origin, same native store). If the owner later has a live build too: whether the QR progress shows
    up live answers the "shared native Storage" question of 8.
16. Every SDK call answers: no `wait` card longer than a second or two, no flush still pending (`PG.debug.ait` in the
    Log tab). A call that hangs is exactly what 2.4's caps are for; note which one.

---

## 16. What the OWNER does

One time:
1. Console (apps-in-toss.toss.im) → the workspace → the mini-app **ppodeuk-bath**: check that the **앱 유형** is
   **게임**. It is its own field (chosen when the app was registered), apart from the genre **카테고리** (pick the
   game's genre there, and leave 웹보드 unchecked). The 앱 유형 decides the game nav bar (only 더보기 / X), the game
   key and the leaderboard. The game itself cannot tell (4.2), so check it here.
2. Workspace → 멤버 → **+초대하기**: invite the friends who will test, by e-mail. Each must accept, and needs a Toss
   account, 19 or older, logged into the Toss app on their phone. Only workspace members can open the QR build.
3. App info → **리더보드 (게임 앱)**: set the policy: an integer score, **higher is better**. It only works after the
   app info is approved; until then the game keeps the best score for later (7).
4. Online (built 2026-10-31: the relay, no TURN): **no `turn.config.json` for Toss** - the Toss build never reads it.
   The rooms use the relay Worker you already run for the web (`https://ppodeuk-relay.ppodeuk.workers.dev`,
   CLOUDFLARE-SETUP.md); `build.js` names it by itself. One check: Cloudflare dashboard → Workers → **ppodeuk-relay** →
   Settings → Variables → `ORIGINS` contains `t=https://ppodeuk-bath.private-apps.tossmini.com` (the QR test) and
   `t=https://ppodeuk-bath.apps.tossmini.com` (live). `cloudflare/wrangler.toml` has both since #22; if the variable
   lacks them, run `npx wrangler deploy` in `cloudflare\` once (outside play time: it ends open rooms). If the Worker's
   address ever changes, put the new one in `relay.config.json` (`{"url": "https://..."}`) or change `TOSS_RELAY`.
5. In PowerShell: `cd "C:\Users\뽀숑\OneDrive\바탕 화면\미니게임\bogeul\toss"` then `npm ci` (installs the pinned
   packages from the lock file; Node 24 is fine). `toss\node_modules` lands inside OneDrive: if `npm ci` stops with
   `EPERM` / `EBUSY`, pause OneDrive sync (tray icon → 동기화 일시 중지) and run it again.

Every build to test:
6. In the same folder: `npm run build`. It must end with `CHECK-TOSS OK: ppodeuk-bath.ait …`. If a check fails, the
   build stops and nothing should be uploaded.
7. Console → ppodeuk-bath → **앱 번들** → upload `toss\ppodeuk-bath.ait`. (Or: once `npx ait token add` with the API
   key from workspace → 키, then `npm run deploy -- -m "메모"`.)
8. Press **토스앱 테스트**. A QR code appears. Scan it with the phone's camera; it opens the build in Toss
   (`intoss-private://…`). Every upload has its own QR.
9. Go through 15.6 with the friends (each scans the same QR, then 친구와 하기 → 방 만들기 / 코드로 참여). For
   problems: in the game, 더보기 → **웹 디버그 툴즈** (Log, Network, Element). Send the Log tab's lines and a
   screenshot back.
10. Not now: 검토 요청. It needs the GRAC rating, the listing (names, icon 600x600, thumbnail 1932x828, screenshots)
   and at least one finished QR test, and it is researched separately.

---

## 17. Out of scope (later)
- Toss login (`appLogin`) + a Cloud Function with the mTLS certificate → Firebase custom tokens: cloud saves,
  친구 순위, 친구 초대 and trophy stakes on server-verified accounts. Needs 사업자 and probably Firebase Blaze.
- `getTossShareLink` + `share` room invites (`intoss://ppodeuk-bath?join=CODE`: only after launch).
- IAP, ads, promotions (all need 사업자). Haptics. `Game.getUserProfile` nicknames.
- Per-account local progress on a shared phone (8's honest limit): 4.5's `ppogeul-ait-who` tag is what v2 keys it on.
- The GRAC rating, the console listing, 검토 요청, 출시.

## 18. Risks and open questions
1. **Online inside the WebView** was the largest unknown (WebRTC). Built on the relay (20.1) it is a plain `wss://`
   socket on 443, which the Toss rules allow; what is left unknown is the `Origin` the WebView sends (the Worker
   refuses anything but the two Toss origins in the space `t`) and whether Toss wants the workers.dev host
   allowlisted. If the relay fails on one platform, PeerJS is tried behind it; if both fail, v1 still ships solo, and
   the friends panel would need a Toss line saying online is not available there (a follow-up, after 15.6.1). The
   relay's free allowance (about 4.8 h of 4-player play a day, design/relay.md) is shared by the web, PR previews and
   Toss.
2. The capsule size, the nav bar's icon theme and the default back behaviour are guesses until the QR test (9.3,
   11.2).
3. The eval pre-scan of the libraries' published files found nothing (13), but the bundled output is what Toss scans;
   `check-toss` runs on it every build. A hit in the SDK itself would need Toss's help (채널톡).
4. Dead strings that name Google (`LG_TX`, `CL_BTN`, `NG_TX`, `GOOGLE_G`) stay in the Toss copy of game.js. No code
   path can show them, and no sign-in API is left, but a reviewer reading the bundle sees the words. If review asks,
   cut those constants' values too (each becomes `''`), with the same markers.
5. The 3 s storage cap can lose a newer native copy on a very slow bridge (8).
6. 뽑기 (capsule draws with earned coins, never money) is not a payment, but reviewers or the rating may still look at
   it under 사행성. That is for the rating research; nothing in v1 changes it.
7. The client-side gate and the same-account check can be bypassed by a modified page; without a server, nothing
   stronger exists. The stakes are gone, so the gain from cheating is only coins.
8. `getUserKeyForGame` is a deprecated alias in 3.9.0 (`= getAnonymousKey`). It still works and the docs still name it
   for games; a later SDK may drop it. Moving to `User.getAnonymousKey()` (which throws instead of returning
   `'ERROR'` / `undefined`) is a one-line change in `src/ait.js`, with the same hash.
9. If the console's 앱 유형 were not 게임, nothing in the page would say so: the key may still arrive (a non-game
   HASH), online would open, and only the nav bar's look and a never-found leaderboard would show it (16, step 1).

## 19. Review against the code and the docs (2026-10-27)

Opened on `feat/toss` (base `c71e3ee`): `build.js` (all of it), `src/game.js` (the cloud / sign-in part, `clOutsideUrl`,
`clOpenOutside`, `clProvider`, `pwaInit` / `pwaSetupDOM`, `netTransport`, `peerTag` / `domReady`, `peerOpts`,
`netGated`, every `troMut` caller, `troEscrow`, `troApply`, `troHostGo`, `troHostResult`, `troResultIn`,
`troGuestGo`, `troPodium` / `troPodNow`, `fillPodium`, the room's ready / seat lines, every user-visible string with
걸- / 판돈 / 가져요, every `sset` call), `src/net.js` (`PEER_PREFIX`, `peerLink`, `transports`, `fromQuery`) and
`src/page.html` (external URLs, Google words, `env()` uses). The SDK: `@apps-in-toss/web-framework@3.9.0`
`dist/index.js`, `dist/index.d.ts`, `dist/config.d.ts`, `package.json`. The docs: the pages listed under Sources.

Confirmed as written: the six cut regions are the only `intent://`, `kakaotalk://`, `window.open`, `location.href =`,
`GoogleAuthProvider`, `signInWithPopup` / `signInWithRedirect` and `beforeinstallprompt` listener in the engine, and
all of them sit behind `CLOUD.on`; `lgOn()` is `CLOUD.on || PREVIEW` and `PREVIEW` comes only from `window.PG_PREVIEW`,
so neither the login screen nor any Google button can appear in Toss; `pwaInit` / `pwaSetupDOM` return at once
without a manifest link; page.html's only external URLs are the Google Fonts links that `tossOf` removes; game.js
has no service-worker code; `troHostResult` returns at its first line without `TRO.match`, and `troPodium` is only
called from `troHostResult` and `troResultIn`, so the podium shows no trophy change in Toss; `stakeNow()` 0 hides
every 안 걸고 / 트로피 부족 line; engine writes happen on events, never per frame; `Screen.setAwakeMode({enabled})` /
`Screen.setIosSwipeBack({isEnabled})` are the real option names; `config.d.ts` accepts exactly the keys of 2.3; the
fontsource packages ship `400.css`.

Corrected in this pass (the implementer's watch list):

1. **`--toss` would have broken the web deploy.** It set `fbConf` to null and still wrote `deploy/`, so a Toss build
   left a `deploy/index.html` without `PG_CLOUD` (no cloud sign-in) for the next `firebase deploy`. Now a `--toss`
   run writes only `toss/` and `TMP`, with a byte-equality test (2.1, 15.1).
2. **The "no Toss in the artifact / deploy" check would always fail**: page.html's own `.pg-ait` CSS and game.js's
   `window.PG_AIT` reads are in every build. The checks are structural now (2.1, 14).
3. **Test pages would collide**: the generic `src/tests/*.js` loop would overwrite the special `test-toss.html` and
   make a `test-toss-fake.html`. It skips both files now (2.1).
4. **`getUserKeyForGame` in 3.9.0 is `getAnonymousKey`** (one bridge call, every non-HASH answer → `'ERROR'`): the
   `cat` state could never happen and is gone. A non-game 앱 유형 may even answer a HASH, so the owner checks the
   앱 유형 in the console (1.2, 4.2, 16, risk 9).
5. **SDK calls throw synchronously outside Toss and never time out inside it** (`linkBridge` `timeout: 0`). Every
   call goes through one `call(fn, ms)` helper; the key has an 8 s cap (no endless `wait` card), a flush a 10 s cap
   (a hung call no longer blocks every later flush) (2.4, 8).
6. **Storage could overwrite the real progress**: a wiped WebView storage restarts the local counter at 0, so "higher
   seq wins" let a fresh local copy, or a session whose boot read timed out, replace the native store. A lineage id
   now guards every comparison, and an unsynced session never writes native (8, T2).
7. **Flush rate**: debounced only, a steady trickle of writes could postpone it forever, and a burst could call the
   bridge again and again. Now at most every 5 s, at the latest 20 s after the first mark, `setItems` when available,
   unchanged values skipped (8).
8. **The checklist asks that the user identifier be saved.** The raw key still never is; a one-way tag
   `ppogeul-ait-who` is (4.5).
9. **Trophy wording**: the rules line `트로피는 걸지도 바뀌지도 않아요` and the party's `트로피는 걸지 않아요` used 걸다,
   which the spec's own 사행성 rule forbids. Both are now `친선 경기예요: 트로피는 늘지도 줄지도 않아요` (5).
10. **Trophy switches were callers only**: `PG.debug.tro.hold` / `.result` and any future caller reached
    `troEscrow` / `troApply` directly. Two core guards now come first (5, 0a / 0b).
11. **Android back fallback was a bare `closeView()`**, which skips the exit confirmation the checklist requires. It is
    a two-press confirm now; the docs say the default back without a listener is history back (11.2).
12. **App-wide state on exit**: only the orientation was restored on `pagehide`; awake mode and swipe back are too
    (2.4 step 8, 11.3).
13. **Nav bar icons**: with a transparent bar over the dark `--bg` and the default theme, the X could be dark on dark.
    `theme: 'dark'` and `withTitle: false` follow the docs' example for a dark background (2.3, 9.3, 15.6.3).
14. **Online fallback in Toss**: without `window.Peer`, `netTransport` picked `'bc'`, a room nobody on another phone
    could join. In Toss it is `'peer'` or nothing (2.5).
15. **Leaderboard**: `lb.ok()` uses `Game.setLeaderboardScore.isSupported()`, an `undefined` answer is `'err'`, the
    console's leaderboard policy is an owner step, and 토스 랭킹's visibility for reviewers is noted for later (7, 16).
16. **Versions are pinned now**: fontsource 5.3.0 (both), devtools 3.9.0 (2.3). The libraries' eval pre-scan is done
    (0 hits), and the hosts the bundle check will meet are listed so the first build does not fail by surprise (13).
17. Owner steps: 앱 유형 vs 카테고리, invites by e-mail through +초대하기, the leaderboard policy, and OneDrive locking
    `node_modules` during `npm ci` (16).

---

## 20. As built (2026-10-31)

Built in two sittings: the 2026-10-28 one stopped at a usage limit (WIP `0f5e5a9`: everything of 14 in a first form);
on 2026-10-31 main was merged in and the rest finished. Every row of 14 is in the code. Nothing of 14 is missing; what
only phones can settle is 20.3.

### 20.1 What changed against the spec while building
- **main merged first** (`origin/main` at `95be06c`: #22 relay, #23 party polish, #24 crown, #25 party trophies;
  PARTY_V 6). Twelve conflicts in `game.js`, two in `net.js`, two in `build.js`, one each in `README.md` and
  `pr.yml`, resolved so both sides keep their meaning: main's party trophy lines appear only where `AIT.on` is false;
  main's `netOrder()` carries the Toss branch; main's relay checks stand next to the Toss checks.
- **Online: the relay, not TURN** (main's #22 replaced the paid TURN). 2.5's new bullet is the design. In code:
  `build.js` `TOSS_RELAY` / `tossRelay` / `tossRelayTag` (the line `window.PG_RELAY={url:…,space:"t"}`, the owner's
  Worker unless `PG_RELAY_URL` / `relay.config.json` name another, none with `PG_RELAY_URL=none`), never
  `PG_PEER_OPTIONS`; `net.js` `relayInfo()` takes the space `t` under `PG_AIT`; `game.js` `aitOrder(t)` =
  `['ws', 'peer']` of what the page has, used by `netOrder()` and `netTransport()`; PeerJS stays the fallback with
  `ppodeuk-t-` ids. `check-toss` reads the relay host from the page itself (the bundle's host allowlist needs no
  hand-written Worker name). Toss and web rooms are apart on both transports: space `t` vs `w`, `ppodeuk-t-` vs
  `ppodeuk-`.
- **파티 트로피 off** (design/party-trophies.md 14's three points): `stakeNow()` = `(battle or party) && !AIT.on`;
  `troPartyOn()` false under `AIT.on` (so no party trophy rule, summary item, countdown part, card chip or podium
  line); `troPartyResult` returns on `AIT.on` after clearing `TRO.match`; `troHostGo` keeps `AIT.on` first in main's
  rewritten return line; `troGuestGo(id, party)` returns first; the party rules show `AIT_TX.friendly`.
- Small fixes the merged suite found: the `AIT_TX` hint / invite name the game through `GAME_NAME` (check-integration
  allows the title once); page.html's `--sa-*` comment no longer writes an html tag (check-pages); check-integration's
  lobby-call scan skips a member `.lb` (the bridge's leaderboard); `relay-node-test`'s build copy also copies
  `tools/toss-rules.js`; a `net.js` comment's sample `wss://host…` became `wss://<host>…` (the bundle's host scan read
  `host` as a host name).
- `PG.debug.ait` gained `order(t)` (the whole `aitOrder`), `partyOn()` and `partySettle(m, walk)` (tests only).

### 20.2 Tests (2026-10-31; `PG_BUILD_TEMP=C:/Temp/bogeul-toss`, port 8792, `--mute-audio`; the full suite once, last row)
| Job | Result |
|---|---|
| `check-toss` (`--static` + the build copy) | 127 passed, 0 failed |
| `toss` (virtual time) | 136 / 0, with the new T3 transport order and T4 party trophy checks |
| `toss-boot-restore` / `-throw` / `-slow` | 6 / 0, 6 / 0, 3 / 0 |
| `toss-net` (real time) | 68 / 0: bc battles A/B and A/A, a party with a stake of 20 asked for, the relay part (space `t`, web and Toss codes apart, a battle over ws without PeerJS) |
| `toss-fit-*` (cdp, 41 jobs) | 41 / 41 |
| party, smoke, check-integration, trophies, check-pages, check-cloud, relay-node, audio-node, net-node, party-net, net-ws, battle-net-ws, ws-deploy, peer-deploy, pwa, cloud, touch-input, touch-play/title-844/932, touch-rec-844, touch-room-844 | all pass |
| trophies-net | 113 / 1 once (its `party R … R.f = [2]` line read the room before the short seat was listed), 114 / 0 on the rerun: a timing flake in main's test, no Toss code on that path |
| **the full suite** (after 20.4's fix, same settings) | `RUN-ALL OK: 339/339 jobs passed (1 skipped: ws-workerd)`, no rerun; `toss` 139 / 0 |

`toss/`: `npm ci` ran inside OneDrive without EPERM / EBUSY (npm 11 only warns that the esbuild and protobufjs install
scripts are not approved; the build does not need them). `npm run build`: `check-toss --dist` 34 / 0 (374 files,
5.67 MB uncompressed), `ait build`, then `CHECK-TOSS OK: ppodeuk-bath.ait 4657.4 KB, build 83257e6964b1`; rebuilt after
20.4: `CHECK-TOSS OK: ppodeuk-bath.ait 4657.7 KB, build c639e81cff49`. The .ait is not committed (`toss/.gitignore`). The built `toss/dist` opened in Chrome outside Toss (every SDK call throws there)
shows the title with the bundled fonts and logs no error.

### 20.3 Open points
1. Everything in 15.6, with 15.6.1 now about the relay: the `Origin` the Toss WebView sends on the socket (the Worker
   admits only the two Toss origins into `t`) and whether Toss wants the workers.dev host allowlisted.
2. `NAV = { w: 96, h: 44 }` (the 더보기 / X box) and `AIT_ROOT_BACK = false` (Toss's own back at the bare title) wait
   for the QR test (9.3, 11.2).
3. The relay's free daily allowance is shared by the web, PR previews and Toss (design/relay.md 9).
4. `TOSS_RELAY` is the owner's Worker address written in `build.js`: if the Worker ever moves, change it (or give
   `relay.config.json`).
5. Before 검토 요청 (not v1), from the 2026-10-30 research: the game SDK must-haves are all in (game key, leaderboard,
   Safe Area - missing it is a rejection -, native Storage, analytics screen logs); Google sign-in is not allowed
   (none is left: 2.2, 4); the known rejection causes and where the build stands - a duplicate header or back button
   (the nav bar's X is the only exit; the game's own header row shows its title and the sound / pause buttons, and
   the panels have their own 나가기 / 닫기: in-game navigation, but a reviewer may read the title row as a second
   header - look at it on the QR test, `.pg-ait .pg-brand { display: none }` is the one-line answer), no exit
   confirmation (the X's modal; Android back at the title is 15.6.5), `eval` in a library (`check-toss` scans the
   bundle on every build: 0 hits), links that leave Toss (none: cut regions, code-only invites), other payment means
   (none); only HTTPS / `wss://` (the relay and PeerJS signalling are `wss://`, nothing is plain http).
6. **The bridge view** (the screen Toss shows while a mini-app opens) must show the game's rating proof for the review:
   the rating class and its classification number from the GRAC (게임물관리위원회) or a self-rating business
   (자체등급분류사업자), entered in the console's app info, not in the .ait. Its exact fields and image sizes are
   UNCONFIRMED and belong to the rating research, together with the listing (names, icon 600x600, thumbnail 1932x828,
   screenshots).

### 20.4 Review before the PR (2026-10-31)
A fresh pass over `git diff origin/main...HEAD` for what would get the build rejected or break on a phone:
- **Google sign-in, Firestore, outside links, `eval`**: none reachable in the Toss bundle. The six cut regions take out
  every sign-in call, `intent://`, `kakaotalk://`, `window.open` and the one `location.href =`; `check-toss --dist`
  finds 0 banned patterns and no host outside the allowlist. Left in `pg/game.js`, inert: the cloud code (`firestore`
  5 times, all behind `CLOUD.on`, which needs a `window.PG_CLOUD` no Toss page has) and risk 4's Google-named strings.
- **Safe Area**: the 3.9.0 code reads `SafeAreaInsets.get()` from the constants Toss injects and fires `subscribe` on
  every change, so the rotation `setOrientation` causes arrives as an event (the subscription is made in the same
  tick as the request). `--sa-*` everywhere, 41 fit jobs.
- **Header / back**: the nav bar (더보기 / X) is the only bar; the game's title row has no back control, the panels'
  뒤로 / 닫기 sit in their content. Exit: the X's own modal; Android back at the bare title stays Toss's own until
  15.6.5 says otherwise (`AIT_ROOT_BACK`).
- **Only HTTPS / `wss://`**: the relay (`https://` → `wss://`), PeerJS on 443; the bundle's `http://` strings are a
  comment and the loopback test pattern.
- **Rooms**: space `t` in `net.js` whenever `PG_AIT` is set, whatever the tag says; PeerJS `ppodeuk-t-`.
- **Trophies / cloud under `AIT.on`**: the two core guards, party-trophies.md 14's three points, no cloud write.
- **Storage**: every SDK call capped; the `getItems` / `setItems` shapes match the 3.9.0 types
  (`Record<string, string | null>` / `Record<string, string>`).
- **The web build**: its deploy page built from `origin/main` and from this branch differs outside the engine scripts
  only in the `env()` → `var(--sa-*)` rewrites (the same values) and the `.pg-ait*` CSS, which matches nothing there.
  The engine's Toss paths are all behind `AIT.on`; the one change for every build is 10's `Snd.hold` on hide and
  `pagehide` (the sound stops at once; `visibilitychange` visible, which also fires on a back-forward-cache return,
  brings it back).

Fixed: **the sound could stay off after a Toss overlay or the leaderboard.** `aitShow(false)` and `aitLbOpen` held the
sound, and only `visibilitychange` visible or `onShow(true)` released it. Whether Toss sends either when its exit
modal or the board closes is UNCONFIRMED (15.6.4), and opening the board need not hide the page: the game then stayed
silent with its sound button on. Now `aitHold(on)` keeps `AIT.held`, and `aitWake` (a capture `pointerdown` /
`keydown` on the page, Toss only) ends the hold: a tap on the game means it is in front again. A hidden page is never
released that way. `toss.js` T5 / T6 gained three checks (they fail without the fix); `PG.debug.ait.state()` shows
`held`.
