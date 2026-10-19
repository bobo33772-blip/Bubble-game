# 뽀득뽀득 목욕탕: 뽑기 (비누 캡슐 뽑기 in the shop) — design spec

Status: **reviewed, ready for implementation** (2026-10-19; three reviews applied, §17). It builds on `design/shop.md` as
built (read its §2-5, §8, §9 and the "As built" notes of §21 first) and on `design/looks-per-animal.md` (per-animal worn
sets), which ships first. Code is referenced by function name, because `src/game.js` is edited by other passes and line
numbers go stale.

The user asked (request B, 2026-10-19):

> 상점안에 뽑기 기능도 만들어줘

The user chose: the draw gives **special draw-only items** (10, new art) **mixed with the regular shop items**, and a
duplicate (an item already owned) **refunds part of the coins**.

Decided by the lead, and binding here:
- An item is **owned once per player** and wearable on every animal. Ownership stays shared; only wearing is per animal
  (looks-per-animal.md). This doc never changes worn sets by itself: a draw never puts anything on.
- 비누 코인 are earned **only by play**, never with money. The draw spends coins; nothing in this doc sells coins, draws or
  items, and nothing gives free draws.
- The odds are **shown openly** in the UI (확률 공개).
- A draw's result is **written to the store before any animation**: a reload never draws again.

**The contract with looks-per-animal.md** (its §0.1 says the same):

| Topic | Agreed |
|---|---|
| Store versions | `TRO_V 3` = looks (30-character `eq`, `lh`). **`TRO_V 4` = this doc** (`dn pt gd dl ds nw gs`, 5.1). One bump per feature: never one number for two schemas (an older page of the same number would strip the fields it does not know). |
| Cloud versions | `CL_V 3` = looks (30-character `eq`, slots `slotShape2`). **`CL_V 4` = this doc** (slots `slotShape3` with `dn`, `gd`; `eq` stays 30 characters). |
| Release gate | check-shop's table: store v 4 needs cloud v ≥ 4. Pass **G2 moves both** (store and cloud), so the gate holds after every pass and no deploy can carry draws into a cloud that cannot hold them. |
| Catalog policy | A new ownable catalog id is a new store and cloud version; check-shop pins `OWNABLE = {2: 40, 3: 40, 4: 50}` (draw-only ids count only from `TRO_V 4`; in G1 they exist hidden and unobtainable). |
| API names | The hub's animal is **`hubAni()`**; its set **`myLook(hubAni())`**; wearing **`lookSet(slot, id, hubAni())`**; messages **`aniSubj(c) + ' ' + done`** ("냥냥이가 입었어요"). |
| The hub | looks-per-animal.md 4.0: the preview wrapper with the name pill, two-way arrows, the footer pattern (뽑기's own button: **확률 보기**), the tab row CSS for three tabs at 320 px. |
| Draw-only items | Ordinary catalog items for everything worn: `lookParse`, the room's `lk`, the composites, the anchors and the portraits accept them with no change. Exactly 2 are 머리 items (looks 4.4's limit). |

---

## 0. Decisions in one table

| Question | Decision |
|---|---|
| Where | A **third hub tab "뽑기"**: `[상점 · 뽑기 · 마이페이지]`. The 상점 tab also shows the draw-only items in its slot grids (their cell says "뽑기", the button is "뽑기로 가기"), so the draw lives *inside* the shop as the user asked. |
| Price | **1회 뽑기 = 200 코인. 10회 뽑기 = 2,000 코인** (no discount: the cloud rules check spent coins by the draw count) and **one of the ten comes from the 희귀 · 전설 tiers**. |
| Pool | **43 items**: the 33 shop items that are not league items and not the starter, plus **10 draw-only items**. League items and the starter never come out. Draw-only items are never sold. |
| Odds (per draw, shown) | 보통 **45 %** · 고급 **34 %** · 희귀 **17 %** · 전설 **4 %**. Per item: 보통 shop 3.75 %; 고급 shop 2 %, 고급 draw-only 5 %; 희귀 shop 1 %, 희귀 draw-only 2 %; 전설 shop 0.5 %, 전설 draw-only 1 %. Draw-only items: **23 %** of normal draws. Weights in 1/10,000, sum exactly 10,000. The panel also lists every item's odds in the 10회's 희귀+ draw and in a 확정 draw. |
| Pity | **10회 안에 아직 없는 뽑기 전용 아이템 1개 확정**: a counter `pt` (draws since the last NEW draw-only item); when it reaches 9, the next draw picks among the unowned draw-only items (same 5 : 2 : 1 per-item ratio). **The account's first draw ever is such a draw.** The counter belongs to the store that drew: a sign-in that joins an account starts it at 0 (3.3). |
| Duplicate | The item stays owned once; **coins back by rarity: 보통 30 · 고급 60 · 희귀 100 · 전설 150** (all below the 200 price: never profitable). Always the full table value. |
| Done | **Every draw-only item owned = the draw is done**: both buttons read "다 모았어요!" (disabled), the line "뽑기 전용 아이템을 다 모았어요!", the sub "남은 아이템은 상점에서 사요". Past that point a draw could only bring shop items, always cheaper to buy (the last 보통 item by drawing: ≈ 27 draws, ≈ 3,850 net coins, for a 60-coin item). A new draw-only item later lifts it by itself. |
| Pace | First draw ≈ 40 min into day 1. A casual 45-min day (≈ 215 coins) = one draw; an evening with friends (≈ 425) = two. All 10 draw-only items: **≈ 63 draws on average** (p10 51, p90 75) ≈ 12,600 coins gross, ≈ 11,000 after refunds, while those draws also bring ≈ 4,000 coins' worth of shop items. Everything (40 sold + 10 draw-only) ≈ 17,400 coins ≈ 11-12 weeks at 45 min a day. A draw returns ≈ 119 coins of shop value on average (60 % of its price), so **buying a wanted shop item is always cheaper than drawing for it**. |
| RNG | `crypto.getRandomValues` (rejection-sampled, no modulo bias); `Math.random` only where there is no crypto. Tests swap in a seeded generator. |
| Commit | One `troMut` per 1 or 10 draws: coins, results, refunds, pity, draw count and a log of the batch (with its own id), **before the animation**. The animation only plays the log back. A reload mid-animation shows "지난 뽑기 결과예요". |
| Store | **`TRO_V 4`**: `dn` draws (account-wide when linked), `pt` pity (this store's), `gd` the drawn subset of `own`, `dl` / `ds` the last batch and whether it was shown, `nw` new drawn items not looked at, `gs` 뽑기 tab seen. Refunds are credited to `ce`. |
| Cloud | **Document `v 4`**. Each slot gains **`dn`** (draws, absolute) and **`gd`** (items it got by drawing, grow-only). The rules: `sp` rises by **exactly 200 × the draws counted** (+ one purchase's price, as today), at most **10 draws a write**, **at most as many new `gd` items as draws in that write**, every `gd` id from the generated, grow-only **`poolIds()`**, never a draw-only id in `o`. Refunds go up as coins earned (`ce`), under the existing rate cap. |
| Animation | Crank + drum roll → a capsule in its rarity colour drops → hops to the centre, wobbles → pops with a rarity flash → **the hub's animal wearing the item**. ≈ 1.6 s for one, 3.5 s for ten (a result grid whose capsules open in ascending rarity, the best last). 건너뛰기 or Escape skips (never in its first 0.4 s). Reduced motion: still frames, only the final knock. |
| Never | No "한 번 더 뽑기" button in the result, no timers, no limited banners, no free or daily draws, no draw tickets, no buying coins, no auto-wear. |

---

## 1. Ground truth from the code (what this builds on)

| Thing | Code | Consequence |
|---|---|---|
| Catalog | `ITEMS` (40, display order: by slot, then by price), ids `/^[hfnbe][1-9a-z]$/`; used: `h1-h9 ha hb hc`, `f1-f7`, `n1-n8`, `b1-b7`, `e1-e6`. `ITEM` map; `isItemId` needs an own key. `OPT_SPR` is built from `ITEMS` (`it_<id>`, `ic_<id>` for 효과). `SHOP_TEXT` is built from the catalog's names / descs. `retired: 1` hides an item from the 상점 grid (`hubFillShop`) but `shopBuy` / `shopCanBuy` / `shopCheapest` do not check it. | Draw-only items are **ITEMS entries** with `dr: 1` and `price: 0`: `isItemId`, `lookParse`, the worn-set digits, `clItems` and the room's `lk` accept them unchanged. Every "can be bought" test is `price > 0`. New ids: `hd he f8 f9 n9 na b8 b9 e7 e8`. G1 adds `!it.retired` to the three buy checks. |
| Store | `troMut` = read, change, write, `troSync` (other tabs follow by the `storage` event). `troParse` builds its result field by field (unknown fields are dropped); `v > TRO_V` → `'newer'` → read-only. `troLoad` writes the parsed store back at boot. `coinGive` is the only writer of `ce`, `shopBuy` the only writer of `sp`. | A batch of draws is **one** `troMut`. `TRO_V 4` is this doc's own (an older page must never parse a store with draws). Refunds become a second writer of `ce` (5.5). |
| Randomness | `troRand` already uses `window.crypto.getRandomValues` with a `Math.random` fallback. Cosmetic effects use `fxr()`. | `drawInt` follows the same pattern, with rejection sampling (5.4). Never `fxr`, never the simulation RNG. |
| Hub | `HUB`, `openHub` / `hubShow(name, opening)` (`'shop'` / `'my'`), `hubFill` (also from `troSync`), `hubTick` (main loop while the hub shows; draws every 4th frame), `hubLook`, `HUB_ARM_MS` 2.5 s (two-tap 사기; the second tap counts at once), `HUB_BUY_GUARD` 0.8 s, `hubLost`, `hubArrow` (tabs, options; selection follows focus in the 상점), the hub branch of `onKeyDown` (Escape closes). After looks L3: `hubAni()`, the preview wrapper and pill, the footer pattern, the tab-row CSS. | The 뽑기 tab reuses all of it: a third tabpanel, the same preview canvas code, the same arm (plus a 350 ms minimum, 6.4), the same guard, frame-driven animation (never timers, so tests can step it). |
| Hub width at 320 px | Measured on `shop-hub-armed-320.png` / `shop-hub-full-320.png`: 상점 tab 52 px, 마이페이지 89 px, chip "1,234" / "2,345" 73 px, row 255-256 px; tabs `padding: 0.4em 1em` (0.8em under 380 px), borders 1.5 px, panel font 14.5 px. | A third tab at today's padding wraps the chip (≈ 259 px). looks-per-animal.md 4.0's CSS (0.45em, gaps 0.2em / 0.35em) and `hubTopFit()` keep one row with a 4-digit balance. |
| Effects | `lookFx(p, c)`: memory in `p.lfx`, budgets (`G.parts` < 200 multi / 260 alone), nothing under `reducedMotion()`; `kfx` (caps at 48), `drawKfx(low)`; particles drawn as `sz`-px squares (world draw and `hubDraw`). The hub preview runs `lookFx` on a stand-in that stays in place (the floor slides back when it "walks"). | e7 draws two followers of its own (`drawDucklings`, 4.3); e8 uses particles with two new optional fields (`big`, `sw`). |
| Face art limits | `tools/check-sprites.js`: face art per frame ≤ 5×3 (profile) / ≤ 9×3 (front); every item frame has an ink pixel (`k`, or its `RIM` key) on all four sides of its opaque box; `sprites.js` f7's note: never Y next to the eye (it vanished on the duck and read as a frown). | f8 / f9 are drawn inside those limits (4.2). |
| Portraits | `lookPortrait` draws 머리 / 얼굴 / 목 only. | Unchanged; the row of six marks 등 / 효과 with a dot (looks 4.1). |
| Cloud | Slot v 2 `{…, ce, sp, o, bd, bs}`; `clMine` / `clAgg` / `clAdopt` / `clStep` / `clDirty` / `clUpload` / `clCnt` / `clZero` / `clFold` / `clCreateTx`'s `at` / `clEqOut` (known items from `o` only); one new bought item a write with exactly its price in `sp`; `ce` rises ≤ 150 a write and 30 + 1 per 2 s. `clLinkDone`'s join saves the guest store and adopts the account **into the same object** (`clAdopt` replaces t…bs, own, eq, dev only). The rules' `itemIds` / `priceOf` / `leagueNeed` are generated by `tools/check-shop.js --write`. | Draws need their own counter (`dn`) so the rules can check `sp`, and their own item list (`gd`) so the rules can tell a drawn item from a bought one (§7). Every call site that builds a slot or a link record learns `dn` / `gd`; the join resets this store's own draw state (3.3). |
| Sign-out | `clSignOut` → after 4 s still dirty → a second tap → `clSignOutNow` → `clUnlink(false)` dropped the unsaved account copy. | Fixed in looks pass **L0** (looks 6.7): the forced sign-out parks the copy; it comes back at the next sign-in. Without it, drawing offline and force-signing-out was a free re-roll. |
| Audio | `PG.Audio.sfx(name, o)`; `drum()` is an internal helper of audio.js; `VARIANTS` lists the sfx whose `o.n` picks a variant; **`uiSfx = (n) => …` drops `o`** (`troSfx` passes it). | New sfx are named `gacha_*` (never `drum`); `uiSfx` gains `o`; `VARIANTS` gains the four names (§9). |
| Page text | `final-e2e2` fails if the retired v1 title's two syllables appear anywhere in the built page (that is why e4's line was changed). | Every new string avoids them (checked in §10). |
| Net | Worn sets travel as `lk` (hi / eq / room R) and are frozen at match start. `lookParse` drops ids it does not know. | No network change, `NET_V` stays. A page without this pass shows a friend's draw-only item as bare. |

---

## 2. Constants (top constants block, after `verbOf`; `check-shop` runs the block on its own)

```js
  // ---- v4 뽑기 (비누 캡슐 뽑기, design/gacha.md): one draw costs DRAW.price coins, ten cost ten times that (no discount:
  // the cloud rules check spent coins by the draw count) and one of the ten comes from the 희귀 / 전설 tiers. Weights are
  // per item in 1/10,000 - wr by rarity for a shop item, wd for a draw-only one - and the pool adds up to exactly 10,000
  // (check-shop); league items and the starter are never in it. The weights, the pity and the refunds are what the 확률
  // 보기 panel promises: change one only together with its tests. The price never changes (the cloud counts draws, not
  // coins: a new price would be a new counter)
  const DRAW = { price: 200, ten: 10, pity: 10, refund: [30, 60, 100, 150], wr: [375, 200, 100, 50], wd: [0, 500, 200, 100], rare: 2, nw: 16, log: 10 };
  // (0 = not drawn now: league items, the starter, an item retired from the 상점)
  const drawW = (it) => (it.lg || it.rar < 0 || it.retired ? 0 : (it.dr ? DRAW.wd : DRAW.wr)[it.rar] | 0);
  // every id that is or ever was drawable - GROW-ONLY (the catalog never drops an id; retiring an item keeps it here):
  // what a list of drawn items may hold, in the store (gd), the link record and the rules (poolIds). A drawn item that
  // left this list would make every later write of its slot fail the rules
  const DRAW_IDS = ITEMS.filter((it) => !it.lg && it.rar >= 0).map((it) => it.id);    // 43 ids
  // the ids drawn NOW, by weight (drawCands and the 확률 보기 panel only)
  const DRAW_POOL = ITEMS.filter((it) => drawW(it) > 0).map((it) => it.id);          // 43 ids today, in the 상점's order
  const DRAW_ONLY = DRAW_POOL.filter((id) => ITEM[id].dr);                             // the draw-only ids drawn now (10)
  const isPoolId = (id) => typeof id === 'string' && DRAW_IDS.includes(id);
```

- `VB_ROBE = ['입기', '벗기', '입었어요', '벗었어요']` joins `VB_CAPE` / `VB_TUBE` / `VB_WING` (before `ITEMS`, which uses it).
- `GACHA_TEXT` (§10) is the last constant of the block, after `SHOP_TEXT`. `setupDOM` warms it with `SHOP_TEXT`.
- **`ITEMS` gains 10 entries**, each placed after its slot's sold items, so the catalog stays the 상점's display order:
  `hd he` after `hc`, `f8 f9` after `f7`, `n9 na` after `n8`, `b8 b9` after `b7`, `e7 e8` after `e6`.

```js
    { id: 'hd', name: '진주 이태리타올', rar: 3, price: 0, lg: 0, dr: 1, desc: '때밀이 달인도 탐내는 반짝반짝 진주빛 때수건' },
    { id: 'he', name: '딸기우유 모자', rar: 2, price: 0, lg: 0, dr: 1, desc: '목욕 끝엔 딸기우유! 빨대 꽂은 단지 모자' },
    { id: 'f8', name: '오리 잠수경', rar: 2, price: 0, lg: 0, dr: 1, desc: '주황 테에 오리 부리가 콕, 잠수 수경' },
    { id: 'f9', name: '거품 수염', rar: 1, price: 0, lg: 0, dr: 1, desc: '비누 거품으로 만든 몽실몽실 콧수염' },
    { id: 'n9', name: '냉탕 얼음 목걸이', rar: 1, price: 0, lg: 0, dr: 1, desc: '냉탕에서 건진 차가운 얼음 조각' },
    { id: 'na', name: '무지개 비누 목걸이', rar: 2, price: 0, lg: 0, dr: 1, desc: '알록달록 작은 비누를 줄줄이 꿴 목걸이' },
    { id: 'b8', name: '샴푸 제트팩', rar: 2, price: 0, lg: 0, dr: 1, at: 'B', desc: '샴푸 두 통을 등에 멘 제트팩' },
    { id: 'b9', name: '선녀 날개옷', rar: 3, price: 0, lg: 0, dr: 1, at: 'B', vb: VB_ROBE, desc: '목욕하러 내려온 선녀의 하늘하늘 날개옷' },
    { id: 'e7', name: '아기 오리 졸졸', rar: 2, price: 0, lg: 0, dr: 1, desc: '걸으면 아기 오리들이 졸졸 따라와요' },
    { id: 'e8', name: '뜨끈뜨끈 온천 기운', rar: 3, price: 0, lg: 0, dr: 1, desc: '어디서든 뜨끈한 온천 기운이 피어올라요' },
```

- `dr: 1` marks a draw-only item. `price: 0` keeps every buy path closed. `rar` is 1-3 (never 보통, never -1).
- Every test in game.js that means "can be bought" is already `price > 0`, and the starter is found by `STARTER` /
  `rar < 0`, never by its price. Two places read a price as if every item had one, and both get a `dr` branch in G3
  (6.8): `shopBtnState` and `hubGrid`'s price line under a 상점 cell.
- **Retired items (G1):** `shopBuy`, `shopCanBuy` and `shopCheapest` also require `!it.retired`. A retired sold item keeps
  its price in the rules' `itemIds` / `priceOf` (an owner's slot still lists it in `o`), and a retired drawable item
  stays in `DRAW_IDS` / `poolIds` (7.4); only `DRAW_POOL` loses it (and check-shop then fails until the weights add up to
  10,000 again and the panel's tests follow).

---

## 3. Economy

### 3.1 Price and why

- **1회 뽑기 = 200, 10회 뽑기 = 2,000.**
- 200 is one casual day (shop.md 3.7: ≈ 210-230 coins for 45 minutes) and half an evening with friends (≈ 425). Mixed with
  buying, a player draws every day or two: a treat, not the main way to get items.
- The shop items a draw returns are worth ≈ 119 coins on average (60 % of 200; 3.2). Buying the item you want is always
  cheaper than drawing for it, so the draw does not replace buying. What the draw has that the shop does not are the 10
  draw-only items — and once they are all owned, the draw closes (3.6).
- At 150 the shop value per draw would be 80 % of the price and the draw would become the cheapest way to fill the
  catalog. At 250-300 a casual player would draw once in 2-3 days at best. 200 sits between.
- **No discount on ten.** The cloud rules check spent coins as 200 × the draws counted (7.3); one price per draw keeps
  that a single multiplication. The 10회's bonus is the guaranteed 희귀+ draw (3.4) instead, which rewards saving up.

### 3.2 The pool and the odds (the table the 확률 보기 panel shows)

Weights in 1/10,000 per draw (a normal draw; 3.3-3.4 say which draws are special):

| 등급 | 상점 아이템 (each) | 뽑기 전용 (each) | 등급 합계 |
|---|---|---|---|
| 보통 | 12 × 375 = **3.75 %** | – | **45 %** |
| 고급 | 12 × 200 = **2 %** | 2 × 500 = **5 %** | **34 %** (24 + 10) |
| 희귀 | 7 × 100 = **1 %** | 5 × 200 = **2 %** | **17 %** (7 + 10) |
| 전설 | 2 × 50 = **0.5 %** | 3 × 100 = **1 %** | **4 %** (1 + 3) |
| 합계 | 33 items, 77 % | 10 items, **23 %** | **100 %** (10,000) |

- **In the pool:**
  - 보통 (12): h1 h2 h3 h4 f1 f2 n2 n3 n4 b1 e2 e1.
  - 고급 (12 + 2): h5 h6 h7 f4 f5 f6 n6 b2 b3 b4 e3 e4 + **f9 n9**.
  - 희귀 (7 + 5): h9 ha f7 n8 b5 b6 e5 + **he f8 na b8 e7**.
  - 전설 (2 + 3): b7 e6 + **hd b9 e8**.
- **Never in the pool:** the six league items (f3 n5 h8 n7 hb hc; they stay the reward of reaching a league) and the
  starter n1 (everyone has it).
- Within one rarity a draw-only item is more likely than a shop item (고급 5 % vs 2 %), so the special items come up
  often enough to feel reachable. A 고급 draw-only item is the single most likely result.
- **The 10회's 희귀+ draw** (3.4), per item: 희귀 shop 4.76 %, 희귀 draw-only 9.52 %, 전설 shop 2.38 %, 전설 draw-only 4.76 %
  (희귀 81 %, 전설 19 %). **A 확정 draw** (3.3), per item, fresh: 고급 21.7 %, 희귀 8.7 %, 전설 4.3 % (only unowned
  draw-only items; recomputed from the store). The panel lists both columns (6.5).
- Shop value per draw: 0.45 × 78.3 (보통 average) + 0.24 × 186.7 + 0.07 × 415.7 + 0.01 × 1,025 ≈ **119 coins**.

### 3.3 Pity: 10회 안에 확정

- `S.pt` counts draws since the last **new** draw-only item. Every draw that does not bring a new draw-only item adds 1, up
  to `DRAW.pity - 1` = 9; a new draw-only item (by luck or by pity) sets it to 0. A duplicate draw-only item does not
  reset it.
- **A draw is a 확정 (pity) draw** when some draw-only item is still unowned **and** (`S.pt >= 9` **or** `S.dn === 0`, the
  account's first draw ever). It picks among the **unowned draw-only items only**, by their own weights (per item 고급 5 :
  희귀 2 : 전설 1).
- So: the first draw always gives a draw-only item, and while any is missing, **no more than 10 draws pass between two new
  draw-only items** (checked over 20,000 simulated collections: the longest gap is exactly 10).
- **The counter belongs to the store that drew.** `pt` is not synced (the rules could not check it, and a merged counter
  could let one device's pity pay on another), and it never moves between stores:
  - **A sign-in that joins an account** (`clAdopt` with `join`) sets `pt 0, dl null, ds 0, nw []` in the account's copy.
    Without this, the guest store's counter was copied into the account at every join (the join adopts into the same
    object) while staying in the put-aside guest store: a player could bring the guest to `pt 9` once and then get a 확정
    draw on the account after every sign-out → sign-in — all 10 draw-only items for 10 draws (2,000 coins) instead of
    ≈ 11,000 (economy review #2).
  - A first upload (the store becomes the account's) keeps its own; a parked copy comes back with its own; the guest
    store comes back with its own.
  - A player who alternates devices progresses each device's counter separately (slower, never faster: a 20,000-run
    simulation of "always draw on the device with the higher counter" gives the same 63 draws).
- The first-draw rule uses `dn`, which **is** the account's, so signing in on a new browser never gives a second free
  확정. (One window remains: a browser that upgrades to v 4 starts with `dn 0` until its first snapshot is adopted —
  about a second online. A draw inside it is a 확정 draw the account may already have had. Accepted.)
- When every draw-only item is owned the draw is done (3.6); `pt` is not shown.

### 3.4 10회 뽑기: 희귀 이상 1개 확정

- Ten draws in one commit, 2,000 coins paid up front (refunds inside the batch do not pay for later draws of it).
- **The first draw of the ten that is not a 확정 draw comes from the 희귀 + 전설 tiers only** (all 21 items, their own
  weights: 희귀 81 %, 전설 19 %). It is draw 1, or draw 2 when draw 1 is a 확정 draw (a 확정 draw can strike at most once in
  ten draws: after it `pt` is 0).
- So a 10회 always holds at least one 희귀+ result, the pity promise is never delayed, and the two rules never collide.
- A fresh player's first 10회 holds on average 3.2 희귀+ results and **≈ 2.9 new draw-only items** (3.5 counting
  duplicates; 20,000 seeded runs).

### 3.5 Duplicates

| 등급 | Coins back | Share of the 200 price |
|---|---|---|
| 보통 | **30** | 15 % |
| 고급 | **60** | 30 % |
| 희귀 | **100** | 50 % |
| 전설 | **150** | 75 % |

- By the result's rarity, not its shop price: one rule for shop and draw-only items, and short enough to print in the
  panel. Every refund is below the price, so **no draw ever makes coins**.
- The refund goes into `ce` at once (`coinBal` rises), outside the soft cap and the day bonus (they are for play).
- **Always the full table value, never clamped.** A refund is below the 200 just paid, so the balance after a draw is
  always lower than before it: no cap can be reached. (A clamp against `COIN_MAX - coinBal(S)` used the display-capped
  balance: with cloud sums above 99,999 it gave a partial refund that `drawLogParse` then rejected, dropping the whole
  log and silently losing coins — economy review #10.)

### 3.6 Done: every draw-only item owned

| State | What happens |
|---|---|
| A whole tier owned | Nothing changes: the odds are fixed and shown; those results are duplicates and pay back. |
| **Every draw-only item owned (`drawDone(S)`)** | Both buttons: "다 모았어요!", disabled; the line: "뽑기 전용 아이템을 다 모았어요!"; the sub: "남은 아이템은 상점에서 사요". The tab still shows the machine, the collection and the odds. A later draw-only item lifts this by itself. |
| League items not reached | They are not in the pool, so they never block "다 모았어요". |

Why stop there (economy review #8): past that point every new result is a shop item that is cheaper to buy. With only h1
missing, getting it by drawing takes ≈ 26.7 draws and ≈ 3,850 net coins, for a 60-coin item: a child could burn
thousands of coins.

`drawCands` (5.3) never returns an empty list: the pool has 43 items, the 확정 list is used only when it is not empty,
and the 희귀+ list has 21.

### 3.7 Pace (20,000 simulated collections with the rules above; `drawPace` reproduces them)

| Player | Draws | Result |
|---|---|---|
| New, day 1 | the first at ≈ 200 coins, ≈ 40 min in (shop.md 3.7: 60 coins at 10 min, then 4-6 a minute + the day bonus) | **a draw-only item, guaranteed** |
| Casual, 45 min a day (≈ 215) | half the coins on draws: 15 draws in 4 weeks | ≈ 3.5 new draw-only items + ≈ 1,440 coins' worth of shop items; the other half bought ≈ 3,000 coins of chosen items |
| Evening with friends (≈ 425) | 2 draws | 2 results; a new draw-only item within ≤ 10 draws |
| Saving for 10회 뽑기 | 2,000 ≈ 9-10 casual days or ≈ 5 evenings | ≥ 1 희귀+, ≈ 2.9 new draw-only items when fresh |
| Draw-only collector | **all 10: 63 draws on average** (p10 51, median 63, p90 75, max 82) | 12,600 coins gross, ≈ 1,600 back in refunds, ≈ 11,000 net; those draws also bring ≈ 4,000 coins' worth of shop items |
| Completionist | 40 sold + 10 draw-only | ≈ 17,400 coins (draws ≈ 11,000 + the remaining shop items ≈ 4,100 + league items 2,310) ≈ **11-12 weeks** at 45 min a day; the catalog alone stays 10,450 ≈ 7 weeks |

The simulation is `drawPace` in `src/tests/gacha.js` (seeded, 13.1): it must reproduce the averages within ±5 % (63
draws, 11,000 net, 4,000 shop value, 2.9 new from a fresh 10회, 3.5 new from 15 single draws) and the gap bound exactly.

### 3.8 Integrity, anti-farming, what draws never do

- **Coins in, cosmetics out.** A draw never creates coins (refund < price), never touches trophies, holds, stakes, scores
  or play, and nothing about it is sent over the network. Practice, AFK and the soft cap are untouched: draws only spend.
- **A hold open (`TRO.s.esc`, a ranked match in another tab):** drawing is allowed, exactly as buying is (shop.md 13).
- **No re-roll on an unmodified page:**

| Way | Closed by |
|---|---|
| Reload / close mid-animation | The batch is stored before the animation (5.5); the next view shows it. |
| Draw offline, then force the sign-out (the account copy was dropped, the cloud's coins came back) | looks L0: a forced sign-out parks the unsaved copy; the next sign-in of that account restores it and pushes the draw (looks 6.7). |
| Sign-out → sign-in to re-arm the pity | The join resets the account copy's pity (3.3). |
| Two tabs drawing at once | One write may be lost — then its coins went with its results (5.6, `drawLost`). |
| Clearing the site data / editing storage while offline | Not closable in a browser game: the same class as editing localStorage (below). |

- **What a modified page can do:** pick its own results (the RNG runs in the browser), give itself items, and on the
  deploy write any pool item into its slot's `gd` for 200 coins (7.5). Only on its own account, cosmetics only. The same
  class as editing localStorage.
- **No pressure patterns.** The result has no "한 번 더" button; there are no timers, banners, streak rewards for drawing,
  free draws or tickets. The odds panel is one tap away and says that coins come only from playing.

---

## 4. The 10 draw-only items

### 4.1 Catalog

| id | 이름 | 슬롯 | 등급 | desc (shown) | verbs |
|---|---|---|---|---|---|
| hd | 진주 이태리타올 | 머리 | 전설 | 때밀이 달인도 탐내는 반짝반짝 진주빛 때수건 | 쓰기 / 벗기 |
| he | 딸기우유 모자 | 머리 | 희귀 | 목욕 끝엔 딸기우유! 빨대 꽂은 단지 모자 | 쓰기 / 벗기 |
| f8 | 오리 잠수경 | 얼굴 | 희귀 | 주황 테에 오리 부리가 콕, 잠수 수경 | 하기 / 빼기 |
| f9 | 거품 수염 | 얼굴 | 고급 | 비누 거품으로 만든 몽실몽실 콧수염 | 하기 / 빼기 |
| n9 | 냉탕 얼음 목걸이 | 목 | 고급 | 냉탕에서 건진 차가운 얼음 조각 | 하기 / 빼기 |
| na | 무지개 비누 목걸이 | 목 | 희귀 | 알록달록 작은 비누를 줄줄이 꿴 목걸이 | 하기 / 빼기 |
| b8 | 샴푸 제트팩 | 등 (B) | 희귀 | 샴푸 두 통을 등에 멘 제트팩 | 메기 / 벗기 (slot default) |
| b9 | 선녀 날개옷 | 등 (B) | 전설 | 목욕하러 내려온 선녀의 하늘하늘 날개옷 | **입기 / 벗기** (`VB_ROBE`) |
| e7 | 아기 오리 졸졸 | 효과 | 희귀 | 걸으면 아기 오리들이 졸졸 따라와요 | 켜기 / 끄기 |
| e8 | 뜨끈뜨끈 온천 기운 | 효과 | 전설 | 어디서든 뜨끈한 온천 기운이 피어올라요 | 켜기 / 끄기 |

Rarity: 고급 2, 희귀 5, 전설 3. Every slot gets two. The two 전설 worn items are a hat and a back piece (the most visible
places); the 전설 effect is the one that is always on. **Gold stays the league's:** hc (목욕탕 왕) is the only gold hat.

### 4.2 Art notes (`src/sprites.js` `IT` table; only existing palette keys; pivots as shop.md §10 and A2's conventions)

Pivots: 머리 = the brim's bottom-centre (lands on H); 얼굴 = profile: the lens interior's left pixel, front: the bridge
(lands on E); 목 = top-centre (N); 등 B = the attach pixel at the shoulder, the art reaching back and up. Items face right
(the back is the left).

| id | Size (pivot) | Look | Keys |
|---|---|---|---|
| hd | 10×6 (5,5) | A puffy **pearl-white** 이태리타올 mitt lying across the head: the open cuff at the back (left) with a green stitched band (t, T), the rounded tip at the front, a small thumb bump on the top-back. Pearly shading (W on w, i highlights, one v sheen pixel), a diagonal weave in W. **No gold, no points, no gem, no red** (hc's gold and the podium crown stay unique); a soft lump, unlike hc's dome-on-rim. Top edge ink in every column. | W w i v t T k |
| he | 8×7 (4,6) | A small round-shouldered 단지 jar in pink (P body, p shade, q base) with a white lid band held inside ink (w W), a cyan straw (c C) rising 3 px **at the back (left)** and bent backwards, a 1 px w glint on the jar. The straw's top pixel is ink. Rises 4 px above the frame top in idle 0 (lookLift 3, like h9 / ha). | P p q w W c C k |
| f8 | 9×4 (4,1) | [profile, front], inside the face limits. **Profile ≤ 5×3:** an **orange** frame (O, o lower edge, k corners) round a one-row cyan lens (c with a w glint), the B strap pixel behind; no nub. **Front ≤ 9×3:** two 3×1 lenses in O frames (centres on the eyes), the bill as **one O pixel on the bridge row**. Never Y next to the eye (f7's lesson: it vanishes on the duck). Ink on all four sides of each frame's box. | O o c w B k |
| f9 | 9×4 (4,0) | [profile, front]: a curly foam mustache on the snout, 2 rows under E. **Profile ≤ 5×3:** three i / w bumps with W shading at the front of the face. **Front ≤ 9×3:** a two-curl mustache centred under the eyes. Bumpy and wider than tall (never a round bubble). Its outline is the foam's own grey **W on all four sides** (`RIM.f9 = 'W'` in check-sprites, like f1 'q', f6 'M'): black ink would read heavy on foam. | i w W k |
| n9 | 8×4 (4,0) | A dark-blue cord (B) as **one row** from the throat to a **square 3×2 ice cube** at the bottom centre: an I / i face with a B edge and a 1 px w glint, ink rim. No c + w (bubble cyan with a white glint reads as the game's bubble), never round. | B I i w k |
| na | 10×3 (5,0) | A grey string (a) with six tiny 1×2 soap bars in R O Y t b v hanging in a shallow U (the middle two 1 px lower), ink under the bars. | a R O Y t b v k |
| b8 | 8×9 (7,3) | Two upright shampoo bottles side by side behind the back: a pink one (P, p, q) and a cyan one (c, C), each with a white pump cap (w W), a dark nozzle (d) at the bottom and **a small side fin (C / q)**; **two grey shoulder straps (a) crossing to the pivot**; ink rim. Straps and fins tell it from b4's basket at 16 px. No flames, no puff, nothing below the feet, no round shine. | P p q c C w W d a k |
| b9 | 8×10 (7,3) | A floating pastel shawl (피백) behind the shoulders in an **open S-curve**: from the pivot it rises back over the shoulder, sweeps down behind the back and flutters out at the bottom-left, a 2 px band in v → P → c with an i edge, two 1 px L sparkles near it, ink outline. **Never a closed loop** (a ring means a kit move), never round, its lowest pixel above the feet line in every frame (the b7 rule). | v V P c i L k |

Small sprites:

| Name | Size | Look | Keys |
|---|---|---|---|
| `ic_e7` | 8×8 | two tiny ducklings in a row, the front one bigger, orange bills, ink outline | Y y O w k |
| `ic_e8` | 8×8 | the ♨ hot-spring mark: three wavy steam lines (p / E) over a small round bath | p E W w k |
| `fx_duck` | 5×4 × 2 frames (stand, step) | e7's duckling: a Y body with y shade, a **k outline**, a **w eye pixel** with k beside it, an **O bill** pixel at the front; frame 1 lifts the back foot. Reads as a duckling, not as a yellow dot of P1's ground marker | Y y O w k |
| `ic_cap` | 8×8 | a small capsule (P top, w bottom, ink): the 상점's "뽑기" price line and button | P p w k |

### 4.3 The two effects (`lookFx`, shop.md 6.7's rules: cosmetic, from this screen's memory, budgets, nothing under reduced motion)

**e7 아기 오리 졸졸** (`'7'`): two ducklings that **follow** the wearer (review UX #9: a static blob spawned behind the
heel contradicted "졸졸 따라와요", sat on the feet row beside P1's yellow ground marker and vanished on the yellow 사우나
계단 arena).
- **State** (`p.lfx.dk = [{x, f}, {x, f}]`, this screen's memory, never sent): each duckling eases toward a target behind
  its leader — duckling 1 behind the wearer's heel, duckling 2 behind duckling 1 — at a spacing of 7 px, moving at most
  1.2 px a frame. The heel is `p.x + 2` (facing right) / `p.x + 13` (facing left); duckling 1's near edge stays ≥ 1 px
  outside the ground marker's 14 columns.
- **On the ground:** both stand on the wearer's feet row (`p.y + 15` is their bottom row), face the way they move, and
  waddle (frame 1 of `fx_duck` and a 1 px bob on alternate 6 f) while they move.
- **Off the ground:** they stay on the last feet row while the wearer is ≤ 8 px above it; higher (a real jump, a fall to
  another floor) they are hidden, and they reappear behind the heel on the next landing. A respawn or any move > 24 px in
  a frame (a teleport, a new 탕) puts them back behind the heel at once.
- **Drawn** by `drawDucklings(p)` in the low pass (after the tiles, before the bodies: under every animal), from
  `fx_duck`, mirrored by their facing. No particles, no `kfx`: nothing against the budgets; 2 per player by construction.
- **The hub preview:** the stand-in stays in place while "walking" (the floor slides back), so the ducklings settle at
  their spacing behind it and waddle; `hubDraw` draws them before the animal. The preview walks for `'7'` like e4 / e6.

**e8 뜨끈뜨끈 온천 기운** (`'8'`), visible on every arena (review UX #10: 1 px pastel wisps were the faintest effect in the
game, weaker than the 90-coin e1, and invisible on the white 대리석 arena and the white cat):
- **When:** always while the effect is on and the player is not dead: on the ground, walking, in the air. One wisp every
  **6 f** (`m.at`), sides alternating (`m.k++ & 1`).
- **What:** a particle `{ x: p.x + (side ? 14 : 1), y: p.y + 13 - (m.k % 3) * 2, vx: side ? 0.12 : -0.12, vy: -0.35,
  g: -0.35 * FX_KEEP, life: 24, max: 24, fd: 10, sz: 1, big: 12, sw: 6, c }`, `c` alternating **p `#ff8fb1`** and
  **E `#f3e2b4`**.
  - `big: 12`: drawn 2 px for its first 12 frames, then 1 px. `sw: 6`: drawn shifted by `((max - life) / 6 | 0) & 1` px
    (a 1 px sway every 6 f). Both are optional particle fields read by the world's particle draw and `hubDraw`'s loop.
  - The wisps start at the flanks, drift a little outward and rise about 8 px, fading over their last 10 f: they end
    beside the head, at or below `headTop(p)`, never above it.
  - Never pure white: white above the head means "me" (distinction.md). Not a ring, not a puff at the feet.
- **Caps:** ≤ 4 alive per player (24 / 6), through `put` (the `room()` budget: < 200 multi / podium, < 260 alone).
- **Not e1:** e1 is white 2 px puffs from the head, only when standing still.

`lookFx`'s comment line "Per player at most: …" gains "e7 2 ducklings (drawn, not particles), e8 4 wisps".

### 4.4 Clash checklist (shop.md 6.3 / 6.6, checked by `tools/check-sprites.js` as for A2)

- **Limits per frame** (the art's opaque box): hats ≤ 12×8, face ≤ **5×3 profile / 9×3 front**, neck ≤ 10×4, back B
  ≤ 8×10. **Every frame has an ink pixel (`k`, or its `RIM` key) on all four sides of its box**; `RIM` gains `f9: 'W'`.
  `tools/anchors.js`' `ITEM_IDS` gains the 8 worn ids so these checks run on them.
- **Hats** (hd, he): inside the 24×24 composite in every frame; ≤ 6 px above the frame top in idle 0 (both ≤ 4); top
  silhouette edge ink; no crown shape; **hd no gold (Y y L) and no red**.
- **Face** (f8, f9): on the head's row span ±1 in every frame, both frames, the twin-key rule; **no Y next to the eye**.
- **Neck** (n9, na): within the body's columns ±1; n9 no c + w pair.
- **Back** (b8, b9): behind the body, ≤ 4 px past its back edge, never below the feet line, hidden on the curled poses
  (B anchor), b9 never a closed loop.
- **No item copies a gameplay sign:** no bubble film or round shine (n9 is square), no stun stars, no rings, no
  slot-ring circle.
- **Effects:** start beside or behind the body (e7 behind the heel, clear of the marker; e8 at the flanks); never a ring;
  never white above the head; nothing under reduced motion; e8 probed on all five themes (the white 대리석 arena first).

---

## 5. Storage and the draw

### 5.1 Store fields (`TRO_V 4`, this doc's own bump)

| Field | Type / range | Meaning | Synced |
|---|---|---|---|
| `dn` | int 0..1e9, ≥ `gd.length` | draws ever made (linked: the account's sum, like `ce`) | yes, as the slot's `dn` |
| `pt` | int 0..9 | draws since the last new draw-only item (the pity) | no (this store's, 3.3) |
| `gd` | ids, ⊆ `own`, `DRAW_IDS` only, no duplicates, `own`'s order | the owned items that came from a draw. **Every owned draw-only id is in it.** Used only to tell the cloud which items were drawn (§7) | yes, as the slots' `gd` |
| `dl` | `null` or `{ id, n, r: [[id, ref, k] × 1..10] }` | the last batch: `id` its own 6-character id, `n` = `dn` after it; per result the pool id, the refund (0 or `DRAW.refund[rarity]`), the kind (0 normal, 1 확정, 2 the 10회's 희귀+ draw) | no |
| `ds` | int 0..1e9 | the `n` of the last batch whose result was shown (`dl.n > ds`: not shown yet) | no |
| `nw` | ids ⊆ `own`, ≤ 16, newest last | drawn items not looked at yet (the NEW dots) | no |
| `gs` | 0/1 | the 뽑기 tab shown once (its tab dot) | no |

- **Fresh** (`troFresh`): `dn 0, pt 0, gd [], dl null, ds 0, nw [], gs 0`.
- **Migration** (v 1, 2 and 3 read as v 4): no draws, the same defaults; the looks fields as looks 2.2 says. Lossless,
  written back as v 4 by `troLoad` at boot. An older page (v 3, the looks release) then sees `'newer'` and turns
  read-only — it can never strip `dn` / `gd` / `pt` / `dl` (an L-era page writing a G-era store would have reset `dn` to 0,
  re-arming the first-draw 확정, and lost the `gd` marks, so drawn shop items would count as bought in the cloud).
- `own` stays **everything owned** (bought, drawn, synced). Every existing ownership check keeps working with no change.

### 5.2 `troParse` (v 4 additions)

```js
  //   if ((o.v !== 1 && o.v !== 2 && o.v !== 3 && o.v !== TRO_V) || ...dev check...) return null;   (TRO_V 4; v > 4: 'newer')
  //   ... v 1-3 fields as today (looks 2.2); own as today (draw-only ids are catalog ids: kept) ...
  // (gacha, design/gacha.md 5.1: dn the draws, pt the pity, gd the drawn subset of own - every owned draw-only id is in it -,
  // dl / ds the last batch and whether it was shown, nw new drawn items, gs the 뽑기 tab seen; a store below v 4 has none)
  const gd0 = Array.isArray(o.gd) ? o.gd : [];
  out.gd = own.filter((id) => isPoolId(id) && (ITEM[id].dr || gd0.includes(id)));
  out.dn = Math.max(I(o.dn, 1e9), out.gd.length);          // (a hand edit or a debug set never leaves gd larger than dn: the rules refuse that)
  out.pt = I(o.pt, DRAW.pity - 1);
  out.dl = drawLogParse(o.dl, out.dn);
  out.ds = Math.min(I(o.ds, 1e9), out.dn);
  out.nw = Array.from(new Set((Array.isArray(o.nw) ? o.nw : []).filter((id) => isItemId(id) && own.includes(id)))).slice(-DRAW.nw);
  out.gs = o.gs ? 1 : 0;
  // the last batch: an id, 1..10 results [pool id, refund 0 / DRAW.refund[rarity], kind 0..2], n within 1..dn; else null
  function drawLogParse(x, dn) {
    if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !ID6_RE.test(x.id) || !Array.isArray(x.r) || !x.r.length || x.r.length > DRAW.log) return null;
    const n = nInt(x.n, 0, 1e9, 0); if (n < 1 || n > dn) return null;
    const r = [];
    for (const e of x.r) {
      if (!Array.isArray(e) || !isPoolId(e[0])) return null;
      const ref = e[1] | 0, k = e[2] | 0;
      if ((ref !== 0 && ref !== DRAW.refund[ITEM[e[0]].rar]) || k < 0 || k > 2) return null;
      r.push([e[0], ref, k]);
    }
    return { id: x.id, n, r };
  }
```

`PG.debug.tro.set`, the guest key, the parked copies and the cloud's whole-store copies all go through `troParse`, so they
migrate the same way.

### 5.3 The pure draw (`drawCands`, PG.debug.draw.cands runs it)

```js
  // the candidates of the next draw, pure: [[id, weight] ...] and its kind - 1 a 확정 draw (an unowned draw-only item:
  // some is missing and pt reached 9, or this account never drew), 2 the 10회's 희귀+ draw (rare: it is still owed),
  // 0 a normal draw (the whole pool). Never empty
  function drawCands(own, pt, dn, rare) {
    const un = DRAW_POOL.filter((id) => ITEM[id].dr && !own.includes(id));
    if (un.length && (dn === 0 || pt >= DRAW.pity - 1)) return { k: 1, L: un.map((id) => [id, drawW(ITEM[id])]) };
    if (rare) return { k: 2, L: DRAW_POOL.filter((id) => ITEM[id].rar >= DRAW.rare).map((id) => [id, drawW(ITEM[id])]) };
    return { k: 0, L: DRAW_POOL.map((id) => [id, drawW(ITEM[id])]) };
  }
  // one weighted pick from a candidate list (drawInt over the list's total)
  function drawPick(L) { let r = drawInt(L.reduce((s, e) => s + e[1], 0)); for (const e of L) { r -= e[1]; if (r < 0) return e[0]; } return L[L.length - 1][0]; }
  // the draw is done once every draw-only item is owned (3.6)
  const drawDone = (S) => !!S && DRAW_ONLY.every((id) => S.own.includes(id));
```

### 5.4 The random numbers

```js
  // a uniform integer in [0, n), 1 <= n <= 10,000: crypto.getRandomValues with rejection sampling (2^32 is not a multiple
  // of n: the top sliver is drawn again, so no result is favoured); Math.random only where there is no crypto (old
  // browsers, some test hosts). PG.debug.draw.rng(fn) puts a test generator ([0, 1)) in front of both
  const DRAW_T = { rng: null };
  function drawInt(n) {
    n = Math.max(1, n | 0);
    if (DRAW_T.rng) return clamp(Math.floor(DRAW_T.rng() * n), 0, n - 1);
    try {
      const b = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n;
      for (let i = 0; i < 16; i++) { window.crypto.getRandomValues(b); if (b[0] < lim) return b[0] % n; }
    } catch (e) { /* no crypto: below */ }
    return Math.floor(Math.random() * n);
  }
```

### 5.5 `drawCommit(n)`: everything in one write, before the animation

```js
  // n draws (1 or DRAW.ten) in ONE troMut on the store as it is NOW: the coins (sp + 200 a draw), every result (new: own,
  // gd, nw; a duplicate: its full refund into ce), the pity, the draw count and the batch's log with its own id - so a
  // reload, a closed tab or a crash after this never draws again and never loses a result. The animation only plays
  // res back. Returns {ok: true, id, res: [{id, ref, k, dup}], now, n} or {ok: false, why: 'ro' | 'bad' | 'done' | 'poor', need}
  function drawCommit(n) {
    if (TRO.ro || !TRO.s || (n !== 1 && n !== DRAW.ten)) return { ok: false, why: TRO.ro ? 'ro' : 'bad' };
    return troMut((S) => {
      if (drawDone(S)) return { ok: false, why: 'done' };
      const cost = DRAW.price * n, bal = coinBal(S);
      if (bal < cost) return { ok: false, why: 'poor', need: cost - bal };
      const res = []; let rare = n === DRAW.ten;
      for (let i = 0; i < n; i++) {
        const c = drawCands(S.own, S.pt, S.dn, rare), id = drawPick(c.L), it = ITEM[id], dup = S.own.includes(id);
        const un = DRAW_ONLY.some((q) => !S.own.includes(q));
        if (c.k === 2) rare = false;
        S.dn = Math.min(1e9, S.dn + 1); S.sp = Math.min(1e9, S.sp + DRAW.price);
        let ref = 0;
        if (dup) { ref = DRAW.refund[it.rar]; S.ce = Math.min(1e9, S.ce + ref); }
        else { S.own = S.own.concat([id]); S.gd = S.gd.concat([id]); S.nw = S.nw.filter((q) => q !== id).concat([id]).slice(-DRAW.nw); }
        if (it.dr && !dup) S.pt = 0; else if (un) S.pt = Math.min(S.pt + 1, DRAW.pity - 1);
        res.push({ id, ref, k: c.k, dup });
      }
      S.dl = { id: troRand(6), n: S.dn, r: res.map((r) => [r.id, r.ref, r.k]) };
      return { ok: true, id: S.dl.id, res, now: coinBal(S), n: S.dn };
    }) || { ok: false, why: 'bad' };
  }
```

- `coinGive` stays the only writer of **earned** coins; `drawCommit` is the second writer of `ce`, refunds only. `shopBuy`
  and `drawCommit` are the writers of `sp`. The comment at `coinGive` says so.
- A drawn item is **never worn by the draw** (with per-animal sets, putting a random result on an animal would undo an
  outfit the player chose).
- `troSync` runs once for the whole batch. The hub hides what changed until the reveal (6.6).
- `lookOut` is **not** called: a draw changes no worn set.

### 5.6 Two tabs, holds, blocked storage, read-only, lost writes, store swaps

| Case | Behaviour |
|---|---|
| Two tabs | Each batch re-reads the store (`troMut`). The other tab's `storage` event refreshes its coin chip, pity line and collection at once, with **no animation** (only the drawing tab animates). An armed button there re-checks the balance at its second tap ('poor' → "{n}개 더 모아요"). |
| Two tabs writing at the same moment | The shop.md 13 limit: one of two writes within milliseconds can be lost. `drawLost()` (beside `hubLost`) runs at the `storage` event: this tab remembers the batch it committed (`HUB.draw.mine = {id, at, n, newIds}`); within 5 s of it, if the store's `dl.id` is no longer that id **and** (the store's `dn` is below that `n`, or one of that batch's new items is not owned), the batch is gone — with its coins, both reverted together. The result view closes and `#pg-gacha-line` says "뽑기가 저장되지 않았어요 · 코인은 그대로예요" (the sr region too). A lost batch of duplicates only changes nothing the player owns (its coins and refunds went with it); the view closes on `dn` alone. |
| A hold open (`esc`) | Drawing allowed (3.8). |
| Blocked storage (`TRO.mem`) | Draws work for the session; the first tap that arms a draw shows "이 브라우저에서는 저장되지 않아요" in `#pg-gacha-line` (too long for the 82 px footer). |
| Read-only (`'newer'`) | `drawCommit` refuses; one button "이 브라우저에서는 저장되지 않아요", disabled. |
| The hub closes mid-animation (닫기, a game start from the room) | The result is in the store; `ds` is unchanged, so the next time the 뽑기 tab shows, it opens on the result view with "지난 뽑기 결과예요" (no animation). |
| Sign-in that joins | The account's copy: `pt 0, dl null, ds 0, nw []` (3.3); `dn`, `own`, `gd` the account's. |
| Sign-out | The browser's own store comes back with its own draws, pity, items and log; a forced sign-out with unsaved draws parks the account copy (looks 6.7). A log whose new items are gone is skipped (6.7). |

---

## 6. UI (Korean)

### 6.1 Where: a third hub tab

- **`[상점 · 뽑기 · 마이페이지]`**, 뽑기 next to 상점 because it is part of the shop. The title's 상점 button still opens
  the 상점 tab; the trophy badge and the room's 꾸미기 still open 마이페이지.
- **Not a sixth slot tab inside the 상점.** The slot row is a "부위" tablist that drives the item grid and the buy button;
  a gacha there would swap the whole top row and hide the feature behind a 40 px button. The 상점 still shows the
  draw-only items in its grids, with a way to the 뽑기 tab (6.8). That is the "inside the shop" part.
- **The hub layout is looks-per-animal.md 4.0** (one layout for three tabs): the tab row CSS at ≤ 380 px and
  `hubTopFit()`, `.pg-tabs [role="tab"] { position: relative }` (so this tab's dot sits on it), the preview wrapper and
  pill, the footer pattern (here: `[message][확률 보기][닫기]`). The tablist label and the sr h2 become "상점, 뽑기, 마이페이지".

### 6.2 Markup (inside `#pg-hub`, between the 상점 and 마이페이지 panels)

```html
<button type="button" role="tab" id="pg-tab-draw" data-hub="draw" aria-selected="false" aria-controls="pg-hub-draw" tabindex="-1">뽑기<i id="pg-tab-draw-new" class="pg-tro-new" hidden></i></button>

<div id="pg-hub-draw" class="pg-hub-pane" role="tabpanel" aria-labelledby="pg-tab-draw" hidden>
  <div class="pg-shop-top">
    <div class="pg-look-wrap">
      <button id="pg-gacha-view" class="pg-look-view" type="button" tabindex="-1" aria-hidden="true"><canvas width="32" height="32"></canvas></button>
      <span class="pg-look-name" aria-hidden="true" hidden></span>
    </div>
    <div class="pg-shop-info">
      <p class="pg-shop-name"><b id="pg-gacha-name">비누 캡슐 뽑기</b><i id="pg-gacha-rar" class="pg-rar"></i></p>
      <p id="pg-gacha-line" class="pg-gacha-line"></p>      <!-- the pity line / a status that does not fit the footer -->
      <p id="pg-gacha-sub" class="pg-shop-desc"></p>        <!-- 10회 뽑기는 희귀 이상 1개 확정 / a desc / the batch line -->
    </div>
  </div>
  <div class="pg-gacha-btns">
    <button id="pg-gacha-one" class="pg-btn pg-gacha-btn" type="button"></button>
    <button id="pg-gacha-ten" class="pg-btn pg-gacha-btn" type="button"></button>
    <button id="pg-gacha-skip" class="pg-btn pg-ghost pg-small" type="button" hidden>건너뛰기</button>
  </div>
  <p id="pg-gacha-h" class="pg-gacha-h">뽑기 전용 아이템 <b id="pg-gacha-cnt">0/10</b></p>   <!-- "뽑기 결과" in the ten-result view -->
  <div id="pg-gacha-odds" class="pg-gacha-odds" hidden><!-- 6.5 --></div>
  <div id="pg-gacha-grid" class="pg-items pg-items10" role="listbox" aria-labelledby="pg-gacha-h"></div>
  <p id="pg-gacha-sr" class="pg-sr" role="status" aria-live="polite"></p>      <!-- the reveal's announcement (6.7) -->
</div>
<!-- the footer (looks 4.0): <button id="pg-gacha-odds-btn" class="pg-btn pg-ghost pg-small" type="button" aria-expanded="false"
     aria-controls="pg-gacha-odds" hidden>확률 보기</button> before 닫기, shown on 뽑기 only -->
```

- **No head row** above the grid (review UX #6: a 40-44 px row of its own made the 2x and 320 budgets tight): the count is
  the caption line `#pg-gacha-h` (≈ 16 px, 0.82em, cream-dim; the number in duck), and 확률 보기 is the footer's ghost
  button, the way 내 기록 is on 마이페이지.
- The two draw buttons sit in their own full-width row (each `flex: 1 1 0`, max 15em), not in the info column: at 320 px
  the info column is ≈ 148 px, too narrow for "10회 뽑기" with a 4-digit price. 건너뛰기 is a small ghost button at the
  **right end** of that row, shown only while the animation runs (the draw buttons hidden then): a third impatient tap on
  1회 뽑기's spot hits nothing.
- **The 10-cell grids** (`.pg-items10`: the collection, the ten results): five columns, two rows —
  `grid-template-columns: repeat(5, minmax(44px, 56px)); justify-content: start;` — and one row of ten where the card's
  inner width is ≥ 494 px (`.pg-hub-card { container: hubcard / inline-size }`,
  `@container hubcard (min-width: 494px) { .pg-items10 { grid-template-columns: repeat(10, minmax(44px, 1fr)); } }`). The
  auto-fill grid would put 9 + 1 at 2x (inner ≈ 478 px).
- Gaps: the buttons row `margin: 0.6em 0 0.45em`; the caption `margin: 0 0 0.3em`; the grid's own 6 px.
- Every visible string comes from `GACHA_TEXT` (§10).

### 6.3 The machine view (the tab's resting state)

**The canvas** (`#pg-gacha-view`, 32×32 at 96 px; the same backdrop as `hubDraw`: tub tiles, floor line on row 31):
- **Nothing selected: the machine.** `gacha` (20×28) at **(4, 3)**, so it stands on the feet row 30 with the floor line
  under it; its crank `gacha_h` at (24, 14). Idle: one capsule in the dome shifts 1 px every 30 f (none under reduced
  motion). The canvas is decoration here: `tabindex="-1"`, `aria-hidden="true"`, no pill, no arrows; a tap does nothing.
- **An animal shown** (a collection cell selected, or the result view): **the hub's animal** wearing its set with the item
  tried on (as the 상점 preview does, effects playing), **the name pill** and the two-way arrows (looks 4.2). The canvas is
  then a button, `tabindex="0"`, aria-label `"{이름} · 눌러서 다른 동물로"`; a tap on its left / right half shows the
  previous / next animal — the same meaning as in the other tabs (review UX #18).
- **Deselecting** (back to the machine): tap the selected cell again, or 확인 in the result view.

**The info column** (first match):

| State | Name line | Line (`#pg-gacha-line`, duck colour, bold) | Sub (`#pg-gacha-sub`, cream-dim) |
|---|---|---|---|
| Animating | 비누 캡슐 뽑기 | 두근두근… | (as before the draw) |
| A collection cell selected | item name + rarity chip | "뽑기 확률 5%" (+ " · 가지고 있어요") | its desc |
| Every draw-only item owned (`drawDone`) | 비누 캡슐 뽑기 | 뽑기 전용 아이템을 다 모았어요! | 남은 아이템은 상점에서 사요 |
| `S.dn === 0` | 비누 캡슐 뽑기 | 첫 뽑기는 뽑기 전용 아이템 확정! | 10회 뽑기는 희귀 이상 1개 확정 |
| `S.pt === 9` | 비누 캡슐 뽑기 | 다음 뽑기에 뽑기 전용 아이템 확정! | 10회 뽑기는 희귀 이상 1개 확정 |
| otherwise | 비누 캡슐 뽑기 | {10 − pt}회 안에 뽑기 전용 아이템 확정 | 10회 뽑기는 희귀 이상 1개 확정 |

A status too long for the footer (`drawLost`, blocked storage on arming) replaces the line for 4 s.

**The collection** (`#pg-gacha-grid`, the 10 draw-only items in catalog order; the caption counts the owned ones: "3/10"):
- Cells are the 상점's (`hubGrid` with a new mode `'draw'`): the art at its largest scale in the 36×28 canvas, the rarity
  border (전설 shimmer), the NEW dot (6.9).
- The line under the art: the **per-item odds** "5%" (cream-dim) when not owned, the check (`ready`) when owned.
- aria-label: "선녀 날개옷 · 전설 · 뽑기 확률 1%" (+ " · 가지고 있어요").
- Tapping a cell selects it (above); tapping the selected cell deselects; arrows move the selection like the 상점's grid.

### 6.4 The two buttons and their states

Each button has two lines: the action (1em, bold) over its price (0.8em, the coin icon + number). Primary duck colour,
pink when armed; disabled states use `aria-disabled` (the focus stays), as `#pg-shop-buy`.

| State | `#pg-gacha-one` | `#pg-gacha-ten` | Tap |
|---|---|---|---|
| Ready | 1회 뽑기 / [coin]200 | 10회 뽑기 / [coin]2,000 | the first tap **arms** that button for 2.5 s (`HUB_ARM_MS`): label "한 번 더 누르면 뽑아요", pink, sfx `arm`, and `hubMsg('한 번 더 누르면 뽑아요')` so the polite live region says it; arming one disarms the other |
| Armed | 한 번 더 누르면 뽑아요 | (same) | a second tap **≥ 350 ms** after arming and within 2.5 s: `drawCommit(n)` → the animation (6.6). A tap sooner is ignored (stays armed): a phone's double-tap (two clicks 100-200 ms apart) must not spend 2,000 coins. A tap after 2.5 s arms again |
| Not enough coins | 1회 뽑기 / price dimmed | 10회 뽑기 / price dimmed | disabled; a tap says "{n}개 더 모아요" in the message line. aria-label "1회 뽑기 · 200코인 · 150개 더 모아요" |
| Done (`drawDone`) | 다 모았어요! | 다 모았어요! | disabled |
| Read-only store | 이 브라우저에서는 저장되지 않아요 (one button spanning the row; the other hidden) | | disabled |
| Animating | hidden; **건너뛰기** at the right end | hidden | skips (6.6) |
| Result view | **확인** (ghost) | **지금 {on}** (primary) / **{off}** (ghost) once worn | 6.7 |

- aria-labels when ready: "1회 뽑기 · 200코인", "10회 뽑기 · 2,000코인 · 희귀 이상 1개 확정".
- `drawCommit` refusing at the second tap (another tab spent the coins, or got the last draw-only item): "{n}개 더 모아요"
  / "다 모았어요!"; nothing animates.
- A held Enter / Space never presses twice (the existing `e.repeat` rule of the hub branch).

### 6.5 확률 보기 (`#pg-gacha-odds`, toggled by the footer's `#pg-gacha-odds-btn`; `aria-expanded`; the label becomes "확률 닫기")

Built from `DRAW`, `DRAW_POOL` and `drawCands` at fill time, never typed by hand, so the panel cannot drift from the code.
Opening it scrolls it into view (the hub may scroll while it is open; the resting state is what must fit, 6.11).

```html
<table class="pg-odds">
  <caption>뽑기 1회의 확률</caption>
  <thead><tr><th scope="col">등급</th><th scope="col">합계</th><th scope="col">아이템 1개</th></tr></thead>
  <tbody>
    <tr><th scope="row">보통</th><td>45%</td><td>상점 아이템 12종 · 각 3.75%</td></tr>
    <tr><th scope="row">고급</th><td>34%</td><td>뽑기 전용 2종 · 각 5%<br>상점 아이템 12종 · 각 2%</td></tr>
    <tr><th scope="row">희귀</th><td>17%</td><td>뽑기 전용 5종 · 각 2%<br>상점 아이템 7종 · 각 1%</td></tr>
    <tr><th scope="row">전설</th><td>4%</td><td>뽑기 전용 3종 · 각 1%<br>상점 아이템 2종 · 각 0.5%</td></tr>
  </tbody>
</table>
<ul class="pg-odds-rules">
  <li>첫 뽑기는 뽑기 전용 아이템 확정</li>
  <li>10회 안에 아직 없는 뽑기 전용 아이템 1개 확정 (고급 : 희귀 : 전설 = 5 : 2 : 1 비율로)</li>
  <li>10회 뽑기 중 1개는 희귀·전설 중에서 나와요 (희귀 81% · 전설 19%)</li>
  <li>이미 있는 아이템이 나오면 코인을 돌려받아요: 보통 30 · 고급 60 · 희귀 100 · 전설 150</li>
  <li>리그 아이템과 처음 선물은 나오지 않아요 · 뽑기 전용 아이템은 상점에서 팔지 않아요</li>
  <li>뽑기 전용 아이템을 다 모으면 뽑기가 끝나요</li>
  <li>비누 코인은 게임을 해야만 모여요</li>
</ul>
<details class="pg-odds-all"><summary>아이템별 확률</summary>
  <table><!-- 43 rows in pool order: [the item's 16 px picture] 이름 · 등급 (+ a "뽑기 전용" chip) | 보통 뽑기 | 희귀 이상 뽑기 | 확정 뽑기 -->
  </table>
</details>
```

- **Per item, three columns** (review UX #23): a normal draw; the 10회's 희귀+ draw (e.g. 희귀 shop 4.76 %, 희귀 draw-only
  9.52 %, 전설 shop 2.38 %, 전설 draw-only 4.76 %; "–" for 보통 / 고급); a 확정 draw **for this store now** (only unowned
  draw-only items; "–" elsewhere; the column reads "다 모았어요" when none is missing).
- Percentages: `(w / total * 100).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + '%'`. The 81 / 19 % and the
  5 : 2 : 1 ratio are computed too.

### 6.6 The animation (frame-driven by `hubTick`; drawn every 2nd frame while it runs)

`HUB.draw.anim = { n, res, f0, best, order, before: {own, dn, pt, bal} }` is set right after `drawCommit` succeeds.
- **No spoilers.** Until the reveal, the 뽑기 tab draws from `before`: the collection keeps its old checks, the pity line
  says "두근두근…", and the coin chip shows `before.bal - price × n` (the refunds count up at the reveal, like the
  purchase's 0.4 s chip count; `hubTick`'s `coin` at its end).
- Frames `t = HUB.f - f0`. Capsule colours: the `cap` frame by the result's rarity (보통 cream, 고급 green, 희귀 violet,
  전설 gold). A capsule's `y` is its **top row**.

**One draw (reveal at t = 96, ≈ 1.6 s):**

| t | Canvas | Sound |
|---|---|---|
| 0-35 | the crank turns once (`gacha_h` frames 0-3, 9 f each); the dome's capsules jiggle ±1 px every 4 f | `gacha_roll` (n 0) at 0 |
| 36-51 | a capsule (6×6, x 5) slides out of the chute: y 21 → **25** (gravity 0.3, one 1 px bounce), resting on the feet row (rows 25-30) | `gacha_drop` (n 0, with its bounce) at 44 |
| 52-63 | it **hops to the centre**: an arc from (5, 25) to (13, 16) | – |
| 64-83 | it wobbles ±1 px every 4 f; a draw-only result also blinks two white `cross` sparkles beside it (a hint) | – |
| 84 | **pop**: the top half (`cap_t`) flies up-left (vx −0.6, vy −1.4, g 0.15), the bottom (`cap_b`) down-right, 12 f; the canvas flashes the rarity colour (alpha 0.6 for 2 f, fading over 6 f) | `gacha_pop` (n 0) |
| 86-95 | 희귀 / 전설: 8 one-pixel rays from the capsule's centre (16, 19) in the rarity colour, 6 → 12 px long (inside the canvas), dashes alternating every 4 f; 전설 adds 4 `cross` sparkles | – |
| 96 | **reveal**: the canvas cuts to the hub's animal wearing its set with the result tried on (`hubSpark`), with its pill; the result view (6.7) fills in; `#pg-gacha-sr` speaks | new 희귀: `gacha_win` n 2 · new 전설: n 3 · new 보통 / 고급: `buy` · duplicate: none (the chip's `coin` at the end of its count-up) |

**Ten draws (reveal at t = 210, ≈ 3.5 s):**
- 0-47: the crank turns twice (`gacha_roll` n 1).
- 48-107: ten capsules leave the chute one every 6 f and **roll off the canvas to the left** along the feet row
  (−1.5 px/f): ten do not fit a 32 px chute. `gacha_drop` n 1 (no bounce) for the first nine, n 0 (with its bounce) for
  the last (a bounce 90 ms after a drop would land 10 ms before the next one: a flam on every capsule).
- 108: the result view opens with the **results grid** (6.7): ten cells, each a closed capsule (`cap` at 4x) in its
  rarity colour.
- 108-207: every 10 f the next cell opens **in ascending rarity** (ties: draw order; the stored order is unchanged):
  its art, NEW dot or refund line; the cell flashes its rarity colour for 300 ms (`is-flash`); `gacha_pop` with `n = i`,
  so the pitch climbs to the best capsule, opened last.
- 210: the top row shows the **best** result (highest rarity; among equals a new item first, then the first drawn) on the
  hub's animal, selected in the grid; the final sound as for one draw, by that best result (all duplicates: none).

**Skipping:** the 건너뛰기 button, Escape (the hub branch of `onKeyDown` checks `HUB.draw.anim` first), or a tap on the
results grid jump to the reveal frame: everything open at once, only the final sound. **Skip input is ignored for the
first 24 f** (0.4 s): the tap that confirmed the draw may land twice. The canvas does not skip (it shows no animal until
the reveal; 6.3).

**Switching tabs during the animation** (a tap on 상점 / 마이페이지): jumps to the revealed state silently (no sound;
`ds` written, the live region speaks), then switches; coming back to 뽑기 shows the result view until 확인.

**Reduced motion (`reducedMotion()`):** no jiggle, wobble, hop, flying halves, rays, sparkles or cell flashes.
- One draw: the machine with the crank at frame 1 and the capsule resting at (5, 25), still, for 24 f, then the reveal.
- Ten draws: 24 f still, then the reveal with every cell open.
- Sound: only the roll's final knock (`gacha_roll` n 2) and the reveal's sound (the 0.6-0.8 s roll would overlap it).

**Leaving:** `hubShut` (the hub closes, a game starts, the room goes away) drops `anim`; the batch is already stored and
`ds` is not set, so the result shows next time (5.6).

### 6.7 The result view

At the reveal `ds = dl.n` is written (one `troMut`), and `HUB.draw.view = 'res'`. For **0.8 s after the reveal**
(`DRAW_GUARD`, like `HUB_BUY_GUARD`) taps on the result buttons, **the canvas and the results grid** are ignored: the hand
that tapped 1회 뽑기 twice may tap again, and those spots now change the animal or the selection.

| Part | One draw | Ten draws |
|---|---|---|
| Canvas | the hub's animal wearing its set + the result (effects play), the pill; a tap on a half cycles the animal | the selected result on the hub's animal |
| Name line | name + rarity chip | the same, for the selected result |
| `#pg-gacha-line` | new: "새 아이템!" (duck colour); duplicate: "이미 있어요 · 코인 +60" (coin pink) | the same, for the selected result |
| `#pg-gacha-sub` | its desc; a 확정 result adds "뽑기 전용 확정!" before it, the 희귀+ draw "희귀 이상 확정" | the batch line: "새 아이템 6개 · 코인 +150" / "새 아이템 10개" / "모두 이미 있어요 · 코인 +420", then the selected desc |
| Buttons row | **확인** (ghost) · **지금 {on}** (primary) | the same, for the selected result |
| Below | the caption "뽑기 전용 아이템 n/10" and the collection grid (the new item's cell selected, with its NEW dot) | the caption **"뽑기 결과"** and the ten result cells (5 × 2 at 320-844 px). Each: the art, the rarity border, a NEW dot when new, the refund "+60" in coin pink on the price line when duplicate |

- **The results grid is keyed by position (0-9), not by id**: one batch can hold the same item twice (a new one, then
  its duplicate). It is its own small builder (`drawResGrid`) with the 상점 cell's look, not `hubGrid`.
- **지금 {on}** (`verbOf(it).on`: 지금 쓰기 / 하기 / 메기 / 입기 / 켜기): wears the selected result **on `hubAni()`** with
  `lookSet(it.slot, id, hubAni())`; sfx `equip`; message **`aniSubj(hubAni()) + ' ' + done`** ("냥냥이가 입었어요"; ≤ 12
  syllables: it fits the footer); the button then becomes **{off}** (a take-off, ghost, `lookSet(slot, null, hubAni())`,
  "냥냥이가 벗었어요") as in the 상점. Cycling the animal re-evaluates it. aria-label `"{이름}: 지금 {on}"` /
  `"{이름}: {off}"`.
- **확인** returns to the machine view (the selection cleared, focus on 1회 뽑기).
- **No "한 번 더 뽑기".** The draw buttons come back only with 확인.
- **"지난 뽑기 결과예요":** when the tab opens and `dl.n > ds` (not shown yet: a reload or a close mid-animation), it opens
  straight on the result view of `dl` with this line in place of the batch line, no animation, and sets `ds`. If any
  "new" result of `dl` is not owned any more (the store was replaced by a sign-in or a sign-out), it skips that and just
  sets `ds`.
- **The announcement** goes to `#pg-gacha-sr` (visually hidden, role status) once, at the reveal — it is too long for the
  82 px footer, and the result view shows the same visibly: one draw "새 아이템! 선녀 날개옷 · 전설" / "이미 있어요 ·
  거품 수염 · 코인 60개 돌려받았어요"; ten "10회 뽑기 결과: 새 아이템 4개, 코인 210개 돌려받았어요". Each result cell's
  aria-label: "진주 이태리타올 · 전설 · 새 아이템" / "샤워캡 · 보통 · 이미 있어요 · 코인 +30".

### 6.8 In the 상점 tab: the draw-only items in their slot grids

- `hubFillShop`'s grid shows every item of the slot, draw-only ones included, after the sold ones (catalog order). A slot
  grows to at most 14 items (머리): 3 rows at 320 px as today (5 a row), 3 rows at 390 px (was 2; the 390×844 budget has
  the room).
- **A draw-only cell:** the price line is the 8×8 `ic_cap` capsule + "뽑기" (cream, never dimmed as poor); the rest as any
  cell (owned check, worn ring for `hubAni()`, NEW dot). aria-label "진주 이태리타올 · 전설 · 뽑기에서만 나와요"
  (+ " · 가지고 있어요").
- **Selecting it:** the preview tries it on (`hubLook` already tries on any unowned item); `shopBtnState` returns
  `{ k: 'draw' }` for an unowned `dr` item, checked before the league test.
  - Label: [`ic_cap`] **"뽑기로 가기"**, mint (like the title's 상점 button), never disabled. aria-label
    "뽑기에서만 나와요 · 뽑기로 가기".
  - Tap: `hubShow('draw')` with that item selected in the collection (its try-on on the 뽑기 canvas); keyboard / mouse:
    the focus moves to that collection cell.
- Owned draw-only items behave as owned items in the 상점 (wear / take off on `hubAni()` with their verbs).
- `shopCheapest`, `shopCanBuy`, the 상점 dot and the first card's goal ignore draw-only items (`price > 0`).

### 6.9 Dots: NEW items, the tab, the title button

- **NEW dot** (`.pg-item-nw`, the pink `.pg-tro-new` dot at a cell's top-left; the check stays top-right): on cells of
  items in `S.nw`, in the 상점, 마이페이지, the 뽑기 collection and the result grid. aria-label gains " · 새 아이템".
  - An id leaves `nw` when its cell is selected (상점 / 뽑기 / 결과) or tapped in 마이페이지, or when it is worn (in the
    same `troMut`).
  - The 마이페이지 tab shows the dot while `nw` is not empty; an equipment box shows it while `nw` holds an item of its slot.
- **The 뽑기 tab dot** (`#pg-tab-draw-new`, positioned on its tab: looks 4.0): while `!S.gs`. Showing the tab sets `gs = 1`.
- **The title's 상점 button:** its NEW-dot rule (shop.md 9.1) gains "or `!S.dn && coinBal(S) >= DRAW.price && !S.gs`"
  (the first draw is affordable and the tab was never seen); its aria-label then ends " · 뽑기를 할 수 있어요".
  `syncShopBtn` adds the clause.

### 6.10 Keys, focus and screen readers

- **Tabs:** ←/→ move round the three tabs (`hubArrow`; the order is 상점 → 뽑기 → 마이페이지); the focus stays on the tabs.
- **Tab order inside 뽑기:** (the canvas, only while it shows an animal) → 1회 뽑기 → 10회 뽑기 (→ 건너뛰기 while it shows)
  → the grid (roving tabindex) → 확률 보기 (→ the open panel's `<summary>`) → 닫기.
- **Grids:** `hubArrow`'s "the selection follows the focus" now applies when `HUB.tab` is `'shop'` or `'draw'`. A key never
  draws: drawing needs two presses of a draw button.
- **Focus:** only when **the hub opens on 뽑기** (the `opening` flag of `hubShow`), keyboard / mouse: 1회 뽑기 — never on a
  tab switch (←/→ in the tablist would lose the focus after one press). A draw moves focus to 건너뛰기, the reveal to
  "지금 {on}" (or 확인 for a duplicate already worn), 확인 back to 1회 뽑기. On touch nothing is focused by script.
- **Escape:** during the animation it skips (after its first 24 f); otherwise it closes the hub (as today).
- **Screen readers:** the machine canvas is hidden; an animal canvas is a button with its label; the animation says
  nothing until the reveal's single announcement (6.7); arming says "한 번 더 누르면 뽑아요"; the odds are real `<table>`s
  with a caption and a `<ul>`.
- `primaryAction` already returns while the hub shows: nothing starts a game behind it.

### 6.11 Fit (screenshots + `scrollHeight` checks, 13.1 item 10)

| Size | 뽑기 tab, resting (odds closed) | Result, ten draws | Tab row |
|---|---|---|---|
| 320×568 touch | **no vertical scroll** (budget: card top 64 + tabs 44 + 8.7 + top block 99 + buttons 52 + gaps 15 + caption 16 + grid 2 × 44 + 6 + foot 10 + 44 + card / panel padding 28 ≈ 491 of 568) | no vertical scroll (with a two-line item name and a 4-digit balance) | one row with "9,999" and "8,888" |
| 360×740, 390×844 | no vertical scroll | no vertical scroll | one row |
| 844×390 landscape | scrolls (≈ 340 px tall); the draw buttons visible without scrolling | scrolls | one row |
| 1x (256×224 screen, small window) | scrolls (as the 상점 does); no horizontal overflow | scrolls | may wrap the chip (as today) |
| 512×448 2x (mouse) | no vertical scroll (≈ 420 of 448: buttons 40, foot 40, the 10-grid 5 × 2) | no vertical scroll | one row |
| desktop 900 | no vertical scroll; the 10-grids one row of ten | no vertical scroll | one row |

The 상점 tab's own fit (shop.md 9.11) is re-checked with the longer 머리 grid at 390×844 (no vertical scroll), and
마이페이지 'full' / 'ani' at 320×568 with three tabs and a 4-digit balance (looks 4.4).

---

## 7. Cloud (deploy build with a cloud config; document v 4, this doc's own bump)

### 7.1 The slot, v 4

```
players/{uid} = { v: 4, dev, nick?, eq?: '<30 characters, looks 6.1>', s: { <slot>: {...v 2 fields..., dn, gd}, '_'? }, last, updatedAt }
```

| Slot field | Meaning |
|---|---|
| `dn` | draws this browser made (absolute, like `ce`) |
| `gd` | the items this browser got by drawing (grow-only, the order they came in; `DRAW_IDS` only) |

- `o` keeps its meaning: items this browser **bought**. A drawn shop item goes in `gd`, never in `o`; a draw-only id can
  never be in `o` (it is not in `itemIds()`).
- **The account:** draws = Σ `dn`; owned = ∪ `o` ∪ ∪ `gd`; drawn = ∪ `gd`; coins = Σ `ce` − Σ `sp` as today (draw costs
  are in `sp`, refunds in `ce`).
- **Not synced:** `pt`, `dl`, `ds`, `nw`, `gs`.
- v 2-shaped slots in a v 4 document read as `dn 0, gd []` and stay until their browser writes again. A v 1 / 2 / 3
  document becomes v 4 at the first slot or worn-set write of a v 4 page (the upgrade carries a 30-character `eq` when
  the document has one: looks 6.4); older pages then read `'newer'` and never write it.

### 7.2 The pure functions (`game.js` cloud section)

```js
  // CL_V 4; CL_FIELDS + 'dn' (gd is a list, compared like o)
  const clPool = (a) => Array.from(new Set((Array.isArray(a) ? a : []).filter(isPoolId))).slice(0, CL_ITEMS);
  // clZero: + dn: 0, gd: []
  // clCnt(x): + dn: x.dn | 0, gd: clPool(x.gd)                          (the link record's c from a slot: clLinkDone 'up', clRecreate)
  // clCreateTx's at: + dn: S.dn | 0, gd: clPool(S.gd)
  // clSlot: + dn: I(x.dn, 0, 1e9), gd: clPool(x.gd); o: clItems(x.o).filter((id) => !ITEM[id].dr)   (hygiene: the rules never allow them)
  // clParseCs: cnt(c / v) + dn, gd (clamped the same way); m through clSlot. A v 2 / v 3 record parses with dn 0, gd []:
  //   every draw in a store linked before is this browser's - exact, because no page with draws ever wrote a document
  //   below v 4 (store v 4 needs cloud v 4: the gate, and G2 moves both)
  // clAgg: + dn: sum; gd: union in slot order
  // clMine (what this browser added; every list read defensively):
  //   const cg = c.gd || [], vg = v.gd || [], sg = Array.isArray(S.gd) ? S.gd : [];
  //   o:  clItems(co.concat(own.filter((id) => !vo.includes(id) && !co.includes(id) && !sg.includes(id) && isItemId(id) && ITEM[id].price > 0)))
  //   gd: clPool(cg.concat(sg.filter((id) => !vg.includes(id) && !cg.includes(id))))
  //   dn: Math.max(0, (c.dn | 0) + (S.dn | 0) - (v.dn | 0))
  // clAdopt: mine (fresh: + dn 0, gd []); S.dn = o.dn + mine.dn; S.own = clItems(o.o.concat(o.gd, mine.o, mine.gd));
  //   S.gd = S.own.filter((id) => isPoolId(id) && (ITEM[id].dr || o.gd.includes(id) || mine.gd.includes(id)));
  //   S.dn = Math.max(S.dn, S.gd.length); S.nw = S.nw.filter((id) => S.own.includes(id));
  //   join: S.pt = 0; S.dl = null; S.ds = 0; S.nw = [];                  (3.3: the pity belongs to the store that drew)
  //   the link record's c / v gain dn and gd
  // clUpload (first upload): const gd = clPool(S.gd); + dn: Math.max(S.dn | 0, gd.length), gd,
  //   o: clItems(S.own.filter((id) => !gd.includes(id) && isItemId(id) && ITEM[id].price > 0))
  // clEqOut: known = slot.o + slot.gd + every slot's o and gd  (a worn drawn item no longer blocks all six sets: before,
  //   known came from o only, so wearing any draw-only item stopped every animal's set from syncing, silently)
  // clFold: if (D.v >= 4) Object.assign(z, { dn: (a.dn | 0) + (b.dn | 0), gd: clPool((a.gd || []).concat(b.gd || [])) })
  //   (a v 4 document's archive is slotShape3; without dn / gd every fold there was refused and retried)
  // clStep: as today, plus the draws (below); no-change test also x.gd.length === mg.length
  // clDirty: 'hard' also when x.dn !== m.dn or x.gd.length !== mg.length
```

**`clStep`'s draw part** (one write = at most 10 draws, at most as many new drawn items as draws, never more spent than
this browser spent):

```js
    const mdn = m.dn | 0, mg = Array.isArray(m.gd) ? m.gd : [];
    let d = clamp((mine.dn | 0) - mdn, 0, DRAW.ten);
    const ng = (mine.gd || []).filter((id) => !mg.includes(id) && isPoolId(id));
    // x.dn = mdn + d; x.gd = mg.concat(ng.slice(0, Math.min(ng.length, d)));
    // x.sp = msp + DRAW.price * d + (nu ? ITEM[nu].price : 0)          (nu: the one new BOUGHT item, as today)
    // the spent check (economy review #7): while x.sp > (mine.sp | 0): drop nu first, then d-- (re-deriving x.dn, x.gd,
    //   x.sp); what is left is an unwritable difference - clDirty compares x with m, so it reports nothing for it and the
    //   push loop never spins. A wrong classification (a hand edit, a lost gd mark) can then never charge the account a
    //   shop price for a 200-coin draw
    // partial also when (mine.dn | 0) > x.dn or ng.length > x.gd.length - mg.length
```

- **Why the split always finishes:** each draw adds at most one item to `gd`, so new drawn items ≤ new draws. A write of
  `d = min(Δdn, 10)` draws carries `k = min(new items, d)`: if items ≥ d, it takes d and the rest (items − d) ≤ (Δdn − d);
  otherwise it takes them all.
- **Refunds** are `ce`: they go up under the existing coin cap (≤ 150 a write, 30 + 1 per 2 s), split over writes like
  any coins (`partial`). A 10회 of duplicates refunds up to 1,500 coins: at a 2.5 s gap the cap allows ≈ 31 coins a write,
  so ≈ 50 writes over ≈ 2-3 minutes, while its `sp` (+2,000) goes up in one. Meanwhile other devices show the balance that
  much lower (often 0). Accepted, no rule change; ≈ 50 writes are far inside Spark's 20,000 a day (cloud.js tests that the
  pushes converge).
- **Two devices, offline:** both draw → each slot carries its own `dn` / `gd`; the same item drawn on both → owned once,
  both paid (as shop.md's "bought twice"). Refunds on one device are that device's `ce`.

### 7.3 `firestore.rules` (paste-ready; keep every v 1-3 function; looks 6.6 for `eqsValue` / `eqFor`)

Header comment: `v: 4` ("…a page with the 뽑기 makes it 4 at its first slot or worn-set write"); the slot lines gain
`dn, gd  (v 4) the draws that browser made and the items it got by drawing`.

```
    // ---- v 4 (design/gacha.md 7): each slot also counts its draws (dn) and lists the items it got by drawing (gd, pool
    // ids only). A draw costs drawPrice() coins: sp rises by exactly that per draw counted (+ one bought item's price, as
    // in v 2); a write counts at most drawMax() draws and appends at most that many drawn items
    function v4Keys() {
      return ['t', 'w', 'g', 'ko', 'best', 'bl', 'seen', 'hi', 'day', 'de', 'n', 'at', 'ce', 'sp', 'o', 'bd', 'bs', 'dn', 'gd'];
    }
    function slotShape3(x) {
      return x is map && x.keys().hasAll(v4Keys()) && x.keys().hasOnly(v4Keys())
        && slotCore(x)
        && isInt(x.ce, 0, 1000000000) && isInt(x.sp, 0, 1000000000)
        && x.o is list && x.o.size() <= 64 && x.o.toSet().size() == x.o.size() && x.o.hasOnly(itemIds())
        && isInt(x.bd, 0, 99991231) && isInt(x.bs, 0, 5)
        && isInt(x.dn, 0, 1000000000)
        && x.gd is list && x.gd.size() <= 64 && x.gd.toSet().size() == x.gd.size() && x.gd.hasOnly(poolIds())
        && x.gd.size() <= x.dn;
    }
    // a slot's draws / drawn items, an older slot reading none
    function dv(a) {
      return ('dn' in a) ? a.dn : 0;
    }
    function gv(a) {
      return ('gd' in a) ? a.gd : [];
    }
    // the coin part of a later write of the same slot in a v 4 document: v 2's rules with the draws' coins in sp, plus the
    // draws: dn rises by 0..drawMax(), gd keeps its start and gains at most that many items
    function coinStepOk3(a, b, dt) {
      let ao = ov(a);
      let n = ao.size();
      let ag = gv(a);
      let g = ag.size();
      let rise = b.ce - cv(a, 'ce');
      let d = b.dn - dv(a);
      return rise >= 0 && rise <= 150 && rise * 2000 <= 60000 + dt
        && b.bd >= cv(a, 'bd')
        && d >= 0 && d <= drawMax()
        && b.gd.size() >= g && b.gd.size() <= g + d && b.gd[0:g] == ag
        && (b.o.size() == n
              ? (b.o == ao && b.sp == cv(a, 'sp') + drawPrice() * d)
              : (b.o.size() == n + 1 && b.o[0:n] == ao && !(b.o[n] in ao)
                 && b.sp == cv(a, 'sp') + drawPrice() * d + priceOf(b.o[n]) && b.bl >= leagueNeed(b.o[n])));
    }
    // a browser's first write in a v 4 document: up to 150 coins, at most one bought item and drawMax() draws, sp exact
    function coinNewOk3(b) {
      return b.ce <= 150 && b.o.size() <= 1 && b.dn <= drawMax()
        && b.sp == drawPrice() * b.dn + (b.o.size() == 1 ? priceOf(b.o[0]) : 0)
        && (b.o.size() == 0 || b.bl >= leagueNeed(b.o[0]));
    }
    function slotOk3(o, b, k) {
      return slotShape3(b)
        && ((k in o.s)
              ? (stepOk(o.s[k], b) && coinStepOk3(o.s[k], b, request.time.toMillis() - o.s[k].at.toMillis()))
              : (newOk(b) && coinNewOk3(b)));
    }
    // (v 4) the archive's draws are the sum, its drawn items the union
    function drawSumOk(a, b, z) {
      return z.dn == dv(a) + dv(b)
        && z.gd.hasAll(gv(a)) && z.gd.hasAll(gv(b)) && z.gd.hasOnly(gv(a).concat(gv(b)));
    }
```

Changes to existing functions (the same lines looks 6.6 changed for v 3):

| Function | v 4 |
|---|---|
| `createOk` | adds `\|\| (d.v == 4 && slotShape3(d.s[d.last]) && (!('eq' in d) \|\| eqsValue(d.eq)))`; the first upload carries the store as it is (any `dn`, any pool ids in `gd` up to `dn`): the honest limit of `t` |
| `metaOk` | `d.v == o.v \|\| ((d.v == 2 \|\| d.v == 3 \|\| d.v == 4) && d.v > o.v)` (any upward step) |
| `slotOk` | `(d.v == 4 ? slotOk3(o, d.s[k], k) : d.v >= 2 ? slotOk2(o, d.s[k], k) : <v 1 as today>)` |
| `sumOk` | `(v == 4 ? (slotShape3(z) && coinSumOk(a, b, z) && drawSumOk(a, b, z)) : v >= 2 ? (slotShape2(z) && coinSumOk(a, b, z)) : slotShape(z))`; the archive's default map stays as it is (`dv` / `gv` read zeros) |
| `eqFor`, `eqOk` | unchanged (`v >= 3`: 30 characters) |

### 7.4 The generated block (`tools/check-shop.js --write`)

```
    // GENERATED by tools/check-shop.js from ITEMS and DRAW (game.js); never edit by hand. A price never changes (a new
    // price = a new id; a new draw price = a new counter); an id never leaves these lists (a slot holding it could never
    // be written again)
    function itemIds() { return [ <every sold id - price > 0, retired ones included> ]; }
    function priceOf(id) { return { <as today> }[id]; }
    function leagueNeed(id) { return { <as today> }.get(id, 0); }
    function poolIds() { return [ <DRAW_IDS: every id that is or ever was drawable, catalog order> ]; }
    function drawPrice() { return 200; }
    function drawMax() { return 10; }
    // END GENERATED
```

- `genBlock(ITEMS, DRAW_IDS, DRAW)`: `itemIds` / `priceOf` from `price > 0` (draw-only ids are excluded by their price 0),
  `poolIds` from `DRAW_IDS` (not `DRAW_POOL`: retiring an item takes it out of the weights, never out of the rules — a
  `gd` holding it would fail `hasOnly(poolIds())` on every later write of its slot, and that slot's trophies and coins
  would stop syncing for good), the two numbers from `DRAW`.
- **Grow-only check:** check-shop reads the `itemIds` and `poolIds` lists of the current rules file; a generated block
  that drops any of their ids fails (with or without `--write`): "a published id never leaves the rules".
- A new catalog item later = a store and cloud version (0.1's policy), regenerate, **republish the rules** first.

### 7.5 What the rules can and cannot hold

| Can | Cannot |
|---|---|
| `sp` rises by exactly 200 per draw counted (plus one bought item's exact price); `dn` never drops and rises ≤ 10 a write; `gd` only grows, appended, ≤ the write's draws, pool ids only (never a league item, never the starter, never an unknown id); a draw-only id never in `o`; a v 4 slot never goes back to v 2; folding adds draws up and unions `gd` | check the RNG (a modified page can choose its results), check the account's balance (no loops over slots: a debt is possible, as in v 2), check `gd` against `dn` across slots |

**Honest limits** (the rules header and FIREBASE-SETUP.md gain them in G2; economy review #9): a modified page can
- take **any pool item for 200 coins** by writing it into its slot's `gd` with one draw — including e6 (1,100), b7 (950)
  and every draw-only 전설;
- start a **new browser slot with 10 drawn items** (`coinNewOk3`: `dn ≤ 10`, `sp = 2,000`) in debt, against one bought item
  in v 2.

Neither is new in kind (the account's balance was never checked, and the first upload already carries any store), and the
items are cosmetics: the cloud bounds what a modified page does to its **own** account.

### 7.6 Before deploying: emulator / Rules Playground cases

Port each into the `FakeFirebase` JS rules of `src/tests/cloud.js`, and check by hand:
- one draw (`dn` +1, `sp` +200, `gd` +1 pool id): allowed; one duplicate draw (`dn` +1, `sp` +200, `gd` unchanged, `ce`
  +60): allowed;
- ten draws with 6 new items: allowed; `dn` +11: refused;
- `dn` +1 with 2 new `gd` items: refused; a `gd` item not in the pool (h8, n1, `zz`): refused; `gd` reordered or shrunk:
  refused; a duplicate inside `gd`: refused;
- `sp` +199 or +201 for one draw: refused; a draw and a purchase in one write (`sp` = 200 d + its price): allowed;
- a draw-only id appended to `o` (with any `sp`): refused;
- `dn` going down: refused; `gd.size() > dn` on create: refused;
- a v 2-shaped slot write into a v 4 document: refused; a v 3 → v 4 upgrade by a slot write (with the 30-character `eq`
  in place): allowed; by an `eq`-only write: allowed; v 4 → v 3: refused;
- a fold of a v 4 slot (sums `dn`, unions `gd`): allowed; a fold of a v 2-shaped slot in a v 4 document (the archive
  `slotShape3` with `dn` / `gd` from zeros): allowed; a v 2-shaped archive in a v 4 document: refused;
- the 1,000-expression limit on the biggest write: a draw + a purchase into a document with 16 slots (two list literals in
  `slotShape3`, 39 and 43 entries, plus `priceOf`). Confirm `b.gd[0:g]`, list `==`, `toSet()` behave as for `o`.

### 7.7 Release gate

- `tools/check-shop.js`' gate table (looks 0.1): store v 4 needs cloud v ≥ 4. Pass G2 sets `TRO_V 4` and `CL_V 4`
  together, so there is never a build with draws and a cloud that cannot hold them (a deploy built with draws and a v 3
  cloud would have been refused at its first sign-in — `o` with draw-only ids — and charged drawn shop items their full
  price; economy review #4).
- check-shop also ties the rules file to `CL_V` (looks 6.7): at v 4 it must define `slotShape3`, `poolIds`, route
  `d.v == 4`, and `CL_FIELDS` must hold `'dn'`.
- **Publish the v 4 rules first** (they still accept v 1-3 pages), then deploy the page, then tell players to refresh
  every device once (FIREBASE-SETUP.md §12 gains the 뽑기 line and the honest limits of 7.5).

---

## 8. Art (`src/sprites.js`; existing palette keys only, still ≤ 64)

| Name | Size | Frames | Pass | Notes |
|---|---|---|---|---|
| `it_hd`, `it_he` | 10×6, 8×7 | 1 | GA1 | 4.2 |
| `it_f8`, `it_f9` | 9×4 (art ≤ 5×3 / 9×3) | 2 [profile, front] | GA1 | 4.2 |
| `it_n9`, `it_na` | 8×4, 10×3 | 1 | GA1 | 4.2 |
| `it_b8`, `it_b9` | 8×9, 8×10 | 1 | GA1 | 4.2 (B items) |
| `ic_e7`, `ic_e8` | 8×8 | 1 | GA1 | 4.2 |
| `fx_duck` | 5×4 | 2 | GA1 | 4.2: e7's duckling |
| `ic_cap` | 8×8 | 1 | GA1 | a small capsule (P top, w bottom, ink): the 상점's "뽑기" price line and button |
| `gacha` | 20×28 | 1 | GA2 | **비누 캡슐 뽑기 기계**, drawn at (4, 3) so its feet are on row 30: a round glass dome (rows 0-12: `c` / `i` glass, a `w` shine arc upper-left, `k` rim) holding nine capsules (2×2: `h` / `E`, `t`, `v`, `Y` tops on `w`); a pink body (rows 13-27: `P` fill, `p` shading, `q` base and feet) with a round bubble emblem (`c` / `w`, ink) on the front, a coin slot (`k` 3×1 over `a`), the chute at the bottom-left (a `k` frame round a 6×5 `d` opening). Not a crown, no red |
| `gacha_h` | 7×7 | 4 | GA2 | the crank, drawn at (24, 14): a grey round hub (`a` / `W`, ink) with a pink knob (`p`) on its arm at 12, 3, 6 and 9 o'clock |
| `cap` | 6×6 | 4 | GA2 | a closed capsule by rarity: the top half `h`/`E` (보통), `t`/`T` (고급), `v`/`V` (희귀), `Y`/`y` (전설); the bottom half `w`/`W`; a 1 px `w` glint; ink. Rounded, but with a seam line and two colours, so it never reads as a free bubble |
| `cap_t` | 6×3 | 4 | GA2 | the top half alone, by rarity (the pop) |
| `cap_b` | 6×3 | 1 | GA2 | the white bottom half alone |

- **`PG.ITEM_SIZE`'s registration** in sprites.js matches `/^(it_|ic_e|slot_)|^(coin|shop|lock)$/` today: it becomes
  `/^(it_|ic_|slot_|cap|fx_)|^(coin|shop|lock|gacha|gacha_h)$/`; check-sprites' size loop uses the same pattern.
- **`game.js`:** `OPT_SPR` gains `ic_cap: 1, fx_duck: 2` (G3) and `gacha: 1, gacha_h: 4, cap: 4, cap_t: 4, cap_b: 1` (G4);
  the items come from `ITEMS` already. Never a stand-in box: a missing machine or capsule frame skips the canvas
  animation (the draw goes straight to the result view, which works from the log), and check-sprites / check-shop make a
  missing frame an error once its pass has landed.
- **`tools/check-sprites.js`:** the new sizes and frame counts; every 4.4 limit for the 8 worn items (with `RIM.f9 = 'W'`);
  `cap` frames' top halves use the rarity keys; `gacha` has no `R`; `it_hd` has no `Y y L R r`; the contact-sheet rows of
  shop.md A2 (each item alone on dark and on the 5 themes, on every animal's idle 0, on every anchored frame + mirror +
  portrait), plus a row of `fx_duck` beside every animal's feet on the 5 themes and a row of the machine, the crank
  frames and the capsules at 4x. `tools/anchors.js`' `ITEM_IDS` gains the 8 worn ids.

---

## 9. Sound (`src/audio.js`, 4 new sfx, local only through `uiSfx`, never echoed)

| Name | `o.n` variants | Sound | When |
|---|---|---|---|
| `gacha_roll` | 0 one turn, 0.6 s · 1 two turns, 0.8 s · 2 the knock alone | the crank "드르륵": a ratchet of short clicks (noise, bandpass 3.2 kHz, q 4, 12 ms, v 0.08) and a soft snare roll that swells (`drum(sfxBus, 's', …)`, v 0.12 → 0.3) **on one 50 ms grid** (each click with its hit), ending in a wooden knock (sine 140 → 60 Hz, 0.1 s, v 0.2: `stake`'s low end) | a draw starts; reduced motion: n 2 only |
| `gacha_drop` | 0 with its bounce · 1 without | a plastic capsule landing "톡": sine 520 → 300 Hz, 50 ms, v 0.14, + lowpass noise 900 Hz, 30 ms, v 0.06; n 0 adds a bounce 90 ms later at half volume | each capsule leaves the chute (ten: n 1 for the first nine) |
| `gacha_pop` | 0..9 | the capsule opening "뽁!": a sine sweeping 300 → 1,100 Hz in 35 ms (v 0.16) + a highpass noise burst at 2.5 kHz, 40 ms (v 0.1); n raises both by n semitones | a capsule opens (the ten cells climb) |
| `gacha_win` | 2 희귀 · 3 전설 | n 2: a p25 arpeggio C6 E6 G6 C7 (MIDI 84 88 91 96) in 60 ms steps, the last held 0.25 s, a sine at C8 and a highpass noise sparkle for 0.3 s (like `tro_up`, longer). n 3: the same run, then a held C7-E7-G7 chord (p25 lead + p12 harmony) for 0.6 s with a 6 Hz vibrato, a kick and an open hat under it, a bell sine at E8 for 0.4 s (like `promote`, lighter: never louder than it) | the reveal of a new 희귀 / 전설 |

- **`uiSfx = (n, o) => { if (unlocked) Snd.call('sfx', n, o); }`** (like `troSfx`): today it drops `o`, so every variant
  would fall back to the default.
- **`VARIANTS`** gains `gacha_roll: [0, 2, 0], gacha_drop: [0, 1, 0], gacha_pop: [0, 9, 0], gacha_win: [2, 3, 2]` (the
  30 ms merge key then includes the variant).
- A new 보통 / 고급 reveal plays the existing `buy`; **a duplicate plays nothing at the reveal** (the chip's `coin` at the end
  of its count-up is enough; two coins in a row were noise). The header comment of audio.js lists the four names on a
  `(v4 뽑기)` line.

`tools/audio-node-test.js`: a group for the four names (each its own recipe; short; no louder than the loudest effect;
`gacha_win` n 3 longer than n 2; `gacha_pop` n 9 higher than n 0; `gacha_roll` n 1 longer than n 0 and n 2 the shortest;
`gacha_drop` n 1 shorter than n 0), then rebaseline.

---

## 10. Korean strings (`GACHA_TEXT`, the last constant of the top block; warmed with `SHOP_TEXT`)

```js
  // every Korean string the 뽑기 shows ({n}-style parts are built from these syllables; aria-labels are not warmed). No
  // string may contain the retired v1 title's syllables (final-e2e2). The catalog's names / descs are in SHOP_TEXT
  const GACHA_TEXT = ' 뽑기 비누 캡슐 뽑기 1회 뽑기 10회 뽑기 한 번 더 누르면 뽑아요 다 모았어요! 개 더 모아요' +
    ' 첫 뽑기는 뽑기 전용 아이템 확정! 회 안에 뽑기 전용 아이템 확정 다음 뽑기에 뽑기 전용 아이템 확정!' +
    ' 뽑기 전용 아이템을 다 모았어요! 남은 아이템은 상점에서 사요 10회 뽑기는 희귀 이상 1개 확정 뽑기 확률 가지고 있어요' +
    ' 확률 보기 확률 닫기 뽑기 전용 아이템 뽑기 1회의 확률 등급 합계 아이템 1개 상점 아이템 종 각 %' +
    ' 첫 뽑기는 뽑기 전용 아이템 확정 10회 안에 아직 없는 뽑기 전용 아이템 1개 확정 (고급 : 희귀 : 전설 = 5 : 2 : 1 비율로)' +
    ' 10회 뽑기 중 1개는 희귀·전설 중에서 나와요 이미 있는 아이템이 나오면 코인을 돌려받아요:' +
    ' 리그 아이템과 처음 선물은 나오지 않아요 뽑기 전용 아이템은 상점에서 팔지 않아요 뽑기 전용 아이템을 다 모으면 뽑기가 끝나요' +
    ' 비누 코인은 게임을 해야만 모여요 아이템별 확률 보통 뽑기 희귀 이상 뽑기 확정 뽑기' +
    ' 건너뛰기 두근두근… 새 아이템! 이미 있어요 코인 + 뽑기 전용 확정! 희귀 이상 확정 확인 지금 지난 뽑기 결과예요' +
    ' 새 아이템 개 모두 이미 있어요 뽑기 결과 뽑기로 가기 뽑기에서만 나와요 뽑기가 저장되지 않았어요 코인은 그대로예요' +
    ' 이 브라우저에서는 저장되지 않아요 ' + VB_ROBE.join(' ') + ' 0123456789,.·:()=/';
```

- Strings built from parts: "{10 − pt}회 안에 뽑기 전용 아이템 확정", "{n}개 더 모아요", "이미 있어요 · 코인 +{n}",
  "새 아이템 {n}개 · 코인 +{m}", "지금 {on}", "뽑기 확률 {p}%", "상점 아이템 {n}종 · 각 {p}%", "뽑기 전용 아이템 {n}/10",
  and looks' "{주어} {done}". No particle after a number ("+60" ends the phrase; shop.md's "+25이" lesson).
- **"회" for draw counts** (1회 / 10회 / "3회 안에"): "1번 뽑기" read as "draw No. 1".
- `tools/check-shop.js` checks that every string of §6 and every new catalog name / desc is in `SHOP_TEXT + GACHA_TEXT`,
  and that neither holds the retired title's syllables (the same code points `final-e2e2` uses).

---

## 11. Edge cases

| Case | Behaviour |
|---|---|
| A reload / crash mid-animation | Nothing is drawn again; the next 뽑기 tab shows "지난 뽑기 결과예요" (6.7). |
| Draw in tab A while tab B shows the 뽑기 tab | B refreshes at A's `storage` event without animating; B's armed button re-checks at its second tap. |
| A lost write between two tabs | `drawLost` (5.6): the result view closes, "뽑기가 저장되지 않았어요 · 코인은 그대로예요". |
| An older page (looks release, v 3) in the same browser | The v 4 store is `'newer'` there: read-only, never writes the store or the cloud's keys (looks L0). Reload. |
| Same item drawn on two devices offline | Owned once, both draws paid, each slot's `gd` holds it (7.2). |
| Bought on one device, drawn as new on another before syncing | Owned once; one slot's `o` and the other's `gd` hold it; nothing refunds. Rare; accepted like shop.md's "bought twice". |
| Sign-in on a fresh browser (join) | `dn` becomes the account's, so no second first-draw 확정; `pt 0` there (3.3). |
| Sign-out | The browser's own store comes back with its own draws, pity, items and log (shop.md 8.2); unsaved draws are parked, not lost (looks 6.7). A log whose items are gone is skipped (6.7). |
| The hub opened from the room, the host starts | The hub closes; the result shows next time; the guest plays with the set it had (looks are frozen at match start). |
| Wearing a drawn item in the room | Through `lookSet(…, hubAni())`; `lookOut` / `'eq'` as today; friends on older pages see that slot bare. Its cloud set syncs (`clEqOut` knows `gd`). |
| Balance exactly 200 / 2,000 | Allowed; the balance becomes 0 plus any refunds. |
| 10회 with 1,999 coins | Disabled; a tap says "1개 더 모아요". |
| A phone double-tap on 10회 | Arms; the second click (< 350 ms) is ignored; nothing is spent (6.4). |
| Every draw-only item owned | Done (3.6): buttons disabled, "남은 아이템은 상점에서 사요". |
| A new catalog item later | A store and cloud version (0.1). A shop item joins the pool by `drawW` (check-shop then fails until DRAW's weights are re-tuned to 10,000 and the panel's tests updated); a draw-only item the same, and it lifts "다 모았어요". The rules' lists are regenerated (grow-only) and republished first. |
| An item retired from the 상점 (`retired: 1`) | It leaves `DRAW_POOL` (no longer drawn, re-tune the weights) but stays in `DRAW_IDS` / `poolIds` and, if sold, in `itemIds` / `priceOf`; owners keep it; nothing buys it (`!it.retired`). |
| `reducedMotion()` | The still sequence of 6.6; no shimmer, no flash; items, results and sounds stay (the roll as its knock only). |
| Storage blocked (`TRO.mem`) / read-only | 5.6. |
| A hand-edited store (`gd` foreign ids, `pt` 99, a broken `dl`, `dn` below `gd.length`) | `troParse` clamps (5.2, `dn` raised to `gd.length`); the cloud never writes what the rules would refuse, and never more `sp` than spent (7.2). |

---

## 12. Debug / test API (`PG.debug.draw`)

```js
  PG.debug.draw = {
    state(),                      // {dn, pt, gd, dl, ds, nw, gs, done (drawDone), pool: DRAW_POOL.length, ids: DRAW_IDS.length,
                                  //  view: 'machine' | 'res', sel, odds, anim: {n, t, phase} | null, btn: [one, ten] labels / kinds,
                                  //  line, sub, ani: hubAni(), armAt}
    cands(own, pt, dn, rare),     // the pure drawCands
    odds(),                       // what the 확률 보기 panel shows, as data: [{rar, total, items: [[id, w, wRare, wPity]]}], rules numbers
    rng(fn),                      // a test generator in [0, 1) in front of crypto (null: crypto again)
    commit(n),                    // drawCommit(n): the store only, no UI (returns its id)
    tap(which),                   // a tap on 'one' | 'ten' | 'skip' | 'ok' | 'wear' | 'odds' | 'view' | 'viewL' (the UI path)
    tick(n),                      // hub frames (PG.debug.shop.tick)
    open(from),                   // openHub('draw', from)
    sim(runs, seed),              // the pace simulation of 3.7 through drawCands / drawPick with a seeded generator
  };
```

---

## 13. Tests

**Store hygiene:** every gacha test runs in its own store namespace (`PG.debug.tro.ns(...)`) or restores the store, as
shop.md 16 requires (a drawn item worn in the default key would change other suites' pixels).

### 13.1 `src/tests/gacha.js` (virtual time, offline; "GACHA PASS|FAIL …", "GACHA DONE pass=N fail=M"; run-all job `gacha`)

Items 1-4 land in G1, 5-8 in G2, 9-11 in G3 (the animation parts of 9 in G4).

1. **Pool and odds (pure):** `DRAW_POOL` is exactly the 43 ids of 3.2 (no league item, no starter, every `dr` item);
   `DRAW_IDS` equals it today and contains every `DRAW_POOL` id; Σ weights = 10,000; tiers 4,500 / 3,400 / 1,700 / 400;
   each item's weight as the table; `drawW` is 0 for league items, the starter and retired items (a stubbed retired item
   stays in `DRAW_IDS`); every refund < `DRAW.price`; `DRAW.wd[0]` is 0.
2. **Pity and the 10회 (pure `drawCands`):**
   - `dn 0` → kind 1, only unowned draw-only items, weights 5 : 2 : 1; `pt 9` → kind 1; `pt 8` → kind 0, the whole pool.
   - All draw-only owned → never kind 1, whatever `pt` / `dn`; `drawDone` true.
   - `rare` → kind 2, only rarity ≥ 2, 21 items, Σ 2,100; `rare` with a due 확정 → kind 1 (the 확정 first).
   - A 10회's kind-2 draw is draw 1, or draw 2 when draw 1 is a 확정 draw, and exactly one per batch (100 seeded
     batches from varied stores).
3. **Statistics (the real crypto RNG):** 200,000 `drawPick`s over the whole pool → each tier within ±0.5 percentage points,
   each item within 4 standard deviations, χ² over the 43 items below the 0.001 critical value. `drawInt(n)` over 1..10,000
   never returns ≥ n; `drawInt` with crypto stubbed out falls back to `Math.random` without throwing.
4. **Pace (`drawPace`, seeded, 20,000 collections):** draws to the 10 draw-only items: average 60-66, p90 ≤ 78; **the
   longest gap between two new draw-only items is ≤ 10 in every run**; average net coins within ±5 % of 11,000; shop value
   within ±5 % of 4,000; new draw-only items from a fresh 10회 within ±5 % of 2.9, from 15 single draws of 3.5; the first
   draw is a draw-only item in 100 % of runs.
5. **Commit before the animation (store level):**
   - After `drawCommit(1)`, reading `localStorage` directly shows `dn`, `sp`, `own`, `gd`, `ce`, `pt`, `dl` (with its id)
     exactly as the returned result; `troLoad()` on the same key (a "reload") gives the same store and draws nothing.
   - Ten draws: `sp` + 2,000 once; `dl.r` has 10 entries; at least one rarity ≥ 2.
   - `drawCommit` on a done store → `'done'`; on a read-only store → `'ro'`.
6. **Refunds:** a store owning everything but one draw-only item, a seeded duplicate: `ce` + the rarity's **full** refund,
   `own` / `gd` / `nw` unchanged; a store with `ce − sp` above 99,999 still gets the full refund and its `dl` parses.
7. **Store (`troParse`):** a v 3 store (looks) with coins, items, per-animal sets, a link record and a hold → v 4 with
   every v 3 field identical and `dn 0, pt 0, gd [], dl null, ds 0, nw [], gs 0`, written back at load; v 2 and v 1 the
   same through looks' migration; v 5 → read-only and untouched; clamps: `dn −5`, `pt 99`, `gd` with unknown / unowned /
   league / non-pool ids, a draw-only id in `own` missing from `gd` (added), `dn` below `gd.length` (raised), `dl` with 11
   entries, a wrong refund, a missing or bad `id`, `n > dn` (→ null), `nw` with unowned ids, 17 ids (→ the last 16).
8. **Two tabs (two frames on one origin):** a draw in A updates B's chip, pity line and collection at A's storage event, B
   never animates; B armed, A spends the coins, B's second tap answers "{n}개 더 모아요"; `drawLost` with a forced lost
   write (equal `dn` after the clash: caught by the batch id), and none after two legitimate batches one after the other.
9. **UI:**
   - Tabs: the order 상점 / 뽑기 / 마이페이지, ←/→ round all three with the focus staying on the tabs, the tab dot until the
     first visit (on its own tab), `gs`.
   - Buttons: every state of 6.4 and its label / aria-label; the arm's live-region line; a second tap at 200 ms ignored
     and at 400 ms drawing; the 2.6 s re-arm; arming one disarms the other; a held Enter never draws; Z / X / the touch
     pads do nothing.
   - **(G4)** The animation: every phase reached by `tick`; the capsule's rows on the canvas (landing rows 25-30, the
     machine's feet on row 30, the rays inside 0-31); skip by 건너뛰기, by Escape, by the results grid — each ignored
     before t = 24 and acting after; the canvas never skips; switching tabs mid-animation reveals silently and the result
     view is back on return; `DRAW_GUARD` on the buttons, the canvas and the results grid (a tap 0.5 s after the reveal
     does nothing, at 0.9 s it acts); the ten cells open in ascending rarity and the best last; reduced motion stubbed →
     no jiggle / hop / rays / flying halves (pixel probes at t = 30 and t = 88), the still timing, only the knock.
   - The result: one and ten; "새 아이템!" / "이미 있어요 · 코인 +60"; the batch line; the best-result rule; 지금 {on}
     wears on `hubAni()` only (another animal's set unchanged) with "{주어} {done}", its verb per item (입기 for b9),
     then {off}; the canvas halves cycle the animal and the button follows; 확인; no "한 번 더" anywhere in the DOM.
   - The machine view: the canvas hidden from the accessibility tree and inert; with a cell selected: the pill, the
     arrows, the button label; tapping the selected cell deselects.
   - `#pg-gacha-sr`'s text, once per reveal; the footer never shows a message over 12 syllables on 뽑기.
   - The 상점: draw-only cells with "뽑기", the `'draw'` state "뽑기로 가기" and its jump to the 뽑기 tab with the item
     selected; `shopCheapest` / `shopCanBuy` / the first card's goal never pick a draw-only item.
   - NEW dots: set by a draw, cleared by selecting / tapping / wearing; the 마이페이지 tab dot; the title's 상점 dot and
     aria-label for the first affordable draw.
   - The odds panel's numbers parsed from the DOM equal `PG.debug.draw.odds()` (all three columns; the 확정 column
     changes after a draw-only item is owned).
   - Done: "다 모았어요!" on both buttons, the line and sub of 3.6.
   - Fonts: every visible 뽑기 string's syllables are in `#pg-fontwarm`.
10. **Fit (`gacha-fit-320|360|390|844`, cdp at real viewports; `#hubfit` like S3a; plus 2x and desktop in the plain
    run):** 6.11's table: the resting tab and the ten-result view (balance 8,888, a two-line item name) with no vertical
    scroll at 320×568, 360×740, 390×844, 512×448 2x and 900; the tab row on one line with "9,999" and "8,888" at 320 / 360
    / 390 (three tabs); no horizontal overflow at any size, 1x and 844×390 included; the 10-grids 5 × 2 below 494 px and
    one row from it; the 상점 tab at 390×844 with the 14-item 머리 grid; 마이페이지 'full' and 'ani' at 320×568 with three
    tabs.
11. **Effects:** e7 — two ducklings, both on the feet row while grounded, ≥ 1 px clear of the ground marker's columns,
    following within 7 px spacing after a walk, hidden during a jump > 8 px and back behind the heel after landing, reset
    on respawn, none under reduced motion, no particles added; e8 — ≤ 4 wisps per player, 2 px for 12 f then 1 px, the
    sway, never above `headTop(p)`, colours never `#ffffff`; a visibility probe on each of the 5 themes (contrast of the
    wisps against the arena's tiles); the budget test of shop.md 16.1 item 8 with four players wearing e7 / e8.

### 13.2 Other suites

| Suite | Pass | Change |
|---|---|---|
| `src/tests/shop.js` | G1, G3 | the 50-entry catalog; draw-only items never bought (`shopBuy('hd')` → `bad`); retired items never bought; (G3) the 상점's grids per slot (14 / 9 / 10 / 9 / 8); the three-tab fits |
| `src/tests/shop-net.js` | G3 | a guest wears a drawn draw-only item (`b9`) on its seat's animal in the room; the host and the other guest draw it; a page stub without the gacha sees that slot bare |
| `src/tests/cloud.js` | G2 | the v 4 slot in `FakeFirebase` (every 7.6 case); `clMine` / `clStep` with draws: one write per ≤ 10 draws, `gd` items ≤ draws per write, `sp` exact, **never above `mine.sp`** (a hand-edited store whose `gd` lost a mark: the item is not charged its price; the remainder unwritable, `clDirty` ''), refunds through `ce` under the cap split over writes and converging (a 10회 of duplicates: ≈ 50 writes, all accepted); two devices drawing offline; the same item drawn on both; a first upload with draws (`dn` ≥ `gd.length`); a join with draws on the account (`pt 0` after it, the guest key keeps its own `pt`; sign-out → guest `pt` back; the loop gives no extra 확정 draw); **an offline draw → forced sign-out → sign-in → the draw and its `sp` are still there** (looks L0's park); a fold with draws and a fold of a v 2-shaped slot in a v 4 document; a v 3 → v 4 upgrade; wearing `b9` on the cat → the 30-character set goes up right after `b9`'s `gd` write; `clCnt` / `clZero` / `at` carry `dn` / `gd` (the 'up' link path and `clRecreate` never throw); a v 5 document never written |
| `tools/check-shop.js` | G1, G2 | 13.3 |
| `tools/check-sprites.js` | GA1, GA2 | §8 |
| `tools/audio-node-test.js` | G4 | §9 |
| `src/tests/trophies.js` | G2 | `v: 4`; the newer store `v: 5` |

### 13.3 `tools/check-shop.js`

- **G1:** `ITEMS`: **50** entries; the **40 sold** (`price > 0`) plus the starter keep every existing check (bands, counts
  13 / 15 / 8 / 3 among sold items, the sum 10,450, one league item per league 1-6, `at` rules, verbs). Draw-only:
  exactly 10 with `dr: 1`, `price 0`, `lg 0`, `rar` 1-3 (2 / 5 / 3), ids `hd he f8 f9 n9 na b8 b9 e7 e8`, each placed after
  its slot's sold items; `b9`'s verbs are `VB_ROBE` (the `OWN_VB` table gains `b9: '입기'`); `b8` uses the slot default.
  The order rule: by slot; within a slot the sold items by price, then the draw-only items. `DRAW`: price 200, ten 10,
  pity 10, refunds 30 / 60 / 100 / 150 all < price; `DRAW_POOL` = 43 ids, Σ weights 10,000, the tier table of 3.2, no
  league item, no starter; `DRAW_IDS` ⊇ `DRAW_POOL`, no league item, no starter. `OWNABLE` (0.1): sold + starter, plus
  `dr` ids once `TRO_V ≥ 4`. The block slice runs from `COIN_MAX` to the end of **`GACHA_TEXT`** and returns `DRAW`,
  `DRAW_IDS`, `DRAW_POOL`, `GACHA_TEXT` too. Texts: every catalog name / desc and every §6 string in
  `SHOP_TEXT + GACHA_TEXT`; neither holds the retired title's syllables. Art for the 10 items: a warning until G3, then
  an error (GA1 must have landed).
- **G2:** the rules' GENERATED block equals `genBlock(ITEMS, DRAW_IDS, DRAW)` (7.4) and never drops an id the current file
  holds; `--write` regenerates it. The gate table `{4: 4}`; the rules ↔ `CL_V` checks at v 4 (`slotShape3`, `poolIds`,
  `d.v == 4`, `CL_FIELDS` with `'dn'`).
- **G4:** art `gacha`, `gacha_h` (4), `cap` (4), `cap_t` (4), `cap_b` an error (GA2 must have landed).

---

## 14. Files touched

- **`src/game.js`:**
  - Top constants: `VB_ROBE`, the 10 `ITEMS` entries, `DRAW`, `drawW`, `DRAW_IDS`, `DRAW_POOL`, `DRAW_ONLY`, `isPoolId`,
    `GACHA_TEXT`; `shopBuy` / `shopCanBuy` / `shopCheapest`'s `!it.retired`.
  - The store (`TRO_V 4`): `troFresh`, `troParse` (+ `drawLogParse`).
  - A new block after the hub block, `// ---- v4 뽑기 (design/gacha.md)`: `DRAW_T`, `drawInt`, `drawCands`, `drawPick`,
    `drawDone`, `drawCommit`, `drawLost`, the 뽑기 tab (`hubFillDraw`, `drawTick`, `drawDrawCanvas`, `drawResGrid`, the odds
    builder, the result view, `drawReveal(silent)`), `PG.debug.draw`.
  - Hub changes: `HUB.draw`, `openHub` / `hubShow` (`'draw'`, the footer's 확률 보기, focus only when opening),
    `hubFill`, `hubTick` (the animation, every 2nd frame; e7 walks), `hubDraw` (the ducklings; the 뽑기 canvas),
    `hubGrid` (mode `'draw'`, the NEW dot, the 상점's draw-only cells), `shopBtnState` / `hubAct` (`'draw'`), `hubArrow`
    (selection follows focus in `'draw'`), `hubShut`, `hubSetupDOM`, `syncShopBtn` (the first-draw dot).
  - `onKeyDown`'s hub branch: Escape skips a running animation first (after its first 24 f).
  - Effects: `lookFx` e7 / e8, `drawDucklings`, the particles' `big` / `sw` in the world draw and `hubDraw`.
  - Sound: `uiSfx(n, o)`.
  - `OPT_SPR` (§8). `setupDOM`: warm `GACHA_TEXT`.
  - Cloud (`CL_V 4`): `CL_FIELDS`, `clPool`, `clZero`, `clCnt`, `clSlot`, `clParseCs`, `clAgg`, `clMine`, `clAdopt` (+ the
    join reset), `clStep` (+ the spent check), `clDirty`, `clUpload`, `clCreateTx`'s `at`, `clEqOut`, `clFold`.
- **`src/page.html`:** the tab, `#pg-hub-draw`, `#pg-gacha-odds-btn` in the footer, CSS for `.pg-gacha-*`, `.pg-items10`
  (and the card's container), `.pg-odds*`, `.pg-item-nw`, `.pg-item.is-flash`; the sr h2 and the tablist label. (The
  tab-row CSS, the pill wrapper and the tabs' `position` come with looks L3.)
- **`src/sprites.js`:** §8, `PG.ITEM_SIZE`'s pattern.
- **`src/audio.js`:** §9 (`VARIANTS`, four recipes).
- **`firebase/firestore.rules`:** §7.3 + the generated block (7.4) + the header's honest limits. **`FIREBASE-SETUP.md`:**
  republish, the honest limits of 7.5, refresh every device.
- **Tools / tests:** `tools/check-shop.js`, `tools/check-sprites.js`, `tools/anchors.js` (`ITEM_IDS`),
  `tools/audio-node-test.js`, `tools/run-all.js` (jobs `gacha`, `gacha-fit-*`, the `gacha-hub-*` shots),
  `src/tests/gacha.js` (new), `src/tests/shop.js`, `src/tests/shop-net.js`, `src/tests/cloud.js`, `src/tests/trophies.js`.

---

## 15. Implementation passes

Two tracks, as in shop.md 19. **Code** passes edit `src/game.js` (and page.html, audio.js, firestore.rules, tools,
tests) and run strictly one after another, each by a single agent, each starting from a green suite. **Art** passes edit
only `src/sprites.js`, `tools/check-sprites.js` and `tools/anchors.js`; they can be written in parallel with code passes,
but suite runs are never concurrent (one workflow runs the suite at a time).

**Every pass, before handing over:** `node build.js` succeeds; the pass's filter is green while iterating; then the
**full** `node tools/run-all.js` is green; the screenshots it names are looked at with Read; anything built differently
from this doc goes into a short "As built" note at the end of this file.

**Order:** after looks-per-animal.md L0-L3 (request A ships first). The 뽑기's passes:

| Pass | Track | Needs | Files | Size (rough) |
|---|---|---|---|---|
| GA1 items, icons, duckling, capsule icon | art | – | sprites.js, check-sprites.js, anchors.js | 8 worn items (10 frames), 2 effect icons, `fx_duck` (2), `ic_cap` |
| GA2 machine, crank, capsules | art | – | sprites.js, check-sprites.js | `gacha`, `gacha_h` (4), `cap` (4), `cap_t` (4), `cap_b` |
| G1 catalog + pure draw logic | code | looks L3 | game.js (constants, retired guards, pure functions, `PG.debug.draw` pure parts), check-shop.js, tests/gacha.js (13.1 items 1-4), tests/shop.js (catalog counts), run-all.js (job `gacha`) | ~160 + 140 + 320 |
| G2 data: store v 4, cloud v 4, rules | code | G1 | game.js (store, `drawCommit`, `drawLost`, cloud), firestore.rules, check-shop.js, tests gacha.js (5-8) / cloud.js / trophies.js, FIREBASE-SETUP.md | ~260 + 110 + 500 |
| G3 the 뽑기 tab, 상점 cells, effects | code | G2, GA1 | game.js (hub, effects), page.html, tests gacha.js (9-11 without the animation) / shop.js / shop-net.js, run-all.js (`gacha-fit-*`, `gacha-hub-*`) | ~450 + 120 + 550 |
| G4 the show: animation and sounds | code | G3, GA2 | game.js (`drawTick`, `drawDrawCanvas`, skip / guard / tab-switch, `uiSfx`), audio.js, audio-node-test.js, tests gacha.js (9's animation), run-all.js (animation shots) | ~220 + 90 + 200 |

### GA1 — the items, the icons, the duckling (art track)

- **Do:** §4.2 (the 8 worn items in their limits, `ic_e7`, `ic_e8`, `fx_duck`, `ic_cap`), their pivots and sizes,
  `PG.ITEM_SIZE`'s pattern; check-sprites: sizes, frame counts, every 4.4 limit (`RIM.f9`, the four-side ink, hd's
  colours), anchors.js' `ITEM_IDS`; the contact-sheet rows.
- **Accept:** `node tools/check-sprites.js` OK; run-all `check-sprites sprites v3-sprites check-integration sprites-items`
  green (game.js does not read the new sprites until G1 / G3); looked at: every new item alone on dark and the 5 themes,
  on every animal's idle 0 and every anchored frame + mirror + portrait (hd / he on every head with the yuzu and the cat's
  ears cleared, hd clearly not gold beside hc; f8 readable on the duck with no yellow at the eye; f9's foam outline; n9
  square, not a bubble; b8's straps and fins vs b4; b9 an open S, never a ring, above the feet in the frog idle 1 and the
  otter dash); `fx_duck` beside each animal's feet on the 5 themes (the yellow 사우나 계단 included) and beside P1's yellow
  ground marker.

### GA2 — the machine, the crank, the capsules (art track)

- **Do:** §8's `gacha`, `gacha_h`, `cap`, `cap_t`, `cap_b`; check-sprites: sizes, frames, `cap`'s rarity keys, no `R` in
  `gacha`; a contact-sheet row at 4x.
- **Accept:** `node tools/check-sprites.js` OK; run-all `check-sprites sprites check-integration` green; looked at: the
  machine at (4, 3) on the hub backdrop (feet on row 30), the four crank frames, the capsules of each rarity whole and
  halved, at 4x.

### G1 — the catalog and the draw logic (code track)

- **Do:** §2 (the 10 `ITEMS` entries, `VB_ROBE`, `DRAW`, `drawW`, `DRAW_IDS`, `DRAW_POOL`, `DRAW_ONLY`, `isPoolId`,
  `GACHA_TEXT`, the retired guards); 5.3-5.4 (`drawCands`, `drawPick`, `drawInt`, `drawDone`, `DRAW_T`);
  `PG.debug.draw.cands / odds / rng / sim`; check-shop 13.3 G1 (the rules block check stays as it is until G2);
  `gacha.js` items 1-4; run-all job `gacha`.
- **Hidden until G3:** `hubFillShop` filters out `it.dr` items (one condition, removed in G3), so the 상점 does not show
  items nobody can get yet; `OWNABLE` still counts 40 at `TRO_V 3`.
- **Accept:** run-all `gacha check-shop shop shop-net kits sprites final-e2e final-e2e2` green; the pace numbers of 3.7
  reproduced by `drawPace`.

### G2 — the data: store v 4, cloud v 4, rules (code track)

- **Do:** §5.1-5.2 (`TRO_V 4`, the fields, `drawLogParse` with the id, `dn ≥ gd.length`); `drawCommit` (5.5: no refund
  clamp, the batch id) and `drawLost`'s store logic (5.6; its UI line comes with G3); §7 entirely in game.js (`CL_V 4` and
  every function of 7.2, the join reset, the spent check); the rules (7.3, the generated block by
  `node tools/check-shop.js --write`, the grow-only check, the header's honest limits); check-shop 13.3 G2; `PG.debug.draw`
  `commit` / `state`'s store parts; tests `gacha.js` 5-8, `cloud.js` (13.2), `trophies.js` versions; FIREBASE-SETUP.md.
- **Accept:** run-all `gacha cloud check-cloud check-shop cloud-rec cloud-title cloud-my-out trophies trophies-net shop pwa final-e2e`
  green; then, by hand, every case of 7.6 in the emulator or the Rules Playground (with looks 6.6's and the S5 hand
  check). No visible change: the artifact may ship (nothing to draw yet); a deploy built after G2 is consistent (publish
  the v 4 rules first).

### G3 — the 뽑기 tab, the 상점's draw-only cells, the effects (code track)

- **Do:** §6 except the animation — draws reveal at once (the result view from the log, "두근두근…" not shown) — the third
  tab, the machine view (its canvas shows the tub backdrop until G4 draws the machine), the buttons
  with the 350 ms arm and its announcement, the odds panel with its three columns, the result view (`DRAW_GUARD` on
  buttons, canvas and grid, 지금 {on} / {off}, `#pg-gacha-sr`), "지난 뽑기 결과예요", `drawLost`'s line, the 상점's
  draw-only cells and "뽑기로 가기", the dots, keys and focus, the fit CSS (`.pg-items10`, the container), the footer's
  확률 보기; §4.3 (e7 `drawDucklings`, e8, the particles' `big` / `sw`, the preview's walk for `'7'`); `OPT_SPR`
  `ic_cap`, `fx_duck`; check-shop's item art an error; `gacha.js` 9-11 (without the animation), `shop.js` and
  `shop-net.js` additions; run-all jobs `gacha-fit-320|360|390|844` and the shots `gacha-hub-<state>-<w>`.
- **Accept:** run-all `gacha gacha-fit gacha-hub check-shop shop shop-net trophies final-e2e final-e2e2 pwa cloud v3-title ux-roomrow room-platform`
  green; looked at: `gacha-hub-first-320` (the first-draw line, the tab dot on its tab), `-armed-320`, `-poor-390`,
  `-odds-390` (the tables and rules), `-res1-new-320` (a 전설 on my animal with its pill), `-res1-dup-390` (the refund
  line), `-res10-320|390|844` (ten cells 5 × 2, NEW dots and refunds), `-done-390`, `-shopcell-320` (a draw-only cell
  in the 상점 with "뽑기로 가기"), `-e7-390` (the ducklings following in the preview), `-1x`; `shop-hub-full-320` and
  `shop-hub-ani-320` with three tabs (the tab row on one line); a battle frame with e7 / e8 wearers on the 사우나 계단 and
  대리석 arenas.
- **May ship** (a working draw without the show); Release B waits for G4.

### G4 — the show: animation and sounds (code track)

- **Do:** §6.6 (the frame-driven animation on the 뽑기 canvas with GA2's sprites, the ten-capsule roll-out, the ascending
  reveal, skip with its 24 f guard, 건너뛰기 at the right end, the tab switch, reduced motion), §9 (`uiSfx(n, o)`,
  `VARIANTS`, the four recipes, the duplicate's silent reveal), `OPT_SPR` `gacha` / `gacha_h` / `cap*`, check-shop's
  machine art an error; `audio-node-test` group and rebaseline; `gacha.js` 9's animation items; shots
  `gacha-hub-anim-390` (t = 70: the capsule wobbling at the centre), `gacha-hub-anim10-390` (t = 150: half the cells open),
  `gacha-hub-pop-844` (t = 88: rays).
- **Accept:** run-all `gacha gacha-fit gacha-hub audio-node check-shop shop final-e2e` green; looked at: the three
  animation shots (the machine standing on the floor, the capsule inside the canvas, rays not clipped), `-res10-390`
  (the best result last and selected).
- **Release B:** the artifact ships after G4 (request B done). The deploy: as after G2.

### The combined order (both docs; looks-per-animal.md 12 has the same table)

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

- Code passes run strictly in this order, one agent each. Art passes may start at once (they touch no code-pass file);
  their suite runs are serialized with the code passes'.
- The store and the cloud move together in L1 and in G2, so the release gate holds after every pass; the deploy may be
  built after any pass from L0 on: publish that version's rules first, then the page, then refresh every device.

---

## 16. Not in v1

- Free or daily draws, draw tickets, login rewards that draw: they make items without play.
- Rate-up banners, limited-time items, a draw history beyond the last batch, trading duplicates, a "dust" exchange
  (duplicates already pay back coins).
- Showing friends' draws or a "lucky" feed in the room: draws stay private (nothing about them is sent).
- A "한 번 더" button in the result.
- Buying coins in any form.
- Refunds riding with their draw in the rules (a per-draw `ce` allowance): not needed for correctness; the write burst of
  7.2 is accepted.

---

## 17. Review log (2026-10-19)

Three reviews (economy, compatibility, UX) of this doc and looks-per-animal.md, verified against the code. Applied:

- **Versions (econ #3, compat #1):** no shared v 3. Looks owns store / cloud v 3, this doc v 4 / v 4 (contract,
  5.1, 7.1, 7.3); the gacha tests' "newer" cases are v 5. The alternative (one bump carrying every 뽑기 field in L1) was
  not taken: it would put G1 and all of G2's cloud logic inside L1 and delay request A.
- **Release gate (econ #4):** G2 moves store and cloud together, so the gate `{4: 4}` holds after every pass (7.7). Keying
  the gate on "any `dr` item exists" was not taken: G1 adds the items hidden at v 3 and would turn red.
- **econ #1** re-roll by forced sign-out: parked (looks L0); the hard block was not taken (looks 6.7). **econ #2** pity
  re-armed by sign-in: the join reset (3.3); the soft-cap part is looks 6.7. **econ #5 / compat #2** `clEqOut` knows `gd`.
  **econ #6 / compat #5** grow-only `DRAW_IDS` / `poolIds`, retired items keep their rules entries (2, 7.4). **econ #7**
  the spent check in `clStep` (7.2). **econ #8** done = every draw-only item owned (3.6). **econ #9** honest limits (7.5).
  **econ #10** the refund is never clamped (3.5; compat #10's wider parse not needed). **econ #11** the batch id
  (5.1, 5.6). **econ #12** pace numbers (3.4, 3.7, 13.1).
- **compat #3** `clFold`, `clCnt`, `clZero`, `at`, the no-change test (7.2). **compat #4** the catalog policy (contract).
  **compat #11** `dn ≥ gd.length` (5.2, 7.2). **compat #12** rules ↔ `CL_V` checks (7.7, looks 6.7). **compat #13** API
  names (contract). **compat #14** the refund write burst documented and tested (7.2).
- **UX #1** tab row (looks 4.0). **UX #2** the 뽑기 view names its animal (6.3, 6.7). **UX #3** f8 / f9 inside the face
  limits, no Y by the eye, `RIM.f9` (4.2, 4.4). **UX #6** no head row, 5 × 2 grids, budgets (6.2, 6.11). **UX #7** skip
  guard, 건너뛰기's place, `DRAW_GUARD` on canvas and grid (6.2, 6.6, 6.7). **UX #8** 350 ms arm, the spoken arm (6.4).
  **UX #9** e7 followers (4.3). **UX #10** e8 visible, renamed "뜨끈뜨끈 온천 기운" (not "…온천 김": e1 is "김 모락모락").
  **UX #12** sounds (§9). **UX #13** n9 (4.2). **UX #14** machine and capsule geometry (6.6, §8). **UX #18** one meaning
  for a canvas tap (6.3). **UX #19** focus only on opening (6.10). **UX #20** tab dots (looks 4.0). **UX #21** tab switch
  mid-animation (6.6). **UX #22** 1회 / 10회, "뽑기로 가기", 두근두근…, {off} after wearing. **UX #23** the odds' three
  columns (6.5). **UX #24** hd pearl (renamed "진주 이태리타올"), he's straw at the back, b8's straps and fins (4.2).
  **UX #25** ascending reveal (6.6).

### As built (GA1 / GA2, 2026-10-19)

- `src/sprites.js`: `IT.hd he f8 f9 n9 na b8 b9` (sizes / pivots as 4.2; f8 / f9 9×4 with art ≤ 5×3 / 9×3), `ic_e7`,
  `ic_e8`, `fx_duck` (2), `ic_cap`, `gacha` 20×28, `gacha_h` (4), `cap` / `cap_t` (4: 보통 E/h, 고급 t/T, 희귀 v/V, 전설
  Y/y), `cap_b`. Palette unchanged (57 keys). `PG.ITEM_SIZE`'s pattern is `/^(it_|ic_|slot_|fx_)|^(coin|shop|lock|gacha|
  gacha_h|cap|cap_t|cap_b)$/` - exact `cap` names, since §8's `^cap` would also take every `capy_*` sprite.
- Deviations from 4.2, found on the sheets: `ic_e7`'s two ducklings are staggered (the far, small one up-left, a clear gap)
  - side by side they merged into one yellow blob on the dark cells, where the ink vanishes; `fx_duck`'s head top is bare
  Y (outlined it read as a dash beside the feet); `b8`'s cyan bottle is the far one (what shows past the body; b4 is
  pink); `ic_e8`'s wisps are three S-curls. The machine has a 1 px `a` axle stub at (19, 14) meeting `gacha_h`'s stub.
- `tools/check-sprites.js`: the new sizes / frames (required), `RIM.f9 = 'W'`, hd / he ≤ 4 px above in idle 0, hd no
  `Y y L R r`, f8 no `Y`, n9 no c beside w, b9 has no enclosed hole (open S), `cap` / `cap_t` rarity keys per frame and
  w / W bottoms, `gacha` no `R` and feet on row 27, `gacha_h` a knob in four places, `fx_duck`'s keys.
  `tools/anchors.js`: `ITEM_IDS` + the 8, and `shop-art.html?s=gacha` (the machine + crank frames in the 32×32 view,
  capsules whole / halved and icons at 4x+, 1x / 2x on the themes and cards, `fx_duck` behind every animal with P1's
  yellow marker on dark and the 5 themes). Known soft spot: f9's white foam on the white cat reads only by its W rim.

### As built (G1, 2026-10-19)

- game.js: §2 as written (`VB_ROBE`, the 10 entries, `DRAW` .. `isPoolId`, `GACHA_TEXT` warmed with `SHOP_TEXT`), the
  `!it.retired` guards, `hubFillShop` hides `it.dr` (until G3). The draw block sits after the hub block. Additions:
  `drawOne(S, rare)` books ONE draw (5.5's loop body) and is shared by `drawCommit` and the simulation; `DRAW_L` caches
  the normal / 희귀+ candidate lists (the sim draws ~1.3 M times); `drawOdds(own)` gives the panel's data as weights
  (`rows[].items = [id, w, wRare, wPity]`, column sums); `drawSim(runs, seed)` (mulberry32) is the pace simulation -
  gacha.js' `drawPace` runs it through `PG.debug.draw.sim`. Debug extras: `pick int one done consts w isPool text`;
  `PG.debug.shop.retire(id, on)` stubs a retired item.
- **Spec slip:** the 10회's 희귀+ list has **17** items (희귀 7 + 5, 전설 2 + 3), not 21; Σ 2,100 and 81 / 19 % hold.
- Pace (seed 20261019, 20,000 runs): avg 62.9 draws (p10 50, median 63, p90 75, max 91), longest gap 10, net 10,973,
  shop value 4,143, a fresh 10회 2.92 new draw-only items (always a 희귀+), 15 singles 3.52, first draw 100 %.
- check-shop: the slice runs to `GACHA_TEXT`; the 40 sold + starter keep the old checks, the 10 draw-only items their
  own; a list of §6 strings; missing draw-only art is a WARN; `OWNABLE` counts `dr` ids from `TRO_V 4`. Tests whose
  junk became real ids: shop-net's forged set `9z9z9` -> `9zzz9`, cloud.js' junk eq `zz9z9` -> `zzyzy` (n9 exists now).

### As built (G2, 2026-10-19)

- Store `TRO_V 4` and cloud `CL_V 4` as 5.1-5.2 / 7.2; `drawLogParse` is a top-level function. `drawCommit` = one
  `troMut` over `drawOne`; it records `HUB.draw.mine`; `drawLost()` runs at the storage event and sets
  `HUB.draw.lost` (G3 shows the line). `clStep`'s spent check drops the bought item first, then draws. `PG.debug.draw`
  `state` (store parts) / `commit` / `lost` / `forget`; `PG.debug.cloud` `pool` / `cnt` / `eqOut`, `doc.sum` + dn / gd.
- **L0 minimum (deferred pass):** `clSignOutNow` parks the account copy when `clDirty` is `'hard'` (a forced sign-out
  with unsaved draws or coins); the next sign-in of that account restores and pushes it (cloud.js checks it). The rest
  of looks L0 stays deferred.
- Rules: 7.3 + the generated block (`check-shop --write`: `poolIds`, `drawPrice`, `drawMax`; the header's 3-line
  comment is part of the block), the grow-only check, the rules <-> `CL_V` check, honest limits in the header and
  FIREBASE-SETUP.md (§11 and §12 item 6). **Not done: the emulator / Rules Playground hand check of 7.6** (the
  1,000-expression limit included) - it needs the Firebase project; cloud.js' JS port runs every 7.6 case (the
  duplicate's refund is +30 there: 10 s after the last write the cap is 35, not 60).
- gacha.js 5-8: the other tab of item 8 is emulated (its write on the same key + a StorageEvent); its UI parts (chip,
  pity line, the armed button's "{n}개 더 모아요") come with G3. cloud.js: `drawPureTests` (a 10회 of duplicates
  refunds in 47 writes) and `drawSyncTests` (frames: one draw, b9 worn on the cat, the join's pity reset and back, the
  forced sign-out park, v 3 -> v 4). Version bumps in trophies.js, shop.js, cloud.js (newer = v 5).

### As built (G3, 2026-10-19)

- game.js: the 뽑기 block after the pure draw (`drawShown`, `drawBtnState` / `drawBtnFill` / `drawTap`, `drawCell`,
  `drawResCell`, `drawStart`, `drawReveal(silent)`, `drawSay`, `drawPast`, `drawLine`, `hubFillDraw`, `drawResGrid`,
  `drawOddsFill`, `hubDots`); the arm reuses `HUB.armId` (`'draw1'` / `'draw10'`) so `hubDisarm` covers it. `hubGrid`
  gains mode `'draw'` and an optional store (the show's pre-draw copy); `hubBack` / `partDraw` are shared helpers.
  `lookSet` clears the NEW mark of what it wears. `PG.debug.draw` gains `tap / tick / open / ducks / guard`; `state()`
  carries the view (§12).
- The result view tries its result on unless it was taken off there (`bare`), so 벗기 visibly changes the animal; a
  collection cell follows the 상점 rule (tried on only when not owned). A tap on another collection cell in a one-draw
  result view leaves the result (after the guard). Auto-selection (the reveal, the 상점's opening) never clears a NEW
  mark - only a tap / selection or wearing does.
- 확정 column: when nothing is missing every cell is "–" and its header gets a "다 모았어요" line. Rules lines are
  built from `DRAW` (5 : 2 : 1 by gcd, 81 / 19 % rounded to whole percents).
- e7: the hub's stand-in moves to x 12 for e7 so both ducklings fit; the duckling state lives in `lookFx` (`duckStep`),
  `drawDucklings` draws from it (the world: before every body; the hub: before the animal). e8's colour alternates every
  two wisps, so each flank gets both. The arena probe covers the 4 battle arenas (the 5th theme has no arena); the
  wisps are measured against the arena with the wearer removed (lowest contrast >= 2).
- `gacha-hub-first-320` shows the 뽑기 tab's first visit (the visit itself clears the tab dot); the dot on its tab is
  seen in `shop-hub-first-320`. The "page without the gacha sees b9 bare" stub of 13.2 is covered by shop-net's forged
  sets (unknown ids are bare) rather than a second page build.
- Tab order follows 6.2's markup: the open odds panel (its <summary>) comes before the grid, not after it as 6.10
  lists. shop.js / shop-net.js: the per-slot counts and the hub-tab keys updated for three tabs; b9 worn in the room is
  checked in the rosters (the room card is a bust: 등 is not drawn there).

### As built (G4, 2026-10-19)

- game.js: `drawStart` builds `HUB.draw.anim` (`n, f0, last, calm, before` - a copy of the store before the draw, which
  the collection, caption and dots show until the reveal -, `co, order, open, flash, grid, view`); `drawTick` runs the
  frame events (`drawAnimEvent`: sounds, the ten cells, the reveal) and paints every 2nd frame; `drawCapAt` is the one
  draw's capsule path. The opening order is ascending rarity / draw order with **the best moved last** (a tie in
  rarity could otherwise open it earlier). The reduced-motion choice is taken at the start of a show.
- Sprite sizing: `sizeOf` now reads `PG.ITEM_SIZE` for `ic_*`, `fx_*`, `gacha`, `gacha_h`, `cap*` too (it only knew
  `it_ / ic_e / slot_`, so OPT_SPR dropped `ic_cap`, `fx_duck` and the machine as 16x16 misfits - found in the e7 shot).
  check-shop: those seven sprites are errors when missing. The art helper is `gachaArt()` (`drawArt` was taken).
- Sounds go through `drawSfx` (logs the last 40 for the tests, then `uiSfx(n, o)`); `gacha_win` creates its shine
  first so its recipe is not `tro_up`'s. audio-node-test group X (no baseline file exists to rebaseline).
- Tests / shots: `PG.debug.draw.hold(on)` freezes the hub's frames (the cdp shots run in real time);
  `sfxClear`, `art`. Reduced motion reveals at t = 24, so 13.1's probes at t = 30 / 88 became "the canvas unchanged from
  t 2 to 12" plus the model's view (no jiggle, halves, rays).
