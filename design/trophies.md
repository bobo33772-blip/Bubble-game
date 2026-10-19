# 뽀득뽀득 목욕탕: trophies (트로피) v1 — final design spec

Status: final design, ready to implement in one pass after the v4 kit passes. It touches `endBattle`, `roomInfo`,
`guestRoom`, `guestHostIn`, `netMsgIn`, `drawPodium`, `showOverlay`, `renderRoom`, `buildOpts`, which other passes
are editing now. Code is referenced by function name, because `src/game.js` is being edited concurrently and line
numbers would go stale. Every number in the rules tables was checked with a simulation of `troTable` (3.1), including
the bounds: the most a player can lose is stake + 6, the most a player can win is +164, and the pot shares never add
up to more than the pot.

The user asked for something like Rummikub's trophies: a standing of your own, plus "몇 개 걸고" (betting a few)
when playing with friends.

---

## 0. Decisions in one table

| Question | Decision |
|---|---|
| What is a trophy | A count kept per device (0..99999) in localStorage, read and written only through `sget`/`sset`. It is drawn as a pixel cup (sprite `trophy`, 8x8), never as an emoji. |
| Ladder | 7 leagues: 때밀이 견습 0 → 뽀득 새내기 60 → 온탕 단골 150 → 양머리 고수 300 → 세신 달인 500 → 사우나 명인 800 → 목욕탕 왕 1200. The league is always derived from the count, so it can go down again. "승급!" shows only the first time a league is reached. |
| Starting gift | **30** (처음 선물). That is enough to bet 5, 10 or 20. |
| Battles (트로피 경기) | Points by place: 1v1 +10 / −6; 3 players +12 / +3 / −6; 4 players +14 / +6 / −2 / −6. Tied players average their places' points. When every finisher is tied, it is a draw (무승부) and nobody gets place points. |
| Beginner protection | While the count is under 60 (때밀이 견습), placement never costs trophies. A bet still can. |
| 트로피 걸기 | The host picks one stake for everyone: 0 / 5 / 10 / 20 / 50. **Everyone puts it in and 1st place takes the pot.** A tie for 1st splits the pot (rounded down). The room shows the final result for each place in one line. |
| When trophies are held | At "시작!", the end of the 3-2-1 countdown. Each client then holds its stake + 6 from its own count (only the stake, in 견습). That is exactly the result for last place. Leaving during 3-2-1 is free. |
| Consent | Being ready means ready **for that stake**. A stake change un-readies everyone, and `rd` carries the stake the guest saw. A guest only puts in the stake it readied for. A rematch (한 판 더) keeps the stake, and leaving at the podium is free. |
| Not enough trophies | A player who cannot cover the stake cannot ready (tag 트로피 부족), and the host cannot start. 한 판 더 waits until every guest has reported its new count and stays off while anyone is short. |
| Leaving | Leaving on purpose (나가기, 로비로, the host's 방으로 mid-match, closing the tab) counts as last place, and that player's stake goes to the winner. If the link drops while you are watching, you get your trophies back (refund). If it drops while you were away (tab hidden, phone switched apps, offline), it counts as last place. If the host leaves or the page hot-reloads, everyone gets a refund. If no result comes within 15 s after the match, you get a refund. |
| Walkover (기권승) | A walkover pays only when the others left on purpose. Otherwise it is void and the trophies are refunded, so cutting your own network can never win a match. |
| Co-op / solo | **목욕 보너스**: progress only, nothing can be lost. +1 for every 3 탕 cleared, +2 for each boss, +4 for the ending. At most 15 per run and 20 per day; solo and co-op share the daily cap. Every co-op teammate gets the same amount. |
| 연습 경기 | No trophies change when the players are tabs of one browser (bc), when two players share one device's store, or when a page has no trophies (an old v4 page). |
| Integrity | The host computes the result. Each client applies only its own row, exactly once, against an escrow it actually holds. It clamps the row with its own numbers (players, stake). It only accepts the result after the match could really have been played. A hostile host can take at most stake + 6 per real match, which is the same as beating you. |
| Title | A trophy badge sits inline on the existing 최고 점수 line, so the title card gets no taller. It opens a new **내 기록** overlay. |
| NET_V | Stays 4. Trophy pages and v4 pages without trophies are safe together in either direction (6.7). |
| Not in v1 (follow-ups) | Lobby list fields in net.js (stake and host trophies), a daily first-win bonus, a trophy on the battle HUD, streaks, and a checksum or backup key. |

---

## 1. Ground truth from the code (what this builds on)

| Thing | Code | Consequence for trophies |
|---|---|---|
| Storage | `sget(k)` / `sset(k, v)` wrap localStorage in try/catch. Keys today: `ppogeul-hiscore`, `ppogeul-char`, `ppogeul-nick`. Tabs of one browser share storage. | New key `ppogeul-trophy`. Every change re-reads the store first (read-modify-write, 4), or a second tab would overwrite the first tab's count. If storage is blocked, the store lives in memory for the session. |
| Top-level consts | `V3_TEXT` (≈ line 160), `REQUIRED` and `SPR_SIZE` are `const`s that are evaluated when the script loads. | Every trophy constant they use (`LEAGUES`, `TRO_TEXT`) goes in the top constants block. Defining one later in the file and using it there is a TDZ ReferenceError at load, and the whole engine would not boot. |
| Battle start | `netStart` → `netAgain(fn, true)` → `newBattle(..., {countdown: true})`. `rematch()` keeps `G.opts`, so it always counts down too. The last frame of `updateCountdown` shows "시작!". | Trophies are held at that frame (host) and at the first `'p'` snapshot of the game id (guest, 6.6). |
| Battle end | `endBattle()` sorts by score, then kos, then fewer koed, then slot, sets `p.rank` and `G.podium.order` (slots of the players still present), then `showOverlay('podium')`. | Places come from that order. Ties for trophies use (score, kos, koed) only, so the host (slot 0) never wins a tie just by being slot 0. |
| Leavers | `hostDropPlayer(r)` removes the animal. With fewer than 2 battlers left and the mode not podium, it calls `endBattle()`, even during the countdown. | A walkover is a real case. Since nothing is held before "시작!", a walkover during 3-2-1 changes nothing. |
| Game ids | `netAgain` bumps `NET.gid` on every start, rematch, retry and 2회차. `netAttach` resets it to 0. | Match id = `NET.ms + '.' + gid`, where `NET.ms` is a random series id per host session (6.1). |
| Room state `R` | `roomInfo()` gives `{gid, ph, m, o: [arena, time, perks, intrusion], p: [[slot, nick, char, ready]]}`. It rides in every host state, under SNAP_LIMIT 3400 (net.js STATE_MAX 3600). | Measured worst case (4 × 12-syllable nicks): 275 bytes today. With trophies it is 292 in the game (+17) and 316 in the room phase (6.2). |
| Messages | `send(to, msg)` is reliable, ordered per sender and exactly once; anything over 900 bytes is refused. Guests ignore every message today (`netMsgIn` returns for non-hosts). | The result is one reliable host → guests message `tro` (107 bytes worst case). It is the first message a guest accepts, and only from `NET.hostId`. |
| Session end | `netStatusIn('closed', 'host_left' / 'lost' / 'left')`. `notInGame` → `netLeave(lost)`. `stopEngine` → `netClose()` runs only on a hot reload. On an F5 or a tab close, only `pagehide` runs (net.js closes its sessions there itself, before the engine's listener). | `netClose(why)` gets a reason (5.4), and the engine's `pagehide` closes open escrows as forfeits. |
| net.js room `leave()` | It cancels the pending presence flush (40 ms) and publishes only `{x: 1}`. | A reliable message sent just before leaving never goes out. The `gg` message (6.3) needs `leave()` to flush pending entries first (6.8). |
| Who notices an outage | Peer: `link.health()` is always true for the host, so a host whose own link died still drops every guest after lostMs and gets a walkover. Room: the host does not drop guests while it is itself disconnected. A guest's own close (even `'lost'`) also publishes a bye. | Neither a host health check nor net.js "left vs lost" can tell a rage quit from the host's own outage. The engine sends `gg` from the user's own action instead (6.3), and walkovers pay only for it. |
| Hidden tabs | The rAF loop stops (a hidden host freezes the battle clock for everyone). net.js timers keep running, throttled, so states and messages are still handled. | A guest takes its escrow and applies results from network events (`guestHostIn`, `netMsgIn`), never from the frame loop. |
| Results UI | Action keys are locked for 60 f on the podium, but clicks act at once, so 한 판 더 can start before a guest's view reaches the podium. `drawPodium()` draws 32 px blocks: the rank at top+5, the score at top+21. The HUD (scores) stays drawn on the podium. | A reliable result plus a 15 s wait fallback (5.4). The block's second line can flip from the score to the trophy change (cup 8 + 1 + "+164" 23 = 32 px). |
| Name clashes | `NET.tr` is the transport, and the snapshot already uses `g.tr` for the transition. | The new names are `tro` (the result message), `cup` (a reported count) and `r.cup` (on the roster). |
| Title keys | Escape on the title calls `togglePause` (a no-op there). Enter, jump and shoot call `primaryAction`, which starts a solo game. | A new overlay over the title has to catch both. |
| Screen | 256x224. `--fs = clamp(6s, 11 or 12.5 on touch, 22)`. A 320 px phone screen is about 24em × 21em. The title card hides extras with `@container` steps down to 16.5em. The friends and room panels scroll. | In-screen overlays must fit 20em tall. On the title, only the existing best-score line has room. The room can grow, because it scrolls. |

---

## 2. The ladder and the constants (top constants block, before `REQUIRED` and `V3_TEXT`)

```js
  // ---- v4 trophies (트로피): constants up here - REQUIRED / SPR_SIZE and the font warm-up read them at load
  const TRO_KEY = 'ppogeul-trophy', TRO_V = 1, TRO_MAX = 99999, TRO_GIFT = 30;
  const LEAGUES = [
    { name: '때밀이 견습', min: 0, col: '#6fd08a' },     // lg_0 green 이태리타올 (placement never costs here)
    { name: '뽀득 새내기', min: 60, col: '#ff9ec4' },    // lg_1 pink soap + bubble
    { name: '온탕 단골', min: 150, col: '#8fd3ff' },     // lg_2 yellow 바가지 with steam
    { name: '양머리 고수', min: 300, col: '#f3e2b4' },   // lg_3 sheep-head towel
    { name: '세신 달인', min: 500, col: '#ffd23c' },     // lg_4 banana-milk jar
    { name: '사우나 명인', min: 800, col: '#ff9a6a' },   // lg_5 sauna hourglass
    { name: '목욕탕 왕', min: 1200, col: '#ffd447' },    // lg_6 bathhouse crown
  ];
  const STAKES = [0, 5, 10, 20, 50];
  const BASE = { 2: [10, -6], 3: [12, 3, -6], 4: [14, 6, -2, -6] };     // by place; n = players at 시작!
  const RUN_CAP = 15, DAY_CAP = 20;                                       // 목욕 보너스 per run / per local day
  const TRO_WAIT_MS = 15000, TRO_AWAY_MS = 30000, TRO_STALE_MS = 15 * 60000, TRO_SLACK_MS = 15000;
  const MID_RE = /^[0-9a-z]{6}\.\d{1,9}$/, ID6_RE = /^[0-9a-z]{6}$/;
  const leagueOf = (t) => { let i = 0; while (i + 1 < LEAGUES.length && t >= LEAGUES[i + 1].min) i++; return i; };
  // REQUIRED.trophy = 2; LEAGUES.forEach((l, i) => { REQUIRED['lg_' + i] = 1; SPR_SIZE['lg_' + i] = [8, 8]; }); SPR_SIZE.trophy = [8, 8];
  const TRO_TEXT = /* section 11 */;
```

- `S.bl` (the best league reached) decides "승급!". It shows only when you enter a league above your best. Dropping, or coming back into a league you had before, is silent.
- Pace at stake 0: an average 1v1 player gains +2 per game, and +3 in 3–4 player games. A winner gains +10 to +14, and a 견습 player loses nothing by placement. Leaving 견습 takes a few wins; 목욕탕 왕 takes hundreds of games or brave betting.

---

## 3. Earning and losing

### 3.1 Battles: the rules (`troTable`, host only)

```js
  const sameRes = (a, b) => a.sc === b.sc && a.k === b.k && a.ko === b.ko;
  // host: one row [slot, place, base, share, kos] per finisher. fin = the players still here, best first (G.podium.order),
  // each {slot, sc, k, ko, p}; p = 견습 at 시작! (reported counts). n = players at 시작!, s = the stake, gl = leavers who
  // left on purpose ('gg'). The pot is the stakes of the finishers and of those leavers; 1st place takes it.
  // [] = no result: a walkover nobody gave up (it was a dropped link - maybe the host's own): void, every escrow refunded
  function troTable(n, s, fin, gl) {
    const m = fin.length, pot = s * (m + gl), B = BASE[n];
    if (!m || (m === 1 && !gl)) return [];
    if (m >= 2 && fin.every((r) => sameRes(r, fin[0]))) return fin.map((r) => [r.slot, 1, 0, Math.floor(pot / m), r.k]); // 무승부
    const out = [];
    for (let i = 0; i < m;) {                                   // a tie group shares its places' points; a tie for 1st, the pot
      let j = i; while (j + 1 < m && sameRes(fin[j + 1], fin[i])) j++;
      let b = 0; for (let q = i; q <= j; q++) b += B[q];
      const k = j - i + 1, bb = Math.round(b / k), sh = i === 0 ? Math.floor(pot / k) : 0;
      for (let q = i; q <= j; q++) out.push([fin[q].slot, i + 1, fin[q].p && bb < 0 ? 0 : bb, sh, fin[q].k]);
      i = j + 1;
    }
    return out;                                                 // (what the floors leave over is simply not paid)
  }
```

A row becomes my change as **net = base + share − stake**. The clamps are in 5.3.

Results for distinct places (1st..last), simulated:

| Stake | 1v1 | 3 players | 4 players |
|---|---|---|---|
| 0 | +10 / −6 | +12 / +3 / −6 | +14 / +6 / −2 / −6 |
| 5 | +15 / −11 | +22 / −2 / −11 | +29 / +1 / −7 / −11 |
| 10 | +20 / −16 | +32 / −7 / −16 | +44 / −4 / −12 / −16 |
| 20 | +30 / −26 | +52 / −17 / −26 | +74 / −14 / −22 / −26 |
| 50 | +60 / −56 | +112 / −47 / −56 | +164 / −44 / −52 / −56 |

- **Held at "시작!" = stake + 6** (only the stake in 견습). That is the same for every n, because last place is always −6. Finishing last therefore costs exactly the amount held, and so does leaving.
- **Most you can win** = BASE[n][0] + stake × (n − 1), so +164 at 4 players and stake 50.

Ties and leavers (stake 10):

| Case | Result |
|---|---|
| 4 players, 2nd = 3rd | +44 / −8 / −8 / −16 (points (6 − 2) / 2 = 2 each) |
| 4 players, 1st = 2nd | +20 / +20 / −12 / −16 (points (14 + 6) / 2 = 10 each, pot 40 / 2 = 20 each) |
| 3 players, 1st = 2nd | +13 / +13 / −16 |
| 3 players, 2nd = 3rd | +32 / −11 / −11 (points (3 − 6) / 2 = −1.5, rounded to −1) |
| 1v1 tie, or all 4 tied | 무승부: 0 for everyone |
| 4 players, one left on purpose | +44 / −4 / −12 for the finishers. The leaver lost 16 through the trophies it held. |
| 4 players, one link dropped (no gg) | +34 / −4 / −12. The dropped stake is not in the pot; the dropped player's own client refunds or forfeits it (5.4). |
| 4 players, three left on purpose (기권승) | +44 |
| 1v1, the other left on purpose | +20 (기권승) |
| 1v1 or 4 players, everyone else dropped, no gg | void: the host's held trophies are refunded |
| 4 players, three finishers all tied, one left on purpose | 무승부 for the three: 40 / 3 = 13 each → +3 each |

Rules attached to the table:

- **Places** come from `G.podium.order`. Ties for trophies use (score, kos, koed) only.
- **견습 protection** is applied twice. The host applies it in the table with each player's reported count at "시작!", so every screen shows the same numbers. Each client also enforces it on its own row from its own escrow (`e.p`).
- **A win** is `place === 1 && base > 0`, so a tie for 1st counts and a draw does not. Only wins and games feed the stats.
- **Walkover.** Only `gg` (6.3) puts a leaver's stake into the pot and makes a walkover pay. A host whose own network dies sees every guest drop without `gg`, so the match is void and the host gets its trophies back. Its guests see the link drop while they are watching, so they are refunded too. Cutting the network can therefore dodge a loss (the same as any dropped link), but it can never win.

### 3.2 트로피 걸기 (betting)

- **Who picks:** the battle host, in the 방 만들기 options and in the room. The value is kept in `NET.opts.bet` (default 0). `stakeNow() = NET.mode === 'battle' ? NET.opts.bet | 0 : 0`, so co-op never has a stake.
- **Affordability:** `canAfford(r) = stakeNow() === 0 || (r.id === NET.selfId ? TRO.s.t : r.cup) >= stakeNow()`. The host checks counts reported by guests (`hi`, `rd`, `cup`). A guest's own UI checks its real count.
  - The host's stake buttons above its own count are disabled, with the title "내 트로피가 모자라요".
  - `netAttach` (host) and `netToRoom` lower a stake the host can no longer cover to the largest one it can. The room message then says "걸기를 낮췄어요: 10개씩" (or "…: 안 걸기") for 4 s.
  - `canStart()` also requires `NET.roster.every(canAfford)`.
- **Consent:**
  - Any change of the stake un-readies every guest. The host clears `r.ready`. The guest, in `guestRoom`, sees `NET.ready && bet !== TRO.agreed`, clears `NET.ready` and shows "걸기가 바뀌었어요: 10개씩 · 다시 준비해 주세요" (or "…: 안 걸기 …") for 4 s.
  - `rd` carries the stake the guest saw (`b`). The host accepts a ready only if `b === stakeNow()` and the guest can afford it. This closes the race of a ready sent just before the stake changes.
  - When a guest readies, it records `TRO.agreed = stakeNow()`. `TRO.agreed` goes back to −1 on `netAttach`, `guestToRoom`, un-ready and a stake change; a rematch keeps it. At "시작!" the guest puts in a nonzero stake only if the stake still equals `TRO.agreed`. Otherwise it plays the match as practice for itself, so a host cannot raise the stake after the ready, even by forging R or by force-starting.
- **Held at "시작!"** (5.1): the host in `updateCountdown` on the 시작! frame, a guest on the first `'p'` snapshot of the game id. Amount: `min(t, s + (견습 ? 0 : 6))`. If `t < s` (another tab spent trophies since the ready), the player plays this match as practice for itself. The sfx `stake` plays when s > 0.
- **Rematch (한 판 더)** is a new game id, so trophies are held again at its "시작!". After a staked result, the button and `primaryAction` stay off until every present guest has reported its count for that result (`cup` with `m`, 6.3) and everyone, the host included, can still cover the stake. The host's podium note then reads "트로피가 모자란 친구가 있어요 · 방으로 가서 걸기를 바꿔요" (or "내 트로피가 모자라요 · 방으로 가서 걸기를 바꿔요"). The guest's wait note reads "방장이 다음 판을 고르고 있어요 · 다음 판도 10개씩", and a guest who does not want that can leave at the podium for free.

### 3.3 목욕 보너스 (solo and co-op): progress only, nothing to lose

```js
  // a run: newGame / newCoop / continueLoop (2회차) start one, at the round index loop * 24 + round; a guest's co-op run
  // starts at its first snapshot of the game id. Awarded at the 목욕 끝 / ending cards, incrementally (never twice)
  function troBonus(ended) {
    const R = TRO.run; if (!R || !troBonusOk()) return null;
    const N = LEVELS.length, end = G.loop * N + G.round + (ended ? 1 : 0), cleared = Math.max(0, end - R.at);
    let boss = 0; for (let i = R.at; i < end; i++) if (LEVELS[i % N].boss) boss++;
    const P = Math.min(RUN_CAP, Math.floor(cleared / 3) + 2 * boss + (ended ? 4 : 0));
    return troMut((S) => {
      const day = troToday(); if (S.day !== day) { S.day = day; S.de = 0; }
      const want = Math.max(0, P - R.got), give = Math.min(want, DAY_CAP - S.de);
      R.got += give; S.de += give; S.t = Math.min(TRO_MAX, S.t + give); S.best = Math.max(S.best, S.t);
      return { give, capped: want > give, now: S.t, promo: troPromo(S), show: P > 0 || want > give };
    });
  }
  // offline solo (not the attract demo, not debug local co-op), or online co-op that is ranked (NET.q === 0)
  const troBonusOk = () => !G.attract && (G.online ? G.gameMode === 'coop' && NET.q === 0 : G.gameMode === 'solo');
```

- Examples:
  - Game over in the 4th 탕 (3 cleared): +1.
  - Game over in the 7th 탕 (6 cleared, boss 1 beaten): 2 + 2 = +4.
  - Full clear: 8 + 8 + 4 = 20, capped at **15**.
  - Two full clears in one day: 15, then 5 (the daily cap of 20).
- 2회차 is a new run, offline and online alike, so it has its own cap of 15 under the daily 20. Showing a card twice never pays twice, because of `R.got`.
- Why solo earns: a player with no friends online can still grow and buy back into betting. The daily cap keeps grinding the first rounds from beating battles as the way up. Battles have no cap.
- `TRO.run` is cleared by `toTitle`, `idleWorld` and a battle's `resetGame`.

### 3.4 What never matters

능력 끄기, 보스 난입, the battle length (2/3/5 분, apart from the minimum match time in 5.3), the arena, the animal, power-ups and the MVP crown have no effect on trophies.

### 3.5 연습 경기 (practice: nothing changes)

```js
  // host: 0 = 트로피 경기; 1 = this browser's tabs (bc: they share one store); 2 = two players from one device's store
  function troPractice() {
    if (NET.tr === 'bc' && !TRO.allowBc) return 1;
    const ds = NET.roster.map((r) => (r.id === NET.selfId ? troDevHash(NET.code) : r.d)).filter(Boolean);
    return new Set(ds).size < ds.length ? 2 : 0;
  }
```

- In the room, `q` is live. `netAgain` freezes it into `NET.q` for that game.
- A guest treats the match as practice for everyone when `R.ms` is missing or invalid (an old page fails safe). It treats it as practice for itself when its own transport is bc (without `allowBc`), when it did not agree to the stake, when it cannot cover the stake, or when its store is read-only.
- Offline debug battles, the attract demo and offline local co-op never touch trophies.

---

## 4. Storage

**Key `ppogeul-trophy`** (tests: `ppogeul-trophy-<ns>`), JSON:

| Field | Type / range | Meaning |
|---|---|---|
| `v` | 1 | Schema version |
| `dev` | /^[0-9a-z]{8}$/ | Random device id. It is only ever sent hashed per room (`troDevHash`). |
| `t` | int 0..99999 | Trophies |
| `best` | int t..99999 | Best count ever |
| `bl` | int 0..6 | Best league reached (for 승급) |
| `w`, `g` | int 0..1e6 | Ranked battle wins and ranked battles. Results and forfeits count as games; refunds do not. |
| `ko` | int 0..1e6 | 뽀득 KOs in ranked battles |
| `day`, `de` | YYYYMMDD, 0..20 | 목욕 보너스 already given on that local day |
| `seen` | 0/1 | 내 기록 opened once (hides the NEW dot) |
| `esc` | ≤ 8 × `{m, tab, h, s, n, p, st, t0}` | Held trophies: match id, owning tab, held, stake, players, 견습 0/1, `'open'` or `'wait'`, Date.now() when taken |

```js
  // tab: this page load's id (troRand(6) in boot). Everything else that is per tab lives here, not in storage
  const TRO = { s: null, key: TRO_KEY, tab: '', mem: false, ro: false, allowBc: false, fast: false, day: null, awayAt: 0,
    seen: new Set(), live: new Map(), agreed: -1, match: null, lastRes: null, last: null, run: null, pod: null };
  function troFresh() { return { v: TRO_V, dev: troRand(8), t: TRO_GIFT, best: TRO_GIFT, bl: 0, w: 0, g: 0, ko: 0, day: 0, de: 0, seen: 0, esc: [] }; }
  // untrusted (hand edits, other versions): clamped field by field; null = start fresh, 'newer' = a newer page's data
  function troParse(raw) {
    let o = null; try { o = JSON.parse(raw); } catch (e) { o = null; }
    if (!o || typeof o !== 'object') return null;
    if (typeof o.v === 'number' && o.v > TRO_V) return 'newer';
    if (o.v !== TRO_V || typeof o.dev !== 'string' || !/^[0-9a-z]{8}$/.test(o.dev)) return null;
    const I = (v, hi) => nInt(v, 0, hi, 0), t = I(o.t, TRO_MAX);
    const esc = (Array.isArray(o.esc) ? o.esc : []).filter((e) => e && typeof e === 'object' && MID_RE.test(e.m) && ID6_RE.test(e.tab))
      .slice(-8).map((e) => ({ m: e.m, tab: e.tab, h: I(e.h, 56), s: STAKES.includes(e.s) ? e.s : 0, n: nInt(e.n, 2, 4, 2),
        p: e.p ? 1 : 0, st: e.st === 'wait' ? 'wait' : 'open', t0: nNum(e.t0, 0, 9e15, 0) }));
    return { v: TRO_V, dev: o.dev, t, best: Math.max(t, I(o.best, TRO_MAX)), bl: I(o.bl, LEAGUES.length - 1), w: I(o.w, 1e6),
      g: I(o.g, 1e6), ko: I(o.ko, 1e6), day: I(o.day, 99991231), de: I(o.de, DAY_CAP), seen: o.seen ? 1 : 0, esc };
  }
  function troRead() {                         // the store as it is NOW (another tab of this browser may have written)
    if (TRO.mem || TRO.ro) return TRO.s;
    const raw = sget(TRO.key), o = raw === null ? null : troParse(raw);
    if (o === 'newer') { TRO.ro = true; return TRO.s || troFresh(); }        // a newer page's data: never overwritten
    return o || troFresh();                                                  // missing / unreadable: fresh, with the gift
  }
  function troWrite(S) { if (!TRO.mem && !TRO.ro) sset(TRO.key, JSON.stringify(S)); }
  // EVERY change: read, change, write (the in-memory copy alone would overwrite another tab's count)
  function troMut(fn) { const S = troRead(); const r = fn(S); troWrite(S); TRO.s = S; troSync(); return r; }
  function troLoad() {                         // boot (before setupDOM) and PG.debug.tro.ns
    TRO.mem = false; TRO.ro = false; TRO.s = null; TRO.s = troRead();
    if (!TRO.ro) { troWrite(TRO.s); if (sget(TRO.key) === null) TRO.mem = true; }   // blocked storage: this session only
    troStale();
  }
```

- **Hot paths check the in-memory copy first**, and only then read, change and write. Examples are `troWait` on every podium snapshot and `troEscrow` on every `'p'` snapshot. Only this tab writes this tab's open escrows, so the in-memory check is reliable for them.
- `listen(window, 'storage', (e) => { if (e.key === TRO.key) { TRO.s = troRead(); troSync(); } })` keeps the badge and the room in step with other tabs.
- `troSync()` sets `NET.roomDirty` (`R` carries my count) and refreshes the visible trophy UI: the badge, the friends chip and the room. It never sends anything.
- **Known limits** (stated in the section comment; there are no accounts):
  - localStorage can be cleared, and a private window starts with the gift.
  - A player can raise their own count with devtools or extra browser profiles. Counts shown to friends are self-reported anyway.
  - What the design guarantees: nobody can take more from another player than that player's escrow, and only at the pace of real matches. Tabs of one browser can't farm each other.
- No checksum and no backup key. A checksum guards nothing, because counts are self-reported over the network anyway. It would also reset honest players to 30 on any serialisation bug. localStorage writes are atomic, so a backup has nothing to protect against.
- No new artifact capabilities.

---

## 5. Client state machine (every player, the host included)

### 5.1 Hold at "시작!"

```js
  // min = ms of real time before a result may be accepted (guests: the battle clock - TRO_SLACK_MS; host: 0)
  function troEscrow(mid, s, n, min) {
    if (!MID_RE.test(mid) || TRO.seen.has(mid) || TRO.ro || !TRO.s) return false;
    TRO.seen.add(mid);                                                   // once per match id, whatever happens
    return troMut((S) => {
      if (S.t < s) return false;                                         // can't cover it: practice for me
      const p = leagueOf(S.t) === 0 ? 1 : 0, h = Math.min(S.t, s + (p ? 0 : 6));
      S.t -= h; S.esc = S.esc.concat([{ m: mid, tab: TRO.tab, h, s, n: clamp(n | 0, 2, 4), p, st: 'open', t0: Date.now() }]).slice(-8);
      TRO.live.set(mid, { at: performance.now(), min });
      if (s > 0) troSfx('stake');
      return true;
    });
  }
```

### 5.2 Close without a result

```js
  function troClose(mid, how, why) {                       // how: 'refund' | 'forfeit' (a forfeit stays taken: last place)
    troMut((S) => {
      const e = S.esc.find((q) => q.m === mid); if (!e) return;
      if (how === 'refund') S.t = clamp(S.t + e.h, 0, TRO_MAX); else S.g = Math.min(1e6, S.g + 1);
      S.esc = S.esc.filter((q) => q !== e);
      if (e.tab === TRO.tab) TRO.last = { how, why, h: e.h, at: Date.now() };   // the friends / room line reads it (8.4)
    });
    TRO.live.delete(mid);
    if (NET.sess && NET.role === 'guest') troCupOut(mid);  // the host's room chips / rematch gate want my new count
  }
```

### 5.3 Apply a result: my own row only, once, clamped by my own numbers

```js
  function troApply(mid, rows, slot, host) {
    const L = TRO.live.get(mid);
    // a guest takes a result only after the match could have been played: a modified host cannot drain anyone faster
    // than the battle clock (rejected = the escrow stays open -> 'wait' -> refund, 5.4)
    if (!host && (!L || (!TRO.fast && performance.now() - L.at < L.min))) return null;
    if (!TRO.s.esc.some((q) => q.m === mid && q.tab === TRO.tab)) return null;
    return troMut((S) => {
      const e = S.esc.find((q) => q.m === mid && q.tab === TRO.tab); if (!e) return null;      // applied / closed already
      const row = (Array.isArray(rows) ? rows : []).find((r) => Array.isArray(r) && nInt(r[0], -1, 3, -1) === slot); if (!row) return null;
      const n = e.n, s = e.s, B = BASE[n];                         // MY players / stake from MY escrow, never the message's
      const place = nInt(row[1], 1, n, n);
      let base = nInt(row[2], B[n - 1], B[0], B[n - 1]); if (e.p && base < 0) base = 0;
      const share = nInt(row[3], 0, s * n, 0), kos = nInt(row[4], 0, 99, 0);
      const before = S.t + e.h, after = clamp(before + base + share - s, 0, TRO_MAX), win = place === 1 && base > 0;
      S.t = after; S.g = Math.min(1e6, S.g + 1); if (win) S.w = Math.min(1e6, S.w + 1);
      S.ko = Math.min(1e6, S.ko + kos); S.best = Math.max(S.best, after);
      S.esc = S.esc.filter((q) => q !== e); TRO.live.delete(mid);
      return { place, net: after - before, now: after, win, promo: troPromo(S) };
    });
  }
  function troPromo(S) { const lg = leagueOf(S.t); if (lg > S.bl) { S.bl = lg; return lg; } return -1; }
```

- **Bound:** the net is at least `B[n−1] − s = −(s + 6)`, which is what was held. The floor at 0 never triggers when the gates held: a non-견습 count is at least 60, which is more than 50 + 6. It is only a safety net.

### 5.4 How held trophies end without a result

| Event | My held trophies | Why |
|---|---|---|
| `tro` with my row (guest) / `troHostResult` (host) | applied (5.3) | normal |
| The match is over in my view without a result: a snapshot of that game id in phase `'d'` (podium), `guestToRoom`, or a newer game id in `guestBegin` | `'wait'`, then refunded after 15 s. A `tro` that arrives inside the window still applies. | The host did not pay me, which is not my fault. 15 s covers a reliable message that lags the state (bc jitter). |
| `netClose('host_left')` / `netClose('reload')` (hot reload) | refund | Nobody's choice of mine |
| `netClose('lost')` while present: `!troAway()` | refund | The other side went quiet. On peer, a guest cannot tell the host's outage from its own. |
| `netClose('lost')` while away | forfeit | I went away: switched apps, hid the tab, went offline |
| `netClose('left')`: 나가기, 로비로, 처음으로, the room's 나가기 | forfeit, after sending `gg` | I left. 판 중간에 나가면 꼴찌로 쳐요. |
| Host 방으로 mid-match (`netToRoom` while not on the podium and the match is past 시작!) | host: forfeit. Guests: `'wait'` → refund. | The host chose to stop. Its confirm label says what it costs (8.7). |
| Host walkover with no `gg` (`troTable` → `[]`) | host: refund | Void, as in 3.1 |
| `pagehide` (tab close, F5, navigation) | forfeit for open trophies, refund for `'wait'` | Closing mid-match is leaving. The `gg` sent when the page went hidden (6.3) pays the winner. |
| A crashed or discarded tab (no pagehide ran) | another load of the page closes it after 15 min: forfeit if open, refund if waiting | `troStale` |
| A `'wait'` escrow when the session ends | refund | |

```js
  // away: hidden now, offline now, or back (visible / online / resumed / a loop gap > 1 s) less than 30 s ago - the
  // 'lost' of a phone that switched apps arrives AFTER it is visible again, so the return counts too
  const troAway = () => !!document.hidden || navigator.onLine === false || Date.now() - TRO.awayAt < TRO_AWAY_MS;
  function troSessionEnd(why) {                        // first thing in netClose(why), while NET.sess is still set
    const mine = TRO.s ? TRO.s.esc.filter((e) => e.tab === TRO.tab) : [];
    if (why === 'left') troGg(1);                      // (guest: tell the host I gave up, before leave())
    const away = troAway();
    for (const e of mine) troClose(e.m, e.st === 'wait' || why === 'host_left' || why === 'reload' || (why === 'lost' && !away) ? 'refund' : 'forfeit', why);
    TRO.match = null; TRO.lastRes = null;
  }
  function troWait(mid) {                              // in-memory check first: called on every podium snapshot
    if (!TRO.s || !TRO.s.esc.some((q) => q.m === mid && q.tab === TRO.tab && q.st === 'open')) return;
    troMut((S) => { const e = S.esc.find((q) => q.m === mid && q.tab === TRO.tab); if (e) e.st = 'wait'; });
    setTimeout(() => { if (!stopped && TRO.s.esc.some((q) => q.m === mid && q.tab === TRO.tab && q.st === 'wait')) troClose(mid, 'refund', 'wait'); }, TRO_WAIT_MS);
  }
  function troStale() {                                // boot and showOverlay('title'): a tab that died without pagehide
    const now = Date.now(), old = (e) => e.tab !== TRO.tab && (!(now - e.t0 < TRO_STALE_MS) || e.t0 > now + 864e5);
    if (!TRO.s || !TRO.s.esc.some(old)) return;
    troMut((S) => { for (const e of S.esc.filter(old)) { if (e.st === 'wait') S.t = clamp(S.t + e.h, 0, TRO_MAX); else S.g = Math.min(1e6, S.g + 1); S.esc = S.esc.filter((q) => q !== e); } });
  }
```

- **`TRO.awayAt = Date.now()`** is set on `visibilitychange` (both directions), `pageshow`, `resume`, `online` and `offline`, and in `loop()` when the raw rAF `dt > 1000`, before dt is clamped.
- **No heartbeat.** A live escrow is at most one match old: up to 5 min plus the podium, or longer while a hidden host freezes the clock, and 15 min allows three times that. Another tab only ever closes a *foreign* escrow, and only by that age.
- **Reconnects:** trophies add no grace of their own. A blip the transport rides out changes nothing. When the session ends, the table above applies. A guest cannot rejoin mid-match, because the session is locked.

---

## 6. Network

### 6.1 Ids

- `NET.ms`: the host makes it in `netAttach` (`troRand(6)`, [0-9a-z]). A guest reads it from `R.ms` (`ID6_RE`); without it, nothing is ranked.
- **Match id `mid = NET.ms + '.' + gid`**. `matchNo` is display only.
- `troDevHash(code)` is FNV-1a 32 of `S.dev + ':' + code`, `% 36^6`, in base 36, padded to 6. It differs per room code, so it does not identify a device across rooms.
- `troRand(n)`: [0-9a-z] from `crypto.getRandomValues`, with `Math.random` as fallback.

### 6.2 Room info `R`

```js
  function roomInfo() {
    const room = NET.screen !== 'game', q = room ? troPractice() : NET.q;
    const R = { gid: NET.gid, ph: NET.ph, m: NET.mode === 'battle' ? 'b' : 'c',
      o: [NET.opts.arena, NET.opts.time, NET.opts.perks ? 1 : 0, NET.opts.intrusion ? 1 : 0, stakeNow()],
      // (counts only in the room phase: the game snapshots stay lean, and the podium gate uses the host's own r.cup)
      p: NET.roster.map((r) => { const e = [r.slot, r.nick, r.char, r.ready ? 1 : 0]; if (room) e.push(r.id === NET.selfId ? TRO.s.t : r.cup); return e; }) };
    if (q === 0) R.ms = NET.ms; else R.q = q;                     // ranked: the series id; practice: why (1 bc, 2 one device)
    return R;
  }
```

- `guestRoom` reads the new fields:
  - `bet = STAKES.includes(R.o[4]) ? R.o[4] : 0`, stored in the rebuilt `NET.opts`. In the room, `NET.ready && bet !== TRO.agreed` sets `NET.ready = false`, `TRO.agreed = -1` and shows the 4 s message (3.2). (Comparing with `TRO.agreed`, not with the previous `NET.opts.bet`: right after joining, that still holds the guest's own 방 만들기 option.)
  - `NET.q = typeof R.ms === 'string' && ID6_RE.test(R.ms) ? 0 : nInt(R.q, 1, 2, 1)` and `NET.ms = NET.q === 0 ? R.ms : ''`.
  - Each roster entry gets `cup: e.length > 4 ? nInt(e[4], -1, TRO_MAX, -1) : -1`, where −1 means unknown and shows as "?".
- Cost: in the game, `o[4]` and `ms` add 17 bytes (275 → 292 worst case). In the room phase, R alone is 316 bytes. `mp-net` and `rv-net` must still report `snapMax ≤ 3400`.
- Anything that changes my count or a roster `cup` sets `NET.roomDirty` (`troSync`, `netMsgIn`), because `NET.R` is cached.

### 6.3 Guest → host

| Message | Content | Host validation | Bytes |
|---|---|---|---|
| `hi` | `{t:'hi', n, c, cu: S.t, d: troDevHash(code)}` | `r.cup = nInt(m.cu, -1, TRO_MAX, -1)`; `r.d = typeof m.d === 'string' && ID6_RE.test(m.d) ? m.d : ''`. Used only for display and the same-device check. | 91 |
| `rd` | `{t:'rd', on, b: stakeNow(), cu: S.t}` | in the room: `r.cup = nInt(m.cu, -1, TRO_MAX, r.cup)`; `r.ready = !!m.on && nInt(m.b, 0, 99, 0) === stakeNow() && canAfford(r)` | 35 |
| `cup` (new) | `{t:'cup', cu: S.t, m?: mid}`, sent after every `tro` received (with `m`) and whenever one of my escrows closes while the session is open | `r.cup = nInt(m.cu, -1, TRO_MAX, r.cup)`; `if (MID_RE.test(m.m)) r.cupM = m.m`; in the room, un-ready if `!canAfford(r)` | 42 |
| `gg` (new) | `{t:'gg', m: mid, on: 1/0}`: "if I am gone at the end, I left on purpose" | `if (TRO.match && m.m === TRO.match.mid) on ? M.gg.add(r.slot) : M.gg.delete(r.slot)`; `return` (no room render) | 30 |

- **When `gg` is sent** (`troGg(on)`), and only while I hold open trophies for a ranked match:
  - `on: 1` in `troSessionEnd('left')`, before `leave()`.
  - `on: 1` on `visibilitychange` to hidden, and right after `troGuestGo` holds while `document.hidden`. A page that is being closed goes hidden before `pagehide`, and net.js closes the session at `pagehide` before the engine's listener runs, so this is the last moment it can be sent.
  - `on: 0` on `visibilitychange` back to visible.

```js
  function troGg(on) {                       // guest: "if I am gone at the end, I left on purpose"
    if (!NET.sess || NET.role !== 'guest' || !TRO.s || !NET.ms) return;
    for (const e of TRO.s.esc) if (e.tab === TRO.tab && e.st === 'open' && e.m.indexOf(NET.ms + '.') === 0) NET.sess.send(NET.hostId, { t: 'gg', m: e.m, on: on ? 1 : 0 });
  }
  const troCupOut = (mid) => { if (NET.sess && NET.role === 'guest' && TRO.s) NET.sess.send(NET.hostId, mid ? { t: 'cup', cu: TRO.s.t, m: mid } : { t: 'cup', cu: TRO.s.t }); };
  const troOpenHere = () => !!TRO.s && TRO.s.esc.some((e) => e.tab === TRO.tab && e.st === 'open');
```

- `gg` only matters for a player who ends up **not** finishing, so a finisher's `gg` is ignored. It moves only the sender's own stake, to the winner. A cut network sends no `gg`.
- New roster entries (`netPeers`) start with `cup: -1, d: ''`. A v4 page without trophies never sends `cu`, so it can only play stake 0.
- The guest's `netReady(on)` refuses to turn on while `!canAfford(me)`. Turning on sets `TRO.agreed = stakeNow()`, and turning off sets it to −1.

### 6.4 Host → guests: the result `tro` (reliable, once)

```js
  { t: 'tro', m: mid, n, s, r: [[slot, place, base, share, kos], ...] }   // one row per finisher; 107 bytes at 4 rows
```

- `netMsgIn`: `if (NET.role !== 'host') { if (m.t === 'tro' && from === NET.hostId) troResultIn(m); return; }`.

```js
  function troResultIn(m) {
    const mid = typeof m.m === 'string' && MID_RE.test(m.m) ? m.m : ''; if (!mid) return;
    const rows = Array.isArray(m.r) ? m.r.slice(0, 4) : [];
    const res = troApply(mid, rows, NET.slots.get(NET.selfId), false);
    troPodium(mid, rows, nInt(m.n, 2, 4, 2), STAKES.includes(m.s) ? m.s : 0, res);   // display only (8.8)
    troCupOut(mid);                                                                   // always: the host's rematch gate
    if (shownOverlay === 'podium') fillPodium();
  }
```

- A `tro` for an unknown mid, a repeated one, or one that arrives too early changes nothing, but still gets a `cup` reply.
- Why a message and not the state: the state is latest-wins and may never show the podium before a quick 한 판 더. A reliable message arrives once, even if it is before the guest's view reaches the podium. It is applied on arrival and animated when the view gets there.

### 6.5 Host hooks

- **`netAttach` (host):** `NET.ms = troRand(6)`, and lower the stake to what the host can cover.
- **`netAgain` (host, online):** after `fn()`, set `NET.q = troPractice()`, `TRO.match = null`, `TRO.lastRes = null`, `TRO.pod = null`.
- **`updateCountdown`, on the frame that shows "시작!": `troHostGo()`.**

```js
  function troHostGo() {
    if (!G.online || G.role !== 'host' || G.gameMode !== 'battle' || NET.q !== 0 || !NET.ms) return;
    const mid = NET.ms + '.' + NET.gid, s = stakeNow(), p = {};
    for (const pl of G.players) {                    // 견습 for the table, from the counts I know right now
      const r = NET.roster.find((q) => q.id === pl.id), t = pl.id === NET.selfId ? TRO.s.t : r ? r.cup : -1;
      p[pl.slot] = t >= 0 && t < LEAGUES[1].min ? 1 : 0;
    }
    TRO.match = { mid, s, n: G.players.length, p, slots: G.players.map((q) => q.slot), gg: new Set() };
    troEscrow(mid, s, G.players.length, 0);          // (false = the host plays this one as practice for itself)
  }
```

- **`endBattle`:** call `troHostResult()` just before `showOverlay('podium')`.

```js
  function troHostResult() {
    const M = TRO.match; TRO.match = null;
    if (!M || !G.online || G.role !== 'host' || M.mid !== NET.ms + '.' + NET.gid) return;   // (none before 시작!)
    const fin = G.podium.order.map((sl) => G.players.find((q) => q.slot === sl)).filter(Boolean)
      .map((pl) => ({ slot: pl.slot, sc: pl.score, k: pl.kos, ko: pl.koed, p: M.p[pl.slot] | 0 }));
    const gl = M.slots.filter((sl) => !fin.some((f) => f.slot === sl) && M.gg.has(sl)).length;
    const rows = troTable(M.n, M.s, fin, gl);
    if (!rows.length) { troClose(M.mid, 'refund', 'void'); troPodium(M.mid, [], M.n, M.s, null, 'void'); return; }
    const res = troApply(M.mid, rows, 0, true);
    if (NET.sess) NET.sess.send('*', { t: 'tro', m: M.mid, n: M.n, s: M.s, r: rows });
    TRO.lastRes = { mid: M.mid, s: M.s };            // the 한 판 더 gate (3.2) waits for each guest's 'cup' of this mid
    troPodium(M.mid, rows, M.n, M.s, res);
  }
  function troCanRematch() {
    const L = TRO.lastRes; if (!G.online || G.role !== 'host' || !L || L.s === 0) return true;
    return TRO.s.t >= L.s && NET.roster.every((r) => r.id === NET.selfId || (r.cupM === L.mid && r.cup >= L.s));
  }
```

- **`hostDropPlayer`** needs nothing new. A leaver is simply missing from `fin`, and `n` stays the count at "시작!".
- **`netToRoom` (host):** if `G.mode !== 'podium'` and this tab holds open trophies for the match, `troClose(mid, 'forfeit', 'abort')`. Then clear `TRO.match` and `TRO.lastRes`, and lower the stake if the host can no longer cover it.
- **`netMsgIn` (host):** the `hi`, `rd`, `cup` and `gg` cases of 6.3. After `cup`, call `troPodiumUI()` when the podium is shown, so the gate re-evaluates.
- **`netClose(why = 'left')`:** `troSessionEnd(why)` runs first. `netLeave(msg, why)` passes the reason through. `netStatusIn('closed', d)` uses `'host_left'` for host_left and `'lost'` for everything else (`'left'` still does nothing). `notInGame` uses `'lost'`. `stopEngine` uses `'reload'`. `toTitle` uses the default.

### 6.6 Guest hooks (all on network events, so a hidden tab works too)

- **`guestHostIn`**, after a snapshot `g` of the current game id is accepted, for a battle (`g.m === 'b'`) that is ranked (`NET.q === 0 && NET.ms`):
  - `g.ph === 'p'` → `troGuestGo(id)`.
  - `g.ph === 'd'` → `troWait(NET.ms + '.' + id)`.

```js
  function troGuestGo(id) {
    if (NET.tr === 'bc' && !TRO.allowBc) return;                       // this browser's tabs share one store
    const s = stakeNow(); if (s > 0 && s !== TRO.agreed) return;      // not the stake I readied for: practice for me
    if (troEscrow(NET.ms + '.' + id, s, G.players.length, NET.opts.time * 60000 - TRO_SLACK_MS) && document.hidden) troGg(1);
  }
```

- **`guestBegin`** (a newer game id): `troWait` every open trophy hold of mine with another mid, `TRO.pod = null`, and for co-op `TRO.run = { at: nInt(g.lp, 0, 99, 0) * LEVELS.length + nInt(g.r, 0, 99, 0), got: 0 }`.
- **`guestToRoom`:** `troWait` every open hold of mine, and `TRO.agreed = -1` (the guest must ready again).

### 6.7 Compatibility (why NET_V stays 4)

- **Host with trophies, guest without:** the guest sends no `cu`, so `r.cup` is −1. It cannot ready for a stake and plays stake 0 as an unranked player whose row it never applies.
- **Host without trophies, guest with:** `R` has no `ms`, so it is practice for the guest.
- Neither direction can lose or mint trophies, so no version bump is needed.

### 6.8 net.js: `leave()` must not drop the last reliable messages

On the room link, `leave(fast)` calls `flush()` while anything is pending, before it sets `R.leaving` and publishes `{x: 1}`. The bye then merges onto a presence that carries the last outbox entries, and receivers read those before they act on `x: 1`. This already holds for bc (the bye is queued after pending reliable messages) and for peer (one ordered channel). Without it, a `gg` sent right before 나가기 is lost on the artifact transport, and the winner of a rage quit gets nothing. Add a case to `tools/net-node-test.js`: a reliable message sent right before `leave()` arrives before the `'left'`.

---

## 7. Flow summary

```
room: stake shown, ready = ready for that stake, start gated by affordability
시작 -> netAgain (gid++, q frozen) -> 3-2-1 (nothing held: leaving is free; a walkover here changes nothing)
"시작!" -> host troHostGo (hold) / guests: first 'p' snapshot -> troGuestGo (hold, own checks)
battle: leave on purpose -> gg + forfeit | hide the tab -> gg on (visible -> off) | link lost -> refund if present
endBattle -> troHostResult: table (gg leavers' stakes in the pot; walkover without gg = void) -> host applies, sends 'tro'
guests: troResultIn -> apply own row once (not before the battle clock) -> 'cup' reply -> podium flights / count-up
한 판 더 -> waits for every guest's 'cup', gated by affordability -> netAgain (new mid)
no result in view (podium / room / next gid) -> 'wait' 15 s -> refund
```

---

## 8. UI contract (per screen)

Shared pieces:
- `.pg-ic` is a pixel icon canvas: 8x8 source, `width: 1.1em; height: 1.1em; image-rendering: pixelated; vertical-align: -0.18em`, `aria-hidden`.
- `.pg-cup` is the trophy icon and `.pg-lg` is the league icon (`--lgc` = `LEAGUES[i].col`). Fill them with `portraitCanvas('', 'trophy', 8)` and `portraitCanvas(String(i), 'lg_', 8)`. An unknown count gets the grey `tintOf` cup and the text "?".
- `troChip(t)` → `<span class="pg-tchip"><canvas lg/><canvas cup/><b>123</b></span>`. It is used in the room and in the friends panel.
- `troSfx(n, o) = unlocked && Snd.call('sfx', n, o)`. It is always local: it never goes through `Snd.sfx`, so it is never echoed and needs no `NO_ECHO` entry.

### 8.1 Title: the 내 트로피 badge (inline on the best-score line)

```html
<p class="pg-best"><span class="pg-best-hi">최고 점수 <b id="pg-title-hi">0</b></span><button id="pg-tro" class="pg-tro" type="button"
  aria-label="내 트로피 30개 · 때밀이 견습 · 내 기록 보기"><canvas id="pg-tro-lg" class="pg-ic pg-lg" width="8" height="8" aria-hidden="true"></canvas><canvas
  class="pg-ic pg-cup" width="8" height="8" aria-hidden="true"></canvas><b id="pg-tro-n">30</b><span id="pg-tro-name" class="pg-tro-name">때밀이 견습</span><i id="pg-tro-new" class="pg-tro-new" hidden></i></button></p>
```

```css
.pg-best { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 0.2em 0.6em; }
.pg-tro { position: relative; font: inherit; display: inline-flex; align-items: center; gap: 0.25em; padding: 0.1em 0.6em 0.08em 0.45em;
  border: 0; border-radius: 999px; cursor: pointer; color: var(--duck); background: rgba(255, 212, 71, 0.12);
  box-shadow: inset 0 0 0 1.5px rgba(255, 212, 71, 0.55); line-height: 1.2; }
/* a ~24px tap target without layout height; it stays inside .pg-best's margins (>= 0.3em) so it never takes taps from the start buttons */
.pg-tro::after { content: ""; position: absolute; inset: -0.3em -0.35em; }
.pg-tro b { font-family: var(--font-sign); font-weight: 400; font-size: 1.1em; margin: 0; }
.pg-tro-name { font-size: 0.8em; color: var(--lgc, var(--cream-dim)); }
.pg-tro-new { position: absolute; top: -0.25em; right: -0.2em; width: 0.5em; height: 0.5em; border-radius: 50%; background: var(--pink); box-shadow: 0 0 0 1.5px var(--ink); }
.pg-tro:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
@container (max-width: 30em) { .pg-tro-name { display: none; } }
@container (max-width: 15.5em) { .pg-best { row-gap: 0.1em; } }   /* the badge wraps under the score there (the card scrolls anyway) */
```

- **Why here:** `.pg-best` is the one line that stays at every `@container` step, and the pill is no taller than its `<b>`. On a 320 px phone (about 24em wide) the line "최고 점수 123,456 · [lg][cup] 30" is about 15em, which fits. The header was rejected: it has about 30 px free.
- `#pg-title-hi` keeps its id (`final-e2e.js` reads it). `.pg-best b` still styles it.
- `syncTroBadge()` runs on `showOverlay('title')` and from `troSync()`. The NEW dot shows while `S.seen === 0`. A click calls `openRec()`.

### 8.2 내 기록 overlay `#pg-rec` (in `#pg-screen`, added to `OVERLAYS` as `'rec'`)

```html
<section id="pg-rec" class="pg-ov" aria-labelledby="pg-rec-h" hidden>
  <div class="pg-card pg-rec-card">
    <h2 class="pg-h2" id="pg-rec-h">내 기록</h2>
    <div class="pg-rec-lg"><canvas id="pg-rec-lgart" class="pg-lg" width="8" height="8" aria-hidden="true"></canvas>
      <div class="pg-rec-lgtx"><b id="pg-rec-lgname">때밀이 견습</b><span id="pg-rec-next">다음 리그까지 30개</span>
        <i class="pg-rec-bar" aria-hidden="true"><i id="pg-rec-fill"></i></i></div>
      <b class="pg-rec-n"><canvas class="pg-ic pg-cup" width="8" height="8" aria-hidden="true"></canvas><span id="pg-rec-n">30</span></b></div>
    <dl class="pg-rec-stats">
      <dt>최고 트로피</dt><dd id="pg-rec-best">30</dd><dt>배틀</dt><dd id="pg-rec-win">0승 / 0판</dd>
      <dt>뽀득 KO</dt><dd id="pg-rec-ko">0</dd><dt>혼자 최고 점수</dt><dd id="pg-rec-hi">0</dd>
    </dl>
    <ol id="pg-rec-ladder" class="pg-rec-ladder" aria-label="리그"></ol>  <!-- 7 x <li class="got|on"><canvas lg/><span class="pg-sr">온탕 단골 · 150개부터</span></li>, aria-current on mine -->
    <p id="pg-rec-note" class="pg-rec-note"></p>
    <div class="pg-row"><button id="pg-rec-close" class="pg-btn" type="button" data-primary>닫기</button></div>
  </div>
</section>
```

- **Layout:**
  - `.pg-rec-card` scrolls like `.pg-title-card` (`overflow-y: auto`, no scrollbar).
  - `.pg-rec-lg` is a row: a 2.6em league icon, then the name, the "next" line and the bar, then the count in `--font-sign`.
  - `.pg-rec-stats` is a 4-column grid (dt dd dt dd), font 0.88em, 2 rows.
  - The ladder is 7 icons of 1.5em. Icons you have reached are full colour, the rest are at 35 % opacity, and your current one has a duck-colour outline.
  - About 17em tall at phone `--fs`. At `@container (max-height: 19.5em)` the ladder and the note hide. At `@container (max-width: 21em)` the stats become 2 columns and the ladder hides.
- **Texts:**
  - "다음 리그까지 N개", or "최고 리그예요!" with a full bar in the top league.
  - The win line is "W승 / G판". 혼자 최고 점수 is `G.hiscore` (no new storage).
  - The note, first match wins:
    1. storage blocked or read-only → "이 브라우저에서는 기록이 저장되지 않아요"
    2. `S.g === 0 && S.de === 0` → "처음 선물로 트로피 30개를 받았어요! 친구와 배틀할 때 걸어 봐요"
    3. otherwise "오늘 목욕 보너스 6/20개 · 배틀은 제한이 없어요"
- **Behaviour:**
  - `openRec()` sets `S.seen = 1` (through `troMut`) and calls `showOverlay('rec')`. G.mode stays `'title'`, and the demo runs behind.
  - `onKeyDown`: when `shownOverlay === 'rec'`, Escape, Enter, jump and shoot close it. Check this before the title branch and before `togglePause`. `primaryAction` also starts with `if (shownOverlay === 'rec') { closeRec(); return; }`.
  - `closeRec()` calls `showOverlay('title')` and focuses `#pg-tro`. The title's ←→ picking is already gated on `shownOverlay === 'title'`.

### 8.3 Friends panel

After `.pg-mychar` in `.pg-field`: `<span id="pg-mytro" class="pg-mytro" aria-label="내 트로피 30개">` + `troChip`. Players see their count before they host or join.

### 8.4 Room

- **Options** (`buildOpts`, battle only, in both `#pg-host-opts` and `#pg-room-opts`):
  - A 5th grid row: `<span>트로피 걸기</span><div class="pg-seg pg-bets" role="radiogroup" aria-label="트로피 걸기">`.
  - The buttons have `data-bet` 0 ("안 걸기"), 5, 10, 20 and 50. Each nonzero button gets a `.pg-cup` before its number and `aria-label="트로피 10개씩 걸기"`.
  - A click calls `netSetOpts({bet})` and `uiSfx('stake')`. `netSetOpts` accepts only `STAKES` values ≤ the host's count, and a change un-readies every guest.
  - `.pg-bets button { flex: 1 1 auto; min-width: 0; padding: 0.3em 0.45em; }` keeps the 5 buttons on one row in a 320 px panel. The default `min-width: 4.5em` would wrap them.
  - `syncOpts` sets `aria-checked`. It disables a button when `!editable || bet > TRO.s.t`, with the title "내 트로피가 모자라요".
- **Badges** next to `#pg-room-mode`:
  - `<span id="pg-room-bet" class="pg-badge pg-bet" hidden><canvas cup/>10개씩</span>`, shown when the stake is above 0.
  - `<span id="pg-room-prac" class="pg-badge pg-prac" hidden>연습 경기</span>`, shown when `q ≠ 0`.
  - CSS: `.pg-bet` uses `var(--duck)` on ink; `.pg-prac` uses `#8a9b98`.
- **Player cards** (`.pg-pc`):
  - After `.pg-pc-char`, add `<span class="pg-pc-tro">` + `troChip(cup)`. An unknown count shows "?".
  - A non-host who `!canAfford` gets the tag `<span class="pg-pc-tag is-short">트로피 부족</span>`.
  - `aria-label` gains ", 트로피 123개, 온탕 단골".
  - The `_key` must include `cup`, the stake and `q`.
- **Guest summary** (`#pg-room-sum`): the battle parts gain "트로피 10개씩" or "트로피 안 걸기", plus "연습 경기" when `q ≠ 0`.
- **Rules** (`#pg-room-rules`), put before the two existing lines. The numbers come from `troTable` with n = the roster size, clamped to 2..4, and distinct places:
  - Battle, `q` 0, stake 0: "트로피 경기: 1등 +14 · 2등 +6 · 3등 -2 · 4등 -6"
  - Battle, `q` 0, stake > 0: "모두 10개씩 걸고 1등이 다 가져요: 1등 +44 · 2등 -4 · 3등 -12 · 4등 -16"
  - Battle, `q` 0: "견습 리그는 등수로 잃지 않아요 · 판 중간에 나가면 꼴찌로 쳐요"
  - `q` 1: "연습 경기예요: 이 브라우저의 탭끼리는 트로피가 바뀌지 않아요"
  - `q` 2: "연습 경기예요: 같은 기기에서 들어온 친구가 있어요"
  - Co-op, `q` 0: "끝까지 갈수록 모두 트로피를 받아요 (잃지 않아요)"
- **Message (`#pg-room-msg`) and buttons:**
  - A guest who is short gets the ready button disabled, with the text "트로피 부족", and the message "트로피가 모자라요 · 방장에게 걸기를 낮춰 달라고 해요".
  - A host with a short guest gets "트로피가 모자란 친구가 있어요 · 걸기를 낮춰 주세요", and `#pg-go` is disabled. If the host itself is short: "내 트로피가 모자라요 · 걸기를 낮춰 주세요".
  - For 4 s: "걸기를 낮췄어요: 10개씩" (host, after an automatic lowering) or "걸기가 바뀌었어요: 10개씩 · 다시 준비해 주세요" (guest). With stake 0, "10개씩" becomes "안 걸기".
  - When `TRO.last` is 10 s old or less with h > 0: in the room, "걸었던 트로피를 돌려받았어요" (refund) or "이번 판은 진 걸로 쳤어요" (forfeit, e.g. the host's abort), for 4 s. In the friends panel, the same text is joined to `NET.err` with " · " (for example "연결이 끊겼어요 · 걸었던 트로피를 돌려받았어요"), or shown alone when `NET.err` is empty.

### 8.5 Countdown

```js
  // updateCountdown: showBanner(String(3 - t / 60), troCountSub(), 60, 'count' + troCountCls())
  const troCountSub = () => (!G.online || G.gameMode !== 'battle' ? '' : NET.q ? '연습 경기 · 트로피 없음' : stakeNow() ? '트로피 ' + stakeNow() + '개씩 걸어요!' : '트로피 경기');
  const troCountCls = () => (!G.online || G.gameMode !== 'battle' ? '' : NET.q ? ' prac' : stakeNow() ? ' bet' : '');
```

- CSS: `.pg-banner.count.bet #pg-banner-sub { color: var(--pink); font-size: 1.1em; }` and `.pg-banner.count.prac #pg-banner-sub { color: var(--cream-dim); }`.
- The banner reaches guests in `g.bn`. Its sub is at most 90 characters, and its class is letters and spaces only (at most 24), which is already enforced. The trophies are actually held on the next frame ("시작!", 5.1).

### 8.6 Battle HUD

No change in v1.

### 8.7 Leaving confirmations

- `confirmTwice` also arms when `troOpenHere()` is true, meaning this tab holds open trophies for a ranked match. That covers guests too. Its armed label comes from the call site:
  - Guest 나가기 (`pg-pause-home`): "한 번 더 누르면 나가요 · 트로피 -16"
  - Host 방으로 (`pg-pause-home`): "한 번 더 누르면 모두 방으로 · 내 트로피 -16"
- The number is the held `h`, and the " · …" part is left out when h is 0.
- Podium buttons hold nothing, so their labels are unchanged.

### 8.8 Podium

- **Data** (`troPodium(mid, rows, n, s, res, kind)` → `TRO.pod`):
  - `rows` is a Map slot → `{place, net}`, where `net = nInt(base, B[n−1], B[0], 0) + nInt(share, 0, s·n, 0) − s`. My own slot uses `res.net`; without `res` (practice for me) my block keeps its score.
  - `kind` is one of `'win'`, `'draw'` (≥ 2 rows, all with place 1 and base 0), `'walk'` (1 row), `'void'` or `'prac'`.
  - It also holds the flight state: `t0`, `fl`, `landed`, `flip` and `promoAt`.
  - It is set by `troHostResult` and `troResultIn`, and cleared by `netAgain`, `guestBegin` and `idleWorld`. For an online practice match (`NET.q ≠ 0`), `troPodiumUI()` sets `{kind: 'prac'}` when the podium is shown.
- **Timeline** (`t` = `G.podium.t`; guests get it as `g.pt`):
  - **t < 75:** unchanged; the blocks show rank and score.
  - **T0 = max(75, t when the result arrived).** If the match was staked, every block with net < 0 sends `k = clamp(ceil(−net / 10), 1, 6)` cups to the 1st-place animal(s), round-robin across a tie for 1st. At stake 0, every losing block sends one cup. A draw sends none.
  - Cups start 5 f apart and fly 30 f from the block's top centre to the target's head. The path is `lerp` plus a −24 px sine arc, and the sprite alternates frames 0/1 every 4 f.
  - Each landing plays `troSfx('tro_fly', {n: landed % 6})` and makes a 4-spark gold burst. There are at most 18 cups.
  - **Flip**, when the last cup lands (or at T0 if there are none): each block's second line (top+21) changes from the score to cup + the signed net, counting up from 0 over 20 f with ease-out. Colours: `#7fe08f` for > 0, `#ff8fb1` for < 0, `#c4b99f` for 0. The widest case, "+164", is 8 + 1 + 23 = 32 px, exactly the block width. The scores stay visible in the HUD bar.
  - **My count-up ends:** `tro_up` or `tro_down` (none for 0). If I was promoted, 20 f later the title tag turns into "승급! 온탕 단골" (class `pg-promo`) and `promote` plays.
  - **Reduced motion:** no cups and no count-up; the lines change at T0.
- **DOM** (`#pg-podium`, top div):
  - `<h2 class="pg-podium-title">결과 발표!<span id="pg-podium-tag" class="pg-podium-tag" hidden></span></h2>`. The tag text is "무승부", "기권승", "연습" or "승급! …". CSS: `font-size: 0.45em; vertical-align: 0.3em; margin-left: 0.35em; padding: 0.1em 0.55em; border-radius: 999px;`, pink for 승급, `#8a9b98` for 연습. It is inline in the title, so it adds no height and stays clear of the winner's name tag.
  - `<p id="pg-podium-note" class="pg-wait" hidden>` is shown to the host only, after the existing guest wait note. It carries the rematch-gate texts (3.2) or "친구가 나가서 이번 판은 무효예요" for a void result. The host never sees the guest wait note, and a guest never sees this one, so there is one line at most.
  - The guest wait note reads "방장이 다음 판을 고르고 있어요 · 다음 판도 10개씩" when the stake is above 0.
  - `#pg-podium-again` is disabled while `!troCanRematch()`; `primaryAction` checks the same. `troPodiumUI()` updates the button and the note on podium show, on `cup` and on roster changes.
  - `#pg-podium-sum` (sr-only, `aria-live`) gets ", 내 트로피 +14개, 지금 44개" appended, or "연습 경기라 트로피는 그대로예요".

### 8.9 Game-over and ending cards (목욕 보너스)

- **Markup:**
  - A 4th row in `#pg-over .pg-stats`: `<dt>트로피</dt><dd id="pg-over-tro"><canvas class="pg-ic pg-cup"/><span>+3</span> <small>33개</small></dd>`. `#pg-ending`'s dl gets the same with `pg-end-tro`. Both rows are hidden unless `troBonus()` returned `show`.
  - When the day cap took the bonus, the row reads "+0" with `<small>오늘 보너스 끝</small>`.
  - A promo chip: `<span id="pg-over-promo" class="pg-new pg-promo" hidden>승급! 뽀득 새내기</span>` right after `#pg-over-new`, sharing its line. The ending has `#pg-end-promo` after `#pg-end-sub`.
- **Animation:** 0.5 s after the card opens, the delta pops (`pg-pop`) and `tro_up` plays if give > 0. A promotion adds `promote` 0.6 s later.
- **Fit:** the row adds about 1.3em. Under `@container (max-height: 22em)`, `#pg-over .pg-stampcard-foot` hides, so the solo card keeps its current height on a 320 px phone. The test in 15.1 checks this.

---

## 9. Sprites (`src/sprites.js`, existing palette keys; fallbacks in `fallbackFrame`)

| Name | Size | Frames | Use |
|---|---|---|---|
| `trophy` | 8x8 | 2 (front, turned) | Every DOM cup, the podium lines, the flying cups |
| `lg_0` .. `lg_6` | 8x8 | 1 each | League icons: badge, room, friends chip, 내 기록 (drawn at 2.6em there) |

Draft rows (the art pass may redraw them; the sizes and frame counts are binding):

```
trophy[0]  trophy[1]  lg_0 견습   lg_1 새내기  lg_2 단골   lg_3 고수   lg_4 달인   lg_5 명인   lg_6 왕
.kkkkkk.   ..kkkk..   ..kkkk..   .....kk.    .w...w..    .kk..kk.    ..kkkk..    FFFFFFFF    ........
YkLLYYkY   ..kLYk..   .ktTtTk.   ....kcwk    ..w...w.    kwWkkWwk    ..kwwk..    .kOOOOk.    k..kk..k
YkLYYykY   ..kLYk..   .ktTtTkk   .....kk.    kkkkkkkk    kwwwwwwk    .kkLLkk.    ..kOOk..    Yk.YY.kY
.kYYYyk.   ..kYyk..   .ktTtTtk   .kkkkkk.    kLYYYYyk    kWEEEEWk    kYLYYYyk    ...kk...    YYkYYkYY
..kYyk..   ...kk...   .ktTtTtk   kPPpppqk    kYYYYYyk    kEkEEkEk    kYYYYYyk    ...kk...    YYYYYYYY
...kk...   ...kk...   .ktTtTk.   kPppppqk    .kYYYyk.    kEPEEPEk    kYYYYYyk    ..kwOk..    YRYLLYRY
..kYyk..   ..kYyk..   .kwwwwk.   kqqqqqqk    ..kkkk..    .kEEEEk.    .kYYYyk.    .kOOOOk.    kyyyyyyk
.kkkkkk.   ..kkkk..   ..kkkk..   .kkkkkk.    ........    ..kkkk..    ..kkkk..    FFFFFFFF    .kkkkkk.
```

- **game.js:**
  - `REQUIRED.trophy = 2` and `REQUIRED['lg_' + i] = 1`; `SPR_SIZE` gets `[8, 8]` for each. These lines go after `REQUIRED`/`SPR_SIZE`, with `LEAGUES` defined above them (2).
  - `fallbackFrame`: `trophy` uses `pixelRows` of the rows above with the {k, Y, L, y} colours. `lg_i` is a filled circle in `LEAGUES[i].col` with an ink outline.
- **tools/check-sprites.js:**
  - Add `trophy: [2, 8]` and `lg_0..lg_6: [1, 8]` to REQ.
  - Check that every `lg_i` differs from the others and from `crown`, and that `trophy` uses `Y`.
  - Add a contact-sheet row with the cup and the 7 leagues on dark and on each theme.

---

## 10. Sound (`src/audio.js`: 5 new sfx, all played locally through `troSfx`)

| Name | Sound | When |
|---|---|---|
| `stake` | Two quick metallic clinks (p25 1568 → 2093 Hz, 40 ms apart) over a soft wooden knock like `stamp`'s low end | The trophies are held with a stake; the host taps a stake button |
| `tro_fly` (o.n 0..5) | A short bright "팅" (triangle at mf(84 + 2n), 70 ms, with a sine an octave up) | Each cup landing on the podium |
| `tro_up` | A rising 4-note arpeggio (C6 E6 G6 C7, 45 ms steps) plus a shimmer of noise | My change > 0 (podium, result cards) |
| `tro_down` | A soft descending pair (G5 → D5, triangle, 120 ms), quiet (v 0.12) | My change < 0 |
| `promote` | A fanfare of about 0.9 s: snare pickup, then Bb C D F with a held bell-like high F (like `ticket`, but brass-voiced p25 and shorter) | 승급! |

`tools/audio-node-test.js`: add the 5 names (and `tro_fly` with n 0..5) to its sfx list, then rebaseline the counts.

---

## 11. Korean strings (`TRO_TEXT`, top constants; warmed in `setupDOM`)

```js
  const TRO_TEXT = LEAGUES.map((l) => l.name).join(' ') +
    ' 내 트로피 내 기록 트로피 개 개씩 개부터 최고 트로피 배틀 승 판 뽀득 KO 혼자 최고 점수 리그 다음 리그까지 최고 리그예요! 닫기' +
    ' 오늘 목욕 보너스 배틀은 제한이 없어요 이 브라우저에서는 기록이 저장되지 않아요 처음 선물로 트로피 30개를 받았어요! 친구와 배틀할 때 걸어 봐요' +
    ' 트로피 걸기 안 걸기 트로피 부족 연습 경기 트로피가 모자라요 방장에게 걸기를 낮춰 달라고 해요 트로피가 모자란 친구가 있어요 걸기를 낮춰 주세요 내 트로피가 모자라요' +
    ' 걸기를 낮췄어요: 걸기가 바뀌었어요: 다시 준비해 주세요 트로피 경기: 모두 개씩 걸고 1등이 다 가져요: 1등 2등 3등 4등' +
    ' 견습 리그는 등수로 잃지 않아요 판 중간에 나가면 꼴찌로 쳐요 연습 경기예요: 이 브라우저의 탭끼리는 트로피가 바뀌지 않아요 같은 기기에서 들어온 친구가 있어요' +
    ' 끝까지 갈수록 모두 트로피를 받아요 (잃지 않아요) 개씩 걸어요! 연습 경기 · 트로피 없음 결과 발표! 무승부 기권승 연습 승급!' +
    ' 방으로 가서 걸기를 바꿔요 친구가 나가서 이번 판은 무효예요 방장이 다음 판을 고르고 있어요 다음 판도 개씩 오늘 보너스 끝' +
    ' 한 번 더 누르면 나가요 한 번 더 누르면 모두 방으로 걸었던 트로피를 돌려받았어요 이번 판은 진 걸로 쳤어요 ? + - / · : %';
```

- `setupDOM` appends `' ' + TRO_TEXT` to both `#pg-fontwarm` spans, next to `V3_TEXT`. Do **not** concatenate it into `V3_TEXT`'s definition; keep both in the top block so neither line can hit a TDZ error.
- Every visible string in 8.1–8.9 comes from this list. Strings built from fragments (`'트로피 ' + s + '개씩 걸어요!'`, the rules line, "다음 리그까지 N개") use only syllables listed here. aria-labels, titles and sr-only text are not rendered with the web font and need no warming.

---

## 12. Edge cases

| Case | Behaviour |
|---|---|
| Someone leaves during 3-2-1 | Nothing was held. In a 1v1, `hostDropPlayer` → `endBattle` → no `TRO.match` → no result. |
| Guest 나가기 mid-match | Confirm twice ("… 트로피 -16"), then `gg` and a forfeit. Its stake goes to the winner. |
| Guest closes the tab or presses F5 mid-match | The page goes hidden first (`gg` on), then `pagehide` forfeits. On the next load the count is already right. |
| Guest's phone switches apps and the link drops | Hidden: `gg` on. Coming back within 30 s, or still hidden, means away, so it is a forfeit. The host counts it as left on purpose. |
| Guest's link drops while it is watching | Refund. The host sees a leaver without `gg`: last place in the table, its stake not in the pot. |
| Host leaves or closes the tab mid-match | Guests get `host_left` → refund. The host forfeits (at once for 로비로; at pagehide for a tab close). |
| Host 방으로 mid-match | The host forfeits (its confirm says so); guests `'wait'` 15 s → refund. During 3-2-1 it costs nothing. |
| Host's own network dies (peer) | All guests drop without `gg` → walkover void → the host is refunded. Guests: refunded if they were watching. |
| Artifact hot reload mid-match | `reload` → refund for the reloading page; the others see `host_left` (refund) or a leaver without `gg`. |
| Rematch (한 판 더) | New gid, new mid, held again at its "시작!". After a staked result it waits for every guest's `cup` and is blocked while anyone is short. |
| A result arrives after the next match began (stake 0, a quick rematch) | The old hold is `'wait'` since `guestBegin`; the `tro` still applies within 15 s, otherwise refund. |
| A result arrives before the battle clock could have run (hostile host) | Not applied; it ends as `'wait'` → refund. |
| Ties / full tie | Averaged place points (rounded); a tie for 1st splits the pot (floor); all tied → 무승부 (0 each, or the leavers' stakes split). |
| Someone at 0 trophies | Can play stake 0 (견습: placement never costs). Cannot ready for any stake. 목욕 보너스 refills. |
| Count changed between ready and 시작! (another tab) | Holds what it has: `min(t, s + 6)`. If `t < s`, it plays practice for itself. The floor at 0 keeps every result legal. |
| Stake changed while guests are ready | Everyone is un-readied on both sides, and the guest is told. An in-flight `rd` with the old stake is refused. |
| Host's count drops below the stake | `netToRoom` lowers the stake and says so. |
| Guest's real count differs from its report | The host gates on the report. The guest's own client holds and settles what it really has. |
| Two tabs of one browser, same room | q 1 on bc, q 2 on room/peer (same `dev` → same per-room hash) → practice for everyone. |
| Two tabs of one browser, two rooms | Separate holds (owned by `tab`); every change re-reads the store, so neither overwrites the other's count. |
| A tab crashed with trophies held | Another load closes the hold after 15 min (open → forfeit, wait → refund). |
| Day changes mid-session | `troToday()` is read at award time; `S.de` resets on a new day. |
| Storage blocked / newer schema on disk | In memory for the session / read-only fresh store; 내 기록 says so; nothing is overwritten. |
| Unreadable or hand-broken store | A fresh store (gift 30, new `dev`). |
| 2회차 | A new run (its own 15) under the daily 20, offline and online alike. |
| Battle stats in practice | Not counted: stats move only where trophies do. |

---

## 13. Integrity: what each party can do

| Who | Can | Cannot |
|---|---|---|
| Hostile host (modified page) | Give me last place: −(stake + 6) per match, the same as beating me, and not faster than the battle clock. Gift me trophies. Claim practice. Refuse to pay (refund after 15 s). Keep rematching (I can leave at the podium for free). | Take more than I hold. Apply a result twice, or for a match I did not hold for. Change my players or stake (my escrow is the truth). Raise the stake after I readied (I only hold the stake I agreed to). Make me hold over bc. Learn my device id (per-room hash only). |
| Hostile guest | Lie about its count (it then risks less than its stake; the others lose at most what an honest winner would take). Skip its own hold. Send `gg` or `cup` (moves only its own stake, or blocks a rematch, which the host avoids with 방으로). | Change anyone else's count. Block results (reliable host → guest messages). See or copy another player's device hash (the host never sends it on). |
| Local user | Edit localStorage; play extra browser profiles against each other (about +10..14 per real 2-minute match, or a fresh profile's gift through stakes). | Nothing beyond their own count. Without accounts this is the limit, and it is stated in the code comment. |
| Anyone | Dodge a loss by cutting their own network while keeping the tab visible and the OS online (refund, like any dropped link). | Win by cutting the network: a walkover without `gg` is void. |

---

## 14. Debug / test API (`PG.debug.tro`)

```js
  PG.debug.tro = {
    state(),            // {t, best, lg, bl, w, g, ko, day, de, seen, esc, dev, mem, ro, key, tab, q, ms, agreed, match, lastRes, pod, run}
    set(o),             // merge into the store (clamped by troParse) and save
    reset(),            // a fresh store (the gift)
    ns(name),           // key 'ppogeul-trophy-' + name, then troLoad() (same-origin iframes share localStorage)
    allowBc(on),        // rank matches over 'bc' (tests only; never from the URL)
    fast(on),           // skip the minimum match time in troApply (tests that end battles with setTimeLeft)
    today(n),           // fake local date YYYYMMDD (null = real)
    table(n, s, fin, gl),     // the pure rules
    apply(m),           // feed a 'tro' as if from the host (replay / hostile tests)
    end(why), away(),   // troSessionEnd(why); mark away now
    expire(),           // run every pending 'wait' refund and troStale() as if the time had passed
  };
```

---

## 15. Test plan

### 15.1 New `src/tests/trophies.js`

It runs offline in virtual time and prints "TRO PASS|FAIL …" and "TRO DONE pass=N fail=M".

1. **Store:**
   - A fresh store has 30, v 1 and an 8-character `dev`, and round-trips.
   - Clamps: `t: 1e9` → 99999, negatives → 0, bad mids or tabs dropped, more than 8 holds trimmed.
   - `v: 2` → read-only, and the key is unchanged afterwards. Unreadable JSON → fresh.
   - With localStorage stubbed to throw → `mem`, and no exceptions.
2. **Read-modify-write:**
   - Write `t: 77` into storage behind the page's back, then trigger any change (open 내 기록): the count builds on 77, not on the stale copy.
   - A `storage` event updates the badge.
3. **Rules:**
   - `table()` for n 2/3/4 × all 5 stakes matches the table in 3.1, and so does every tie and leaver row.
   - Over random fins: Σshare ≤ pot and ≥ pot − 3; every net ≥ −(s + 6); every net ≤ 164.
   - m = 1 with gl = 0 → `[]`.
4. **Apply:**
   - Hostile rows (base 999 / −999, share −5 / 9999, place 9, slot missing) are clamped.
   - An unknown mid, a second apply and an early apply (without `fast`) change nothing.
   - 견습 protection, the floor at 0, the stats w/g/ko/best/bl and 승급 once all work.
5. **Holding and ending:**
   - Holds s + 6 (s in 견습), once per mid; refuses when t < s.
   - Every row of 5.4: `end('lost')` → refund; `away()` + `end('lost')` → forfeit; host_left, reload → refund; left → forfeit; `'wait'` + `expire()` → refund.
   - A foreign hold older than 15 min → forfeit (open) or refund (wait); a young one is left alone; this tab's holds are never touched by `troStale`.
6. **목욕 보너스:**
   - Solo game over in the 4th 탕 → +1. The ending is capped at 15. The daily cap of 20 holds across runs and resets with `today()`.
   - Re-showing the card pays nothing more. 2회차 starts a new run.
   - Offline local co-op and the attract demo give nothing.
7. **UI:**
   - The badge's text, aria and NEW dot. `#pg-rec` opens and closes by button, Enter, Escape and Z, without starting a game, and focus returns to the badge.
   - At 256x224 1x, 2x and a 320x568 phone: `.pg-title-card`, `.pg-rec-card` and `#pg-over .pg-card` have `scrollHeight ≤ clientHeight`. The badge shares the `.pg-best` line at 23em wide or more. The badge's `::after` box does not overlap `#pg-start`.
   - The over/ending row (+N, "오늘 보너스 끝") and the promo chip.
8. **Fonts:** every visible trophy string's syllables appear in `#pg-fontwarm`'s text.

### 15.2 New `src/tests/trophies-net.js`

3 iframes over bc, served by `tools/serve.js`. Every frame calls `tro.ns('f' + i)`, `tro.allowBc(true)`, `tro.fast(true)` and `tro.set({t: 100})`. It prints "TRONET … DONE".

1. `hi` carries `cu` and `d`. The host roster and R (room phase) show every count; R has `o[4]` and `ms`. In-game R is ≤ 292 bytes for these nicks, and `snapMax ≤ 3400` during a battle.
2. **Stake and consent:**
   - The host sets 20 and a guest set to 10 cannot ready (button disabled; a forced `rd` is refused).
   - With a guest ready at 5, the host switches to 10: the guest is un-readied on both sides and gets the message. An `rd` with `b: 5` arriving after the switch is refused.
   - A forged R with `o[4] = 50` at 시작! (patched host) → the guest holds nothing.
3. Two frames sharing one ns → q 2: badge, rules, countdown sub, and nobody's count changes.
4. **시작:**
   - Nothing is held during 3-2-1. A guest leaving then costs nothing.
   - At "시작!" every frame holds s + 6 exactly once. The sub read "트로피 10개씩 걸어요!".
5. **Finish (`setTimeLeft(1)`):**
   - One `tro` per guest, and every count matches `table()`. Every guest answered with `cup` + `m`.
   - Replaying with `apply()` changes nothing.
   - Without `fast` on a guest, the same early result is not applied → `'wait'` → refund.
   - A hostile host (patch `troTable` to give slot 1 base −999 / share 0) → slot 1 loses exactly s + 6.
   - Podium: the `pod` rows match on all frames; cups spawn for the losers; the lines flip.
6. **Rematch:** a new mid and a new hold. With a guest set below the stake, 한 판 더 and `primaryAction` are blocked, and the host's note shows.
7. **Leavers:**
   - A guest leaves mid-match with 나가기: `gg`, forfeit (count −(s + 6), g+1), and its stake is in the winner's pot.
   - A guest's link is cut (close its session without `gg`): refund for it, its stake not in the pot.
8. The host leaves mid-match: guests are refunded (`host_left`).
9. The host aborts (`mp.toRoom()` mid-match): the host forfeits; guests are refunded after `expire()`.
10. **1v1 walkover:** the guest leaves with 나가기 → host +10 + s. The guest's link is cut instead → void, and the host is refunded.
11. Without `allowBc` → q 1: no count changes anywhere.
12. **Co-op:** a game over in the 4th 탕 gives every frame the same +1 and no losses. Practice co-op gives nothing.

### 15.3 Tools and old tests

- `tools/net-node-test.js`: a reliable message sent right before `leave()` arrives before `'left'` on all three transports (6.8).
- `tools/check-sprites.js`: section 9. `tools/audio-node-test.js`: section 10.
- `tools/run-all.js`: add `trophies` (virtual time, `doneZero('TRO')`) and `trophies-net` (rt, http, `doneZero('TRONET')`).
- Re-run and fix where needed:
  - `mp-net.js` and `rv-net.js`: R size and `snap.worst`. Their bc battles are practice (q 1), so no counts change.
  - `final-v3.js`: the countdown banners now carry subs; its checks of the main texts must still pass.
  - `final-e2e.js`: `#pg-title-hi` still parses.
  - `ux-review.js` and `shot-phone.js`: the title card fit with the badge.
  - `ux-roomrow.js`: the room cards gain the trophy line.
- Screenshots to look at with the Read tool:
  - the title (1x, 2x, phone)
  - 내 기록
  - the room with a stake and a 트로피 부족 tag
  - the countdown
  - the podium mid-flight and after the count-up
  - the over card with the promo chip

---

## 16. Files touched (implementation checklist)

- **`src/game.js`:**
  - Top constants (2, 11).
  - A new section `// ---- v4 trophies (트로피)` after the word pops: `TRO`, the store (4), the rules (3.1, 3.3, 3.5), holding / closing / applying / session end / wait / stale (5), the host and guest hooks (6.5, 6.6), the podium data and drawing (8.8), the cards (8.9), the badge and 내 기록 (8.1, 8.2).
  - Hooks:
    - `boot` (`TRO.tab`, `troLoad` before `setupDOM`) and `stopEngine` (`netClose('reload')`).
    - `loop` (`awayAt` on a raw `dt > 1000`).
    - Listeners: `visibilitychange` (awayAt + `troGg`), `pagehide` (`troSessionEnd('left')`), `pageshow`, `resume`, `online`, `offline` and `storage`.
    - `newGame`, `newCoop`, `continueLoop` (run start); `resetGame` (battle: no run); `toTitle`, `idleWorld` (clear the run and the podium data).
    - `updateCountdown` (sub + `troHostGo`), `endBattle` (`troHostResult`), `drawPodium`, `fillPodium`.
    - `showOverlay` (title: badge + `troStale`; rec; over/ending: `troBonus` and the row; podium: `troPodiumUI`), `OVERLAYS` + `'rec'`, `primaryAction`, `onKeyDown`, `confirmTwice`, `netCardLabels` (guest wait note).
    - `setupDOM` (ids, clicks, `TRO_TEXT` warm-up).
    - `netAttach` (`ms`, `hi`), `netClose(why)`, `netLeave(msg, why)`, `netStatusIn`, `notInGame`, `netPeers` (new entries), `netAgain`, `netToRoom`.
    - `roomInfo`, `guestRoom`, `guestHostIn`, `guestBegin`, `guestToRoom`, `netMsgIn`.
    - `canStart`, `netSetOpts`, `netReady`, `buildOpts`, `syncOpts`, `renderRoom`, `renderFriends`.
    - `NET.opts.bet` (default 0).
    - `PG.debug.tro`.
- **`src/net.js`:** room link `leave()` flushes pending reliable entries before the bye (6.8), with a line in the header comment.
- **`src/page.html`:**
  - The `.pg-best` markup, the `#pg-rec` section, `#pg-podium-tag`, `#pg-podium-note`, `pg-room-bet`, `pg-room-prac`, `pg-mytro`, `pg-over-tro`, `pg-end-tro`, `pg-over-promo`, `pg-end-promo`.
  - CSS for `.pg-ic`, `.pg-tro*`, `.pg-tchip`, `.pg-mytro`, `.pg-bets`, `.pg-bet`, `.pg-prac`, `.pg-pc-tro`, `.pg-pc-tag.is-short`, `.pg-rec-*`, `.pg-podium-tag`, `.pg-promo`, `.pg-banner.count.bet/.prac`, with the container queries of 8.1, 8.2 and 8.9.
- **`src/sprites.js`:** section 9. **`src/audio.js`:** section 10.
- **Tests and tools:** section 15.
