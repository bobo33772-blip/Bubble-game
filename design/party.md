# 뽀득뽀득 목욕탕: 파티 (Mario Party style minigames) v1 — design spec

Status: design, ready to implement as ONE PR on `feat/party`. Code is referenced by function name and section, never
by line number (`src/game.js` is edited by other passes all the time). Every function named here exists today unless
it is marked **new**.

The user asked for "마리오파티게임 처럼". This PR is the minigame party: 2-4 friends play 3 or 5 short minigames (판)
in a row on one fixed screen each, collect placement points, and finish on the podium. A later PR adds a Mario Party
board (주사위, 보드판 칸, 황금 오리) that plays these same minigames between board turns, so the minigame layer here is
built as a self-contained "round with a placement result" that a board can drive (section 2, sketch in section 15).

---

## 0. Decisions in one table

| Question | Decision |
|---|---|
| Mode | A third online mode **파티** next to 같이 하기 and 배틀. Same room flow: room code, 친구 초대, 열린 방, logged-in only on the deploy (`netGated` covers it unchanged). 2-4 players (`canStart`: >= 2). |
| Engine mode | `G.gameMode` stays **`'battle'`** during a party, with `G.party` (the sequencer) and `G.mini` (the minigame now) set. All 39 `G.gameMode === 'battle'` sites (rival capture, `tp` claims, the magazine, `EMPTY_RULE.battle`, `SHOT_CAP`, blink-ends-on-blow, snapshots' `lc` / `am`) then work for the party for free; the few things a party does differently check `G.mini` / `G.party` (section 7). |
| Length | Host option **판 수: 3판 / 5판**, default 3. One 판 = one minigame. |
| Rotation | A shuffled bag of the games that fit the player count, refilled when empty; never the same game twice in a row; for 3판 with 3 eligible games each plays once. 3 players have 2 eligible games (no 거품 축구), so their 3판 is A B A and 5판 A B A B A (3.2). |
| Before each 판 | A card (5 s, DOM overlay `#pg-party`, over the closed bath doors): `1판 / 3판`, the game name, one how-to line, the win line, the controls (keyboard or touch), the team line (축구), the running scoreboard. Then the usual 3-2-1. |
| Placement points | 1st is always 4 and last always 0: 2 players **4 / 0**, 3 players **4 / 2 / 0**, 4 players **4 / 2 / 1 / 0**. Ties share the best place of the group and its points, the next place is skipped (1, 1, 3, 4: 4, 4, 1, 0). Teams (2v2 축구) are a tie by construction: winners 4 + 4, losers 1 + 1; a draw gives everyone 4. |
| Final standing | Total points; tie-break 1: more 1등 (shared 1등 counts); tie-break 2: the better place in the last 판; still tied: a shared place (공동 N등) on the podium. |
| Minigames | **물 차오르기** (75 s, last one dry wins; survivors at time-up share 1st), **왕관 뺏기** (60 s, most crown time), **거품 축구** (60 s, 1v1 or 2v2, most goals; not for 3 players). Normal move / jump / shoot / drop-through controls, every animal's kit as in battle (with the room's 능력 끄기 and 연사), on one fixed screen. |
| Bubbles on rivals | One rule for all three: a capture is a **short no-KO trap** (`MINI_TRAP` 90 f, mash out faster as in battle); touching a rival's prison only frees them (no 뽀득 KO, no points). 물: the prison sinks toward the water. 왕관: the holder drops the crown. 축구: the shot also pushes the ball. |
| Arenas | Two new closed arenas in `PG.PARTY_ARENAS` (`levels.js`): **물 차는 대욕장** (5 one-way tiers) and **거품 축구장** (open field, a goal under a crossbar on each side). 왕관 뺏기 reuses the 4 battle arenas. |
| Reward | **비누 코인 only**, by final rank, **no trophies** (no stake, no holds, no `tro`). Battle's anti-farm ideas: practice (`NET.q !== 0`: tabs of one browser, one device's store) pays nothing; a 판 pays only if I blew >= 2 bubbles in it; the rank bonus only for a finished party of >= 2 (a walkover pays participation only); >= 5 bubbles and >= 60 s played overall; every award through `coinGive` (the day's soft cap 400 then half, the day bonus). Per minute it pays less than a battle. |
| Network | Host-authoritative as battle. **No new message type.** Guests keep sending bodies, `shot`, `tp`, `mash`; the host's snapshot gains `g.pa` (party), `g.mg` (minigame), `g.pl` (podium places), `g.ak` (arena list) and two phases (`a` card, `r` result). `hi` gains `pa: 1`; `R.m` gains `'p'`; `R.o` gains `o[7]` (판 수). |
| Old pages | `NET_V` stays 4. An older page cannot enter a party: the host only counts a guest ready in a party room when its `hi` said `pa`, and the room says why (`새로고침 필요`). An older page as host never sends `'p'`. Lobby and invites list a party room only on new pages (6.2). |
| Out of scope | The board, offline / one-screen party UI, trophies or 내 기록 stats for parties, new sprites / sounds / music, bots, a 3-player 축구, mid-party joins (section 14). |

---

## 1. Ground truth from the code (what this builds on)

| Thing | Code | Consequence for the party |
|---|---|---|
| Battle start | `netStart` → `netAgain(fn, true)` → `newBattle(list, opts, matchNo)` → `resetGame('battle', list)` + `startArena(idx)` + `beginCountdown()`. `netAgain` bumps `NET.gid`, freezes `NET.q = troPractice()`, sets `G.online`, `showOverlay(null)`, `netSnapshot(true)`. | A party is **one game id**: `netStart` calls `newParty` inside `netAgain`. All 판 of one party share `NET.gid`; 한 판 더 at the final podium is a new gid (a new party). |
| The world step | `update()` switches on `G.mode` (`title`, `playing`, `dying`, `transition`, `countdown`, `podium`). `updateWorld(ins)` runs players, enemies, bubbles, `lagTrapCheck` / `lagClaims` (battle online), then `updateBattle()`, and ends a battle when `G.battle.left <= 0`. | Two new modes `'card'` and `'result'` (new `update()` cases). The minigame tick goes at the top of `updateBattle` (after the timer lines), its end check where `endBattle` is called. |
| Timer | `G.battle = {arena, total, left, intruded, enemyT, powerT}`; `updateBattle` counts `left`, ticks `countdown` in the last 3 s and shows `10초 남았어요!`; the snapshot carries `g.tl`; `applyView` rebuilds `G.battle` from it when `g.m === 'b'`; `drawHUDBattle` prints `m:ss`. | Each 판 sets `G.battle` with its own `total` (`intruded: true`, `enemyT` / `powerT` 1e9): timer, warnings and the HUD clock are reused as is. |
| Capture / KO | `playerTrapCheck` / `lagClaims` → `catchPlayer` → `trapPlayer(v, b)`; `updateTrapped` frees after `PTRAP_FRAMES` (240) with `PTRAP_MASH` per press; `popBubble` on a `'player'` bubble calls `knockOut(v, by, b)` for a touch by someone else. Prisons drift with `floatMove` toward `G.gather`. | Party: trap length `MINI_TRAP`, `popBubble` releases instead of `knockOut`, `floatMove` sinks prisons in 물 차오르기, `trapPlayer` drops the crown in 왕관 뺏기. |
| Out of play | `p.out` exists (co-op "sits out"), `alive()` / `free()` / `canTouch` / `drawPlayer` / name tags honour it, `snapPlayers` sends it as flag 16 and `guestPlayers` reads it. `takeOver` hands a guest its animal back only when flag 64 (free) is set. | 물 차오르기's elimination is `p.out = true` + `bumpEp(p)`: the guest's control goes remote by itself and the animal disappears on every screen with no new wire field. `bodyAt` (via `placePlayer`) clears it for the next 판. |
| Scores | `addScore` adds to `p.score`; battle keeps only personal scores; empty pops pay 10, stuns cost 100. The `P` rows carry `score` (index 8); `fillPodium` and `drawPodium` print `p.score`. | In a party **`p.score` is the party points total** (set only by the sequencer; `addScore` returns at once while `G.party`). Guests get the points through the existing rows; the podium and its screen-reader line show them unchanged. |
| Levels | `normLevel(L, idx)` **opens a 4-column wrap gap (cols 14-17) when the floor row has none**, returns only its own fields, and computes `gapX` from the gap. `loadArenas` wraps `normLevel` for `PG.ARENAS`. `physBody` / `landTile` land on a closed floor row; `wrapY` never fires there. | Party arenas need `closed: true` honoured by `normLevel` (no gap, `gapX: W / 2`), and their own fields (`rise`, `goals`, `sides`, `ball`) carried past it by a new `loadPartyArenas`. The validator rejects a closed map today (wrap gap 2-6) and needs a party branch. |
| Guest view | `guestBegin` builds the players and calls `resetGame(g.m === 'b' ? 'battle' : 'coop')` and `loadView(idx, g.m === 'b')`; `applyView` reloads the view when `g.r` or "arena?" changes; `guestPhase` shows overlays for `gameover` / `ending` / `podium`. `guestHostIn` runs trophies when `g.m === 'b'` and **co-op coins (`coinGuestIdx`) whenever `g.m !== 'b'`**. | Every `g.m` test must learn `'p'`: `'p'` means battle rules + party; `coinGuestIdx` must become `g.m === 'c'` only, or a party guest would pay co-op 탕 coins. `loadView` gets a list kind (`'l' | 'b' | 'p'`). |
| Trophies | `troHostGo` (from `updateCountdown`'s 시작! frame), `troHostResult` (from `endBattle`), `troGuestGo` / `troWait` (guest, `g.m === 'b'` only), `stakeNow()` is 0 unless `NET.mode === 'battle'`, `troCountSub` / `troCountCls` write the 2 / 1 countdown lines, `troPodiumUI` writes the podium tag / note. | `stakeNow()` is already 0 in a party room. `troHostGo` gets a `G.party` guard (it tests `gameMode`, which is battle); party never calls `endBattle`; guests never run trophies for `'p'`; the two countdown lines and the podium UI get party branches. |
| Coins | `coinShot` counts my blows in `CO.bshots` (battle); `coinGo()` at 시작! resets it; `coinBattle` is the pure battle table, `coinBattleNow` pays once per gid into `CO.pod` which `coinPodLine` / `coinPodSr` show; `coinGive(a, day)` is the only writer (soft cap `COIN.soft` 400 a local day then half, the day bonus `COIN.day`). `coinPrac()` is `NET.q !== 0` online. | The party reuses `CO.bshots` as the per-판 blow count (reset at each 판's 시작! by the existing `coinGo`), a new pure `coinParty`, and `CO.pod` so the podium's coin line works unchanged. |
| Room | `roomInfo()` sends `o: [arena, time, perks, intrusion, stake, monsters, rapid]` (o[5], o[6] were appended the same way: "an older guest just ignores it"); `guestRoom` reads with defaults that keep an older host's behaviour. `netSetOpts`, `buildOpts` / `syncOpts`, `renderRoom`, `renderFriends`, `renderGames` and 17 `NET.mode === 'battle'` tests decide what is shown. | `o[7]` = 판 수, `R.m = 'p'`, a `NET.mode === 'party'` branch at each of the 17 sites (7.6 lists them), a helper `pvp()` for "battle or party" (the kit options). |
| Lobby / invites | `net.js` `MODES = ['coop', 'battle']`: a lobby entry with another mode is skipped, an advertise with another mode becomes `'coop'`. Invites `invites/{to}/in/{from} {code, mode, nick, at}`: `ivInvite` writes `NET.mode === 'battle' ? 'battle' : 'coop'`, `ivTake` drops a mode other than coop / battle, `firestore.rules` checks `d.mode in ['coop', 'battle']` (and `src/tests/cloud.js` models that rule). | `MODES` gains `'party'` (old pages keep skipping it: they could not play it anyway); invites carry `'party'`, the rules and their model accept it. |
| Korean text | The canvas font (`FONT_SRC`) has digits, A-Z and `- x ! : . + /` only; Korean is DOM (banners, `wordPop`, tags, cards). Strings are warmed in `#pg-fontwarm` from `setupDOM`; constants read at load must live in the top constants block (a later `const` is a TDZ error that stops the engine booting, design/trophies.md 1). | The HUD shows digits and sprites only; every party string is in a new `PARTY_TEXT` in the top constants block, warmed next to `TRO_TEXT`. |
| Screen | 256x224, HUD strip 0-16 (`PF_TOP`), seat panels at x 1 / 53 / 153 / 205, the timer between. On a 320 px phone the stage is about 24em x 21em; in-screen overlays must fit 20em tall (trophies.md 1). | The card is a compact `.pg-card` that fits 20em; the HUD keeps battle's layout. |

---

## 2. The minigame layer (`G.mini`): a round with a placement result

The sequencer (section 3) and later the board (section 15) only ever call these. A minigame never touches the
scoreboard, the card, coins or the podium.

### 2.1 Constants (top constants block, next to the battle ones, before `V3_TEXT`)

```js
  // ---- 파티 (design/party.md): constants up here - PARTY_TEXT and the font warm-up read them at load
  const PARTY_V = 1;                          // hi's pa: the minigames this page plays (the board PR needs 2)
  const PARTY_ROUNDS = [3, 5];
  const PARTY_PTS = { 2: [4, 0], 3: [4, 2, 0], 4: [4, 2, 1, 0] };   // by place; n = players at that 판's 시작!
  const PARTY_F = { card: 300, result: 180, early: 60 };             // frames: the card, the result beat, last one standing
  // each minigame: c its wire code, secs, ar the arena (['p', i] PG.PARTY_ARENAS[i], ['b'] a battle arena), fits(n),
  // team (축구), and the card texts (name, how, win, bub: what a bubble does in it)
  const MINI = {
    water: { c: 'w', secs: 75, ar: ['p', 0], fits: (n) => n >= 2, name: '물 차오르기',
      how: '물이 차올라요! 높이높이 올라가요 · 물에 닿으면 탈락', win: '마지막까지 남으면 1등 · 끝까지 남은 친구는 모두 1등',
      bub: '거품: 친구를 잠깐 가둬요 (가둔 거품은 물로 가라앉아요)' },
    crown: { c: 'c', secs: 60, ar: ['b'], fits: (n) => n >= 2, name: '왕관 뺏기',
      how: '왕관을 쓰고 오래오래 버텨요 · 왕관을 쓰면 조금 느려요', win: '왕관을 가장 오래 쓴 친구가 1등',
      bub: '거품: 왕관 쓴 친구를 가두면 왕관이 떨어져요' },
    ball: { c: 'b', secs: 60, ar: ['p', 1], fits: (n) => n === 2 || n === 4, team: true, name: '거품 축구',
      how: '큰 거품 공을 몸이나 거품으로 밀어서 골대에 넣어요', win: '골을 더 많이 넣은 팀이 이겨요',
      bub: '거품: 공을 밀어요 · 상대를 잠깐 가둬요' },
  };
  const MINI_IDS = ['water', 'crown', 'ball'];
  const MINI_TRAP = 90, MINI_SINK = 0.3, WATER_SLACK = 3, CROWN_SLOW = 0.85, CROWN_NOPICK = 90, CROWN_SLACK = 4;
  const BALL = { r: 11, g: 0.12, maxFall: 3, drag: 0.995, roll: 0.985, wall: 0.7, floor: 0.55, maxV: 5,
    body: 1.2, nudge: 0.4, shot: 1.8, drop: 1.0, float: 0.5, slam: -3.4, slack: 3, goalF: 120, kickF: 45, sfxGap: 8 };
```

### 2.2 State

```js
  G.mini = { id, c, n0,          // which game; players at its 시작! (the points table)
    t,                           // playing frames so far
    endAt,                       // frame it ends early (-1: no; 물: the last one standing)
    // 물:  wl (surface y, px), outs: [[slot, frame]]
    // 왕관: cr {x, y, vx, vy, onGround, holder (-1), noPick (-1), noUntil}, held {slot: frames}
    // 축구: ball {x, y, vx, vy, kick (frames until it drops)}, goals [L, R], team {slot: 0 | 1}, goalT, kickBy {slot: frame}
  };
```

`resetGame` sets `G.mini = null; G.party = null;` (so do `toTitle` and `idleWorld`, beside their `G.battle = null`).
`G.arenaKind` (**new**, `'b' | 'p'`) says which list `G.arena` indexes.

### 2.3 Lifecycle (host; on a guest every field comes from the snapshot, 6.5)

| Function (**new**, own section "party" after `rematch`, before "word pops") | Does |
|---|---|
| `miniLoad(id)` | Picks the arena (`['p', i]`, or for `['b']` a random battle arena that is not the last one a crown 판 used), loads it with the shared body of `startArena` (refactor that body into **new** `loadArenaLV(L, i, kind)`: `LV`, `MAP`, `G.rid++`, `buildWater`, `buildRoundCanvas`, `G.gather`, every list cleared, `G.shotLog = []`), places the players (2.4), sets `G.battle = { arena: i, total: secs * 60, left: total, intruded: true, enemyT: 1e9, powerT: 1e9 }`, `G.mini = { id, c, n0: G.players.length, t: 0, endAt: -1, ...init }`. No enemies, no power-ups, no boss. |
| `miniTick()` | One playing frame of the game (4.1-4.3), called at the top of `updateBattle` right after the timer / `10초 남았어요!` lines, then `return` (no enemies, power-ups or intrusion). It does not run while `G.mode !== 'playing'`. |
| `miniOver()` | `G.battle.left <= 0 \|\| (G.mini.endAt >= 0 && G.frame >= G.mini.endAt)`. `updateWorld`'s battle end line becomes `if (G.party) { if (G.mode === 'playing' && miniOver()) partyResult(); return; }` before the battle one. |
| `miniPlaces()` | `Map(slot -> place)` for the players present, 1-based, competition ranking (ties share the best place): `rankBy(rows)` over a key per game (4.x). |
| `miniSnap()` / `miniView(mg, mg1, t)` | The game's wire array (6.4) / a guest's mirror of it. |
| `miniDrop(pl)` | A player left mid-game (crown dropped where it stood; 축구 plays on short-handed). |
| `miniDraw()` / `miniHud(p, x)` | The world layer (water band, crown, ball, goal nets) and a seat panel's 2nd line (9.4). |

```js
  // competition ranking: rows [{slot, k}] (bigger k is better) -> Map slot -> place; equal k share the best place
  function rankBy(rows) {
    const s = rows.slice().sort((a, b) => b.k - a.k || a.slot - b.slot), out = new Map();
    s.forEach((r, i) => out.set(r.slot, i && s[i - 1].k === r.k ? out.get(s[i - 1].slot) : i + 1));
    return out;
  }
```

### 2.4 Spawns

- 물: `LV.players[k]` for the k-th present player in slot order (4 floor spots).
- 왕관: the battle arena's spawns with `startArena`'s rotation by `G.matchNo` (the party sets `G.matchNo = G.party.i`).
- 축구: by team: `LV.sides[team][j]` (j = 0, 1 within the team, slot order). `placePlayer` bumps every `ep`, so each guest
  takes its animal back at the new spot (`takeOver`). Everyone blinks `START_INV` as in battle.

---

## 3. The party sequencer (`G.party`)

### 3.1 Flow and timing (host)

```
netStart (mode party) -> netAgain -> newParty(list, opts)        resetGame('battle', list); G.party = {...}; partyNext()
partyNext(): i++; i == n -> partyFinal(false); else miniLoad(plan[i]); G.mode = 'card'; showOverlay('party')   5 s
updateCard(): at PARTY_F.card -> showOverlay(null); beginCountdown()                                         3-2-1
updateCountdown "시작!" (troHostGo returns for a party; coinGo resets CO.bshots for this 판)                   play 60-75 s
miniOver() -> partyResult(): places -> points -> G.mode = 'result', banner, word pops                        3 s
updateResult(): at PARTY_F.result -> partyNext()
partyFinal(walk): standings -> G.podium -> 'podium', coins, showOverlay('podium')
```

A 3판 party is about 3 x (5 + 3 + 60..75 + 3) s = about 3.8 minutes, 5판 about 6.4.

```js
  G.party = { n: 3 | 5, opts: {perks, rapid, rounds}, i: -1, plan: ['water', 'crown', 'ball'],
    pts: {slot: n}, wins: {slot: n}, last: {slot: place}, gain: {slot: n},   // gain: the last 판's points (the card's "+4")
    t: 0,                         // frames in the current card / result
    done: false, walk: false };   // final podium reached; ended early because < 2 players were left
```

- `newParty(list, opts)`: `G.opts = { arena: -1, time: 3, perks: opts.perks !== false, monsters: false, intrusion: false, rapid: opts.rapid === true, rounds }`, then `resetGame('battle', list)` (it sets `G.perksOff` from `G.opts.perks`), `G.lives = 0`, `G.party = {...}`, `plan = partyPlan(n, rounds)`, every `p.score = 0`, `coinPartyStart()`, `partyNext()`.
- `updateCard()` / `updateResult()` (**new** `update()` cases `'card'` / `'result'`): `G.party.t++`, `updateFx()`; nothing moves.
- `partyResult()`: `places = miniPlaces()`; for each present player `gain = PARTY_PTS[clamp(n0, 2, 4)][place - 1] || 0`, `pts += gain`, `p.score = pts`, `wins += place === 1`, `last = place`; `coinPartyRound()`; `G.mode = 'result'`; release every trap; banner (9.5); `wordPop(p.x + 8, p.y - 6, place + '등 +' + gain, p.color)` over each present animal (an out animal's at its last spot). Sound `'win'`.
- `rematch()` gains `if (G.party) { newParty(list from G.players, G.party.opts); return; }` so `netAgain(rematch)` from the podium button / `primaryAction` / `PG.debug.mp.again` starts a new party.

### 3.2 Rotation

```js
  // the 판 list: a shuffled bag of the games that fit n, refilled when empty, never the same game twice in a row
  function partyPlan(n, rounds, from) {
    const ok = MINI_IDS.filter((id) => MINI[id].fits(n)), out = (from || []).slice();
    let bag = [];
    while (out.length < rounds) {
      if (!bag.length) {
        bag = ok.slice(); for (let i = bag.length - 1; i > 0; i--) { const j = ri(0, i); [bag[i], bag[j]] = [bag[j], bag[i]]; }
        if (out.length && bag.length > 1 && bag[0] === out[out.length - 1]) [bag[0], bag[1]] = [bag[1], bag[0]];
      }
      out.push(bag.shift());
    }
    return out;
  }
```

- 2 or 4 players: 3판 = one order of the three (each once); 5판 = that order plus two of a fresh bag whose first is not the 3rd.
- 3 players: water and crown only, so A B A / A B A B A. There is no way to play each once in 3판 with two games, and
  never-twice-in-a-row wins; the room rules line says 축구 needs 2 or 4 players.
- **Why 축구 is out for 3 players** (and not 2v1 or a 3-goal field): the screen has two sides, so a third goal would sit in
  the ceiling or the floor, where the ball falls or floats by gravity rather than by play; 2v1 needs a handicap (a bigger
  goal, a keeper rule) that kids cannot read off the screen, and its placement would be "two share 1st" whenever the pair
  wins. Leaving it out keeps every 판 a fair free-for-all.
- `partyReplan()` when the player count changes (a leaver, 3.4): `plan = partyPlan(nNow, n, plan.slice(0, i + 1))`
  (played 판 kept, the rest re-drawn for the new count, the next still not equal to the current).

### 3.3 Final standing

```js
  function partyStandings(P, slots) {          // -> [{slot, place}] best first
    const s = slots.slice().sort((a, b) => P.pts[b] - P.pts[a] || P.wins[b] - P.wins[a] || (P.last[a] || 9) - (P.last[b] || 9) || a - b);
    const same = (a, b) => P.pts[a] === P.pts[b] && P.wins[a] === P.wins[b] && (P.last[a] || 9) === (P.last[b] || 9);
    const out = []; s.forEach((sl, i) => out.push({ slot: sl, place: i && same(s[i - 1], sl) ? out[i - 1].place : i + 1 }));
    return out;
  }
```

`partyFinal(walk)`: `G.podium = { order, t: 0, te: 0, pl: places }` (pl **new**: the place per podium block, shared
places repeat), `G.mode = 'podium'`, `G.party.done = !walk`, `G.party.walk = walk`, clear bubbles / traps as
`endBattle` does (and `bumpEp` everyone), `setMusic('podium')`, `Snd.sfx('win')`, `coinPartyNow()`, `showOverlay('podium')`.
`drawPodium` prints `pd.pl ? pd.pl[i] : i + 1` on the blocks; `updatePodium` is unchanged.

### 3.4 Leavers and the host

- `hostDropPlayer(r)` gets `if (G.party) { partyDrop(pl); return; }` before its battle line (the animal is removed first,
  as today). `partyDrop`: `miniDrop(pl)`; fewer than 2 players left (any mode but `'podium'`) → `partyFinal(true)`
  (a walkover: the one left is 1등, participation coins only); else `partyReplan()` when the next game no longer fits.
- A leaver's points go with it: standings, the card and the podium list present players only. Its places in later 판
  are simply missing (the points table stays the one for `n0`, so in a 4-player 판 with a leaver the others get 4 / 2 / 1).
- 2v2 축구 with a leaver: the team plays the rest of that 판 short-handed (`team` keeps its member).
- The host's 방으로 mid-party is `netToRoom` as today: the party ends, nobody is paid (no podium). The host leaving: the
  guests' `host_left` path, nobody is paid.

---

## 4. The three minigames

### 4.1 물 차오르기 (water rising)

**Arena**: `PG.PARTY_ARENAS[0]` 물 차는 대욕장 (5.1): closed floor and ceiling, one-way tiers at rows 21, 17, 13, 9, 5
(tops y 184 / 152 / 120 / 88 / 56), each 4 rows above the last and within 2-3 columns, two 4-tile shelves on top.

**The water** is a new full-width layer, not tile water: `wl` is the surface y. Its schedule is data in the arena:

```js
  rise: { y0: 222, warn: 2, steps: [[5, 9, 206], [19, 23, 174], [33, 37, 142], [47, 51, 110], [61, 65, 78]] }   // [from s, to s, level y]
```

- `waterAt(f)` (**new**, pure): linear inside a step, flat between, `y0` before the first. `miniTick` sets `wl = waterAt(t)`.
- Each step drowns exactly one tier and leaves the next dry (out rule below): 206 covers the floor (feet 216), 174 row
  21, 142 row 17, 110 row 13, 78 row 9; the top shelves (56) stay dry to the end. A step climbs 32 px in 4 s (8 px/s):
  a tier goes under about 3 s into its step, after the 2 s warning.
- `warn` s before each step: banner `물이 차올라요!` / `더 높이!` (class `hurry`), sfx `'hurry'`; the last step says
  `마지막 물결!`. From the 4th step the music is `'hurry'`.

**Out**: every playing frame, for each present player not out and not KO'd: `p.y + 16 > wl + WATER_SLACK` (the feet are
3 px under the surface) → `waterOut(p)`: release its trap, `p.out = true`, `bumpEp(p)`, `outs.push([slot, G.frame])`,
`splash(p.x + 8, wl, 2, 12)`, `Snd.sfx('splash')`, `wordPop(p.x + 8, wl - 10, '탈락!', p.color)`. A remote player is judged
by its latest reported body (`hostInputs` copies it into the host's player each frame), so what counts is the guest's own
physics; the surface the guest sees runs at most a few frames behind the host's (well under 1 px at 8 px/s), and the
3 px slack is in the guest's favour.

- **Every animal is out on touch, the duck too**: tile water floats the duck (`floatBody`) and lets the otter swim; this
  layer is not tile water (no `WATER` cells), so nobody floats. Otherwise the duck could never lose. Every other kit
  is unchanged (glide, double jump, dash and slide all help climbing; the frog's hanging eggs are traps on the shelves).
- **Prisons sink**: `floatMove(b)` for `b.kind === 'player'` while `G.mini.id === 'water'`: `b.vx *= 0.9; b.vy = MINI_SINK;`
  (no drift to `G.gather`), then `clampBubble`. 90 f x 0.3 = 27 px: about one tier. A prison whose bottom reaches the water
  (`b.y + 16 > wl`) pops (`popBubble(b, null, 'self')`); the freed animal is then in the water: out. This is the
  "knock them down" move. A rival touching a prison only frees it (no KO).
- **Last one standing**: when at most one present player is not out (and `n0 >= 2`), `endAt = G.frame + PARTY_F.early`.
- **Places**: `k = 1e12` for everyone not out (they share 1st), else the frame they went out (later is better; the same
  frame shares).
- My own out on a guest: `miniView` sees my `p.out` turn on → a local banner `탈락! N등` / `친구들을 구경해요` (N from
  `outs`), `NET.ctl` is already remote (`takeOver`). While waiting for the host's verdict, `guestSelf` freezes my input
  (`NO_INPUT`) for at most 30 frames once my feet are `WATER_SLACK` under the surface I draw ("가라앉는 중"), so the animal
  never walks on under the water; if the host does not call it out, input comes back.

### 4.2 왕관 뺏기 (crown grab)

**Arena**: one of the 4 battle arenas (random, never the arena of the previous crown 판), their spawns and gather.
Kits as in battle (the 냉온탕 hot tub still gives the capy its shield, which blocks one capture).

- **The crown** `cr` is a 16x16 body in the player convention (`physBody(cr)` with gravity, one-way landings, `wrapY`
  through the drain). At 시작! it appears at `G.gather` (centre, under the lid) with `왕관이 나타났어요!` and sfx
  `'powerup'`, and falls onto the centre stage, equally far from every spawn.
- **Pick up**: a free crown (`holder < 0`) is taken by the first free player (`canTouch`) whose body touches
  `cr.x + 2, cr.y + 4, 12 x 12` (host-local exact, remote with `CROWN_SLACK` 4 px); several in one frame: the nearest
  centre. `noPick` (the player who just dropped it) cannot take it before `noUntil`. `wordPop('왕관!')`, sfx `'stamp'`.
- **Holding**: the crown rides on the holder's head (`crown` sprite 8x8 at `headTop(p) - 9`); `held[slot]++` every playing
  frame; the holder walks at `CROWN_SLOW` (0.85, `updatePlayer`'s walk factor; a guest knows the holder from `g.mg`), jumps
  and blows as usual.
- **Drop**: `trapPlayer(v, b)` on the holder (a capture, an otter droplet, a frog egg) → the crown flies out:
  `cr = {x: v.x, y: v.y - 8, vx: v.x + 8 < b.x + 8 ? -1.2 : 1.2, vy: -2.6}`, `holder = -1`, `noPick = v.slot`,
  `noUntil = G.frame + CROWN_NOPICK`. `wordPop('떨어졌다!')`, sfx `'pop'`. The holder leaving: the crown drops where it was.
  The capy's shield taking the capture (`catchPlayer` → `useShield`) keeps the crown.
- **Places**: `k = held[slot]`. 0 s for everyone is a 4-way shared 1st (nobody touched it: everyone gets 4).

### 4.3 거품 축구 (bubble soccer)

**Arena**: `PG.PARTY_ARENAS[1]` 거품 축구장 (5.2): closed, an open field, a crossbar over each goal (row 20, cols 2-5 /
26-29), goal mouths under them (rows 21-24, x 16-40 / 216-240).

**Teams**: 1v1 one each. 2v2 by the standing before the 판 (points, then slot): 1st + 4th on the left, 2nd + 3rd on the
right (before any points: slots 0 + 3 vs 1 + 2). The card says it; the left team defends the left goal and scores on the
right one.

**The ball** (host only; centre coordinates, `r` 11, drawn 24 px with `giant_bubble`), one step per playing frame after the
players and bubbles (`ballStep`, **new**):

1. `vy = min(vy + BALL.g, BALL.maxFall)`, `vx *= BALL.drag` (`BALL.roll` too while on the floor).
2. Move x, then y, against the walls (x 16..240), the ceiling (`CEIL_Y`), the floor (216) and every `'#'` cell of the map
   (the crossbars) **solid from all sides** (circle vs tile boxes, the overlap pushed out along the shallow axis): walls
   and bars bounce at `BALL.wall`, the floor at `BALL.floor` (under 0.6 px/f it rests). The ball never wraps.
3. **Bodies**: each player that can touch (`canTouch`) whose body box `x + 2, y + 2, 12 x 14` (grown by `BALL.slack` 3 px
   for a remote body) overlaps the ball: push the ball out along the normal n, then `v += n * (max(0, (pv - v) . n) * BALL.body
   + BALL.nudge)`; speed capped at `BALL.maxV`. Bodies are never pushed back by the ball, so nobody's own physics changes
   and a guest's prediction stays exact. A sfx `'bounce'` at most every `sfxGap` frames per player. Fast kits kick
   hard by themselves (penguin slide, otter dash), with no special code.
4. **Bubbles**: any of a player's own `'empty'` bubbles touching the ball (`dist < r + 7`) pops (`popBubble(b, null,
   'self')`, its kit colours) and pushes: in flight along its velocity (`BALL.shot`, an otter droplet or a hanging frog egg
   `BALL.drop`, a floating one along the centre line `BALL.float`). A capture-phase bubble that meets the ball first is
   spent on it.
5. **The capy's slam**: `quake(pl, x, y)` gains: the ball inside its box → `vy = min(vy, BALL.slam)` (a header for free).
6. **Goal**: centre x < 34 and centre y > 184 (left goal: a point for the right team), centre x > 222 and y > 184 (right
   goal). Then `goals[t]++`, `goalT = BALL.goalF`, the ball bursts (`burst`, `shake(3)`, sfx `'clear'`), banner `골!` /
   `왼쪽 팀 1 : 0`, the clock stops while `goalT > 0`; then everyone is placed at their team's spawns (`placePlayer`) and
   the ball drops from the centre top (128, 64) after `BALL.kickF` frames.
7. Safety: after the step the centre is clamped inside the field (an impossible state is never sent).

- Rival capture stays on (a short no-KO trap: catch the striker in front of your goal).
- **Places**: `k = goals[team[slot]]`: the winning team shares 1st, the losers share the next place (2v2: 4, 4, 1, 1;
  1v1: 4, 0); a draw shares 1st for everyone.

---

## 5. Arenas (`src/levels.js`: `PG.PARTY_ARENAS`, after `PG.ARENAS`)

Both are mirror symmetric (col c ↔ 31 − c, checked), 26 x 32, closed (row 0 and row 25 all `#`), dry. `theme` any of
the 5. The header comment of `levels.js` gets a `PG.PARTY_ARENAS` paragraph in the style of the arenas'.

### 5.1 물 차는 대욕장 (`key: 'water'`)

```js
    {
      key: 'water', name: '물 차는 대욕장', theme: 1, closed: true,
      map: [
        '################################',
        '##............................##',
        '##............................##',
        '##............................##',
        '##............................##',
        '##.....####..........####.....##',
        '##............................##',
        '##............................##',
        '##............................##',
        '##..###......######......###..##',
        '##............................##',
        '##............................##',
        '##............................##',
        '##......####........####......##',
        '##............................##',
        '##............................##',
        '##............................##',
        '##..####.....######.....####..##',
        '##............................##',
        '##............................##',
        '##............................##',
        '##....######........######....##',
        '##............................##',
        '##............................##',
        '##............................##',
        '################################',
      ],
      players: [{ col: 4, row: 24 }, { col: 27, row: 24 }, { col: 10, row: 24 }, { col: 21, row: 24 }],
      gather: { col: 15, row: 2 },
      rise: { y0: 222, warn: 2, steps: [[5, 9, 206], [19, 23, 174], [33, 37, 142], [47, 51, 110], [61, 65, 78]] },
    },
```

Every tier is 4 rows up from the one below and has a standable cell within 2-3 columns of it (floor → 21: 4 rows; 21 →
17 overlap / 2 cols; 17 → 13 adjacent / 2; 13 → 9 2 / 2; 9 → 5 adjacent / 3).

### 5.2 거품 축구장 (`key: 'ball'`)

```js
    {
      key: 'ball', name: '거품 축구장', theme: 0, closed: true,
      map: [ '################################', 19 x '##............................##',
             '######....................######',                  // row 20: the crossbars (cols 2-5, 26-29)
             4 x '##............................##', '################################' ],
      sides: [[{ col: 11, row: 24 }, { col: 7, row: 24 }], [{ col: 20, row: 24 }, { col: 24, row: 24 }]],   // [left team, right team]
      players: [{ col: 11, row: 24 }, { col: 20, row: 24 }, { col: 7, row: 24 }, { col: 24, row: 24 }],
      goals: [{ c0: 2, c1: 4, r0: 21, r1: 24, line: 40 }, { c0: 27, c1: 29, r0: 21, r1: 24, line: 216 }],
      ball: { x: 128, y: 64 },
      gather: { col: 15, row: 3 },
    },
```

(Written out row by row in the file; the shorthand above is only for this doc.) The crossbar top (y 176) is 5 rows over
the floor: out of a normal jump's reach, a cat's 2단 점프 can stand on it as a keeper. The goal is 3 columns deep so the
22 px ball can get more than half past the goal line.

### 5.3 Engine side

- `normLevel(L, idx)`: `if (!gap.length && !L.closed)` around the gap opening; `gapX: gap.length ? ... : W / 2`.
- **New** `loadPartyArenas()` (called from `loadArenas`): each entry → `Object.assign(normLevel(Object.assign({}, A, { arena: true, enemies: [], boss: null, special: undefined }), i), { key, closed: true, rise, goals, sides, ball })` with the shapes validated (numbers clamped, `steps` sorted, at most 8). A missing or broken entry gets a built-in closed fallback (an open field with the water tiers / the crossbars), like `fallbackArena`.
- `buildRoundCanvas` already draws no drain / shower where there is no gap. The goal nets and the water band are drawn
  per frame by `miniDraw` (section 10), not baked.

### 5.4 `tools/validate-levels.js`

A party branch (`PG.PARTY_ARENAS`, `--party N` for one): the same cell, shape and spawn rules as the battle arenas,
except: a closed ceiling and floor are required (no wrap gap) and the intruder box / enemy spawn rules do not apply;
mirror symmetry is exact (no gap exception); the four spawns are mutually reachable (the existing BFS without the wrap
edge). 물: every tier is reachable from the floor, and for every `rise` step the tier it drowns is the highest one with its
top below `level + WATER_SLACK`, with one more dry tier above it (so each step drowns one tier and the shelves stay dry at
the end); the steps do not overlap and end before `MINI.water.secs` (75). 축구: each goal mouth is open air under a
solid bar, `line` is the mouth's inner edge, `sides` are standable and mirrored, `ball` is open air. An unreachable
crossbar is a warning (`x`), not an error, for party arenas.

---

## 6. Network

### 6.1 Room `R` and `hi`

```js
  // roomInfo(): m 'p' for a party room; o[7] the 판 수 (3 | 5, always sent; an older guest ignores it); in the room
  // phase of a party room, u: the seats whose page cannot play the party (no pa in their hi) - an older guest ignores it
  const R = { gid, ph, m: NET.mode === 'battle' ? 'b' : NET.mode === 'party' ? 'p' : 'c',
    o: [arena, time, perks, intrusion, stakeNow(), monsters, rapid, NET.opts.rounds === 5 ? 5 : 3], p: [...] };
  if (room && NET.mode === 'party') { const u = NET.roster.filter((r) => r.id !== NET.selfId && !(r.pa >= PARTY_V)).map((r) => r.slot); if (u.length) R.u = u; }
```

- `guestRoom(R)`: `NET.mode = R.m === 'b' ? 'battle' : R.m === 'p' ? 'party' : 'coop'`; `NET.opts.rounds = R.o[7] === 5 ? 5 : 3`
  (missing, junk: 3); `NET.partyU = Array.isArray(R.u) ? slots : []` (room line, 9.1). The battle-only fields keep
  their current reads, so a party room's `o[0..6]` are simply the host's battle settings, shown again if it switches back.
- `NET.opts` gains `rounds: 3`. `netSetOpts`: `'rounds' in o` → `+o.rounds === 5 ? 5 : 3` (room phase or before hosting);
  `mode` accepts `'party'`; switching **to** party un-readies every guest without `pa` (`r.ready = false`). A switch
  from party to battle with a stake already un-readies through `stakeNow()` changing (the existing `s0` check).
- `hi` (sent in `netAttach`) gains `pa: PARTY_V`. Host `'hi'`: `r.pa = nInt(m.pa, 0, 9, 0)`; new roster entries in
  `netPeers` start with `pa: 0`. Host `'rd'`: `r.ready = ... && (NET.mode !== 'party' || r.pa >= PARTY_V)`.
- `canStart` gains `&& (NET.mode !== 'party' || NET.roster.every((r) => r.id === NET.selfId || r.pa >= PARTY_V))`.
- `netStart`: `NET.mode === 'party' ? newParty(list, Object.assign({}, NET.opts)) : NET.mode === 'battle' ? newBattle(...) : newCoop(...)`.
- Bytes: `o[7]` adds 2 bytes; `R.u` appears only in a party room phase with an older page in it.

### 6.2 Compatibility (why `NET_V` stays 4)

| Host | Guest | What happens |
|---|---|---|
| new, coop / battle | old | Unchanged: `o[7]` is ignored, `R.m` is `b` / `c`. |
| new, party | old | The old page reads `R.m 'p'` as co-op (its `guestRoom` default) and shows 같이 하기 in its room. It may press 준비, but the host never counts it ready (no `pa`), shows `새로고침 필요` on its seat, keeps 시작 off and says why; new guests see the same line from `R.u`. The party cannot start with it, and the session is locked from 시작 on, so it never receives `g.pa`, `g.mg`, phases `a` / `r` or `g.m 'p'`. |
| old | new | The new guest never sees `'p'` or `o[7]` (its default 3 is unused); the old host ignores `pa`. Battle and co-op as before. |
| new | new | The party. |

- No message an older page acts on changes meaning, and everything new reaches only pages that announced `pa`. A later
  page with more minigames raises `PARTY_V`; a host then only plans games that every seat's `pa` supports.
- **Lobby** (`net.js`): `MODES = ['coop', 'battle', 'party']`. An older page's lobby skips a party room (its own `MODES`
  check): it could not join anyway. `renderGames` labels it `파티`.
- **Invites**: `ivInvite` writes `NET.mode` as is (`'coop' | 'battle' | 'party'`); `ivTake` accepts the three; `ivPaint`
  / `palRowEl` name it `IV_TX.party` (`'파티'`). `firebase/firestore.rules`: `d.mode in ['coop', 'battle', 'party']`
  (and its comment), the same in `src/tests/cloud.js`'s rules model. An older page drops a party invite in `ivTake`
  (fine: it cannot play it). Publish the rules with the deploy that ships this (until then a party invite is refused by
  the old rules and `ivInvite` shows its usual failure line).

### 6.3 Who decides what

| Thing | Who | On the wire |
|---|---|---|
| Rotation, card, points, standings | host (`G.party`) | `g.pa` |
| Bodies (every kit) | each player's own engine, as battle | body states (unchanged) |
| Blows, captures | host, shooter-judged (`tp` claims), as battle | `shot`, `tp`, `mash` (unchanged); prisons in `U` |
| Water level | host clock (`waterAt`) | `g.mg` |
| Out (물) | host, against each player's latest reported body + 3 px | `P` flag 16 + `ep`; `g.mg` outs |
| Crown pickup / holder / drop / held time | host (remote bodies with 4 px slack) | `g.mg` |
| Ball position / velocity, pushes, goals | host (remote bodies + 3 px; the host's bubbles) | `g.mg`, banner, events |
| Placements, party points | host (`miniPlaces`, `partyResult`) | `g.pa`, `P` score (index 8) |
| Final standing | host (`partyStandings`) | `g.pd` order + `g.pl` places + `g.pa` `F` / `W` |
| My coins | **each player for itself** (`coinParty` with its own counters) | none |

**No new message type in either direction.** Everything the host decides is state (latest wins), and nothing on a guest
is applied "once" from it except its own coins, which are guarded by game id and 판 index (8.3). A hostile host can at
most tell a guest it won (the 1st-place bonus: the same as letting it win); it cannot change the guest's own activity
counts.

### 6.4 Snapshot fields (`snapOf`)

```js
  const g = { ..., m: G.gameMode === 'battle' ? (G.party ? 'p' : 'b') : 'c', r: G.gameMode === 'battle' ? G.arena | 0 : G.round, ... };
  if (G.party) {
    if (G.arenaKind === 'p') g.ak = 1;                                   // G.arena indexes PG.PARTY_ARENAS
    g.pa = partySnap();                                                  // below
    if (G.mini) g.mg = miniSnap();
    if (G.mode === 'podium' && G.podium) g.pl = G.podium.pl.slice();
  }
  // partySnap(): { n, i, L: plan codes ('wcb'), P: [[slot, pts, wins, last, gain], ...], T: [team by seat, -1] (축구),
  //               t: frames into the card / result, F: 1 (final reached), W: 1 (walkover) }
  // miniSnap():  물   ['w', round(wl * 10), [[slot, place], ...]]                 (outs, with the place each one got)
  //              왕관 ['c', holder, round(x), round(y), f0, f1, f2, f3, noPick]   (f: frames held by seat)
  //              축구 ['b', round(x * 10), round(y * 10), round(vx * 100), round(vy * 100), goalsL, goalsR, goalT, kick]
```

- `PH_CODE` gains `card: 'a', result: 'r'`, `PH_NAME` `a: 'card', r: 'result'` (only party pages ever get them).
- Size: `g.pa` is about 90 bytes at 4 players, `g.mg` at most about 40; a party has no enemy rows (a battle's six take
  about 180), so a party snapshot is smaller than a battle one. The net test still reports `snapMax <= 3400`.
- `g.lc` and `g.am` ride as in battle (the claims, the magazine unless 연사).

### 6.5 Guest hooks

- `guestHostIn`: the coin lines become `if (g.m === 'c') coinGuestIdx(...); else if (g.m === 'b') { ...battle as today... } else if (g.m === 'p') coinPartyGuest(g, id);`
  (on the network event, so a hidden tab still counts). The trophy line stays `g.m === 'b'` only.
- `guestBegin`: `resetGame(g.m === 'c' ? 'coop' : 'battle', list)`; `G.opts` gains `rounds`; for `'p'`: `G.party = partyMirror()`,
  `coinPartyStart()`; `TRO.run = g.m === 'c' ? {...} : null`; `loadView(idx, kind)`.
- `loadView(idx, kind)`: `kind` `'l'` (LEVELS), `'b'` (ARENAS) or `'p'` (PARTY_ARENAS) instead of the boolean; `NET.viewKind`
  replaces `NET.viewArena`. `applyView`: `kind = g.m === 'c' ? 'l' : g.m === 'p' && g.ak === 1 ? 'p' : 'b'`; reload when
  `idx`, `kind` or (party) `g.pa.i` changed; `G.battle` is rebuilt for `g.m !== 'c'`; then `if (g.m === 'p') partyView(g, g1, t)`
  (mirror `G.party` and `G.mini`; the ball's x / y interpolated with `lx` / `ly` between `g` and `g1`; the water level the
  same way).
- `guestPhase`: `'card'` → `showOverlay('party')` + `fillParty()`; `'result'` → no overlay (banner and word pops come from
  the snapshot); leaving `'card'` hides the card. `G.podium` gets `pl` from `g.pl` (`applyView`'s podium line).
- `guestSelf`: the 물 "가라앉는 중" freeze (4.1); `updatePlayer`'s walk factor reads `G.mini` (the crown holder).
- `ptrapMax()` (**new**) = `G.mini ? MINI_TRAP : PTRAP_FRAMES`, used by `updateTrapped` and wherever a guest draws trap
  progress from `P` index 19.

---

## 7. Code placement in `src/game.js` (checklist)

### 7.1 Top constants block
`PARTY_V`, `PARTY_ROUNDS`, `PARTY_PTS`, `PARTY_F`, `MINI`, `MINI_IDS`, the `MINI_*` / `WATER_*` / `CROWN_*` numbers,
`BALL`, `PARTY_TX` and `PARTY_TEXT` (section 11), all before `V3_TEXT`. `COIN` gains the party entries (8.1).
`MODE_DESC.party`, `NET_TEXT` unchanged.

### 7.2 Game state and flow
- `G`: `party: null, mini: null, arenaKind: 'b'`. `resetGame`, `toTitle`, `idleWorld`: clear `G.party` / `G.mini`.
- `addScore`: `if (G.party) return;` first.
- `updateCountdown`: the 시작! banner's sub is `MINI[id].name` in a party (not `몬스터 없음`); `troHostGo` returns for `G.party`.
- `troCountSub` / `troCountCls`: `G.party` → `(i + 1) + '판 / ' + n + '판' + (last ? ' · 마지막 판!' : '')`, class `''`.
- `update()`: `case 'card': updateCard(); break; case 'result': updateResult(); break;`.
- `updateWorld`: the party end line (2.3) before the battle one. `updateBattle`: `if (G.mini) { miniTick(); return; }`
  after the timer / warning lines (no enemies, power-ups or intrusion); the 축구 clock does not count while `goalT > 0`.
- `startArena` → shared body in `loadArenaLV`; `miniLoad` uses it with `PG.PARTY_ARENAS` or `ARENAS`.
- `rematch`: the party branch (3.1). `endBattle` is never called in a party.
- `hostDropPlayer`: `partyDrop` (3.4).

### 7.3 Battle mechanics, party overrides
- `trapPlayer(v, b)`: `if (G.mini && G.mini.id === 'crown') crownDrop(v, b);` at the end.
- `updateTrapped`: `ptrapMax()` instead of `PTRAP_FRAMES`.
- `popBubble`, `'player'` branch: `if (by && by !== v && !G.party) knockOut(v, by, b); else releasePlayer(v);`.
- `floatMove`: the 물 sink (4.1). `quake`: the 축구 header (4.3).
- `updatePlayer`: its `let walk = WALK * k.walk * ...` line gains `* (crownHolder(p) ? CROWN_SLOW : 1)` (`crownHolder`:
  `G.mini && G.mini.id === 'crown' && G.mini.cr.holder === p.slot`, the same on a guest from its mirror).
- Unchanged and relied on: `playerTrapCheck`, `lagTrapCheck`, `hostClaim` / `claimCheck`, `capMine`, `magOf` / `ammoTick`
  (the magazine unless 연사), `fire` (blink ends on a blow), `emptyRule`, `respawnBattle` (never reached: no KO).

### 7.4 The party section (**new**, after `rematch`)
`rankBy`, `partyPlan`, `partyReplan`, `newParty`, `partyNext`, `updateCard`, `partyResult`, `updateResult`,
`partyStandings`, `partyFinal`, `partyDrop`, `partySnap`, `partyMirror`, `partyView`; `miniLoad`, `miniTick`,
`miniOver`, `miniPlaces`, `miniSnap`, `miniView`, `miniDrop`, `miniDraw`, `miniHud`; per game `waterAt`, `waterOut`,
`crownTick`, `crownDrop`, `ballStep`, `ballGoal`, `ballKickoff`; `ptrapMax`.

### 7.5 Rendering and DOM
- `renderScene`: `miniDraw(false)` after `drawKfx(true)` (goal nets behind the animals), `miniDraw(true)` right after
  `drawWater()` (the water band over the animals, the ball and the free crown in front), and during `'card'` the doors
  shut (`drawDoors(1)`) over the new arena.
- `drawHUD`: `if (G.gameMode === 'battle') { (G.party ? drawHUDParty : drawHUDBattle)(); return; }`.
- `drawPodium`: `pd.pl` for the block digits (3.3).
- `drawPlayer`: the worn crown (4.2) after the body, before the tag (the podium crown code is the model).
- `OVERLAYS` += `'party'`; `dom.party = $('pg-party')` in `setupDOM`; `fillParty()` (**new**) fills the card from `G.party`.
- `syncDOM`: banners live in `'result'` too; `syncTags`: tags in `'result'` too.
- `pauseGame`: also in `'card'` / `'result'` (online it only opens the menu). `resumeGame`: `showOverlay(G.mode === 'card' ? 'party' : null)`.
- `primaryAction`: nothing in `'card'` / `'result'` (nobody skips the card).
- `fillPodium` / `troPodiumUI`: `if (G.party) { partyPodiumUI(); return; }` in `troPodiumUI` (title, tag, note: 9.6).
- `netCardLabels('podium')`: the button reads `파티 한 번 더` in a party.

### 7.6 Room UI (the 17 `NET.mode === 'battle'` sites)
A helper `const pvp = () => NET.mode !== 'coop';` for "a mode with the kit options".
- `stakeNow`, `troLowerStake`: unchanged (party is not battle: stake 0, no message).
- `syncJumpSub` (`off`), `renderRoom`'s `roff` / `rmag`: `pvp()` (능력 끄기 and the magazine line apply to a party).
- `roomInfo`: `R.m` (6.1). `netStart`: the three-way start.
- `renderFriends`: `hostOpts.hidden = NET.mode === 'coop'`; the host button `파티 방 만들기`; `MODE_DESC[NET.mode]`.
- `renderRoom`: the badge `파티` (class `is-battle` kept for both pvp modes); `roomOpts.hidden = !host || NET.mode === 'coop'`;
  the guest summary and the rules (9.1); the seat tag `새로고침 필요` for a seat without `pa` in a party room (host: `r.pa`;
  guest: `NET.partyU`); the room message.
- `palRowEl` / `ivInvite` / `ivPaint` / `renderGames`: the party label (6.2).
- `buildOpts(box)`: every label / control gets `data-for="b"` (battle only: 경기장, 시간, 몬스터 출현, 보스 난입, 트로피 걸기),
  `"bp"` (능력 끄기, 연사) or `"p"` (판 수: a `.pg-seg` of `3판` / `5판`, `data-rounds`, aria `판 수`); `syncOpts(box, editable)`
  hides by `NET.mode` and checks `[data-rounds]`.
- `page.html`: both `[data-modes]` segments get `<button type="button" role="radio" data-mode="party" aria-checked="false">파티</button>`.

### 7.7 `net.js`
`MODES` gains `'party'`; its header comment lists it. Nothing else.

---

## 8. Rewards: 비누 코인 only

### 8.1 Numbers (`COIN`, top constants block)

```js
    pBase: 2, pRound: 4,                                       // 파티: 2 for a finished party + 4 per 판 I took part in
    pPlace: { 2: [6, 0], 3: [8, 4, 0], 4: [10, 5, 2, 0] },     // 파티: the final-rank bonus by players at the podium
```

| | 4 players, 1st | 4 players, last | 2 players, 1st | per minute (1st, 4p) |
|---|---|---|---|---|
| Battle, 3 min | 2 + 12 + KO (<= 6) + 8 = <= 28 | 14 + KO | 2 + 12 + KO + 6 | <= 9.3 |
| Party, 3판 (~3.8 min) | 2 + 12 + 10 = 24 | 14 | 2 + 12 + 6 = 20 | 6.3 |
| Party, 5판 (~6.4 min) | 2 + 20 + 10 = 32 | 22 | 28 | 5.0 |

The party pays less per minute than a battle, so it is never the farm. The day bonus (`COIN.day`, the day's first paid
game) and the soft cap (`COIN.soft` 400 a day, then half) apply through `coinGive`, shared with every mode. Coins have
no hard daily cap and the party adds none. The cloud's earn-rate rule (at most 150 a write, about 30 a minute) is met: a
party's award is at most 32 + 40 after minutes of play.

### 8.2 The pure table

```js
  // my coins for a party that reached its podium: n = players on the podium, done = every planned 판 played (not a
  // walkover), act = per 판 [I blew >= COIN.roundShots in it], shots = all my blows, playF = 'playing' frames I saw,
  // place = my final place, tie = how many share it. Pure
  function coinParty(n, done, act, shots, playF, place, tie) {
    if (shots < COIN.gameShots || playF < COIN.minF) return 0;
    let c = COIN.pBase + COIN.pRound * act.filter(Boolean).length;
    if (!done || n < 2 || place < 1) return c;                       // a walkover: no rank bonus (alt farming earns nothing extra)
    const B = COIN.pPlace[clamp(n, 2, 4)]; let s = 0;
    for (let q = place - 1; q < place - 1 + tie; q++) s += B[Math.min(q, B.length - 1)] | 0;
    return c + Math.floor(s / tie);                                  // a shared place averages its bonuses (as coinBattle)
  }
```

### 8.3 Who counts what (every player for itself)

- `CO.pa = { gid, act: [], shots: 0, playF: 0, seen: -1 }` from `coinPartyStart()` (host: `newParty`; guest: `guestBegin` for `'p'`).
- `CO.bshots` is already my blow count in battle mode (`coinShot`), reset at each 판's 시작! by `coinGo()` (host:
  `updateCountdown`; guest: `coinPartyGuest` on the first `'p'` snapshot of each 판 index).
- At each 판's end (host: `partyResult` → `coinPartyRound()`; guest: the first snapshot with phase `'r'` for index i, or any
  later index if that one was missed): `act[i] = CO.bshots >= COIN.roundShots`, `shots += CO.bshots`, once per index.
- `playF`: frames in `'playing'` (host: `miniTick`; guest: `guestUpdate` while `G.mode === 'playing'`).
- At the final (host: `partyFinal`; guest: the first `'d'` snapshot with `g.pa.F`): `coinPartyNow()` once per gid into
  `CO.pod = { gid, give, bonus, prac, rang }`, so `coinPodLine` alternates my block's line and `coinPodSr` speaks it
  unchanged. `done` on a guest is `F && !W && act.length === n` (it saw every 판 end, so a host cannot shorten the party
  and still pay a rank bonus). My place and its tie size come from `g.pl` / `g.pd`.
- Nothing is paid when: practice (`coinPrac()`, `NET.q !== 0`), `coinOk()` false, I left, the host left or went 방으로
  before the podium, or I blew fewer than 5 bubbles.
- **Two accounts**: tabs of one browser and two players from one device's store are practice already (`troPractice`). Two
  devices, one idling: the idle one blows nothing, so it gets 0; the active one wins every 판 and gets at most 24 for
  4 minutes (1v1 3판: 20), below a real battle's rate, and the soft cap halves it after 400 a day.

### 8.4 No trophies
`stakeNow()` is 0 in a party room (the 트로피 걸기 row is hidden), `troHostGo` returns for a party, guests never run
`troGuestGo` / `troWait` for `'p'`, `endBattle` (and `troHostResult`) never runs, `TRO_PLAY` (the +5) is not paid, 내 기록's
battle counts do not move. The room rules say `트로피는 걸지 않아요`.

---

## 9. UI (Korean texts verbatim)

### 9.1 Room

- Mode segment (방 만들기 box and room): `같이 하기` · `배틀` · `파티`. `MODE_DESC.party`: `2~4명이 미니게임 여러 판으로 겨뤄요`.
  Host button: `파티 방 만들기`. Badge: `파티`. Open games: `파티 · 2/4`. Invite: `파티`.
- Options (host): `판 수` (`3판` / `5판`), `능력 끄기` (`동물 능력 없이 겨뤄요`), `연사` (`RAPID_SUB`). 경기장, 시간, 몬스터 출현,
  보스 난입 and 트로피 걸기 are hidden (kept for battle).
- Guest summary: `파티 · 미니게임 3판 · 능력 있음` (+ ` · 연사`, + ` · 연습 경기`), the same `<i>` items as battle's.
- Rules list (`renderRoom`'s rules, party branch; points by the room's player count):
  - `미니게임 3판! 판마다 1등 4점 · 2등 2점 · 3등 1점 · 4등 0점` (3 players: `1등 4점 · 2등 2점 · 3등 0점`; 2: `1등 4점 · 2등 0점`)
  - `같은 기록이면 같은 등수 · 동점이면 1등을 더 많이 한 친구가 위예요`
  - `물 차오르기 · 왕관 뺏기 · 거품 축구` (3 players: `물 차오르기 · 왕관 뺏기 (거품 축구는 2명이나 4명일 때)`)
  - `coinRule(q)` for the practice case, else `끝까지 하면 등수대로 비누 코인을 받아요`
  - `트로피는 걸지 않아요`
  - `거품에 갇히면 잠깐 꼼짝 못 해요 · 연타로 빨리 빠져나와요`
  - `판 중간에 나가면 비누 코인이 없어요`
- Seat tag: `새로고침 필요` (class `is-short`). Message (host, or a guest with `R.u`): `새로고침이 필요한 친구가 있어요 · 파티는 새 버전에서만 해요`.

### 9.2 The card (`#pg-party`, new section in `#pg-screen`, after `#pg-podium`)

```html
        <section id="pg-party" class="pg-ov pg-party" aria-labelledby="pg-party-name" hidden>
          <div class="pg-card pg-party-card" aria-live="polite">
            <p id="pg-party-round" class="pg-party-round">1판 / 3판</p>
            <h2 id="pg-party-name" class="pg-h2">물 차오르기</h2>
            <p id="pg-party-how" class="pg-party-how"></p>
            <p id="pg-party-win" class="pg-party-win"></p>
            <p id="pg-party-keys" class="pg-party-keys"></p>
            <p id="pg-party-team" class="pg-party-team" hidden></p>
            <ol id="pg-party-board" class="pg-party-board" aria-label="점수판"></ol>
            <i class="pg-party-bar" aria-hidden="true"><i id="pg-party-fill"></i></i>
          </div>
        </section>
```

- Round line: `1판 / 3판`, the last one `마지막 판! 3판 / 3판`.
- `how` = `MINI[id].how`, `win` = `MINI[id].win`.
- Keys: keyboard `←→ 이동 · ↑/Z 점프 · ↓ 내려가기 · X 거품`, touch `조이스틱으로 이동 (아래로 당기면 내려가기) · 점프 · 거품`; then
  a second line `MINI[id].bub`.
- Team (축구): `왼쪽 팀: 방장 · 냥냥 / 오른쪽 팀: 까삐 · 펭펭` (1v1: `왼쪽: 방장 / 오른쪽: 까삐`) and mine
  `나는 왼쪽 팀 · 오른쪽 골대에 넣어요!` (the side I score on, which is what a kid needs).
- Board: one row per present player, best first: place digit, a 16 px bust (`portraitCanvas`, the seat's look and twin
  colour, as the room cards), nick, `9점`, and `+4` (the last 판's gain, hidden before the first result). Shared places
  show the same digit. My row has the `나` chip.
- The bar fills over the 5 s (CSS transform, `reducedMotion` aware). No input skips it.
- Fit: like the 목욕 끝 card it must fit 20em tall at a 320 px phone (about 24em x 21em): round 0.9em, name 1.6em, how /
  win / keys 0.85em, 4 board rows of 1.3em, bar 0.4em: about 15em with padding. `@container` steps: under 17em tall hide
  `#pg-party-win`; under 15em the board goes to 2 columns. Touch mode uses the touch keys line.

### 9.3 Countdown and in-game banners and word pops

- 3-2-1: "3" keeps my move (`countSub`); "2" / "1": `1판 / 3판` (last: `3판 / 3판 · 마지막 판!`); 시작!: sub = the game's name.
- 물: `물이 차올라요!` / `더 높이!`, last step `마지막 물결!` / `더 높이!` (class `hurry`); others' out: `탈락!` (word pop);
  my out: banner `탈락! 3등` / `친구들을 구경해요`.
- 왕관: `왕관이 나타났어요!` (class `round`); word pops `왕관!`, `떨어졌다!`.
- 축구: banner `골!` / `왼쪽 팀 1 : 0` (class `victory`); at each kickoff a word pop over my animal `오른쪽으로!` / `왼쪽으로!`
  (where I score).
- All: `10초 남았어요!` (existing).

### 9.4 HUD (`drawHUDParty`, canvas: digits and sprites only)

- The clock in the centre as `drawHUDBattle` (`m:ss`, red blink under 10 s).
- Seat panels at the battle x positions (`hudPanel`, the animal icon `life_<char>` with its twin colour, `drawMagHud` pips):
  line 1 the party points `p.score` in the slot colour. No leader crown in a party (it would read as 왕관 뺏기's crown).
- Line 2 (`miniHud`): 물: nothing while dry; out: the panel at 0.45 alpha and the place digit after an 8x8
  `water_cold_top` icon. 왕관: the `crown` icon (grey `tintOf` when not holding, gold and blinking when holding) and the
  whole seconds held. 축구: the team's goals, and a 2 px bar in the team colour (left `#ffb24a`, right `#c9a8ff`) along the
  panel's top edge.

### 9.5 Between 판 (`'result'`, 3 s, frozen world)

- Banner (class `clear`): `1등 방장!` (a shared 1st: `공동 1등!`; 축구: `왼쪽 팀 승리!`, a draw `무승부!`), sub
  `물 차오르기 끝 · 다음 판으로` (last 판: `마지막 판 끝!`).
- Word pops over each animal: `1등 +4` in its slot colour. Sound `'win'`. Name tags stay.

### 9.6 Final podium (the existing `#pg-podium`)

- Title `파티 결과!` (restored to `결과 발표!` for a battle), tag `3판` / `5판`.
- Blocks: shared places repeat the digit (`pl`); the 2nd line is the party points (and my coin line alternating, as battle).
- Note (`#pg-podium-note`): when a tie-break decided an order `동점은 1등을 더 많이 한 친구가 위예요` (or `... 마지막 판 등수로 정했어요`);
  a shared place `공동 2등!`; a walkover `친구가 나가서 일찍 끝났어요`.
- Buttons: host `파티 한 번 더` (a new party, same options), `방으로`; guest `로비로` and the wait line (unchanged).
- Screen reader (`fillPodium`): `1위 방장 (꽥꽥이) 9점, ...` (it already prints `p.score + '점'`) + `coinPodSr()`.

### 9.7 Mobile

Landscape, the floating joystick (down = drop through), 점프 and 거품 as everywhere: the party adds no control. The touch
JUMP sub-label (`syncJumpSub`) follows the kit as in battle. The card shows the touch keys line and fits 20em. A
spectator (물, out) keeps the pads; they do nothing. The room's mode segment holds three buttons and the 판 수 row two:
check them at 320 px in `ux-roomrow`. The 축구 ball and the crown are big (24 / 16 px) on purpose for small screens.

---

## 10. Sprites and sound (reuse; nothing new in `sprites.js` / `audio.js`)

| Need | Reuse |
|---|---|
| Ball | `giant_bubble` drawn 24 px (`frameOf('giant_bubble', (G.frame / 10) \| 0)`), a soft `#c8f4ff` disc behind it as the boss's giant bubble; fallback an arc. |
| Crown | `crown` (`SPR_CROWN`): 16 px (2x) when free, with a 4-frame glint (white `tintOf`); 8 px on the holder's head. |
| Water band | `water_cold_top` frames tiled along the surface (alpha 0.82, animated like `drawWater`), below it a fill `rgba(63,191,224,0.35)` to `PF_BOT`. |
| Goal nets | Canvas: the mouth's back filled `rgba(0,0,0,0.25)`, a 2 px grid in the defending team's colour at alpha 0.5, the goal line dashed white. |
| HUD icons | `crown`, `water_cold_top`, `life_<char>`. |
| Sounds | 물: `hurry` (warning), `splash` (out); 왕관: `powerup` (appears), `stamp` (pick up), `pop` (drop), `trap_player` / `escape` (as battle); 축구: `bounce` (pushes, rate-limited), `clear` + `shake(3)` (goal), `go` (kickoff); card `door`; result `win`; final `win` + music `podium`. |
| Music | `lobby` on the card, `battle` in play, `hurry` from 물's 4th step, `podium` at the end. |

`REQUIRED` / `SPR_SIZE` do not change. The host's sfx reach the guests as events as today (none of them is in `NO_ECHO`).

---

## 11. Korean strings (`PARTY_TX`, `PARTY_TEXT`)

`PARTY_TX` holds every fixed line of sections 9.1-9.6 by key; `PARTY_TEXT` = the `MINI` names / how / win / bub +
`Object.values(PARTY_TX)` + `' 판 등 점 공동 승리 무승부 팀 왼쪽 오른쪽 0123456789+/:·!'`, appended to both `#pg-fontwarm`
spans in `setupDOM` next to `TRO_TEXT` / `SHOP_TEXT`. Both live in the top constants block (TDZ, section 1). No string may
contain the retired v1 title's syllables (`final-e2e2` checks the page).

---

## 12. Debug / test API (`PG.debug.party`, and `PG.debug.local.party`)

| Call | Does |
|---|---|
| `local.party(chars, {rounds, plan, perks, rapid})` | An offline party with local players (G.manual), `plan` forcing the order (e.g. `['water']`). Offline pays no coins (`coinOk`). |
| `party.plan(n, rounds, seed)` | `partyPlan` with a seeded `ri` (pure). |
| `party.rank(rows)`, `party.points(n0, places)`, `party.standings(P, slots)`, `party.coin(...)` | The pure parts. |
| `party.state()` | `{ph, i, n, plan, pts, wins, last, mini: {id, t, wl, outs, cr, held, ball, goals, team}}` as this page shows it. |
| `party.fast(on)` | Debug only: every game 12 s (water steps scaled), card 60 f, result 40 f, and `coinParty`'s `playF` gate waived (like `tro.fast`). |
| `party.skip()` | Host: end the current 판 now (`partyResult`). |
| `party.level(y)`, `party.crown(slot)`, `party.ball(x, y, vx, vy)`, `party.goal(t)` | Set a game's state (host). |

`netDebugApi().host({mode: 'party', rounds, ...})` works through `netSetOpts`. `netState()` gains `party: {mode, rounds,
pa (my roster entry's / guests'), u}`.

---

## 13. Test plan

### 13.1 New `src/tests/party.js` (virtual time, offline engine, like `trophies.js`)

Prints `PARTY PASS|FAIL <name>`, `PARTY INFO ...`, `PARTY DONE pass=N fail=M`. `#fit` runs only the fit part (a phone).

1. **Rotation**: `plan(n, r, seed)` for n 2 / 3 / 4, r 3 / 5, 300 seeds: never the same game twice in a row; 3판 with n 2
   or 4 plays each game once; n 3 never plans 축구 and 3판 is A B A; `partyReplan` after 4 → 3 drops a planned 축구 and keeps
   the played ones.
2. **Points and ties**: every row of `PARTY_PTS`; `rankBy` competition ranking (1, 1, 3, 4); a 4-way tie all 4; 2v2 4, 4, 1, 1;
   standings tie-breaks (points, then 1등 count, then the last 판, then shared).
3. **물**: `waterAt` at step edges; the arena: each step drowns exactly one tier (players parked on every tier, out in the
   expected order); `WATER_SLACK` (feet 2 px under: dry, 4 px: out); the duck does not float; a trapped rival's prison sinks
   `MINI_SINK` and pops at the water → out; same-frame outs share; survivors share 1st; the last one standing ends it after
   `PARTY_F.early`; an out player is hidden, cannot blow or be caught, and is back for the next 판.
4. **왕관**: appears at the gather and lands on the centre stage; first touch takes it; held frames count only while
   holding; a capture of the holder drops it, the dropper cannot re-take it for `CROWN_NOPICK`; a capy shield keeps it;
   the holder walks at `CROWN_SLOW`; places by held time; a leaver holding it drops it.
5. **축구**: body pushes (a still body nudges, a sliding penguin kicks hard), a shot bubble pushes along its flight and
   pops, a capy slam lifts it; goals on both sides counted once, the clock stops during `goalT`, the kickoff resets bodies
   and ball; teams by standing; 60 s of random kicks (seeded) never leave the field, never wrap, never NaN.
6. **No KO**: popping a prison frees (kos 0, `p.score` unchanged); `addScore` does nothing in a party.
7. **Flow**: modes card → countdown → playing → result → ... → podium with the right timings; `p.score` = points; the
   podium order / `pl`; `removePlayer` mid-party → replan, < 2 → walkover podium; `rematch()` starts a new party.
8. **Rewards**: `coinParty` every branch (AFK 0, participation only, walkover, shared place average, 2 / 3 / 4 tables);
   through `coinGive` the day bonus and the soft cap; the trophy store byte-identical after a whole party.
9. **UI**: the card fills (round, name, keys by touch mode, team line, board order and `+N`), fits at 1x, 2x and a 320 px
   phone (`#fit` under `cdp-run` mobile); `PARTY_TEXT` is warmed; the podium title / tag / note switch and switch back
   for a battle afterwards; the HUD draws without errors for each game.
10. **Arenas**: `normLevel` keeps a closed map closed; `PG.PARTY_ARENAS` loads with its fields; a broken entry falls back.

### 13.2 New `src/tests/party-net.js` (4 same-origin iframes on bc, real time, like `trophies-net.js`)

Every frame: `tro.ns('f' + i)`, `tro.allowBc(true)`, `party.fast(true)`. Host = slot 0. Prints `PARTYNET ... DONE`.

1. `hi` carries `pa: 1`; a party room's `R.m` is `'p'`, `o[7]` the 판 수; a crafted older guest (a `hi` without `pa`,
   sent from a frame through its session) cannot be ready: tag `새로고침 필요` on the host, `R.u` and the line on the other
   guests, 시작 off; switching battle → party un-readies it; `mp.guestRoom` of a party `R` on an older-shaped reader keeps
   co-op (the backward read).
2. A 3판 party with 4 frames: every frame shows the same card order, round lines and scoreboard; phases a / c / p / r
   arrive everywhere; snapshots under 3400 bytes.
3. 물: the guests' drawn level within 1 px of the host's at the same tick (trace); an out decided by the host is out on
   every screen within 0.5 s, the guest's control goes remote, its banner says the place.
4. 왕관: a guest's claim (`tp`) on the holder drops the crown on every screen; held seconds agree at the result.
5. 축구 (`plan: ['ball']`, 4 frames → 2v2 and 2 frames → 1v1): a guest's body and a guest's bubble each move the ball on the
   host; a goal is counted once and shown everywhere; teams agree.
6. The final podium order, places and points agree on every frame; each frame's coins match `coinParty` with its own
   counters (q 0 through `allowBc`); without `allowBc` (q 1) nobody gets coins; trophies unchanged everywhere.
7. A guest leaves mid-판 2 of 3 (4 → 3): a planned 축구 is replaced, the party finishes, the leaver gets nothing; the host
   leaves mid-party: guests to the lobby with `방장이 나갔어요`, no coins; the host's 방으로 mid-party: everyone back in the
   room, no coins.
8. 파티 한 번 더 at the podium: a new gid, a new plan, coins not paid twice.

### 13.3 Existing tests and tools to update in the same PR

- `tools/validate-levels.js` (5.4), `tools/net-node-test.js` (a lobby entry with mode `'party'` is listed),
  `src/tests/cloud.js` (its rules model: invite mode `'party'`), `ux-roomrow` (the 3-button mode segment and the 판 수 row at
  320 px), `check-pages` / `final-e2e2` (the new overlay and strings). `trophies.js` / `trophies-net.js` / `kits*.js` need no
  change; run them once (one suite run, `node tools/run-all.js`, every Chrome run keeps `--mute-audio`).

### 13.4 `tools/run-all.js` and CI (`.github/workflows/pr.yml`)

```js
  // ---- 파티 (design/party.md §13): the rules, the three games, the flow, the coins, the card fit - offline, virtual time
  V('party', 'test-party.html', 120000, doneZero('PARTY'), { shot: 'runall-party.png' }),
  V('party-fit-320', 'test-party.html#fit', 30000, doneZero('PARTY'), { w: 568, h: 320, runner: 'cdp', mobile: true, done: 'PARTY DONE' }),
  // 파티 online: capability gate, cards, the three games' authority, podium, coins, leavers (bc, real time)
  V('party-net', HTTP + 'test-party-net.html', 'rt420000', doneZero('PARTYNET'), { done: 'PARTYNET DONE', w: 1200, h: 900 }),
```

CI subset: add **`party`** to `JOBS` in `pr.yml` (virtual time, one engine: stable like `trophies` / `kits`). `validate-levels`
is already in it and now covers the party arenas. `party-fit-320` and `party-net` stay in the full local run: the
workflow's own note keeps real-time multi-window tests off the shared runners.

---

## 14. Out of scope (explicitly not in this PR)

- The board (주사위, 보드판 칸, 황금 오리, turns): section 15 only.
- A party on one screen / offline from the title (the debug `local.party` only).
- Trophies, 내 기록 or 친구 순위 stats for parties; a party trophy league.
- New sprites, sounds or music; bots for the party in `review-mpbal.js`.
- A 3-player 축구 variant; more minigames; per-minigame options; changing options mid-party; joining a party in progress.
- Guest-side prediction of the ball (pushes show after the round trip; 16.1).
- Lobby list fields beyond the mode label.

---

## 15. 다음 단계: the board (sketch for the next PR)

- A board sequencer `G.board` replaces `G.party` as the caller of the same minigame layer: each round every player rolls
  a die (주사위 1-6: the shoot button on a rolling die over its animal, host RNG) and walks the 보드판 칸 of a fixed board
  screen (a loop of about 24 spaces drawn like a tiled bath floor): 파란 칸 +3 board coins, 빨간 칸 −3, 이벤트 칸 (warp,
  swap). Passing the 황금 오리 space buys a 황금 오리 for 10 board coins; the duck then moves elsewhere.
- After all players moved: one minigame through `miniLoad` / `miniPlaces` (the card shows the board standing), placement
  pays board coins (for example 10 / 5 / 3 / 0), back to the board. 10 or 15 rounds; most 황금 오리 wins (then board coins).
- Wire: `g.bd` (positions, coins, ducks, the die), new phases for rolling / walking; `hi` `pa: 2` gates it, so a v1 party
  page is told to refresh. The card, the podium, the coin reward (by final rank, with the same anti-farm checks) and
  every minigame are reused unchanged.

---

## 16. Risks

1. **Ball feel over the network**: a guest's push shows after about one round trip plus the view delay (150-250 ms).
   Kept simple (host-only ball, bodies never pushed back). If friends find it laggy, a guest-side cosmetic prediction of
   its own pushes is the follow-up.
2. **The `g.m` split**: every `g.m === 'b'` / `!== 'b'` test must be reviewed; the co-op coin line (`coinGuestIdx` ran
   for any non-battle) is the one that would silently pay wrong coins. The checklist in 6.5 / 7 names each.
3. **`normLevel`'s forced gap**: without the `closed` guard both party arenas would quietly get a drain, the ball would
   wrap and the water would drain through the floor.
4. **Invites before the rules are published**: a party invite is refused by the old `firestore.rules` until they are
   deployed with this.
5. **A hidden host tab** freezes the party for everyone (the rAF loop stops), as it freezes a battle today.
6. **Snapshot budget**: smaller than battle by construction; the net test asserts it.
