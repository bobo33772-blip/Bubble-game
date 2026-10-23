# 친구 순위 (friend code + request/accept) - implementation spec

Scope: deploy with the cloud on (PG_CLOUD, bubble-c3ad4), signed-in players only; PR previews (PG_PREVIEW): a staged
demo, no SDK calls; the Claude artifact: nothing (no button, panel or markup). `players/{uid}`, its rules and
clPush/clLink are NOT changed. The lobby already owns `renderFriends` / `dom.friends` / "친구와 하기", so this feature
is `PAL` / `pal*` / `#pg-pal*`, labelled **친구 순위**.

## 1. Best stage (혼자 하기 최고 탕)
- `st = G.loop * 24 + G.round + 1` (24 = LEVELS.length, constant `PAL_TANG`), range 0..2400 (G.loop is 0..99). 0 = none.
  This is the 탕 *reached*, counted round by round from the very first 탕 (2회차's 5번째 탕 = 29). Shown as one total
  round count `최고 29라운드` (no 회차 / 탕 wording - the user, 2026-10-23); the ranking still orders by st.
- Recorded in `startRound` (every 탕, including continueLoop's 탕 1), only when
  `G.gameMode === 'solo' && !G.online && !G.attract && PAL.run`. `newGame(i)` sets `PAL.run = (i | 0) === 0`, so a
  debug start (PG.debug.start at 탕 > 1) never counts, and neither do co-op, battle or the attract demo.
- Local: `sset('ppogeul-stage', n)` (same pattern as ppogeul-hiscore), raise-only. Read once at boot next to the hiscore.
- Cloud: `profiles/{uid}.st`, raise-only (enforced in rules). On sign-in: local = max(local, profile.st).
- Best score = `G.hiscore` (already synced through players.s.hi). The card sends `max(G.hiscore, profile.hi)`.

## 2. Firestore model (all ids are fixed paths: no queries, except two limited lists of your own docs)
```
profiles/{uid}          the card; get: owner or an accepted friend; written by the owner only
  { v: 1, code: 'ABCD2345',        immutable; set at create, together with codes/{code}
    nick: '뽀숑',                  NET.nick via cleanNick (1..12 chars; rules allow 24 UTF-16 units). Never the Google name
    st: 29, hi: 12340, tr: 320,    best stage, best score, trophies (TRO.s.t, 0..99999); league = leagueOf(tr) on display
    c: 0..5, lk: 'a0b00',          representative animal = G.sel (CHAR_IDS index) and myLook(G.sel), 5 chars [0-9a-z]
    at: <server time> }            the last card write (5 s throttle)
codes/{code}            { u: uid }  8 chars of 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' (no I L O 0 1), shown ABCD-2345.
                        Created once, in the same transaction as the profile; never updated, deleted or listed
outbox/{uid}            { rq: <server time> } owner-only; the last request sent (20 s cooldown). Kept out of the card
reqs/{to}/in/{from}     { n, cd, c, lk, at }  a pending request = the sender's nick, code, animal, look (must equal the
                        sender's profile). Sender creates / withdraws; receiver gets, lists (limit <= 20), declines
friends/{uid}/f/{other} { at }  "uid lets other read uid's card"; always written as a pair (both halves) by the
                        receiver of a request, consuming the request in the same batch; either side deletes both
```
Limits: max 50 friends (client: no send / accept at 50; rules: list limit <= 60). Incoming shown <= 20 (rules force
`limit <= 20`); one pending per pair (fixed id); requests older than 14 days are deleted by the receiver's client on
listing; cooldown 20 s between sent requests per account (rules, via outbox); card writes >= 5 s apart (rules) and
client-debounced 15 s, skipped when unchanged. Decline = receiver deletes the request and mutes that uid locally for
30 days (`ppogeul-pal-mute`, <= 50 entries; later requests from it are deleted silently). Withdraw = sender deletes.
Unfriend = one batch deleting `friends/me/f/x` and `friends/x/f/me`. Nothing is ever deleted by sign-out.
Reads: panel open = 1 list + N profile gets (+N billed rule exists) + 1 list ~ 2N+2; cached 60 s.

## 3. firestore.rules additions (paste inside `match /databases/{database}/documents`, above the catch-all)
```
    // ---- 친구 순위 (bogeul-friends-design/friends.md): friend code, request / accept, a card only friends can read
    match /profiles/{uid} {
      allow get: if signedIn(uid) || (request.auth != null && exists(frP(uid, request.auth.uid)));
      allow list: if false;
      allow create: if signedIn(uid) && profNewOk(uid);
      allow update: if signedIn(uid) && cardOk();
      allow delete: if false;
    }
    match /codes/{code} {
      allow get: if request.auth != null;
      allow list: if false;
      allow create: if request.auth != null && codeNewOk(code);
      allow update, delete: if false;
    }
    match /outbox/{uid} {
      allow get: if signedIn(uid);
      allow list: if false;
      allow create: if signedIn(uid) && rqVal();
      allow update: if signedIn(uid) && rqVal() && request.time > resource.data.rq + duration.value(20, 's');
      allow delete: if false;
    }
    match /reqs/{to}/in/{from} {
      allow get, delete: if request.auth != null && (request.auth.uid == from || request.auth.uid == to);
      allow list: if request.auth != null && request.auth.uid == to && request.query.limit <= 20;
      allow create: if signedIn(from) && reqNewOk(to, from);
      allow update: if false;
    }
    match /friends/{uid}/f/{other} {
      allow get, delete: if request.auth != null && (request.auth.uid == uid || request.auth.uid == other);
      allow list: if signedIn(uid) && request.query.limit <= 60;
      allow create: if request.auth != null && pairNewOk(uid, other);
      allow update: if false;
    }

    function profP(u) { return /databases/$(database)/documents/profiles/$(u); }
    function codeP(c) { return /databases/$(database)/documents/codes/$(c); }  function outP(u) { return /databases/$(database)/documents/outbox/$(u); }
    function reqP(to, from) { return /databases/$(database)/documents/reqs/$(to)/in/$(from); }
    function frP(a, b) { return /databases/$(database)/documents/friends/$(a)/f/$(b); }
    function isCode(c) { return c is string && c.matches('^[A-HJKMNP-Z2-9]{8}$'); }
    function cardKeys() { return ['v', 'code', 'nick', 'st', 'hi', 'tr', 'c', 'lk', 'at']; }
    function cardVals(d) {
      return nickValue(d.nick) && isInt(d.st, 0, 2400) && isInt(d.hi, 0, 999999999) && isInt(d.tr, 0, 99999)
        && isInt(d.c, 0, 5) && d.lk is string && d.lk.matches('^[0-9a-z]{5}$') && d.at == request.time;
    }
    // first card: exactly the card keys, with this account's own new code doc in the same transaction
    function profNewOk(uid) {
      let d = request.resource.data;
      return d.keys().hasAll(cardKeys()) && d.keys().hasOnly(cardKeys()) && d.v == 1 && isCode(d.code)
        && cardVals(d) && getAfter(codeP(d.code)).data.u == uid;
    }
    // a card write: card fields only (never v / code), bests never drop, >= 5 s apart
    function cardOk() {
      let d = request.resource.data;
      let o = resource.data;
      return d.diff(o).affectedKeys().hasOnly(['nick', 'st', 'hi', 'tr', 'c', 'lk', 'at'])
        && cardVals(d) && d.st >= o.st && d.hi >= o.hi && request.time > o.at + duration.value(5, 's');
    }
    // one code per account, ever: only while its profile is created, pointing at the creator (a taken code = update)
    function codeNewOk(code) {
      let d = request.resource.data;
      return isCode(code) && d.keys().hasOnly(['u']) && d.u == request.auth.uid
        && !exists(profP(request.auth.uid)) && getAfter(profP(request.auth.uid)).data.code == code;
    }
    function rqVal() { return request.resource.data.keys().hasOnly(['rq']) && request.resource.data.rq == request.time; }
    // a request: the sender's own card values, with the outbox bumped in the same batch (the 20 s cooldown), to a real
    // player, not already friends, not while the other has a request pending to me (the client accepts that instead)
    function reqNewOk(to, from) {
      let d = request.resource.data;
      let p = get(profP(from)).data;
      return to != from
        && d.keys().hasAll(['n', 'cd', 'c', 'lk', 'at']) && d.keys().hasOnly(['n', 'cd', 'c', 'lk', 'at'])
        && d.n == p.nick && d.cd == p.code && d.c == p.c && d.lk == p.lk && d.at == request.time
        && getAfter(outP(from)).data.rq == request.time
        && exists(profP(to)) && !exists(frP(from, to)) && !exists(reqP(from, to));
    }
    // accept: only the receiver of an existing request ("them" asked "me"); both halves written and the request
    // consumed in the same batch
    function pairNewOk(uid, other) {
      let me = request.auth.uid;
      let them = me == uid ? other : uid;
      return (me == uid || me == other) && uid != other
        && request.resource.data.keys().hasOnly(['at']) && request.resource.data.at == request.time
        && exists(reqP(me, them)) && !existsAfter(reqP(me, them))
        && existsAfter(frP(me, them)) && existsAfter(frP(them, me));
    }
```
(`signedIn`, `isInt`, `nickValue` exist already. Rule calls <= 5 / op, accept batch 8 of 20. Add a header paragraph.)

Self-check:
- Strangers reading profiles: get needs owner or `friends/{uid}/f/{me}`; that doc is creatable only by me while a request
  *from uid to me* exists (only uid can create it: `signedIn(from)`), so the owner consented. `list: false` everywhere
  except own inbox / own friend list; collection-group queries match no rule (no `{path=**}`) -> denied. A request shows
  the receiver only the sender's own nick/code/animal/look. friends/* get is limited to the two members.
- Writing into others' data: profiles / outbox / codes owner-only (`d.u == me`). The only cross-account writes: a request
  into someone's inbox (one fixed doc per sender, sender's own values, 20 s cooldown, receiver may delete) and, on
  accept, the other's half of the pair (only with their pending request, consumed atomically). Deleting a pair half only
  removes a relationship one is part of; a half-deleted pair only takes away the deleter's own access.
- Spoofed / huge fields: hasAll/hasOnly key lists, int ranges, nick <= 24, lk = 5 chars, code pattern, at/rq ==
  request.time, request values == sender's profile, no free maps/lists (docs < 300 bytes). v / code immutable; st / hi
  never drop. Honest limit: st / hi / tr are what the page reports (an edited localStorage can claim st 2400), the same
  freedom the trophies already have; friends only. Nicks are not unique - the request and card show the code.
- Code enumeration: codes cannot be listed; a get needs sign-in; 31^8 = 8.5e11 codes, each guess a billed read (Spark
  50k/day) -> infeasible; a hit yields only a uid that may receive a request (the card stays closed).
- Quota abuse: card writes >= 5 s, requests 1 / 20 s, lists forced to limit 20 / 60, panel cache 60 s. Honest limit:
  many Google accounts or a modified page can still burn the per-project Spark quota with reads (true today for
  players/{uid}); App Check is the later fix. Inbox flooding by sock puppets: receiver sees <= 20, declines, local mute.

## 4. Client (game.js): new section "v4 friends (친구 순위)" right after the cloud section
State: `const PAL = { gen, uid, code, prof /* last card the server has */, sent /* its JSON */, run, t /* debounce */,
busy, rows, reqs, at /* cache time */, rqAt, err, msg, open, dom }`. Constants: PAL_TANG 24, PAL_MAX 50, PAL_LIST 60,
PAL_REQ 20, PAL_DEB_MS 15000, PAL_RQ_MS 20000, PAL_CACHE_MS 60000, PAL_OLD_MS 14 d, PAL_MUTE_MS 30 d, PAL_ABC, PAL_CODE_RE.
All timers go through clT() (tests run the clock fast). Every async step checks `gen` (dropped after sign-out/switch).
- `palOn()` = `CLOUD.on && CLOUD.st === 'in' && CLOUD.user && CLOUD.db`. Uses only `CLOUD.db`, never `CLOUD.ref`.
- `palCard()` = `{ nick: cleanNick(NET.nick) || '손님', st: palBest(), hi: max(G.hiscore, prof.hi), tr: TRO.s.t clamped,
  c: CHAR_IDS.indexOf(G.sel), lk: myLook(G.sel) }`. Never reads CLOUD.user beyond `.uid` (F.peeks stays 0).
- Hooks (one line each, no change to existing save logic): (1) `clSet(st)` after `CLOUD.st = st`: `palCloud()`:
  'in' with a new uid -> `palBoot()`; 'out' / 'off' -> `palReset()`; other states -> pause (no writes, keep cache).
  (2) `newGame` -> `PAL.run = ...`; `startRound` -> `palStageRun()` (sec. 1). (3) `showOverlay(name)` for 'title' /
  'over' / 'ending' -> `palKick()` (catches nick, look, G.sel, league and score changes). (4) the 내 기록 button.
- `palBoot()`: get own profile. Missing -> `palCreate()`: up to 5 tries of a transaction { tx.get(codes/C) exists ->
  throw 'taken'; tx.set(codes/C, {u}); tx.set(profiles/uid, {v:1, code:C, ...palCard(), at: serverTimestamp()}) } with
  C from crypto.getRandomValues. Exists -> PAL.code/prof from it, local best = max. Then `palKick()`, then one inbox list
  (limit 20) for the red dot. Failure (offline / permission-denied / quota) -> PAL.err, retried at next palOpen.
- `palKick()`: if palOn() and PAL.code, (re)start the 15 s debounce -> `palWrite()`: card vs PAL.sent; equal -> nothing;
  else `update({...card, at: serverTimestamp()})`; ok -> PAL.prof/sent; permission-denied -> one retry after 6 s
  (5 s throttle), then give up until the next kick; other errors -> retry 60 s.
- `palOpen()`: build the panel once (sec. 5); PREVIEW -> `palDemo()`; not signed in -> guest view; cache < 60 s -> render;
  else `palLoad()`: list `friends/me/f` limit 60 -> profile gets in parallel (each with its own catch; permission-denied
  -> get `friends/x/f/me`, if gone delete my half quietly) + list `reqs/me/in` limit 20 (drop + delete older than 14 d
  and muted). Rows = friends + me (from palCard()), sorted st desc, hi desc, tr desc, nick.
- `palAdd(text)`: normalise (upper-case, strip '-' / spaces); checks in order: pattern ("코드 8자리를 확인해 주세요"),
  own code ("내 코드예요"), 50 friends ("친구는 50명까지예요"), local cooldown ("20초 뒤에 다시 보낼 수 있어요"),
  get codes/C (missing: "그런 코드가 없어요"), already a row ("이미 친구예요"), a request from them in PAL.reqs -> accept
  it ("서로 요청해서 바로 친구가 됐어요"), get reqs/x/in/me exists ("이미 요청했어요"). Then flush the card (cancel the
  debounce, await any write in flight) and commit a batch { outbox/me set {rq}, reqs/x/in/me set {n, cd, c, lk from
  PAL.prof, at} }. Denied -> re-get own profile once and retry; else "잠시 후 다시 해 주세요".
- `palAccept(r)`: 50 check; batch { set friends/me/f/x, set friends/x/f/me ({at}), delete reqs/me/in/x, delete
  reqs/x/in/me (my own crossing request, if any) } -> get x's profile, add the row. `palDecline(r)`: delete + mute.
  `palUnfriend(x)`: inline confirm, batch delete both halves, drop the row.
- `palReset()`: gen++, clear timer, PAL fields, dots off; an open panel re-renders the guest view. Local 'ppogeul-stage'
  stays (it is this browser's record, like the hiscore). Account switch = reset + boot.
- Errors to text: unavailable/offline "인터넷이 연결되면 다시 볼 수 있어요"; permission-denied on load (rules not
  deployed) "친구 기능을 준비 중이에요"; resource-exhausted "지금은 사람이 많아요 · 잠시 후 다시"; other "잠시 후 다시".

## 5. UI
- Entry: in 내 기록's button row, between 구글로 로그인 and 닫기: `<button id="pg-pal-btn" class="pg-btn pg-ghost">친구 순위
  <i id="pg-pal-new" class="pg-tro-new" hidden></i></button>`, created by JS only when `CLOUD.on || PREVIEW` (artifact:
  never created). The same red dot is mirrored on the title's trophy badge #pg-tro (opens 내 기록) while PAL.reqs is
  non-empty. (Not on the title row: it already holds 혼자 하기 / 친구와 하기 / 상점 and "친구" there would read as online play.)
- Panel `#pg-pal`: a full-stage `.pg-panel` like #pg-hub, DOM built in JS (like the login screen), CSS in page.html under
  `/* v4 친구 순위 */`. 닫기 returns to 내 기록; Esc closes; focus goes to the code input on open (not on touch).
  1. Header: `친구 순위` + my code chip `내 코드 ABCD-2345 [복사]` (navigator.clipboard, fallback: select a readonly
     input; "복사했어요").
  2. Add row: input (maxlength 9, autocapitalize=characters, placeholder "친구 코드 8자리") + [친구 요청]; aria-live line.
  3. 받은 요청 (n), hidden when 0: rows `[bust] 닉네임 · ABCD-2345  [수락] [거절]`.
  4. Ranking `<ol>` "혼자 하기 최고 기록": `1  [bust in its look]  닉네임 (나)  최고 29라운드 · 12,340점 · [lg][cup]320`;
     my row highlighted; friend rows end with a small [끊기] -> inline "○○님과 친구를 끊을까요? [끊기] [취소]".
     Busts: the 16 px life_ sprite drawn with the card's look (same drawer as 마이페이지's busts), league = 8x8 lg icon.
  5. Footer: [새로고침] (off 10 s after a load) + [닫기].
- States: loading "불러오는 중…"; no friends: my row + "아직 친구가 없어요 · 내 코드를 알려 주거나 친구 코드를 넣어 보세요";
  guest (cloud on, signed out): only the line "로그인하면 친구 코드로 친구를 맺고 서로의 기록을 볼 수 있어요" + a
  [구글로 로그인] button calling clClick() (in 'frame' / 'inapp' / 'nostore' states: the same line 내 기록 shows, no
  button); errors replace the list with their line + [다시 시도]. Buttons are aria-disabled while a call is in flight.
- Fit: 320x568 - rows wrap to two lines (rank, bust, nick / stage · score · trophies), add row stacks under the code chip,
  the ranking list is the only scroller (`overflow-y: auto; min-height: 0`), tap targets >= 32 px, no horizontal scroll.
  390x844 - one line per row. 844x390 (short) - code chip and add row share one line, requests and ranking sit side by
  side when width >= 700 and height < 450, header compacts (reuse the 23em short-screen breakpoint pattern).
- Preview (`PG_PREVIEW`): `palDemo()` stages the demo code `PVWX-2345`, four demo
  friends with different st/hi/tr/looks, one incoming request; accept / decline / 끊기 / 요청 work locally only; a line
  "미리보기 · 예시 친구들이에요 (저장되지 않아요)". Zero SDK calls.

## 6. Tests (one suite run, headless Chrome with --mute-audio)
Extend the fake in src/tests/cloud.js (no second fake): `doc().get()`, `doc().delete()`, `doc().collection()`,
`collection().limit(n).get()` (query snapshot with docs / size), `db.batch()` (set / update / delete / commit, one
request.time for the batch), tx.get through the rules. Rules dispatch by path: `players/` -> the existing `F.rules`;
everything else -> `F.PR(op, path, auth, ctx)` with `ctx.get(path)` (before the batch), `ctx.getAfter(path)` (after),
`ctx.limit`, a JS port of sec. 3 function by function (any rules change updates it), counting rule calls (<= 10 / op).
- Group 1 (inert artifact): no #pg-pal-btn, no #pg-pal, no 'ppogeul-stage' writes from boot, no profiles/codes calls.
- Group 18a, rules pure (case by case, like 2b): stranger / owner / friend get profile; list profiles, codes, other's
  inbox / friend list, own lists without limit or over limit (refused) and at limit (allowed); profile create without
  / with a foreign / with its own code doc; a second code; a taken code; card write with an extra key (email, name,
  photo), nick 25, lk 6, st 2401, st or hi lower, code or v changed, at != now, within 5 s (all refused) and a good one;
  outbox within 20 s refused; request without the outbox bump, with values != profile, to self, to a non-player, as
  someone else, while friends, while the reverse is pending, with an extra key, a re-send (all refused) and a good one;
  accept by the receiver (allowed) vs missing half / request not consumed / by the sender / by a third party / no
  request / pair doc with an extra key (refused); unfriend by each side (allowed) vs third party, pair update (refused).
- Group 18b, frames (deploy fixture, profiles A and B): guest sees the invite line and makes no friend calls; A signs in
  -> profile with only the card keys + code doc u == uid (F.peeks 0); B adds A's code -> A's dot on, accept -> both see
  each other, ranking order and "(나)"; solo run to 탕 3 -> local 3, profile st 3 after the debounce; co-op / battle /
  attract / debug start at 탕 5 -> no record; a lower local st never lowers the profile; nick / look / G.sel changes ->
  one coalesced write, unchanged card -> none; own code / unknown code / already friends / already sent / cooldown /
  51st friend messages; decline + muted resend dropped; unfriend -> A's get of B's profile refused; open with N friends
  = 1 + N + 1 reads, reopen within 60 s = 0; sign-out -> guest view, cache empty, no later calls; sign-in as C -> no
  rows of A; offline / permission-denied / resource-exhausted lines; preview page -> demo, zero SDK calls; every
  existing cloud group still passes (the save logic is untouched).
- Group 18c, fit: `?shot=pal-in|pal-guest|pal-demo` at 320x568 / 390x844 / 844x390: no x-overflow, list scrolls, nothing
  clipped (getBoundingClientRect asserts; screenshots only if one fails).
## Implementation pass (one pass, in this order)
1. firebase/firestore.rules: sec. 3 block + header paragraph (collections, honest limits). Do not touch players rules.
2. game.js: PAL constants + section after the cloud section; the 4 hooks; 'ppogeul-stage' load at boot; panel + button
   DOM built in JS; palDemo for previews; PG.debug.pal (state, card, demo, stageTx) for tests.
3. page.html: the `/* v4 친구 순위 */` CSS block (panel, rows, chip, the 3 viewport rules).
4. src/tests/cloud.js: fake extensions, F.PR port, groups 1 / 18a / 18b / 18c; header comment updated.
5. FIREBASE-SETUP.md: "friends need the new rules: deploy them first". 6. node build.js, one cloud suite run, fit checks.
7. Owner, BEFORE merging: from bogeul/ (firebase.json points at firebase/firestore.rules) run
   `npx firebase-tools deploy --only firestore:rules`. Old pages keep working (players rules unchanged); a new page
   against old rules only shows "친구 기능을 준비 중이에요" in the panel.

## As built (2026-10-21, feat/friends)
- Rules, the client section `v4 friends (친구 순위)` (after the cloud section), the 4 hooks and the preview demo as above.
  players/{uid}, clPush / clLink and the players rules are untouched.
- Entry: the 친구 순위 button sits at the **top right of 내 기록's card**, not in its button row: at 1x the row has no room
  for a third button (it would wrap and break "one line"). The red dot is on it, on the title badge and on 마이페이지's
  내 기록 button (the badge opens 마이페이지 since the shop, not 내 기록).
- Busts: the 32 px portrait_ bust with the card's look (lookPortrait wears it; life_ does not take a look).
- 'ppogeul-stage' / 'ppogeul-pal-mute' carry the test-namespace suffix (clSfx, '' on a real page) and are read when
  needed, not once at boot. PG.debug.gotoRound also clears PAL.run.
- A linked browser at load is 'in' before the database exists: palCloud looks again every second (<= 2 min) until
  CLOUD.db is there.
- Panel: one scroller (the body); rows one line when the ranking is >= 420 px wide, else two; short + wide (phones on
  their side) puts the add row beside the title / code and 받은 요청 beside the ranking; <= 320 px tall compacts.
- Tests: src/tests/cloud.js groups 19a (rules, F.PR / F.pEval), 19b (frames), 19c (`?shot=pal-in|pal-guest|pal-demo|pal-rec`,
  run-all jobs `pal-*`: 640x360, 844x390, 932x430, 768x1024, 1x); group 18 was already the login screen. Portrait phones
  are not fitted (the deploy shows "가로로 돌려 주세요" there). Co-op and the attract demo are run in a frame; battle /
  online share the same gate. check-cloud: no pal markup in any page, the rules block present. Injected failures of
  friend calls use 'p' keys (pget, plist, pbatch, pdelete, ptx, pupdate) so the players tests keep theirs.
- Owner: deploy the rules before merging (step 7).

## As built (invites) (2026-10-21, feat/invite)
- **친구 초대**: each friend row in 친구 순위 has 초대 (before 끊기). Not in a room: a room is made the normal way
  (netHost with the current 같이 하기 / 배틀 choice and options) and the room screen shows; then the invite is written.
  Hosting in the room phase: the room's new 친구 초대 button (beside 코드 복사) opens 친구 순위 over the room (닫기 goes
  back) and 초대 invites into it; off when the room is full, the game started or I am someone else's guest.
- Firestore: `invites/{to}/in/{from} {code, mode, nick, at}` (one per sender -> receiver, a new one replaces it) written
  in one batch with `ivbox/{from} {at}` (one invite write per 10 s). Rules: only while `friends/{to}/f/{from}` exists,
  exactly those fields (code `[a-z0-9]{4}`, mode coop|battle, nick as the cards', at == request.time); read and listed
  (<= 50) by the receiver only; deleted by the receiver or the sender. The existing rules are untouched. The JS copy and
  its cases are in src/tests/cloud.js 19a; the two-account flow (with the gate, the preview and a reload) is 19d.
- Receiving: one onSnapshot listener on my invites while signed in (stopped on sign-out / another account; a failure is
  retried a minute on). The newest invite younger than 10 minutes (by its server `at`) is a banner at the top of the
  stage over the menus (title, 내 기록, 친구 순위, 상점, 친구와 하기, the result cards) - never in a game, a room or the
  login screen: "{nick}이/가 같이 하자고 해요 · 같이 하기|배틀" with the friend's bust when it is in my list (its nick as
  my list has it). 참여 opens 친구와 하기 and joins with the code (netJoin); 나중에 lets it go. Both delete the invite, as
  does seeing an expired one; closing my room deletes the invites I sent into it. A page opened later shows a pending
  one while it is valid (a linked browser now looks again every second until its user and database are up, so this
  and the 친구 순위 boot no longer wait for the next title).
- **손님은 온라인 불가**: on the deploy with the cloud, online play needs a signed-in Google account. A guest (or signed
  out) opening 친구와 하기 gets a card instead of 방 만들기 / 코드로 참여 / the open rooms: "온라인 같이 하기·배틀은
  Google 로그인하고 할 수 있어요", Google로 계속하기 (the usual sign-in, its states as the login screen's) and "혼자 하기는
  로그인 없이도 바로 할 수 있어요". netHost / netJoin refuse too (the test API included). An invite link (?join=CODE)
  opened as a guest shows the card with the code kept and joins that room by itself once signed in. Why: trophy stakes
  must belong to real accounts, so one person cannot farm trophies with throwaway guest identities. 혼자 하기 stays open
  to guests (the game has no one-screen multiplayer menu - local multiplayer exists only in the test API - so the hint
  names 혼자 하기 only). The artifact (no cloud) and PR previews are unchanged online.
- PR previews: 초대 makes a real room (online works there) and says "미리보기라 초대는 보내지 않아요"; the first time 친구
  순위 opens, a staged invite from a demo friend shows (marked 예시, 참여 only opens 친구와 하기).
- Fit: the banner stacks its buttons under the line on a small stage (the 1x screen); the card compacts in a short
  panel. Shots `pal-iv-844`, `pal-iv-1x`, `pal-gate-844`, `pal-gate-1x` check it. peer-deploy's page is now built
  without the cloud config (it plays online as a guest).
- Owner: deploy the rules before merging (they only add collections; older pages are unaffected).
