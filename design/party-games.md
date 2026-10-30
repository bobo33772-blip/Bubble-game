# 뽀득뽀득 목욕탕: 파티 새 게임 (party games, PR C) v1 — design spec

Status: **design**, checked against the code (section 17), on `feat/party-games` (worktree `bogeul-games`), stacked on
`feat/party-polish` (PR #23, not merged).
It builds on the party as built (design/party.md sections 18 / 18.1) and its polish (design/party-polish.md section 14):
the sequencer `G.party`, the minigame contract `MINI` / `MINI_FN`, the card with its 96x32 demo and 준비 완료!, the
result beats, the last 판 x2, the 3 보너스상, `PARTY_V` 3. Code is referenced by function name, never by line number.
Every function named here exists today unless it is marked **new**.

After the polish the owner played with 3 friends and said `좀 구려 퀄리티가`: the rules are bland, the flow awkward, 물
차오르기 the worst, and `다 비슷해요` - all three games are "run and jump around one arena". A (the flow) and B (물 v2, a
twist for 왕관 / 축구) are PR #23. **This is C: three new minigames of other genres**, so a party stops feeling like
the same game three times. The genres offered were 연타, 반응속도, 기억력, 1대3. Two designers proposed four games each
(fun-first, then risk-first); this spec picks three, one per genre, and merges the best parts of both.

> **Owner decisions (2026-10-29, after the check; they override the defaults below):**
> 1. The three games: 바나나우유 잡기, 펑! 비눗방울, 살금살금 술래 (no 기억력 game) - as specified.
> 2. **Rotation: draw freely from all six** ("6개 중 아무거나"), NOT the family rotation. One shuffled no-repeat bag of
>    the games that fit n, never the same game twice in a row (today's `partyPlan`, plus the replan fix of 3.6). There is
>    no `fam` field, no `roomAlt` line, no "at least one arena 판" guarantee: a party with no prisons skips 최다 가두기상
>    / 최다 탈출상 by the existing top-0 rule. Wherever a later section says "family", read this.
> 3. 바나나우유: a false start or a decoy press costs **-1** - as specified.
> 4. 살금살금 술래 **plays with 2 players** (1 v 1, each the 술래 twice) - as specified.
> 5. Since this spec was written, `main` gained PR #22 (the ws relay), #23 (the polish) and a crown change (fix/crown-last:
>    the player wearing the crown at time-up wins, no gold x2) and maybe party trophies (feat/party-trophies, which also
>    bumps `PARTY_V`). Merge `origin/main` before building; `PARTY_V` is main's value + 1 at build time.

---

## 0. Decisions in one table

| Question | Decision |
|---|---|
| The three games | **바나나우유 잡기** (반응속도: wait, snap, don't fall for the decoys), **펑! 비눗방울** (연타 + push-your-luck: mash to grow, pull down to bank, too big pops), **살금살금 술래** (1대N stop-and-go: everyone takes a turn as the 술래). No 기억력 game in this PR (section 16). |
| Cut line | Build order 바나나우유 → 펑 → 술래. **The first two are Must; 살금살금 술래 is behind the cut line** (Should): if time runs short, 2 games ship and the rotation works with 5 (section 12). |
| Where they play | 바나나우유 and 펑 are **`world: false`** games (the reserved polish-5 hook, built now): their own scene drawn over a plain closed arena **무대 목욕탕** (`PG.PARTY_ARENAS[2]`, key `'stage'`), the animals parked on fixed spots, no physics, no bubbles. 술래 plays on its own closed arena **살금살금 복도** (`PG.PARTY_ARENAS[3]`, key `'sneak'`) with bodies, but no 특기, no bubbles for anyone and a 술래 that never moves. |
| Inputs | Only what exists: the joystick (left / right / down with its hysteresis) and the 점프 / 거품 buttons on a phone; ←→↓, Z / ↑, X on a keyboard. 바나나우유: either button. 펑: mash either button, **down** banks. 술래: walk and hop; the 술래 mashes 거품 to chant and may feint with 점프. |
| Fairness rule | **Each page measures itself between two events on its own clock** (what it drew and what it pressed, a window of its own, or the host tick its view showed). The host only collects, clamps and closes. Latency changes when you learn the result, never the result (sections 4.4, 5.4, 6.4). |
| Press times | **New** `pressQ`: every fresh 점프 / 거품 press on this screen with its event `timeStamp` (keydown and pointerdown, where `latch` is set today) and every fresh **down** with its time (a ↓ keydown, the stick's down edge in `stickMove`), and **new** `G.drawT`: the time of the frame being drawn (set in `render`, so `D.step` tests have it too). |
| This page's own part | **New** optional hooks `local(M, slot, inp)` (the page that controls a seat: host for its local seats, a guest for itself) → `mi`, at most 8 ints; `input(M, slot, mi)` (host: applies any seat's `mi`, its own too - one code path). A guest sends `mi` in its **body state** beside `pr` (latest wins). **No new message type.** No game logic ever runs in a network callback (`hostBodyIn`): 술래's judge reads the states the host already keeps (`rem.buf`) from its own tick (6.4). |
| How a 판 ends | The two round games (바나나우유, 술래) end **by their own last round** (`M.endAt`); `secs` is only a safety cap that a slow link never reaches (75 / 80 s; the first draft's 50 / 60 s could cut the last round). The fast debug party gives each new game its own `fastSecs` (today's flat 12 s would cut both mid-round). 펑 ends on every page's own 45 s window plus the host's wait (5.4). |
| Rotation | **Owner: draw freely from all six.** One shuffled no-repeat bag of the games that fit n (6 for 2 / 4 players, 5 for 3: no 축구, unchanged), never the same game twice in a row across a refill; a replan's bag leaves out what was already played (3.6). 3판 and 5판 are always all distinct. |
| Points | Unchanged: places → 4 / 2 / 1 / 0 (x2 on the last 판). Every new game ranks by a key with a measured tie-break (ms, pops, frames), so shared places are rare. |
| Coins | "2+ bubbles blown in a 판" becomes **"2+ actions in a 판"**: **new** `coinAct()` counts a game's action into `CO.bshots` on my own page (a valid grab; a finished bubble; an arrival, a survived look with progress, or a chant). The arena games keep `coinShot`. Nothing else in `coinParty` changes. |
| Awards | Unchanged. 최다 1등상 always works; 최다 가두기상 / 최다 탈출상 come from the arena games **and from 술래** (its catches are prisons owned by the 술래, its escapes are mash-outs). A party where nobody trapped (no arena 판, no 술래: possible with the free draw) skips those awards by the existing top-0 rule. |
| Network | Host-authoritative over the existing transports. `g.mg` per game (at most ~120 bytes), the body state gains `mi` (~20 bytes). **`PARTY_V` 4**: a polish page (pa 3) in a party room is never ready and shows `새로고침 필요` (the existing gate). |
| Sprites / sound | **No new sprite** (items, `lg_2`, `giant_bubble`, `bubble_pop`, `shower`, `item_towel_hat`, tints). **One new sfx** `puff` (local). Everything else reused. |

---

## 1. Why: each game against "다 비슷해요" and "싱거워요"

| Game | What you do | Why it is not "the same game again" | Why it is not bland |
|---|---|---|---|
| 바나나우유 잡기 | Hands still, eyes on the counter; snap the moment the banana milk appears; hold on decoys (요구르트, 식혜, 계란, the pink 딸기우유) and on rounds where it never comes | Nobody moves. No arena, no bubbles, no aiming: the whole game is one press per round, judged in milliseconds | Eight 4-5 s rounds, a time over every animal (`0.27`), a cold-water 바가지 on whoever falls for a decoy in front of everyone, two rounds with no milk at all, a pink twin from round 5 |
| 펑! 비눗방울 | Mash to blow your own giant bubble, pull down to send it off before it pops | Nobody moves either; it is a thumb race plus a gamble, played in parallel stalls | Points grow with the square of the size (90% is worth 3x 50%): every bubble is a "one more puff?" decision with a tremble and a flash as warnings, and the 펑! in your face is the laugh. Everyone gets the same secret pop sizes, so a friend's pop is a hint |
| 살금살금 술래 | Creep toward the 술래 and freeze when it turns; as the 술래, mash the chant and fake | It plays the opposite way of the arena games: stop-and-go, no bubbles for runners, a player who never moves, and roles that rotate | The loudest of the six: the 술래 teases with the rhythm and a 흠칫! feint, runners flinch, a hop at the wrong syllable gets bubbled and carried back, `3초!` after the first arrival |

Across the six, every 판 now has its own verb: 물 escape, 왕관 hold, 축구 push, 바나나우유 snap, 펑 gamble, 술래 freeze. The
rotation draws freely from all six (the owner's pick), so with half the pool new, most parties mix both kinds. (술래
still walks and hops the platformer bodies; what makes it a different game is that standing still is the skill.)

---

## 2. Ground truth from the code (what this builds on)

| Thing | Code today | Consequence |
|---|---|---|
| The contract | `MINI[id]` (`c`, `secs`, `ar`, `fits`, `team`, `name`, `how`, `rule`, optional `keys` / `keysT`) and `MINI_FN[id]` (`spawns init start tick key snap view drop draw hud`, optional `hold held win over demo`); the sequencer calls `miniLoad` / `miniStart` / `miniTick` / `miniOver` / `miniPlaces` / `miniSnap` / `miniView` / `miniDraw` / `miniHud`. `miniOver` already waits for `over(M)` past time-up (축구's golden goal). | A new genre is a `MINI` entry + its `MINI_FN` hooks + its card texts. The new optional hooks (section 3.2) are dispatched the same way; a game without them behaves as today. |
| Inputs | `onKeyDown` sets `latch[act] = true` for a fresh 점프 / 거품 press (no auto-repeat); `bindTouch`'s button `sync()` sets it on a pointer's rising edge; `readInputs` turns them into `jumpP` / `shootP` for my slot and clears `latch`. The stick: `STICK_ON` 0.3 / `STICK_OFF` 0.2 (left / right), `STICK_DN_ON` 0.6 / `STICK_DN_OFF` 0.45 (down, and `ny >= 2 |nx|` to start). | The press queue (3.3) is pushed exactly where `latch` is set: no new gesture, no change to how a press is detected. |
| The loop | `loop(now)` (rAF) runs fixed 60 Hz `update()` steps with catch-up, then renders. | `G.drawT = now` before the render: the draw time a reaction is measured from. |
| Guest state | `guestSend` → `setState({..., rt, ..., pr?})` every `BODY_EVERY` (2) frames; `rt` = `NET.rt`, the host tick the guest's view shows (`bufTick(NET.buf, SNAP_DELAY)`); `parseBody` bounds every field; `hostBodyIn` keeps the latest as `rem.st` per remote. | `mi` is one more field (3.2). 술래 judges remote runners by `rt`, the field `lagTrapCheck` already relies on (clamped there to `HIST_KEEP` 48 f). |
| World step | `updateWorld(ins)`: `updateBody` for every player, bubbles, then `updateBattle()` → `miniTick()` (no inputs today). A guest's `guestSelf(ins)` runs `updatePlayer(me, inp)` for its own animal. `fire()` starts with `coinShot(p)`. `kitOf` already gives a raft `KIT_BASE`. | `updateBattle(ins)` / `miniTick(ins)` pass the frame's inputs on. The freeze of a `world: false` game is one early return in `updateBody` and one in `guestSelf` (3.1). |
| Drawing | `drawPartyWin` poses animals by a draw-time swap of the fields `drawPlayer` reads (x, y, facing, onGround, vy...) and puts them back; `drawPartyDemo` calls `MINI_FN[id].demo(dx, P.t % 240, a, b)`; `drawHUDParty` prints `m:ss` (or 축구's `+0:07`), the seat panels, `miniHud` and `drawMagHud`. | A `pose` hook (3.1) swaps the same way during play; a `clock` hook replaces `m:ss` (3.4). |
| Arenas | `PARTY_KEYS = ['water', 'ball']`, `loadPartyArenas` gives each index its key's game and swaps a broken entry for `fallbackPartyArena(key)`; `tools/validate-levels.js` has `PARTY_KEYS` / `PARTY_NAMES` and a closed-arena branch. | Two more keys: `'stage'` and `'sneak'` (sections 3.1, 6.6). |
| Rotation | `partyPlan(n, rounds, from)`: one shuffled bag of `MINI_IDS` that fit n, never twice in a row; `partyReplan` re-draws what no longer fits after a leaver. | Kept (owner: draw freely from all six), with the replan fix of 3.6; `partyReplan` is unchanged (only 축구 has a `fits` rule). |
| Coins | `coinShot` → `CO.bshots++` (battle mode), reset by `coinGo` at each 판's 시작!; `coinPartyClose(i)`: `act[i] = CO.bshots >= COIN.roundShots` (2); `coinParty` needs `shots >= COIN.gameShots` (5). | `coinAct()` feeds the same counter (3.5). |
| Sound | `ticket`, `item`, `pop`, `b_splash`, `scald_splash`, `stamp`, `chain` (pitch by `o.n`), `hurry`, `extend`, `trap_player`, `escape`, `countdown`, `ready`. `NO_ECHO` keeps a body's own sounds local. Recording is off while `NET.rec` is false (as `coinPop` does). | One new local sfx (`puff`); the per-page sounds of 바나나우유 / 펑 are played with `NET.rec` off on the host (section 9). |
| Sprites | `item_yogurt`, `item_egg`, `item_banana_milk`, `item_sikhye`, `item_towel_hat` (16x16, `REQUIRED` via `ITEM_TYPES`), `lg_2` (8x8: the yellow 바가지 with steam), `giant_bubble` (40x40), `bubble_pop`, `shower` (16x8), `water_cold_top`, the animals' `idle walk jump fall shoot die`. | Every frame named in this spec exists. |
| Wire / sim | `SNAP_LIMIT` 3400, `SNAP_EVERY` 3; `net.js` simulates `?lat=&jit=&drop=` on both ends of a test page's link. | party-net runs the fairness checks on a frame at `lat=100&jit=40` (13.2). |

---

## 3. Shared machinery (built once, before the games)

### 3.1 `world: false` on the stage arena

`MINI[id].world === false` means "this game draws its own scene; the animals stand still". Rather than skipping the
arena (which every renderer, the name tags, `takeOver` and the winner stage expect), such a game loads **무대 목욕탕**:

```js
    // ── P3 ── 무대 목욕탕 (world: false games): a closed box, the floor (row 25) and nothing else; the game draws its
    //    scene over it. Mirror-exact; theme 2
    { key: 'stage', name: '무대 목욕탕', theme: 2, closed: true, map: [ '#' x32, 24 x ('##' + '.' x28 + '##'), '#' x32 ], gather: { col: 15, row: 12 } },
```

- `MINI[id].ar = ['p', 2]`. `spawns()` = **new** `stageSpots(n)`: the feet centres `STAGE_X[n]` (2: `[100, 156]`, 3: `[72,
  128, 184]`, 4: `[44, 100, 156, 212]` - the centres of 2-4 stalls 56 px wide, centred), body `x = c - 8`, feet on the
  floor; the k-th present player in slot order. `placePlayer` takes a cell (`bodyAt`: `x = col * 8 - 4`), so a spot is
  `{ col: (c - 4) / 8, row: 24 }` - the 3-player centres give half columns (8.5, 15.5, 22.5), which `bodyAt` takes as they
  are (it never rounds a column).
- **Freeze** (`miniParked(p)`, **new**: `world === false`, or the game's `frozen(M, p)` - 술래's own animal and the arrived
  runners): `updateBody` returns at its top with `vx = vy = 0`, `onGround = true`, `invuln = 0` (else `START_INV` would
  blink all game); `guestSelf` runs the game's `local` and returns before `updatePlayer`. No `updatePlayer` means no
  `fire()`, no kit move, no magazine use.
- **Bubbles off** (`MINI[id].noFire`, also set by 술래): `fire()` returns `null` before `coinShot` (host and guest - the
  guest's `guestFire` is inside `fire`, so no `'shot'` message leaves either), so a stray 거품 press never makes a bubble
  or counts as a blow; `hostShot` drops a `'shot'` that arrives anyway while `noFire` (a modified page); `drawMagHud` is
  skipped; `syncJumpSub` hides the kit's sub-label on the touch 점프 button.
- **No clock cues** (`MINI[id].cues === false`, all three new games): `updateBattle` skips the last-3-s `countdown` beeps
  and `10초 남았어요!` (the rounds end these games, or the page's own clock does).
- **Poses** (`MINI_FN[id].pose(M, p)`, **new** optional): returns draw-time fields (`x`, `y`, `facing`, `onGround`, `vy`,
  `shootAnim`, `die` frame, `sit` px) that the player draw loop swaps in for `drawPlayer` and puts back, exactly as
  `drawPartyWin` does. Bodies, epochs and the wire never see them. Name tags follow the real (parked) bodies, which stand at
  the same x.
- **Name tags** (`MINI_FN[id].tagY(M, p)`, **new** optional): `syncTags` anchors a tag at `headTop(p) - 5`, a DOM box over
  the canvas. In 펑 that is exactly where the bubble grows (up to 44 px over the head), so the tag would hide the tremble
  and the flash, the game's only warning. A game with `tagY` gives the anchor instead: 펑 `PF_BOT - 8 - 16 - 50` (over the
  biggest bubble), 바나나우유 the head as today (its reveal times are drawn over the tag, 4.6). `tagSpot` still moves a tag
  off another one.
- **The end**: 바나나우유 and 술래 end by `M.endAt` (30 f after their last round closes), as 물 does. Their `secs` (75 / 80)
  is only a safety cap: the worst honest case (every round waiting out its close cap) is about 62 s for 바나나우유 and 60 s
  for 4-player 술래, so the 50 / 60 s of the first draft would have cut the last round. At the cap (a stalled host) the 판
  ends with the rounds already closed. `partySecs` in the fast debug party reads `MINI[id].fastSecs || 12` (바나나우유 and
  술래 30: their fast schedules are 4 rounds / 2 rounds, about 18 / 15 s). 펑 ends by its `over` (5.4).
- The card, the 3-2-1, 끝!, the winner stage, the tally, the awards and the podium are unchanged: they only see a `MINI`
  entry and places.

### 3.2 This page's own part: `local`, `input`, the body-state `mi`

```js
  // MINI_FN[id] (new, optional):
  //   local(M, slot, inp) -> mi | null   this page's own seat this playing frame (host: each local seat; guest: itself).
  //                                      Keeps its state in G.mloc[slot]; inp has the frame's edges and inp.pq (3.3)
  //   input(M, slot, mi)                 host only: a seat's latest mi (its own local seats' too: one code path)
  //   clock(M) -> string                 the HUD's centre text instead of m:ss (digits, '/', ':')
  //   pose(M, p), frozen(M, p), tagY(M, p)   3.1
  // MINI[id] (new, optional): fam, world, noFire, cues, fastSecs (3.1, 3.6)
```

(The first draft also had a `body(M, p, s)` hook called from `hostBodyIn` for each arriving state. It is dropped: that
callback runs on the network's schedule, outside `update()`, where a catch would make a prison, sounds and recorded
events between two world frames. `hostBodyIn` already keeps every accepted state in `rem.buf.list` (`{k, d}`, `d.rt`
included, up to 64); 술래's tick reads the new ones from there, 6.4.)

- **`mi`**: at most 8 integers, always `[판 index, ...]`. The guest's `guestSelf` stores what `local` returns in `NET.mi`;
  `guestSend` adds `mi: NET.mi` while `G.mode === 'playing'` and `G.mini` (left out otherwise, as `pr`). `parseBody` reads
  `Array.isArray(st.mi) ? st.mi.slice(0, 8).map((v) => nInt(v, -1e6, 1e6, 0)) : null`. Latest wins and each game's `mi`
  is cumulative or keyed by its round, so a dropped state loses nothing and a late one is re-sent.
- **Host**: `miniTick(ins)` (**changed**: `updateBattle(ins)` passes the frame's inputs) calls, for each present seat, `mi =
  p.local !== false ? F.local(M, slot, ins[slot]) : rem.st.mi` (only when `rem.st.gid === NET.gid` and `mi[0] === P.i`),
  then `F.input(M, slot, mi)` when it changed since the last frame (`M.miAt[slot]`). The host's own player is therefore
  measured, sent and judged by the same functions as a guest.
- **`G.mloc`** (**new**): `{slot: state}` for the seats this page controls - my bubble, my draw and press times. Reset at each
  판 index (host `miniLoad`, guest the new-`g.pa.i` branch of `applyView`). Never on the wire.
- The `input` side clamps every value (sections 4.4, 5.4, 6.4): `mi` is self-reported, the same trust as a body state.

### 3.3 Press times and draw times

```js
  const pressQ = [];   // this screen's fresh presses since the last frame: [act, t] (act 'jump' | 'shoot' | 'down'; t: the event's timeStamp)
  const evT = (e) => { const n = performance.now(), t = e && e.timeStamp; return t > 0 && Math.abs(t - n) < 10000 ? t : n; };
  // onKeyDown:        where latch[act] = true (a fresh press): pressQ.push([act, evT(e)]); a fresh ↓ / S (!keys.down): pressQ.push(['down', evT(e)])
  // bindTouch sync(): on the rising edge (latch set):          pressQ.push([act, evT(e)])
  // stickMove(cx, cy, t): when STICK.dn turns on (stickDown's edge): pressQ.push(['down', t]) (its two pointer callers pass evT(e))
  // readInputs:       my slot: i.pq = pressQ.splice(0).slice(0, 8) (all of them leave the queue: nothing stale is left for the
  //                   next frame), [] while G.menuOpen or outside 'playing'; a debug seat: i.pq = dbgPq[s].splice(0);
  //                   i.downP = i.down && !prev.down
  // loop(now):        frameT = now; render(): G.drawT = vclock ? pageNow() : frameT || performance.now()
```

- `event.timeStamp` and the rAF time are both `DOMHighResTimeStamp`s from the page's time origin in current Chrome and
  Safari; `evT` falls back to `performance.now()` in the handler (an old engine's epoch stamp, a 0). Two presses inside
  one frame are two entries (the second button, a fast double tap).
- `G.drawT` is set in `render()`, not in `loop`: `PG.debug.step` calls `update()` n times and then `render()` directly, so a
  `loop`-only stamp would never move in party.js.
- The `'down'` entries give 펑 the order of a bank and a puff that land in the same frame (5.1). `stickMove(cx, cy)` takes
  coordinates today; its callers (the zone's pointerdown, the window's pointermove) add the event's time as a third
  argument.
- `pageNow()` (**new**): `performance.now()`, or the virtual clock under `PG.debug.party.vclock(true)` (tests set the press
  and draw times exactly; 13.1).
- Nothing outside the party reads `pq` / `downP`; battle and co-op ignore them.

### 3.4 HUD

- Centre: `clock(M)` when the game has it (바나나우유 `3/8`, 술래 `2/4`, 펑 my own window's `0:23`, red blinking under 10 s),
  else `m:ss` as today. The canvas font has digits, `/`, `:`.
- Seat panels unchanged (icon, party points); line 2 is the game's `hud`; the magazine pips are hidden in games with
  `noFire` (3.1).

### 3.5 Coins: `coinAct`

```js
  // a game action of MY seat on MY page (a valid grab, a finished bubble, an arrival / a survived look / a chant): the
  // per-판 activity counter the bubbles feed in the arena games (coinShot); coinPartyClose and coinParty are unchanged
  function coinAct() { if (G.gameMode === 'battle') CO.bshots++; }
```

The per-판 rule stays `CO.bshots >= COIN.roundShots` (2), the party's `COIN.gameShots` (5) and the 60 s played gate as
today. An idle player still earns 0. The new games are 40-57 s long (the arena games 60), so a 3판 party is about 3.6
minutes and pays at most 24 to the 1st of 4: still under battle's rate (party.md 8.1).

### 3.6 Rotation with six games (owner: draw freely)

Today's `partyPlan(n, rounds, from)` already is "one shuffled bag of `MINI_IDS` that fit n, never twice in a row"; with
the three new ids in `MINI_IDS` it draws from all six. One fix: when it is called with `from` (a replan after a leaver),
its first bag leaves out what `from` already played, so a 5판 replan never brings back a played game while another is
still unplayed. No `fam` field.

| Players | Games that fit | 3판 | 5판 |
|---|---|---|---|
| 2 or 4 | 6 | 3 distinct of 6 | 5 distinct of 6 |
| 3 | 5 (no 축구) | 3 distinct of 5 | all 5 once |

- With only two new games built (the cut line), 2 / 4 players draw from 5 and 3 players from 4 (a 5판 party then plays
  one game twice, never in a row).
- `partyReplan` and the 축구 `fits` rule are unchanged: a 4 → 3 leaver during a 축구 card re-draws that 판 from what fits.
- `partyForced` (debug) is unchanged.
- The room's rules list gains one line with the new games (`PARTY_TX.gamesN`, built from the new entries present).
- Awards: a party may have no arena 판 and no 술래; 최다 가두기상 / 최다 탈출상 are then skipped by the existing top-0 rule.

### 3.7 Places, ties, awards

Every new game's `key` is "points first, then a measured tie-break", through `rankBy` → `PARTY_PTS` 4 / 2 / 1 / 0 (x2 on the
last 판, unchanged). The award counters stay the sequencer's: `wins` from every game; `caps` (`trapPlayer`, owner ≠
victim) and `esc` (`escapeTrap` with ≥ `ESC_MASH` presses) only where prisons exist: the arena games and 술래.

---

## 4. 바나나우유 잡기 (반응속도)

`MINI.milk = { c: 'm', secs: 75, fastSecs: 30, ar: ['p', 2], world: false, noFire: true, cues: false, fits: (n) => n >= 2, ... }`

### 4.1 Rules

- **8 rounds** (`MILK.rounds`). The 판 ends 30 f after round 8's reveal (`M.endAt`); `secs` 75 is only a safety cap (3.1:
  8 rounds that each wait out the close cap take about 62 s).
- **Each round** (host frames; `A` = the round's arm tick):
  1. **Intro** `MILK.intro` 30 f: the counter steams, three dots blink. Presses are not armed yet (ignored, no penalty: a
     press held over from the last round counts for nothing).
  2. **Wait**: the banana milk appears at `m = A + 30 + ri(72, 180)` (1.2-3.0 s, host RNG). Before it, decoys may appear,
     each **30 f** on the counter, at least **24 f** apart (from the end of one to the start of the next and before `m`):
     rounds 1-2 none; 3-4 one; 5-8 one or two. A decoy is a 요구르트, a 식혜 or a 맥반석 계란, and from round 5 it may be
     **딸기우유** - the banana milk jar itself tinted pink (at most one a round). The plan fits the decoys inside the wait:
     one needs `decoyF + gapF` = 54 f before `m`, two need 108 f, so a round 5-8 whose wait drew under 108 f (`m - A - 30`
     is 72-180) gets one decoy, never two squeezed together. A decoy's start is drawn inside what is left, so the milk does
     not always come right after a decoy.
  3. **NO-GO rounds**: 2 of rounds 4-8 (host RNG, never two in a row) have no banana milk: 2-3 decoys, then the round's
     **end** at the last decoy's end + 60 f.
  4. Every appearance, decoys included, plays the same `ticket` chime: the sound gives nothing away, you have to look.
- **My result for the round** (judged on my page, 4.4):
  - **잡았다**: my first press (점프 or 거품) at least **100 ms** and at most **1500 ms** after my screen drew the milk.
    Its time is my RT in ms.
  - **반칙** (`-1`): a press before my screen drew the milk (on the empty counter or on a decoy), a press under 100 ms after
    it (a guess), or any press in a NO-GO round. The penalty is **물벼락**: a 바가지 tips cold water on me, I shiver for 48 f
    and my presses are ignored for the rest of the round.
  - **느려요** (0): no press within 1500 ms of my milk.
  - **참았다** (`+1`, NO-GO only): no press until my screen drew the round's end.
- **Round points**: valid grabs by RT, fastest first: **3 / 2 / 1 / 0** (equal ms share the place); 반칙 -1; 느려요 0;
  NO-GO 참았다 +1, 반칙 -1.
- **Close**: the host closes a round when every present seat has reported (4.4), or at `m` (or the NO-GO end) + 180 f; a
  missing report is 느려요 (0). The host does not wait for a seat whose body states have stopped (no new state for
  `MILK.staleF` 30 f: a hidden tab, a frozen phone - its rAF loop sends nothing): without this, one friend who switched
  apps makes every round sit out the full 3 s cap, 24 s of nothing over 8 rounds (the owner's "the flow is awkward").
  Such a seat scores 느려요 unless its report is in before the close. Then a **60 f reveal**: each animal's time over it in
  canvas digits (`0.27`), `반칙!` / `느려요` / `참았다!` word pops, the fastest grabs the bottle (it arcs into its paws).
  The next round arms right after.
- Length: about 30 + 126 + ~50 (reactions and reports) + 60 ≈ 270 f a round, **about 37 s** for the 8.
- Round-opening banners: round 3 `가짜 간식이 나와요!` / `바나나우유만 잡아요` (class `round`); round 5 `딸기우유 조심!` /
  `분홍색은 참아요` (class `hurry`). A NO-GO round is never announced; its reveal says `바나나우유가 없었어요!` /
  `참은 친구 +1점`.

### 4.2 Controls

- Phone: 점프 or 거품, either one. The stick does nothing. Keyboard: Z or X (↑ works too: it is 점프).
- Card keys: `MINI.milk.keys` `Z 또는 X로 잡기`, `keysT` `점프나 거품 버튼으로 잡기`. 준비 완료 on the card is unchanged.

### 4.3 Players

- 2, 3 or 4, the same rules (with 2 the best a round pays is 3 / 2). The animals stand on `STAGE_X[n]` in slot order.
- A leaver: `drop` takes its seat out of the reports the host waits for; its row disappears; the round resolves without it.

### 4.4 The host's judging and the online fairness argument

**Each page measures its own reaction; both ends of the measurement are on that page's clock.**

- **The schedule never leaks early**: the host draws the round's plan at `A` (decoy kinds and ticks, `m` or the end), but
  `g.mg` carries an event `[kind, tick]` only once the host's clock has reached it. A page draws an appearance when its
  view clock reaches its tick (host: `G.frame`; guest: `NET.rt`). A guest's view is always behind the host's newest
  snapshot, so the event is in hand before it is due - but only in the *next* snapshot: an event at tick `e` with `a.k <
  e <= rt` is in `b` (`mg1`), not in `a`. `milkView` merges the events of `mg` and `mg1` (`miniView` already passes both).
- **The draw time**: the first render that draws an appearance stores `G.drawT` in `G.mloc` (`shown.milk`, `shown.d =
  [[kind, t0, t1]]`). **The press time**: each `inp.pq` entry's event time. `local` runs every playing frame and settles
  the round as 4.1 says: `rt = round(tp - shown.milk)`. A press processed before the milk's first draw (same frame, the
  update runs before the render) has `tp` before that draw and is a 반칙, which is right: it came before the milk.
- **Once drawn, it stays drawn**: the guest's view clock can step back (`bufPush` lowers `B.off` after a stall, so `rt`
  jumps back by up to a second). The counter is drawn from `G.mloc`'s `shown` record once an appearance was drawn (a
  decoy until its own 30 f have passed on this page's clock, the milk until the reveal), never from a fresh `rt` test, so
  the milk never vanishes and re-appears with a second draw time.
- **The report**: `mi = [판 i, round, ms, flag]` (flag 1 잡았다, 2 반칙, 3 참았다, 4 느려요), sent once the round is over
  for me (a press, 1500 ms after my milk, or my draw of the NO-GO end). The host's local seat goes through the same
  `local` → `input`.
- **The host** (`input`): takes the first report of each seat for the current round and clamps it (`flag 1` with `ms <
  100` is a 반칙, `> 1500` a 느려요); closes and scores (4.1); sends the results in `g.mg`.
- **Latency and jitter** only change *when* a page sees the milk (its view delay, a stalled snapshot), never how fast its
  player reacts: a guest at 100 ms + 40 ms jitter is timed from its own later draw. A faster network wins nothing; it
  only learns the result a little sooner. Rounds stretch by the slowest report (about 0.3-0.6 s at those numbers), which
  the 180 f cap bounds: the worst honest report (a 24-tick playout delay + 1500 ms + the way back) is in by about `m` +
  130 f.
- **Cheating bounds**: a modified page could report any RT; the clamp means it can claim at most 100 ms and can never
  avoid 느려요 by staying silent (the cap scores it). Reading the schedule early from devtools needs a modified page:
  the same trust as every self-reported body. Accepted for 4 friends.
- **What is not equal**: a phone's touch pipeline is slower than a desktop key (about 20-60 ms), and a 120 Hz screen draws
  sooner than a 60 Hz one. The friends all play on phones; the knob `MILK.kbAdj` (ms added to a keyboard page's RT,
  default 0) exists if a desktop player always wins.

### 4.5 Places, ties, coins, awards

- `key = pts * 1e5 - msSum` (`msSum`: my RT on each GO round, 1500 for a 반칙 or a 느려요; NO-GO rounds add nothing).
  Equal points and equal total ms share a place (in practice never).
- Coins: each valid grab calls `coinAct()` on my own page (6 GO rounds: 2 grabs pay the 판).
- Awards: it feeds only 최다 1등상.

### 4.6 Screen, HUD, sprites, sounds

- **The 매점** (drawn by `draw(M, false)`, behind the animals): a glass fridge across the back (x 72-184, y 64-150: a
  `#9fe3e8` 0.25-alpha pane, three shelf lines, bottles as 2x4 coloured pixel pairs), a wooden counter in front of it
  (x 64-192, y 150-170, `#a8683a` with a `#d99a5b` top edge). The drink of the moment stands on the counter at **2x (32
  px)**, centred at x 128: `item_banana_milk`, `item_yogurt`, `item_sikhye`, `item_egg`, or `tintOf(item_banana_milk,
  '#ff8fb1', 0.6)` for 딸기우유; it pops in over 4 f (scale 0.6 → 1). In rounds 1-4 the real one gets a blinking gold
  ring (canvas, r 20) to teach it; **from round 5 no ring** - the ring is a "press now" sign of its own, and with it the
  pink twin would be no test at all (the ring comes back on the bottle in the reveal). The wait's three dots blink over
  the counter.
- **The animals** (`pose`): idle while waiting; the jump frame for 6 f on my press; 물벼락: `die` frame 0, shivering ±1 px,
  `lg_2` at 2x tipping over the head (rotated over 8 f) and `water_cold_top` drops falling (local cosmetic `G.parts`); the
  round's fastest holds the bottle over its head during the reveal.
- **Times**: during the reveal, `0.27` over each animal in canvas digits (my own as soon as I pressed, in my colour), at y
  172 - between the counter's front and the name tags (a tag is a DOM box anchored at the head, over the canvas: digits
  drawn at the head would sit under it).
- **HUD**: line 2 = a bottle icon (`item_banana_milk` at 8 px) and my round points total (`-1` possible); `clock` `3/8`.
- **Sounds**: `ticket` (every appearance; each page at its own draw, local), `item` (my valid grab, local), `scald_splash`
  (a 물벼락: mine at once, a friend's when its flag appears in `g.mg`; local), `countdown` (each reveal), `win` is left to
  the beats. On the host these are played with `NET.rec` off (they are each page's own: section 9).

### 4.7 Card and demo

- Name `바나나우유 잡기`; how `바나나우유가 나오면 바로 눌러요!` (14 syllables); rule `다른 간식이나 딸기우유에 누르면 물벼락
  -1점 · 빠를수록 점수가 커요`.
- **Demo** (`milkDemo`, 240 f loop, pure in `f`): floor tiles at y 28; a counter of 3 tiles at x 40-64, y 20; `a` (16 px)
  at x 6, `b` at x 74.
  - 0-36: three dots blink over the counter.
  - 36: a 요구르트 (16 px) pops up on the counter. 46: `b` jumps for it. 50-86: `lg_2` tips over `b`, blue drops fall, `b`
    shivers (x ±1), a red 5x5 X over it.
  - 86: the yogurt is gone; the dots again.
  - 120: the 바나나우유 pops up with a blinking gold ring. 132: `a` jumps; 132-150: the bottle arcs into `a`'s paws.
  - 150-230: `a` holds it over its head with star pixels.
  - Read together: yogurt = splash, banana milk = grab.

### 4.8 State and wire

```js
  // G.mini (host): r (round 1..8), ph (0 armed/waiting, 2 reveal, 3 done), A (arm tick), plan {ev: [[kind, tick]], m | end},
  //   nogo [round numbers], rep {slot: [ms, flag]}, res [[slot, ms, flag, pts]] (the last reveal), pts {slot}, ms {slot},
  //   C (the close tick)
  // kinds: 0 arm, 1 요구르트, 2 식혜, 3 계란, 4 딸기우유, 8 the NO-GO end, 9 바나나우유
  // g.mg = ['m', r, ph, [[kind, tick], ...] (this round's events so far, <= 5), C, [[slot, ms, flag, pts], ...], [total by seat]]
  // mi   = [판 i, r, ms, flag]
```

About 100 bytes at 4 players. The guest's mirror (`milkView`) keeps its own `G.mloc` draw / press times across snapshots
of the same round.

---

## 5. 펑! 비눗방울 (연타 + push-your-luck)

`MINI.puff = { c: 'f', secs: 45, ar: ['p', 2], world: false, noFire: true, cues: false, fits: (n) => n >= 2, ... }`

### 5.1 Rules

- **45 s on each page's own clock**: my window is 45 000 ms from the first frame my screen drew 시작! (`G.drawT`), measured
  with `pageNow()` - a phone that drops frames loses no time, a stalled view does not lengthen it.
- **A puff** is a fresh 점프 or 거품 press (a `pq` entry). One counts at most every **66 ms** (15 a second; rolling two
  buttons gains nothing past that). Each puff adds **3.4%**: 0 → 100% takes 30 puffs. The size is `min(100, 3.4 x puffs)`
  (an integer count of puffs, never a float that drifts).
- **Banking**: a fresh **down** (a `'down'` entry in `pq`: the stick pulled down or ↓) while my bubble has at least one
  puff sends it off: it floats up and banks `round(size² / 100)` points (50% → 25, 70% → 49, 90% → 81, 100% → 100). A
  bubble that reaches 100% sends itself off (`만점!`). Then the wand dips for **0.6 s** (puffs ignored). `local` handles a
  frame's `pq` entries in time order, so a bank pulled 20 ms before a mashed puff of the same frame banks first and that
  puff falls in the dip (with `downP` alone, which has no time, the order inside a frame would be a coin toss).
- **The pop**: bubble k pops at **L_k%**. One sequence for everyone: `L_k = puffL(seed, k)`, integers uniform in **40-110**
  (`seed` from the host at the card; a pure 32-bit hash, never `rng`). A puff that brings the size to L_k or more pops it;
  this test comes before 만점, so L_k 99 or 100 pops on the 30th puff and only L_k 101-110 (10 of 71, 14%) are golden
  bubbles that reach 만점. 0 points, foam over my face, **1.0 s** before the next.
- **The warnings** (on every page, from the size and L_k): from **70% of L_k** the bubble trembles ±1 px, from **85%** ±2
  px; from **90% of L_k** it flashes white every 6 f. (±1 game px is about 1.4 css px on a 568x320 phone: too little alone
  to read in a mash, hence the second step.) The flash is not a "bank now" button: at 15 puffs a second the next puff
  comes 66 ms after it, faster than anyone reacts, so the warning works only for a player who slows down at the tremble.
  That is the decision the game is about: mash fast to the tremble, then puff one at a time.
- **The bell**: 5 s before my window ends, my own line `마지막엔 꼭 날려요!` / `안 날린 방울은 터져요` and `hurry` (local). At
  my window's end a bubble not sent off pops (0) and I am done.
- **Score** = the sum of my banked bubbles. Typical 300-700.
- The greed in numbers: sending off at the tremble (~75% of L) pays (0.75 L)² / 100, at the flash (90% of L) (0.9 L)² /
  100 - 44% more for one or two more puffs, while a small L leaves only 1-2 puffs between the flash and the pop.

### 5.2 Controls

- Phone: the right thumb mashes 거품 (or rocks 점프 / 거품); the left thumb pulls the stick down to send it off. Keyboard:
  mash Z / X; ↓ sends it off.
- Card keys: `keys` `Z·X 연타로 불기 · ↓ 날리기`, `keysT` `점프·거품 연타로 불기 · 조이스틱 아래로 날리기`.
- Down needs its own thumb and the stick's `STICK_DN_ON` 0.6 (with `ny >= 2 |nx|`): mashing never fires it.

### 5.3 Players

- 2-4 stalls, 56 px each, centred (`STAGE_X`). A leaver's stall empties and the game goes on.

### 5.4 The host's judging and the online fairness argument

**Everything that decides the game runs on the player's own page.**

- `local` grows my bubble from my own presses against the shared L sequence, inside my own 45 s window; the dip and the
  foam are timed by `pageNow()` too. `mi = [판 i, score, size, n (bubbles finished), pops, st]` (st 0 blowing, 1 dip, 2
  foam, 3 done), cumulative: a dropped state loses nothing.
- **The host** (`input`): keeps each seat's latest row, clamped (`size` 0-100, `n` 0-40 and never decreasing, `pops <= n`,
  `score <= 100 n`); relays the rows in `g.mg`. `over(M)`: true once every present seat says `st 3` (a seat whose states
  stopped for `MILK.staleF` 30 f is not waited for, as in 4.1), or 120 f after the host's own time-up (a seat that never
  said done: its last row, the bubble in hand counted as popped). The host's frame clock can run slower than the pages'
  wall clocks (`loop` drops time after 8 catch-up steps or a 250 ms gap), so the done reports may all be in before the
  host's time-up: `miniOver` still waits for `left <= 0`, and each page shows `다 불었어요!` / `친구들을 기다려요` meanwhile.
- **Latency and jitter** only move when my window starts (my 시작! is drawn later) and when friends see my bubble (their
  view of my row, about 0.3-0.5 s late: cosmetic). The same press pattern gives the same score at 0 ms and at 100 ms
  (party-net 13.2).
- **Cheating bounds**: the L sequence is readable in devtools and a modified page could report any score; the clamp caps
  it at 100 a bubble. Same trust as bodies.

### 5.5 Places, ties, coins, awards

- `key = score * 1e4 + (99 - min(pops, 99)) * 100 + min(n, 99)`: more points, then fewer pops, then more bubbles; still
  equal: a shared place.
- Comebacks: one 90% bubble is worth more than three 45% ones; a player behind can watch the leaders' pops on the same k.
- Coins: each bubble I sent off or popped by puffing calls `coinAct()` (the bell's pop does not).
- Awards: only 최다 1등상.

### 5.6 Screen, HUD, sprites, sounds

- **Stalls** (`draw(M, false)`): 2 px dividers (tile colour) between stalls from y 24 to the floor; `shower` (16x8) at the
  top centre of each stall with a drip every 40 f; a pink 목욕 의자 (canvas, 14x5, `#ff9ec4` with a `#c86a8e` edge) at the
  feet.
- **The animal** (`pose`): sits on the stool (`sit` 4 px), the `shoot` frame for 6 f after each puff, else idle; after a
  pop the `die` frame 0 with white foam pixels over the head for the foam's second.
- **The bubble** (`draw(M, true)`): `giant_bubble` drawn at `2r`, `r = 3 + size * 0.19` (up to 22 px), tinted with the seat
  colour (`tintOf`, 0.25), centred `r + 4` px over the head; trembling / flashing by 5.1; a popped one shows `bubble_pop`
  for 12 f and `펑!` as a word pop (each page its own, `NET.rec` off). The name tags sit over the biggest bubble (`tagY`,
  3.1), never on it.
- **Banked bubbles** float to the stall's top in 40 f and join a column of 8 px bubbles (the last 6; an 81+ one at 12 px);
  the score in canvas digits over each stall at y 30.
- My own stall from `G.mloc` (instant); friends' from their `g.mg` rows (size, st, score), so their bubble lags a little.
- **HUD**: line 2 = a bubble icon and the score; `clock` = my window's `0:23`.
- **Sounds**: **new** `puff` (each counted puff, `o.n` = size / 10: its pitch rises; local, in `NO_ECHO`); `item` on a
  send-off, `pop` + `b_splash` on a 펑! (mine at once, a friend's when its `pops` rises in `g.mg`, as 축구's `bounce` off
  `kn`); `hurry` at my 5 s. All local.

### 5.7 Card and demo

- Name `펑! 비눗방울`; how `연타로 불고 아래로 날려요! 터지면 꽝` (15 syllables); rule `흔들리면 조심, 반짝이면 바로 날려요 ·
  클수록 점수가 훨씬 커요`.
- **Demo** (`puffDemo`, 240 f): two stalls (a 1 px divider at x 48), `a` at x 20 and `b` at x 68 as **8 px** animals (feet at
  y 28, room for the bubble above), floor tiles at y 28.
  - 0-70: `a` puffs (the shoot frame every 8 f, a `)` of 2 pixels) and its bubble grows from r 2 to r 7.
  - 72: a 3x3 down-arrow flashes under `a`; 72-110: the bubble floats to the stall's top and shrinks to r 2 with a sparkle.
  - 40-150: `b` blows bigger (r 2 → 10); from 118 it trembles ±1; from 136 it flashes white every 4 f; 150: `bubble_pop`,
    white foam pixels over `b`.
  - 160-220: `a` blows a small second bubble; 220: the arrow, and it banks beside the first.
  - Read together: mash to grow, down to keep, too big pops.

### 5.8 State and wire

```js
  // G.mini (host): seed, rows {slot: [score, size, n, pops, st]}; G.mloc[slot] (each page, its own seat): t0 (my 시작!
  //   draw time), k, size, score, n, pops, st, until (dip / foam end), last (the last counted puff's time), bell (shown)
  // g.mg = ['f', seed, [[slot, score, size, n, pops, st], ...]]
  // mi   = [판 i, score, size, n, pops, st]
```

About 80 bytes at 4 players (a seed instead of the 40-entry list the first draft carried).

---

## 6. 살금살금 술래 (1대N) — behind the cut line

`MINI.sneak = { c: 's', secs: 80, fastSecs: 30, ar: ['p', 3], noFire: true, cues: false, fits: (n) => n >= 2, ... }`
(a normal world: bodies move; `frozen` parks the 술래 and the arrived).

A stop-and-go creeping game with the structure of the playground game 무궁화 꽃이 피었습니다, with our own chant, no doll,
no elimination: a caught runner is bubbled and carried back.

### 6.1 Rules

- **Rounds**: one per player present at 시작! (4 players 4 rounds, 3 players 3), and **2 players play 4** (each is the
  술래 twice). The 술래 order is seat order rotated by the 판 index. Round caps: **13 s** (4p), **16 s** (3p), **12 s**
  (2p). The 판 ends 30 f after the last round closes (`M.endAt`); `secs` 80 is only a safety cap (4 players: 4 x 13 s + 3
  swaps + up to 60 f of waiting per round is 59.6 s, which the first draft's 60 s cap would have cut). Between rounds a
  **72 f swap**: banner `다음 술래: 냥냥!` / `술래가 돌아보면 멈춰요!`,
  every prison opened, everyone `placePlayer`d (runners on the start, all at the same x - nobody starts ahead; the new
  술래 on its spot), my own line `이번엔 내가 술래!` / `거품 연타로 외쳐요` when it is me.
- **Kits**: everyone uses `KIT_BASE` (`kitOf` → base for a 술래 판, as for a raft): no 특기, no glide, no double jump.
  Runners walk at `WALK x SNEAK.walk` (0.7: 0.875 px/f) and jump normally. **Nobody blows bubbles** (`noFire`).
- **The chant**: 7 syllables, `뽀-득-뽀-득-목-욕-탕!`. Each 거품 press of the 술래 lights the next syllable, at most one
  every **6 f** (the fastest `뽀득뽀득목욕` takes 0.6 s; up to 3 presses wait in a queue). After **60 f** with no press the
  chant moves on by itself every **24 f**, so an idle 술래 still turns. Once syllable 6 (`욕`) is lit, `탕!` comes **21 f**
  (0.35 s) later by itself: that frame is the turn **T**. The 술래 sets the rhythm, nobody picks the exact frame.
- **흠칫! (the feint)**: the 술래's 점프, once per chant, from syllable 3 until 욕: its head flips for 8 f (word pop `흠칫!`),
  with no red edge and no red pips. It catches nothing; a runner who flinches only loses time.
- **The look**: 90 f from T. The 술래 faces the runners, the pips flash red, a soft red edge lines the playfield. A runner
  is **caught** if, between T+10 and T+90 on its own view (6.4), it **moved 2 px or more** from where it stood at T+10, or
  was **in the air**. Exempt: trapped runners, runners who arrived, and a runner freed after T+10 - 30 - **for the rest of
  that look**, including one freed in the middle of it (`releasePlayer` pops a freed animal up with `vy -1.6`, so a
  mash-out during a look would otherwise be "in the air" at once: caught, mashed out, caught again until the look ends).
  Such a runner's anchor is where it lands. (Walking stops in 2 frames at the base kit's `acc` 0.5 - 0.875, 0.375, 0 px/f:
  the 10 f grace and the 2 px are well inside it; on a phone the reliable stop is lifting the thumb, `stickReset`. A hop
  near 탕! is the intended risk - airtime is 37 f.)
- **Caught**: word pop `들켰다!`, my own line `움직였어요!` / `연타로 빠져나와요`, then a prison owned by the 술래
  (`makeBubble` + `catchPlayer`: `MINI_TRAP` 90 f, `PTRAP_MASH` a press, as every minigame). The prison drifts back toward
  the start at **1.2 px/f** (a `floatMove` branch for 술래: `G.gather` = the start spot): the full 90 f costs about 108
  px, a mash-out after 30 f about 36 px. The runner drops wherever the prison is.
- **Arrival**: a free runner whose body box reaches **x 200** (`p.x + 12 >= SNEAK.line`) has arrived: it stops there
  (`frozen`), hops and cheers with stars, word pop `도착!`, and is no longer judged. A guest freezes **its own** animal the
  frame its own body crosses the line (`frozen` reads the body's x on the page that moves it); waiting for the host's
  arrival list in the mirror would let it walk on into the 술래 for a round trip. The first arrival starts **`3초!`**
  (banner, class `hurry`, sub `빨리 와요!`). The round ends 3 s after the first arrival, or as soon as every runner arrived,
  or at the cap.
- **Points in the 판**: arrivals **3 / 2 / 1** in arrival order (6.4); the 술래 **+1 per catch, at most 3 a round** (as much
  as the round's winner; the 최다 가두기상 counter still counts every catch).

### 6.2 Controls

- Runner, phone: the joystick walks ←→, 점프 hops the stools. Keyboard: ←→, ↑ or Z.
- 술래, phone: mash 거품 to chant, 점프 to feint. Keyboard: mash X, Z to feint. The 술래's body never moves.
- Card keys: `keys` `←→ 살금살금 · Z 점프 · 술래는 X 연타`, `keysT` `조이스틱 걷기 · 점프 · 술래는 거품 연타`.
- The card's team line (`#pg-party-team`, 축구's) shows the order: `술래 순서: 방장 → 냥냥 → 까삐 → 펭펭` (each nick
  ellipsized as 축구's halves). On my screen, the countdown's 2 / 1 sub line of round 1 says `이번 술래: 나!` when I am
  first.

### 6.3 Players

- 4 players: 1 v 3, 4 rounds. 3 players: 1 v 2, 3 rounds. 2 players: 1 v 1, 4 rounds. Everyone is the 술래 equally often.
- A leaver's rounds are dropped from the order. If the 술래 itself leaves, its round ends at once: catches kept, no
  arrival points. Fewer than 2 left: the existing walkover.

### 6.4 The host's judging and the online fairness argument

**Each runner is judged on its own view of the turn.**

- **The chant**: the 술래's presses ride in its `mi = [판 i, presses, feints]` (cumulative over the 판; a host-local 술래
  goes through the same `local` → `input`). The host applies the increase with the 6 f rule, decides T and sends `[syllable,
  T, feintT]` in `g.mg`. A page draws the pips and the look from its view clock, so 탕! shows on a guest exactly when its
  view reaches T. The fixed 21 f from 욕 to 탕! means a host-local 술래 cannot time the turn better than a guest 술래.
- **The judge** runs in `sneakTick` (inside `update()`, never in the network callback): host-local runners from their
  bodies at `G.frame`; remote runners from **the states the host already keeps** - `hostBodyIn` pushes every accepted
  state into `rem.buf.list` (`{k, d}`, up to 64, `d.rt` the host tick that runner's view showed when it sent it), and the
  tick reads the ones newer than the last it judged (`M.seenK[slot]`), of the runner's current epoch only (`d.ep === p.ep`:
  a state from before a catch or a swap is the old body). The **anchor** is the runner's first state at or after T+10. A
  later state with `rt` in (T+10, T+90] catches it when it is 2 px from the anchor, or says `onGround` 0, **or (from T+12
  on) still has `|vx| >= 0.1`** - the same test for a host-local runner, frame by frame. The velocity test matters
  because states come about every 2 frames and some are dropped or arrive out of order (and are thrown away): the first
  state at or after T+10 can be T+16, and a runner that walked until T+14 would be anchored after it stopped. With `vx`
  any sampled state of a still-walking runner catches it. (Interpolating the anchor between the states around T+10 was
  considered and rejected: across a gap of dropped states it puts the anchor short of where a runner that stopped at T+9
  stands, a false catch of an honest player.) What is left: a remote runner can get away with walking for at most the
  gap between two of its states that reach the host (2 f normally, a few more after drops), where a host-local runner is
  judged every frame. A guest that stopped in time on its own screen is safe, whatever its latency or jitter.
- **`rt` only goes forward**: the guest's view clock can jump back (`bufPush` lowers `B.off` when the last second of
  snapshots all came late, or after a starve), so `NET.rt` - and every later state's `rt` - can drop by up to a second.
  The host keeps `M.rtMax[slot]` and reads each state's `rt` as `max(rt, rtMax)`; the guest draws the pips, 탕! and the
  look from its own monotonic `NET.rtHi = max(NET.rtHi, NET.rt)` (reset per 판). Without this, a jump back in the middle of
  a look would show the guest the chant again (the look "ends" on its screen), it walks, and its states land inside [T+10,
  T+90] a second time: an unfair catch. And its arrival stamp would come out early.
- **A stalled view** cannot creep through a look: `rt` is clamped to at most **`SNEAK.lagMax` 60 f** behind the host's
  frame when the state arrived (`hostBodyIn` stamps `s.at = G.frame` on each accepted state: a host-side field, nothing on
  the wire; `lagTrapCheck`'s principle with a wider bound: at 100 ms each way + 40 ms jitter + the view buffer of 8-24
  ticks, a normal guest's states arrive about 20-45 f after their `rt`, so 60 f never binds a healthy link; `REWIND` 30
  would). The host keeps a look's judging open until every remote runner has a state past T+90, or T+90+60.
- **Arrivals** are ordered by their `rt` stamp (host-local: its frame), not by when they reach the host, so a faster
  network never wins a close finish. The `3초!` end is `first + 180` in the same clock; the host waits until every remote
  runner still running has a state past that tick (or 60 f more) before closing. The same for the round cap.
- **A catch and an arrival in the same state**: the catch wins (tested).
- **Catches** are the existing prisons (`U` rows), escapes the existing `'mash'` message. No new message type.
- **The 술래's own screen on a guest**: its pips would light a round trip late, so it shows `max(the host's syllable, its
  own predicted one)` (the same 6 f rule over its own presses) until T arrives from the host.
- **Cheating bounds**: a modified page could send still bodies while its runner walks. Same trust as every body state;
  the look's 2 px / in-air test and the `rt` clamp bound an honest page that lags.
- **Not equal**: the guest's view clock does not run at exactly one tick a frame. When its playout delay grows (`B.adapt`
  rises by up to 1 tick per arrival after a jitter spike, to at most `BUF_MAXD` 24), `rt` runs slow for a moment and that
  runner gets a few more physics frames per host tick: its arrival stamp comes a little early (by the delay's growth
  during the round: typically 2-5 ticks, at most 24). A forward resync makes it late. With the monotonic `rt` above,
  nothing larger can happen. Arrivals closer than that are rare; accepted, and party-net logs each guest's delay change
  per round as INFO so the friends' play can tell if it matters.

### 6.5 Places, ties, coins, awards

- `key = pts * 1e5 - arrSum` (`arrSum`: the frames from round start to my arrival on each round I ran, the round's cap for
  a round with no arrival - the 술래's own round counts its cap for everyone, so it is equal). Still equal: a shared
  place. The usual 4-player spread is 3-12 points.
- Comebacks: every round restarts the race; the 술래 role pays catches.
- Coins (my own page, from its mirror): my arrival; a look I survived free after at least 16 px of progress since the
  last one; as the 술래, a chant that reached 탕! with at least 3 of my presses.
- Awards: catches go through `trapPlayer` (owner = the 술래) → `caps`; mash-outs of 3+ presses → `esc`.

### 6.6 Arena, screen, HUD, sounds

**살금살금 복도** (`PG.PARTY_ARENAS[3]`, key `'sneak'`, theme 1): closed, 32x26, one tiled floor (row 25); two **목욕 의자**
stools 1 tile high and 2 wide on row 24 at cols 9-10 and 21-22 (solid `#`: a runner must hop them; a jump clears 38 px).
Mirror-symmetric map; the asymmetry is data:

```js
      sneak: { start: { col: 3, row: 24 }, it: { col: 27, row: 24 }, line: 200 },   // runners' spot, the 술래's, the touch line (px)
```

`loadPartyArenas` keeps `sneak` (**new** `sneakOf`: cells clamped inside the walls, `line` between them), else
`fallbackPartyArena('sneak')`.

- Drawn: a dashed start line (canvas) at the runners' front; a soft gold band on the floor from x 200 to the 술래 (the
  touch zone); the runners' name tags stack while their animals stand within 8 px of each other (`syncTags`: 7 px up per
  seat, as on the shared start spot); the 술래 facing the right wall, wearing `item_towel_hat` at 8 px as a 양머리, its
  name tag `술래 · 냥냥`;
  7 pips (3x3) over its head, grey → gold as syllables light, red on 탕!; during a look the 술래 flipped and a red edge
  (`rgba(255,80,80,0.18)`, 6 px) around the playfield.
- The chant text is DOM: each syllable is a **word pop** over the 술래's head (`wordPop`, recorded, so every page shows it
  when its view reaches it, as every host word pop), in the 술래's colour; then `탕!` is the one banner (class `hurry`) at T.
  (The first draft grew a `round` banner per syllable. `syncDOM` re-runs the banner's pop animation for every new banner
  id, and a guest's `guestBanner` only takes a new id, so a banner rewritten up to 10 times a second would either flicker
  or need both paths changed. At most 6 word pops live at once (`G.words`): a fast chant drops its oldest syllable, which
  reads fine.)
- HUD: line 2 = my points in the 판; a towel icon on the 술래's panel; `clock` `2/4`.
- Sounds: `chain` per syllable (`o.n` = the syllable: the pitch climbs), `stamp` on 탕!, `trap_player` / `escape` (as every
  capture), `extend` on the first arrival and `item` on the others, `hurry` with `3초!`, `ready` at each swap. All echoed
  from the host as today (the host decides them).

### 6.7 Card and demo

- Name `살금살금 술래`; how `술래가 돌아보면 멈춰! 먼저 닿으면 3점` (16 syllables); rule `모두 한 번씩 술래 · 움직이다
  들키면 거품에 갇혀 뒤로 · 술래는 잡을 때마다 1점`.
- **Demo** (`sneakDemo`, 240 f): floor tiles at y 28, a 2-tile stool at x 36-44, the 술래 `b` (16 px) at x 76 facing right.
  My animal `a` walks from x 4; a third animal `c` (the first of `CHAR_IDS` that is neither `a` nor `b`) behind it from x 0.
  - 0-54: the 7 pips over `b` light one every 8 f; `a` and `c` walk right.
  - 56: `b` flips, the pips flash red. `a` freezes on its idle frame; `c` takes two more steps.
  - 64: a bubble closes on `c`; 64-110: `c`'s prison drifts left to x 0.
  - 110: `b` turns back, the pips reset; 110-166: they refill while `a` walks on, hopping the stool at 130.
  - 168: `b` looks; `a` is frozen. 200: `b` turns back; 200-226: `a` walks to x 60 and touches `b`; 228: a star burst.
  - Read together: walk while it chants, freeze when it turns, a mover is bubbled back, touch it to win.

### 6.8 State and wire

```js
  // G.mini (host): order [slots], r (round), it (the 술래's slot), ph ('run' | 'swap'), rs (round start), syl (0..7), q
  //   (queued presses), lastSyl, lastPress, T (-1), look (the last T, judged until closed), feintT, fUsed, anchor {slot: x},
  //   seenK {slot: the last state k judged}, rtMax {slot}, freeAt {slot: the rt a prison let it go},
  //   arr [[slot, rt]], first (-1), base {slot: [presses, feints]}, catches [by seat] (this round), pts [by seat], arrSum
  // g.mg = ['s', r, it, syl, T, feintT, first, end, [arrived slots in order], [catches this round by seat], [pts by seat], ph]
  // mi   = [판 i, presses, feints]   (the 술래's seat; a runner sends none)
```

About 70 bytes. Prisons ride in `U` as in every minigame.

---

## 7. Network

### 7.1 Gate: `PARTY_V` 4

`PARTY_V` 3 → **4** (this page plays the new games and `mi`). A polish page (`hi.pa` 3) in a party room is
never ready, shows `새로고침 필요`, and the room says why - the existing `seatReady` / `seatOld` / `R.u` path. An older page
would read a `'m'` / `'f'` / `'s'` plan code as 물 (its `partyView` falls back to `MINI_IDS[0]`). party-net's crafted
older guest sends `pa: 3`. The old games' wire is byte-identical, so a new guest in a stale v3 host's room still plays
(that host only plans the old three: polish 14.4's open item stays harmless).

### 7.2 Who decides what

| Thing | Who | On the wire |
|---|---|---|
| The plan | host | `g.pa.L` (codes `w c b m f s`) |
| 바나나우유: the schedule | host (RNG, revealed tick by tick) | `g.mg` events |
| 바나나우유: my RT, my 반칙 | **my page** (my draw time, my press time) | `mi` |
| 바나나우유: round points, the close | host (clamps, cap) | `g.mg` results |
| 펑: the L sequence | host (a seed) | `g.mg` seed |
| 펑: my puffs, bank, pops, window | **my page** | `mi` |
| 펑: the end, places | host (all done, or cap) | `g.mg` rows |
| 술래: the order, T, feints | host (from the 술래's `mi`) | `g.mg` |
| 술래: a runner's body | its own page | body state (`rt`) |
| 술래: catches, arrivals, their order | host, against each runner's own `rt` | prisons (`U`), `g.mg` |
| My coins | each player for itself (`coinAct` on its own events) | none |

### 7.3 Snapshot fields and sizes

| Field | Size | Note |
|---|---|---|
| `g.mg` 바나나우유 | ~100 B | events of this round only, results of the last reveal |
| `g.mg` 펑 | ~80 B | a seed, not the list |
| `g.mg` 술래 | ~70 B | + prisons in `U` (~30 B each, at most 3) |
| body state `mi` | ~20 B | per guest, every 2 frames, only while playing a game with `local` |

A party snapshot has no enemy rows: about 1.0-1.3 KB at 4 players with the largest `g.mg`. Well under `SNAP_LIMIT` 3400
(party-net asserts it every run).

### 7.4 Guest hooks

- `guestSelf`: in `'playing'`, a game with `local` → `NET.mi = F.local(G.mini, G.localSlot, inp)`; a parked animal
  (`miniParked`: world false, the 술래, or my own body past the line) returns before `updatePlayer`.
- `guestSend`: `mi: NET.mi` beside `pr` (left out when null).
- `applyView`: a new `g.pa.i` resets `G.mloc`, `NET.mi`, `NET.rtHi` (with `NET.pred` / the magazine, as today);
  `guestUpdate` keeps `NET.rtHi = max(NET.rtHi, NET.rt)` for 술래's pips and look (6.4).
- `partyView` / `miniView`: the three new `view`s mirror their `g.mg` row (bounded by `nInt` / `nStr` as every view).
- Sounds that are each page's own (`ticket`, `item`, `scald_splash` in 바나나우유; `puff`, `pop`, `b_splash`, `item`,
  `hurry` in 펑) are played by every page from its own measurements and its mirror; the host plays them with `NET.rec` off
  so they never echo (9.2).

### 7.5 Other modes

Battle and co-op never see any of this: every new branch checks `G.mini` (and its `MINI` flags), `pq` / `downP` /
`G.drawT` are read only by the party, `mi` is sent only while `G.mini` plays. `battle-net`, `mp-net`, `trophies-net`,
`kits*` and `touch` must stay green (one suite run).

---

## 8. UI

### 8.1 Korean texts (verbatim; all warmed through `PARTY_TEXT`, which now also maps every `MINI` `keys` / `keysT`)

| Where | Text |
|---|---|
| 바나나우유: name / how / rule | `바나나우유 잡기` / `바나나우유가 나오면 바로 눌러요!` / `다른 간식이나 딸기우유에 누르면 물벼락 -1점 · 빠를수록 점수가 커요` |
| 바나나우유: keys / keysT | `Z 또는 X로 잡기` / `점프나 거품 버튼으로 잡기` |
| 펑: name / how / rule | `펑! 비눗방울` / `연타로 불고 아래로 날려요! 터지면 꽝` / `흔들리면 조심, 반짝이면 바로 날려요 · 클수록 점수가 훨씬 커요` |
| 펑: keys / keysT | `Z·X 연타로 불기 · ↓ 날리기` / `점프·거품 연타로 불기 · 조이스틱 아래로 날리기` |
| 술래: name / how / rule | `살금살금 술래` / `술래가 돌아보면 멈춰! 먼저 닿으면 3점` / `모두 한 번씩 술래 · 움직이다 들키면 거품에 갇혀 뒤로 · 술래는 잡을 때마다 1점` |
| 술래: keys / keysT | `←→ 살금살금 · Z 점프 · 술래는 X 연타` / `조이스틱 걷기 · 점프 · 술래는 거품 연타` |

`PARTY_TX` additions (`{0}` filled at run time):

| Key | Text | Where |
|---|---|---|
| `mkFake1` / `mkFake2` | `가짜 간식이 나와요!` / `바나나우유만 잡아요` | 바나나우유 round 3 banner |
| `mkPink1` / `mkPink2` | `딸기우유 조심!` / `분홍색은 참아요` | round 5 banner |
| `mkNone1` / `mkNone2` | `바나나우유가 없었어요!` / `참은 친구 +1점` | a NO-GO round's reveal banner |
| `mkFoul` / `mkSlow` / `mkHeld` | `반칙!` / `느려요` / `참았다!` | word pops over the animals at the reveal |
| `mkSplash` / `mkEarly` / `mkDecoy` | `물벼락!` / `너무 빨리 눌렀어요` / `바나나우유만 잡아요` | my own line on a 반칙 (main / sub: early or too fast / on a decoy) |
| `pfPop` / `pfMax` | `펑!` / `만점!` | 펑 word pops |
| `pfLast1` / `pfLast2` | `마지막엔 꼭 날려요!` / `안 날린 방울은 터져요` | my own line 5 s before my window ends |
| `pfDone1` / `pfDone2` | `다 불었어요!` / `친구들을 기다려요` | my own line after my window, until the host's 끝! |
| `snIt` | `술래` | the 술래's name tag prefix (`술래 · 냥냥`) |
| `snOrder` | `술래 순서: ` | the card's team line |
| `snNext` / `snNext2` | `다음 술래: {0}!` / `술래가 돌아보면 멈춰요!` | the swap banner |
| `snMe1` / `snMe2` | `이번엔 내가 술래!` / `거품 연타로 외쳐요` | my own line at my round |
| `snCount` | `이번 술래: 나!` | the countdown's 2 / 1 sub, my screen, when I am the first 술래 |
| `snChant` / `snTang` | `뽀득뽀득목욕탕` / `탕!` | the chant's word pops (syllable k of the string), the turn's banner |
| `snCaught` / `snFeint` / `snArrive` | `들켰다!` / `흠칫!` / `도착!` | word pops |
| `snMoved1` / `snMoved2` | `움직였어요!` / `연타로 빠져나와요` | my own line when caught |
| `snHurry1` / `snHurry2` | `3초!` / `빨리 와요!` | after the first arrival |
| `gamesN` | `바나나우유 잡기 · 펑! 비눗방울 · 살금살금 술래` | the room's rules (built from the new games present) |

The how lines are one line each (14 / 15 / 16 syllables, ≤ 17). No string uses the retired v1 title's syllables
(`final-e2e2`). The canvas font draws only digits and `- x ! : . + /`: times (`0.27`), scores, `-1`, `+3`, `2/4`, `0:23`.

### 8.2 DOM

No new element. The card's keys line reads `MINI[id].keys` / `keysT` (polish 5); the demo canvas, the team line (술래's
order) and the banners exist.

### 8.3 Fit

| View | 1x window (17.4em x 16.6em of content, no rule line) | 568x320 phone (21.4em x 20.3em, rule line shown) |
|---|---|---|
| 바나나우유 / 펑 card | as 물 / 왕관's (polish 14.1: 181 px of 224): round, name, demo, how, keys (≤ ~15em at 0.8em), ready row, button, bar | + the rule line (2 lines at 0.82em) and the touch keys line (펑's ≈ 19.5em, the longest: the fit test checks it is one line; fallback `점프·거품 연타 · 조이스틱 ↓ 날리기`) |
| 술래 card | as 축구's with its team line (206 px of 224): the order line ellipsizes each nick | as 축구's (18.05 of 20.3em) |

### 8.4 HUD

- 바나나우유: line 2 the bottle icon + points; `3/8`.
- 펑: line 2 the bubble icon + score; my window `0:23`.
- 술래: line 2 points, the towel icon on the 술래's panel; `2/4`.
- No magazine pips in the three (`noFire`).

---

## 9. Sprites and sound

### 9.1 Sprites (no new sprite; `REQUIRED` / `SPR_SIZE` unchanged)

| Need | Reuse |
|---|---|
| The drinks | `item_banana_milk`, `item_yogurt`, `item_sikhye`, `item_egg` at 2x (32 px); 딸기우유 = `tintOf(item_banana_milk, '#ff8fb1', 0.6)` |
| 물벼락 | `lg_2` (the yellow 바가지, 8x8) at 2x, `water_cold_top` drops |
| 매점, stalls, stools, start line, touch zone, pips, the red edge, the down arrow | canvas |
| Bubbles | `giant_bubble` (seat-tinted), `bubble_pop`; the shower `shower` (16x8) |
| The 술래's 양머리 | `item_towel_hat` at 8 px; HUD icons `item_banana_milk` / `bubble` / `item_towel_hat` at 8 px |
| Poses | the animals' `idle`, `jump`, `shoot`, `die` frames via `pose` |

### 9.2 Sound (`audio.js`, in the `SFX` table's style)

| Name | Sound | Echo |
|---|---|---|
| **new** `puff` (o.n 0..10) | a 40 ms soft band-passed noise "푸" (as `shoot`'s, quieter: v 0.12), centre 500 Hz + 120 Hz x `o.n` (the pitch rises as the bubble grows) | **local** (`NO_ECHO`) |

Reused: `ticket`, `item`, `scald_splash`, `countdown` (바나나우유, each page's own); `pop`, `b_splash`, `item`, `hurry`
(펑, each page's own); `chain`, `stamp`, `trap_player`, `escape`, `extend`, `item`, `hurry`, `ready` (술래, echoed from the
host). Each page's own sounds are played by the host with `NET.rec` off (a sound like `scald_splash` also echoes in
battle and co-op, so it cannot go into `NO_ECHO`). Music: `battle` as for every 판.

---

## 10. Constants (top constants block, next to `CROWN2` / `BALL2`)

```js
  const PARTY_V = 4;
  const STAGE_X = { 2: [100, 156], 3: [72, 128, 184], 4: [44, 100, 156, 212] };   // world: false - feet centres by players
  // 바나나우유 잡기: rounds, NO-GO rounds (among from..8, never adjacent), the intro (unarmed), the wait to the milk, a decoy's
  // frames on the counter and the gap between appearances, decoys from round dFrom (1) / dTwo (up to 2), 딸기우유 from
  // pinkFrom; a valid grab minMs..maxMs after my draw; the host's close cap after the milk / the end; a seat with no new
  // body state for staleF frames is not waited for (also 펑's over); the reveal; my splash; points by place and for a
  // 반칙 / a NO-GO hold; the teaching ring up to ringTo; kbAdj: ms added to a keyboard page's RT
  const MILK = { rounds: 8, nogo: 2, nogoFrom: 4, intro: 30, wait: [72, 180], decoyF: 30, gapF: 24, dFrom: 3, dTwo: 5, pinkFrom: 5,
    minMs: 100, maxMs: 1500, capF: 180, staleF: 30, revealF: 60, splashF: 48, pts: [3, 2, 1, 0], foul: -1, held: 1, ringTo: 4, kbAdj: 0 };
  // 펑! 비눗방울: my window (ms), % per puff, ms between counted puffs, the dip / foam (ms), pop sizes lo..hi (%), the
  // tremble (±1 px) / the bigger tremble (±2 px) / the flash at this share of L, my bell (ms before the end), the host's
  // wait for the last reports (f)
  const PUFF = { winMs: 45000, step: 3.4, gapMs: 66, dipMs: 600, foamMs: 1000, lo: 40, hi: 110, shake: 0.7, shake2: 0.85, flash: 0.9, bellMs: 5000, waitF: 120 };
  // 살금살금 술래: rounds and caps (s) by players, the swap; the runners' walk (x WALK); the chant (f between syllables, the
  // idle before it moves by itself, then every autoF; 욕 -> 탕), the look, its grace, the freed exemption, the feint; the
  // look's move tolerance (px); the rt clamp; the prisons' drift (px/f); 3초!; arrival points; catch points (cap a round)
  const SNEAK = { rounds: { 2: 4, 3: 3, 4: 4 }, cap: { 2: 12, 3: 16, 4: 13 }, swapF: 72, walk: 0.7,
    sylF: 6, queue: 3, idleF: 60, autoF: 24, tangF: 21, lookF: 90, graceF: 10, freeF: 30, feintF: 8, feintFrom: 3,
    moveTol: 2, lagMax: 60, drift: 1.2, hurryF: 180, arr: [3, 2, 1], catch: 1, catchMax: 3, progPx: 16 };
  // MINI: milk 75 s, sneak 80 s (safety caps: they end by their last round), puff 45 s (its window); fastSecs 30 for
  // milk / sneak (the fast debug party; every other game keeps 12); MINI_IDS = ['water', 'crown', 'ball', 'milk', 'puff', 'sneak']
```

Tuning knobs after the friends' next play: `MILK.wait` / the decoy counts / `nogo` (how tricky), `PUFF.shake` / `flash`
(how readable the warning is on a phone), `PUFF.lo` / `hi` (how greedy), `SNEAK.walk` and the caps (round length),
`SNEAK.catchMax` (how strong the 술래 role is).

---

## 11. Code placement

| File | What |
|---|---|
| `game.js`, top constants | `PARTY_V` 4, `STAGE_X`, `MILK`, `PUFF`, `SNEAK`; `MINI.milk / puff / sneak` (with `world`, `noFire`, `cues`, `fastSecs`, `keys`, `keysT`); `MINI_IDS`; `partySecs` reads `fastSecs`; `PARTY_TX` additions; `PARTY_TEXT` adds `keys` / `keysT`. |
| `game.js`, input layer | `pressQ`, `evT`, `dbgPq`; `onKeyDown` / `bindTouch` push (and `'down'` from a fresh ↓ and from `stickMove`'s down edge, which takes the event time from its two callers); `readInputs` sets `pq` (all entries, none while the menu is open or outside 'playing') / `downP`; `loop` keeps `frameT`, `render` sets `G.drawT`; `pageNow`. |
| `game.js`, world | `updateBody` / `guestSelf` early return (`miniParked`; a guest's own arrival by its own x); `fire()` guard (`noFire`) and `hostShot` drops a `'shot'` while `noFire`; `updatePlayer` walk factor `SNEAK.walk` for a runner; `kitOf` → `KIT_BASE` in a 술래 판; `floatMove` 술래 branch; `updateWorld` → `updateBattle(ins)` → `miniTick(ins)`; `updateBattle` skips the cues (`cues === false`). |
| `game.js`, party section | the `partyPlan` replan fix (3.6); `miniLoad` (`G.mloc`, the seed, stage spots); `miniTick(ins)` → `local` / `input`; `miniParked`; `coinAct`; `partyTeamLine`'s 술래 branch; `troCountSub`'s 술래 line; the stale-seat test (`MILK.staleF`) shared by 바나나우유's close and 펑's `over`. |
| `game.js`, the games (after 축구's section) | 바나나우유: `milkInit`, `milkPlan`, `milkTick`, `milkLocal`, `milkInput`, `milkClose`, `milkView`, `milkDraw`, `milkPose`, `milkHud`, `milkDemo`. 펑: `puffL`, `puffLocal`, `puffInput`, `puffOver`, `puffView`, `puffDraw`, `puffPose`, `puffHud`, `puffDemo`. 술래: `sneakSpawns`, `sneakInit`, `sneakTick`, `sneakChant`, `sneakLocal`, `sneakInput`, `sneakJudge` (in the tick: host-local bodies, remote `rem.buf` states by monotonic `rt`, the T+10 anchor and the `vx` test), `sneakArrive`, `sneakRound`, `sneakView`, `sneakDraw`, `sneakHud`, `sneakDemo`; `MINI_FN` entries. |
| `game.js`, render / HUD | the player draw loop's `pose` swap; `drawHUDParty` `clock`, no mag pips for `noFire`; `syncTags` the game's `tagY` anchor (펑 over the biggest bubble), the 술래 prefix and the stacked tags of animals on one spot; `drawPartyDemo` unchanged (the demos take `a`, `b`; 술래 derives `c`). |
| `game.js`, net | `parseBody` `mi`; `guestSend` `mi`; `hostBodyIn` stamps `s.at = G.frame` (host-side, for the 60 f clamp) - no game logic there; `applyView` resets `G.mloc` / `NET.mi` / `NET.rtHi` per 판 index. |
| `game.js`, debug | `PG.debug.party`: `press(slot, act, t)`, `vclock(on)`, `drawAt(t)`, `down(slot)`, `mloc(slot)`, `mi(slot)`, `milk()` (the round's plan), `puffL(seed, k)`, `look()` (술래: force a turn now), `it()`, `arrive(slot)`, `fakeBody(slot, st)` (push a remote state with its own `k` / `rt` / `ep` into that seat's `rem.buf`, as `hostBodyIn` would - today's `fakeRemote` only sets `rem.st` and an empty buffer); `state().mini` and `consts()` gain the new fields; `fast(on)`: 바나나우유 4 rounds, 펑 a 12 s window, 술래 2 rounds of 6 s (each within its `fastSecs` 30). |
| `levels.js` | `PG.PARTY_ARENAS[2]` 무대 목욕탕 (`'stage'`), `[3]` 살금살금 복도 (`'sneak'`, its `sneak` field). Engine: `PARTY_KEYS = ['water', 'ball', 'stage', 'sneak']`, `fallbackPartyArena` for both, `sneakOf`. |
| `sprites.js` | nothing. |
| `audio.js` | `puff` (~15 lines). |
| `tools/validate-levels.js` | `PARTY_KEYS` / `PARTY_NAMES` + the two arenas: `'stage'` closed, mirror-exact, nothing solid between rows 1 and 24, every `STAGE_X` spot standable; `'sneak'` closed, mirror-exact, `start` / `it` open air on the floor, `line` between them at least 120 px past `start`, nothing solid on rows 21-24 between them but the two stools, each stool 1-2 tiles high with 3 rows of air above (a normal jump clears it). |

---

## 12. Build order, cut lines, effort

Each step leaves the party playable.

1. **Must - shared machinery**: `PARTY_V` 4, `MINI` flags, the `partyPlan` replan fix (3.6), the stage arena (+ fallback,
   validator), the freeze / `noFire` / cues, `pressQ` (with `'down'`) / `evT` / `G.drawT` in `render` / `pageNow`, the hooks
   `local` / `input` / `clock` / `pose` / `frozen` / `tagY`, `fastSecs`, the stale-seat test, `mi` on the wire, `G.mloc`,
   `coinAct`, the texts, the debug hooks (`fakeBody` included), the rewritten rotation / flow checks.
2. **Must - 바나나우유 잡기**: rules, NO-GO rounds, 딸기우유, the 매점 scene, poses, times, HUD, demo, wire; its tests.
3. **Must - 펑! 비눗방울**: rules, the seed, warnings, stalls, poses, HUD, demo, `puff`; its tests.

   **— cut line: two new games ship here (the rotation runs with 5) —**

4. **Should - 살금살금 술래 core**: the 'sneak' arena (+ validator), rounds and roles, the chant (6 f, auto, 21 f, word
   pops), the look judge (host-local by frame, remote from `rem.buf` by monotonic `rt`, the anchor + `vx` test, the 60 f
   clamp, the freed-in-a-look exemption), catches into drifting prisons, arrivals by stamp (a guest freezes itself),
   `3초!`, points, HUD, the base kit / walk / `noFire`, demo; its tests.
5. **Could**: 술래's 흠칫! feint (fallback: no feint), the guest 술래's predicted pips (fallback: the host's pips, a round
   trip late), the card's 술래 order line; 펑's banked-bubble column art (fallback: the score digits only).

**Effort**: about **2,900-3,400 changed lines**: `game.js` ~1,650 (machinery ~400, 바나나우유 ~350, 펑 ~320, 술래 ~580),
`levels.js` ~50, `validate-levels.js` ~60, `audio.js` ~15, tests ~1,100-1,300 (`party.js` ~650 incl. rewriting today's
rotation and flow checks, `party-net.js` ~400 incl. the `#lag` run, `touch.js` ~40, `check-integration` / `audio-node`
small). For scale: the polish PR (#23: no new game, less new machinery) was about 2,400 changed lines in `src` / `tools`
and took four build commits plus a review fix; 거품 축구 alone (#21) was about 900. 술래 by itself is a 축구-sized PR (an rt judge is
harder than a ball). So: **three lean build passes** (1: steps 1-2, 2: step 3 and the online tests of both, 3: steps
4-5 if time allows), **one check, one full suite run** (`node tools/run-all.js`, every Chrome run with `--mute-audio`).
The cut line is real: plan for 바나나우유 + 펑 and treat 술래 as the bonus.

---

## 13. Tests

### 13.1 `src/tests/party.js` (virtual time, stepped; `vclock` sets press and draw times exactly)

1. **Machinery**: a `world: false` 판 parks every animal (no motion, no blink, `invuln` 0), a 거품 press makes no bubble
   and no blow (`CO.bshots` unchanged by `coinShot`), no magazine pips, no `10초 남았어요!` / beeps; `pq` carries each press
   with its time (two in one frame = two); `downP` is an edge; `local` → `input` runs for a host-local seat; `mi` is
   bounded (`parseBody` of junk); `G.mloc` resets at a new 판; `coinAct` counts only my seat; `pq` is empty while the menu
   is open and carries nothing stale into the next frame; a `'down'` entry orders a bank before a later puff of the same
   frame; `G.drawT` moves under `D.step` (set in `render`); a world: false game's name tags use its `tagY`; a 'shot'
   message during a `noFire` game makes no bubble; `fastSecs` reaches `G.battle.total` in the fast party.
2. **Rotation** (owner: draw freely): over 300 seeds for 2, 3 and 4 players and 3 / 5 판: every game that fits shows up
   (each of the six for 2 / 4, the five for 3), no game twice in a row, 3판 and 5판 all distinct, 3 players never 축구;
   with only two new games (`MINI` without `sneak`) no game twice in a row; a replan from a played prefix never repeats a
   played game while an unplayed one fits; a 4 → 3 replan during a 축구 card draws what fits; `partyForced` unchanged. **Today's checks that break and are
   rewritten**, not just added to: `rotationTests` ("2 / 4 players play each of the three once in 3판", "3 players: A B A",
   "any of the three may come first", the replans from `['water']` / `['crown', 'water']`) and `flowTests`' "a 4-player 3판
   party plays each of the three games once" (unforced: it now draws new games; give it a forced old-games plan, or assert
   the families). Every other unforced `party(...)` in party.js is checked for the same assumption.
3. **바나나우유**: the plan (decoys by round, 딸기우유 from 5, two NO-GO rounds in 4-8 never adjacent, events never in
   `g.mg` before their tick); my result for presses at -50 / 0 / 99 / 100 / 1500 / 1501 ms around my draw, on a decoy, in a
   NO-GO round, no press; the 물벼락 ignores later presses; round points 3 / 2 / 1 / 0 with a shared ms, -1, +1; close on
   all reports and at the cap (a missing one is 느려요); a fake remote seat whose states stop (`staleF`) is not waited for;
   the key's ms tie-break; 8 rounds then the end (never cut by the clock: every round at its cap still finishes); coins per
   valid grab; a leaver mid-round; a round 5-8 whose wait drew under 108 f has one decoy; the ring only in rounds 1-4;
   an event at tick e is drawn from `mg1` when `a.k < e <= rt`; a view clock stepping back after the milk was drawn keeps
   it drawn (one draw time).
4. **펑**: `puffL` is pure and in 40-110; the 66 ms cap (presses at 50 ms count every other one); 30 puffs → 만점 at 100;
   a pop exactly at L_k (L_k 99 / 100 pop on the 30th puff), none above 100; the tremble / bigger tremble / flash
   thresholds; the dip / foam block puffs; a bank and a puff in one frame in time order; the bell's pop at the
   window's end; the window is wall-clock (a virtual-clock jump of 2 s during dropped frames still ends at 45 000 ms); the
   key (score, pops, bubbles); `over` waits for done reports or 120 f; clamps of a junk row; coins per finished bubble.
5. **술래**: rounds for 2 / 3 / 4 players and the order by 판 index; the chant's 6 f rule and queue, the auto-advance (60 f
   then 24 f), T = 욕 + 21; the feint's window (syllable 3 to 욕, once); the look's edges (moving at T+9 is safe, at T+10
   caught; 1.9 px safe, 2 px caught; airborne caught; trapped / arrived / freed < 30 f exempt); **a runner mashed out in
   the middle of a look is not caught again by its release hop**; a catch → a prison owned by
   the 술래, drifting left 1.2 px/f, mash-out (`esc` with 3+ presses), `caps` for the 술래 (points capped at 3 a round);
   a remote runner judged by `rt` through `fakeBody` states (one whose states stop at its own T+5 is safe even when they
   arrive 40 f late; one with `rt` stuck 90 f back is judged at host − 60; a state at T+12 with `vx` 0.875 catches it
   though its position is still within 2 px of the anchor; states at T+0 and T+40 only, of a runner that stopped at T+9,
   never catch it (no interpolated anchor); a state of an older epoch is never judged; `rt` stepping back by 60 in
   mid-look neither catches a runner that stopped nor gives an earlier arrival); arrivals ordered by `rt` not by arrival;
   catch + arrival in one state → caught; a runner crossing the line stops on its own page that frame; `3초!` and the wait for in-flight states; the 술래 leaving ends its round; base kit and no bubbles; the 4-player 판 with
   every round at its cap and every wait at 60 f still plays its 4th round; coins (arrival, survived look with 16 px, a
   chant with 3 presses).
6. **Demos**: each new `demo` draws 240 frames into a 96x32 context without errors and leaves pixels.
7. **Fit**: each new card (4 players, 12-syllable nicks; 술래 with its order line) at **1x** (no rule line; how and keys one
   line each), **2x** and the **568x320** phone (`#fit`, touch keys line, rule line): `scrollHeight <= clientHeight`.
   `PARTY_TEXT` holds every new string.
8. **No regressions**: a battle and a co-op round after a party: bodies move, bubbles fire, `pq` unused, the magazine back.

### 13.2 `src/tests/party-net.js` (4 bc frames, real time)

The fairness checks need a slow guest, but today's sections (물 v2's "within 1 px", "a 오리 튜브 on every screen within
0.5 s", the beats) were tuned on frames at `lat=8&jit=4`; putting frame 3 at 100 / 40 for the whole run would test those
on a link they were never meant for. So the new games run in a **second load**: `test-party-net.html#lag` builds the
four frames with frame 3 at `?lat=100&jit=40` (the others 8 / 4) and runs only sections 2-5 below, as a new `run-all`
job `party-net-lag` (rt300000). The plain run keeps every frame at 8 / 4 and adds 1 and 5. (net.js applies `lat` on both
ends of each page's link: frame 3 to the host is about 100 + 8 ms plus up to 44 ms of jitter each way.)

1. Adjust: the crafted older guest sends `pa: 3`; the plans of the forced parties include the new codes.
2. **바나나우유** (forced): the same rounds and events on every page; the host's own player and frames 1 and 3 each press
   **250 ms after their own draw** of the milk (`D.pressAfterDraw(ms)`: at the page's own first draw of the milk it sets a
   `setTimeout` that dispatches a real `keydown` - so `evT` and the rAF time base are really exercised, not a stamp the
   test wrote): each page's reported RT equals `round(that event's timeStamp - its recorded draw time)` exactly (the
   plumbing), and lies in 250..300 ms (a timer runs late, never early; four frames share one main thread); with frame 3
   scripted at 200 and frame 1 at 320, frame 3 places above frame 1 despite its lag (a 120 ms gap no timer lateness can
   flip - 240 vs 260 could); a scripted press on a decoy splashes on every page; the reveal rows agree everywhere.
3. **펑** (forced, fast: a 12 s window): frames 1 and 3 run the same press pattern from their own 시작! (8 Hz puffs, down
   at the tremble, then at the flash) and stop pressing 2 s before their window ends (the last bank in, so the window's
   edge cannot add or cut a puff by timer luck); they end with **the same score, bubbles and pops**; the host places by
   the done reports; friends' pops play `pop` on every page once.
4. **술래** (forced, 4 players): frame 3 as a runner stops 5 f after its own view shows 탕! - never caught over 3 looks;
   the same runner walking through a look is caught on every page (a prison owned by the 술래); frames 1 and 3 reach the
   line with `rt` stamps 12 f apart, frame 3 first - frame 3 is ordered first though its state reached the host later (12,
   not 4: the playout delay's drift moves a stamp by a few ticks, 6.4); a guest 술래's chant reaches the host and T is
   the same on every page; INFO: each guest's playout delay at each round's start and end.
5. Snapshots stay under 3400 bytes throughout; `mi` appears only during the new games.

### 13.3 Other tests and jobs

- `src/tests/touch.js`: a pointerdown on 거품 pushes a `pq` entry with its event time; both buttons in one frame give two;
  the stick pulled down while the 거품 button is held gives `down` and keeps the presses (two thumbs); the stick's down
  edge pushes one `'down'` entry with the pointermove's time (a stick held down pushes no more; the hysteresis release
  and a new pull push the next).
- `tools/validate-levels.js`: the two new arenas (section 11).
- `tools/check-integration.js`: every new literal sprite name the engine draws exists with its size (`item_*` 16x16, `lg_2`
  8x8, `shower` 16x8, `giant_bubble` 40x40).
- `tools/audio-node-test.js`: `puff` with `o.n` 0..10, no NaN, under the sfx level.
- `check-pages` / `final-e2e2`: the warm-up text; `ux-roomrow` (also at 320): the rules list's new lines fit.
- `run-all.js`: `party`, `party-fit-568`, `party-net` as today plus **`party-net-lag`** (13.2). `party`'s 120 s budget is
  checked once the new sections are in (three more games in virtual time). One full suite run at the end, `--mute-audio`.

---

## 14. Risks

1. **Device input lag** (바나나우유): phone touch is 20-60 ms slower than a desktop key, 120 Hz screens draw sooner.
   Accepted (all friends on phones); `MILK.kbAdj` is the knob.
2. **The time bases** (`event.timeStamp` vs the rAF time): both high-resolution in current browsers; `evT`'s fallback
   covers an odd engine. party-net dispatches real key events and checks each page's RT is exactly its event time minus
   its draw time (13.2).
3. **A hidden or stalled tab** misses 바나나우유 rounds as 느려요 and ends 펑 with what it banked: the same as a hidden tab
   anywhere. Its silent body stream (`MILK.staleF`) means nobody waits for it, so the others' rounds keep their pace. A
   guest whose report lands after the close sees its own `0.27` and then `느려요` from the host: rare (the honest worst
   case is in by `m` + 130 f of the 180 f cap).
4. **펑's warning on a phone**: if the tremble is too subtle, pops feel random. `PUFF.shake` / `flash` are the knobs; the
   flash is a white blink, not a colour shift.
5. **Thumb fatigue** (펑): 45 s with natural pauses (dip, foam, the decision); the 15/s cap stops it being a pure speed
   contest.
6. **"I stopped!"** (술래): the 10 f grace and 2 px cover a stop; my own line says why I was caught; a hop near 탕! is
   the risk by design. The judge by `rt` is the most delicate code of the PR - party.js and party-net cover its edges. Two
   small biases stay (6.4): a remote runner can walk for up to the gap between two of its received states (2-6 f) after
   T+10, and a guest whose playout delay grows during a round gets its arrival stamp a few ticks early. Both are smaller
   than a human stop; both go the guest's way, never against an honest player.
7. **The 술래 role's strength** is a guess (catch points capped at 3 a round); the friends' play tunes it. In numbers: a
   runner who sees 욕 has 21 + 10 = 31 f (0.5 s) to stop, twice a normal reaction, so an attentive runner is rarely
   caught; the 술래's catches come from greed (walking on after 욕), hops started after 욕 (37 f of air), the feint and
   the look's end (moving at T+89 is still a catch). If catches are too rare: `SNEAK.tangF` 21 → 15 or `graceF` 10 → 6.
8. **The world: false freeze** touches shared code (`updateBody`, `guestSelf`, `fire`, the HUD, `syncJumpSub`, the cues):
   every branch is behind `G.mini` and a `MINI` flag; battle / co-op / kits tests must stay green.
9. **Self-reported results** (`mi`): a modified page can lie within the clamps. The same trust as bodies, fine for 4
   friends.
10. **Rotation change**: with six games in one bag a group that loved 물 sees it less often (owner: draw freely, 15.2).
    Today's rotation tests assert the old bag (each of the three once in 3판) and are rewritten (13.1).
11. **Squid Game association** (술래): no doll, no elimination, our chant, bubbles and a towel hat - cute, not grim.

---

## 15. Open questions for the owner (answered 2026-10-29: 1 yes, 2 **draw freely from all six**, 3 -1, 4 on for 2)

1. **No 기억력 game in this PR** (목욕탕에 가면 / 간식 찾기 were proposed): the three picked play louder and read faster
   from the demo. **Default: left out**; it is the next game if the friends want more.
2. **The rotation always alternates** arena / new games. **Default: alternate** (alternative: draw freely from all six).
   **Owner: draw freely from all six** (3.6).
3. **반칙 in 바나나우유 costs a point** (-1), not just 0. **Default: -1** (it is what stops random mashing).
4. **살금살금 술래 with 2 players** (1 v 1, each the 술래 twice). **Default: on** (alternative: leave it out for 2, as 축구
   is for 3).

Everything else (round counts, timings, thresholds, caps) is a tuning knob (section 10), not a question.

---

## 16. Considered and left out

- **목욕탕에 가면** (기억력, a growing chain): the hardest to read from a 4 s demo, the most cerebral, and the likeliest to
  land as `싱거워요`. Kept as the memory candidate.
- **간식 찾기** (기억력, a shuffle): several seconds of watching per round before one pick (the "everyone active" rule).
- **거품 풍선 불기** (연타, three 7 s mashing heats): pure speed with less to decide; its strongest part (a page counts
  its own presses in its own window) is in 펑. Its stick-shake heat would fight the floating stick.
- **뜨거운 물 대장** (1대3, a dropper on a catwalk): balance across 1v1 / 1v2 / 1v3 is a guess, it adds the most new code
  paths, and 3 of 4 players still run around an arena (`다 비슷해요`).
- **눈치 게임**, **tug of war**, any live mashing race or first-to-touch between players: whoever's message lands first
  wins (latency decides), and a 1v3 tug is close to a known console minigame. **Rhythm games**: audio latency differs per
  device, worst on Bluetooth.
- Ideas merged in: 바나나우유 takes the 매점, decoys and 물벼락 of one proposal and the NO-GO rounds, the event-time
  stamps and the "events only after their tick" rule of the other; 펑 takes a seed (the other proposal's shuffle script)
  instead of a 40-entry list, and a wall-clock window; 술래 takes the `rt` judge and widens its clamp to fit a 100 ms link.
- All six are genre-level ideas (a quickdraw, a bubble push-your-luck, a playground stop-and-go game) with our own rules,
  names and art. None copies a specific minigame.

---

## 17. Check against the code (before the build)

An adversarial read of this spec against `feat/party-games` as it is (game.js party / mini / card / demo / coins /
rotation / snapshot / guest hooks / touch input, levels.js, net.js, the party tests). What it found and what changed:

| Found in the code | Consequence for the first draft | Changed |
|---|---|---|
| `miniOver` ends a 판 at time-up unless `over` plays on; 바나나우유's worst honest case (every round at its 180 f close cap) is ~62 s, 4-player 술래's 59.6 s; `partySecs` is a flat 12 s in the fast party | the clock would cut the last round (or, fast, the third) | 3.1, 4.1, 6.1, 10: they end by `M.endAt`; `secs` 75 / 80 is a safety cap; `fastSecs` 30 |
| `hostBodyIn` runs on the network's schedule, outside `update()`; it already keeps every accepted state in `rem.buf.list` | the `body` hook would make prisons, sounds and recorded events between two world frames | 3.2, 6.4: hook dropped; `sneakTick` reads `rem.buf` (epoch-filtered), `hostBodyIn` only stamps `s.at` |
| states are coalesced, about every 2 frames, and `bufPush` throws away late ones | "the first state at or after T+10" can be T+16: a remote runner walking until T+14 went free | 6.4: a `vx` test from T+12 on, for host-local runners too; an interpolated anchor was rejected (false catches across a gap) |
| `bufPush` lowers `B.off` after a late second or a starve: `NET.rt` can step back by up to a second; the playout delay grows by up to 1 tick per arrival | a look could "end" twice on a guest (an unfair catch), arrival stamps could come early; the draft said a resync "can only delay" an arrival | 6.4: monotonic `rt` on the host (`rtMax`) and on the guest's draw (`NET.rtHi`); the drift bias stated as it is |
| `releasePlayer` gives a freed animal `vy -1.6` | a runner mashed out during a look is "in the air" at once: caught again until the look ends | 6.1: freed after T+10 - 30 is exempt for the rest of that look |
| a guest's mirror learns its arrival a round trip late | a guest walks on past the line into the 술래 | 6.1: a guest freezes its own animal at its own crossing |
| `syncDOM` re-runs the banner pop for each new id; `guestBanner` only takes new ids | a banner per syllable flickers up to 10 times a second | 6.6: syllables as recorded word pops, one banner at 탕! |
| `syncTags` anchors a DOM tag at `headTop - 5`, over the canvas | 펑's bubble (its tremble / flash, the only warning) and 바나나우유's times would sit under the tags | 3.1 `tagY`; 4.6 times at y 172; 5.6 |
| a decoy needs 54 f and two need 108 f, the wait is 72-180 f | two decoys could not fit a short wait | 4.1: one decoy under 108 f |
| the round's gold ring marks the real milk | with it the 딸기우유 twin is no test | 4.6: the ring only in rounds 1-4 |
| `miniView` passes `mg1`; an event with `a.k < e <= rt` is only in `b` | events would show up to a snapshot late, with a later draw time | 4.4: `milkView` merges `mg` and `mg1`; once drawn, it stays drawn |
| one friend's hidden tab sends no body states (no rAF) | every 바나나우유 round would wait out its 3 s cap: 24 s of nothing | 4.1, 5.4: `MILK.staleF` 30 f - a silent seat is not waited for |
| `D.step` calls `render()` without `loop` | a `loop`-only `G.drawT` never moves in party.js | 3.3: `G.drawT` set in `render` |
| `downP` has no time; `pressQ.splice(0, 8)` leaves extras for the next frame; presses with the menu open | a bank and a puff in one frame in random order; stale presses | 3.3, 5.1: `'down'` entries with their time, all entries leave each frame, none with the menu open |
| `bodyAt` takes `col * 8 - 4` | 3-player stage spots are half columns | 3.1: fractional `col` (bodyAt never rounds) |
| size `3.4 x n` passes 100 on the 30th puff | pop vs 만점 at L 99-100 undefined | 5.1: the pop test comes first; only 101-110 are golden (14%) |
| ±1 game px ≈ 1.4 css px on the 568x320 phone; a puff every 66 ms | the tremble alone is hard to read; the flash cannot be reacted to mid-mash | 5.1: ±2 px from 85%; the warning is a "slow down" cue, said so |
| party.js `rotationTests` / `flowTests` assert the old one-bag rotation; party-net's sections were tuned at 8 / 4 ms | the family rotation fails today's tests; frame 3 at 100 / 40 would test old sections on a link they were never meant for | 13.1 rewrites them; 13.2 a separate `#lag` load and `party-net-lag` job |
| scripted presses stamped by the test would make the RT check trivially true; timers run late in 4 frames on one thread | 250 ± 17 and 240-vs-260 would be either meaningless or flaky | 13.2: real dispatched key events, an exact plumbing check, 200 vs 320 ms; arrivals 12 f apart |
| the polish PR was ~2,400 changed lines in four build commits + a fix, 축구 alone ~900 | 2,300-2,600 / two passes for three games + machinery was low | 12: ~2,900-3,400, three passes, 술래 as the bonus |
| `partyReplan` calls `partyPlan` with the 판 already played | the draft's fresh bags could bring back a played game while another was unplayed | 3.6: a replan's first bag per family leaves out what `from` played |
| `fire()` holds `guestFire`, `hostShot` takes any `'shot'` | - | 3.1: `hostShot` drops a `'shot'` while `noFire` |

Checked and fine as written: the PARTY_V gate (`seatReady` / `seatOld` read `pa >= PARTY_V`), plan codes `m f s` (no
clash with `w c b`), `MINI` / `MINI_FN` dispatch, `rankBy` keys (no overflow), `coinAct` into `CO.bshots` (reset by
`coinGo`, read by `coinPartyClose` / `coinParty`), the awards' counters (`trapPlayer` owner ≠ victim, `escapeTrap`
with `ESC_MASH`), `KIT_BASE` through `kitOf`, `WALK` 1.25 x 0.7 = 0.875 px/f, the base jump (37 f of air, 38 px),
`STICK_DN_ON` / `ny >= 2|nx|`, the canvas font (digits, `- x ! : . + /`), every reused sprite, `NO_ECHO` (`b_splash`
already in it), word pops recorded through `netEv('w')`, the card's `keys` / `keysT` path, `#pg-party-demo` hidden
only under 17em of height (the 1x window is 20.4em), `viewKindOf` / `loadView` for party arena indexes 2 and 3, the
snapshot budget.

---

## 18. As built: builder 1 (the shared machinery + 바나나우유 잡기)

### 18.1 Where the code differs from the text above

| Spec | Built | Why |
|---|---|---|
| `PARTY_V` 4 | **5** | main's polish is 3, fix/crown-last takes 4; the verify step sets the final value after merging main. party-net checks `PV >= 5` and its crafted older guest sends `pa: PV - 1`. |
| The milk stays drawn "until the reveal" | the same, and through the reveal **when nobody grabbed it** (ringed) | an empty counter at the reveal of a GO round read as "there was no milk". |
| The fastest "holds the bottle over its head" | in its **paws** (12 px, on its counter side, the reveal's hop) | the DOM name tag sits over the head and hid it. |
| `g.mg` 바나나우유 `['m', r, ph, events, C, rows, totals]` | + **`n`** (the round count) as `mg[7]`; during the wait (ph 0) `rows` carries the **반칙 so far** (`[slot, 0, 2, -1]`), from the reveal every seat's row | the guest's `3/8` needs n (the fast party plays 4); a friend's 물벼락 then shows on every page as it happens, not only at the reveal (a 반칙 cues nobody to press; grabs stay hidden until the reveal). |
| A missing NO-GO report | 느려요 (flag 4, 0) | only a stale seat can miss one. |
| NO-GO round shape | decoys at `arm + ri(24, 72)`, then `+ 54 + ri(0, 40)` each; the end 60 f after the last leaves | the worst honest 판 (every round at its 180 f cap) is ~66 s, still under the 75 s cap (tested). |
| `MILK` | + `fast: 4` (the fast party's rounds), `endF: 30` (the 판 ends 30 f after the last **reveal ends**) | |
| `clock(M)` returns a string | a string **or `[string, warn]`** (red blinking) | 펑's `0:23` under 10 s. |
| `G.drawT = vclock ? pageNow() : frameT` | `VCLOCK` moves `STEP_MS` per world frame by itself (`vclock(on, t)`, `drawAt(t)` sets it) | a stepped test then has exact, moving draw and press times; `evT` ignores `timeStamp` while it is on. |
| Debug presses | `P.press(slot, act, t)`, `P.down(slot, t)`, **and** a debug seat's rising edge (`D.press`) queues a pq entry at the page clock | `tap()` works in the new games. |

### 18.2 New code (game.js unless named)

- Constants: `PARTY_V` 5, `STAGE_X`, `MILK`, `MINI.milk` (`c 'm'`, `world: false`, `noFire`, `cues: false`, `fastSecs` 30,
  `keys` / `keysT`), `MINI_IDS` + `'milk'`, `MINI_OLD` 3 (the arena games; the room's rules list the rest on a line of their
  own, `partyRules`), `PARTY_TX` `gamesN` / `mk*`, `PARTY_TEXT` warms every `keys` / `keysT`.
- Input: `pressQ` / `pressPush` / `evT` / `pageNow` / `VCLOCK` / `dbgPq` / `pqLog`; `onKeyDown` (점프 / 거품 / a fresh ↓),
  `bindTouch`'s `sync(e)`, `stickMove(cx, cy, t)`'s down edge; `readInputs` gives every seat `pq` (sorted, <= 8, none
  outside 'playing' or with the menu open) and `downP`; `frameT` (loop) -> `G.drawT` (render).
- The layer: `stageSpots`, `miniParked` (world false or `frozen`), `miniFlag`, `miniStale` (`rem.st.at`, `MILK.staleF`),
  `miniTick(ins)` (each local seat's `local`, each remote seat's `rem.st.mi` of this gid and 판 -> `input` when changed:
  `M.miK`; `M.miL` keeps a local seat's last mi), `coinAct`, `drawPosed` (the `pose` swap), `tagAnchor` (`tagY`; the tag
  arrows follow it), `drawHUDParty`'s `clock` and no pips for `noFire`, `syncJumpSub` (no move line for `noFire`),
  `updateBattle(ins)`'s `cues`, `updateBody` / `guestSelf` early returns, `fire` / `hostShot` `noFire` guards.
- Net: `parseBody` `mi`, `guestSend` `mi` (while playing a game), `hostBodyIn` `s.at`, `NET.mi` / `NET.rtHi` (reset per 판
  in `applyView`, kept monotonic in `guestUpdate`), `G.mloc` (reset by `miniLoad` / `applyView` / `guestBegin`).
- 무대 목욕탕: `PG.PARTY_ARENAS[2]` (levels.js, gather row 3: the validator warns under it), `PARTY_KEYS` + `'stage'`,
  `fallbackPartyArena('stage')`, `loadPartyArenas` (any known key past the list), validate-levels' stage branch.
- 바나나우유: `milkRounds`, `milkNogo`, `milkPlan`, `milkRound`, `milkTick`, `milkInput`, `milkClose`, `milkSplash`,
  `milkNow` (+ `MILK_VT`), `milkSeen` (`G.mloc.sh`: this screen's first draws), `milkDecoy`, `milkLocal`, `milkView`,
  `milkDraw` / `milkFront` / `milkRing` / `milkBest`, `milkPose`, `milkHud`, `milkDemo`, `localSfx`.
- Debug (`PG.debug.party`): `press`, `down`, `vclock`, `drawAt`, `now`, `drawT`, `fakeBody`, `mloc`, `mi`, `seen`, `milk`,
  `milkPlan`, `milkNogo`, `milkView`, `parseBody`, `pq`, `shotIn`, `viewAt`, `tagAnchor`; `consts()` + `MILK`, `STAGE_X`,
  `MINI_OLD`; `state().mini` + `r ph n C res pts ms`.

### 18.3 Tests

- party.js: the rotation rewritten for the free draw (generic over `K.MINI_IDS`: every game that fits shows up, distinct
  while the bag lasts, a replan never repeats a played game while one is unplayed); `machineryTests` (stage spots for 2 / 3 /
  4, parked bodies, noFire incl. a `'shot'`, cues, pq order / down edge / menu / real keys, `G.drawT`, `mi` bounds, `G.mloc`
  reset, fastSecs, the HUD's pips, a battle afterwards); `milkTests` (the plan over seeds, the wire never early, the draw
  frame, the judge at -50 / 0 / 99 / 100 / 1500 / 1501 / none, decoys, 물벼락, shared ms, coins, NO-GO, banners, the ring,
  8 rounds then the end, remote `mi` clamps, the cap, a stale seat, a leaver, the key, `milkView`'s merge, a view clock
  stepping back, the card); the flow / arena / leaver checks that assumed three games; demos, HUD and fit over every game;
  `#shot=milk|milkrev|milkdecoy|milkcard`.
- touch.js: pq times from pointer events, two buttons in one frame, the stick's down edge with 거품 held, no repeat while
  held. party-net: the gate at `PARTY_V` 5, the leaver's redraw from the games that fit 3 and were not played.

### 18.4 For the next builders

- 펑 (builder 2): `MINI.puff` with `world: false`, `noFire`, `cues: false`; `local` from `inp.pq` (time-ordered, `'down'`
  entries included) on `pageNow()`; the window starts at the first `G.drawT` of 'playing'; `over` with `miniStale`;
  `tagY`; `clock` returning `[m:ss, under10]`; `sit` through `pose` (any draw-time field, put back after the draw). Add
  `PUFF` next to `MILK`, `'puff'` to `MINI_IDS`, the `puff` sfx (audio.js, `NO_ECHO`). Under `vclock` a 45 s window is 2700
  stepped frames. party-net's `#lag` load and the online checks of both games are yours (`pressAfterDraw`).
- 술래 (builder 3): `frozen(M, p)` is read by `miniParked` on every page (a guest's own body x); `rem.buf.list` entries carry
  `d.rt` / `d.ep` / `d.at`; `NET.rtHi` is ready; `P.fakeBody(slot, st)` pushes into that buffer; add `'sneak'` to
  `PARTY_KEYS` / the validator / `fallbackPartyArena`, `kitOf` -> `KIT_BASE` and the walk factor are not built.
