# 뽀득뽀득 목욕탕: 비누 코인 · 상점 · 마이페이지 (wearable items) — design spec

Status: **final** (reviewed against the code and against `design/distinction.md` on 2026-10-16; the review's changes are
listed in §20). Implement it in the passes of §19, after distinction.md's passes D1-D4. It builds on the v4 trophies
(`design/trophies.md`, as built), the cloud trophies (`design/cloud-trophies.md`, read §16-17 first: as built) and the
v4 kits (`design/char-kits.md`). Code is referenced by function name, because `src/game.js` is edited by other passes
and line numbers go stale. Pixel coordinates come from the current art in `src/sprites.js`. A scratch script measured
the head rows of every animal frame (§6.1); those numbers are drafts until the art pass signs them off on the contact
sheet.

**The joint contract with distinction.md** (player distinction, the 몬스터 출현 option), in one place:
- `drawEnt` builds what it draws in this order: the frame → its **twin recolour** (distinction §2.5, body keys only) →
  **the worn items composite** (`lookFrame`, 6.2) → a tint (afterimages) → the **ink-ringed slot outline** traced from
  that final frame (distinction §2.3). Items are never recoloured; the ring always wraps body + items.
- `headTop(p)` (6.6) is the one place that knows how tall a hat is. Name tags, tag pointers, the "나" spotlight, stun
  stars, slam speed lines, podium crowns and the flying trophy cups anchor to it. distinction.md D3 adds it as
  `(p) => p.y`; pass S2 here makes it `p.y - lookLift(p.char, p.look)`.
- The feet belong to the ground marker (distinction §2.4): no item draws below the feet line or a ring on the floor.
- Looks and twin colours are both **frozen at match start** (6.5, 7.1): nothing about either changes mid-match.
- Battle coins never count monster kills (3.1), so 몬스터 출현 on or off pays the same.

The user asked (request 3):

> 트로피로 캐릭터에 착용할 수 있는 아이템 살 수 있게 … 상점과 마이페이지를 만드는거지. 크레이지 아케이드 게임 알지 그런것처럼,
> 그래야 사람들이 계속해

The user decided that trophies stay what they are (rank and stakes, unchanged). A **separate** currency, **비누 코인**,
is earned by playing (win or lose, solo too) and spent in the 상점.

Nothing in this spec changes play: coins and items never touch trophies, physics, hit boxes, bubbles, scores or
netcode timing.

---

## 0. Decisions in one table

| Question | Decision |
|---|---|
| Currency | **비누 코인**: earned by playing, never bought with money, never transferable, never affecting trophies or play. The balance is 0..99,999. It is drawn as an 8x8 pink soap disc (sprite `coin`), never as an emoji. |
| Sources | Solo / co-op: **+6 per 탕 cleared, +15 per boss 탕, +50 for the ending, +2 for playing a game of 60 s or more**. Co-op: **+2 per partner I revived** (at most 3 a game). Battle: **2 + 4 per full minute played** (2분 10 · 3분 14 · 5분 22), plus a **place bonus** (4 players +8 / +4 / +2 / 0; 3 players +8 / +4 / 0; 1v1 +6 / 0), plus **+1 per 뽀득 KO** (at most 6). **The day's first paid game: +20**, rising by 5 per day of streak up to +40. |
| Pace | A casual player buys a first item after about 10 minutes (60 coins). One evening with friends (90 min) earns about 430, which is a 희귀 item or two 고급 ones. The 전설 items (950-1,200) come after about two weeks of casual play (≈ 45 min a day). The whole catalog costs 10,450, about seven weeks at that pace (restated by the review of 2026-10-18, 3.7). |
| Anti-farming | Online 연습 경기 (q ≠ 0: tabs of one browser, one device's store) pays nothing. Offline debug battles, offline local co-op and the attract demo pay nothing. AFK pays nothing: a 탕 pays only if I blew ≥ 2 bubbles in it, and a battle or the play coin needs ≥ 5. A walkover pays no place bonus, and a battle under 60 s pays nothing. **Daily soft cap: 400 coins at full rate, then every award is halved.** The day bonus is never halved. What stays possible (moving the system clock, two browsers on one device) is listed in 3.5 and is no faster than playing, except the clock trick, which is the same class as editing storage. |
| Sinks | **40 cosmetic items** in 5 slots at fixed prices by rarity: 보통 60–90, 고급 150–220, 희귀 380–480, 전설 950–1,200. Purchase is direct: no random boxes, no selling, no refunds. A price never changes; a new price means a new id. |
| Slots | **머리 · 얼굴 · 목 · 등 · 효과** (ids `h f n b e`), one item in each slot. |
| Equip | **One global set** (Crazy Arcade style): whichever animal I pick wears it. Every item fits every animal, through per-frame anchors. |
| League items | 6 items, one for each league 1-6. One can be bought once the best league ever reached (`S.bl`) is high enough, and is kept forever, even after dropping back down. |
| Starter | **초록 때타월 리본** (`n1`): every player owns it, but nobody wears it until they choose to. |
| Rendering | Each sprite frame has five anchor points (H head, E eye, N neck, B back, W waist), authored in `sprites.js`. A **24x24 composite** is cached per (frame, look): back items, then the body, then the front items. `drawEnt` draws it unchanged, so flip, squash, bob, the penguin's dy and afterimages all just work. The twin recolour (distinction §2.5) is applied to the body **before** compositing, and in multiplayer the ink-ringed slot outline traces the composite. |
| Hidden | Items are hidden in the die tumble, in trapped and ghost bubbles, in the turned fallback poses, on the 8x8 life icons and on the HUD. Effects are culled under `reducedMotion()` and by the particle budget. |
| Storage | Coins and items live in the trophy store, so the cloud carries them. **`TRO_V` 1 → 2** with a lossless migration. The counters `ce` (earned) and `sp` (spent), the owned list `own` and the worn set `eq` are clamped and validated in `troParse`. |
| Cloud | Each browser slot gains `ce, sp, o, bd, bs` (spent is `sp` everywhere: the store's `cs` is the cloud link record); the account gains `eq`. The doc goes from **`v` 1 to 2** on its first coin write, and older pages then see 'newer'. The rules bound the coin rate per write and allow **at most one new item per write, appended, with `sp` rising by exactly its price**. Ids come from a generated catalog list. |
| Net | `'hi'` gains `lk`. A new guest → host message `'eq'` sends the worn set when it changes **in the room**. A room-phase seat becomes `[slot, nick, char, ready, cup, lk]` (`lk` only when not bare). **Looks are frozen at match start**: game-phase R and snapshot rows are unchanged, so the snapshot budget (already at 3,390-3,399 bytes in the worst 4-player cases) loses nothing. **NET_V stays 4**, and old pages simply see bare animals. |
| UI | Title: a **상점 button at the end of the start row**, and the trophy badge opens **마이페이지**. Both live in one full-stage panel **`#pg-hub`** (like 친구와 하기 and the room: 15 px type, scrolls) with two tabs **[상점 · 마이페이지]**; 마이페이지 has a **내 기록** button that opens today's `#pg-rec` card unchanged. The room gets a 꾸미기 button. Coins show as a row on the 목욕 끝 / ending cards and as an alternating line on my podium block. Wear verbs follow the slot: 머리 쓰기/벗기, 얼굴·목·등 하기/빼기, 효과 켜기/끄기. |
| Not in v1 | Bubble skins and name-tag skins (both carry gameplay or player-identity information), gifting, trading, a coin leaderboard, seasonal items, and buying coins. |

---

## 1. Ground truth from the code (what this builds on)

| Thing | Code | Consequence |
|---|---|---|
| Trophy store | `ppogeul-trophy` JSON, `TRO_V = 1`, read only through `troRead` / `troMut` (read-modify-write) / `troParse` (field-by-field clamps; an unknown `v > TRO_V` → `'newer'` → read-only). `troSync()` runs after every change and on the other tabs' `storage` event. | Coins go **in this store** (one atomic write; the cloud link record `cs` already lives there). If the fields were added without a version bump, an older page would drop them on its next `troMut` (troParse "drops unknown ones"), and coins and items would be lost. So `TRO_V` becomes 2. Older pages then see 'newer' and turn read-only. |
| Cloud | Per-browser absolute slots `s.<key> = {t, w, g, ko, best, bl, seen, hi, day, de, n, at}`. The view = the other slots + mine; mine = `c + (S − v)`. `clStep` caps every write to what the rules allow. The rules require the exact slot keys (`hasOnly`) and `d.v == 1`. | Coins follow the same absolute-slot model (`ce`, `sp` like `t`). The owned items are a grow-only set per slot (union = the account). Because a slot shape change needs a rules change and a doc version, the doc gets `v: 2`. |
| Sprites | 16x16 frames baked from string rows with a shared palette (**57 of 64 keys used**). `finishFrame` makes `{c, m, wh, whm}` (mirror and white silhouettes). `outlineOf(f, flip, color)` and `tintOf` are cached per frame in `lookCache`. Trapped and ghost frames are 10x10 curled minis. Portraits are hand-built 32x32 busts. | Items are new string-row frames that use only existing palette keys. A composite is just another frame object, so every existing draw path (outline, white flash, tint, mirror, squash) works on it. |
| Drawing a player | `drawPlayer` → `moveLook` (pose) → `drawEnt(name, fi, x, y, flip, o)`. `o.sq` scales around the feet centre. `o.outline` is the slot colour in `multi()`. The water bob and the penguin's `dy 3` go into y. `drawTurned` is used only for the fallback poses. `drawEnt` centres a frame horizontally and bottom-aligns it. | A 24x24 composite with the body at (4, 8) lands exactly where the bare 16x16 frame did, with no change to `drawEnt`'s maths. |
| Name tags | The DOM tag sits at `p.y − 5 (− 9 on the podium)`; the 5x3 arrow at `p.y − 5 .. p.y − 3`; the podium crown at `p.y − 7`. | A hat above the frame top would cover the arrow. Tags, arrows and crowns lift by `lookLift` (6.6). |
| Room info | `roomInfo()`: seats `[slot, nick, char, ready]` + the count in the room phase only. R rides in **every** snapshot (SNAP_LIMIT 3400; the worst measured 4-player snapshots are 3,390-3,399 bytes after trimming, so every byte added to R comes out of the trim levels). `guestRoom` keeps the room's last counts when the game-phase R has none. | Looks ride in R **in the room phase only**, after the count. In the game phase a guest keeps the room's looks exactly as it keeps the counts, and each player's look is frozen at match start. |
| Messages | Guests send `hi`, `nk`, `pk`, `rd`, `cup`, `gg`. The host validates each one in `netMsgIn` and sets `NET.roomDirty`. | `'eq'` is one more case there. |
| Results | `troBonus` pays the 목욕 보너스 at the over / ending cards (`troCard`). `troRunStart` starts a run at `newGame` / `newCoop` / `continueLoop`, or for a guest at its first snapshot (`guestBegin`). `endBattle` → `troHostResult` → podium. A guest's podium arrives as `g.ph === 'd'` with `g.pd`; `g.tl` is the battle clock in frames (0 at the podium). | Coins hook into the same places: `nextRound` (a 탕 cleared), the over / ending cards, `endBattle`, and the guest's first `'d'` snapshot. |
| Practice | `troPractice()` → q 1 (bc tabs), q 2 (one device's store), frozen into `NET.q` by `netAgain`. | Coins use the same q: practice pays nothing. |
| Title card | At 1x the screen is 23.3em × 20.4em (`--fs` 11 px); a 320 px phone is 25.6em × 22.4em (`--fs` 12.5). The `.pg-best` line is full at 1x (16.84em of 17.01em, cloud §16). The two start buttons leave about 33 px free in their row at 1x and about 53 px on a 320 px phone. The card must not scroll at 1x. | The only free spot that needs no height is the **end of the start-button row**, and it fits only after the start buttons' side padding is trimmed at narrow widths (9.1). |
| Overlays | `OVERLAYS` are exclusive (`showOverlay(name)` hides the others, the online panels included). `#pg-friends` and `#pg-room` are `.pg-panel`s: full-stage, a fixed 15 px type, `overflow-y: auto`, outside the 256x224 screen. `#pg-rec` and the title are `.pg-ov` cards inside the screen, sized in em, which must not scroll at 1x (cloud §17 fix 10: 내 기록 is already at its limit). `onKeyDown` treats `'friends'` / `'room'` as plain forms, while `'rec'` closes on Escape / Enter / Z / X. `primaryAction` starts a solo game on the title. | The hub is a third `.pg-panel` (`'hub'`), so a 40-item shop never fights the 1x screen. It behaves like a plain form: Escape closes it, and nothing in it starts a game. Opened from the room, it returns to the room. `#pg-rec` is not changed at all. |
| Shots | `fire(p)` blows every bubble; for a guest it calls `guestFire` (which sends `{t: 'shot'}`); the host's `hostShot` blows a remote player's bubble through the same path. `shootSfx` is only the sound. | The anti-AFK shot counter hooks the top of `fire(p)` for **my** animal only (3.3). |
| Nick | `netSetNick(s)` (cleans the nick, stores it, sends `nk` in a session, sets the cloud nick). | 마이페이지's name field calls `netSetNick`. |

---

## 2. Constants (top constants block, next to `TRO_TEXT`; `REQUIRED`, `SPR_SIZE`, the font warm-up and `troParse` read them at load)

```js
  // ---- v4 shop (비누 코인 · 상점 · 마이페이지, design/shop.md): constants up here - REQUIRED / SPR_SIZE, troParse and the
  // font warm-up read them at load (the shop code itself is its own section after the trophies)
  const COIN_MAX = 99999, LOOK0 = '00000', LOOK_SLOTS = ['h', 'f', 'n', 'b', 'e'];
  const COIN = {
    round: 6, boss: 15, ending: 50,            // solo / co-op: a 탕 cleared (a boss 탕: 15 instead of 6); the ending (each 회차)
    play: 2, playF: 3600,                      // solo / co-op: a game of >= 60 s that I played
    revive: 2, reviveMax: 3,                   // co-op: each partner I revived, paid for at most 3 a game
    bBase: 2, bMin: 4, minF: 3600, walkF: 60,  // battle: 2 + 4 per full minute played (pays from 60 s; > 60 f early = walkover)
    place: { 2: [6, 0], 3: [8, 4, 0], 4: [8, 4, 2, 0] },   // battle place bonus by players at 시작! (not for a walkover)
    ko: 1, koMax: 6,                           // battle: each 뽀득 KO, at most 6 a match
    roundShots: 2, gameShots: 5,               // anti-AFK: a 탕 pays if I blew >= 2 bubbles in it; a battle / the play coin: >= 5
    day: [20, 25, 30, 35, 40],                 // the day's first paid game, by streak day (day 5 and on: 40)
    soft: 400,                                 // coins a local day at full rate; then every award is halved (the day bonus never)
  };
  const RARITY = [ { name: '보통', col: '#c4b99f' }, { name: '고급', col: '#6fd08a' }, { name: '희귀', col: '#c9a8ff' }, { name: '전설', col: '#ffb24a' } ];
  // on: the wear verb, off: the take-off verb, done: the bought / worn message (a hat is 쓰다, never 입다)
  const SLOT_INFO = { h: { name: '머리', at: 'H', on: '쓰기', off: '벗기', done: '썼어요' }, f: { name: '얼굴', at: 'E', on: '하기', off: '빼기', done: '했어요' },
    n: { name: '목', at: 'N', on: '하기', off: '빼기', done: '했어요' }, b: { name: '등', at: 'B', on: '하기', off: '빼기', done: '했어요' },
    e: { name: '효과', at: '', on: '켜기', off: '끄기', done: '켰어요' } };
  // the catalog (section 4): id = slot letter + one base-36 digit (the worn set stores that digit; never reused); rar -1 = 처음 선물
  const ITEMS = [ /* { id, name, rar, price, lg, at?, fx?, desc } x 40, section 4 */ ];
  const ITEM = {}; ITEMS.forEach((it) => { it.slot = it.id[0]; ITEM[it.id] = it; });
  const STARTER = 'n1';
  const SHOP_TEXT = /* section 12 */;
```

- `ITEMS` is built only from literals, so it is safe at load. Every lookup goes through `ITEM[id]` with `typeof id === 'string'`. An inherited key such as `'constructor'` can never match, because ids match `/^[hfnbe][1-9a-z]$/` (`isItemId`).
- The catalog order is the display order: by slot, then by price.

---

## 3. Economy

### 3.1 Sources

| Source | Coins | Who | When paid |
|---|---|---|---|
| 탕 cleared | **6**, or **15** for a boss 탕 (indexes 5, 11, 17, 23) | solo; co-op: every teammate who blew ≥ 2 bubbles in that 탕 | at the clear (`nextRound` on the host / solo; the guest when the snapshot's round index moves on) |
| Ending (all 24 탕) | **+50** on top of the last boss's 15 | the same | when the ending card shows (each 회차) |
| 참가 (played a game) | **2** | solo / co-op, for a game of ≥ 60 s with ≥ 5 bubbles blown | at the 목욕 끝 / ending card |
| 구조 (co-op revive) | **2** each, at most **3** paid a game (6 coins) | the reviver (`p.revives`; for a guest, snapshot row index 10) | at the card |
| Battle base | **2 + 4 × full minutes played** (2분 10 · 3분 14 · 5분 22) | every finisher with ≥ 5 bubbles blown and ≥ 60 s played | at the podium (host: `endBattle`; guest: the first `'d'` snapshot of that game id) |
| Battle place | 4 players **+8 / +4 / +2 / 0**; 3 players **+8 / +4 / 0**; 1v1 **+6 / 0**. Tied players share the average of their places' bonuses (floored). If everyone ties, everyone gets the average. | finishers of a match that ran its clock | the same |
| Battle KO | **+1** per 뽀득 KO, at most **6** | the same | the same |
| Day bonus | **+20** on streak day 1, then **+25 / +30 / +35 / +40** (day 5 and on stays 40). A missed local day resets it to day 1. | the first result of the local day that paid > 0 coins, in any mode | with that result |

A 4-player battle, full time, before KOs:

| Length | 1st | 2nd | 3rd | 4th |
|---|---|---|---|---|
| 2분 | 18 | 14 | 12 | 10 |
| 3분 | 22 | 18 | 16 | 14 |
| 5분 | 30 | 26 | 24 | 22 |

### 3.2 Battle coins (pure, every client computes its own, never sent)

```js
  // my coins for a battle that reached the podium. n = players at 시작! (CO.n), fin = the finishers best first
  // (G.podium.order -> {slot, sc, k, ko}), me = my slot, leftF = the clock's frames left when it ended (host: captured in
  // endBattle before it zeroes G.battle.left; guest: the host's end clock te from the podium snapshot - review
  // 2026-10-18, see the note), timeF = NET.opts.time * 3600, shots = bubbles I blew this match, kos = my 뽀득 KOs.
  // Pure: PG.debug.shop.battle runs it
  function coinBattle(n, fin, me, leftF, timeF, shots, kos) {
    const played = Math.max(0, timeF - (leftF > COIN.walkF ? leftF : 0));   // (an end within walkF is full time)
    if (played < COIN.minF || shots < COIN.gameShots || !fin.some((r) => r.slot === me)) return 0;
    let c = COIN.bBase + COIN.bMin * Math.floor(played / 3600) + Math.min(COIN.koMax, kos) * COIN.ko;
    if (leftF > COIN.walkF) return c;                           // a walkover: no place bonus (alt farming earns nothing extra)
    const B = COIN.place[clamp(n, 2, 4)];
    for (let i = 0; i < fin.length;) {                          // the same tie groups as troTable (sameRes: score, kos, koed)
      let j = i; while (j + 1 < fin.length && sameRes(fin[j + 1], fin[i])) j++;
      if (fin.slice(i, j + 1).some((r) => r.slot === me)) { let s = 0; for (let q = i; q <= j; q++) s += B[Math.min(q, B.length - 1)]; c += Math.floor(s / (j - i + 1)); break; }
      i = j + 1;
    }
    return c;
  }
```

- Places come from the same order every screen shows (`G.podium.order` / `g.pd`), and ties use the same `sameRes`. So the host and every guest agree, even though each computes only its own number.
- n is the player count at "시작!" (`CO.n`, captured where `troHostGo` / `troGuestGo` run), so a leaver does not lower anyone's bonus scale. A guest counts the player rows of its first `'p'` snapshot (the host's players at that frame), not its own view, which drops a leaver some ticks later (review 2026-10-18).
- **The end clock (review 2026-10-18).** The frame where the clock reaches 0 is already a `'d'` snapshot, so a guest's last `'p'` clock was always a few frames above 0 and `floor()` cost it a whole minute. Two fixes: an end within `walkF` (60 f) counts as full time, and the host keeps its end clock in `G.podium.te` and sends it as `g.te` in the battle podium's snapshots; a guest pays from that (an older host sends none: its last `'p'` clock). So a guest's payout equals the host-side `coinBattle` for its slot with that clock, and a short link stall at the end is no walkover any more.

### 3.3 Solo / co-op coins (a run, like `TRO.run`)

```js
  // a run: newGame / newCoop / continueLoop start one (host / solo); a guest's co-op run starts in guestBegin. done: the
  // 탕 indexes (loop * N + round) already paid; shots: my bubbles since the last clear; all: my bubbles this game; got:
  // coins given this run (the card shows it); t0: G.frame at the start (the 60 s of the play coin)
  function coinRunStart() { CO.run = G.attract || G.gameMode === 'battle' ? null : { done: new Set(), shots: 0, all: 0, got: 0, t0: G.frame, end: false, rv: 0 }; }
  function coinClear(idx, ended) {              // a 탕 was cleared: each index pays once a run
    const R = CO.run; if (!R || !coinOk() || R.done.has(idx)) return null;
    R.done.add(idx);
    const act = R.shots >= COIN.roundShots; R.shots = 0;
    if (!act) return null;
    const a = (LEVELS[idx % LEVELS.length].boss ? COIN.boss : COIN.round) + (ended ? COIN.ending : 0);
    const res = coinGive(a, true); if (res) R.got += res.give;
    return res;
  }
  function coinEnd() {                          // the 목욕 끝 / ending card: the play coin and the revives, once a run
    const R = CO.run; if (!R || !coinOk() || R.end) return null;
    R.end = true;
    const me = myPlayer() || G.p, rv = me ? Math.min(COIN.reviveMax, me.revives | 0) : 0;
    const a = (R.all >= COIN.gameShots && G.frame - R.t0 >= COIN.playF ? COIN.play : 0) + (G.gameMode === 'coop' ? rv * COIN.revive : 0);
    const res = a > 0 ? coinGive(a, true) : null; if (res) R.got += res.give;
    return { got: R.got, res };
  }
  // offline solo (not the attract demo, not debug local co-op), or online co-op / battle that is not practice
  const coinOk = () => !G.attract && !!TRO.s && !TRO.ro && (G.online ? NET.q === 0 && (G.gameMode === 'coop' || G.gameMode === 'battle') : G.gameMode === 'solo');
```

- **Clear events.** Solo and the host call `coinClear(G.loop * N + G.round, false)` at the top of `nextRound()`; its ending branch calls `coinClear(idx, true)` instead. A guest compares each accepted co-op snapshot's `G.loop * N + G.round` with its last one, and pays every index it passed. When the ending card shows on a guest (round 23 stays 23), it calls `coinClear(23 + loop * N, true)`. The `done` set makes a repeat a no-op.
- **Shots.** `coinShot(p)` at the top of `fire(p)`: when `p === (myPlayer() || G.p)` (solo, a host's own animal, and a guest's own animal, since `fire` hands a guest's blow to `guestFire`), `CO.run.shots++` and `CO.run.all++`, or `CO.bshots++` in a battle. The host's `hostShot` also goes through `fire(pl)` for a remote player; that `pl` is not mine, so it never counts. Only my own engine counts, and it never reads anyone else's input. An otter's 3-bubble volley is one blow (one `fire` call).
- A run is cleared by `toTitle`, `idleWorld` and a battle's `resetGame`, like `TRO.run`. `CO.bshots` and `CO.n` are reset where `troHostGo` / `troGuestGo` run (the "시작!" frame).
- **Revives are paid per run (review 2026-10-18).** `continueLoop` keeps the players and `p.revives` (the MVP pick and the stats use the count), so a run records `rv0`, my revives when it starts (host / solo: `coinRunStart`; a guest: its own row's `r[10]` in the game's first co-op snapshot), and the card pays `min(reviveMax, revives - rv0)`. Without it every later 회차 card paid the earlier revives again.
- **A debug solo start pays too** (`PG.debug.start(round)`, which can begin at any 탕), like the 목욕 보너스: the shop tests need that path. This is local only; anyone with devtools can already edit the store. (Offline local co-op and battles still pay nothing: `coinOk`.)

### 3.4 Giving coins: the soft cap and the day bonus

```js
  const coinBal = (S) => clamp(S.ce - S.sp, 0, COIN_MAX);
  // every coin award goes through here (read-modify-write, so another tab never loses a coin). day: this award may be
  // the day's first paid result (the day bonus). Returns {give, bonus, halved, now, first} or null (read-only store)
  function coinGive(a, day) {
    if (!TRO.s || TRO.ro) return null;
    return troMut((S) => {
      const today = troToday(); if (S.cd !== today) { S.cd = today; S.cde = 0; }
      if (S.bd > troTomorrow(today)) { S.bd = 0; S.bs = 0; }          // a bonus day from a wrong clock: forget it (3.4)
      a = clamp(a | 0, 0, 999);
      const full = clamp(COIN.soft - S.cde, 0, a), half = a - full;
      let give = full + (half > 0 ? Math.max(1, Math.floor(half / 2)) : 0), bonus = 0;
      S.cde = Math.min(99999, S.cde + a);
      if (day && give > 0 && S.bd < today) {                     // (a clock set back never pays a second bonus)
        const st = S.bd === troYesterday(today) ? Math.min(S.bs + 1, COIN.day.length) : 1;
        bonus = COIN.day[st - 1]; S.bd = today; S.bs = st;
      }
      const first = S.ce === 0;
      give = Math.min(give + bonus, COIN_MAX - coinBal(S));      // (the balance stops at 99,999)
      S.ce = Math.min(1e9, S.ce + give);
      return { give, bonus, halved: half > 0, now: coinBal(S), first };
    });
  }
  // the local date before / after YYYYMMDD
  function troDayAdd(d, k) { const x = new Date(Math.floor(d / 10000), Math.floor(d / 100) % 100 - 1, d % 100 + k); return x.getFullYear() * 10000 + (x.getMonth() + 1) * 100 + x.getDate(); }
  const troYesterday = (d) => troDayAdd(d, -1), troTomorrow = (d) => troDayAdd(d, 1);
```

- The soft cap is **per browser** (`cd`, `cde` are not synced). Two devices of one account can each reach 400 on the same day. This is accepted, like the 목욕 보너스 precedent in cloud §5.2.
- The day bonus **is** per account (`bd`, `bs` are synced as a max), so switching devices never pays it twice.
- **A wrong clock never blocks the bonus for good.** A `bd` later than tomorrow can only come from a clock that was (or is) wrong. `coinGive` forgets it (the bonus pays, streak day 1), and the cloud's `clAgg` skips another slot's `bd` later than tomorrow (8.1). Without this, one device whose clock once read 2031 would block the day bonus of the whole account until 2031, because `bd` only ever grows. The cloud slot itself keeps the max (the rules want `bd` to grow): `clStep` writes `max(m.bd, S.bd)`.
- `coinGive` is the only writer of `ce`, and `shopBuy` (5.3) is the only writer of `sp`.

### 3.5 Anti-farming

| Trick | Result |
|---|---|
| Two tabs of one browser in a room (bc) | q 1 → practice → 0 for everyone. Tabs share one store anyway. |
| Two players from one device's store (a copied store, the same Google account on two devices) | q 2 → 0 |
| Idling in a battle or co-op | < 5 bubbles in a battle → 0. A 탕 where I blew < 2 bubbles → 0 for that 탕. |
| Alt profiles: start, let the alt leave, collect | A walkover pays no place bonus, and < 60 s pays 0. The rate stays at the normal ~4 per minute. |
| Replaying the short early 탕 | A skilled player makes about 10 per minute. The 400 soft cap halves the long tail. Accepted. |
| Solo 다시 하기 loops (die early, retry from 탕 1) | Each retry is a new run, so 탕 1-3 pay again. That is ordinary play at ≤ 10 per minute (the slowest cleared 탕 pays the same 6), and the play coin needs 60 s. Accepted. |
| Co-op loops (the ending → 2회차, a team game over → 다시 하기) | 2회차 indexes (`loop * N + round`) are new 탕 and are harder; a team retry is a new run. Same rate as solo. Accepted. |
| 한 판 더 spam | Every battle needs a countdown + ≥ 2 minutes and ≥ 5 bubbles. The best rate is a 2분 winner with 6 KOs: 24 per ~2.3 min ≈ 10 per minute. Accepted. |
| Leaving early | A player whose screen never reaches the podium (or the 목욕 끝 card) gets nothing for that game; 탕 already cleared stay paid. Staying is always worth more than leaving. |
| Two browsers on one device (or a phone and a PC) in one room, one person playing both | Two stores → q 0 → each earns as one player, with ≥ 5 bubbles each. Each store gets about what one honest player gets (≈ 4-8 per minute), and stores never share coins. Accepted. |
| Moving the system clock | Each new local date pays one day bonus (20-40) and resets the soft cap: flipping the clock farms ≈ 40 per flip. Local only and own account only, the same class as editing storage. Accepted and stated here so nobody "fixes" it into a lockout (3.4: a far-future `bd` is forgotten, never trusted). |
| Editing localStorage / devtools | Possible, as for trophies. Coins buy only cosmetics, other players are never affected, and the cloud rules bound a modified page's rate (8.4). |
| Dying on purpose so a friend revives you | At most 3 paid revives a game (6 coins). |

### 3.6 Fairness

- **Losing still pays.** Last place in a 3-minute 4-player battle gets 14 + KOs, against 22 + KOs for the winner (about 64 %). In 1v1 the loser gets 14 against 20.
- **Co-op is never split.** Every active teammate gets the full 6 / 15 / 50 for the team's 탕. The reviver earns a little extra, which rewards helping.
- **Solo earns at about the co-op rate per 탕.** A co-op team that clears faster earns more per minute. That is fine: playing together is the point.
- **Rates.** At casual skill a battle pays a little more per minute (≈ 6) than solo (≈ 4-5: 탕 that end in a game over pay their 6, the slow ones too); a skilled solo player makes ≈ 10. (Restated by the review of 2026-10-18; the first text said "about the same".)
- **능력 끄기 changes nothing**, and neither do the monster switch (request 1), 보스 난입, the arena, the animal, the stake, power-ups, the MVP, the score, the trophy result and the items worn. Only the time played, the place, the KOs and the 탕 cleared count.

### 3.7 Pace (the targets, with the numbers above)

| Player | Session | Coins | Can buy |
|---|---|---|---|
| New, solo, day 1 | game 1: dies in the 3rd 탕 (~4 min) → 2 × 6 + 2 + day bonus 20 = **34**; game 2: dies in the 5th (~6 min) → 4 × 6 + 2 = **26** | **60 at ~10 min** | the first 보통 item (양머리 수건 60) ✓ |
| 4 friends, an evening | ~22 battles of 3 min (avg 19.5 with KOs) + the day bonus 20 ≈ 449; soft cap: 400 full + 49 halved → **≈ 425** | one 희귀 (380–480) or two 고급 (150–220) | "a nice item per evening" ✓ |
| Casual, ≈ 45 min a day | 3 solo games ending in 탕 5 / 7 / 9 (≈ 32 min) + 3 three-minute battles (≈ 10 min) ≈ 190 + the day bonus (20 → 40) | **≈ 210–230 / day**; two weeks ≈ 3,100 (at 30 min a day ≈ 2,200) | all 13 보통 (≈ 990) and several 고급 first, then a 전설 around days 12–16 ✓ |
| Collector | everything | 10,450 | ≈ 7 weeks at 45 min a day, ≈ 5 weeks at an hour a day |

(Restated by the review of 2026-10-18: the casual row said "30–45 min a day" and "≈ 6 weeks", but a simulation through the real awards gave 2,200 for two weeks at 30 min and day 58-67 for the catalog; `paceTests` in `src/tests/shop.js` now models the 45-minute day it claims.)

A full solo clear (24 탕) pays 20 × 6 + 4 × 15 + 50 + 2 = **232** in about 40–50 minutes.

### 3.8 What coins never do

They never change trophies, holds or stakes, and never enter `troTable`, the podium order, scores or any gameplay number. Nothing about coins is sent over the network (each client computes its own, 3.2). Wearing items changes nothing but pixels.

---

## 4. Catalog (40 items)

The prices add up to **10,450**. By rarity: 13 보통 (60–90), 15 고급 (150–220), 8 희귀 (380–480), 3 전설 (950–1,200), and 1 처음 선물 (0). The league column is the best league needed (`S.bl ≥ lg`): 1 뽀득 새내기 · 2 온탕 단골 · 3 양머리 고수 · 4 세신 달인 · 5 사우나 명인 · 6 목욕탕 왕.

The `desc` column is the Korean line the 상점 shows. The art note is for the art pass (size W×H, pivot, palette keys). Pivots: **head** = the brim's bottom-centre pixel; **face** = the near lens / eye centre (front: the bridge); **neck** = top-centre; **back (B)** = the attach pixel at the shoulder; **waist (W)** = the ring's centre.

### 머리 (h, anchor H, drawn in front; ≤ 12×8, typical 10×6)

| id | 이름 | 등급 | 가격 | 리그 | desc (shown) | art note |
|---|---|---|---|---|---|---|
| h1 | 양머리 수건 | 보통 | 60 | – | 분홍 수건을 돌돌 말아 만든 양 귀 | 10×6; a pink towel band with two rolled buns on top; P p q w k |
| h2 | 샤워캡 | 보통 | 70 | – | 주름 고무줄이 귀여운 하늘빛 샤워캡 | 10×5; a puffy see-through dome with a frilled rim; i c C w k |
| h3 | 때타월 두건 | 보통 | 80 | – | 초록 이태리타올을 질끈 묶은 두건 | 10×5; a green scrub-towel bandana, its knot tail behind; t T M k |
| h4 | 귤 껍질 모자 | 보통 | 90 | – | 찜질방 귤 반쪽을 쏙 쓴 모자 | 8×6; half a tangerine peel with a leaf; O o m M k |
| h5 | 바가지 모자 | 고급 | 160 | – | 노란 목욕 바가지를 거꾸로 쓴 모자 | 10×6; an upside-down dipper, the handle sticking out behind; Y y L k |
| h6 | 고무장갑 볏 | 고급 | 180 | – | 빨간 고무장갑이 닭 볏처럼 쫑긋 | 8×7; a red rubber glove, fingers up like a comb; R r w k |
| h7 | 거품 왕방울 머리 | 고급 | 200 | – | 몽글몽글 비누 거품이 머리 가득 | 12×7; a fluffy dome of white bubbles with cyan glints; w W c a k |
| h8 | 금테 양머리 | 고급 | 220 | 3 | 양머리 고수만 쓰는 금테 수건 | 10×6; the 양머리 in cream with a gold rim line; E Y y w k |
| h9 | 오리 머리띠 | 희귀 | 380 | – | 용수철 위에서 고무 오리가 통통 | 10×8; a headband, a spring, a tiny rubber duck on top; Y O o a k |
| ha | 맥반석 계란 투구 | 희귀 | 420 | – | 반쯤 깐 맥반석 계란 껍질 투구 | 10×7; a brown egg-shell helmet with a crack line; f F E w k |
| hb | 사우나 모자 | 희귀 | 450 | 5 | 사우나 명인의 펠트 모자 | 10×6; a cream felt bucket hat with an orange band; E W O o k |
| hc | 황금 대야 투구 | 전설 | 1200 | 6 | 목욕탕 왕의 번쩍이는 황금 대야 | 12×7; a golden washbasin, upside down: a smooth dome with a rim, a white shine and a small cyan soap gem. Not crown-shaped (no points) and **no red**: gold with red gems is the podium / MVP crown's scheme, which stays unique; Y L y c w k |

### 얼굴 (f, anchor E, in front; 2 frames: [profile ≤ 5×3, front ≤ 9×3], see 6.1 `face`)

| id | 이름 | 등급 | 가격 | 리그 | desc | art note |
|---|---|---|---|---|---|---|
| f1 | 하트 볼터치 | 보통 | 60 | – | 볼에 콕 찍은 분홍 하트 | 3×2 heart on the cheek (front: both cheeks, 9 wide); p q |
| f2 | 수경 | 보통 | 80 | – | 파란 끈 수영 수경 | lens 3×2 cyan + strap pixel (front: two lenses + bridge); C c B w k |
| f3 | 새내기 별 스티커 | 보통 | 70 | 1 | 뽀득 새내기가 받은 별 스티커 | 3×3 yellow star under the eye; Y L k |
| f4 | 김서림 안경 | 고급 | 160 | – | 목욕탕 김이 서린 동그란 안경 | round frame, a fogged white lens; k W w |
| f5 | 선글라스 | 고급 | 180 | – | 반짝 하얀 빛이 도는 까만 선글라스 | a black bar lens with a 1 px white glint; k d w |
| f6 | 오이 팩 | 고급 | 200 | – | 눈 위에 시원한 오이 한 조각 | a pale-green slice with seed dots; n m M |
| f7 | 황금 외알 안경 | 희귀 | 400 | – | 줄이 달랑, 황금 외알 안경 | a gold ring on the near eye and a 2 px chain down (front: on the right eye); Y y L k |

### 목 (n, anchor N, in front; ≤ 10×4)

| id | 이름 | 등급 | 가격 | 리그 | desc | art note |
|---|---|---|---|---|---|---|
| n1 | 초록 때타월 리본 | 처음 선물 | 0 | – | 처음 선물! 이태리타올 리본 | 5×3 green bow; t T k |
| n2 | 수건 목도리 | 보통 | 70 | – | 줄무늬 수건을 둘둘 감은 목도리 | 8×3 white / blue stripes, one end hanging 2 px; w b B k |
| n3 | 딸랑 방울 | 보통 | 80 | – | 빨간 목줄에 금방울 딸랑 | 8×3 red collar + a 2×2 gold bell; R r Y y k |
| n4 | 나비넥타이 | 보통 | 90 | – | 물방울 무늬 나비넥타이 | 5×3 navy bow with a white dot; 1 2 w k |
| n5 | 사물함 열쇠 목걸이 | 고급 | 150 | 2 | 온탕 단골의 고무줄 열쇠 | 8×4 an orange coil band with a grey key tag; O o a W k |
| n6 | 거품 진주 목걸이 | 고급 | 200 | – | 비누 거품을 꿰어 만든 진주 | 8×3 white / cyan pearls; w c i k |
| n7 | 세신 달인 금메달 | 고급 | 220 | 4 | 세신 달인에게 주는 금메달 | 6×4 a red ribbon V with a gold disc; R r Y y k |
| n8 | 꽃 목걸이 | 희귀 | 380 | – | 알록달록 꽃을 엮은 목걸이 | 10×3 pink / yellow / violet flowers; p P Y v M k |

### 등 (b, anchor B behind the body, or W split back / front; B ≤ 8×10, W ≤ 14×5)

| id | 이름 | 등급 | 가격 | 리그 | at | desc | art note |
|---|---|---|---|---|---|---|---|
| b1 | 망토 수건 | 보통 | 90 | – | B | 어깨에 두른 분홍 줄무늬 수건 | 6×8 a short striped cape; P p w k |
| b2 | 도넛 튜브 | 고급 | 160 | – | W | 분홍 설탕옷 도넛 튜브 | 14×5 in 2 frames (back half, front half); P p Y c w k |
| b3 | 오리 튜브 | 고급 | 180 | – | W | 앞에 오리 머리가 달린 노란 튜브 | 14×5 + a 3×3 duck head on the front half; Y y O k w |
| b4 | 목욕 바구니 배낭 | 고급 | 200 | – | B | 샴푸가 쏙 나온 목욕 바구니 | 7×8 a pink basket, a shampoo bottle on top; p q c w k |
| b5 | 바가지 등껍질 | 희귀 | 400 | – | B | 거북이처럼 등에 멘 초록 바가지 | 8×7 a green dome shell with a rim; t T M k |
| b6 | 비누방울 날개 | 희귀 | 480 | – | B | 무지갯빛이 도는 비누방울 날개 | 8×8 two **pointed** wings in bubble colours (light colours, no alpha). Never round, and no 2×2 white shine dot: a round shiny shape is what a free bubble looks like in battle; c i v w k |
| b7 | 무지개 망토 | 전설 | 950 | – | B | 바닥까지 펄럭이는 무지개 망토 | 7×10 rainbow stripes; R O Y t b v k |

### 효과 (e, no anchor: particles from the body, 6.7; an 8×8 icon `ic_e<n>` for the 상점)

| id | 이름 | 등급 | 가격 | 리그 | desc | effect |
|---|---|---|---|---|---|---|
| e1 | 김 모락모락 | 보통 | 90 | – | 가만히 있으면 김이 모락모락 | standing still ≥ 30 f: a 2 px white puff at H every 24 f, rising 0.3 px/f, 24 f |
| e2 | 착지 물방울 | 보통 | 80 | – | 착지할 때 물방울이 톡 | landing after vy > 1.5: 4 droplets (#ffffff / #c8f4ff) sideways, 12 f |
| e3 | 점프 반짝이 | 고급 | 200 | – | 뛰어오를 때 반짝반짝 | take-off with vy < −1: 3 one-pixel sparkles (#ffc9dc / #d9c8ff) drifting down, 16 f (not the stun stars) |
| e4 | 걸을 때 비누방울 | 고급 | 220 | – | 걸으면 비누방울이 뽀글뽀글 | walking on the ground: every 14 f a 2 px bubble (#ffffff / #aef3ff) behind the feet, rising 0.25 px/f, 30 f |
| e5 | 하트 뿅뿅 | 희귀 | 450 | – | 크게 점수를 내면 하트가 뿅 | the wearer's score jumps ≥ 500 in a frame (a KO, a big combo): 2 hearts (a 5×4 pixel heart `kfx` kind 'heart', #ff8fb1) rise 10 px from `headTop(p)`, 20 f |
| e6 | 무지개 발자국 | 전설 | 1100 | – | 걷는 자리마다 무지개 발자국 | walking on the ground: every 6 f a 1 px dot at the **heel** (`x + 8 − 6 · facing`, `y + 15`: the rim of the ground marker, so it is left behind, not stamped on the marker) in the next of R O Y t b v, no motion, fading over 24 f |

---

## 5. Storage

### 5.1 The store, v2 (key `ppogeul-trophy`, `TRO_V = 2`)

New fields, next to the v1 fields (`v, dev, t, best, bl, w, g, ko, day, de, seen, esc, cs?`):

| Field | Type / range | Meaning |
|---|---|---|
| `ce` | int 0..1e9 | 비누 코인 ever earned. When linked, this is the account's sum. |
| `sp` | int 0..1e9 | 비누 코인 ever spent. The balance is `clamp(ce − sp, 0, 99999)`. (It is not named `cs`: the store's `cs` is already the cloud link record. The cloud slot field and the link record use `sp` too, 8.1.) |
| `own` | array of ≤ 64 ids, `isItemId`, no duplicates, purchase order | Items bought (when linked, the account's union). `n1` is implicit and never stored. |
| `eq` | 5 chars `[0-9a-z]` (slot order h f n b e, `'0'` = nothing) | The worn set. Only owned items (or `n1`) survive parsing. |
| `cd`, `cde` | YYYYMMDD, 0..99999 | The soft-cap day, and the raw coins awarded that day |
| `bd`, `bs` | YYYYMMDD, 0..5 | The last day the day bonus was paid, and the streak day then |
| `sh` | 0/1 | 상점 opened once (the shop button's first-time dot) |
| `cv` | 0..99999 | The balance when the 상점 was last closed (the dot rule, 9.1) |

- `seen` now means "마이페이지 or 내 기록 opened once". It is the badge's NEW dot, as before.

### 5.2 `troFresh` / `troParse`

```js
  function troFresh() { return { v: TRO_V, dev: troRand(8), t: TRO_GIFT, best: TRO_GIFT, bl: 0, w: 0, g: 0, ko: 0, day: 0, de: 0, seen: 0, esc: [],
    ce: 0, sp: 0, own: [], eq: LOOK0, cd: 0, cde: 0, bd: 0, bs: 0, sh: 0, cv: 0 }; }
  const isItemId = (s) => typeof s === 'string' && /^[hfnbe][1-9a-z]$/.test(s) && !!ITEM[s];
  // troParse (v2): v 1 is read as v 2 with no coins (a lossless migration); v > 2 is 'newer' (read-only, as today)
  //   if (typeof o.v === 'number' && o.v > TRO_V) return 'newer';
  //   if ((o.v !== 1 && o.v !== TRO_V) || ...dev check...) return null;
  //   ...the v1 fields exactly as today...
  //   const own = Array.from(new Set((Array.isArray(o.own) ? o.own : []).filter((x) => isItemId(x) && x !== STARTER))).slice(0, 64);
  //   out.ce = I(o.ce, 1e9); out.sp = I(o.sp, 1e9); out.own = own; out.eq = lookOwned(lookParse(o.eq), own);
  //   out.cd = I(o.cd, 99991231); out.cde = I(o.cde, 99999); out.bd = I(o.bd, 99991231); out.bs = I(o.bs, COIN.day.length);
  //   out.sh = o.sh ? 1 : 0; out.cv = I(o.cv, COIN_MAX); out.v = TRO_V;
  // a worn set from anywhere (storage, network, the cloud): 5 chars, each slot's digit kept only if that item exists
  function lookParse(s) {
    if (typeof s !== 'string' || !/^[0-9a-z]{5}$/.test(s)) return LOOK0;
    let o = ''; for (let i = 0; i < 5; i++) { const ch = s[i]; o += ch !== '0' && ITEM[LOOK_SLOTS[i] + ch] ? ch : '0'; }
    return o;
  }
  // ...and only what this store owns (the starter is always owned)
  function lookOwned(lk, own) { let o = ''; for (let i = 0; i < 5; i++) { const id = LOOK_SLOTS[i] + lk[i]; o += lk[i] !== '0' && (id === STARTER || own.includes(id)) ? lk[i] : '0'; } return o; }
  const lookPut = (lk, slot, id) => { const i = LOOK_SLOTS.indexOf(slot); return lk.slice(0, i) + (id ? id[1] : '0') + lk.slice(i + 1); };
  const myLook = () => (TRO.s ? lookOwned(TRO.s.eq, TRO.s.own) : LOOK0);
```

- The migration is lossless: a v1 store keeps every trophy field and its link record, and gains zero coins. The first `troMut` writes it back as v2.
- **An older page** (a cached PWA, or an artifact tab opened before the update) reads v2 as `'newer'`. It turns read-only and keeps the store intact. This is the existing safety valve.
- The guest key, the parked copies and `PG.debug.tro.set` all go through `troParse`, so they migrate the same way.

### 5.3 Operations (each is one `troMut`: read, check, change, write)

```js
  // buy: the checks run on the store as it is NOW (another tab may have spent the coins or bought it); bought = worn
  function shopBuy(id) {
    const it = ITEM[id]; if (!it || it.price <= 0 || TRO.ro || !TRO.s) return { ok: false, why: TRO.ro ? 'ro' : 'bad' };
    return troMut((S) => {
      if (S.own.includes(id)) return { ok: false, why: 'own' };
      if (S.bl < it.lg) return { ok: false, why: 'lock' };
      const bal = coinBal(S); if (bal < it.price) return { ok: false, why: 'poor', need: it.price - bal };
      S.sp = Math.min(1e9, S.sp + it.price); S.own = S.own.concat([id]);
      S.eq = lookPut(S.eq, it.slot, id);
      return { ok: true, now: coinBal(S) };
    }) || { ok: false, why: 'bad' };
  }
  // wear (id) / take off (null) in one slot; only an owned item (or the starter)
  function lookSet(slot, id) {
    if (TRO.ro || !TRO.s || LOOK_SLOTS.indexOf(slot) < 0 || (id && (!ITEM[id] || ITEM[id].slot !== slot))) return false;
    const ok = troMut((S) => { if (id && id !== STARTER && !S.own.includes(id)) return false; S.eq = lookPut(S.eq, slot, id); return true; });
    if (ok) lookOut();                             // my animals and the network follow (7.2)
    return ok;
  }
```

- `troSync()` (after every `troMut`) also calls `syncShopBtn()` and refills `#pg-hub` when it is shown. The other tabs' `storage` event takes the same path, so a purchase in one tab updates the other's balance at once.
- `TRO.mem` (blocked storage) allows coins and purchases for the session. The cards then say "이 브라우저에서는 저장되지 않아요" (the existing text).
- `TRO.ro` ('newer') refuses purchases and equips with the same text.

---

## 6. Rendering

### 6.1 Anchors (`PG.ANCHORS`, authored in `src/sprites.js` next to the art)

Five points per frame, in that 16x16 frame's own pixels:

| Point | Meaning | Who uses it |
|---|---|---|
| **H** | the head's crown: a hat's pivot (its brim's bottom-centre) goes here, 1 px below the top fill row, so the brim overlaps the head | 머리 |
| **E** | profile animals: the near eye's centre; front animals: the midpoint between the eyes | 얼굴 |
| **N** | the throat / the front of the neck | 목 |
| **B** | the upper back (the shoulder behind the head) | 등 (capes, wings, shells, backpacks), drawn **behind** the body |
| **W** | the waist centre | 등 (tubes: the back half behind, the front half in front) |

```js
  // ---------------------------------------------------------------- v4 shop: where worn items sit (design/shop.md 6.1)
  // per animal: face 'p' (profile: one eye shows) or 'f' (front: two eyes); base = [Hx, Hy, Ex, Ey, Nx, Ny, Bx, By, Wx, Wy]
  // of the idle frame 0; off: per sprite name, per frame, [dx, dy] added to every point, or a full 10-number array (a -1
  // pair hides that point in that frame); hide: [x0, y0, x1, y1] pixels erased under a hat (moved by the frame's dx, dy;
  // a full array may carry its own 4 after the 10); port: the 32x32 portrait's [Hx, Hy, Ex, Ey, Nx, Ny] (items at 2x)
  PG.ANCHORS = {
    duck: { face: 'p', base: [9, 2, 10, 4, 11, 7, 4, 8, 8, 11],
      off: { duck_idle: [[0, 0], [0, 1]], duck_walk: [[0, 0], [0, -1], [0, 0], [0, -1]], duck_jump: [[0, -1]], duck_fall: [[0, 0]],
        duck_shoot: [[0, 0]], duck_glide: [[0, 0], [0, -1]] }, port: [15, 5, 19, 10, 17, 24] },
    capy: { face: 'p', base: [11, 5, 12, 7, 12, 10, 5, 7, 8, 11], hide: [9, 0, 14, 3],
      off: { capy_idle: [[0, 0], [0, 1]], capy_walk: [[0, 0], [0, -1], [0, 0], [0, -1]], capy_jump: [[0, -1]], capy_fall: [[0, -1]],
        capy_shoot: [[0, 0]], capy_slam: [[11, 3, 12, 6, 12, 10, -1, -1, -1, -1, 9, 0, 13, 2]] }, port: [16, 8, 21, 13, 18, 23] },
    otter: { face: 'p', base: [9, 2, 10, 4, 12, 8, 5, 6, 9, 11],
      off: { otter_idle: [[0, 0], [0, 0]], otter_walk: [[0, 0], [0, -1], [-1, 0], [0, -1]], otter_jump: [[0, -1]], otter_fall: [[0, -1]],
        otter_shoot: [[0, 0]], otter_dash: [[10, 7, 10, 8, 12, 12, 5, 9, 7, 11]] }, port: [15, 6, 19, 13, 16, 25] },
    penguin: { face: 'p', base: [8, 3, 9, 5, 9, 7, 4, 8, 8, 11],
      off: { penguin_idle: [[0, 0], [0, 1]], penguin_walk: [[-1, 0], [0, -1], [1, 0], [0, -1]], penguin_jump: [[0, -1]], penguin_fall: [[0, -1]],
        penguin_shoot: [[0, 0]], penguin_slide: [[11, 7, 12, 8, 9, 9, 5, 7, 7, 10]] }, port: [15, 4, 20, 14, 17, 24] },
    cat: { face: 'f', base: [9, 4, 10, 6, 10, 9, 4, 9, 8, 12],
      off: { cat_idle: [[0, 0], [0, 1]], cat_walk: [[0, 0], [0, -1], [0, 0], [0, -1]], cat_jump: [[0, -1]], cat_fall: [[0, -1]],
        cat_shoot: [[0, 0]], cat_flip: [[9, 4, 9, 6, 9, 9, -1, -1, -1, -1]] }, port: [16, 8, 16, 15, 16, 27] },
    frog: { face: 'f', base: [9, 3, 10, 5, 9, 9, 3, 9, 8, 11],
      off: { frog_idle: [[0, 0], [0, 1]], frog_walk: [[0, 0], [0, -1], [0, -1], [0, -1]], frog_jump: [[0, -1]], frog_fall: [[0, -1]],
        frog_shoot: [[0, 0]] }, port: [15, 9, 15, 9, 16, 25] },
  };
```

- **Where the draft numbers come from:** the top fill row and span of every frame (the scratch measurement: e.g. duck idle 0 has its fill top at row 1, cols 7–10; idle 1 at row 2; walk 1 and 3 at row 0), the eye pixels in the fill art, and each pose's own head.
  - The penguin slide's head is the right-hand hump, row 6, cols 10–12.
  - The otter dash's head is row 6, cols 8–11.
  - In the capy slam, the yuzu lifts off, so the hat lifts 2 px too (H.y 3 instead of 5).
  - The cat flip keeps its ears on top.
  - **Back and waist are hidden in the two curled poses** (capy_slam, cat_flip): a cape on a ball reads as a blob.
- **Items stay upright in every pose** (cartoon logic: a hat stays on a sliding penguin's head). There is no rotation, so the art needs one frame per item, or two for face (profile / front) and tubes (back / front).
- **The capy's yuzu:** when a 머리 item is worn, the pixels in `hide` (the yuzu and its outline, cols 9–14, rows 0–3, moved by the frame offset) are cleared in the composite before the hat is drawn. The ear at (8, 3) is outside the box. The same rule covers its portrait (a `porthide` box, measured by the tool).
- **Front faces** (cat, frog): face items use their front frame, a 9-wide two-lens or two-cheek version whose lens centres sit 5 px apart. That matches the cat's eyes (cols 7.5 / 12.5) and the frog's pupils (cols 7 / 12).
- **Authoring.** `tools/anchors.js` (node, new) loads `sprites.js` and prints a draft table from the art:
  - H = the centre of the top fill row inside each animal's head window, that row + 1.
  - E = the centroid of the interior eye pixels; front: the midpoint of the two.
  - N = (E.x + 1, the head's lowest row + 1).
  - B and W are fixed per animal.
  
  The art pass then edits `PG.ANCHORS` by hand while looking at the contact sheet (16.5). Anchors are data in `sprites.js`, so whoever redraws a frame fixes its anchors in the same file.
- `game.js` keeps a fallback for a missing `PG.ANCHORS` entry: no items on that animal, never a guessed position.

### 6.2 The composite (`lookFrame`)

```js
  const LOOK_W = 24, LOOK_H = 24, LOOK_X = 4, LOOK_Y = 8;   // the body sits at (4, 8): 8 px of headroom, 4 px each side, 0 below
  // the anchors of sprite `name`, frame fi (null = this frame wears nothing: die, trapped, ghost, life, a turned fallback)
  function anchorsOf(name, fi) { /* PG.ANCHORS[animal].off[name][fi % n] -> base + [dx, dy] or the override; cached */ }
  // body frame f (sprite name, frame fi) wearing lk (worn set without the effect digit); cached per frame in lookCache
  function lookFrame(f, name, fi, lk) {
    const k = lk.slice(0, 4); if (k === '0000') return f;
    const A = anchorsOf(name, fi); if (!A) return f;
    return lookOf(f, 'L' + k, () => {
      const c = mk(LOOK_W, LOOK_H), x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      const put = (id, part, P) => { const it = ITEM[id]; const fr = itemFrame(id, part, A.face); if (!fr || !P) return;
        x.drawImage(fr.c, LOOK_X + P[0] - fr.px, LOOK_Y + P[1] - fr.py); };
      const id = (i) => (k[i] !== '0' ? LOOK_SLOTS[i] + k[i] : '');
      const b = id(3);
      if (b) put(b, 0, ITEM[b].at === 'W' ? A.W : A.B);                       // behind: capes / wings / shells, a tube's back half
      x.drawImage(f.c, LOOK_X, LOOK_Y);
      if (id(0) && A.hide) x.clearRect(LOOK_X + A.hide[0], LOOK_Y + A.hide[1], A.hide[2] - A.hide[0] + 1, A.hide[3] - A.hide[1] + 1);
      if (b && ITEM[b].at === 'W') put(b, 1, A.W);                             // a tube's front half
      if (id(2)) put(id(2), 0, A.N);
      if (id(1)) put(id(1), A.face === 'f' ? 1 : 0, A.E);
      if (id(0)) put(id(0), 0, A.H);
      return finishFrame(c);                                                    // {c, m, wh, whm, w: 24, h: 24}
    });
  }
```

- **`drawEnt` gains one option: `o.look`.** Its top becomes, in this order (the joint contract):
  ```js
  let f = frameOf(name, i); if (!f) return;
  if (o.twin !== undefined) f = twinFrame(f, name, o.twin);   // distinction §2.5: body keys only (pass D3)
  if (o.look) f = lookFrame(f, name, i, o.look);              // the items, never recoloured (this pass)
  if (o.tint) f = tintOf(f, o.tint, o.tintA || 0.35);        // afterimages (unchanged)
  // ... o.outline: ringOf(f, flip, o.outline) - the ink-ringed ring of THIS f (distinction §2.3)
  ```
  - `lookFrame` caches per frame object, so a twin body and a natural body each get their own composites (≤ 4 players: small). `anchorsOf` goes by sprite name, so a twin frame has the same anchors.
  - Everything after that works unchanged: the horizontal centring (`x + (16 − 24) / 2 = x − 4`) and the bottom alignment (`y + 16 − 24 = y − 8`) put the body exactly where the bare frame was.
  - `f.m` mirrors the whole 24-wide composite about the body's centre, so the flip is correct.
  - `o.sq` scales the composite about the feet, so items squash with the body, as the body's own pixels already do.
  - `o.white` flashes the whole silhouette.
  - `o.outline` traces the composite: the ring (24 + 4 = 28 px square, drawn at −2) wraps hat and body in one band.
  - The penguin's `dy 3` and the water bob only move y.
  - `o.scale` (the centred path) is never used for players; a composite would be centred on its row 12, not the body's. Leave it so, and do not pass `o.look` with `o.scale`.
- `drawPlayer` passes `o.look = p.look` for `name`s that have anchors. The die frames, `drawTurned` and the trapped / ghost / life / portrait frames have no anchors, so they draw bare.
- `drawAfterimages` passes the same `look`, so the otter's dash trail wears the hat.
- **Cache.** One composite per (body frame object, look), in `lookCache` (a WeakMap). With up to 4 looks in a game, that is ≤ 4 × ~13 frames per animal, about 2.3 KB each. A frame's Map is cleared when it holds more than 24 looks (a player trying everything in the 상점).
- **Zero cost for bare players:** `'0000'` returns `f` itself.

### 6.3 Size limits (checked by `tools/check-shop.js` and `check-sprites.js`)

| Slot | Max art | Pivot | Must stay inside |
|---|---|---|---|
| 머리 | 12×8 | bottom-centre at H | the 24x24 composite in every frame (≤ 8 px above the frame top, ≤ 4 px beyond the sides); **≤ 6 px above the frame top in idle 0** (the tag lift stays small) |
| 얼굴 | profile 5×3, front 9×3 | lens centre / bridge at E | the head's own columns ± 1 |
| 목 | 10×4 | top-centre at N | the body's columns ± 1 |
| 등 B | 8×10 | the shoulder pixel at B | ≤ 4 px beyond the body's back edge, never below the feet line (row 16) |
| 등 W | 14×5 ×2 frames | centre at W | ≤ 2 px beyond each side of the body, never below row 16 |
| 효과 | – (particles) | – | 6.7 |

- Item art carries its own 1 px ink (`k`) outline, so it reads on every tile theme and keeps a pixel of ink between itself and the slot outline.
- **No new palette keys** (57 of 64 are used). An item that truly needs a colour may add at most 2 keys, after the art pass shows why.

### 6.4 Where items show

| Place | Items | How |
|---|---|---|
| Gameplay (solo, co-op, battle, the attract demo) | all slots | `drawPlayer` → composite; effects via `lookFx(p)` (6.7) |
| Podium | all | `drawPlayer` (as today). The medal crown lifts by `lookLift` and sits 1 px above the hat. |
| Die tumble, KO'd (`koT`), trapped bubble, ghost bubble | **none** | Those frames have no anchors. The curled 10x10 minis are too small, and the bubble's slot ring already says who it is. Items come back at the respawn or revive. |
| Turned fallback poses (`drawTurned`, art missing) | none | degraded art anyway |
| Title picker (6 portraits), room player cards, the room's picker | 머리 / 얼굴 / 목 | `lookPortrait(c, lk, 32)` (6.8) |
| Friends panel `#pg-mychar-art` (optional, S3b) | all but 효과 | the idle-0 composite; the canvas becomes 24×24 (CSS size × 1.5, same baseline) |
| 상점 / 마이페이지 preview | all, with the effect playing | 9.3 |
| Co-op HUD panels and team rows (8x8 / 16 px life icons), the HUD | none | too small; they are about score and lives |

### 6.5 The worn set on each player

- `makePlayer(sp, info)` gains `look: lookParse(info.look)`.
- The lists that build players carry `look`:
  - `netStart` (host: `r.id === NET.selfId ? myLook() : r.lk`), and `guestBegin` (from `NET.roster`).
  - `rematch` and `retry` map `{slot, char, nick, local, id}` today: add `look: p.look`, so 한 판 더 / 다시 하기 keep the match's looks.
  - Solo `newGame`: `myLook()`.
  - The attract demo: `idleWorld`, `toTitle` and `pickChar` set `G.p.look = myLook()`, like `G.p.char`. The title's demo animal wears what was just bought.
- **Frozen at match start**, like distinction's twin colour: a player's `look` is set when the players are built and never changes during the match. Nothing can change it anyway: the hub opens only from the title and the room, and a purchase in another tab of this browser waits for the next match.
- `lookOut()` (after `lookSet` / `shopBuy`) updates the attract `G.p` on the title and, in the room, my roster entry, and sends `'eq'` (7.2). It never touches `G.players` of a running match.

### 6.6 Four-player readability (the contract with distinction.md, request 2)

1. **The ink-ringed slot outline traces the composite** (body + worn items) in `multi()`. The player's colour ring is never broken by a hat brim, and more of the silhouette carries the slot colour. Any outline-based mark the readability pass adds must also take the composite.
2. **Marks above the head lift above the hat.** `lookLift(c, lk)` is the number of px the composite's opaque pixels reach above the frame top in that animal's idle frame 0, minus 1, floored at 0. It is cached per (animal, look), so the tag does not jitter with poses. **`headTop(p) = p.y − lookLift(p.char, p.look)`** (bare: `p.y`), and every mark that sits on the head uses it instead of `p.y`:
   - the DOM tag (`anchorY = headTop(p) − 5 − (podium 9)`, distinction §2.6) and the tag pointer in `drawTagArrows`;
   - the podium crown (`headTop(p) − 7`) and the flying trophy cups' landing point in `troPodCups` (`headTop(p) − 3`);
   - the stun stars (`drawStars(p.x + 8, headTop(p) + 1, …)`) and the capy slam's two speed lines (`headTop(p) − 7 / − 9`);
   - the "나" spotlight is centred on the body and needs no lift.
   - A hat reaching 3 px above the frame lifts them by 2, which keeps a 1 px gap. Walk / jump frames sit 1 px higher than idle 0, so a 6 px hat touches the pointer there without covering it; a −0.3 stretch (the cat's hop) covers it for a few frames. Both are accepted.
3. **Items never go below the feet line** and never more than 4 px sideways (6.3). The ground marker (distinction §2.4: an ellipse under the feet, or two ripples beside a floating animal at x − 4 … x − 1 and x + 16 … x + 19) therefore stays clear; a tube (≤ 2 px beyond the body) touches a ripple by at most 1 px. Effects that start at the feet start at the heel (e6) or go sideways (e2), never a ring.
4. **Hit boxes never change.** Captures, touches and KOs use the body's box exactly as today, and items are drawing only. Hats are limited to 6 px above the frame in idle, so the silhouette never suggests a much bigger target.
5. **No item copies a gameplay sign.** There is no crown shape (the MVP / podium crown stays unique), no bubble film, no stun stars, no rings (kfx rings mean the capy's slam, the cat's double jump and the frog's lily pads), and no slot-ring circle.
6. `PG.debug.shop.bare(true)` hides every item on this screen, for comparison screenshots.

### 6.7 Effects (`lookFx(p)`, called by `drawPlayer` right after `moveLook`)

- **What drives them.** Everything comes from this screen's own memory `p.fx` and the drawn state (`onGround`, `vx`, `vy`, `score`), exactly as `moveLook` derives its edges. So every viewer shows everyone's effect, and nothing is sent.
- **Randomness.** Cosmetic only: `fxr()`, never the simulation RNG.
- **Budget.** A spawn happens only when `!reducedMotion()` and `G.parts.length < (multi() ? 200 : 260)` (stricter than `trailRoom`'s 300), and on the podium only while < 200.
- **Per player, at most:** e4 one per 14 f, e6 one per 6 f (each lives 24 f, so ≤ 4 alive), e1 one per 24 f, e2 4 per landing, e3 3 per take-off, e5 2 kfx per event (`kfx` caps at 48).
- **Reduced motion:** no effect particles at all. The item art still shows.
- **e5 hearts** use a new `kfx` kind `'heart'` (`drawKfx`: a 5×4 pattern of `fillRect`s, rising 10 px over its `dur` of 20, fading).
- **The attract demo** shows my effect too.

### 6.8 Portraits (`lookPortrait(c, lk, size)`)

- Build: draw `portrait_<c>` into a size × size canvas, then the 머리 / 얼굴 / 목 items **at 2x** at the portrait anchors (`port`). The face uses the animal's `face` type. A hat clears `porthide` first (the capy's yuzu).
- Headroom: a 2x hat (up to 24×16) can rise above row 0. The bust is then drawn `dy = min(8, needed)` px lower, so its bottom chest rows are cropped and the whole hat shows.
- Cache: per (animal, look, twin). The picker and the room cards reuse it: `portraitCanvas(c, name, size, lk, tw)` gains an optional look and an optional twin slot (distinction §2.10). The order is the same as in play: the bust is twin-recoloured first, then the items are drawn on it.
- 2x item pixels next to 1x portrait pixels look a little chunkier. That is accepted (no separate portrait art for 40 items). The contact sheet shows all 6 × a test set.

---

## 7. Network

### 7.1 Messages and room info

| Item | Content | Host / guest validation | Bytes |
|---|---|---|---|
| `hi` (guest → host) | `{t:'hi', n, c, cu, d, lk}`, with `lk = myLook()` | `r.lk = lookParse(m.lk)` | 104 (+13), once |
| `eq` (new, guest → host) | `{t:'eq', lk}` when my worn set changes while I am in a room, debounced 300 ms | **room phase only**, like `'pk'`: `if (NET.screen === 'room') r.lk = lookParse(m.lk);` then the shared tail (`NET.roomDirty`, `netAdvertise`, `renderRoom`). In the game phase it is ignored. | 24 |
| R seat, room phase | `[slot, nick, char, ready, cup]` as today, **+ `lk` at index 5 when it is not `'00000'`** | guest: `lk: e.length > 5 ? lookParse(e[5]) : LOOK0` | ≤ +8 per seat, room phase only |
| R seat, game phase | unchanged `[slot, nick, char, ready]` | guest: keeps the room's look for that slot, exactly as it keeps the room's count (`guestRoom`'s "keep the room's last ones") | **0** |
| `pk`, snapshot rows, bodies | unchanged | – | 0 |

```js
  // roomInfo (room phase): e = [r.slot, r.nick, r.char, r.ready ? 1 : 0, cupOf(r)];
  //   const lk = r.id === NET.selfId ? myLook() : r.lk || LOOK0; if (lk !== LOOK0) e.push(lk);
  // guestRoom: lk = e.length > 5 ? lookParse(e[5]) : R.ph === 'game' ? ((NET.roster.find((x) => x.slot === slot) || {}).lk || LOOK0) : LOOK0
```

- **Why no change to `'pk'`:** the set is global, so picking another animal does not change it.
- **Why looks stay out of the game phase:** R rides in every snapshot, and the worst 4-player snapshots already sit at 3,390-3,399 bytes after trimming. Looks only change in the room (the hub cannot be opened mid-match), so the room's looks are all a match needs. Players take `look` from the roster at `netStart` / `guestBegin` and keep it (6.5), which is also what the twin colour does.
- **Old guests** (trophy pages) read index 4 as the count, as today, and ignore index 5.
- **Bytes.** Room phase: ≤ 4 × 8 = 32 bytes on a room broadcast (not a snapshot). Game phase: nothing. `mp-net` / `rv-net` report `snapMax` and `snapTrim` exactly as before.
- **Trust.** Others' looks are self-reported cosmetics. Ownership and league are **not** checked for other players (they cannot be). Ids are checked against the catalog, so a forged `lk` can show any real item and nothing else. An `eq` flood costs the host what an `nk` flood costs today (a re-render, coalesced into the next room broadcast).

### 7.2 `lookOut()`

```js
  function lookOut() {
    const lk = myLook();
    if (G.mode === 'title' && G.p) G.p.look = lk;                              // the attract demo
    if (!NET.sess || NET.screen !== 'room') { renderFriends(); return; }        // (a running match keeps its looks: 6.5)
    if (NET.role === 'host') NET.roomDirty = true;                             // (R carries mine)
    else { clearTimeout(CO.eqT); CO.eqT = setTimeout(() => { if (NET.sess && NET.screen === 'room') NET.sess.send(NET.hostId, { t: 'eq', lk: myLook() }); }, 300); }
    renderRoom(); renderFriends();
  }
```

### 7.3 Compatibility (NET_V stays 4)

| Host | Guest | Result |
|---|---|---|
| shop page | shop page | everyone sees everyone's items (room and game) |
| shop page | trophy page (no shop) | the old guest sends no `lk` (its seat shows bare) and draws everyone bare; index 5 is ignored |
| trophy page | shop page | R has no `lk`: everyone is bare on the new guest's screen; its `hi.lk` / `eq` are ignored by the old host (an unknown `m.t` hits `default: return`) |

Nothing gameplay-relevant moves, so no version bump is needed.

---

## 8. Cloud (deploy build with a cloud config only)

### 8.1 Document v2

```
players/{uid} = { v: 2, dev, nick?, eq?: 'a0300', s: { <slot>: {...v1 fields..., ce, sp, o: ['h1', 'n3'], bd, bs, n, at} }, last, updatedAt }
```

- **Naming.** Spent coins are `sp` everywhere: in the store, in a cloud slot and inside the link record. (`cs` is the store's
  link record itself, so a slot field named `cs` would put `S.cs.c.cs` in the code.)
- **The doc version.** `CL_V` becomes 2. `clDoc` accepts `v` 1 and 2; a v1-shaped slot reads as `ce 0, sp 0, o [], bd 0, bs 0`. `'newer'` is `v > 2`.
  - The first write of a coin page to a v1 doc also sets `v: 2` (an allowed upgrade).
  - From then on, older pages see `'newer'` ("새 버전에서 저장한 기록이에요 · 새로고침해 주세요") and never write the doc, so they can never drop a slot's coins. Their trophies stop syncing until they reload: tell players in the release note to refresh every device once.
- **Slot fields:**
  - `ce` / `sp`: this browser's earned / spent coins, absolute, like `t`.
  - `o`: the items this browser bought, in purchase order.
  - `bd` / `bs`: this browser's day bonus day and streak.
- **The account:** coins = `clamp(Σce − Σsp, 0, 99999)`; owned = the union of all `o`; the day bonus = the slot with the max `bd` **not later than tomorrow** (its `bs`; a later `bd` comes from a wrong clock and is skipped, 3.4); worn = the doc's `eq` (last write wins, like `nick`).
- **What does not sync:** `cd`, `cde` (the soft cap, per browser), `sh`, `cv` (UI dots).

### 8.2 The link record and the pure functions (extending cloud §6.1-6.2)

- **`cs.c`, `cs.v`** gain `ce, sp, o` (o = the item list at that moment).
- **`cs.m`** (my slot as acknowledged) gains `ce, sp, o, bd, bs`.
- **`cs.ev`** is new: the worn set at the last sync. `S.eq !== cs.ev` means a local change is waiting to be pushed.
- `clParseCs` / `clSlot` clamp the new fields like the rules: `ce, sp` 0..1e9; `o` = valid ids, no duplicates, ≤ 64; `bd` 0..99991231; `bs` 0..5. A v1 link record (no coin fields) parses with zeros, so `mine.ce = c.ce + S.ce − v.ce = S.ce`: **every coin in a store linked under v 1 is this browser's.** (Corrected by the review of 2026-10-18; the first text said `mine.ce = 0`.) That is exactly right for an upload, and a join under v 1 can hold no coins of the device: no page with coins ever wrote a v 1 document — the release gate below. `tools/check-shop.js` enforces the gate in code: it fails while `game.js` has a store `TRO_V ≥ 2` with a cloud `CL_V < 2`.

```js
  // clMine: what this browser has added, counters as for t; items: what it had at the last sync + what it bought since
  //   ce: Math.max(0, c.ce + S.ce - v.ce), sp: Math.max(0, c.sp + S.sp - v.sp),
  //   o: c.o.concat(S.own.filter((id) => !v.o.includes(id) && !c.o.includes(id))), bd: S.bd, bs: S.bs
  // clAgg: + ce, sp sums; o: union in slot order; bd: max over the slots whose bd <= troTomorrow(today), bs: of that slot
  // clAdopt: S.ce = o.ce + mine.ce; S.sp = o.sp + mine.sp; S.own = union(o.o, mine.o); S.bd / S.bs = the later of (o, mine);
  //   eq: if (S.eq === cs.ev && D.eq) S.eq = D.eq;  S.eq = lookOwned(S.eq, S.own);  new cs.ev = S.eq when adopted, else kept
  //   (a debt - two devices spending the same coins offline - stays in the sums: the balance shows 0 and later coins pay it)
  // clStep: as today for the trophy fields, plus:
  //   ce rise capped: m.n ? min(150, floor((60000 + dt) / 2000)) : 150      (30 + 1 per 2 s; the rules: 8.4)
  //   items: at most ONE new item per write - the first of mine.o not in m.o, appended to m.o; sp = m.sp + its price
  //   (the remaining items, and their spent coins, go in the next writes: partial = true)
  //   bd: max(m.bd, mine.bd), bs: of the larger; the slot is written in the v2 shape (all five new fields)
  // clDirty: 'hard' also when ce / sp / o / bd differ from m, or S.eq !== cs.ev
  // clUpload (first upload): + ce: S.ce, sp: S.sp, o: S.own, bd, bs; the doc gets v: 2 and eq: S.eq
```

- **The invariant** checked in tests: `mine.sp − m.sp === Σ price(mine.o \ m.o)` (when nothing was bought twice, see below). Every purchase moves both in one `troMut`, so it holds.
- **The same item bought on two devices while offline** is charged twice (both slots' `sp` hold its price; the union holds it once). It is rare and cannot be undone within the rules (`sp` never drops). Accepted, and listed in 13.
- **`eq` is pushed** with a slot write when there is one. Alone, it waits 2.5 s after this browser's last acknowledged write, like `nick` (cloud §16).
- **Sign-out** (`clUnlink`) brings back this browser's own store, with its own coins and items. The account's coins and items vanish from the device until the next sign-in, exactly like its trophies. The parked copies (`ppogeul-park`, cloud §17 fix 3) and the guest key are whole stores, so they carry coins and items with no extra code.
- **The first sign-in into an existing account** (cloud wins) puts the device's coins and items aside with its trophies (8.5's 'swap' says so).

### 8.3 What the rules can and cannot hold

| Can | Cannot |
|---|---|
| coins rise at a bounded rate per slot; spent coins never drop; items only grow; at most one new item per write, and only together with exactly its price in `sp`; ids from the catalog; league items only with `bl` high enough; a v2 slot never becomes v1; folding adds up exactly | prove that coins were earned; check the account's balance (no loops over slots in rules), so a modified page can spend coins it never had by inflating `ce` within the rate (≈ 30 per minute per slot); check the first upload's `sp` against its `o` |

This is the same honesty as the trophy rules: the cloud bounds a cheater's speed on their own account, and nobody else is affected.

### 8.4 `firestore.rules` changes (paste-ready; keep the v1 functions)

First split today's `slotShape(x)` in two, so v1 and v2 share the field checks:

```
    // the 12 v1 fields' values (today's slotShape without its two key lists)
    function slotCore(x) {
      return isInt(x.t, -999999, 999999)
        && isInt(x.g, 0, 10000000) && isInt(x.w, 0, x.g) && isInt(x.ko, 0, 10000000)
        && isInt(x.best, 0, 99999) && isInt(x.bl, 0, 6) && isInt(x.seen, 0, 1) && isInt(x.hi, 0, 999999999)
        && isInt(x.day, 0, 99991231) && isInt(x.de, 0, 20)
        && isInt(x.n, 1, 1000000000)
        && x.at == request.time;
    }
    function v1Keys() { return ['t', 'w', 'g', 'ko', 'best', 'bl', 'seen', 'hi', 'day', 'de', 'n', 'at']; }
    function slotShape(x) { return x is map && x.keys().hasAll(v1Keys()) && x.keys().hasOnly(v1Keys()) && slotCore(x); }
```

Then add:

```
    // ---- v2 (design/shop.md 8): 비누 코인 and items. A v1 document becomes v2 at its first write by a coin page; v1-shaped
    // slots in a v2 document stay as they are until their browser writes again (read as no coins).
    function v2Keys() { return ['t', 'w', 'g', 'ko', 'best', 'bl', 'seen', 'hi', 'day', 'de', 'n', 'at', 'ce', 'sp', 'o', 'bd', 'bs']; }
    function slotShape2(x) {
      return x is map && x.keys().hasAll(v2Keys()) && x.keys().hasOnly(v2Keys())
        && slotCore(x)
        && isInt(x.ce, 0, 1000000000) && isInt(x.sp, 0, 1000000000)
        && x.o is list && x.o.size() <= 64 && x.o.toSet().size() == x.o.size() && x.o.hasOnly(itemIds())
        && isInt(x.bd, 0, 99991231) && isInt(x.bs, 0, 5);
    }
    // GENERATED by tools/check-shop.js from ITEMS (game.js); never edit by hand. A price never changes (a new price = a new id)
    function itemIds() { return ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'ha', 'hb', 'hc', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7',
      'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6']; }
    function priceOf(id) { return {'h1': 60, 'h2': 70, 'h3': 80, 'h4': 90, 'h5': 160, 'h6': 180, 'h7': 200, 'h8': 220, 'h9': 380, 'ha': 420,
      'hb': 450, 'hc': 1200, 'f1': 60, 'f2': 80, 'f3': 70, 'f4': 160, 'f5': 180, 'f6': 200, 'f7': 400, 'n2': 70, 'n3': 80, 'n4': 90, 'n5': 150,
      'n6': 200, 'n7': 220, 'n8': 380, 'b1': 90, 'b2': 160, 'b3': 180, 'b4': 200, 'b5': 400, 'b6': 480, 'b7': 950, 'e1': 90, 'e2': 80, 'e3': 200,
      'e4': 220, 'e5': 450, 'e6': 1100}[id]; }
    function leagueNeed(id) { return {'f3': 1, 'n5': 2, 'h8': 3, 'n7': 4, 'hb': 5, 'hc': 6}.get(id, 0); }
    // END GENERATED
    function eqValue(e) { return e is string && e.matches('^[0-9a-z]{5}$'); }
    function cv(a, f) { return (f in a) ? a[f] : 0; }              // a v1-shaped slot: no coins yet
    function ov(a) { return ('o' in a) ? a.o : []; }
    // the coin part of a later write of the same slot (dt in ms since that slot's last write)
    function coinStepOk(a, b, dt) {
      let ao = ov(a);
      let n = ao.size();
      let rise = b.ce - cv(a, 'ce');
      return rise >= 0 && rise <= 150 && rise * 2000 <= 60000 + dt
        && b.bd >= cv(a, 'bd')
        && (b.o.size() == n
              ? (b.o == ao && b.sp == cv(a, 'sp'))
              : (b.o.size() == n + 1 && b.o[0:n] == ao && !(b.o[n] in ao)
                 && b.sp == cv(a, 'sp') + priceOf(b.o[n]) && b.bl >= leagueNeed(b.o[n])));
    }
    // a browser's first write in a v2 document
    function coinNewOk(b) {
      return b.ce <= 150 && b.o.size() <= 1
        && b.sp == (b.o.size() == 1 ? priceOf(b.o[0]) : 0)
        && (b.o.size() == 0 || b.bl >= leagueNeed(b.o[0]));
    }
    // only the worn set changes (metaOk checked its value)
    function eqOk() {
      let d = request.resource.data;
      let o = resource.data;
      return d.diff(o).affectedKeys().hasOnly(['eq', 'updatedAt']) && ('eq' in d);
    }
```

Changes to the existing functions:

| Function | Change |
|---|---|
| `allow update` | `signedIn(uid) && metaOk() && (slotOk() \|\| foldOk() \|\| nickOk() \|\| eqOk())` |
| `createOk` | keys `hasOnly(['v', 'dev', 'nick', 'eq', 's', 'last', 'updatedAt'])`; `(d.v == 1 && slotShape(d.s[d.last]) && !('eq' in d))` (an old page, as today) **or** `(d.v == 2 && slotShape2(d.s[d.last]) && (!('eq' in d) \|\| eqValue(d.eq)))`. The first upload carries the store as it is (any `ce`, `sp`, `o`), the same honest limit as `t`. |
| `metaOk` | `affectedKeys().hasOnly(['s', 'last', 'nick', 'eq', 'v', 'updatedAt'])`; `d.v == o.v \|\| (o.v == 1 && d.v == 2)`; `!('eq' in d) \|\| eqValue(d.eq)`. |
| `slotOk` | `dt = request.time.toMillis() - o.s[k].at.toMillis()` (only when `k in o.s`); in a v2 doc (`d.v == 2`) the written slot must be `slotShape2`, and `(k in o.s) ? (stepOk(o.s[k], d.s[k]) && coinStepOk(o.s[k], d.s[k], dt)) : (newOk(d.s[k]) && coinNewOk(d.s[k]))`. In a v1 doc everything stays as today (`slotShape`). |
| `foldOk` / `sumOk` | in a v2 doc the archive `'_'` must be `slotShape2` with `ce` / `sp` the sums (`cv`), `o` the union (`z.o.hasAll(ov(a)) && z.o.hasAll(ov(b)) && z.o.hasOnly(ov(a).concat(ov(b)))`; slotShape2 already forbids duplicates), and `bd 0, bs 0` (a slot is folded after 7 quiet days, so its bonus day is history). The catalog stays ≤ 64 ids, so a union always fits. |

**Before deploying,** run these in the emulator or the Rules Playground (the cloud §13.5 list plus these cases), and
port them into the `FakeFirebase` JS rules of `src/tests/cloud.js`:
- a purchase write;
- two items in one write (refused);
- a wrong price (refused);
- an `o` reorder or shrink (refused);
- an unknown id (refused);
- a league item with too low a `bl` (refused);
- a `ce` jump over the rate (refused);
- `sp` going down (refused);
- a v2 slot written back in the v1 shape (refused);
- an old page creating a v1 doc (allowed), and an old page's v1-shaped slot write into a v2 doc (refused);
- a v1 → v2 upgrade write (allowed), and v 2 → 1 (refused);
- an `eq`-only write (allowed), and an `eq` of 6 characters (refused);
- a fold of a v2 slot (allowed) and of a v1-shaped slot in a v2 doc (allowed: `cv` / `ov` read zeros).

In particular, confirm that list range access (`b.o[0:n]`), list equality (`b.o == ao`), `toSet()` and
`map.get(key, default)` behave as assumed, and that the biggest write (a purchase into a doc with 16 slots) stays
under the rules' limit of 1,000 evaluated expressions per request (the two 39-entry literals count).

### 8.5 Texts

| Key | Text | Change |
|---|---|---|
| `CL_TX.pitch` | "로그인하면 다른 기기에서도 트로피·꾸미기가 이어져요 · 구글 계정 이름·메일은 저장하지 않아요" | "트로피가" becomes "트로피·꾸미기가" (+3 syllables) |
| `swap` | "구글 계정의 트로피 {0}개예요 · 이 기기의 트로피 {1}개와 꾸미기는 로그아웃하면 다시 보여요" | the device's coins and items are mentioned |

- `src/tests/cloud.js` pins both strings (`PITCH` L33, `SWAP` L565): update them in pass S5.
- The fit of 내 기록 (cloud §17 fix 10: 390x763 / 360x756 / 412x891 frames, every 2-part line, both button labels) must be re-checked, because the pitch line is 3 syllables longer. If it breaks, the fallback text is "로그인하면 다른 기기에서도 기록이 이어져요 · …" (1 syllable shorter than today).

---

## 9. UI (Korean)

### 9.1 Title: the 상점 button (end of the start row) and the badge → 마이페이지

```html
<div class="pg-row">
  <button id="pg-start" class="pg-btn" type="button" data-primary>혼자 하기</button>
  <button id="pg-friends-btn" class="pg-btn pg-alt" type="button">친구와 하기</button>
  <button id="pg-shop-btn" class="pg-btn pg-shopbtn" type="button" title="상점" aria-label="상점 · 비누 코인 0개"><canvas id="pg-shop-ic" class="pg-ic" width="8" height="8"
    aria-hidden="true"></canvas><span class="pg-shopbtn-tx">상점</span><i id="pg-shop-new" class="pg-tro-new" hidden></i></button>
</div>
```

```css
.pg-shopbtn { position: relative; display: inline-flex; align-items: center; justify-content: center; gap: 0.3em; flex: none;
  padding-left: 0.75em; padding-right: 0.8em; background: var(--mint); box-shadow: 0 0.16em 0 var(--mint-2), 0 0.3em 0.8em rgba(0, 0, 0, 0.35); }
.pg-shopbtn .pg-ic { width: 1.2em; height: 1.2em; vertical-align: 0; }
/* narrow: an icon-only square the height of its neighbours; the start buttons give up a little side padding for it */
@container (max-width: 30em) {
  .pg-shopbtn-tx { display: none; }
  .pg-title-card .pg-btn.pg-shopbtn { width: 2.05em; padding-left: 0; padding-right: 0; }
}
@container (max-width: 26em) { .pg-title-card .pg-btn:not(.pg-shopbtn) { padding-left: 0.65em; padding-right: 0.65em; } }
/* touch: a 44px target without layout width (it stays inside the row's gap and the card's margins) */
.pg-touch-on .pg-shopbtn::after { content: ""; position: absolute; inset: -0.3em -0.25em; }
@keyframes pg-nudge { 0%, 100% { transform: none; } 50% { transform: translateY(-0.12em) scale(1.06); } }
.pg-shopbtn.is-nudge { animation: pg-nudge 0.6s ease-in-out 2; }
@media (prefers-reduced-motion: reduce) { .pg-shopbtn.is-nudge { animation: none; } }
```

- **Why here.** The `.pg-best` line is full at 1x (1). The start row is the only place that needs no height. The header bar is no option either: on a 320 px phone it is already at its limit (cloud §17 fix 15).
  - At 1x, the icon-only button is 2.05em of the button font (≈ 26 px) plus a 0.6em gap ≈ 32 px. That fits once the start buttons' trimmed padding frees ≈ 10 px (≈ 43 px free in all).
  - On a 320 px phone, about 67 px are free after the trim: a 30 px button plus a 7.5 px gap fits, and `::after` makes a ≈ 44 px target.
  - From 30em wide (a 390 px phone, desktop ≥ 1.3x) the label "상점" shows. Icon-only, the mouse gets the `title` tooltip and screen readers the aria-label.
  - The fit test (16.6) asserts no wrap and no overflow at every size, on the artifact and on the deploy title (which has the extra install line).
- **Order.** 혼자 하기 stays first: it is `data-primary` and Enter still starts a solo game.
- **The NEW dot** (`#pg-shop-new`, the badge's pink dot style) shows when `!S.sh`, or when `coinBal(S) > S.cv` and some unowned, unlocked item costs ≤ the balance. The first time it lights in a page load, the button gets `is-nudge` (two 0.6 s hops).
- `syncShopBtn()` sets the aria-label ("상점 · 비누 코인 120개 · 살 수 있는 아이템이 있어요") and the dot. It is called from `troSync()` and `showOverlay('title')`.
- **The trophy badge `#pg-tro`** now opens **마이페이지** (`openHub('my', 'title')`). Its aria-label ends "· 마이페이지 열기" instead of "· 내 기록 보기", and its NEW dot logic stays (`S.seen`).
- **The 상점 button** opens `openHub('shop', 'title')`.

### 9.2 The hub panel `#pg-hub` (`OVERLAYS` gains `'hub'`)

One full-stage `.pg-panel`, exactly like `#pg-friends` / `#pg-room` (a sibling of them in `#pg-stage`, 15 px type,
`overflow-y: auto`, the card `max-width: 600px`), with two tabs. 내 기록 is not a tab: it stays the in-screen card it is
today, one button away (9.5). This keeps the 40-item shop out of the 256x224 screen's em budget, gives phones the
whole viewport (a 390x844 phone gets ≈ 390x780 instead of the game screen's 390x341), and leaves `#pg-rec` (already at
its fit limit, cloud §17 fix 10) untouched.

```html
<section id="pg-hub" class="pg-panel" aria-labelledby="pg-hub-h" hidden>
  <div class="pg-card pg-pcard pg-hub-card">
    <h2 id="pg-hub-h" class="pg-sr">상점과 마이페이지</h2>
    <div class="pg-hub-top">
      <div class="pg-tabs" role="tablist" aria-label="상점과 마이페이지">
        <button type="button" role="tab" id="pg-tab-shop" data-hub="shop" aria-selected="true" aria-controls="pg-hub-shop">상점</button>
        <button type="button" role="tab" id="pg-tab-my" data-hub="my" aria-selected="false" aria-controls="pg-hub-my" tabindex="-1">마이페이지</button>
      </div>
      <p class="pg-coins" id="pg-hub-coins" aria-label="비누 코인 0개"><canvas class="pg-ic pg-coin" width="8" height="8" aria-hidden="true"></canvas><b id="pg-hub-co">0</b></p>
    </div>
    <div id="pg-hub-shop" role="tabpanel" aria-labelledby="pg-tab-shop"><!-- 9.3 --></div>
    <div id="pg-hub-my" role="tabpanel" aria-labelledby="pg-tab-my" hidden><!-- 9.4 --></div>
    <p id="pg-hub-msg" class="pg-hub-msg" role="status" aria-live="polite"></p>
    <div class="pg-row"><button id="pg-hub-close" class="pg-btn pg-ghost" type="button">닫기</button></div>
  </div>
</section>
```

- **Opening.** `openHub(tab, from)`: `hub.from = from` (`'title'` or `'room'`), `hub.tab = tab`, `hub.opener =
  document.activeElement`, `showOverlay('hub')`, `hubShow(tab)`. `showOverlay` already starts an online panel opened from
  another overlay at scrollTop 0 (cloud §17 fix 16); the hub is added to that rule.
- **Tabs.** A tab click calls `hubShow(name)`: swaps `hidden` on the two tabpanels and `aria-selected` / `tabindex` on the
  tabs. ←/→ on a focused tab moves to the other (the ARIA tabs pattern). `.pg-tabs { display: flex; gap: 0.3em; }`; each
  tab: font 1em bold body face, padding 0.4em 1em, border-radius 999px, min-height 40px (44px on touch);
  `[aria-selected=true]` uses the duck colour like `.pg-seg`.
- **The coin chip** at the top right is shared by both tabs: `[coin] 1,234`, `font-family: var(--font-sign)`.
- **Closing.** `closeHub()`: `S.cv = coinBal(S)` (the dot rule), then `showOverlay(hub.from)` (+ `renderRoom()` for the
  room) and focus `hub.opener` (`#pg-tro`, `#pg-shop-btn` or the room's 꾸미기). Escape and 닫기 both call it.

### 9.3 The 상점 tab

```html
<div class="pg-shop-top">
  <button id="pg-shop-view" class="pg-look-view" type="button" aria-label="미리 보기 · 눌러서 다른 동물로 보기"><canvas width="32" height="32"></canvas></button>
  <div class="pg-shop-info">
    <p class="pg-shop-name"><b id="pg-shop-iname"></b><i id="pg-shop-rar" class="pg-rar"></i></p>
    <p id="pg-shop-desc" class="pg-shop-desc"></p>
    <button id="pg-shop-buy" class="pg-btn" type="button"></button>
  </div>
</div>
<div id="pg-shop-slots" class="pg-slot5" role="tablist" aria-label="부위"></div>   <!-- 5 tabs: 8x8 slot icon + 머리/얼굴/목/등/효과 -->
<div id="pg-shop-grid" class="pg-items" role="listbox" aria-label="아이템"></div>
```

**Layout.** The top row is the preview (96 px square) beside the item's name + rarity chip, its one-line `desc` and the
action button; below it the 5 slot tabs and the item grid. The panel scrolls if it must; the grid never scrolls on its
own. The action button sits next to the preview so that it is on screen while a phone user taps through the grid.

**Preview.**
- A 32×32 canvas shown at 96 px (`image-rendering: pixelated`): a floor line, and **my picked animal** wearing my set with the selected item tried on in its slot.
- It animates through `hubTick()` from the main loop, redrawing at most every 4th frame: idle frames, or walk frames when the selected item is a walk effect (e4, e6), and a hop every 2 s when it is e2 / e3, so every effect is visible. A private particle list (≤ 20) handles it; reduced motion shows the idle frame and no particles.
- Tapping the preview cycles the animal shown: preview only, the pick is unchanged.
- No twin colour and no slot outline here: the preview shows the animal as it looks in solo.

**Slot tabs** (`#pg-shop-slots`): 5 buttons `role="tab"`, each the 8×8 `slot_<s>` icon at 2x over its name; the selected one in the duck colour. Each slot holds ≤ 12 items.

**Grid.**
- `grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 6px`, 44 px rows: a 12-item slot is 2 rows at 390 px, 3 rows at 320 px.
- **Each cell** is a `button role="option"`:
  - The item's art centred at 2x in a 32×32 canvas (effects: `ic_e<n>` at 4x).
  - A border in the rarity colour; 전설 gets a 2-frame shimmer of its border (reduced motion: static).
  - A small check mark (the `ready` sprite) when owned, and a duck-colour outline when worn.
  - A lock (`lock` sprite) and 40 % opacity when league-locked.
  - The aria-label reads "바가지 모자 · 고급 · 160코인 · 가지고 있어요 · 쓰고 있어요" (or "· 온탕 단골 리그부터"); the last part uses the slot's verb (`SLOT_INFO[s].on` → "쓰고 있어요" / "하고 있어요" / "켜 놨어요").

**The action button `#pg-shop-buy`** (primary, duck colour); its states (`V` = `SLOT_INFO[slot]`):

| State | Label | Behaviour |
|---|---|---|
| Unowned, unlocked, affordable | `사기 [coin]160` | First tap → **armed** for 2.5 s: label "한 번 더 누르면 사요", pink, sfx `arm`. Second tap within 2.5 s → `shopBuy(id)`. Same pattern as `confirmTwice`, but always armed (it is spending). |
| Bought | (becomes `V.off`) | sfx `buy`; the coin chip counts down over 0.4 s; message "샀어요! 바로 {V.done}" ("샀어요! 바로 썼어요"; the first purchase ever adds " · 마이페이지에서 바꿀 수 있어요"); a sparkle in the preview |
| Not enough coins | `[coin]160 · 32개 모자라요` | disabled (`aria-disabled`, focus kept) |
| League-locked | `[lg] 온탕 단골 리그부터` | disabled |
| Owned, not worn | `V.on` (쓰기 / 하기 / 켜기) | `lookSet(slot, id)`, sfx `equip` |
| Worn | `V.off` (벗기 / 빼기 / 끄기) | `lookSet(slot, null)`, sfx `equip` |
| Read-only store (`TRO.ro`) | `이 브라우저에서는 저장되지 않아요` | disabled |

**First visit** (`!S.sh`): no item is selected; the info column shows the desc line "게임을 하면 비누 코인이 모여요 · 이기든 지든, 혼자 해도!" and the button reads "아이템을 골라 봐요" (disabled). `S.sh = 1` is set when the tab is first shown.

**Opening** selects the cheapest affordable unowned item of the first slot that has one (otherwise the first item of 머리).

### 9.4 The 마이페이지 tab

```html
<div class="pg-my-top">
  <button id="pg-my-view" class="pg-look-view" type="button" aria-label="내 꾸미기 · 눌러서 다른 동물로 보기"><canvas width="32" height="32"></canvas></button>
  <div class="pg-my-info">
    <label class="pg-my-nick"><span>이름</span><input id="pg-my-nick" class="pg-input" type="text" maxlength="12" autocomplete="nickname" spellcheck="false" enterkeyhint="done"></label>
    <p class="pg-my-stat"><span id="pg-my-tro"></span><span id="pg-my-lg" class="pg-my-lg"></span></p>
    <p id="pg-my-note" class="pg-my-note"></p>
    <button id="pg-my-rec" class="pg-btn pg-ghost pg-small" type="button">내 기록</button>
  </div>
</div>
<div id="pg-my-slots" class="pg-eqslots" role="tablist" aria-label="꾸미고 있는 것"></div>
<div id="pg-my-grid" class="pg-items" role="listbox" aria-label="내 아이템"></div>
```

- **Preview.** My picked animal with my worn set, animated and effect playing, as in 9.3.
- **Name.** `#pg-my-nick` is bound to `netSetNick` (change / blur), like `#pg-nick`. In a room this sends `nk`, as the friends panel already does.
- **Status line.** `troChip(S.t)` (league icon + cup + count) and the league name (the coins are in the shared chip, 9.2).
- **Note** (first match wins):
  1. `TRO.mem || TRO.ro` → "이 브라우저에서는 저장되지 않아요"
  2. nothing owned but the starter, and `n1` not worn → "처음 선물: 초록 때타월 리본을 달아 봐요"
  3. the day bonus not paid today → "오늘 첫 판 하면 코인 +{next}!" (no particle after the number: "+25이" would be wrong)
  4. otherwise → "{bs}일 연속 · 내일 첫 판 +{next}"
- **내 기록** opens the existing card: `openRec('hub')`. The cloud's sign-in lives there, as today; when the cloud is on and this store is not linked, the note line gets a second line, the pitch (8.5), so the cloud stays discoverable one tap away.
- **Equipment (`.pg-eqslots`)** works like Crazy Arcade's equipment panel: 5 boxes in a row, each showing **the worn item's art** at 2x (or the grey `slot_<s>` icon when bare) with the slot name under it. The selected box lists its items below.
- **Grid.** The first cell is "없음" (bare: a dashed square, aria-label = the slot's `off` verb), then the owned items of that slot in purchase order (the starter first in 목). Tapping a cell wears it at once (`lookSet`, sfx `equip`), with no confirm.
  - Empty slot: one line "아직 없어요 · 상점에서 골라 봐요" plus a small ghost button "상점 가기" (`hubShow('shop')` with that slot selected).
- **Showing the tab** sets `S.seen = 1` (the badge's dot) and warms the cloud SDK (`clWarm()`, as `openRec` does today, because 내 기록's sign-in button is one tap away).

### 9.5 내 기록 `#pg-rec`

- **Unchanged** (markup, h2, layout, fit, cloud line). Only its return path changes:
- `openRec(from = 'title')` remembers `rec.from`. `closeRec()` goes back to `rec.from`: the title (as today) or the hub's 마이페이지 tab (`openHub('my', hub.from)`, focus on `#pg-my-rec`).
- `openRec()` with no argument keeps today's behaviour, so the trophy and cloud tests that call it keep working.
- `fillRec`'s first-gift note is unchanged.

### 9.6 Room: 꾸미기

- **Button.** The 내 캐릭터 box heading becomes `<h3>내 캐릭터 <button id="pg-room-look" class="pg-btn pg-ghost pg-small" type="button">꾸미기</button></h3>`, right-aligned on the same line as the h3 (the room panel scrolls, so its height is free). It opens `openHub('my', 'room')`.
- **While the hub is open from the room:**
  - The room panel is hidden (overlays are exclusive) and the session carries on.
  - `renderRoom()` keeps rendering into the hidden panel.
  - A guest's ready state is unchanged.
  - If the host starts, `guestBegin` → `showOverlay(null)` closes the hub. The host cannot start from the hub, because the 시작 button is in the room.
  - Closing calls `showOverlay('room')` + `renderRoom()`.
- **Player cards** (`renderRoom`): `portraitCanvas(r.char, 'portrait_', 32, lkOf(r), twinSlot)`, so friends see each other's 머리 / 얼굴 / 목 items (and distinction's twin colour) in the room. The card `_key` gains the look.
- **Rules lines** (`#pg-room-rules`), appended after the trophy lines:
  - not practice: "이기든 지든 비누 코인을 받아요"
  - practice: "연습 경기라 비누 코인도 없어요"

### 9.7 목욕 끝 / ending cards: the coin row

```html
<div id="pg-over-crow" class="pg-tro-row" hidden><dt>비누 코인</dt><dd id="pg-over-coin"><canvas class="pg-ic pg-coin" width="8" height="8" aria-hidden="true"></canvas><span>+0</span> <small>0개</small></dd></div>
<!-- #pg-ending's dl: the same with pg-end-crow / pg-end-coin, after pg-end-trow -->
```

- **When `coinCard(name)` runs.** In `showOverlay('over' / 'ending')`, after `troCard`: `coinEnd()`, then the row shows `R.got` (everything this run paid, the day bonus included).
- **Visibility.** The row is shown only when `coinOk()` and (`R.got > 0` or the day's cap halved something).
- **The `<small>` text** (first match): the first coins ever → **"상점에서 써요!"**; the day bonus is in it → "첫 판 +20"; halved → "오늘은 반만 모여요"; otherwise the balance "1,234개".
- **Animation.** 0.5 s after the card opens (with the trophy row's pop), `+N` pops (`pg-tro-pop`) and sfx `coin` plays.
- **Fit.** In both cards, under `@container (max-height: 22em)`, when the coin row and the trophy row are both shown (`.has-2rows`):
  - `#pg-over`: the **최고 점수** row hides. It is wrapped as `<div class="pg-tro-row pg-hi-row">` with `#pg-over-hi` kept, the HUD's HI shows it, and a new best still gets the "최고 기록 달성!" chip.
  - `#pg-ending`: `#pg-end-sub` hides.
- **Online co-op guests and the host** each show their own coins.

### 9.8 Podium: my block's coin line

- **Data.** `CO.pod = {gid, give, bonus}` is set by `coinBattleNow()` (host: in `endBattle`, beside `troHostResult`; guest: on the first `'d'` snapshot of the game id).
- **Drawing.** `coinPodLine(slot, x, y)` is called from `drawPodium` **for my slot only**.
  - From `T1 = max(75, the trophy flip end) + 40` frames, my block's second line (top + 21) **alternates every 90 f** between its usual content (the trophy change in a ranked match, the score otherwise) and the coin line.
  - The coin line is the `coin` sprite (frame 1 for 4 f at each swap: a glint) + 1 px + "+38" in the 5x7 font, colour `#ffc9dc` with the `#0c2629` outline.
  - The widest case is "+76" (5분 1st + 6 KOs + a 40 day bonus): 8 + 1 + 17 = 26 px ≤ the 32 px block.
  - Reduced motion: the same swap (a text change, not motion).
- **Sound.** `coin` plays at the first swap.
- **Screen reader.** `#pg-podium-sum` gains ", 비누 코인 +38개" (", 오늘 첫 판 +20 포함" when it applies), or ", 연습 경기라 비누 코인은 없어요".
- **Why not DOM:** the podium's title line and its one note line are full at 1x (trophies §8.8). The canvas block has the room.

### 9.9 First-time flow and hints

1. **First coins** (a card or the podium): the card's small text says "상점에서 써요!". The title's 상점 button lights its dot and hops twice.
2. **First 상점 visit:** the intro desc line (9.3).
3. **First purchase:** the message adds "· 마이페이지에서 바꿀 수 있어요".
4. **마이페이지, first time:** the starter note (9.4, note 2).
5. **During play, a 탕 clear that paid:** a local word pop "+6" (or "+15") in `#ffc9dc` over my animal (`wordPop`, with `NET.rec` off around the call on a host, so only this screen shows it).

### 9.10 Keys and focus

- **`onKeyDown`.** `'hub'` is a plain form, like the online panels:
  - Buttons and inputs work (`onPickerInput` already covers typing in `#pg-my-nick`; its Escape branch, today `friends` only, also closes the hub).
  - Escape → `closeHub()`; M mutes.
  - Game keys do nothing (Z / X never buy, and ←/→ never pick an animal).
  - ←/→/↑/↓ inside a grid move the selection (roving tabindex, the listbox pattern), and Enter / Space press the focused cell or button.
  - `'rec'` keeps today's behaviour.
- **`primaryAction`.** It starts with `if (shownOverlay === 'hub') return;`, so the touch 거품 / 점프 pads (hidden behind the panel anyway) and Enter never start a game behind the hub.
- **Focus on open** (not touch): the selected grid cell in 상점, the selected equipment box in 마이페이지.

### 9.11 Fit rules (all checked by screenshots and `scrollHeight` in 16.6)

| Size | Title row | Hub (`.pg-panel`) | Cards |
|---|---|---|---|
| 256×224 1x (23.3 × 20.4em, mouse) | 3 buttons, no wrap; shop button icon-only | may scroll (as 친구와 하기 does); no horizontal overflow | coin row; 최고 점수 steps aside when both rows show |
| 320×568 touch (25.6 × 22.4em) | icon-only, 44 px target | the whole 상점 tab with a 12-item slot (3 grid rows) and 닫기 shows without scrolling | as 1x |
| 360×740, 390×844 portrait | label "상점" from 30em | no scrolling in either tab | as is |
| 844×390 landscape touch | label shown | scrolls (≈ 340 px tall); the action button stays beside the preview | as is |
| 512×448 2x and larger, desktop | label shown | no scrolling | as is |

The title card and the cards keep `overflow-y: auto` as a last resort, but the test requires `scrollHeight ≤
clientHeight` for them everywhere above. The hub is a scrolling panel by design; its test checks no horizontal overflow
at every size and no vertical scroll at the sizes the table says.

---

## 10. Art (`src/sprites.js`; existing palette keys only)

| Name | Size | Frames | Notes |
|---|---|---|---|
| `coin` | 8×8 | 2 (front; glint) | a pink soap disc: P fill, p shade, q rim, w glint, a small c bubble emblem, k outline; never yellow (the trophy cup is yellow) |
| `shop` | 8×8 | 1 | the title button icon: a pink 목욕 바구니 (basket) with a white towel on top; p q P w k |
| `lock` | 8×8 | 1 | a grey padlock; a W d k |
| `slot_h`, `slot_f`, `slot_n`, `slot_b`, `slot_e` | 8×8 | 1 each | grey-cream silhouettes: a hat, glasses, a bow, a cape, a sparkle; W a E k (tinted in the UI when selected) |
| `it_<id>` (h1…hc, n1…n8, b1, b4–b7) | per §4 (≤ 12×8 / 10×4 / 8×10) | 1 | item art with its own 1 px k outline, facing right |
| `it_f1` … `it_f7` | profile ≤ 5×3, front ≤ 9×3 | 2 | [profile, front] |
| `it_b2`, `it_b3` | 14×5 | 2 | [back half, front half] of the tube |
| `ic_e1` … `ic_e6` | 8×8 | 1 | 상점 icons for the effects: a steam swirl, a droplet, sparkles, two bubbles, a heart, a rainbow footprint |

- **Pivots.** Every `it_*` frame has its pivot as data: `PG.ITEM_PIVOT = { h1: [5, 5], ... }` (in item pixels; the default by slot is H = bottom-centre, E = centre, N = top-centre, B = right-middle (the shoulder side faces right), W = centre). `itemFrame(id, part, face)` returns `{c, m, w, h, px, py}`.
- **game.js.**
  - `OPT_SPR` gains every `it_*` / `ic_*` / `slot_*` with its frame count, and `sizeOf` learns their sizes from `PG.ITEM_SIZE`. A missing or misshapen item frame is left out: that item then draws nothing in play and its 상점 cell shows the slot icon.
  - `REQUIRED` gains `coin: 2, shop: 1, lock: 1`, with `fallbackFrame` stand-ins (a pink circle, a pink square, a grey square).
  - **Never a stand-in box for an item.**
- **tools/check-sprites.js.**
  - Add the sizes and frame counts.
  - Every `it_*` uses only palette keys, has a `k` outline pixel on each side of its bounding box, and respects 6.3's limits. Its pivot is inside its bounds.
  - `coin` ≠ `trophy` (no `Y` in `coin`).
  - The palette is still ≤ 64.
  - Contact-sheet rows: every item alone on dark and on each theme, and the anchor sheet of 16.5.

---

## 11. Sound (`src/audio.js`: 4 new sfx, all local through `uiSfx`, never echoed)

| Name | Sound | When |
|---|---|---|
| `coin` | a bright soap "띵": a triangle at C7 (2093 Hz) for 60 ms over a short sine bubble pop (a fast downward sweep 1200 → 600 Hz, 40 ms), v 0.14 | coins pop on a card, the podium coin line's first swap, the balance counting |
| `arm` | a soft wooden tick (like `stamp`'s low end, 30 ms), v 0.1 | the first tap on 사기 |
| `buy` | "뽀득!": two quick squeaky rises (sine 900 → 1600 Hz, 50 ms each, 30 ms apart), then a sparkle of 3 high notes (E7 G7 C8, 35 ms steps) | a purchase |
| `equip` | a cloth "슥" (band-passed noise, 80 ms) + a small pop (sine 700 Hz, 25 ms) | wearing or taking off |

`tools/audio-node-test.js`: add the 4 names and rebaseline.

---

## 12. Korean strings (`SHOP_TEXT`, top constants; warmed in `setupDOM` next to `TRO_TEXT`)

```js
  const SHOP_TEXT = ITEMS.map((it) => it.name + ' ' + it.desc).join(' ') + ' ' + RARITY.map((r) => r.name).join(' ') +
    ' 처음 선물 비누 코인 상점 마이페이지 내 기록 머리 얼굴 목 등 효과 사기 한 번 더 누르면 사요 개 모자라요 리그부터 닫기' +
    ' 쓰기 벗기 하기 빼기 켜기 끄기 샀어요! 바로 썼어요 했어요 켰어요 마이페이지에서 바꿀 수 있어요' +
    ' 게임을 하면 비누 코인이 모여요 이기든 지든, 혼자 해도! 아이템을 골라 봐요' +
    ' 이름 없음 아직 없어요 상점에서 골라 봐요 상점 가기 꾸미기 처음 선물: 초록 때타월 리본을 달아 봐요 오늘 첫 판 하면 코인 +!' +
    ' 일 연속 내일 첫 판 상점에서 써요! 오늘은 반만 모여요 이기든 지든 비누 코인을 받아요 연습 경기라 비누 코인도 없어요' +
    ' 이 브라우저에서는 저장되지 않아요 트로피·꾸미기가 이어져요 꾸미기는 0123456789,· :';
```

- Every visible string in section 9 comes from this list (`SLOT_INFO`'s verbs included). Strings built from fragments ("{n}개 모자라요", "{bs}일 연속 · 내일 첫 판 +{n}", "오늘 첫 판 하면 코인 +{n}!", "샀어요! 바로 {done}", "[league] 리그부터") use only syllables listed here. The hub's tab labels and the coin chip are in the sign / body faces already warmed by these words.
- aria-labels are not warmed (they are not rendered in the web font).
- `CLOUD_TEXT` gets the two changed lines (8.5).

---

## 13. Edge cases

| Case | Behaviour |
|---|---|
| Two tabs: buy in one while the other shows the 상점 | Every purchase re-reads the store (`troMut`). The other tab's `storage` event refills its card. A second buy of the same item refuses with 'own' ("이미 가지고 있어요"), and spending coins that are gone refuses with 'poor'. |
| Two tabs writing the store at the same moment (review 2026-10-18) | `troMut` is read-modify-write on `localStorage`, which is not atomic across tabs: two writes within the storage sync latency (milliseconds) can lose one - an award or a purchase - as for trophies. This is a stated limit, not prevented. A purchase made in the last 5 s that another tab's write did not carry is noticed at that write's `storage` event, and the 상점 says "다시 사 주세요" (its coins came back with it). |
| Buy in a tab while another tab is in a ranked match | Coins and trophy holds are separate fields of one store, and every change is read-modify-write, so neither overwrites the other. |
| A guest disconnects mid co-op run | The 탕 already cleared were paid at each clear. The card's play coin / revives are not paid (the card never shows). |
| A battle walkover | base (by minutes played) + KOs, no place bonus (3.2) |
| Draw (everyone tied) | everyone gets the floored average of the place bonuses |
| The host's own network dies (a void trophy result) | Coins are separate: each screen that reached the podium pays its own base / place / KO. A screen that never reached the podium pays nothing. |
| Practice (q 1 / 2), offline debug battle / local co-op, attract | 0 coins; the cards hide the row; the room says why |
| Storage blocked (`TRO.mem`) | coins and purchases for this session only; the cards and hub say "이 브라우저에서는 저장되지 않아요" |
| A newer page's store (`'newer'`) | read-only: no coins given, purchases refused, the worn set still shows |
| Day change mid-session | `coinGive` reads `troToday()` at each award, so the soft cap resets and the streak extends exactly once |
| Clock set back / forward | A bonus is paid only when `S.bd < today`: a clock set back by a day pays nothing until the date catches up; set back by more than a day (or a `bd` from a wrong clock anywhere on the account), the stale `bd` is forgotten and the bonus pays at streak day 1 (3.4). Setting it forward pays one bonus per new day, at most 40 each time. Flipping the clock to farm bonuses is possible and accepted (3.5). |
| Balance at 99,999 | further coins are not added (`give` capped); `ce` stops with it |
| An item removed from the catalog later | Never remove: an id stays forever (prices are frozen per id). A retired item would only be hidden from the 상점 grid with `retired: 1`, and owners keep and wear it. |
| A friend's page shows an item my page does not know (newer catalog) | `lookParse` drops that slot to `'0'` (bare there) |
| Equipped item no longer owned (cloud sign-out, store reset) | `lookOwned` strips it at parse, so the worn set never shows an unowned item |
| Two devices of one account spend the same coins offline | Both purchases stand (items are a union). The balance shows 0 with a debt that later coins pay first (cloud §6.2). |
| Two devices of one account buy the **same** item offline | It is owned once and paid twice (8.2). Rare; accepted. |
| A purchase in another tab while this tab plays a match | The match keeps the look it started with (6.5); the next match wears the new set. |
| The hub open from the room when the host starts | `guestBegin` closes it (`showOverlay(null)`); the guest plays with the look it had at the start (9.6). |
| League dropped after buying a league item | It is kept and wearable (`S.bl` is the best league ever reached). |
| Hat and podium crown | the crown lifts above the hat (6.6) |
| Capy wearing a hat while its yuzu "lifts off" in the slam | the yuzu is erased under hats in every frame (`hide`) |
| A turned fallback pose (missing art) | drawn bare |
| `reducedMotion()` | no effect particles, no shimmer, no nudge; items, the podium coin swap and the card pops stay (pops are already disabled by today's CSS rule) |

---

## 14. Integrity: what each party can do

| Who | Can | Cannot |
|---|---|---|
| Local user (devtools, localStorage) | give themselves coins and items on their own device | affect anyone else; raise the cloud copy faster than the rules allow (8.3); make others see a non-catalog item |
| Hostile host | fake a podium so a guest's own client pays itself a little more or less (bounded by 3.2's maximum: 36 a match, base 22 + place 8 + KOs 6, plus the day bonus) | change anyone's stored coins, items or worn set (nothing is sent); block purchases |
| Hostile guest | show any catalog item on its own animal without owning it (`lk` is self-reported) | change another player's look; send a non-catalog id (dropped to `'0'`) |
| Anyone | – | affect trophies, play or other players' coins through anything in this spec |

---

## 15. Debug / test API (`PG.debug.shop`)

```js
  PG.debug.shop = {
    state(),                 // {co, ce, sp, own, eq, cd, cde, bd, bs, sh, cv, run, pod, newDot, lift, shots, hub: {tab, from, sel, btn}}
    give(n, day),            // coinGive(n, day) (the real path: soft cap, bonus)
    set(o),                  // merge into the store (clamped by troParse) and save
    buy(id), wear(slot, id), // shopBuy / lookSet
    battle(n, fin, me, leftF, timeF, shots, kos),   // the pure coinBattle
    clear(idx, ended), end(),                       // coinClear / coinEnd on the current run
    allowBc(on),             // pay coins over 'bc' (tests only, like tro.allowBc)
    bare(on),                // draw every animal without items (comparison shots)
    anchors(name, fi),       // the resolved anchors of a frame
    frame(c, anim, fi, lk),  // a composite as a data URL (the anchor sheet)
    lift(c, lk), look(),     // lookLift; myLook
    open(tab, from),         // openHub: tab 'shop' | 'my', from 'title' | 'room'; close() = closeHub
  };
```

---

## 16. Tests to write later

**Store hygiene (every new test).** A test that buys or wears items does it in its own store namespace
(`PG.debug.tro.ns(...)`) or restores the store at the end. A worn set left in the default key would change the pixels of
`kits-*`, `sprites-*` and distinction's "solo unchanged" baseline, which all assume a bare store.

### 16.1 `src/tests/shop.js` (virtual time, offline; "SHOP PASS|FAIL …", "SHOP DONE pass=N fail=M")

1. **Economy (pure):**
   - `coinBattle` for n 2/3/4 × 2/3/5 min × every place matches 3.1, and every tie group's floored average.
   - Walkovers get no place bonus; < 60 s → 0; < 5 shots → 0; the KO cap holds.
   - Over random fins: never above 22 + 8 + 6.
2. **Runs:**
   - A solo game over in the 4th 탕 → 3 × 6 + 2 (+ the day bonus on the day's first).
   - A full clear → 232.
   - A 탕 with 1 shot pays 0; the same index twice pays once.
   - 2회차 is a new run.
   - Offline local co-op and the attract demo pay 0.
   - **Shots:** `fire()` for my animal counts once per blow (an otter volley is 1); a host's `hostShot` for a remote player does not count.
3. **Day bonus and soft cap:**
   - Streak 20 → 25 → 30 → 35 → 40 → 40 over faked days (`tro.today`); a skipped day resets to 20.
   - A clock moved back by one day pays no bonus; a store whose `bd` is 5 years ahead pays the bonus at streak 1 and stores today.
   - 400 at full rate, then halves (floor, min 1).
   - The bonus is never halved, and the balance stops at 99,999.
4. **Pace simulation** (the table in 3.7, with fixed per-탕 times): the first item at ≤ 12 min; an evening ≥ 380; two weeks ≥ 2,800.
5. **Storage:**
   - A v1 store (with a link record and holds) → v2, with every trophy field identical and coins 0. `v: 3` → read-only and untouched.
   - Clamps: `ce: 1e12`, duplicate / unknown / starter ids in `own`, `eq: 'zzzzz'`, an unowned worn item.
   - Read-modify-write: write `ce` behind the page's back, then buy, and the result builds on the written value.
   - Two-tab `storage` refresh.
6. **Shop:**
   - Buy unowned / owned / locked / poor / read-only.
   - The second-tap arm (a second tap after 2.6 s re-arms instead of buying).
   - Bought = worn; take off; the starter is always wearable.
   - The button's verb follows the slot (a hat: 쓰기 / 벗기; a scarf: 하기 / 빼기; an effect: 켜기 / 끄기), and the bought message too ("샀어요! 바로 썼어요").
   - The NEW dot rule, and `S.cv` on close.
7. **Rendering (anchors, pixel checks on the composites):**
   - For every animal × every frame with anchors × a test set:
     - the H anchor pixel and the one below are opaque body pixels;
     - E lies within the head's opaque box; N and B / W lie on opaque body pixels;
     - every item pixel is inside 24×24; no item pixel is below row 16 + 8;
     - a hat is ≤ 6 px above the frame top in idle 0;
     - the anchors move with the frame's own head rows (idle 1 one lower than idle 0, walk 1 / 3 one higher) within ±1 px.
   - The flipped composite equals the mirrored one.
   - Squashed draws keep the hat on the head: render at `sq` ±0.32 and find the hat pixels above the body's top row.
   - The penguin slide is drawn 3 px lower with the hat on its head.
   - capy_slam / cat_flip hide B / W.
   - The capy's yuzu is gone under a hat.
   - Die / trapped / ghost / life frames have no items.
   - `lookLift` is right; `headTop(p)` = `p.y − lookLift`; the tag arrow never overlaps hat pixels in idle (render the arrow and test the overlap); the stun stars and the podium crown sit above the hat.
   - **With distinction's passes in:** a twin (2P duck) wearing the 바가지 모자 (h5, keys Y y L) keeps the hat's yellow while its body is pink (the order of 6.2), and the slot ring's pixel 1 px above the hat's top is the slot colour, 2 px above is `SLOT_INK`.
   - `bare(true)` restores today's exact pixels.
8. **Effects:**
   - With `reducedMotion` stubbed: no spawns.
   - The budget: 4 players with e6 + e4 walking for 600 f never push `G.parts` over the multi cap.
   - e5 fires on a score jump of 500; e6's dots start at the heel (never under the body's centre column).
9. **UI:**
   - The badge opens the hub on 마이페이지; the 상점 button opens it on 상점; the tabs switch; 내 기록 opens `#pg-rec` and its 닫기 returns to 마이페이지; Escape / 닫기 return to the title (or the room) and focus goes back to the opener.
   - Z / X / Enter never start a game from the hub; the touch pads too.
   - The name field calls `netSetNick`.
10. **Fonts:** every visible shop string's syllables appear in `#pg-fontwarm`.

### 16.2 `src/tests/shop-net.js` (3 frames over bc, `tools/serve.js`; every frame `tro.ns('s' + i)`, `shop.allowBc(true)`, `tro.allowBc(true)`; "SHOPNET … DONE")

1. `hi.lk` reaches the host's roster, and room-phase R seats carry `lk` at index 5 only for wearing seats; game-phase seats stay 4 long.
2. A guest's `eq` (wear in the hub opened from the room) shows on the host and the other guest within one R; an `eq` sent in the game phase is ignored.
3. Each frame's players draw the right composite: `shop.state` + a pixel probe at each player's H. A wear in another tab of a guest's browser mid-match does not change that guest's look until the next match.
4. A forged `lk: 'zzzzz'` / `'9z9z9'` → bare / catalog-only.
5. An old-page guest stub (no `lk`, reading index 4) keeps its counts in both phases.
6. `snapMax ≤ 3400` and `snapTrim` within +2 % of the same run with bare players (looks add nothing to snapshots).
7. **Battle coins** (`setTimeLeft(1)`): every frame pays itself exactly the **host-side** `coinBattle` for its slot with `leftF` 0 (the host's order, its count at 시작!, that frame's own blows), and the podium lines and sr text match. (Changed by the review of 2026-10-18: "from its own view" would have passed with the guest's lost minute.)
8. **Co-op:** every active frame gets the same per-탕 coins, an idle frame (no shots) gets none, and revives pay the reviver.
9. **Practice:** without `allowBc` → 0 everywhere, and the room's rules line says so.

### 16.3 Cloud (`src/tests/cloud.js` groups + the JS port of the rules in `FakeFirebase`)

- `clMine` / `clAdopt` / `clStep` with coins:
  - idempotent adoption;
  - a debt from two devices;
  - two purchases offline → two writes, one item each, `sp` exact;
  - the same item bought on two devices → owned once, `sp` holds both prices;
  - the `ce` rate cap splitting a big gain;
  - `eq` last-write-wins without overwriting a pending local change;
  - another slot's `bd` 5 years ahead is skipped by `clAgg`; this slot's own write keeps `max(m.bd, S.bd)`.
- The v1 → v2 upgrade write, and an old page facing a v2 doc → 'newer', never writing.
- Every case of 8.4's list, refused and allowed.
- A fold with coins and items sums exactly.
- The 내 기록 fit with the longer pitch line (the cloud §17 fix 10 frames), and the updated `PITCH` / `SWAP` pins.

### 16.4 `tools/check-shop.js` (node, static; in run-all)

- `ITEMS`: 40 entries, ids unique and matching `/^[hfnbe][1-9a-z]$/`, prices by rarity band, the sum = 10,450, exactly one league item per league 1–6, the starter price 0.
- Every `it_*` frame exists with its size and pivot, and every animal has anchors for every sprite name it uses (a missing frame is a warning until pass A2 lands, then an error).
- `firebase/firestore.rules`' generated block (between `GENERATED` and `END GENERATED`) equals the catalog. `--write` regenerates it.
- `SHOP_TEXT` covers the catalog and `SLOT_INFO`'s verbs.

### 16.5 The anchor contact sheet (`tools/check-sprites.js` new row; look at it with Read)

- Every animal × every anchored frame (flipped too), at 4x, wearing the test set:
  - a 10×6 magenta-outlined hat;
  - 5×3 / 9×3 glasses;
  - an 8×3 scarf;
  - a 6×8 cape;
  - a 14×5 tube.
- The 6 portraits with the same set at 2x.
- The penguin slide 3 px low, the capy slam, the cat flip, and a squash of ±0.32.

### 16.6 Screenshots and fit (`shop-*` jobs)

- **Title:** 1x mouse (3 buttons on one row, no overflow), 2x, 320×568, 360×740, 390×844, 844×390. Also the shop dot + nudge, and the deploy title (`pwa-*`, with its install line). `scrollHeight ≤ clientHeight` on the title card at every size.
- **Hub, 상점:** the first visit, an armed buy, poor, locked, a 전설 selected, the e6 preview walking. At 320×568, 390×844 and desktop: no vertical scroll; at 1x and 844×390: no horizontal overflow.
- **Hub, 마이페이지:** the starter note, the full inventory, the empty-slot line, the cloud pitch line on the deploy fixture.
- **내 기록:** unchanged (the existing `cloud-rec-*` / `a4-rec-*` shots must not move).
- **Cards:** the 목욕 끝 card with both rows at 1x / 320 (최고 점수 stepping aside); the ending. `scrollHeight ≤ clientHeight`.
- **Podium:** the coin swap.
- **Play:** a 4-player battle with all four wearing hats (tags lifted, outlines continuous, twin colours); the same with `bare(true)` for comparison.
- **Room:** cards with items (and a twin).

### 16.7 Existing tests to re-run and fix

| Test | Why |
|---|---|
| `trophies.js` | L286 pins the badge's aria-label ("· 내 기록 보기" → "· 마이페이지 열기"); L287-299 click the badge and expect `#pg-rec` (now: the hub's 마이페이지; open 내 기록 with `T.openRec()` or `#pg-my-rec`); `TRO_V` 2 in any stored-JSON comparison |
| `cloud.js` / `check-cloud.js` | CL_V 2, slot shape (`sp`), `PITCH` (L33) / `SWAP` (L565), L363's aria regex, the 내 기록 fit |
| `mp-net.js`, `rv-net.js` | unchanged bytes (looks are room-phase only); re-run to prove it |
| `final-e2e.js` | `#pg-title-hi` still parses; the title row |
| `ux-review.js`, `shot-phone.js`, `ux-roomrow.js` | title fit, room cards |
| `kits-*.js`, `sprites-*.js` | composites are inert for bare players (pixel-identical frames) |
| `tools/audio-node-test.js` | 4 sfx |

---

## 17. Files touched (implementation checklist)

- **`src/game.js`:**
  - Top constants (2, 12).
  - The store v2 (5.2: `troFresh`, `troParse`, `isItemId`, `lookParse`, `lookOwned`, `lookPut`, `myLook`).
  - A new section `// ---- v4 shop (비누 코인 · 상점 · 마이페이지)` after the trophy section: `CO`, the economy (3), `shopBuy` / `lookSet` / `lookOut` (5.3, 7.2), the hub UI (9), `PG.debug.shop`.
  - Rendering: `anchorsOf`, `itemFrame`, `lookFrame`, `lookLift`, `headTop` (replacing distinction's stub), `lookFx`, `lookPortrait`; `drawEnt` (`o.look`, after `o.twin`), `drawPlayer` (+ `drawStars` and the slam lines at `headTop`), `drawAfterimages`, `drawPodium` (crown at `headTop`, `coinPodLine`), `troPodCups` (landing at `headTop`), `drawKfx` ('heart'), `portraitCanvas` (`lk`; `tw` arrives with distinction D3), `makePlayer` (`look`). (`drawTagArrows` / `syncTags` already use `headTop` after distinction D4.)
  - Hooks:
    - `nextRound` (`coinClear`), `newGame` / `newCoop` / `continueLoop` (`coinRunStart`), `toTitle` / `idleWorld` / `resetGame` (clear the run; the attract look).
    - `endBattle` (capture the clock, `coinBattleNow`); `troHostGo` / `troGuestGo` (`CO.n`, `CO.bshots = 0`).
    - `fire` (`coinShot`), `guestHostIn` (co-op index, battle `'d'`, the last `tl`), `guestBegin` (`look` from the roster), `rematch` / `retry` (`look` in the list).
    - `showOverlay` ('hub', 'over' / 'ending' `coinCard`, 'podium' sr text, 'title' `syncShopBtn`); `OVERLAYS` + `'hub'`.
    - `openRec(from)` / `closeRec` (back to the hub); `syncTroBadge` (aria "· 마이페이지 열기"); `onKeyDown`, `primaryAction`; `setupDOM` (ids, clicks, `SHOP_TEXT` warm-up).
  - Net: `roomInfo` (room phase), `guestRoom` (keep the room's look in the game phase), `netMsgIn` (`hi.lk`, `'eq'` in the room phase), the guest's `hi` (`lk`), `netStart` (`look`), `renderRoom` (꾸미기, portraits with looks, the rules line).
  - Cloud: `CL_V` 2, `clParseCs`, `clSlot`, `clDoc`, `clAgg` (incl. the `bd` sanity), `clMine`, `clAdopt`, `clStep`, `clDirty`, `clUpload`, the `eq` push, `CL_TX` pitch / swap.
- **`src/page.html`:**
  - The `#pg-shop-btn` markup and CSS (9.1).
  - `#pg-hub` (a `.pg-panel` beside `#pg-friends` / `#pg-room`) with its two tabpanels (9.2-9.4). `#pg-rec` is **not** changed.
  - The coin rows in `#pg-over` / `#pg-ending`, with the 최고 점수 row wrapped (`pg-hi-row`).
  - `#pg-room-look`; optionally `#pg-mychar-art` as a 24×24 composite (S3b, nice to have).
  - CSS for `.pg-hub-card`, `.pg-hub-top`, `.pg-tabs`, `.pg-shop-*`, `.pg-my-*`, `.pg-items`, `.pg-item`, `.pg-rar`, `.pg-eqslots`, `.pg-slot5`, `.pg-coins`, `.pg-look-view` (`image-rendering: pixelated`), `.pg-btn.pg-small` (new: font 0.85em, padding 0.35em 0.9em, min-height 32px, 44px on touch), `pg-nudge`, and the container queries of 9.1 and 9.7.
- **`src/sprites.js`:** `PG.ANCHORS`, `PG.ITEM_PIVOT`, `PG.ITEM_SIZE`, the item art and icons (10).
- **`src/audio.js`:** 4 sfx (11).
- **`firebase/firestore.rules`:** 8.4 (the catalog literals generated by `tools/check-shop.js --write`). **`FIREBASE-SETUP.md`:** re-publish the rules; the new honest limit line; "refresh every device once" after the update.
- **New tools / tests:** `tools/anchors.js`, `tools/check-shop.js`, `src/tests/shop.js`, `src/tests/shop-net.js`; additions to `tools/check-sprites.js`, `tools/audio-node-test.js`, `src/tests/cloud.js`, `src/tests/trophies.js`, `tools/run-all.js` (`shop` virtual time `doneZero('SHOP')`, `shop-net` rt http `doneZero('SHOPNET')`, `check-shop` node, the `shop-*` screenshot jobs).

---

## 18. Follow-ups (not v1)

- **Bubble skins / name-tag skins:** no. Bubbles carry each animal's kit look and the owner's slot ring, and tags carry identity. Request 2 needs both to stay readable.
- **Seasonal or limited items:** possible later as new ids (never re-priced ones).
- **A "꾸미기 보기" peek at a friend's full set in the room** (a tap on a card): it needs a popover that fits at 1x.
- **A coin leaderboard:** no, for the same reasons as cloud §8.

---

## 19. Implementation passes

Two tracks. **Code** passes edit `src/game.js` (and page.html, audio.js, tools, tests) and run strictly one after
another, each by a single agent, each starting from the previous one's green suite. **Art** passes edit only
`src/sprites.js`, `tools/check-sprites.js` and `tools/anchors.js`, and run in parallel with the code track (game.js reads
the new art data only from the pass named under "needs").

**Order across both docs:** distinction D1 → D2 → D3 → D4 → shop S1 → S2 → S3a → S3b → S4 → S5. Art: distinction A0
(before D3), then shop A1 (before S2) and A2 (before S3a's screenshots). Requests 1, 4 and 2 ship first because the user
is playing online with friends now; the shop is the largest change and builds on D3 / D4's ring and `headTop`.

**Every pass, before handing over:** `node build.js` succeeds; the pass's own run-all filter is green while iterating;
then the **full** `node tools/run-all.js` is green (no console error or warning in any job); the screenshots the pass
names are looked at with Read; anything built differently from this doc is written down in a short "as built" note at
the end of this file (as cloud-trophies.md §16 does). Never start a pass while another workflow is running the suite.

| Pass | Track | Needs | Files | Size (rough) |
|---|---|---|---|---|
| A1 anchors + UI icons | art | – | sprites.js, tools/anchors.js (new), tools/check-sprites.js | ~250 lines data + art |
| A2 the 40 items + effect icons | art | A1 | sprites.js, tools/check-sprites.js | ~45 frames |
| S1 store v2 + economy | code | D4 done | game.js, page.html, tools/check-shop.js (new), src/tests/shop.js (new), tools/run-all.js; trophies.js / cloud.js only where they compare a stored `v: 1` | ~450 + 30 + 150 + 400 |
| S2 items in play | code | S1, A1, D3 / D4 | game.js, src/tests/shop.js, tools/run-all.js (contact-sheet / play shots) | ~350 + 200 |
| S3a hub + 상점 | code | S2 (A2 for its shots) | game.js, page.html, audio.js, tools/audio-node-test.js, src/tests/shop.js, tools/run-all.js | ~400 + 200 + 60 |
| S3b 마이페이지 + 내 기록 link + 꾸미기 | code | S3a | game.js, page.html, src/tests/shop.js, src/tests/trophies.js, src/tests/cloud.js (L363) | ~250 + 80 |
| S4 looks online | code | S3b | game.js, src/tests/shop-net.js (new), tools/run-all.js | ~80 + 300 |
| S5 cloud v2 | code | S4 | game.js (cloud section), firebase/firestore.rules, tools/check-shop.js, src/tests/cloud.js, FIREBASE-SETUP.md | ~250 + 100 + 250 |

### A1 — anchors and UI icons (art track)

- **Do:** `tools/anchors.js` prints the draft table (6.1); `PG.ANCHORS` for all six animals and every anchored frame
  (idle, walk, jump, fall, shoot and the move pose); `PG.ITEM_PIVOT` / `PG.ITEM_SIZE` (empty items for now); the `coin`
  (2 frames), `shop`, `lock` and `slot_h|f|n|b|e` icons (§10); in `check-sprites.js`: their sizes / frame counts, `coin`
  has no `Y`, the palette is still ≤ 64, and the anchor contact sheet of 16.5 (magenta test set, flipped, squashed,
  penguin slide, capy slam, cat flip, the 6 portraits at 2x).
- **Accept:** `node tools/check-sprites.js` prints its OK line; the contact sheet, looked at: every test hat sits on
  every head in every anchored frame and mirror, glasses on the eye(s), scarf at the throat, cape / tube behind and
  around, nothing below the feet line, ≤ 4 px sideways, a hat ≤ 6 px above idle 0; the capy's yuzu box is right.
  run-all `check-sprites sprites` green (game.js ignores the new data until S2).

### A2 — the 40 items and the 6 effect icons (art track)

- **Do:** every `it_*` (§4) with its pivot and size, the `ic_e1..6` icons, following the art notes (no new palette keys;
  `hc` smooth and without red; `b6` pointed, without a shine dot). Contact-sheet rows: every item alone on dark and on each
  of the 5 themes, and every item on every animal's idle 0.
- **Accept:** `check-sprites` OK (6.3 limits, a `k` outline pixel on each side, pivot inside the bounds); the sheets
  looked at, especially the 4-player readability of hats against the slot ring.

### S1 — store v2 and the economy

- **Do:** the constants (2) with the full `ITEMS` catalog (names, desc, prices, leagues) and `SHOP_TEXT`; the store v2
  (5); the economy (3) and every hook (3.3 incl. `coinShot` in `fire`, `endBattle`, `troHostGo` / `troGuestGo`,
  `guestHostIn`, `guestBegin`, `nextRound`, the run starts and clears); the card coin rows (9.7), the podium coin line
  and sr text (9.8), the two room rules lines (9.6), the "+6" word pop (9.9); `PG.debug.shop` economy parts (`state`,
  `give`, `set`, `battle`, `clear`, `end`, `allowBc`); `tools/check-shop.js` catalog checks (its rules check is skipped
  until the `GENERATED` block exists, S5); `src/tests/shop.js` groups 1-5; run-all jobs `shop`, `check-shop`.
- **Accept:** run-all `shop check-shop trophies trophies-net cloud check-cloud final-e2e mp-local kits` green; a v1 store
  with a cloud link record and holds migrates losslessly (shop group 5) and the cloud still links / pushes on CL_V 1;
  screenshots of the 목욕 끝 card with both rows at 1x and 320×568 (`scrollHeight ≤ clientHeight`, 최고 점수 steps
  aside), the ending card, and my podium block's coin swap.
- **Not releasable alone** (the card says "상점에서 써요!" and there is no shop yet).

### S2 — items in play

- **Do:** 6.1-6.8 in game.js: `anchorsOf`, `itemFrame`, `lookFrame`, `drawEnt`'s `o.look` in the joint order (after
  `o.twin`), `drawPlayer` / `drawAfterimages`, `makePlayer`'s `look` and every list that carries it (6.5; `r.lk` is
  empty until S4), `lookLift` and the real `headTop(p)` with every mark of 6.6 moved onto it (stun stars, slam lines,
  podium crown, flying cups; tags and pointers already call it), `lookPortrait` + `portraitCanvas(c, name, size, lk, tw)`
  for the title picker, `lookFx` and the `'heart'` kfx, `PG.debug.shop` render parts (`bare`, `anchors`, `frame`,
  `lift`, `look`); shop groups 7-8; a play screenshot job (`shop-play-*`).
- **Accept:** run-all `shop kits kits-scenes sprites check-sprites mp-local v3-sprites final-e2e distinction` green;
  bare players are pixel-identical (the kits / sprites scenes do not change); the 4-player battle shot with four hats
  (tags lifted, slot rings continuous around hats, twins' bodies recoloured but hats not) next to its `bare(true)` twin;
  the fv3 soak frame time within 5 % with 4 hat-wearing players.

### S3a — the hub and the 상점

- **Do:** the title's 상점 button, `syncShopBtn`, the NEW dot and nudge (9.1); `#pg-hub` with its tabs and the 상점 tab
  (9.2, 9.3) incl. the preview, the slot tabs, the grid, the armed buy, the slot verbs; `shopBuy` / `lookSet` / `lookOut`
  (title branch; the room branch waits for S4); keys and focus (9.10); the 4 sfx (11) and `audio-node-test`; the font
  warm-up (12); shop groups 6, 9 (상점 parts) and 10; the `shop-title-*` and `shop-hub-*` screenshot jobs.
- **Accept:** run-all `shop audio-node trophies final-e2e pwa cloud-title v3-title ux-roomrow` green; the title card has
  no wrap and no scroll at 1x, 2x, 320×568, 360×740, 390×844, 844×390, artifact and deploy (with its install line);
  the 상점 tab shows whole (no vertical scroll) at 320×568, 390×844 and desktop, and never overflows sideways; Z / X /
  Enter / the touch pads never start a game behind it.

### S3b — 마이페이지, the 내 기록 link and the room's 꾸미기

- **Do:** the 마이페이지 tab (9.4); the badge opens it (aria "· 마이페이지 열기"); `openRec(from)` / `closeRec` back to
  the hub (9.5); the room's 꾸미기 button, the player cards with looks (and twins), the hub opened from the room (9.6);
  `src/tests/trophies.js` L286-299 and `src/tests/cloud.js` L363 updated to the new badge; shop group 9 completed.
- **Accept:** run-all `shop trophies cloud check-cloud ux-roomrow room-platform v3-room4 cloud-rec` green; the
  `cloud-rec-*` shots unchanged (내 기록 itself did not move); the 마이페이지 shots (starter note, full inventory, empty
  slot) at 320×568 and 390×844 without vertical scroll.

### S4 — looks online

- **Do:** section 7: `hi.lk`, the room-phase `'eq'`, `roomInfo` / `guestRoom` index 5 and the game-phase "keep the
  room's look", `netStart` / `guestBegin` looks, `lookOut`'s room branch; `src/tests/shop-net.js`; run-all `shop-net`.
- **Accept:** run-all `shop-net mp-net net-bc trophies-net kits-net room-platform peer-deploy` green; `snapMax` and
  `snapTrim` in the `mp-net` / `kits-net` logs equal to the run before S4 (looks add nothing to snapshots).
- **Release gate (artifact):** the artifact may ship after S4 (it has no cloud).

### S5 — cloud v2

- **Do:** section 8 in game.js (`CL_V` 2, the `sp` fields, `clAgg`'s `bd` sanity, the `eq` push, texts),
  `firebase/firestore.rules` (8.4; the `GENERATED` block written by `node tools/check-shop.js --write`), the JS port of
  the new rules in `FakeFirebase`, `src/tests/cloud.js` (16.3; `PITCH` / `SWAP`), FIREBASE-SETUP.md (re-publish, the
  honest-limit line, "refresh every device once").
- **Accept:** run-all `cloud check-cloud check-shop cloud-rec cloud-title pwa` green; the 내 기록 fit frames of cloud
  §17 fix 10 with the longer pitch line (fallback text in 8.5 if it does not fit); then, by hand, every case of 8.4's
  list in the emulator or the Rules Playground.
- **Release gate (deploy):** publish the new rules **first** (they still accept v1 pages), then deploy the page. A v2
  page against the old rules is refused (`permission-denied` → the 'setup' line). The deploy build does not ship coins
  without S5: before S5, coins earned while signed in would be lost at sign-out (the parked store comes back).

---

## 20. Review changes (final pass, 2026-10-16)

What the cross-review against the code and `design/distinction.md` changed in this doc:

1. **One drawing order for twin colours, items and rings** (top of the doc, 6.2): frame → twin recolour → items → tint →
   ink ring of the final frame. Items with body palette keys (the 바가지 모자 uses the duck's `Y y L`) would otherwise turn
   pink on a pink twin.
2. **`headTop(p)` defined and applied to every head mark** (6.6): stun stars, slam speed lines, podium crown, flying
   cups, tags, pointers. distinction D3 adds the stub and D4 points the tags at it; S2 makes it real.
3. **Looks are frozen at match start and ride only in room-phase R** (7). The worst snapshots already sit at
   3,390-3,399 bytes; the old design's +44 bytes per snapshot would have come out of the trim levels. The `-1` count
   placeholder is gone, and `'eq'` is room-phase only.
4. **The hub is one full-stage panel `#pg-hub` [상점 · 마이페이지]** (9.2-9.4) instead of three em-sized cards in the
   256x224 screen. 내 기록 is untouched (it is at its fit limit, cloud §17 fix 10) and is one button away in 마이페이지.
   That drops the tab strip in `#pg-rec`, the 1x height maths for the shop, and the trophies / cloud fit churn.
5. **Korean copy:** slot-specific verbs (모자를 "입다" is wrong: 쓰기/벗기, 하기/빼기, 켜기/끄기); "오늘 첫 판 보너스
   +25이" (wrong particle after a number) → "오늘 첫 판 하면 코인 +25!"; "오늘은 절반" → "오늘은 반만 모여요"; "[coin]
   160 사기" → "사기 [coin]160"; e5's line says when it fires ("크게 점수를 내면"); the cloud pitch is "트로피·꾸미기가".
6. **Cloud field `cs` → `sp`** in slots and in the link record (`S.cs.c.cs` would have been a trap); the rules split
   `slotShape` into `slotCore` + key lists (the old text called a `slotCore` that did not exist), add `eqOk` to `allow
   update`, and list more emulator cases (incl. the 1,000-expression limit).
7. **A wrong clock can no longer block the day bonus for the whole account** (3.4, 8.1): a `bd` later than tomorrow is
   forgotten locally and skipped in `clAgg`.
8. **Anti-farming table completed** (3.5): solo / co-op retry loops, 한 판 더 spam, leaving early, two browsers on one
   device, clock flipping; the same item bought twice offline (13).
9. **Shots hook named precisely** (`fire(p)`, not a `shootSfx` path): the host's `hostShot` also calls `fire`, so only my
   own animal may count.
10. **Art notes:** the 황금 대야 has no red (gold + red is the podium crown's scheme); the bubble wings are pointed with no
    shine dot (a round shiny shape reads as a free bubble in battle); e6's dots start at the heel, beside the ground
    marker.
11. **Tests:** store hygiene for every new test; the twin + hat pixel test; exact pins to update (trophies.js L286-299,
    cloud.js L33 / L363 / L565); snapshot bytes must not change in S4.
12. **Implementation passes** (19) with release gates: the artifact after S4, the deploy after S5 with the rules
    published first.

---

## 21. As built

### As built (pass A1, art track, 2026-10-17)

- **`PG.ANCHORS`** in `src/sprites.js` (after the item art, right before `PG.PALETTE = PALETTE`), the 6.1 format exactly
  (`face`, `base`, `off`, `hide`, `port`) plus **`porthide`** (capy, cat). Every anchored frame has an entry (idle 2,
  walk 4, jump, fall, shoot, the move pose; the frog has none). All frame offsets of the 6.1 draft matched the art (the
  tool's head matching agrees). Changed from the draft after the contact sheet:
  - **B** (it was inside the body: a cape or a backpack was fully hidden behind the duck's tail and the capy's loaf):
    duck (4, 8) → (3, 6), capy (5, 7) → (4, 6), penguin (4, 8) → (4, 7), cat (4, 9) → (3, 7), frog (3, 9) → (3, 8).
    B is now "the back of the neck"; 등 items reach back and up from it and show behind the body.
  - cat **W** (8, 12) → (8, 11) (the tube clears the legs); frog **E** (10, 5) → (9, 5) (the two lenses land on the
    whites + pupils, cols 6-7 / 11-12, instead of half on the skin).
  - **The cat gets a hide box** `[4, 0, 15, 3]` (its ears; the flip carries its own `[3, 0, 14, 3]`): every hat covers
    the head top at H.y 4, and the ear tips poking out round a 10-wide hat looked broken.
  - penguin **walk 0 / 2** (the lean frames shift rows 0-7 only) are full arrays that keep B at x 4: with `[±1, 0]` a
    wing went 5 px behind the flipper (6.3).
  - **port**: duck E (19, 10) → (18, 10); capy E (21, 13) → (18, 12) + porthide `[9, 0, 16, 6]` (the yuzu); otter E
    (19, 13) → (20, 12); penguin E (20, 14) → (19, 14); cat E (16, 15) → (15, 17) + porthide `[4, 0, 27, 6]` (the ear
    tips); frog H (15, 9) → (15, 4) (on the eye bulges, not over the eyes) and E (15, 9) → (15, 7).
- **Conventions S2 must copy** (implemented in `tools/anchors.js` as `anchorsOf`, `composeLook`, `composePortrait`,
  `liftOf`: plain functions over pixel rows, a reference for `lookFrame` / `lookPortrait`): an item's pivot pixel lands
  **on** the anchor pixel (`LOOK_X + P[0] - px`); in a portrait the pivot pixel becomes a 2x2 block whose **top-left**
  corner is the anchor, and `dy = min(8, needed)` with needed = how far the topmost item row would rise above row 0; a
  full off-array without its own 4 hide numbers uses the base hide box **unmoved**; `-1, -1` = no point. Profile E is
  the left pixel of the near eye, front E the eyes' midpoint (the bridge).
- **`PG.ITEM_SIZE`** is keyed by **sprite name** (`it_h1`, `ic_e1`, `slot_h`, `coin`, `shop`, `lock` → `[w, h]`), and
  every frame of a sprite has that size, so `bakeSprites`' OPT_SPR size filter works unchanged. **`PG.ITEM_PIVOT`** is
  keyed by **item id** (`h1` → `[px, py]`), one pivot for every frame of the item (the face items' two frames share a
  9-wide box, the tubes' two frames a 14x5 box); the tools also accept `[[px, py], ...]` per frame. The 효과 ids have
  no entry (no worn art). Both are built from the art at load, so they cannot drift from it.
- **UI icons** (§10): `coin` 2 frames (a pink P / p disc, q rim, a c / w bubble glint; frame 1 moves the rim's shine;
  no Y anywhere), `shop` (a pink basket: q handle, folded w / W towel, P p q weave), `lock`, `slot_h|f|n|b|e` (W a E k;
  the glasses got two `a` temple strokes so they do not read as two dots).
- **`tools/anchors.js`** (new): prints the draft table by 6.1's rules (E counts the pupil `k` pixels) next to the hand
  values and lists where they differ (after this pass only the intended ones: cat / frog H.y one row up so the brim
  sits 2 px above the pupils like on the others, the slam's lifted hat, the dash / slide N, the flip's H / E); writes
  the contact sheet `C:/Temp/bogeul/shop-art.html` (`?s=anchors|items|on|idle|port|play|ui`, `&c=`, `&it=`, `&z=`;
  `&ov=` tries other anchors, `&x=1` loads `C:/Temp/bogeul/shop-scratch.js` for art try-outs). 16.5 is `?s=anchors`:
  the magenta test set (10x6 hat, 5x3 / 9x3 glasses, 8x3 scarf, 6x8 cape at the right-middle default pivot; then the
  14x5 tube) on every animal x anchored frame and its mirror, the bare points (and hide boxes), the six portraits at
  2x, the slide 3 px low / slam / flip / dash / glide on a floor, every idle 0 squashed ±0.32 about the feet, 1x / 2x
  strips on dark and the five themes.
- **`tools/check-sprites.js`**: requires `./anchors.js` (the same composite) and adds, beyond §10's list: the UI icon
  sizes / counts; `coin` has no Y / y and is pink with ink; `PG.ITEM_SIZE` equals the art for every shop sprite;
  `ANCHORS` names exactly the six animals, `face` is p / f, `base` 10 integers, an `off` entry per frame of every
  anchored sprite (and no other names), each `[dx, dy]` / 10 / 14 integers, every point on the 16x16 frame and **on the
  animal** (B within 1 px: it sits at the back edge), B / W hidden only in the curled poses, hide / port / porthide boxes
  on their canvases. The OK line now ends `…, twin keys for 6 animals, shop: 34 items + 14 icons, anchors for 6 animals
  (hat lift <= 3)` (run-all's `^OK: \d+ required sprites` still matches); it also writes `shop-art.html`.
- Looked at: `C:/Temp/bogeul/a1-anchors-{duck,capy,otter,penguin,cat,frog}.png` and `a1-anchors-all.png` (every test
  hat on every head in every frame and mirror, glasses on the eye(s), scarf at the throat, cape behind and tube around,
  nothing below the feet, the capy's yuzu and the cat's ears cleared under the hat), `a1-ui.png`.

### As built (pass A2, art track, 2026-10-17)

- **34 `it_*` + 6 `ic_e*`** in `src/sprites.js` (one `IT` table: `IT.h1 = [[px, py], frame, ...]`), each with its own
  1 px ink (f1 / f6: a q / M rim, as their art notes have no ink; check-sprites accepts that key on their edges), facing
  right, only existing palette keys (still 57 of 64). Sizes (pivot): h1 10x6 (5,5), h2 10x5 (5,4), h3 10x5 (5,3),
  h4 8x6 (4,5), h5 10x6 (6,4), h6 10x7 (5,6), h7 12x7 (6,6), h8 10x6 (5,5), h9 10x7 (5,6), ha 10x7 (5,6), hb 10x6 (5,5),
  hc 12x7 (6,6); f1 9x4 (4,0), f3 9x5 (4,0), f2 f4 f5 f6 f7 9x3 (4,1); n1 5x3 (2,0), n2 n3 n5 8x4 (4,0), n4 7x3 (3,0),
  n6 8x3 (4,0), n7 6x4 (2,0), n8 10x3 (5,0); b1 6x8 (5,3), b2 b3 14x5 (7,2), b4 7x8 (6,4), b5 8x7 (7,3), b6 8x8 (7,4),
  b7 7x10 (6,3). Every hat rises at most 4 px above the frame top in idle 0 (`lookLift` ≤ 3).
- **Deviations from the §4 art notes**, each for a reason seen on the sheet:
  - **No crown look:** h1 / h8 are two **round** buns on the top corners; h8 has gold spirals and a stitched gold rim
    line (`y E y E…`) instead of a solid gold band (a gold band under two bumps read as a crown). **h6** is 10x7 (note:
    8x7): the fingers splay every way and the glove's cuff is pink (`P w`, beside the note's `R r w k`); an even row of
    fingers read as a red crown in every variant tried.
  - h7 uses ice white `i` for the foam (note: `w W c a k`), `w` only as 1 px glints; every hat's top silhouette edge is
    ink (checked), so nothing white touches the tag pointer's place. h9 is 10x7 (note 10x8): one spring row less, so the
    hat shows whole on every portrait (dy ≤ 8). ha's crack is a zigzag of `F` across a smooth shell (a jagged lower edge
    read as a fringe).
  - f1: 3x3 hearts in q with a P centre; f3: the 3x3 star under the near eye (front: under the right-hand eye; on the
    yellow duck only its ink corners stand out, accepted); f7: the chain is a 2 px gold drop along the ring's back so
    the profile stays 5x3; f2's strap sits between two ink rows (5 px wide with ink on each side).
  - n4 is 7x3 (note 5x3): a 5-wide bow tie cannot carry ink on both sides. n7 keeps the note's red ribbon + gold disc
    (on the chest, not a crown shape). n8: three plus-shaped flowers (p, Y, v) with `M` leaves.
  - b1: vertical P / p stripes under a white collar hem; b6: a cyan wing sweeping up and a violet one back, both
    pointed, no 2x2 white (checked); b7's pivot is (6, 3) so the 10-row cape never reaches below the feet (frog idle 1,
    otter dash). b2 / b3: frame 0 = the far arc (mostly hidden behind the body), frame 1 = the near band in front; b3's
    duck head sticks up at the band's front-right. On most animals the 14-wide tube reads as a puffy ring round the
    lower body rather than a wide float (the bodies are 13-16 px wide; 6.3 allows only 2 px beyond).
  - ic_e1 two steam wisps, ic_e2 a droplet, ic_e3 pink sparkles, ic_e4 a bubble and a small one, ic_e5 a heart, ic_e6
    **two staggered footprints** striped R O Y | t b v (one footprint read as a cup).
- **check-sprites (6.3, §10)** places every item on every animal x anchored frame exactly as `lookFrame` will: hats
  inside the 24x24 composite and ≤ 6 px above in idle 0, face items on the head's row span ±1, neck items within the
  body's columns ±1, back items ≤ 4 px behind the body (never in front), tubes ≤ 2 px beyond each side, nothing below
  the feet; every 머리 / 얼굴 / 목 item on every portrait (the whole hat shows: dy ≤ 8; inside 32 columns); per-slot art
  limits on the opaque box (a face box may include its pivot row), an ink (or rim) pixel on each side, pivots inside
  the box, `TUBES` = b2 b3; hc has no red, b6 no 2x2 white, hats' top edge ink. **18 provoked failures** (yellow coin,
  missing ink edge, 13-wide hat, missing / outside pivot, missing animal / pose / frame entry, face off the head, a cape
  below the feet, a wing shine, a red basin, a white hat top, a too-wide scarf / tube, a cropped portrait hat, a wrong
  size table, an anchor off the body) were each caught on a scratch copy with a named message.
- **For S2 / S3a:** `atW` is the catalog's `at === 'W'` (b2, b3); the 상점 cell should centre an item on its **opaque**
  box (face boxes carry an empty pivot row; f1 / f3 sit below their pivot). Known compromise: on the frog's portrait the
  f1 hearts land on the eye bulges (its cheeks are far below its eyes there; one E serves glasses and blush alike).
- Accept: `node build.js` OK; `node tools/check-sprites.js` OK; run-all `check-sprites sprites v3-sprites
  check-integration` 8/8 and `smoke kits-scenes final-e2e` 19/19 green (game.js does not read the new data yet).
  Looked at (`C:/Temp/bogeul/`): `a2-items.png` (each item alone, 1x-3x on dark and the 5 themes), `a2-idle-all.png`
  (every item on every idle 0, 5x + 1x / 2x grids), `a2-on-all.png` (every item on every anchored frame of every animal
  + mirrored + portrait), `a2-portraits.png`, `a2-play.png` (four players per theme wearing full sets: the slot ring
  wraps body + hat in one band, the pointer clears the hat, twins' bodies recolour and their items do not).

### As built (pass S1, code track, 2026-10-18)

- **Constants** (2, 12) in the top block after `CLOUD_TEXT`; `ITEMS` in display order "by slot, then by price", so
  `f3` (70) comes before `f2` (80) and `e2` (80) before `e1` (90). **e4's line is "걸으면 비누방울이 퐁퐁 솟아요"**, not the
  table's: the table's doubled bubbling word begins with the retired v1 title's two syllables, which must appear nowhere
  in the page (`final-e2e2` checks the built page) - a comment next to the entry says so.
- **The store v2** exactly as 5.2 (`troFresh`, `troParse`: v 1 read as v 2 with no coins, `v > 2` 'newer'); `isItemId`
  also requires an own key of `ITEM`; `myLook()` re-parses `S.eq` (`lookOwned(lookParse(...))`).
- **The economy** in the new section after the trophies (`CO`, `coinGive` ... `lookOut`), as 3.2-3.4 with these
  details: `CO` also holds `goId` / `tl` / `gi` (the guest's game id at its first 'p' snapshot, the last 'p'
  snapshot's clock, the last co-op 탕 index seen), `cardT` and `allowBc`; a run carries `bonus` / `half` / `first`
  (what the card's small text needs) and no `rv` (revives are read from the player at the card); `coinGive`'s `give`
  never goes below 0. **The guest's hooks:** every accepted co-op snapshot runs `coinGuestIdx(loop * N + round)` (the
  first one of a game only sets the start; each index passed pays once, with the "+6" pop); a battle's first 'p'
  snapshot of a game id is its "시작!" (`coinGo`: players at 시작!, shots reset) and each 'p' keeps `CO.tl`; the first 'd'
  snapshot builds the finishers from `g.pd` and the rows (score, kos, koed) and pays once per game id
  (`coinBattleNow`). A guest's ending card pays the last 탕 + 50 in `coinCard` (its round index never moves past 23).
  **Practice** for coins is `coinPrac()` (q != 0, except bc tabs when a test called `shop.allowBc(true)`).
- **The podium** (9.8): `coinT1() = max(75, flipAt + 20 (0 under reduced motion)) + 40`; `coinPodTick` sounds `coin`
  at the first swap; the sr line from `coinPodSr`.
- **The cards** (9.7): `#pg-over` / `#pg-ending` rows, `.pg-hi-row`, `.has-2rows` under `@container (max-height:
  22em)`; the small text: first coins "상점에서 써요!", else the day bonus "첫 판 +N", else halved, else the balance.
- **Rooms** (9.6): `coinRule(q)` appended to the rules lines.
- `tools/check-shop.js` (catalog, art, anchors, texts; the rules block is skipped until S5) and `src/tests/shop.js`
  groups 1-5, 6c (the card rows, their fit at 1x / 2x / 320 px, the podium coin line and sr text) and 10;
  `trophies.js` reads `v: 2`; run-all jobs `shop`, `check-shop`, `shop-over-1x`, `shop-over-320`, `shop-ending`,
  `shop-podium`.
- **trophies-net** (the job the cut-off attempt was re-running): its last log ended with `run-chrome: the DevTools
  connection closed (1006)` right after the "leave" checks - Chrome went away mid-run (the session that ran it was cut
  off at that moment), not a failed check. Re-run alone and inside the S1 set: 68/0 every time (87 s).
- Accept: run-all `shop check-shop trophies trophies-net cloud check-cloud final-e2e mp-local kits` green (51/51);
  shots looked at: `shop-over-1x.png` (1x: both rows, 최고 점수 stepped aside, no scroll), `shop-over-320.png`,
  `shop-ending.png`, `shop-podium.png` (my block's "+38" coin line).

### As built (pass S2, code track, 2026-10-18)

- **Where:** right after `frameOf` (the sprite section): `LOOK_W/H/X/Y`, `LOOK` (`bare`), `anchorsOf`, `itemFrame`,
  `opaqueTop`, `lookFrame`, `lookReach` / `lookLift`, `lookPortrait`; `lookFx` after `drawAfterimages`; `headTop` (top
  constants) is `p.y - lookLift(p.char, p.look)`.
- **`anchorsOf(name, fi)`** is tools/anchors.js's, indexed by the frame `frameOf` draws, cached per (name, frame); it
  validates the data (integers, the 10 / 14-number arrays) and returns null for a stand-in frame (`bakeSprites` marks
  `fallbackFrame` stand-ins `fb`) - never a guessed position.
- **`itemFrame(id, part)`** has no `face` argument (the part already picks profile / front).
- **`lookFrame`'s cache** is its own WeakMap (frame object -> worn set -> composite), keyed by the **whole 5-character
  set** (it is frozen per player, so no string is built per frame; the effect digit only makes a second key), and a
  frame that wears nothing (no anchors, nothing in 머리-등) caches itself; emptied past 24 sets. The hide box is cleared
  only when the hat's art exists.
- **`lookReach(c, lk)`** (new, beside `lookLift = max(0, reach - 1)`): px above the frame top in idle 0, cached per
  animal and set (Maps, no string per call). **The podium crown** sits at `p.y - 7 - max(0, reach + 1)` instead of
  `headTop(p) - 7`: the crown art's outline reaches its row 6, so `headTop - 7` put its bottom row on the hat's top row;
  this keeps the bare head's 1 px gap over a hat (and is exactly `p.y - 7` bare). Tags, pointers, the slam lines
  (`headTop - 7 / - 9`), the stun stars (`headTop + 1`: they circle the hat as they circle a bare head) and the flying
  cups (`headTop - 3`) use `headTop`; `syncTags`' body obstacles start at `headTop`, so a hat counts as body.
- **Lists that carry `look`** (6.5): `makePlayer`; solo `newGame` (slot 0 gets `myLook()` unless the list names one -
  `PG.debug.start` too); `toTitle` / `idleWorld` / `pickChar` (the demo); `rematch` and co-op `retry` (`p.look`);
  `netStart` (mine `myLook()`, a guest's `r.lk`) and `guestBegin` (`r.lk`; both empty until S4); the debug local
  lists take `look` per entry. `lookOut` also runs from `troSync` (another tab's purchase shows on the title at once).
- **Portraits:** `portraitCanvas(c, name, size, lk, tw)` uses `lookPortrait` for `portrait_` with a set; the title's
  picker **and the room's** wear my 머리 / 얼굴 / 목 (`pickArt` redraws them when `myLook()` changed). The room's player
  cards are S3b's.
- **Sprites:** `OPT_SPR` gains `it_*` (얼굴 / tubes 2 frames), `ic_e*`, `slot_*`; `sizeOf` reads `PG.ITEM_SIZE` for them
  (absent: `[0, 0]`, every frame left out), placed after the `icon_` line (`check-integration` pins that line).
- **Effects** (6.7): edges (a landing, a take-off, a score jump) count only across a gap of <= 4 frames (a screen that
  did not draw p - trapped, a ghost - starts over); a particle's velocity is damped x0.94 a frame by `updateFx`, so a
  steady rise of v px/f uses `g = v x 0.06 / 0.94`; particles carry `lf` (the effect digit, for tests) and e6's `fd: 24`
  (the particle loops fade over `q.fd || 8` frames - every other particle as before). Spots: e1 a 2 px puff at the
  mirrored H column, `headTop + H.y - 4`; e2 4 droplets from `y + 14` flicked sideways (g 0.12); e3 3 sparkles along
  the feet drifting down 0.25 px/f; e4 a 2 px bubble at `x + 7 - 6 x facing, y + 12`; e5 two hearts at `x + 5` /
  `x + 11` (the second 3 px higher) from `headTop - 2`; e6 as specified. The podium uses the 200 cap.
- **`PG.debug.shop`** render parts: `bare`, `anchors`, `frame` (data URL), `pixels`, `item`, `portrait`, `lift`,
  `reach`, `headTop(slot)`, `dress(slot, lk)` (tests: a player's set), `state().lift / bare`.
- **Tests** (`src/tests/shop.js`, 137/0 now): group 7 - 900 composites (6 animals x every anchored frame x 12 sets
  wearing all 34 items, + twins) equal a reference rebuilt in the test from pixels; nothing leaves the 24x24 box; the
  anchors on the art and moving with each frame's head fill row; hats <= 6 px; `lookLift` per hat x animal; the curled
  poses; the yuzu / ears cleared under every hat; no items on die / trapped / ghost / life; the real drawing path
  (exact spot and mirror for all six animals, squash +-0.32, the penguin slide 3 px low); `headTop`, the pointer never
  over a hat (every hat x animal, idle 0 / 1) and drawn 1 px above one, the stun stars, the podium crown's 1 px gap;
  a twin's yellow hat on its pink body inside one slot ring (slot colour 1 px above the hat, `SLOT_INK` 2 px);
  `bare(true)` = the same battle wearing nothing; my set on the demo, the pickers, solo, frozen mid-game, 한 판 더.
  Group 8 - e1-e6 one by one (the heel, the rainbow order, the steady rises), reduced motion (no particle, no heart,
  the items drawn), and the budget (every push onto `G.parts` watched: 4 players with e6 / e4 over a full screen for
  600 f - no effect particle at >= 200). `?perf=1` and the shots `#shot=play[&bare=1]`, `podhat`, `sheet&part=0|1`
  (`&zoom=` / `&zoomp=slots` blow a region up). run-all: `shop-play-900`, `shop-play-bare-900`, `shop-play-390`,
  `shop-podhat`, `shop-sheet-0`, `shop-sheet-1`.
- **Frame cost** (`test-shop.html?perf=1`, real time, update + render of a 4-player battle, best of 5 x 600 f, the
  order rotating over 6 rounds; three runs): bare 0.215-0.225 ms, four hats -1.9 .. +3.1 %, four full sets with
  effects -0.4 .. +2.3 % - inside the 5 %. (The fv3 soak is online; looks only go online in S4, so the comparison is
  bare vs worn on one build. Bare costs what D3 / D4 measured: 0.219-0.231 ms.)
- Accept: `node build.js` OK (the artifact: no Firebase string, no service worker, no external script); run-all
  `shop kits kits-scenes sprites check-sprites mp-local v3-sprites final-e2e distinction` green (with the S1 set and check-integration: 68/68),
  plus `check-shop`, `check-integration`, `final-e2e2`, `mp-net`, `net-bc`, `room-platform`, `ux-roomrow`, `v3-room4`,
  `v3-title`, `trophies-net`, `distinction-net`. Bare players are pixel-identical: distinction's solo baseline holds and
  the kits / sprites scenes did not change. Looked at: `shop-play-900.png` next to `shop-play-bare-900.png` (tags
  lifted over the hats, each slot ring one band round body + hat, 2P's pink body under its yellow 바가지),
  `shop-play-zoom-12.png` / `shop-play-zoom-4.png` (the zooms), `shop-play-390.png`, `shop-podhat.png` (crowns above
  the hats), `shop-sheet-0.png` / `shop-sheet-1.png` (every animal x pose x set + mirror + portraits: hats on heads,
  capes and tubes behind / around, nothing on the curled poses' backs).

### As built (pass S3a, code track, 2026-10-18)

- **Where:** the hub is its own block at the end of the shop section (`HUB`, `syncShopBtn`, `shopBtnFit`, `itemPic` /
  `paintItem` / `paintSlot`, `openHub` / `closeHub` / `hubShow` / `hubSlot`, `shopBtnState` / `hubAct` / `hubCell`,
  `hubGrid`, `hubFill`, `hubTick` / `hubDraw`, `hubArrow`, `hubSetupDOM`); `OVERLAYS` + `'hub'`, `showOverlay` (the
  panel-open class, scrollTop 0, `syncShopBtn` on the title, `hubShut` when leaving it), `onKeyDown`, `primaryAction`,
  `troSync` (`syncShopBtn`, `hubFill`), `loop` (`hubTick` while the hub shows).
- **The title button** (9.1) as specified, plus: its icon has `margin: -0.1em 0` (1.2em tall in a 1em line: the row
  keeps its height); `.pg-title-card .pg-row { min-width: max-content }` lets the card grow to the row where the screen
  has room. **The label rule:** 30em as specified, but a touch screen shows the label from 26.5em - the spec's "a 390
  px phone" is 26.8em in the artifact (12.5 px floor) and 28.9em in the deploy, so the 30em rule alone would hide it on
  every phone. A safety net, `shopBtnFit()` (on the title, `fit()`, the fonts' `loadingdone`), measures the row from
  layout widths (`offsetWidth` + gaps, not `scrollWidth`: the dot's hop is a scale transform that reads as overflow
  mid-hop) and turns the button icon-only (`.is-tight`) when the labelled row does not fit - a fallback font while the
  web font loads made a 390 px row 2 px too wide. The NEW dot / nudge / aria-label exactly as 9.1.
- **The hub** (9.2, 9.3), deviations: the coin chip is `role="img"` (its aria-label is read); **the message line shares
  the 닫기 row** (`.pg-hub-foot`, the message left of 닫기) instead of a line of its own - a message never moves anything
  and the 320x568 budget keeps its 20 px; the chip wraps under the tabs when a 5-digit balance meets the narrowest
  panels (a 1x window). Switching the 상점's slot tab (not specified) selects that slot's cheapest affordable unowned
  item, else its first. The action button's states and labels as the table, with aria-labels "사기 · 160코인" /
  "160코인 · 32개 모자라요"; disabled states are `aria-disabled` (the focus stays). A purchase another tab of this
  browser beat says "이미 가지고 있어요" (added to `SHOP_TEXT`) or "{n}개 모자라요".
- **Cells:** the item's art cropped to its opaque box and centred at 2x in a 32x32 canvas (얼굴: the front frame; tubes:
  both halves, as worn; effects: `ic_e*` at 4x); the owned check (`ready`) and the lock as 8x8 sprites at 2x on the
  cell's corners; selected = white inside the rarity border, worn = a duck ring outside it, locked = the art at 40 %;
  전설 = a 2-step CSS border shimmer (none under reduced motion). Cells are kept per id and updated in place, so a
  refill (a purchase, another tab) never drops the focus; roving tabindex.
- **The preview** (32x32 at 96 px): `hubTick` runs `lookFx` itself on a stand-in player with `G.parts`, `G.kfx` and
  `G.frame` swapped for the preview's own in one synchronous call (one effect implementation; the world's lists are
  never touched - tested), particles <= 20; walk effects walk in place while the floor slides back (the trail is left
  behind); e2 / e3 hop every 2 s (v0 -2.2, g 0.3: the landing is faster than e2's 1.5); e5 a 500-point jump every 2 s;
  e1 stands. A purchase adds five sparkles (kfx crosses). Drawn every 4th frame, and at once on a new view.
- **Sounds** (11): `coin` (also when the chip's 0.4 s count-down lands), `arm`, `buy`, `equip` in `src/audio.js`;
  `tools/audio-node-test.js` group W (each its own recipe, short, no louder than the loudest effect, arm < buy).
- **Keys** (9.10): the hub branch of `onKeyDown` (Escape closes, M mutes, arrows in the tablists - automatic
  activation - and grids: the 상점's selection follows the focus, 마이페이지's grid moves the focus only; no game key
  acts); `primaryAction` returns first while the hub shows. Focus on open (mouse / keyboard): the selected cell.
- **Tests:** `src/tests/shop.js` +`hubTests` (button, dot, first visit, opening pick, the armed buy and its 2.6 s
  re-arm, every verb and message, cells, lock, read-only, keys, touch pads), `viewTests` (the preview: tried-on item,
  cycling, all six effects, reduced motion), `hubFitTests` (1x / 2x / desktop; `#hubfit` at a real viewport), group 10
  with every hub string. In virtual time headless Chrome draws few animation frames, so the tests drive the preview with
  `PG.debug.shop.tick(n)`. `tools/pwa-check.js` (the deploy): the start row on one line at every phone / 1x size, a
  320x568 phone added, and the hub's two tabs at 390 / 360 / 844 / 320 / 1x (`hubCheck`, shots `pwa-*-shop.png` /
  `pwa-*-my.png`). run-all: `shop-fit-320|360|390|844` (cdp, real phone viewports), `shop-title-1x|2x|320|390|844`,
  `shop-hub-<state>-<w>` (first, armed, poor, locked, legend, bought, e6, starter, full, empty, my), `shop-hub-1x`.

### As built (pass S3b, code track, 2026-10-18)

- **마이페이지** (9.4) as specified with: **내 기록 sits under the preview** (`.pg-my-side`), not in the info column -
  at 320x568 a full 머리 inventory (13 cells) plus the equipment row only fits that way. It opens on 머리, or on 목
  while the starter note shows (the ribbon one tap away); back from 내 기록 it keeps its slot. Equipment boxes: the
  worn item at 2x (effects: the icon at 3x), bare: the grey slot icon at 3x; aria "머리 · 바가지 모자". The 없음 cell's
  aria-label is the slot's take-off verb. An empty slot shows only its line and 상점 가기 (no grid). A bonus day later
  than tomorrow counts as unpaid in the note (coinGive forgets it, 3.4). The name field: change / blur call
  `netSetNick`; Escape in it closes the hub and keeps the typed name (closeHub commits a focused field).
- **The badge** opens `openHub('my', 'title')`, aria "… · 마이페이지 열기"; **`openRec(from)`**: `'hub'` comes back to
  마이페이지 (focus on 내 기록), no argument as before (the trophy / cloud tests and the cloud's redirect use it).
- **The room** (9.6): 꾸미기 at the end of the 내 캐릭터 heading (`.pg-h3-row`); the player cards' busts wear
  `lkOf(r)` (mine: `myLook()`; a friend's `lookParse(r.lk)` - empty until S4) with the twin colour, and the card key
  includes the look; closing the hub opened from the room returns there (focus on 꾸미기), Escape too; a game start
  (`showOverlay(null)`) closes it.
- **Not done:** the optional 24x24 composite in the friends panel (`#pg-mychar-art` stays the life icon).
- **Tests:** `src/tests/shop.js` `myTests` (badge, equipment, grid, notes, name, 내 기록 there and back) and `roomTests`
  (`?net=bc#room` over http: a lone host, 꾸미기, my card and the room picker in my set, Escape, buying from the room,
  the rules line); `src/tests/trophies.js` (the badge opens 마이페이지, 내 기록 through its button, keys from
  `T.openRec()`), `src/tests/cloud.js` L363 (the aria) and a `my-out` shot (signed out: the note's second line is the
  pitch, asserted). run-all: `shop-room`, `shop-room-390|900`, `cloud-my-out-900|390`.
- **Accept (S3a + S3b):** `node build.js` OK (the artifact: no Firebase string, no service worker, no external script);
  run-all `shop audio-node trophies final-e2e pwa cloud v3-title ux-roomrow room-platform v3-room4` green (70/70: shop
  297/0, trophies 119/0, cloud 212/0, pwa 117/0, audio-node 848/0, check-cloud, cloud-rec-*, cloud-title-*,
  trophies-net, the shop-* fit / shot jobs), plus `cloud-my-out-*` and a wider re-run (`smoke mp-local final-e2e2
  shot-phone ui-kit kits-scenes distinction realinput v3-fixes integration fixes review-title review-touch-play
  monsters shop`, 83/83); `check-integration`, `check-shop`, `check-pages` OK. The `cloud-rec-*` shots did not move
  (내 기록 itself is unchanged). Looked at (`C:/Temp/bogeul/`): `shop-title-1x|2x|320|390|844.png` and
  `pwa-1x|320|360|390|844-title.png` (one start row, icon-only at 1x / 320 / 360, labelled from 390, the deploy's
  install line too), `shop-hub-first|armed-320`, `shop-hub-poor|locked-390`, `shop-hub-legend|bought|full-900`,
  `shop-hub-e6-844` (+ `shop-hub-e6-big.png`, the preview 8x: the rainbow dots left behind), `shop-hub-starter|full-320`,
  `shop-hub-empty-390`, `shop-hub-my-844`, `shop-hub-1x`, `pwa-*-shop|my.png`, `shop-room-390|900.png` (my card and the
  room picker in my set, 꾸미기 beside 내 캐릭터), `cloud-my-out-390|900.png` (the pitch line).

### As built (review fixes after S3, code track, 2026-10-18)

Every finding of the S3 review was checked against the code and was a real problem. The code track fixed all of them
except the three art findings, which belong to `src/sprites.js` (the art track's file; this track never edits it): the
새내기 별 스티커 (f3) and the 황금 외알 안경 (f7) on the yellow duck, the 거품 진주 목걸이 (n6) that reads as teeth, and the
망토 수건 / 목욕 바구니 배낭 (b1 / b4) on the cat. The art track fixed them afterwards (see the next section).

- **쓰기 / 벗기 in the 상점 (high).** `hubLook` tries on only an item I do not own; an owned one shows as I really wear
  it, so 쓰기 / 벗기 change the animal. The action button ignores taps for 0.8 s after a purchase (`HUB_BUY_GUARD`):
  the third tap of the hand that tapped 사기 twice does nothing. The take-off verb is drawn as a ghost button
  (`#pg-shop-buy[data-k="off"]`), and 쓰기 / 벗기 replace the message with "썼어요" / "벗었어요" (the item's verbs, below).
- **Item art (medium).** `paintItem` uses the largest whole scale up to 4 that fits. The 상점 cells draw into a 36x28
  canvas above the price line, while 마이페이지's cells and the equipment boxes stay 32x32. Glasses now show at 4x
  (36 px), the ribbon and the pearls at 4x, 10-wide hats at 3x, 12-wide hats and the tubes at 2x.
- **Prices (medium).** Every 상점 cell shows `[coin]60` under its art: 10 px bold in coin pink, dimmed when the balance
  does not cover it or the league is not reached. An owned cell keeps the line's room empty (the check shows instead),
  so the art sits at one height. The lock moved to the top-right corner, where the check is.
- **The 상점 label (medium).** The label is now measured, not set by a width rule. `shopBtnFit` compares the row with
  the room the card may grow to (its max-width of the overlay, less its padding and border; the row is
  `min-width: max-content`), and tries three steps: `is-label`; then `is-snug` (the start buttons' side padding at
  0.55em, which is what a 360 px phone needs); then `is-tight` (icon only). The label now shows at 2x, on desktop, on
  320 / 360 / 375 / 390 px phones, at 844x390 and on the deploy's 1x title with its install pill. Only the artifact's
  1x title stays icon-only. The NEW dot moved inside the button's width (`right: 0`), so a labelled row can end
  exactly where the card's room ends. `tools/pwa-check.js` no longer requires icon-only at 1x.
- **Preview hint (low).** The preview shows two pixel arrows (◀ ▶, drawn in its canvas) beside the animal until it
  is first tapped in a page load (`HUB.cyc`).
- **Numbers (low).** Prices, shortfalls and aria-labels use `toLocaleString('ko-KR')`. The not-enough state is one
  number: "[coin]1,160개 더 모아요".
- **The first coins' card (low).** When the first coins ever cannot buy anything, the small text is the goal:
  "60개 모으면 첫 아이템!", using the cheapest unowned item in a league already reached. "상점에서 써요!" stays for when
  something can be bought.
- **The 상점 dot (low).** `closeHub` saves `S.cv` only when the 상점 tab showed during that opening (`HUB.sawShop`).
- **Korean (low).** Day 1 of a streak reads "오늘 보너스 받았어요 · 내일 첫 판 +25"; "N일 연속" starts from day 2.
  등 items carry their own verbs (`vb` in the catalog, `verbOf`):
  - capes: 두르기 / 벗기 (둘렀어요 / 벗었어요)
  - tubes: 끼기 / 빼기 (꼈어요 / 뺐어요)
  - wings: 달기 / 떼기 (달았어요 / 뗐어요)
  - the slot's default (the backpack, the shell): 메기 / 벗기 (멨어요 / 벗었어요); 등's 없음 cell reads 벗기
  Every slot gained `offDone`, the taken-off message. The starter's note reads "…리본을 해 봐요", matching the 목
  button's 하기. Every new string is in `SHOP_TEXT`, and `tools/check-shop.js` checks the verbs.
- **Focus and worn (low).** A focused cell gets a white dashed outline 4 px out, never the solid duck ring.
  마이페이지 marks the worn cell exactly as the 상점 does (the duck ring and the check, no white inset); 없음 gets the
  ring when nothing is worn.
- **Battle coins online (high).** See the note in 3.2: an end within `walkF` is full time, and guests pay from the
  host's end clock `g.te`. 16.2 item 7 now compares each guest with the host-side `coinBattle`.
- **Co-op revives (low).** `R.rv0`, see 3.3.
- **A countdown leaver (low).** A guest's `CO.n` is the number of player rows in its first `'p'` snapshot (3.2).
- **Pace (low).** The spec was restated rather than the rates (0, 3.6, 3.7). `paceTests` now models the 45-minute day
  it describes: solo games ending in 탕 5 / 7 / 9 plus 3 battles give 3,134 in two weeks.
- **Blocked storage (low).** Arming 사기 says "이 브라우저에서는 저장되지 않아요" before the purchase. The cards' coin row
  says "저장되지 않아요": the whole line does not fit the 목욕 끝 card next to both rows, and the 320 px phone fit is
  tested.
- **A held Enter (low).** The hub branch of `onKeyDown` swallows a repeated Enter / Space on a button.
- **Pre-S5 cloud (low).** 8.2 was corrected, and the release gate is now enforced in `tools/check-shop.js`.
- **Two tabs racing (low).** This is stated as a limit in 13, as for trophies. A purchase lost to another tab's write
  is noticed at that tab's `storage` event, and the 상점 says "다시 사 주세요" (`hubLost`).
- **Tests.** `src/tests/shop.js` gained `reviewTests`, plus new checks in the existing groups: the third tap, the ghost
  button and the preview, the verbs and messages, the first card's goal, the 2-frame clock, the carousel arrows,
  `SH.pageLoad()` (the once-a-page-load hop and arrows again, for test order), and the label check in `hubFitAt` (an
  icon-only button must be one whose labelled row really would not fit). Hub screenshots looked at:
  `shop-hub-poor-390` (prices, dim / pink, the arrows, "60개 더 모아요"), `shop-hub-first|full-320`,
  `shop-title-320|2x`, `pwa-1x-title` (labelled with the pill), and `s5-title-360` / `s5-hub-bought-360` (360 px: the
  label; 벗기 as a ghost button, the worn ring and check, the bought hat in the preview).

### As built (pass S4, code track, 2026-10-18)

- **What was built (section 7).**
  - The guest's `hi` carries `lk: myLook()`.
  - New `'eq'` message, room phase only (in the game phase the host ignores it).
  - `roomInfo` puts the worn set at index 5 of a room-phase seat that wears something.
  - `guestRoom` reads index 5 with `lookParse`. A 5-long seat is bare. A 4-long (game-phase) seat keeps the room's look,
    as it keeps the count.
  - `netStart` and `guestBegin` already took `r.lk` (S2).
  - The room cards (S3b) now show friends' sets.
- **Deviations.**
  - `lookOut` runs after every store change (`troSync`), so a guest's `'eq'` goes only when its set differs from what
    the host was last told (`CO.eqSent`, set by `hi`). It goes 300 ms after the last change (`lookSend`).
  - A change made during a match, such as another tab's purchase, goes when the guest is back in the room
    (`guestToRoom` calls `lookSend`).
  - A guest's own animal in a match wears the set the host's R had for it, the same one every other screen draws.
- **Debug.**
  - `mp.state().roster[].lk` (the sets as known on that page).
  - `shop.state().eqSent` and `shop.state().looks` (the players' frozen sets).
- **`src/tests/shop-net.js`, run-all job `shop-net`: 41 checks.** It covers every item of 16.2, plus the review's
  countdown leaver and 2회차 revives.
  - The "+2 %" snapshot comparison is replaced by a stronger check: every snapshot the host sends in the game phase is
    watched, and every seat in it stays 4 long, so looks add no byte.
  - The drawing probe renders each player worn and `bare(true)` in the same tick. The start's invulnerability blink is
    paused for those two renders.
- **Accept: run-all `shop-net mp-net net-bc trophies-net kits-net room-platform peer-deploy` all green.**
  - `mp-net` failed once in coop2: "the guest's shot traps an enemy", a real-time aiming step that does not involve
    looks. It passed alone on the rerun, with the same build.
  - Snapshot sizes stayed in the same range as the run before S4, with 0 trims in both. mp-net: coop2 max 1347 →
    1346, coop4 1069 → 1069, battle 867 → 865, soak max 2723 → 2442. kits-net 2: max 1942 → 1832.
- **Release gate:** the artifact may ship (it has no cloud).

### As built (pass S5, code track, 2026-10-18)

- **`game.js`, cloud section (8.1, 8.2): what was built.**
  - `CL_V 2`.
  - Slots, the link record's `c` / `v` / `m`, and `clZero` / `clCnt` carry `ce, sp, o, bd, bs`, clamped like the
    rules (`clItems`: catalog ids that are sold, once each, ≤ 64).
  - The link record gains `ev`.
  - `clDoc` reads v 1 and v 2 (v 3 is 'newer') and returns `v` and `eq`.
  - `clAgg` sums coins, takes the union of items, and takes the latest `bd` not later than tomorrow.
  - `clStep` caps coins (≤ 150 a write, 30 + 1 per 2 s, ≤ 150 for a new slot). It appends one new item a write with
    exactly its price added to `sp`, takes the later `bd`, and writes the v 2 shape.
  - `clDirty` is 'hard' for coins, items or `bd`.
  - The first upload carries the store's coins and items, and the document gets `v: 2` and `eq`.
  - In a v 2 document a fold makes a v 2 archive; in a v 1 document it keeps a v 1 archive.
  - The pitch and swap texts of 8.5 are in.
- **Deviations and details.**
  - **`bd` in `clMine`** is tracked through `c` / `v` like a counter: the view's `bd` when it changed here since the
    last sync (this browser paid the bonus), else my slot's own. With `bd: S.bd` as written in 8.2, a joining browser
    would write a slot just to copy another device's bonus day, which breaks "a browser that only looks makes no slot".
  - **The worn set in `clAdopt`.** A join takes the account's `eq`. A v 1 document has none, so the device's set is
    kept, stripped to the account's items, and counts as in step. Otherwise the account's set is taken when no local
    change is waiting (`S.eq === cs.ev`), and the result is then stripped with `lookOwned`. A set that equals the
    account's is in step.
  - **Pushing the worn set** (`clEqOut`, `clPush`). The set goes with a slot write, or alone the way the nick does, but
    only once the account owns every item in it (the document's slots, or the slot being written). So no device ever
    receives a set it would have to strip.
  - **The v 1 → v 2 upgrade** happens only with a slot write; an `eq`-only write cannot carry `v`. `eqOk` allows an
    `eq`-only write into a v 1 document, which is harmless: old pages ignore the key.
  - **A v 1 link record** migrates with zeros, so all the store's coins are this browser's. The release gate makes
    that exact (8.2 note).
- **`firebase/firestore.rules`.** Section 8.4 as specified, plus two helpers: `slotOk2` (the v 2 slot step) and
  `coinSumOk` (the v 2 archive). `sumOk` takes the document's version.
  - The header comments describe v 2 and the honest coin limits, and say to publish these rules before deploying.
  - The catalog block was written by `node tools/check-shop.js --write`, and check-shop now verifies it.
- **`tools/check-shop.js`.** Adds the release gate (`TRO_V ≥ 2` needs `CL_V ≥ 2`) and the 등 verbs.
- **`src/tests/cloud.js`.**
  - The `FakeFirebase` rules are ported to v 2 function by function, with array equality in `deq`. The catalog
    literals come from the same catalog.
  - New group 2b (`coinPureTests`, 40 checks) takes every case of 8.4's list as allowed or refused. It then runs a
    two-device coin simulation through the pure parts: the upload, a join that writes nothing, two offline purchases
    that go up as one item a write with `sp` exact, the invariant, the same item bought twice, a debt and its payback,
    the coin rate cap, the worn set's rules, the far-future `bd`, the v 1 record, and hostile documents.
  - New group 11b (`coinSyncTests`) runs through the frames: the v 2 upload, a second device with its own store put
    aside, a purchase and coins crossing over, the worn set going up with the purchase and then alone (`eq` only),
    sign-out, a v 1 → v 2 upgrade, and a v 3 document that is never written.
  - The `PITCH` / `SWAP` pins and `doc.v === 2` are updated; the "newer" cases use v 3.
- **`FIREBASE-SETUP.md`.** The intro, rules (6), check (9) and problems (10) sections are updated, the honest-limit
  lines for coins are added to 11, and a new section 12 covers the update: publish the rules first, then the page,
  then refresh every device once.
- **Accept.**
  - run-all `cloud check-cloud check-shop cloud-rec cloud-title pwa` (+ `cloud-my-out`): 19/19 green, cloud 264/0.
  - The 내 기록 fit frames of cloud §17 fix 10 (390x763, 360x756, 412x891) pass with the longer pitch line, so the
    fallback text of 8.5 was not needed.
  - Looked at: `cloud-rec-out-390|900` (the pitch on two lines), `cloud-rec-msg-390` (the swap message on two lines),
    `cloud-my-out-390`.
- **Not done here: the hand check in the emulator or the Rules Playground.** No emulator is installed on this machine,
  and downloading one was not part of this task. The JS port covers every case of the list, but the rules language
  itself still has to be confirmed by hand before the deploy ships with a config: `b.o[0:n]`, list `==`, `toSet()`,
  `map.get`, and the 1,000-expression limit on a purchase into a 16-slot document.
- **Release gate (deploy):** publish the new rules first, then deploy the page.

### As built (final verification, code track, 2026-10-18)

The whole suite after S5, run to green. No `src/` file changed: each failure was a race in a test driver, and the game
did the right thing every time. No product behaviour changed.

- **Suite.**
  - `node tools/run-all.js` (all 206 jobs): two full runs in a row green, 206/206 both times.
  - Three earlier runs each failed one real-time job (fixes 1 and 2 below).
  - `check-pages`: 40/0.
  - The node checks inside run-all:
    - `validate-levels`: ALL OK.
    - `audio-node`: 848/0.
    - `check-sprites`: OK (198 sprites).
    - `check-integration`, `net-node`, `check-shop`: OK.
    - `check-cloud`: 60/0.
    - `pwa`: 117/0.
  - Drivers: SHOP 325/0, SHOPNET 41/0, CLOUD 264/0, MPNET 102/0, TROPHYNET 68/0, KITSNET 54/0, DIST 47/0, DISTNET 19/0,
    RRP 90/0.
- **Fix 1: `shop-net`, phase 2, "... and back on" (failed 1 run in 2).**
  - Cause: the driver waited for page B, then read page A's roster without waiting for it. Each guest's copy of the
    host's R crosses its own simulated link (8 + U(0, 4) ms at the receiving end), so A can be a few ms behind B.
  - Reproduced in a scratch loop of the hat off / on step: A lagged once in 600 checks, and B was never late.
  - Fix: both waits (off and on) now wait for both pages, and a failure prints both rosters and the card match.
- **Fix 2: `mp-net`, coop2, the trap / pop / snack checks (the "aiming step" flake from C5; failed 1 run in 3).**
  - Cause: round 1's enemies kept roaming for about 5 s while the guest stood still for the sync checks. A co-op guest
    decides its own falls against its own view, so an enemy walking onto it turned it into a ghost just before the
    trap step. All four checks after that then failed together.
  - Reproduced 2 times in 40 with a probe that logs each fall of the guest. Both falls happened 0.3 s before the trap
    step, with an active enemy on the guest's spot.
  - Fix: the enemies are parked right after the enemy-sync check, as `coop4` already does. 48/48 runs passed after.
- **Fix 3: `rv-net`, run by hand (not in run-all), "a single far-future tick does not freeze the view for good" (69/1).**
  - Cause: the hostile, hostilehost and room-rogue fuzz still sent game states with `v: 3`. Since the kits raised
    `NET_V` to 4, the version gate dropped every one of them, so the fuzz tested nothing and the far-future check
    could not pass.
  - Fix: they now carry `GV = 4`. The transport envelope keeps net.js's `V` 3.
  - The v4 parsers survive the fuzz: no exception, no NaN, a hostile body clamped to (228, 224), and the view
    recovers after a far-future tick.
  - Result: rv-net 70/0. Worst snapshot 3,360 B, R 172 B, so looks still add no byte in play.
- **By hand.**
  - `final-v3`, full run (solo, perks, coop, battle on all 4 arenas, leaves, room, soak): 272/0 in 477 s. This
    includes L484 (card `--slot`), L508 (tags) and L658 (the summary line).
  - `review-mpmaps #tags0..3 / #tagsc`: looked at (`C:/Temp/bogeul/hand-mpmaps-tags*.png`). The 6-letter nick
    ellipsizes, and a colliding co-op chip goes compact.
  - `ux-review` on a 390 x 844 phone (title, room-host4-ready, room-guest4-ready, coop4-hud, battle4-hud,
    battle-trapped-other, battle-ko, coop-over, podium-guest):
    - Nothing is off screen or clipped, except the podium's screen-reader line, which is 1 px by design.
    - Tags are 15 px high at the 11 px floor, and a compact chip is 16 px wide.
- **Builds.**
  - `dist/ppogeul-bath.html` (1,074.2 KB): no `<script src>`, no "firebase", no service worker.
  - `deploy/`: index.html, manifest.webmanifest, sw.js, icons/ (4) and ppodeuk-bath-itch.zip (338.6 KB, 7 files, from
    `tools/pack-itch.js`).
- **Still open (unchanged):**
  - ~~The three art findings in `src/sprites.js` (art track).~~ Fixed 2026-10-18, next section.
  - S5's hand check of the rules in the emulator or the Rules Playground.

### As built (art fixes after S3, art track, 2026-10-18)

The three open art findings, fixed in `src/sprites.js` only (no game.js / page.html change):

- **f3 새내기 별 스티커:** the same 3x3 star, now violet with a white centre and ink in the gaps (`kvk / vwv / vkv`).
  Not yellow (it vanished on the duck), not pink (it sat on the penguin's pink towel and beside f1's pink heart).
- **f7 황금 외알 안경:** a new ring, light-gold rim top-left, dark gold (y / o) round the rest, the pupil with a white
  glint inside, the chain at the back; no ink above the eye but the far corner (it read as a frown). Front box 10x3
  (was 9x3), pivot still (4,1): on the cat and frog the chain hangs on the outer side.
- **n6 거품 진주 목걸이:** 8x4 (an empty top row + 3): a V of cyan beads 1 px below the throat to one bottom pearl
  with a white highlight, ink only on the outside (the straight white row read as a toothy grin). 3 rows, not 4: the
  otter's dash has its throat at row 12.
- **b1 망토 수건:** 8x9, pivot (7,3): a white shoulder band between ink rows (it shows in the notch between head and
  back), the towel with vertical P / p stripes, flaring 1 px, a fringed hem; it shows 4 px behind the back (was 2: it
  read as a pink tail). **b4 목욕 바구니 배낭:** 8x8 (was 7x8), pivot (7,4): three columns of weave show.
- **Cat B anchor (3,7) -> (3,5):** back items cannot go further left of the striped tail (B.x 3 keeps the 8-wide b5 /
  b6 inside the composite), so they rise and their tops show over the tail tip; b5 / b6 / b7 move up 2 px on the cat.
- **`tools/check-sprites.js`:** fails when more than 80% of a face item's coloured pixels on an animal use that
  animal's body colours (`PG.TWIN_KEYS`); items drawn mostly in ink are exempt (f4 on the cat, f6 on the frog pass).
  With the old sprites it flags exactly f3 and f7 on the duck.
- Known: in the twin-pink colour the pink b1 / b4 sit on a pink body; the ink outline and white band carry them.
