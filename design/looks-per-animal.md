# 뽀득뽀득 목욕탕: 동물마다 따로 꾸미기 (per-animal worn sets) — design spec

Status: **reviewed, ready for implementation** (2026-10-19; three reviews applied, §14). It builds on `design/shop.md` as
built (§21: passes A1-S5 and the review fixes) and changes only the worn set: **where it is stored, which animal an action
dresses, and what is sent** — plus a few cloud store-swap fixes the reviews found (pass L0, §6.7). Ownership, coins,
prices, the catalog, rendering (`lookFrame`, `lookPortrait`, `headTop`), effects, the twin colours and the slot rings stay
as they are. Code is referenced by function name, because `src/game.js` is edited by other passes. Its partner spec is
`design/gacha.md` (뽑기); the contract between the two is §0.1, the hub both of them shape is §4.0, the combined pass
order is §12.

The user asked (request A, 2026-10-19):

> 이거 아이템 착용하면 모든 캐릭터가 착용되지말고 그 캐릭터에만 착용하게 해줘. 다른캐릭터에는 따로 또 착용할 수 있게끔

Decided by the lead: an item is **owned once per player and wearable on every animal**; each of the six animals has
**its own worn set**. A player's existing single set is **copied to all six animals** when the store migrates, so
nobody loses the look they see.

What the user will see (Korean, for the release note):
- 마이페이지에 여섯 동물 줄이 생겨요. 동물을 누르면 그 동물이 입은 것만 보이고, 고른 아이템도 그 동물만 입어요.
- 상점의 미리 보기 위에 지금 꾸미는 동물 이름이 떠요. 쓰기·사기는 그 동물에게만 해요 ("꽥꽥이가 썼어요").
- 처음 화면·방의 동물 그림도 동물마다 자기 옷을 입고, 게임에서는 고른 동물의 옷을 입어요.

---

## 0. Decisions in one table

| Question | Decision |
|---|---|
| Store shape | `S.eq` becomes **one string of 30 characters**: 6 animals × 5 slots, in `CHAR_IDS` order (duck capy otter penguin cat frog), each 5-character chunk exactly today's worn set (h f n b e, `'0'` = none). Not a map: one regex validates it in the store, the link record, the rules and the cloud (`^[0-9a-z]{30}$`), every chunk reuses `lookParse` / `lookOwned`, and it costs 25 bytes more than today. Plus `lh` (0/1): this store was migrated from one shared set and has not been told about per-animal dressing yet (§2.4). |
| Store version | **`TRO_V` 2 → 3, owned by this doc.** `troParse` reads v 1 (no `eq`: all bare), v 2 (a 5-character `eq` is **copied to all six**), v 3; `v > 3` is `'newer'` (the read-only valve). The 뽑기 makes it 4 later (gacha.md 5.1): **one bump per feature, never one number for two schemas** (§0.1). |
| Which animal an action dresses | **The hub's animal `hubAni()`** (`HUB.ani`): my pick (`G.sel`) every time the hub opens; changed by the **row of six busts in 마이페이지** or a tap on any preview (left half: the previous animal, right half: the next). The 상점's try-on, 쓰기 / 벗기, the purchase's "bought = worn" and the 뽑기's "지금 쓰기" all apply to it, and the message names it: **"꽥꽥이가 썼어요"**. The hub never changes the pick. |
| Where each set is drawn | Everything that draws one animal takes **that animal's** chunk: the title's six busts and the room's six busts (each its own set), the attract demo (the pick's set), solo / co-op / battle (the set of the animal played, frozen at match start as today), the room cards (each seat's set for its animal). |
| Network | The wire format of a look is **unchanged: 5 characters, the set of the animal that seat plays now**. A guest sends the set of its pick (`myLook(G.sel)`: `'hi'`, `'eq'`), and **`'pk'` gains `lk`** (the new animal's set). A pick that raced the host's 시작 (the host ignores `'pk'` outside the room, so `G.sel` and the seat's animal differ) is **re-sent with its set when the guest comes back to the room** (`guestToRoom`, using `seatChar()` = my seat's `char` in the roster), so seat, animal and set agree again (§5.1). **NET_V stays 4**; snapshots gain 0 bytes; `'pk'` +13 bytes. |
| Cloud | **Document v 2 → 3, owned by this doc**: `eq` is the 30-character string; slots unchanged (`slotShape2`). A v 2 document is read with its 5-character `eq` copied to all six and becomes v 3 at this page's first slot or worn-set write. Older pages see `'newer'`. The worn set merges **per character** against the last **acknowledged** set (a snapshot carrying my own unacknowledged write never moves that base, §6.3). The 뽑기 makes the document v 4 (gacha.md 7). |
| Rules | `eqsValue` (30 characters) for v ≥ 3, upward version steps only, an `eq`-only write may carry `v` (the upgrade), `slotOk` / `sumOk` take v 3 like v 2. Paste-ready text in 6.6. |
| Store swaps (pass L0) | Before any of this, and before the first deploy: a page that turned read-only never writes the cloud's keys; a forced sign-out **parks** an unsaved account copy instead of dropping it; the soft cap's day count survives a store swap; the rules file is checked against `CL_V` (§6.7). |
| UI cost | 마이페이지: the row of six busts (36 px) is paid for by moving **내 기록 into the footer** next to 닫기; measured on `shop-hub-full-320.png`, the 320×568 'full' state ends **2.4 px higher** than today. Every preview: a name pill straddling its top border (0 px) and two-way carousel arrows always shown. The tab row keeps one line at 320 px with a 4-digit balance and three tabs (§4.0). |
| Twin colours, rings, tags | Unchanged. Two players on the same animal each wear their own set; the twin recolour is applied to the body before the items, as today. |
| Coins / ownership | Unchanged: owned once, wearable on every animal; coins only from play. |

### 0.1 The contract with gacha.md (one place; gacha.md's preamble says the same)

| Topic | Agreed |
|---|---|
| Store versions | `TRO_V 3` = this doc (30-character `eq`, `lh`). `TRO_V 4` = the 뽑기 (`dn pt gd dl ds nw gs`, gacha.md 5.1). `troParse` of each version reads every older one losslessly; a store newer than the page is `'newer'` (read-only). |
| Cloud versions | `CL_V 3` = this doc (30-character `eq`, slots `slotShape2`). `CL_V 4` = the 뽑기 (slots `slotShape3` with `dn`, `gd`; `eq` still 30 characters). |
| Release gate | `tools/check-shop.js` table: store v 2 needs cloud v ≥ 2, v 3 needs ≥ 3, v 4 needs ≥ 4. Each data pass (L1, G2) bumps the store **and** the cloud together, so the gate holds after every pass and no deploy can ever carry a store the cloud cannot hold. |
| Catalog policy | A new **ownable** catalog id is a new store and cloud version (an older page of the same version would drop the id it does not know and write the store back: compat review #4). check-shop pins the ownable count per `TRO_V` (`OWNABLE = {2: 40, 3: 40, 4: 50}`). |
| API names | `hubAni()` the hub's animal; `myLooks()` all six sets; `myLook(c)` animal `c`'s set; `lookSet(slot, id, c)` wear / take off on `c`; `shopBuy(id, c)`; `aniSubj(c)` the name as a subject ("냥냥이가"); `seatChar()` the animal my room seat plays (the host's word). |
| The hub | One layout for three tabs (§4.0): the preview wrapper with the name pill, two-way arrows, the footer pattern `[message][the tab's own ghost button][닫기]` (마이페이지: 내 기록, 뽑기: 확률 보기, 상점: none). |
| Wearing drawn items | A draw never puts anything on. "지금 쓰기" in the 뽑기 result dresses `hubAni()` through `lookSet`. Draw-only items are ordinary catalog ids `[hfnbe][1-9a-z]`, so a worn set keeps one digit per slot. At most **2 draw-only 머리 items** (4.4). |

---

## 1. Every use of the worn set today, and its change

Traced through `src/game.js`, `src/page.html`, the rules and the tests on 2026-10-19.

| # | Where (function) | Today | Change |
|---|---|---|---|
| 1 | store field: `troFresh`, `troParse` | `eq: LOOK0`; `eq: lookOwned(lookParse(o.eq), own)` (5 chars) | `eq: LOOKS0`; `eq: looksOwned(looksParse(o.eq), own)` (30 chars; v 2's 5 copied); `lh` — 2.2 |
| 2 | `myLook()` (store helpers) | `lookOwned(lookParse(S.eq), S.own)` | `myLook(c)` = animal `c`'s chunk of `myLooks()` (default `G.sel`) — 2.1 |
| 3 | `lookPut(lk, slot, id)` | one digit of a 5-char set | unchanged (used on one chunk); new `looksPut(ls, c, lk)` |
| 4 | `shopBuy(id)` | `S.eq = lookPut(S.eq, ...)` (bought = worn) | `shopBuy(id, c)`: worn by animal `c` only (the hub's animal) |
| 5 | `lookSet(slot, id)` | one global set | `lookSet(slot, id, c)` |
| 6 | `lookOut()` (after every store change: `troSync`, `lookSet`, `shopBuy`) | `G.p.look = myLook()`; `pickArt`; `lookSend` | `G.p.look = myLook(G.p.char)`; `pickArt` per animal; `lookSend` |
| 7 | `lookSend()` / `CO.eqSent` | `myLook()` vs what the host was told | `myLook(G.sel)` (the pick: in the room phase the host takes every pick) — 5.1 |
| 8 | `'hi'` (`netAttach`) | `lk: myLook()` | `lk: myLook(G.sel)` (the `hi`'s own `c`; same shape) |
| 9 | `'pk'` (`netPick` → `netMsgIn`) | `{t:'pk', c}`; host sets `r.char` | `{t:'pk', c, lk}`; host sets `r.char` and `r.lk` (`'lk' in m`); the guest then calls `lookSend()` — 5.1 |
| 10 | `'eq'` (`netMsgIn`) | room phase, `r.lk = lookParse(m.lk)` | unchanged |
| 11 | R seat index 5 (`roomInfo`) | mine: `myLook()` | mine: `myLook(r.char)`; others `r.lk` (unchanged) |
| 12 | `guestRoom` | `e[5]` → `lookParse`; game phase keeps the room's | unchanged |
| 13 | `netStart` | mine `myLook()`, guests `r.lk` | mine `myLook(r.char)` |
| 14 | `guestBegin` | every seat `r.lk` (the host's R) | unchanged |
| 15 | solo `newGame` → `resetGame('solo', ...)` | slot 0 gets `myLook()` | `myLook(e.char)` (the animal in the list) |
| 16 | `idleWorld`, `toTitle` (attract demo) | `look: myLook()` | `look: myLook(G.sel)` |
| 17 | `pickChar` | `G.p.look = myLook()` | `G.p.look = myLook(c)` |
| 18 | `rematch`, co-op `retry`, `continueLoop` | carry `p.look` | unchanged (the match's looks) |
| 19 | `buildPicker` / `pickArt` (title busts) | all six busts in one set; cache `box._lk = myLook()` | each bust `c` in `myLook(c)`; cache key `myLooks()` |
| 20 | room picker (`netSetupDOM`) | the same | the same as 19 |
| 21 | `renderRoom` `lkOf(r)` | mine `myLook()` | mine `myLook(r.char)` (the card's animal) |
| 22 | `guestToRoom` | `lookSend()` | if `G.sel !== seatChar()` (my pick raced 시작): resend `{t:'pk', c: G.sel, lk: myLook(G.sel)}`; then `lookSend()` — 5.1 |
| 23 | `portraitCanvas(c, name, size, lk, tw)`, `lookPortrait` | per bust | unchanged |
| 24 | `HUB.view` + the preview tap (`hubSetupDOM`'s `cyc`) | the animal shown, reset every opening; one tap = next | **`HUB.ani`**: the animal dressed by every hub action, all tabs; a tap on the left half = previous, right half = next; ←/→ on the focused preview — 4.2 |
| 25 | `hubLook` | `myLook()` + the 상점's try-on | `myLook(hubAni())` + try-on |
| 26 | `hubTick` / `hubDraw` | `c = HUB.view || G.sel`; arrows until the first tap | `c = hubAni()`; arrows always |
| 27 | `shopBtnState` | worn = `shopWorn(myLook(), id)` | `shopWorn(myLook(hubAni()), id)` |
| 28 | `hubAct` | `shopBuy(id)`, `lookSet(slot, ...)`; messages "샀어요! 바로 썼어요", "썼어요" | `(…, hubAni())`; messages name the animal — 8 |
| 29 | `hubCell('my', id)` | `lookSet(HUB.mySlot, id)`, no message | `lookSet(…, hubAni())` + a message |
| 30 | `hubGrid` | `lk = myLook()` (worn ring) | `lk = myLook(hubAni())` |
| 31 | `hubFillMy` | equipment boxes from `myLook()` | from `myLook(hubAni())`; the six-bust row — 4.1 |
| 32 | `openHub` (`HUB.mySlot` on 목), `myNote` (starter note) | `myLook()[2] !== STARTER[1]` | "no animal wears n1": `!looksWear(myLooks(), STARTER)`; `myNote` gains the `lh` line — 2.4 |
| 33 | drawing (`drawEnt` `o.look`, `drawPlayer`, `drawAfterimages`, `lookFx`, `headTop`, the podium crown, `troPodCups`, tags) | `p.look` per player | unchanged |
| 34 | coin card, podium coin line (`coinPodLine`), coins | no look | unchanged |
| 35 | `netDebugApi` `mp.state().roster[].lk` | host's own `myLook()` | `myLook(r.char)` |
| 36 | `shopDebugApi` | `eq: S.eq`, `look: myLook()`, `wear(slot, id)`, `buy(id)` | 10 |
| 37 | cloud link record `cs.ev` (`clParseCs`) | `lookParse(x.ev)` | `looksParse(x.ev)` (5 → copied) |
| 38 | `clDoc` | `eq` 5 chars, v 1-2 | v 1-3; v 3 `eq` 30 chars, v 2 `eq` 5 chars copied — 6.2 |
| 39 | `clAdopt` | the account's set or mine (whole); the base moves on a pending snapshot | per-character merge; the base never moves on a pending snapshot — 6.3 |
| 40 | `clEqOut` | 5 chars, items known to the account's `o` lists | 30 chars, the same check on every character (G2 adds every slot's `gd`) |
| 41 | `clCreateTx` | `v: 2`, `eq` 5 chars | `v: 3`, `eq` 30 chars |
| 42 | `clPush` | `v` only with a slot write | also with an `eq` write; an upgrade always carries a 30-char `eq` — 6.4 |
| 43 | `CL_V` | 2 | 3 |
| 44 | `firebase/firestore.rules` | `eqValue` (5), v 1→2 | 6.6 |
| 45 | `tools/check-shop.js` release gate | `TRO_V ≥ 2` needs `CL_V ≥ 2` | the gate table of 0.1; the rules ↔ `CL_V` checks (6.7); the `OWNABLE` pin |
| 46 | tests | `S().eq === '50000'`, messages, `v === 2`, … | 11 |

---

## 2. The store (`ppogeul-trophy`, `TRO_V = 3`)

### 2.1 The shape and its helpers

`S.eq`: 30 characters `[0-9a-z]`, five per animal in `CHAR_IDS` order:

```
index   0-4    5-9    10-14   15-19     20-24  25-29
animal  duck   capy   otter   penguin   cat    frog
        h f n b e (each chunk exactly today's worn set; '0' = nothing in that slot)
```

Placed right after `lookParse` / `lookOwned` / `lookPut` in the store section (they read `CHAR_IDS` and `LOOK0`, both
defined above; the two parsers are function declarations so `troParse` can use them at boot):

```js
  // ---- worn sets per animal (design/looks-per-animal.md): the store, the link record and the cloud document keep ONE
  // string of 30 characters - 5 per animal (h f n b e, as lookParse) in CHAR_IDS order (duck capy otter penguin cat
  // frog). Everything that draws, sends or compares ONE animal's set still uses the 5-character set (lookOf)
  const LOOKS_N = CHAR_IDS.length, LOOKS_LEN = 5 * LOOKS_N, LOOKS0 = LOOK0.repeat(LOOKS_N);
  // every animal's set from anywhere (storage, the link record, the cloud): each 5-character chunk through lookParse.
  // A 5-character set (a v 2 store, link record or document: one set for every animal) is copied to all six - nobody
  // loses the look they saw; anything else is bare
  function looksParse(s) {
    if (typeof s !== 'string') return LOOKS0;
    if (s.length === 5) return lookParse(s).repeat(LOOKS_N);
    if (s.length !== LOOKS_LEN) return LOOKS0;
    let o = ''; for (let a = 0; a < LOOKS_N; a++) o += lookParse(s.slice(5 * a, 5 * a + 5));
    return o;
  }
  // ... and only what this store owns (the starter is always owned)
  function looksOwned(ls, own) { let o = ''; for (let a = 0; a < LOOKS_N; a++) o += lookOwned(ls.slice(5 * a, 5 * a + 5), own); return o; }
  // animal c's set in ls (LOOK0 for anything else) / ls with animal c's set replaced by lk
  const lookOf = (ls, c) => { const a = CHAR_IDS.indexOf(c); return a < 0 || typeof ls !== 'string' || ls.length !== LOOKS_LEN ? LOOK0 : ls.slice(5 * a, 5 * a + 5); };
  const looksPut = (ls, c, lk) => { const a = CHAR_IDS.indexOf(c); return a < 0 ? ls : ls.slice(0, 5 * a) + lk + ls.slice(5 * a + 5); };
  // does any animal wear item id (the starter note: the gift has been found)
  const looksWear = (ls, id) => { const i = LOOK_SLOTS.indexOf(id[0]); for (let a = 0; a < LOOKS_N; a++) if (ls[5 * a + i] === id[1]) return true; return false; };
  // a 3-way merge character by character (one slot of one animal each): what changed here since base stays, the rest
  // follows remote. No base or no remote: local (the cloud's worn set, 6.3)
  function looksMerge(local, base, remote) {
    if (!base || !remote) return local;
    let o = ''; for (let i = 0; i < LOOKS_LEN; i++) o += local[i] !== base[i] ? local[i] : remote[i];
    return o;
  }
  // my sets (only what this store owns), and the set of animal c (default: my pick)
  const myLooks = () => (TRO.s ? looksOwned(looksParse(TRO.s.eq), TRO.s.own || []) : LOOKS0);
  const myLook = (c) => lookOf(myLooks(), isChar(c) ? c : G.sel);
```

- `myLook()` with no argument keeps today's meaning for the picked animal, so a call site that is missed still works
  for the animal being played. Every call site in §1 nevertheless passes its animal explicitly (the rule for review).
- Cost: `myLooks()` builds 30 characters. It is called per hub frame (`hubLook`), per room broadcast and per store change,
  never per game frame (players keep their frozen `p.look`).

### 2.2 `troFresh` / `troParse`

```js
  function troFresh() { return { v: TRO_V, ..., eq: LOOKS0, lh: 0, ... }; }          // (only eq and lh change)
  // troParse (v 3): v 1 (no eq: bare), v 2 (eq 5 characters: copied to all six) and v 3 are read; v > 3 is 'newer'
  //   if (typeof o.v === 'number' && o.v > TRO_V) return 'newer';
  //   if ((o.v !== 1 && o.v !== 2 && o.v !== TRO_V) || ...dev check...) return null;
  //   ... eq: looksOwned(looksParse(o.eq), own),
  //   lh: o.v === 2 ? (lookOwned(lookParse(o.eq), own) !== LOOK0 ? 1 : 0) : (o.lh ? 1 : 0),   // (2.4)
```

- `const TRO_KEY = 'ppogeul-trophy', TRO_V = 3` with the comment "(TRO_V 3: the worn set per animal,
  design/looks-per-animal.md; 4: the 뽑기, gacha.md)".
- **The migration is lossless and needs no other code.** `troLoad` writes the parsed store back **at boot** (it calls
  `troWrite` right after the first `troRead`), so the first page of v 3 opened in a browser migrates that browser's store
  at once, as v 3 with `eq = old × 6`. The parked copies (`ppogeul-park`), the guest key and `PG.debug.tro.set` /
  `shop.set` go through `troParse` and migrate the same way when they are read.
- **An older page with this store** (a cached PWA, an artifact tab opened before the update): v 3 is `'newer'`, so it
  turns read-only at its next read (`troRead` keeps its in-memory copy, `troWrite` writes nothing). Opening one new page
  therefore flips every old tab of that browser at its next store read; the fix is a reload. Without the version bump, an
  older page would rewrite `eq` as 5 characters (its `lookParse` turns 30 characters into `'00000'`) and every animal
  would lose its set. **The read-only valve is only write-free once pass L0 lands** (6.7: today the cloud's sign-out
  and link paths still write the guest key from a read-only tab).
- `TRO.mem` (blocked storage) and `TRO.ro` behave as today.

### 2.3 Buying and wearing (`shopBuy`, `lookSet`, `lookOut`)

```js
  function shopBuy(id, c) {                       // bought = worn by animal c (the hub's animal; default my pick)
    const a = isChar(c) ? c : G.sel;
    ...
      S.sp = Math.min(1e9, S.sp + it.price); S.own = S.own.concat([id]);
      S.eq = looksPut(S.eq, a, lookPut(lookOf(S.eq, a), it.slot, id)); S.lh = 0;
    ...
  }
  // wear (id) / take off (null) in one slot of animal c (default my pick): only an owned item (or the starter)
  function lookSet(slot, id, c) {
    const a = isChar(c) ? c : G.sel;
    if (TRO.ro || !TRO.s || LOOK_SLOTS.indexOf(slot) < 0 || (id && (!isItemId(id) || ITEM[id].slot !== slot))) return false;
    const ok = troMut((S) => { if (id && id !== STARTER && !S.own.includes(id)) return false; S.eq = looksPut(S.eq, a, lookPut(lookOf(S.eq, a), slot, id)); S.lh = 0; return true; });
    if (ok) lookOut();
    return ok;
  }
  function lookOut() {
    if (G.mode === 'title' && G.p) { const lk = myLook(G.p.char); if (G.p.look !== lk) G.p.look = lk; }   // (the demo: the pick)
    pickArt(dom.pick); pickArt(dom.roomPick);
    lookSend();
  }
```

`S.eq` inside `troMut` is always a parsed 30-character string (`troRead` → `troParse`), so no extra check is needed.
The callers read `TRO.s.lh` **before** the call to decide the message (8).

### 2.4 Telling existing players (`lh`)

Every migrated player (the user's three friends) already owns items, so the first-purchase line (8) never reaches them,
and their next 쓰기 would silently dress one animal while the other five keep the copied set (review UX #11).

- `troParse` sets `lh = 1` when it migrates a **v 2 store whose worn set is not bare**; a fresh store, a v 1 store and a
  bare v 2 store get 0; a v 3 store keeps its own `lh`. Not synced (per browser, like the 상점 dot `sh`).
- **마이페이지:** while `lh` is 1, `myNote` shows **"이제 동물마다 따로 꾸며요!"** as its first line (after the storage
  line; before the starter note). Short on purpose: the note column is ≈ 148 px at 320 px.
- **상점:** the first 쓰기 / 사기 while `lh` is 1 appends **" · 이제 동물마다 따로 꾸며요"** to its message (the 상점's footer
  message has ≈ 169 px: two lines). It replaces the first-purchase line when both would apply.
- Every dressing action (`shopBuy`, `lookSet`: 쓰기, 벗기, a 마이페이지 cell, 뽑기's 지금 쓰기) clears `lh` in its own
  `troMut`. Choosing an animal in the row of six does not (it dresses nothing).

---

## 3. Which animal an action applies to

| Place | The animal | Its set |
|---|---|---|
| 상점: the preview, its try-on, 쓰기 / 벗기, 사기 (bought = worn) | `hubAni()` | `myLook(hubAni())` |
| 마이페이지: the preview, the equipment boxes, the grid's worn ring, a tap on a cell | `hubAni()` | the same |
| 뽑기 (gacha.md 6): the preview whenever it shows an animal, 지금 쓰기 / its take-off | `hubAni()` | the same |
| `hubAni()` | `HUB.ani` when it is an animal, else `G.sel`. **`openHub` sets `HUB.ani = G.sel`** on every opening (not on the way back from 내 기록); the 마이페이지 row of six and a tap on any preview change it. All tabs share it. | – |
| Title picker, six busts | each bust `c` | `myLook(c)` (머리 / 얼굴 / 목 on the portrait, as today) |
| Room picker, six busts | each bust `c` | `myLook(c)` |
| Room player cards | the seat's animal `r.char` | mine `myLook(r.char)`; others `lookParse(r.lk)` |
| Title attract demo | `G.sel` (`idleWorld`, `toTitle`, `pickChar`) | `myLook(G.sel)` |
| Solo | the list's animal (`G.sel`, or a debug list's) | `myLook(e.char)` |
| Online co-op / battle | each seat's `r.char` at 시작 | host `myLook(r.char)`, guests `r.lk` |
| What a guest sends (`hi`, `pk`, `eq`) | `G.sel`; a pick that raced 시작 is re-sent in `guestToRoom` (5.1) | `myLook(G.sel)` |
| 한 판 더 / 다시 하기 / 2회차 | the same players | `p.look` carried over (unchanged) |

- **The hub never changes the pick.** Dressing is not choosing who to play; changing `G.sel` from the hub would also
  send `'pk'` from a room and move the guest's seat. The title picker (where every bust now shows its own outfit) is
  where the pick is made.
- **Frozen at match start**, as today: a set changed in another tab mid-match waits for the next match.

---

## 4. UI

### 4.0 The hub after both docs (one layout; gacha.md 6.1-6.2 add the 뽑기 tab to it)

| Part | 상점 | 뽑기 (gacha.md, pass G3) | 마이페이지 |
|---|---|---|---|
| Top row | tablist `[상점 · 뽑기 · 마이페이지]` (two tabs until G3) + the coin chip | same | same |
| Top block | `.pg-look-wrap` (the 99 px preview + its name pill) + info: name / rarity, desc, action button | `.pg-look-wrap` (the machine, or an animal with its pill) + info: name / rarity, line, sub | `.pg-look-wrap` + info: 이름, trophies / league, note |
| Middle | 부위 tabs + item grid | the two draw buttons; the caption "뽑기 전용 아이템 n/10"; the odds panel when open; the collection / result grid | **the row of six** (radio group) + equipment boxes + owned grid |
| Footer | message (≈ 169 px at 320) + 닫기 | message (≈ 82 px) + **확률 보기** + 닫기 | message (≈ 82 px) + **내 기록** + 닫기 |
| Live region | `#pg-hub-msg` | `#pg-hub-msg` for short lines; `#pg-gacha-sr` (visually hidden) for the reveal | `#pg-hub-msg` |

- **The footer pattern:** `[#pg-hub-msg][the tab's own ghost button][닫기]`. `hubShow` shows only the current tab's
  button (`#pg-my-rec` on 마이페이지, `#pg-gacha-odds-btn` on 뽑기). With a button there the message has ≈ 82 px at 320
  (≈ 6 syllables a line at 0.88em): **a footer message on 마이페이지 / 뽑기 is at most ≈ 12 syllables** (two lines in the
  44 px row). Longer texts go to that tab's info column (마이페이지's note, 뽑기's `#pg-gacha-line`) or the sr-only region;
  the storage-blocked text is only ever the note's on 마이페이지.
- **The tab row at ≤ 380 px** (measured on `shop-hub-armed-320.png` / `shop-hub-full-320.png`: 상점 tab 52 px, 마이페이지
  89 px, chip "1,234" / "2,345" 73 px, a 255-256 px row; the panel's font is 14.5 px under 480 px; tab borders 1.5 px):
  three tabs at today's 0.8em padding plus the chip need ≈ 259 px and the chip would wrap. Under
  `@media (max-width: 380px)`: `.pg-tabs { gap: 0.2em } .pg-tabs [role="tab"] { padding-left: 0.45em; padding-right: 0.45em }
  .pg-hub-top { column-gap: 0.35em }` → tabs 41.9 + 41.9 + 78.9 + 5.8 = 168.4, + 5.1 + chip 73 = **246.5 px, ≈ 9 px to
  spare** with a 4-digit balance. From 381 px the tabs keep `padding: 0.4em 1em` (not 0.8em). A 5-digit balance (≈ 84 px
  chip) may still wrap the chip under the tabs (as the 1x window does today; accepted).
- **`hubTopFit()`** (built like `shopBtnFit`, run from `hubFill` when the chip's text changes, `fit()` and the fonts'
  `loadingdone`): if `chip.offsetTop > tabs.offsetTop + 2`, add `.is-snug` to `.pg-hub-top` (tab side padding 0.35em, the
  chip's coin icon hidden); if it still wraps, leave it wrapped.
- `.pg-tabs [role="tab"] { position: relative; }` so a tab's dot (`.pg-tro-new`, absolute) sits on its own tab, not on the
  panel's corner (the 뽑기 tab dot and the 마이페이지 NEW dot of gacha.md 6.9).
- The sr h2 and the tablist label read "상점, 뽑기, 마이페이지" from G3 (today "상점과 마이페이지").

### 4.1 마이페이지: the row of six (`#pg-my-anis`) and 내 기록 in the footer

```html
<div id="pg-hub-my" class="pg-hub-pane" role="tabpanel" aria-labelledby="pg-tab-my" hidden>
  <div class="pg-my-top">
    <div class="pg-look-wrap">
      <button id="pg-my-view" class="pg-look-view" type="button" aria-label="꽥꽥이 · 눌러서 다른 동물로"><canvas width="32" height="32"></canvas></button>
      <span class="pg-look-name" aria-hidden="true">꽥꽥이</span>
    </div>
    <div class="pg-my-info"><!-- 이름, trophies / league, note: unchanged --></div>
  </div>
  <div id="pg-my-anis" class="pg-anis" role="radiogroup" aria-label="꾸밀 동물"></div>      <!-- NEW: six busts, hubSetupDOM -->
  <div id="pg-my-slots" class="pg-eqslots" role="tablist" aria-label="꽥꽥이 꾸미기"></div>
  <div id="pg-my-grid" class="pg-items" role="listbox" aria-label="내 아이템"></div>
  <p id="pg-my-empty" class="pg-my-empty" hidden>…unchanged…</p>
</div>
<div class="pg-hub-foot">
  <p id="pg-hub-msg" class="pg-hub-msg" role="status" aria-live="polite"></p>
  <button id="pg-my-rec" class="pg-btn pg-ghost pg-small" type="button" hidden>내 기록</button>   <!-- MOVED: shown on 마이페이지 only -->
  <button id="pg-hub-close" class="pg-btn pg-ghost" type="button">닫기</button>
</div>
```

- The `.pg-my-side` wrapper goes; the preview wrapper is a direct child of `.pg-my-top`.
- **The row of six** = `role="radiogroup"` (the title picker uses `role="radio"` for the same six animals, and a tab that
  controls another tablist would stack three tablists on one panel): one `button role="radio"` per animal in `CHAR_IDS`
  order, `data-char`, `aria-checked`, roving tabindex. `hubArrow` gains a radio branch (←/→ check and focus the
  neighbour, wrapping; ↑/↓ do nothing). Each holds a 32×32 canvas: `lookPortrait(c, myLook(c), 0)` (the same busts as
  the pickers: 머리 / 얼굴 / 목 show). The checked one is `hubAni()`, styled like the picker's `.on` (duck border and
  tint). No names under the busts (the height budget, 4.4); the checked animal's name is the preview's pill.
- **등 / 효과 marker:** `lookPortrait` draws only 머리 / 얼굴 / 목, so an animal dressed only in 등 or 효과 would look bare
  in the row. A bust whose 등 or 효과 digit is set gets a 6 px duck-coloured dot in its top-right corner
  (`.pg-ani-more`, `aria-hidden`); its aria-label names those items anyway.
- A radio's click: `HUB.ani = c; HUB.drawn = ''; hubFill()` (sfx none: it is navigation). Busts are repainted when their
  chunk changes (`b._lk`), like `pickArt`.
- Radio aria-label: `"{이름} · {worn item names in slot order, joined ', '}"`, or `"{이름} · 아직 안 꾸몄어요"`.
- `#pg-my-slots`' aria-label follows the animal: `"{이름} 꾸미기"`.
- **Touch target:** each bust is 36 px tall with a `::after` reaching 4 px into the gaps above and below (44 px tall) and
  ≈ 39 px wide at 320 (six columns in a 255 px row with five 0.3em gaps) — above the 24 px minimum, not 44 × 44.
- **내 기록 moves to the footer**, left of 닫기, shown only while 마이페이지 shows (`hubShow` sets
  `dom.myRec.hidden = HUB.tab !== 'my'`). Its id, click (`openRec('hub')`) and the focus on return are unchanged, so
  `trophies.js` and `shop.js` keep clicking `#pg-my-rec`. The cloud pitch in the note still says sign-in is one tap away.
- Keys and focus as today: focus on open (mouse / keyboard) stays on the selected equipment box.

### 4.2 Every preview: the name pill and the two-way arrows

- **The wrapper.** `.pg-look-view` keeps `overflow: hidden` (the rounded canvas), so the pill lives outside it: each
  preview (`#pg-shop-view`, `#pg-my-view`, `#pg-gacha-view`) sits in a `.pg-look-wrap` (`position: relative`, `flex: none`,
  `align-self: flex-start`) with a sibling `<span class="pg-look-name" aria-hidden="true">` that **straddles the preview's
  top border** (10 px / 13 px text, `top: -6px`). It never covers art: the hop of e2 / e3 in `hubTick` (`vy -2.2`,
  ≈ 7 px) lifts a 4 px hat to canvas row 3 (9 px at 3x), which a pill inside the canvas (4-21 px) would cover. The pill
  takes 6 px of the 0.6em (8.7 px) gap under the tab row: no layout height.
- The pill shows `CHARS[hubAni()].name`; on the 뽑기 tab only while an animal is shown (gacha.md 6.3).
- **Arrows always, both ways.** The two carousel arrows drawn in the canvas stay (today they hide after the first tap:
  `HUB.cyc` goes). The preview's click handler reads `e.offsetX < el.clientWidth / 2` → the **previous** animal, else the
  **next** (`hubCycle(-1 | 1)`); ←/→ on the focused preview do the same (a `hubArrow` branch for `.pg-look-view`). In the
  상점 (and the 뽑기 result) the preview is the only animal switch; in 마이페이지 it mirrors the row.
- A cycle: `HUB.ani = CHAR_IDS[(i + d + 6) % 6]; HUB.drawn = ''; hubFill()` (the 상점's button state and 마이페이지's boxes
  depend on the animal, so they refill).
- aria-labels: 상점 `"미리 보기: {이름} · 눌러서 다른 동물로"`; 마이페이지 `"{이름} · 눌러서 다른 동물로"`.

```css
.pg-look-wrap { position: relative; flex: none; align-self: flex-start; }
.pg-look-name { position: absolute; left: 50%; top: -6px; transform: translateX(-50%); z-index: 1; padding: 0 0.55em; border-radius: 999px; pointer-events: none;
  font: 700 10px/13px var(--font-body); white-space: nowrap; color: var(--cream); background: #0b2427; box-shadow: inset 0 0 0 1.5px var(--panel-line); }
.pg-anis { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 0.3em; margin: 0.4em 0 0; }
.pg-anis [role="radio"] { position: relative; font: inherit; min-width: 0; height: 36px; padding: 0; display: grid; place-items: center; cursor: pointer;
  border-radius: 0.7em; background: rgba(6, 22, 25, 0.6); border: 1.5px solid var(--panel-line); }
.pg-anis [role="radio"]:hover { background: rgba(127, 220, 200, 0.14); }
.pg-anis [aria-checked="true"] { background: rgba(255, 212, 71, 0.16); border-color: var(--duck); box-shadow: 0 0 0 2px rgba(255, 212, 71, 0.3); }
.pg-anis [role="radio"]:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
.pg-anis canvas { width: 32px; height: 32px; image-rendering: pixelated; image-rendering: crisp-edges; image-rendering: pixelated; }
.pg-ani-more { position: absolute; top: 2px; right: 2px; width: 6px; height: 6px; border-radius: 50%; background: var(--duck); box-shadow: 0 0 0 1px var(--ink); pointer-events: none; }
/* touch: a 44 px tall target that reaches into the gaps above and below (never into a neighbour) */
.pg-touch-on .pg-anis [role="radio"]::after { content: ""; position: absolute; inset: -4px 0; }
#pg-hub-my .pg-eqslots { margin-top: 0.4em; }
```

Remove `.pg-my-side`. `.pg-my-top` keeps `align-items: stretch`.

### 4.3 The 상점

- No row of six: the 상점 is about the item, its preview carries the name pill, and the action button must stay beside
  the preview at 844×390. The animal is switched by tapping the preview's halves (arrows always shown) or in 마이페이지.
- The preview: `hubAni()` in `myLook(hubAni())`, with an unowned selected item tried on (unchanged rule).
- 쓰기 / 벗기 (`shopBtnState` / `hubAct`): `lookSet(slot, id | null, hubAni())`. The button keeps its short verb (the
  pill beside it says whose it is); its aria-label is `"{이름}: 쓰기"`.
- 사기: `shopBuy(id, hubAni())`: the animal in the preview wears it at once.
- The grid's worn ring (`is-worn`) is "worn by the preview's animal"; the owned check is account-wide (unchanged).

### 4.4 Fit (measured on `C:/Temp/bogeul/shop-hub-full-320.png`, the tightest state)

The 320×568 'full' 마이페이지 (13 머리 cells = 3 grid rows) has **no slack today**: the card runs from y 64 to 553
and the panel's 14 px bottom padding ends at 567-568. Its rows: tabs 74-117; top block from 127 — the left column
(preview 127-224 = 99 px with its borders, 내 기록 230-273) is **146 px**, the info column (name field 127-170, trophies
178-191, the note's two lines 202-230) is **≈ 106 px**; equipment boxes 283-337; grid 346-487; footer 499-542.

| Size | Today | After | |
|---|---|---|---|
| 320×568 touch, 'full' | top block 146 (left column) + gap 10 → boxes at 283 | top block 106 (info column) + 5.8 + row 36 + 5.8 → boxes at **280.6** | 2.4 px less; still no scroll (needs the tab-row CSS of 4.0 once the third tab exists) |
| 2x 512×448 mouse (`hubFitAt` 'all') | preview 99 + 6 + 내 기록 40 = 145, + gap 9 | the note is one line at 2x, so the top block is the preview's 99; + 5.8 + 36 + 5.8 | ≈ 7 px less |
| desktop, 360×740, 390×844 | lots of room | lots of room | – |
| 844×390 landscape | scrolls by design (`ns=none`) | scrolls | the action button stays beside the preview |
| 1x 256×224 | scrolls by design | scrolls; the row fits (card inner 226 px ≥ 6 × 32 + 5 gaps) | no sideways overflow |

- **The footer at 320**: 닫기 ≈ 78 px and 내 기록 ≈ 78 px (touch: `.pg-ghost { min-width: 5.5em }`) + two 8.7 px gaps leave
  the message **≈ 82 px**, two lines of ≈ 6 syllables in the 44 px row. Every 마이페이지 message (8) is ≤ 9 syllables.
  The storage-blocked text (17 syllables, 3 lines) never goes in this footer (4.0).
- **If `shop-fit-320` 'full' still scrolls by a pixel or two** (font metrics): in this order — (1) the row's buttons
  34 px (canvas 32, borders 1 px); (2) `#pg-hub-my .pg-eqslots` bottom margin 0.5em → 0.35em; (3) the note at 0.8em.
  Never drop the row of six or the name field.
- **Accepted:** the deploy, signed out (the note gets the cloud pitch, ≈ 2 more lines), at 320×568 with ≥ 11 items in
  one slot scrolls by ≈ 28 px. The panel scrolls by design; no test stages that combination (`pwa-check` uses one hat).
- **For the 뽑기 doc:** at 320 a grid row holds 5 cells, so a slot can hold at most 14 items (+ 없음) in 3 rows. 머리
  has 12 today: at most **2 draw-only 머리 items** (gacha.md has exactly 2: hd, he).

---

## 5. Network

### 5.1 What a seat's look is on the wire

**Unchanged: 5 characters, the set of the animal that seat plays now.** Nobody needs another player's other five
sets: cards, pickers and the match only ever draw a seat's current animal.

**A pick that races 시작.** The host decides the seat's animal (`r.char`); a guest's `G.sel` can differ from it: the host
ignores `'pk'` outside the room (`netMsgIn`), and its screen turns `'game'` inside `netStart`, so a pick that races 시작
changes `G.sel` while the host keeps the old animal. The match itself is right (the host froze the old animal with the
old animal's `r.lk`, sent before the pick). But back in the room the guest's `lookSend` would send `myLook(G.sel)`, the
new animal's set, for a seat the host still has as the old animal: the next match would freeze the old animal in the
new animal's outfit on every page, while the guest's own card (`myLook(r.char)`) showed something else (compat review
#6). **The fix: `guestToRoom` re-sends the pick with its set** when `G.sel` differs from `seatChar()`, before its
`lookSend`. The host is in the room phase again, takes it, and seat, animal and set agree; the guest keeps the animal it
chose last.

```js
  // the animal my room seat plays (the host's word: my roster entry), else my pick
  function seatChar() {
    if (NET.sess && NET.roster.length) {
      const me = NET.role === 'host' ? NET.roster.find((r) => r.id === NET.selfId) : NET.roster.find((r) => r.slot === NET.slots.get(NET.selfId));
      if (me && isChar(me.char)) return me.char;
    }
    return G.sel;
  }
```

| Message | Content | Host validation | Bytes |
|---|---|---|---|
| `hi` (guest → host) | `{t:'hi', n, c, cu, d, lk}`, `lk = myLook(G.sel)` (the set of its `c`); `CO.eqSent = lk` | `r.lk = lookParse(m.lk)` (unchanged) | unchanged (104) |
| `pk` (guest → host, room phase) | **`{t:'pk', c, lk}`**, `lk = myLook(c)` | `if (isChar(m.c) && NET.screen === 'room') { r.char = m.c; if ('lk' in m) r.lk = lookParse(m.lk); }` (a junk `lk` — a number, 6 characters, upper case — becomes bare; absent: unchanged, for older guests) | 25 → 38 (+13) |
| `eq` (guest → host, room phase) | `{t:'eq', lk}`, `lk = myLook(G.sel)`, 300 ms after the last change, only when ≠ `CO.eqSent` | unchanged | 24 |
| R seat, room phase | `[slot, nick, char, ready, cup, lk?]`; mine `myLook(r.char)` | unchanged | unchanged |
| R seat, game phase; snapshot rows | unchanged | unchanged | **0** |

```js
  // netPick (guest branch): the new animal's set rides with the pick - a host with per-animal sets takes both at once;
  // an older host ignores lk, so the 'eq' that lookSend still sends 300 ms later brings it up to date
  else { NET.sess.send(NET.hostId, { t: 'pk', c, lk: myLook(c) }); lookSend(); }
  // guestToRoom: back from a match - a pick that raced 시작 was never taken by the host; say it again, with its set
  if (NET.sess && NET.role === 'guest' && isChar(G.sel) && G.sel !== seatChar()) NET.sess.send(NET.hostId, { t: 'pk', c: G.sel, lk: myLook(G.sel) });
  lookSend();
```

- `lookSend` and its timer compare and send `myLook(G.sel)`; `CO.eqSent` holds what was sent. (Not `seatChar()`: right
  after a pick the host's next R has not arrived yet, so `seatChar()` would still name the old animal, and the `'eq'`
  fallback for an older host — which ignores `pk.lk` — would find nothing to send.)
- **`CO.eqSent` is not set by `'pk'`.** That keeps the `'eq'` fallback for an older host. On a current host that `'eq'`
  repeats what `'pk'` said (24 bytes per pick in the room) and the host's state does not change. If the guest picks back
  within 300 ms, the timer finds `myLook(G.sel) === CO.eqSent` and sends nothing.
- A guest dressing an animal it is **not** playing changes nothing on the wire (`myLook(G.sel)` is unchanged).
- The host's own pick (`netPick` host branch) already marks the room dirty, and `roomInfo` reads `myLook(r.char)`.
- **Ordering.** `'pk'` and the later `'eq'` go on the same reliable, ordered channel (PeerJS data channel / the
  platform room).

### 5.2 A page one version older in the same room (NET_V stays 4)

The artifact is one URL, so this lasts only until everyone reloads; it must still never show a wrong look in a match.

| Host | Guest | Result |
|---|---|---|
| this page | this page | Per-animal everywhere; a pick is atomic (`pk.lk`); a pick racing 시작 is re-sent after the match. |
| this page | shop page (one global set) | Its `hi` / `eq` carry its one set. Its `pk` has no `lk`, so `r.lk` stays: correct, since its one set is the same on every animal. |
| shop page | this page | The old host ignores `pk.lk`: for up to ~0.3 s + link time the room shows the guest's new animal in the previous animal's set, then the guest's `'eq'` fixes it. A 시작 pressed inside that window freezes the previous set for that one match (accepted). |
| trophy page (no shop) | either | As shop.md 7.3: looks are ignored. |

Nothing that affects play moves, and every new field is optional, so **NET_V stays 4**. `rv-net`'s hostile fuzz gains a
`'pk'` with a junk `lk` (a number, 6 characters, upper case): `r.lk` becomes bare, and `r.char` follows `m.c`.

### 5.3 Trust

As today (shop.md 7.1): a look is self-reported cosmetics, checked only against the catalog.

---

## 6. Cloud (deploy build with a cloud config only; the artifact has no cloud)

### 6.1 Document v 3

```
players/{uid} = { v: 3, dev, nick?, eq?: '<30 characters: 5 per animal, CHAR_IDS order>', s: { <slot>: {v 2 slot, unchanged} }, last, updatedAt }
```

- Only the meaning and length of `eq` change; slots keep the v 2 shape (`slotShape2`), so the coin and item rules
  are untouched. (Document v 4, the 뽑기, adds `dn` / `gd` to the slots: gacha.md 7.)
- `CL_V = 3`. `clDoc` reads v 1, 2 and 3; `v > 3` is `'newer'`.
- **Why a version bump at all**, although the cloud is not deployed yet: if the current build is deployed before this
  change lands, v 2 documents with a 5-character `eq` will exist. A v 2 page reading a 30-character `eq` would see `''`
  (no set: its regex wants 5), then push its own 5-character set over it, and every animal's set would be lost. With
  v 3, v 2 pages see `'newer'` and never write (as v 1 pages did with v 2).

### 6.2 Reading (`clDoc`, `clParseCs`)

```js
  // clDoc: if (d.v !== 1 && d.v !== 2 && d.v !== CL_V) return null;
  //   eq: d.v >= 3 ? (typeof d.eq === 'string' && /^[0-9a-z]{30}$/.test(d.eq) ? looksParse(d.eq) : '')
  //              : (typeof d.eq === 'string' && /^[0-9a-z]{5}$/.test(d.eq) ? looksParse(d.eq) : ''),   // (v 2: one set -> all six)
  //   hasEq: 'eq' in d,                       // (an upgrade write must replace whatever is there: 6.4)
  // clParseCs: ev: typeof x.ev === 'string' ? looksParse(x.ev) : ''      // (a v 2 record's 5 characters -> all six)
```

The store and the link record migrate with the same copy rule, so "a change is waiting" (`S.eq !== cs.ev`) is true
after the migration exactly when it was true before.

### 6.3 Adopting (`clAdopt`): a merge per character, against the acknowledged set

Today the account's set replaces mine unless a change of mine is waiting, in which case mine wins as a whole. With six
sets that would lose one device's change when two devices dress different animals before they sync. The new rule merges
each character (one slot of one animal) against the last synced set:

```js
  //   const ev0 = typeof cs.ev === 'string' ? cs.ev : '', eq0 = looksParse(S.eq);
  //   const eq = join ? (D.eq || eq0) : looksMerge(eq0, ev0, D.eq);      // (what I changed since the last sync stays)
  //   S.eq = looksOwned(eq, S.own);
  //   const ev = pending ? ev0 : D.eq ? D.eq : join ? S.eq : ev0;         // (the new base: the account's set as ACKNOWLEDGED)
```

- **`pending`** (the snapshot carries this tab's own unacknowledged write, `hasPendingWrites`) never moves the base: if
  the server refuses that `eq` write (the 2 s per document rule against another device, a rule change), the next snapshot
  brings the old `D.eq` back, and a base that had moved to my refused set would make `looksMerge` take the old remote set
  for every character — my change silently undone (compat review #8). The base moves when `clPush`'s acknowledgement sets
  `cs.ev = eq` (exists) or a non-pending snapshot shows it. **The same one-line fix applies to today's 5-character code**
  (`const ev = pending ? ev0 : …`), so it lands in pass L0.

| Case | Result (the same as today where today had an answer) |
|---|---|
| join, the account has a set | the account's set; in step |
| join, the account has none (a v 1 document) | the device's set, stripped to the account's items; in step |
| nothing changed here (`eq0 === ev0`) | the account's set |
| changes here, the account unchanged (`D.eq === ev0`) | mine; still to go up |
| changes here on the duck, the account changed the cat | both (new) |
| my own write echoed while pending | mine; the base stays until the acknowledgement |
| my write refused, the next snapshot shows the old set | mine (still differs from the base); sent again |
| no base (`ev0 === ''`: a v 1 link record) | mine, as today |

A snapshot adopted again with nothing new is a no-op (`looksMerge(x, b, b) === x`).

### 6.4 Writing (`clEqOut`, `clCreateTx`, `clPush`)

```js
  // clEqOut: const eq = looksParse(S.eq); if (eq === cs.ev || eq === D.eq) return '';
  //   known = the slot this write carries' items + every slot's items (v 3: their o; v 4 also their gd - gacha.md 7.2)
  //   for (let i = 0; i < LOOKS_LEN; i++) { const id = LOOK_SLOTS[i % 5] + eq[i]; if (eq[i] !== '0' && id !== STARTER && !known.has(id)) return ''; }
  //   return eq;                      // (every item on every animal must be the account's first - the item's own slot write goes before)
  // clCreateTx: eq = looksOwned(looksParse(S.eq), S.own || []); the document gets v: CL_V
  // clPush, after clEqOut:
  //   const up = !!CLOUD.doc && CLOUD.doc.v < CL_V && (!!slot || !!eq);   // (this page's first slot OR worn-set write upgrades)
  //   if (up) upd.v = CL_V;
  //   if (eq) upd.eq = eq;
  //   else if (up && CLOUD.doc.hasEq) upd.eq = CLOUD.doc.eq || LOOKS0;    // (v >= 3: eq has 30 characters - the old set on every animal)
```

- **The upgrade always carries a 30-character `eq` when the document has one**, because the rules check `eq`'s length
  on every write to a v ≥ 3 document (6.6). The document's own set copied to all six is safe to send: an older page
  pushed it only once the account owned its items. An unreadable old `eq` (a hand edit) becomes bare.
- A nick-only write never upgrades (`nickOk` allows only `nick`).
- A fold (`clFold`) never upgrades: in a v 2 or v 3 document the archive is v 2-shaped (`slotShape2`); in a v 4 one it is
  `slotShape3` (gacha.md 7.2).
- When the write lands: `if (upd.v && CLOUD.doc) CLOUD.doc.v = upd.v` (exists); `cs.ev` / `CLOUD.doc.eq` follow `eq`
  only when `eq` came from `clEqOut` (exists).
- **"An item must be owned before a set naming it goes up"** stays a client rule (`clEqOut`): the rules cannot loop
  over the slots, the same honest limit as for v 2.

### 6.5 Older pages and the release gate

| Page | v 3 document |
|---|---|
| v 2 page (shop, one set) | `clDoc` → `'newer'`: "새 버전에서 저장한 기록이에요 · 새로고침해 주세요", never writes. A reload fixes it. |
| v 1 page | the same |

- `tools/check-shop.js`: the gate becomes the table of 0.1 (store v → minimum cloud v: `{2: 2, 3: 3, 4: 4}`; "the store
  keeps a set per animal but the cloud document is v {n}: a v 2 document takes one set of 5 characters").
- `FIREBASE-SETUP.md` §12: publish the rules first (they still accept v 1 / v 2 pages), then the page; refresh every
  device once. If no document exists yet, the first deploy simply publishes these rules.

### 6.6 `firebase/firestore.rules` (paste-ready changes)

Header comment: `v: 3` ("…a page with per-animal sets makes it 3 at its first slot or worn-set write"); `eq: '…30…'`
("optional; v ≥ 3: the account's worn sets, 30 characters - 5 per animal (머리 얼굴 목 등 효과) in the game's order
오리 카피바라 해달 펭귄 고양이 개구리; v 2: one set of 5 for every animal").

New functions, after `eqValue`:

```
    // ---- v 3 (design/looks-per-animal.md): a worn set per animal - eq is 30 characters, 5 per animal in the game's
    // order (오리 카피바라 해달 펭귄 고양이 개구리). Slots are as in v 2
    function eqsValue(e) {
      return e is string && e.matches('^[0-9a-z]{30}$');
    }
    // the worn set as the document's version wants it: v >= 3 - six sets (30), v 1 / v 2 - one set (5)
    function eqFor(e, v) {
      return v >= 3 ? eqsValue(e) : eqValue(e);
    }
```

Changed functions (gacha.md 7.3 extends the same lines for v 4):

```
    function createOk() {
      ...
        && ((d.v == 1 && slotShape(d.s[d.last]) && !('eq' in d))
            || (d.v == 2 && slotShape2(d.s[d.last]) && (!('eq' in d) || eqValue(d.eq)))
            || (d.v == 3 && slotShape2(d.s[d.last]) && (!('eq' in d) || eqsValue(d.eq))))
      ...
    }
    // every update: only s / last / nick / eq / v / updatedAt change (v only upwards, to 2 or 3), ...
    function metaOk() {
      ...
      return d.diff(o).affectedKeys().hasOnly(['s', 'last', 'nick', 'eq', 'v', 'updatedAt'])
        && (d.v == o.v || ((d.v == 2 || d.v == 3) && d.v > o.v))
        ...
        && (!('eq' in d) || eqFor(d.eq, d.v));
    }
    function slotOk() {
      ...
        && (d.v >= 2 ? slotOk2(o, d.s[k], k) : (slotShape(d.s[k]) && ((k in o.s) ? stepOk(o.s[k], d.s[k]) : newOk(d.s[k]))));
    }
    function sumOk(a, b, z, v) {
      return (v >= 2 ? (slotShape2(z) && coinSumOk(a, b, z)) : slotShape(z))
        ...
    }
    // only the worn set changes - and the version with it when this write makes the document v 3 (a page with
    // per-animal sets upgrades with its first worn set of 30 characters; metaOk checked both values)
    function eqOk() {
      let d = request.resource.data;
      let o = resource.data;
      return d.diff(o).affectedKeys().hasOnly(['eq', 'v', 'updatedAt']) && ('eq' in d);
    }
```

- `metaOk` checks `d.eq` (the document after the write), so a v 3 document can never hold a 5-character set, and an
  upgrade that leaves an old 5-character `eq` in place is refused. That is why 6.4 always sends `eq` with the upgrade.
- An `eq`-only write that changes `v` from 1 to 2 (with 5 characters) is also allowed. It is harmless and no page sends it.
- Expression cost: two `matches` and a few comparisons more than v 2's worst case (a purchase into a 16-slot document).

**Before deploying,** in the emulator or the Rules Playground (added to shop.md 8.4's list), and ported into the
`FakeFirebase` rules of `src/tests/cloud.js`:
- create v 3 with a 30-character `eq` (allowed), with 5 characters (refused), without `eq` (allowed);
- an `eq`-only write of 30 characters into v 3 (allowed); of 5, 29, 31 characters or upper case into v 3 (refused);
- an `eq`-only upgrade v 2 → 3 with 30 characters (allowed), with 5 (refused);
- a slot write upgrading v 2 → 3 while the document keeps its 5-character `eq` (refused), with `eq` replaced by 30
  (allowed), into a v 2 document without `eq` (allowed);
- a v 1 → 3 slot write (allowed); v 3 → 2 (refused); `v: 2.5` (refused);
- a v 2-shaped slot write into v 3 (allowed), a v 1-shaped one (refused); a fold in v 3 (allowed);
- a v 2 page's writes into a v 2 document (all unchanged);
- the largest write (a purchase into a 16-slot v 3 document) under 1,000 expressions.

### 6.7 Store swaps and read-only pages (pass L0 — before L1 and before any deploy)

No version change; all in the cloud section. Each item was found by the reviews in today's code.

1. **A read-only page never writes the cloud's keys** (compat review #7). A tab that turned read-only mid-session (the
   `storage` event → `troRead` → `'newer'`) keeps its cloud state `'in'`; its `clUnlink` writes no store but then runs
   `sset(clGuestKey(), '')` and **erases this browser's own put-aside store**; `clLinkDone`'s join writes the guest key
   from its stale in-memory store; `clCreateTx` builds a document from it; `clPark` / `clMetaPut` write too.
   - `clSignOut`, `clUnlink`, `clRestore`, `clLink` / `clLinkDone` (every branch that writes) and `clCreateTx` return at
     once when `TRO.ro`, with `clMsg('newer')` ("새 버전에서 저장한 기록이에요 · 새로고침해 주세요"); `clPark` and the
     `clMetaPut` callers are reached only through them.
   - `clStore()` (after the `storage` event's `troRead`): if `TRO.ro` became true, `clStopListen(); CLOUD.newer = true;
     clMsg('newer'); clUI(); clBadge();` (`clCanPush` already refuses with `CLOUD.newer`).
   - Deployed pages cannot be patched afterwards, so **the first deploy must already have these guards**.
2. **A forced sign-out parks the account's unsaved copy** (economy review #1). Today the second tap of
   "저장 안 된 … · 한 번 더 누르면 로그아웃" runs `clUnlink(false)`, which drops the linked copy: the next sign-in finds no
   parked copy, joins from the cloud, and what was not pushed is gone — trophies, coins, a purchase (its coins come back),
   and with the 뽑기 a draw (its coins come back: a free re-roll on an unmodified page, by drawing offline).
   - `clSignOutNow(park)`: the forced path calls `clUnlink(clDirty(troRead()) === 'hard')`, so an unsaved copy goes to
     `ppogeul-park` (`clPark`, the newest 4 accounts) and `clLink`'s `clRestore(uid)` brings it back at that account's
     next sign-in here, before any join; the push then sends the rest into its own slot.
   - `CL_TX.dirty` becomes "저장 안 된 기록이 있어요 · 한 번 더 누르면 로그아웃" (not only trophies any more); a parked
     sign-out shows the new `CL_TX.outkeep` "로그아웃했어요 · 저장 안 된 기록은 다시 로그인하면 올라가요" instead of `out`.
   - Not done: a hard block on sign-out while draws are unsaved. With the park, nothing is lost or re-rolled on this
     device; a block would trap a player who is offline for good.
3. **The soft cap's day count survives a store swap** (economy review #2, last part). `clAdopt`'s join keeps the guest's
   `cd` / `cde` in the account copy, and `clUnlink` brings the guest back with the count it had before signing in, so a
   sign-out → sign-in restarted the 400-coin day. In `clUnlink` and `clRestore`, the store coming back takes the leaving
   store's day count: `if (S.cd > back.cd) { back.cd = S.cd; back.cde = S.cde; } else if (S.cd === back.cd) back.cde = Math.max(back.cde, S.cde);`
   (the soft cap is per browser and day, whichever store is active).
4. **`clAdopt`'s base never moves on a pending snapshot** (6.3; today's 5-character line).
5. **check-shop ties the rules file to `CL_V`** (compat review #12): the header says `v: <CL_V>`; `createOk` and `metaOk`
   each contain `d.v == <CL_V>`; `slotOk` and `sumOk` route that version; from `CL_V` 4 the rules define `slotShape3` and
   `poolIds` and `CL_FIELDS` includes `'dn'`. The gate becomes the table of 0.1.

---

## 7. Twin colours, rings, tags (distinction.md)

Unchanged. The drawing order stays frame → twin recolour → items → tint → ring (shop.md's joint contract). Two players
on the same animal each wear their own set; the second copy's body takes its twin colour, and the items keep theirs.
`headTop`, the tag lift and the podium crown read `p.look` per player, as today.

---

## 8. Korean copy

`aniSubj(c)` writes the animal's name as a subject. A name that ends in a final consonant takes the friendly 이 first
(냥냥이가, 펭펭이가), which is how a kid says a pet's name; the others take 가:

```js
  // "꽥꽥이가" / "까삐가" / "해롱이가" / "펭펭이가" / "냥냥이가" / "개굴이가"
  const aniSubj = (c) => { const n = (CHARS[c] || CHARS.duck).name, k = n.charCodeAt(n.length - 1) - 0xac00; return n + (k >= 0 && k < 11172 && k % 28 ? '이가' : '가'); };
```

| Where | Text | Example |
|---|---|---|
| 쓰기 / 하기 / 두르기 … (상점 button, a 마이페이지 cell, 뽑기's 지금 쓰기) | `{주어} {done}` | 꽥꽥이가 썼어요 · 냥냥이가 했어요 · 까삐가 둘렀어요 · 해롱이가 꼈어요 · 펭펭이가 달았어요 · 개굴이가 켰어요 |
| 벗기 / 빼기 / 떼기 / 끄기, 마이페이지's 없음 | `{주어} {offDone}` (없음: the worn item's verb, else the slot's) | 꽥꽥이가 벗었어요 · 냥냥이가 뺐어요 · 펭펭이가 뗐어요 · 까삐가 껐어요 |
| a purchase | `샀어요! {주어} 바로 {done}` | 샀어요! 꽥꽥이가 바로 썼어요 |
| the first purchase ever (a new player) | + ` · 동물마다 따로 꾸며요` | 샀어요! 까삐가 바로 썼어요 · 동물마다 따로 꾸며요 |
| a migrated player's first dressing in the 상점 (`lh`) | + ` · 이제 동물마다 따로 꾸며요` (wins over the line above) | 꽥꽥이가 썼어요 · 이제 동물마다 따로 꾸며요 |
| 마이페이지's note while `lh` | `이제 동물마다 따로 꾸며요!` | |
| the preview pill | `{이름}` | 꽥꽥이 |
| the row of six (aria) | radiogroup "꾸밀 동물"; radio `{이름} · {items}` / `{이름} · 아직 안 꾸몄어요` | 냥냥 · 바가지 모자, 수경 |
| equipment boxes (aria) | `{이름} 꾸미기` | 꽥꽥이 꾸미기 |
| the previews (aria) | 상점 `미리 보기: {이름} · 눌러서 다른 동물로`; 마이페이지 / 뽑기 `{이름} · 눌러서 다른 동물로` | |
| 쓰기 button (aria) | `{이름}: {on}` (never "~에게": 쓰기 / 입기 are self-wearing verbs) | 꽥꽥이: 쓰기 |

- Every verb is the catalog's own (`verbOf(it)`: `vb` or `SLOT_INFO`); no new verb forms.
- `SHOP_TEXT` gains `' 동물마다 따로 꾸며요 이제 동물마다 따로 꾸며요! 가 이가'` (the names are already in `V3_TEXT`);
  aria-labels are not warmed. `tools/check-shop.js` and shop group 10 check the warm-up.
- The starter note ("처음 선물: 초록 때타월 리본을 해 봐요") shows while nothing is owned and **no animal** wears n1;
  `openHub` opens 마이페이지 on 목 under the same condition.

---

## 9. Edge cases

| Case | Behaviour |
|---|---|
| An existing player (v 2 store) | Every animal wears the old set (copied); `lh` tells them once (2.4). |
| Buying while the 상점 preview shows 까삐 (not my pick) | 까삐 wears it ("샀어요! 까삐가 바로 썼어요"); the title demo (my pick) does not change. |
| Dressing an animal other than my seat's in the hub opened from the room | Saved; nothing is sent; my card does not change. |
| A guest picks another animal in the room | `'pk'` carries its set; cards switch animal and outfit together (5.1). |
| A guest's pick races the host's 시작 | The match uses the host's animal with that animal's set (sent before the pick); after the match `guestToRoom` re-sends the pick with its set, then `lookSend` (5.1). |
| The host starts while my hub is open (from the room) | As today: the hub closes and I play with the set the host has for my animal. |
| Two players on the same animal | Each its own set, the twin colour on the second body (7). |
| Another tab of this browser dresses an animal | `troSync` → `lookOut` / `hubFill`: busts, demo and hub follow; a running match keeps its looks. |
| Two tabs writing at the same moment | `troMut`'s stated limit (shop.md 13): one change can be lost, as for a purchase. |
| An older page in this browser | `'newer'` → read-only at its next read; with L0 it also stops writing the cloud's keys; reload (2.2, 6.7). |
| A friend's page sends an item my page does not know (newer catalog: 뽑기 items) | `lookParse` drops that slot to `'0'` (unchanged; network only). |
| Two devices of one account dress different animals offline | Both changes kept (6.3). The same slot of the same animal on both: the later push wins. |
| My worn-set write is refused by the server | The change stays and is sent again (6.3). |
| Forced sign-out with unsaved changes | Parked, restored at the next sign-in of that account here (6.7). |
| An item lost (sign-out restores the device's own store) | `looksOwned` strips it on every animal. |
| A future 7th animal | `LOOKS_LEN` grows to 35: a `TRO_V` / `CL_V` bump and the rules regex, with `looksParse` reading the shorter string (pad with `LOOK0`). Not needed now. |

---

## 10. Debug / test API

| API | Today | After |
|---|---|---|
| `shop.state().eq` | `S.eq` (the 5-char set) | **the pick's chunk** `lookOf(S.eq, G.sel)`: existing assertions like `S().eq === '50000'` keep their meaning |
| `shop.state().eqs`, `.lh` | – | `S.eq` (30), `S.lh` |
| `shop.state().look` | `myLook()` | `myLook(G.sel)` |
| `shop.state().lift` | `lookLift(G.sel, myLook())` | `lookLift(G.sel, myLook(G.sel))` |
| `shop.set({ eq, lh })` | 5 chars | 5 chars are copied to all six (the migration rule); 30 chars set each animal; `lh` 0/1 |
| `shop.wear(slot, id, c)`, `shop.buy(id, c)` | `(slot, id)`, `(id)` | `c` optional (default `G.sel`) |
| `shop.look(c)`, `shop.looks()` | `look()` | `myLook(c)`, `myLooks()` |
| `shop.hub()` | `view`, `cyc` | + `ani: hubAni()`; `cyc` goes (the arrows are permanent) |
| `shop.ani(c)`, `shop.cycle(d)` | – | set `HUB.ani` and refill; a preview half-tap (-1 / +1) |
| `mp.state().roster[].lk`, `mp.seat()` | host's own `myLook()` | `myLook(r.char)`; `seatChar()` |
| `cloud` pure parts | – | expose `looksParse`, `looksMerge` for the pure tests |

---

## 11. Tests

**Store hygiene** as shop.md 16: every new test dresses in its own namespace (`tro.ns`) or restores the store.

### 11.1 `src/tests/shop.js` (job `shop`, plus `shop-fit-*`, `shop-hub-*`, `shop-room`)

- **`storeTests` (group 5):**
  - v 1 → v 3: written back with `r.v === 3`, `r.eq === '0'.repeat(30)`, `r.lh === 0`.
  - **v 2 → v 3**: a v 2 store with `own ['h5', 'n3', 'e6']`, `eq '50306'` reads every animal as `'50306'`
    (`shop.look(c)` for all six), `lh 1`, and is written back **at load** (`troLoad`) as v 3 with `'50306'.repeat(6)`;
    every other field identical. A bare v 2 store → `lh 0`.
  - The "newer" store becomes `v: 4` (read-only, untouched); a `v: 3` store is read. (After G2: newer `v: 5`.)
  - Clamps: 30 characters of junk → all bare; 29 / 31 characters → all bare; a junk chunk on one animal only bares that
    animal; an unowned item on the cat is stripped there only.
  - Per animal: `buy('h1')` dresses the pick only (`look('cat') === '00000'`); `buy('h2', 'cat')` dresses the cat
    only; `wear('h', null, 'cat')` leaves the duck's hat; the starter on the frog only; refusals unchanged; every
    dressing clears `lh`.
- **Group 7 tail (the demo, pickers, solo):**
  - The six title busts each wear their own set: dress only the duck → only the duck's bust changes; dress the cat → only
    the cat's; the room picker the same (`shop-room`).
  - The demo wears the pick's set; `pickChar('cat')` → the demo wears the cat's.
  - Solo with `G.sel` cat wears the cat's set; a change mid-game waits; 한 판 더 keeps the match's looks.
- **`hubTests`:** the strings of 8 (e.g. `'샀어요! 꽥꽥이가 바로 썼어요'`, `'꽥꽥이가 벗었어요'`, `'꽥꽥이가 썼어요'`,
  `'샀어요! 꽥꽥이가 바로 했어요'`, `'꽥꽥이가 뺐어요'`, `'샀어요! 꽥꽥이가 바로 켰어요'`, the first purchase
  `' · 동물마다 따로 꾸며요'`, an `lh` store's first 쓰기 `' · 이제 동물마다 따로 꾸며요'` once and never again). A click on
  the preview's right half → the next animal, left half → the previous; ←/→ on the focused preview the same; to 냥냥 →
  the pill reads 냥냥, the button turns 쓰기 for an item the duck wears, 쓰기 → only the cat wears it, "냥냥이가 썼어요";
  buying with 까삐 shown → 까삐 wears it, the demo (duck) does not.
- **`myTests`:** the row of six (`role="radiogroup"`, 6 radios, the pick checked on open, aria-labels with item names or
  "아직 안 꾸몄어요", the 등 / 효과 dot on a bust dressed only there); a radio → preview pill, equipment boxes, grid ring and
  `#pg-my-slots`' aria follow; a cell dresses that animal only, with its message; ←/→ on the row (wrapping), ↑/↓ inert;
  **내 기록 in the footer** (shown on 마이페이지, hidden on 상점; there and back keeps the animal); the `lh` note and its
  clearing; the starter note gone once any animal wears n1; reopening the hub starts on the pick again.
- **`viewTests` / `reviewTests`:** the arrows are always drawn; the pill sits on the preview's top border and no hat
  pixel of a hopping e2 preview is under it (pixel probe at the hop's peak).
- **`roomTests`:** 꾸미기 opens on the room's animal; dressing another animal sends nothing.
- **`hubFitTests`:** unchanged assertions (no vertical scroll at 320 / 360 / 390 / 2x / desktop, nothing sideways,
  the action button beside the preview) plus: the row of six on one line inside the card; the pill inside the card;
  **the tab row on one line with "9,999" and "8,888" at 320 / 360 / 390** (`hubTopFit` not needed at 4 digits). New
  staged states **`ani`** (마이페이지 on 냥냥, the duck and the cat dressed differently, balance 2,345) and **`hint`**
  (a migrated store, `lh 1`) in the fit loop, shots `shop-hub-ani-320`, `shop-hub-ani-844`, `shop-hub-hint-390`.
- **Group 10:** every new visible string's syllables in `#pg-fontwarm`.

### 11.2 `src/tests/shop-net.js` (job `shop-net`, "SHOPNET … DONE"), new phase "per-animal sets in the room"

1. B (guest) dresses its duck `'50000'` and its cat `'00300'`, plays the duck: the host's roster has `'50000'`.
2. B picks the cat: every R the host sends from the pick for 1 s (watch `setState`) never shows B's seat as cat +
   `'50000'`; the first R with cat has `'00300'`; A's card shows the cat in `'00300'`.
3. **An older host:** B's `'pk'` with `lk` stripped (wrap B's `send`): the host shows cat + `'50000'`, then `'00300'`
   within 0.5 s (B's `'eq'`).
4. **An older guest:** a raw `{t:'pk', c:'frog'}` from A keeps A's `r.lk`; `{t:'pk', c:'frog', lk: 7}` makes it bare.
5. B dresses its duck (not its seat's animal) in the hub opened from the room: no `'eq'`, R unchanged.
6. **The race:** B's `'pk'` (cat) is held back until the host's `netStart` ran (wrap the channel): the match freezes B as
   the duck in the duck's set on every page; back in the room B re-sends `pk` cat with `'00300'` and every card shows it.
7. 시작 (battle): every page's frozen looks are each seat's animal set; the host, who dressed only its cat while playing
   the duck, plays a bare duck; A and B both on cats wear their own sets (pixel probe as phase 3, twin colour on the
   second).
8. Game-phase seats stay 4 long in every snapshot (looks still add no byte).

### 11.3 `src/tests/cloud.js` (job `cloud`), `tools/check-shop.js`, `src/tests/trophies.js`

- **L0 cases:** a tab made read-only by a `storage` event signs out → the guest key is untouched, the message is
  `'newer'`, nothing is written; a link attempt from it does nothing; forced sign-out offline with an unsaved coin award
  and a purchase → `ppogeul-park` holds the copy → sign-in → both restored and pushed into the same slot; the soft cap's
  `cde` after sign-in → play → sign-out equals the day's total (not the guest's old count); an `eq` write refused by
  the fake server (2 s rule) → the change stays and goes up at the next push; check-shop's rules ↔ `CL_V` checks on a
  rules file with a wrong header (fails) and the real one (passes).
- **`FakeFirebase` rules (L1):** port 6.6 function by function (`eqsValue`, `eqFor`, `createOk`, `metaOk`, `slotOk`,
  `sumOk`, `eqOk` with `v`); every case of 6.6's list allowed / refused.
- **Pure (group 2b's style):** `looksParse` (5 → ×6, junk per chunk, 29 / 31 → bare); `looksMerge` (the table of 6.3,
  idempotence, the pending rows); `clDoc` (v 3 with 30, v 2 with 5 → ×6, v 4 `'newer'`, `hasEq`); `clParseCs` (a v 2
  record's 5-character `ev` → ×6, `S.eq === cs.ev` preserved by the migration); `clEqOut` (an unowned item on one animal
  blocks the whole set); the existing two-device simulation updated to 30 characters.
- **Through the frames (group 11b's style):** the first upload makes a v 3 document with 30 characters; a joining
  device gets all six sets; device A dresses the duck and device B the cat while both are offline → both converge to
  both changes; a seeded v 2 document (`eq '10000'`) reads as all six and stays v 2 until this page's next write, which
  upgrades it with `'10000'.repeat(6)` (or with the pending set); a v 2 document with a junk `eq` is upgraded with all
  bare; a v 4 document → `'newer'`, never written. (After G2 the "newer" document is v 5.)
- **`tools/check-shop.js`:** the gate table; the `OWNABLE` pin; the rules checks of 6.7; the new `SHOP_TEXT` strings.
- **`src/tests/trophies.js`:** L34 and L55 `raw().v === 3`; L47's newer store becomes `v: 4` (G2: 4 and 5).
- **`rv-net.js`** (by hand): the `'pk'` fuzz of 5.2.

---

## 12. Implementation passes

Code passes, strictly one after another, each by one agent, each starting from the previous green suite. Every pass:
`node build.js` OK; its run-all filter green while iterating; then the full `node tools/run-all.js` green; the
screenshots it names looked at with Read; an "as built" note appended to this file. Never run while another workflow
runs the suite. This doc has no art pass.

| Pass | Needs | Files | Size (rough) |
|---|---|---|---|
| L0 store swaps and read-only pages | shop.md S5 (today's code) | game.js (cloud section), check-shop.js, tests cloud.js | ~60 + 50 + 200 |
| L1 data: store v 3, cloud v 3, rules, hub actions per animal | L0 | game.js (store, shop, hub logic, cloud), firestore.rules, check-shop.js, tests shop.js / trophies.js / cloud.js, FIREBASE-SETUP.md | ~150 + 40 + 300 |
| L2 play and the room | L1 | game.js (pickers, demo, solo, net), tests shop.js / shop-net.js | ~50 + 280 |
| L3 the hub UI | L2 | page.html, game.js (hub), tests shop.js, run-all.js (new shots) | ~90 + 150 + 220 |

### L0 — store swaps and read-only pages (6.7)

- **Do:** the read-only guards in `clSignOut`, `clUnlink`, `clRestore`, `clLink` / `clLinkDone`, `clCreateTx`, and
  `clStore`'s stop; the forced sign-out parks (`clSignOutNow(park)`, `CL_TX.dirty` / `outkeep`); the day count carried
  by `clUnlink` / `clRestore`; `clAdopt`'s `pending` base; check-shop's gate table (still `{2: 2}` in effect) and the
  rules ↔ `CL_V` checks; tests 11.3 "L0 cases".
- **Accept:** run-all `cloud check-cloud check-shop cloud-rec cloud-title cloud-my-out pwa trophies` green; looked at:
  `cloud-rec-msg-390` and `cloud-rec-in-390` (the status line still fits; stage the new `dirty` / `outkeep` texts with
  `PG.debug.cloud.say` for one look at 390 px: two lines at most).
- **Releasable alone** (artifact unchanged; the deploy safer).

### L1 — the data

- **Do:** §2 (helpers, `TRO_V 3`, `troFresh` / `troParse` with `lh`, `shopBuy` / `lookSet` with `c`, `lookOut`'s demo
  line); `hubAni()` and `HUB.ani` (renamed from `HUB.view`, set to `G.sel` in `openHub` unless coming back) used by
  `hubLook`, `hubTick`, `shopBtnState`, `hubAct`, `hubCell`, `hubGrid`, `hubFillMy`; the starter checks with
  `looksWear`; the preview tap refills the hub (still one way until L3); §6.1-6.6 in the cloud section (`CL_V 3`,
  `clDoc`, `clParseCs`, `clAdopt`'s merge, `clEqOut`, `clCreateTx`, `clPush`'s upgrade); `firebase/firestore.rules` 6.6;
  the check-shop gate `{3: 3}` and `OWNABLE {2: 40, 3: 40}`; the debug API of 10; tests 11.1 (store group, the hub's
  per-animal action checks), 11.3 (L1 parts). Other call sites stay on `myLook()` (the pick) until L2: play is exactly
  as before for the picked animal.
- **Accept:** run-all `shop check-shop trophies trophies-net cloud check-cloud cloud-rec cloud-title cloud-my-out pwa final-e2e`
  green; a v 2 store with a link record migrates at load (the per-animal copy, `S.eq === cs.ev` kept, `lh` set).
- **Not releasable alone** (the busts and the room still show the pick's set on all six; no row of six yet). A deploy
  built after L1 is consistent (store 3, cloud 3, rules 3 published first).

### L2 — play and the room

- **Do:** §1 rows 6-22 and 35: `pickArt` / `buildPicker` / the room picker per animal (cache `myLooks()`),
  `pickChar`, `idleWorld`, `toTitle`, solo `newGame`, `roomInfo`, `netStart`, `renderRoom`'s `lkOf`, `seatChar()`,
  `netAttach`'s `hi`, `lookSend`, `netPick` (`pk.lk` + `lookSend`), `netMsgIn` (`'pk'` with `'lk' in m`), `guestToRoom`'s
  re-sent pick, `netDebugApi`; tests 11.1 group 7 tail and `roomTests`, 11.2, the rv-net fuzz by hand.
- **Accept:** run-all `shop shop-net shop-room mp-net net-bc trophies-net kits-net room-platform peer-deploy distinction-net ux-roomrow v3-room4`
  green; `snapMax` / `snapTrim` in `mp-net` / `kits-net` as before (looks add nothing to snapshots); shots
  `shop-room-390|900` and `v3-room4` looked at (my card in my seat animal's set, the room picker's busts each in their own).

### L3 — the hub UI

- **Do:** §4 and §8: the row of six (markup, `hubSetupDOM` build, `hubFillMy` fill, aria, the radio branch of
  `hubArrow`, the 등 / 효과 dot), the preview wrappers and the name pill in both previews, the two-way arrows (halves,
  ←/→), 내 기록 in the footer (`hubShow` toggles it: the footer pattern of 4.0), the tab-row CSS of 4.0 and
  `hubTopFit()`, `.pg-tabs [role="tab"] { position: relative }`, the messages with `aniSubj`, the first purchase line,
  the `lh` note and message, the aria-labels, `SHOP_TEXT`; tests 11.1 (`hubTests`, `myTests`, `viewTests`, `reviewTests`,
  `hubFitTests`, group 10), the `ani` / `hint` stages and their shots in run-all.
- **Accept:** run-all `shop shop-fit shop-hub shop-room shop-title pwa trophies cloud-my-out ux-roomrow` green (in
  particular `shop-fit-320` 'all' with the 'full', 'ani' and 'hint' states, and `pwa`'s 320 hub); shots looked at:
  `shop-hub-full-320`, `shop-hub-starter-320`, `shop-hub-ani-320`, `shop-hub-ani-844`, `shop-hub-hint-390`,
  `shop-hub-my-844`, `shop-hub-poor-390` (the pill on the border), `shop-hub-e6-844` (the pill over a walking preview),
  `shop-hub-bought-900` (the named message), `shop-hub-1x`, `pwa-320-my`, `shop-title-390` (six busts in their own sets).
- **Release A:** the artifact may ship after L3 (request A done). The deploy: any time after L0, with each data pass's
  rules published before its page.

### The combined order (both docs; gacha.md 15 has the same table)

| # | Pass | Track | Needs | Version after it (store / cloud) | Ships |
|---|---|---|---|---|---|
| 1 | **L0** store swaps, read-only pages | code | – | 2 / 2 | deploy-safe from here |
| 2 | **L1** data: per-animal store + cloud + rules | code | L0 | 3 / 3 | (rules v 3 first) |
| 3 | **L2** play and the room | code | L1 | 3 / 3 | |
| 4 | **L3** the hub UI | code | L2 | 3 / 3 | **Release A (artifact)** |
| 5 | **G1** catalog + pure draw logic (items hidden) | code | L3 | 3 / 3 | |
| 6 | **G2** data: draw store + cloud v 4 + rules | code | G1 | 4 / 4 | (rules v 4 first) |
| 7 | **G3** the 뽑기 tab, 상점 cells, effects e7 / e8 | code | G2, GA1 | 4 / 4 | (may ship: no animation) |
| 8 | **G4** the show: animation and sounds | code | G3, GA2 | 4 / 4 | **Release B (artifact)** |
| – | **GA1** the 10 items, 2 effect icons, `fx_duck`, `ic_cap` | art | – | – | needed by G3 |
| – | **GA2** the machine, crank, capsules | art | – | – | needed by G4 |

- Code passes run strictly in this order, one agent each. The art passes edit only `src/sprites.js`,
  `tools/check-sprites.js` (and `tools/anchors.js` if needed); they can be written at any time in parallel with code
  passes, but their suite runs are serialized with the code passes' (never two workflows running the suite).
- The store and the cloud move together in L1 and in G2, so the release gate holds after every pass and a deploy can be
  built after any of them; the deploy's order is always: publish that pass's rules, deploy the page, refresh every
  device once.

---

## 13. Not in this change

- Owning items per animal (the lead: owned once, worn by every animal).
- A "모두에게 입히기" (dress all six the same) button: a possible follow-up in 마이페이지 if players ask; one `troMut`
  that copies the hub animal's chunk to the others.
- Sending all six sets over the network, or showing a friend's other animals.
- Changing the pick from the hub.

---

## 14. Review log (2026-10-19)

Three reviews (economy, compatibility, UX) of this doc and gacha.md. Applied here:

- **Versions:** the shared "one v 3 for both features" is gone — it put two schemas under one number (an L-era page would
  strip the 뽑기's store fields and slot fields). This doc owns store v 3 / cloud v 3; the 뽑기 owns 4 / 4 (0.1).
- **compat #2 / econ #5** `clEqOut` also knows every slot's `gd` (from G2; 6.4). **compat #6** the raced pick is re-sent
  by `guestToRoom` (5.1); `lookSend` / `'eq'` / `CO.eqSent` keep `G.sel` instead of the proposed `seatChar()`, which
  right after a pick still names the old animal and would silence the `'eq'` fallback for an older host.
  **compat #7** read-only pages write nothing, migration happens at boot (2.2, 6.7). **compat #8** the pending base
  (6.3). **compat #9** `'lk' in m` (5.1). **compat #12** rules ↔ `CL_V` checks (6.7). **compat #13** one set of API names
  (0.1). **compat #4** the catalog policy: a new ownable id is a new version, pinned by check-shop (0.1; option (b),
  opaque unknown ids, was not taken: it needs a guard on every `ITEM[id]` over `own` for no user-visible gain).
- **econ #1** forced sign-out parks (6.7; the proposed hard block was not taken, see there). **econ #2** (soft-cap part)
  the day count carried (6.7); its pity part is gacha.md 3.3.
- **UX #1** the tab row at 320 with three tabs, `hubTopFit`, the 1em padding (4.0). **UX #4** the pill outside the
  canvas (4.2). **UX #5** two-way arrows (4.2). **UX #11** `lh` (2.4). **UX #15** radiogroup, the real target size (4.1).
  **UX #16** footer widths, no long text in the 82 px footer (4.0, 4.4). **UX #17** the 등 / 효과 dot (4.1). **UX #20**
  tabs `position: relative` (4.0).

---

## As built (L1, 2026-10-19)

- **L0 deferred** (the deploy-only store-swap fixes of 6.7, until the user deploys): no read-only guards, no forced-sign-out
  park, no day-count carry, no rules ↔ `CL_V` check in check-shop. Only what L1 needs is in: `clAdopt`'s base never moves
  on a pending snapshot (part of the 6.3 line itself).
- Store: `TRO_V 3`, the 2.1 helpers after `lookPut` — **the per-animal accessor is `aniLook(ls, c)`, not `lookOf`**
  (`lookOf` is already the frame cache near the top of game.js); `troParse` reads v 1 / 2 / 3 with `lh`; `shopBuy(id, c)`,
  `lookSet(slot, id, c)` clear `lh`; `lookOut`'s demo line uses `myLook(G.p.char)`.
- Hub: `HUB.ani` (replaces `HUB.view`, set to `G.sel` in `openHub` unless back from 내 기록), `hubAni()`, `hubCycle(d)` (the
  preview tap = `hubCycle(1)` and refills; arrows still vanish after the first tap until L3); every hub action and the
  starter checks (`looksWear`) use it. Messages unchanged until L3.
- Cloud: `CL_V 3`, `clDoc` (v 1-3, `hasEq`), `clParseCs`, `clAdopt` merge, `clEqOut` (30), `clCreateTx`, `clPush`'s upgrade
  (`up` with a slot or eq write; `eq` = the document's copy or bare when it has one). Rules 6.6 in `firebase/firestore.rules`
  and the `FakeFirebase` port; FIREBASE-SETUP.md §12 step 5.
- check-shop: the gate table `{2: 2, 3: 3, 4: 4}` and `OWNABLE {2: 40, 3: 40, 4: 50}` (catalog size per `TRO_V`).
- Debug: `shop.state().eq` = the pick's chunk, `.eqs`, `.lh`; `shop.look(c)`, `looks()`, `parses(s)`, `wear(slot, id, c)`,
  `buy(id, c)`, `ani(c)`, `cycle(d)`, `hub().ani`; `cloud.looksParse / looksMerge / looksOwned`.
- Tests: shop group 5 (v1/v2/v3/v4 stores, 30-char clamps, per-animal buy/wear, `lh`), hubTests `ani:` checks; cloud rules v3
  cases, the 6.3 merge table + pending rows, `clDoc` / `clParseCs`, the sim at 30 characters, frames (v 3 upload, two
  devices offline on two animals converge, seeded v 2 documents upgraded with ×6 / bare, v 4 newer); trophies v 3 / v 4.
- Accept: run-all `shop check-shop trophies trophies-net cloud check-cloud cloud-rec cloud-title cloud-my-out pwa final-e2e`
  **65/65 green** (shop 343 pass, cloud 282 pass).

## As built (L2, 2026-10-19)

- Every §1 row 6-22 and 35 call site passes its animal; `grep "myLook()"` in game.js finds none. Pickers (title and room)
  draw each bust in `myLook(c)`, cache key `myLooks()`; the demo (`idleWorld`, `toTitle`, `pickChar`) wears the pick's set;
  solo `newGame` the list's animal's; `roomInfo`, `netStart`, `renderRoom`'s `lkOf`, `netState` mine as `myLook(r.char)`.
- Net: `seatChar()`; `hi` / `lookSend` / `'eq'` use `myLook(G.sel)`; `netPick` (guest) sends `{t:'pk', c, lk}` then
  `lookSend()`; the host takes `lk` only when `'lk' in m` (junk → bare); `guestToRoom` re-sends a raced pick before
  `lookSend`. `mp.seat()` in the debug API. NET_V 4, snapshots unchanged.
- Note for testers: a guest that picks back within 300 ms sends no `'eq'` (CO.eqSent still matches) - harmless with a
  current host (`pk.lk`), a stale set for an older host until the next change (5.2's accepted window).
- Tests: shop wearTests (per-bust pickers, the demo on pick change, solo on the animal played), roomTests (꾸미기 on the
  seat's animal; dressing the cat changes no card / roster / R); shop-net phase 9 (11.2 steps 1-8, incl. the held-back
  `pk` race and two cats in their own sets with the host a bare duck); rv-net hostile `pk` junk `lk` (run by hand: 10/10).
- Accept: run-all `shop shop-net shop-room mp-net net-bc trophies-net kits-net room-platform peer-deploy distinction-net
  ux-roomrow v3-room4` **49/49 green** (shop 345, shop-net 51). Looked at `shop-room-390` (my card and every bust in the
  staged set, copied to all six) and `v3-room4` (bare seats, unchanged).

## As built (L3, 2026-10-19)

- Hub markup / CSS as 4.0-4.2: `.pg-look-wrap` + pill (`#pg-shop-aname`, `#pg-my-aname`) on both previews, `.pg-my-side` gone,
  `#pg-my-anis` (radiogroup built in `hubSetupDOM`, filled in `hubFillMy`: `lookPortrait`, `b._lk` repaint, the 등 / 효과 dot,
  aria), `#pg-my-rec` in the footer (`hubShow` toggles it), `#pg-my-slots` aria "{이름} 꾸미기", the 380 px tab-row CSS,
  tabs `position: relative`. Sr h2 / tablist label unchanged until G3.
- **`hubTopFit()` differs from 4.0's test:** "wrapped" is `chip.offsetTop >= tabs.offsetTop + tabs.offsetHeight - 2` (the
  row centres its items, so a one-line chip already sits ~10 px below the 44 px tabs' top; `> tabs.offsetTop + 2` would
  always fire). Run from `hubShow`, `hubCoins` (chip text length changed), `fit()` and the fonts' `loadingdone`.
- Preview: arrows always (`HUB.cyc` gone); the click uses `clientX` against the button's rect (not `offsetX`, which is the
  canvas's); a click with `detail 0` (Enter / Space, `el.click()`) = next. `hubArrow`: radio branch (←/→ wrap, ↑/↓ swallowed)
  and the preview branch (←/→ = `hubCycle`).
- Messages via `aniSubj` (상점 쓰기 / 벗기 / 사기, and 마이페이지 cells now say "{주어} {done|offDone}"); first purchase
  " · 동물마다 따로 꾸며요", `lh` " · 이제 동물마다 따로 꾸며요" on any 상점 dressing (wins); `myNote` returns the `lh` line
  as one note (precedence after storage, before the starter), not an extra line. 쓰기 / 벗기 aria "{이름}: {verb}".
- Debug: `shop.subj(c)`, `shop.topFit()`, `hub().snug`; `hub().cyc` gone. check-shop checks the new `SHOP_TEXT` words.
- Tests: shop hubTests (named messages, pill / aria on 냥냥, halves and ←/→, `lh` once, the six subjects), myTests (row:
  roles, labels, busts = their portraits, dot, radio → pill / boxes / aria, cell messages, keys, footer 내 기록, reopening,
  `lh` note, starter on the frog), viewTests (arrows always, pill on the border, no art under it over two e2 hops with
  h9 / h5), hubFitAt (pill inside, row on one line, the message <= 2 lines, `ani` / `hint` / `hintbuy` stages, the tab row
  with 9,999 / 8,888 not snug). run-all shots `shop-hub-ani-320|844`, `shop-hub-hint-390`, `shop-hub-hintbuy-320`;
  `shop-hub-bought-900` now on the cdp runner (shot at READY: the 4 s message was gone under virtual time); the `title`
  shot dresses five animals differently.
- Accept: run-all `shop shop-fit shop-hub shop-room shop-title pwa trophies cloud-my-out ux-roomrow` **48/48 green**
  (shop 455, shop-fit-320 62, trophies 119, pwa 117). Looked at full-320, ani-320 / 844, hint-390, hintbuy-320 (2-line
  footer), bought-900, title-390.
