# 뽀득뽀득 목욕탕: 파티 새 게임 2 (party games 2, PR D) v1 — design spec

> **Owner decisions (2026-10-30)** - the four questions of section 16, all answered with the recommended option:
> 1. Out players in 의자 / 계란 / 수도꼭지: **"유령이 돼서 계속 점수 (추천)"** - an out player becomes a 유령 and keeps
>    playing for points; the set's last one in gets +2; the 판 is won on points; the cards' how lines stay as pitched
>    (`…빠져요`).
> 2. Two players: **"4개 모두 2명도 해요 (추천)"** - all four games play with 2 (as with 3 and 4).
> 3. Scope: **"되는 것부터 올리기 (추천)"** - build in the order 수도꼭지 → 의자 → 계란 → 씨름 and ship what passes the
>    check; 씨름 may move to the next PR if it cannot be made solid (it touches shared physics).
> 4. 계란: **"1.2배 빨라져요 (추천)"** - the holder runs 1.2x (`EGG.run`) after its 0.75 s juggle.
>
> So every default of section 16 stands as written; nothing else in this spec changes.

> **Build 1 (2026-10-31, cut line A reached)**: the shared machinery (3.1-3.7: `PARTY_V` 8, `LAG_MAX` above `SNEAK`, 유령,
> `miniRt` / `miniStamp` / `miniPast`, the `MINI` flags, the room line, `'L' 'R' 'D'` + `stickTap` and the fixed stick
> origin in tap, `P.lastAr`, `faucet` / `fx_ghost`, `tap` / `scratch`, the `chair` song), **수도꼭지** and **의자** are in
> `MINI_IDS` (8 games). Tests: `src/tests/party2.js` (job `party2`: the machinery, both games, scenes `#shot=tap|tapgo|
> taprev|tapcard|chair|chairstop|chairrev|chaircard`), party-net's two smokes and `#lag` 4b / 4c, touch.js, audio-node,
> check-integration. Where the build differs from the text: the name tags move up over 수도꼭지's pips and over a 유령's
> wisp / a sitter (`tagY` - the DOM tag's bottom sits on its anchor and would hide them); the pips sit under the tag; the
> arrows stand outside each faucet of the cross; 수도꼭지's banners use the `low` class (they would cover the wall); 의자's
> `?` is a canvas glyph over the one standing; no `bath_stool` sprite (`drawStool`, 17). Not built yet: 계란, 씨름, the
> trophy hold line (3.8, Should).

> **Build 2 (2026-10-31, cut line B reached)**: **계란** is in `MINI_IDS` (9 games; 8 for 3 players) as section 6 says:
> the drop (never the last loser while another is there, never a stale seat), the hidden `B`, receipts on the receiver's
> screen (`eggTouch` with `EGG.slack`, the host's `shownAt` for a remote holder, the page's prediction and its three
> undos), the 45 f juggle, `since` = the stamp, `EGG.run` 1.2 in `updatePlayer`'s walk (`eggRun`, host and guest), the
> burst's wait (`miniPast`, the holder skipped) and late passes, 유령 / the survivor's +2, a leaver's re-drop (`B` pushed),
> coins (a pass, a walked round), `egg_tick` / `egg_boom`, the card, demo, HUD. Tests: party2.js (`eggTests`, the scenes
> `#shot=egg|eggpass|eggburst|eggcard`, the kits' `base` check), party-net's smoke and `#lag` 4d. Where the build differs
> from the text: the 12 px egg sits 14 px over the head (over a 유령's wisp: 8 px more) and the holder's tag moves 17 px up,
> not 6 (the tag's bottom sits on its anchor: the egg and its juggle hop need the room); `앗 뜨거!` comes only from the
> host (echoed) - a local one on the receiver's page would show twice; the `+1` pops go up over everyone who came through
> a burst. Not built: 14.2.9's "the host carries it toward C while C walks away" (the receiver's-screen pass is checked
> standing and walking the other way), 씨름, the trophy hold line (3.8).

> **Build 3 (2026-10-31, all four built)**: **씨름** is in `MINI_IDS` (10 games; 9 for 3 players) as section 7 says: 비누
> 평상 (`PARTY_ARENAS[4]`, `PARTY_KEYS` + `'sumo'`, `fallbackPartyArena('sumo')`, `sumoOf`; validate-levels' branch), the
> soap in `updatePlayer`'s `acc` (`sumoSoap`), the push bubble in `newShot` (2.0 px/f, 60 f; a wall, the 평상's side or
> its end pops it - `sumoShotEnd`, the host's world and a guest's predicted copy alike), `trappable` / `guestClaim` off,
> the push on the pushed body's own page (`sumoLocal` / `sumoInput`, `mi` relative to `F0`), falls stamped by the faller's
> own view, rafts kept in their 탕 (`raftMove`'s gated clamp), credits, 역전 (`sumoBack`), sets / the survivor / the
> reset, the last 10 s, time-up's 버텼다!, a stale seat, a leaver, the card, demo, HUD. Every shared-physics branch is
> gated on `G.mini.id === 'sumo'`; battle / co-op / kits suites green after it (see the PR's test list). Tests: party2.js
> (`sumoTests`, scenes `#shot=sumo|sumopush|sumoraft|sumocard`, `#only=<section>` to run one section), party.js's
> every-game loops and its five-arena checks, party-net's smoke and `#lag` 4e (INFO: C's fall stamped at its own view,
> the host's verdict 26 ticks later). Where the build differs from the text: the soap holds while **any foot** (x + 3 ..
> x + 13, as `landTile` stands a body) is over the 평상, not the feet centre - with the centre a push past the edge
> stopped the body standing on the 평상's last column (the normal 0.5 caught it); the 탕 rides as an array by seat in
> `g.mg` (-1 none, 0 left, 1 right) instead of bits (a non-raft's side would read as left); `hits` counts this set's
> pushes; after the set's end the survivor's beat (`survF`, pushes off, a fall still makes a raft but credits nobody)
> comes before the 72 f reset; the demo's animals are 16 px as every demo's (19); the host plays a remote seat's push
> `bounce` from its report; `더 미끌미끌!` replaces the clock's own `10초 남았어요!` banner on that frame; the debug hook is
> `soapy` (물's `soap` is taken). Not built: the trophy hold line (3.8, Should).

Status: **design**, on `feat/party-games-2` (worktree `bogeul-games2`), stacked on `feat/party-games` (PR #26, open, not
merged: 바나나우유 잡기 / 펑! 비눗방울 / 살금살금 술래, `PARTY_V` 7, the free draw). It builds on the party as built
(design/party.md), its polish (design/party-polish.md: the card with its 96x32 demo, the result beats, the last 판 x2, the
보너스상), the first new games (design/party-games.md, all of it: `world: false` and the stage arena, the press queue with
event times, `G.drawT`, the body state's `mi`, `coinAct`, the 술래 judge under latency - `rtMax` / `lagMax`) and the
party trophies (design/party-trophies.md 14: staked parties, `PARTY_TRO_MINF`, `troPartyWait`). Code is referenced by
function name, never by line number. Every function named here exists today unless it is marked **new**. **Checked
against the code before the build (section 19)**: the fixes are written into the sections; section 19 lists them and
the builder's watch list.

After PR #26 the owner asked again `미니 게임 또 추천해줘` and picked **all four** of the recommendations (2026-10-30).
This spec keeps the four pitches as chosen and refines the details:

> **Owner picks (2026-10-30; the pitches are the owner's, the details below are this spec's):**
> 1. **목욕 의자 뺏기** (추천) - 음악이 멈추면 목욕 의자에 앉아요. 의자가 사람 수보다 하나 적어서 못 앉은 사람이 빠져요.
>    끝까지 남으면 1등. (scramble elimination)
> 2. **맥반석 계란 돌리기** (추천) - 뜨거운 계란을 부딪혀서 친구에게 넘겨요. 터질 때 들고 있으면 빠져요. 왕관과 반대로 안
>    들고 있어야 이겨요. (hot potato)
> 3. **미끌미끌 비누 씨름** - 비누칠한 평상 위에서 비눗방울로 서로 밀어내요. 탕에 빠지면 탈락, 마지막까지 남으면 1등.
>    (ring-out / knockback)
> 4. **수도꼭지 순서 기억하기** - 켜지는 수도꼭지 순서를 기억해서 똑같이 눌러요. 점점 길어지고, 틀리면 빠져요. (memory)
>
> One refinement touches the pitches' words and is flagged for the owner (section 16, question 1): in the three
> elimination games an out player does not watch - it becomes a **유령** and keeps playing for points, and "끝까지
> 남으면 1등" becomes "끝까지 남으면 +2점" (the 판's 1등 is the most points). 비누 씨름's out players ride 물's 오리 튜브.

---

## 0. Decisions in one table

| Question | Decision |
|---|---|
| The four games | **수도꼭지 순서 기억하기** (`tap`: watch, then repeat a growing sequence of four faucets), **목욕 의자 뺏기** (`chair`: stools glide while the music plays; it stops, everyone scrambles; one stool short), **맥반석 계란 돌리기** (`egg`: bump the hot egg onto a friend before it bursts), **미끌미끌 비누 씨름** (`sumo`: push friends off a soapy 평상 with slow bubbles). All four genre-level, our own rules (section 17). |
| Build order and cut lines | Cheapest and most robust first: **tap → chair → egg → sumo**. Machinery, tap and chair are **Must** (cut line A: two games ship, the rotation runs with 8); egg is **Should** (cut line B: 9); sumo is **Could** (section 13). |
| Where they play | `tap`: `world: false` on **무대 목욕탕** (`PG.PARTY_ARENAS[2]`, as 바나나우유 / 펑). `chair`: the same stage arena **with bodies** (a world game on a flat floor, everyone on the base kit). `egg`: a dry battle arena, as 왕관 (platforms to chase over). `sumo`: a new closed arena **비누 평상** (`PG.PARTY_ARENAS[4]`, key `'sumo'`): a 144 px 평상 over two 탕. |
| Out players (the "nobody idle" rule) | **유령** in tap / chair / egg: an out player is drawn see-through and **keeps playing every round** - it still repeats the faucets, races for stools, carries and passes the egg - and still scores the round's point; it only cannot take the survivor's bonus. In sumo an out player rides an **오리 튜브** (물's raft, reused) and keeps blowing bubbles; pushing a friend in brings it back once a set (**역전**, as in 물). Nobody waits more than one round (about 6 s) for anything. |
| Scoring | Shared shape: **a point per round you come through** (tap: a correct sequence; chair: a stool; egg: not holding at the burst; sumo: a friend you pushed in) **+2 for the set's last one in** (tap: the ones in at the end). Places by points, then a measured tie-break (ms or frames), so shared places are rare. Points to the party unchanged: 4 / 2 / 1 / 0, x2 on the last 판. |
| Sets | chair / egg / sumo play **sets**: when one player is left in, it gets +2 (`살아남았다!`) and everyone comes back for the next set. tap is one ladder (the sequence grows). Every game has a fixed number of rounds (sumo a fixed clock), so its length does not depend on how the sets go. |
| Fairness rule | As in party-games: **each page measures its own part on its own clock** (tap: its presses against its own draw of `따라 해요!`); **contests are stamped in view ticks** (chair: who sat first - the 술래 judge: the stamp is the view tick the sitter's own screen showed, `rtMax` monotonic, `LAG_MAX` 60, a claim final once every other body is past it, a final claim never bumped); **contact is decided on the screen of the one it happens to** (egg: the receiver - and the holder runs `EGG.run` 1.2x after its juggle, so a pass stays reachable across the ~0.4 s the two pictures add up to; sumo: the one pushed) - so the host's zero latency never wins a stool, a pass or a dodge (sections 4.5, 5.5, 6.5, 7.5). |
| Inputs | Only what exists, plus three press kinds: **new** `'L'` / `'R'` / `'D'` entries in the press queue (a fresh ← / → / ↓ key, the stick's **dominant-direction edge**, one entry per pull; during tap the stick's origin holds still, 3.3) for tap. chair / egg / sumo use the normal body controls; tap uses 점프 (or 거품, or ↑) for the top faucet and ← ↓ → for the others. |
| Music | chair: **new** track `chair` that every page cuts **at its own view of the stop** (a direct `Snd.music`, so the snapshot's `mu` never fights it) with a **new** `scratch`. tap: no music (the faucets' notes are the music). egg / sumo: `battle` as every 판 (sumo `hurry` for its last 10 s). |
| Network | Host-authoritative over the existing transports, **no new message type**: each game's `g.mg` (at most ~110 bytes), self-reported parts in the body state's `mi` (at most 7 ints; `parseBody` clamps each to ±1e6, so a view tick rides **relative to its round's anchor** - 3.2). **`PARTY_V` 8**: a pa 7 page in a party room is never ready (`새로고침 필요`). |
| Rotation | Unchanged free draw (`partyPlan`): **10 games** for 2 / 4 players, **9** for 3 (no 축구). None of the four is excluded at any player count. |
| Coins / awards | `coinAct` per action (a correct sequence, a stool, a pass or a survived round); sumo's blows already count through `coinShot`, as in the arena games. None of the four makes prisons, so they feed only **최다 1등상**; a party of new games skips 최다 가두기상 / 최다 탈출상 by the existing top-0 rule. |
| Trophies | `troPartyWait`'s 2-min floor is game-blind and keeps working. The shortest theoretical staked party gets shorter (section 3.8), so the hold can reach ~37 s: **new** line `트로피 정산까지 N초` while it holds (Should). |
| Sprites / sound | **New** sprites `faucet` (16x16, 2 frames), `fx_ghost` (8x8). The stools are the pink canvas 목욕 의자 펑's stalls and 술래's corridor already draw (a **new** helper `drawStool`, no sprite). **New** sfx `tap` (o.n 0-3), `scratch`, `egg_tick` (o.n 0-3), `egg_boom`; **new** song `chair`. Everything else reused. |

---

## 1. Why: each game against "다 비슷해요"

| Game | Its verb | Why it is not "the same game again" | Why it is not bland |
|---|---|---|---|
| 수도꼭지 순서 기억하기 | **remember** | The memory game party-games 16 left out. Nobody moves, nothing is timed against a friend: you watch, then you repeat | Each round is one longer; a wrong faucet sprays cold water over you in front of everyone; your friends' progress pips fill while yours still stall |
| 목욕 의자 뺏기 | **scramble** | The only game where the whole room waits on a sound; the stools move, not the floor | Shrieks at the stop, two animals landing on one stool (`쿵! 밀려났어요`), one stool short every time, the survivor's `살아남았다!` |
| 맥반석 계란 돌리기 | **get rid of it** | The inverse of 왕관: the thing everyone runs **from** | A ticking egg that steams, shakes and glows with no clock to read; the last-second bump; the yolk burst |
| 미끌미끌 비누 씨름 | **push** | The first game where bubbles move friends instead of trapping them; standing on soap | One push slides you ~40 px; the edge is always close; the 오리 튜브 hops up and pushes back for 역전 |

Across the ten every 판 has its own verb: 물 escape, 왕관 hold, 축구 push-a-ball, 바나나우유 snap, 펑 gamble, 술래 freeze,
수도꼭지 remember, 의자 scramble, 계란 get rid of, 씨름 push-a-friend.

---

## 2. Ground truth from the code (what this builds on)

| Thing | Code today | Consequence |
|---|---|---|
| The contract | `MINI[id]` (`c secs fastSecs ar fits team world noFire cues name how rule keys keysT`) and `MINI_FN[id]` (`spawns init start tick key snap view drop draw hud`, optional `local input clock pose frozen tagY hold held win over demo`); `miniLoad` / `miniStart` / `miniTick(ins)` / `miniOver` (time-up unless `over`, or `M.endAt`) / `miniPlaces` (`rankBy` on `key`) | Each new game is a `MINI` entry, its hooks and its texts. Three flags join the table (3.4): `music`, `base`, `short`. |
| Self-reports | `miniTick` runs `F.local(M, slot, inp)` for each local seat and takes a remote seat's `rem.st.mi` (this gid, `mi[0] === P.i`), then `F.input` when it changed (`M.miK`); a guest's `guestSelf` sets `NET.mi`, `guestSend` carries it; `parseBody` keeps 8 ints, **each clamped to ±1e6** (`G.frame` counts from page load: 1e6 frames is 4.6 h) | tap, chair, egg and sumo all report through `mi`. No new message. A view tick in `mi` is sent relative to its round's anchor (3.2). |
| Stamps | 술래: `hostBodyIn` stamps `s.at = G.frame`; `sneakJudge` reads `rem.buf`, `rt = max(rtMax, d.rt, d.at - SNEAK.lagMax)`; `NET.rtHi` is a guest's monotonic view clock; `miniStale` (no state for `MILK.staleF` 30 f) | chair / egg / sumo reuse the clamp and the monotonic clock through two **new** shared helpers (3.2); `SNEAK.lagMax` becomes the shared `LAG_MAX` 60. |
| Press queue | `pressQ` / `pressPush(act, t)` with event times: 점프 / 거품 where `latch` is set, `'down'` from a fresh ↓ and the stick's down edge (`stickMove(cx, cy, t)`); `readInputs` hands `pq` (sorted, <= 8) to each seat; `stickDir` (`STICK_ON` 0.3 / `STICK_OFF` 0.2), `stickDown` (`STICK_DN_ON` 0.6, `ny >= 2 abs(nx)`) | tap needs ← / → / ↓ as presses: **new** `'L' 'R' 'D'` entries (3.3). |
| Bodies | A guest moves its own animal (`guestSelf` → `updatePlayer`); the host takes it over only with a new epoch (`bumpEp`, `placePlayer`; `takeOver` copies x / y / vx / vy and the raft flag); the host draws a remote body `PEER_DELAY` (6) ticks behind its newest state (`hostDisplayIn` swaps them all in for `netTap`; `shownAt(pl)` gives one body's sample), a guest draws the host's world `SNAP_DELAY` (8, adaptive to `BUF_MAXD` 24) behind and other guests `PEER_DELAY` behind their newest state | Contact between two bodies has two views; section 6.5 picks the receiver's. A push must be applied by the page that moves the body (7.5). |
| Kits | `kitOf` gives `KIT_BASE` to a raft and in a 술래 판; `updatePlayer`'s walk is `WALK x kit.walk x ... x (crownHolder ? CROWN_SLOW) x (술래 ? SNEAK.walk)`, then `vx += clamp(dir x walk - vx, ±acc)` with `acc` 0.5 (`PENGUIN_GRIP` on ice) | chair and sumo set `base: true`; sumo changes `acc` (soap) in one gated branch; egg's holder joins the walk chain as the crown's does (`EGG.run`). A push of 2.4 px/f decays by `acc` a frame, so soap makes it slide. |
| Rafts | 물 v2: `waterOut` → `p.raft`, `raftMove` (rides `G.mini.wl`, hops `RAFT.hop` -3.0, shoots the plain bubble), flag 512 on the wire, `drawPlayer`'s raft branch (`duck_ring`), `trappable` / `canTouch` false for a raft, 역전 by `placePlayer` on a revive spot | sumo's out players are these rafts on a constant `M.wl`. |
| Drawing | `drawPosed` swaps a game's `pose` fields for `drawPlayer`; `drawPlayer` sets `ctx.globalAlpha` itself (back to 1 after its own blinks and rings); `ctx` is a `let` the hub preview already swaps for a scratch context; `tagAnchor` reads `tagY`; `drawHUDParty` reads `clock` and dims `p.out` / `p.trap` / `p.raft` panels; `drawPartyDemo` calls `demo(dx, P.t % 240, a, b)` and every demo draws its animals at 16 px (`demoSpr`, feet at y 28); `localSfx` / `localWord` keep a page's own sounds and pops off the wire | 유령 is a pose drawn through a scratch canvas (an alpha wrapper around `drawPlayer` would not hold), 3.1. |
| Names taken | co-op's `p.ghost` (a fallen player's ghost bubble), `GHOST_*`, the `<animal>_ghost` sprites and the `ghost` sfx (co-op); the frog's `ty: 'egg'` bubble and `eggCap`; the pink stool 펑 / 술래 draw with canvas rects | a 유령 lives in `M.gh` only (never `p.ghost`, never `p.out`); the `ghost` sfx fits and is reused; the new `egg*` functions sit apart from the frog's; the stools reuse that drawing. |
| Music | `setMusic(t)` sets `G.music` (it rides in the snapshot as `mu`, index into `MUSICS`) and calls `Snd.music`; a guest's `applyView` calls `setMusic(mu)` when `mu !== G.music`; `Snd.music(name)` restarts a track from bar 1 only when another (or none) was playing | chair keeps `G.music = 'chair'` for the whole 판 and cuts the sound itself per page (5.7). |
| Rotation | `partyPlan(n, rounds, from)`: one shuffled bag of `MINI_IDS` that fit n, never twice in a row; a replan leaves out what was played | Ten ids in `MINI_IDS`; nothing else changes. |
| Trophies | `troPartyWait` holds 최종 순위 until the first 시작! is `PARTY_TRO_MINF` (7200) host frames old; `troPartyReal` counts actions through `CO.bshots` | Checked in 3.8. |
| Wire | `SNAP_LIMIT` 3400 (party-net asserts it), `SNAP_EVERY` 3, `BODY_EVERY` 2 | Sizes in 8.3. |

---

## 3. Shared machinery (built once, with the first game)

### 3.1 유령: out players who keep playing, and sets

```js
  // M.gh {slot: 1} - this game's out players (tap / chair / egg). A 유령 plays every round as before; it scores the
  // round's point; it cannot be the set's survivor. ghostOut(M, slot) puts a living player out (탈락! word pop, the
  // 'ghost' sfx, my own line 유령이 됐어요!); ghostSet(M) - one living player left: it gets GHOST.bonus (+2, popup, the
  // banner '{0} 살아남았다!' / '모두 다시 살아나요', 'extend'), M.gh = {} after the beat; nobody left in (everyone
  // still in failed the same round): nobody goes out that round
```

- **Who is "in" a round**: every present player, living or 유령. A round's loser(s) (tap: a wrong or late sequence; chair:
  the one left standing; egg: the holder at the burst) score 0 that round; everybody else +1.
- **Out**: a living loser becomes a 유령 - **unless every living player lost that round** (then nobody goes out:
  `tpAll`, or in chair two who both never sat; the classic "if everyone fails, nobody is out").
- **Set end** (chair, egg): exactly one living player left → `ghostSet`: +2, then everyone is living again. With 2 players
  every round is a set. tap is one ladder: no revival; the players still in after its last round get +2 each.
- **Drawn** (`pose` returns **new** field `ga`): `drawPlayer` sets `ctx.globalAlpha` itself (to 1 after its own blinks
  and the raft's ring), so an alpha set around it does not hold. `drawPosed` draws a posed animal with `ga < 1` into a
  **new** 48x48 scratch canvas instead - `ctx` swapped for the scratch context and the origin moved, as the hub preview
  swaps `ctx` (`ctx = x ... finally ctx = c0`) - then blits it at `ga`. A 유령 at `GHOST.alpha` 0.55, a small `fx_ghost`
  (8x8, a white 김 wisp with two eyes) bobbing 2 px over its head; its HUD panel at 0.55 alpha with `fx_ghost` beside the
  icon (`drawHUDParty` dims it like an out panel, reading `M.gh`). Bodies, epochs and the wire never see `ga`.
- **Never `p.out`, never `p.ghost`**: `drawPlayer` draws nothing for an out animal and `canTouch` / `free` drop it; `p.ghost`
  is co-op's ghost bubble (`drawGhost`, revives). A 유령 is a normal, free animal whose seat is in `M.gh`.
- **Wire**: `M.gh` as a bit per seat in each game's `g.mg`; a guest's mirror plays `ghostOut`'s local parts (my line) when
  its own bit appears.
- sumo's out players are rafts (7.2), not 유령: falling in the 탕 makes a raft, as in 물.

Why not plain elimination with spectators: with 4 players the first one out would watch 20-30 s of a 45 s 판, the owner's
"everyone stays active" rule. Why not revival by sitting / passing: a 유령 who comes back by winning a round makes every
round equal and the elimination meaningless (considered, 17).

### 3.2 Stamps: `miniRt` and `miniPast`

```js
  const LAG_MAX = 60;   // (SNEAK.lagMax reads it) a remote seat's view tick is never taken as older than its state's
                        // arrival minus this (a stalled view cannot claim the past)
  // miniRt(M): each playing frame, before the game's tick, M.rtMax[slot] = max(M.rtMax[slot], st.rt, st.at - LAG_MAX)
  //   for each remote seat's latest state of this gid (host-local seats: G.frame) - the view tick each body is past
  // miniStamp(M, p, t): a self-reported view tick t of seat p, clamped into [its state's at - LAG_MAX, G.frame]
  // miniPast(M, t, f0, skip): true once every present, non-stale seat not in skip has rtMax >= t (host-local: always),
  //   or G.frame >= f0 + LAG_MAX (f0: the frame the host first saw the claim); skip = the claimant and the seats whose
  //   own claim is already final (they cannot claim again) - a provisional sitter IS waited for (it can still be bumped
  //   and claim elsewhere; its states keep coming while it sits)
```

- These are 술래's rules (party-games 6.4) without the buffer walk: chair, egg and sumo need **one stamped moment per
  claim**, which the claimant's own page reports in `mi` (frame-exact, its own `Math.round(NET.rtHi)` - monotonic - at
  that frame), not a trajectory. 술래 keeps `sneakJudge` as built; its `lagMax` reads `LAG_MAX` (so `LAG_MAX` is declared
  above `SNEAK`: a `const` read before its line throws).
- **Relative ticks in `mi`**: `parseBody` clamps every `mi` int to ±1e6 and `G.frame` counts from page load, so a page open
  for 4.6 h would clamp absolute ticks. Each game sends `tick - anchor`, the anchor a tick its `g.mg` already carries (chair:
  the stop `S`; egg: the landing `L`; sumo: the set's start `F0`), and the host adds it back before `miniStamp`. The ints
  stay short on the wire too. (`st.rt` itself is bounded at 1e12 and needs nothing.)
- Why `miniPast` is safe: a seat's `mi` tick is its `NET.rtHi`, never below any `rt` it sent before, so once `rtMax[p] >= t`
  seat p can only claim at `>= t`. A **final claim is never bumped**: a later claim against a final owner is refused,
  even at an equal stamp (an exact tie at the final stamp goes to the owner).
- A claim is **provisional** until `miniPast`: at 100 ms + 40 ms jitter a remote seat's states arrive 20-45 f after their
  view tick, so a claim is final 20-45 f (at most 60) after the host saw it.

### 3.3 Press queue: `'L'`, `'R'`, `'D'`

```js
  // (tap, 4.3) onKeyDown: a fresh ←/A, →/D, ↓/S also pushes 'L' / 'R' / 'D' (beside today's 'down')
  // stickMove: STICK.td = stickTap(nx, ny, STICK.td) - 'D' when ny >= STICK_DN_ON && ny >= 2 abs(nx); 'L' / 'R' when
  //   abs(nx) >= STICK_ON && abs(nx) >= abs(ny); '' when the knob is back under STICK_OFF (abs(nx) and ny); in between
  //   the last one holds. A change to a new non-empty td pushes it with the event's time
```

- The two zones exclude each other (horizontal needs `abs(nx) >= abs(ny)`, down needs `ny >= 2 abs(nx)`), so **one pull
  gives one entry**, a 45° pull too (it reads as ← / →; between the zones is a dead band). Sliding from ← to ↓ without
  coming back gives `'L'`, `'D'` (two pulls).
- **The stick's origin holds still during tap** (`stickMove`'s `d > R` branch scales `dx / dy` back to R without
  moving `STICK.ox / oy` while `G.mini.id === 'tap'`; elsewhere it drags them). Otherwise an over-pull drags the origin and a
  thumb sliding back to where it first touched reads as a pull the other way - a phantom `'L'` after an `'R'`.
- `'D'` is a down entry - not the D key (KeyD is →, an `'R'`). Only tap reads these three; `pq`'s other readers ignore
  unknown kinds. Today's `'down'` entry (펑) is unchanged; tap ignores `'down'` (the ↓ key pushes both).

### 3.4 `MINI` additions

| Flag | Meaning | Who |
|---|---|---|
| `music` | `miniStart`'s track instead of `'battle'` (`null`: none) | tap `null`, chair `'chair'` |
| `base` | everyone on `KIT_BASE` (`kitOf`'s 술래 test becomes `miniFlag('base')`; 술래 sets it) | chair, sumo, 술래 |
| `short` | the room's new-games line (3.5) | all seven new games |

`MINI_IDS = ['water', 'crown', 'ball', 'milk', 'puff', 'sneak', 'tap', 'chair', 'egg', 'sumo']` (`MINI_OLD` 3 unchanged). The
battle-arena pick for egg avoids the last one as 왕관's does (`P.crownAr` becomes `P.lastAr`, shared by both).

### 3.5 Rotation with ten games

`partyPlan` is unchanged (owner, party-games: draw freely). With all four built:

| Players | Games that fit | 3판 | 5판 |
|---|---|---|---|
| 2 or 4 | 10 | 3 distinct of 10 | 5 distinct of 10 |
| 3 | 9 (no 축구) | 3 distinct of 9 | 5 distinct of 9 |

- A 3판 party draws at least one of these four with probability 1 - C(6,3)/C(10,3) = 83% (2 / 4 players); each single game
  shows up in 30% of 3판 parties. The old favourites come round less often (risk 11).
- At cut line A the bag has 8 (3 players: 7), at B 9 (8).
- No player-count exclusion: all four play with 2, 3 and 4 (question 2).
- The room's rules line of the new games (`partyRules`' `gn`, only from a host at this `PARTY_V`) is built from `short`:
  `새 게임: 바나나우유 · 펑! · 술래 · 수도꼭지 · 의자 · 계란 · 씨름` (one line at the 1x room width, wraps once at 320 px).

### 3.6 Coins

`coinAct()` on my own page, from my own measurement or my mirror, never for another seat:

| Game | One action |
|---|---|
| tap | a correct sequence (mine, judged on my page) |
| chair | a stool I keep (my claim final in the mirror) |
| egg | a pass I made (the mirror's holder moves from me), or a round I came through having walked `EGG.moveCoinPx` 64 px |
| sumo | none needed: every blow already counts through `coinShot` (`fire` calls it), as in 물 / 왕관 / 축구 |

The per-판 rule (2 actions: `COIN.roundShots`), the party's 5 (`gameShots`) and the 60 s played gate (`minF`) are
unchanged; an idle player earns 0.

### 3.7 Places, ties, awards

Every key is "points first, then a measured tie-break" through `rankBy` (4 / 2 / 1 / 0, x2 on the last 판). The keys sit in
each game's section. The award counters stay the sequencer's: `wins` from every game; `caps` / `esc` only where prisons
exist (물, 왕관, 축구, 술래) - none of the four makes prisons, so a party of new games skips those two awards (top-0).

### 3.8 Party trophies: the 2-min floor with the new games

`troPartyWait` is game-blind (it counts host frames from the first 시작!) and `troPartyReal` counts `coinAct`: nothing
breaks. What moves is the shortest honest party (party-trophies 14.5's table, with the new minimum lengths):

| Game | Shortest honest | How |
|---|---|---|
| 수도꼭지 | ~1706 f | 6 rounds: intro 36 + the show (90 / 120 / 120 / 144 / 140 / 160) + 12 + every page's fastest valid answer (`TAP.minMs` 80 ms a step: 14-38 f) + reveal 66; the end's bonus beat 60; endF 30 (longer than 의자, so it is not in the shortest party) |
| 목욕 의자 뺏기 | 1630 f | 8 stops x (music 120 + all claims final ~20 + reveal 60) + endF 30 |
| 맥반석 계란 돌리기 | 1938 f | 6 rounds x (drop 36 + fuse 210 + reveal 72) + endF 30 |
| 미끌미끌 비누 씨름 | 2700 f | its 45 s clock |
| (술래 / 바나나우유 / 펑) | 753 / 1562 / 2701 f | as 14.5 |

Shortest staked 3-player party: 술래 + 의자 + 바나나우유 = 3945 f; with the natural beats 5913 f (98.6 s), the host
skipping every beat 5007 f (83 s). The hold on 최종 순위 becomes at most **2193 f (37 s)** (all skipped) / 1287 f (21 s)
(natural), up from 1122 / 216. Those are bot-speed numbers: at a human pace 수도꼭지 is ~41 s and 의자 ~48 s, and such a
party is past 2 min before its last tally. Still, a hold of half a minute with nothing said would read as a hang:

- **Should**: `g.pa.H` (**new**, host): the frames the hold has left, sent only while it holds; the 최종 순위 view shows
  `트로피 정산까지 N초` (`PARTY_TX.troHold`, N rounded up) under the rows, on every page. It replaces 21.6's open point.
  Fallback: today's silent hold.

---

## 4. 수도꼭지 순서 기억하기 (`tap`, memory) — Must, built first

`MINI.tap = { c: 't', secs: 75, fastSecs: 35, ar: ['p', 2], world: false, noFire: true, cues: false, music: null, fits: (n) => n >= 2, short: '수도꼭지', ... }`

### 4.1 Rules

- **The wall**: four faucets in a cross on the back wall - **위** red, **왼쪽** blue, **오른쪽** green, **아래** yellow. Each
  has its own note.
- **6 rounds**; round r shows **r + 2** faucets (3, 4, 5, 6, 7, 8). The sequence only grows: round r shows the first r + 2
  of one list, `tapSeq(seed, k)` (a pure 32-bit hash, never three of the same faucet in a row; `seed` from the host at the
  card, as 펑's). The 판 ends 30 f after the last round's bonus beat (`M.endAt`); `secs` 75 is a safety cap.
- **A round** (host frames; `A` its arm tick):
  1. **Intro** `TAP.intro` 36 f: banner `잘 봐요!` / `3개를 기억해요` (class `round`), three dots.
  2. **Show**: step k is lit from `A + 36 + k sp` for `sp - 8` frames, `sp` = 30 (rounds 1-2), 24 (3-4), 20 (5-6). A lit
     faucet pours, its handle glows, its note plays (each page at its own view of that frame).
  3. **Go** at `G = A + 36 + L sp + 12`: each page, at its own first draw of `G`, shows `따라 해요!` and starts **its own
     window** of `1500 + 700 L` ms (L 3: 3.6 s; L 8: 7.1 s), on `pageNow()`.
  4. **Input**: each fresh press after my go draw is one faucet (점프 / 거품 / ↑ = 위, `'L'` / `'R'` / `'D'`). Right: the
     next step (that faucet pours on my screen, its note). **Wrong: I am done** - the faucet sprays cold water over me
     (`lg_2` tipping, cold drops, `scald_splash`, as 바나나우유's 물벼락). All L right: **done**, my time = the last press's
     event time minus my go draw time, in ms. Window over first: **time out**. Presses before my go draw count for
     nothing (no penalty - watching is the whole job).
  5. **Close** (host): every present seat reported (or stale, `miniStale`), or `G + window + TAP.slackF` 90 f. A missing
     report is a time out.
  6. **Reveal** `TAP.revealF` 66 f: a green ✓ or red ✗ (canvas) over each animal, the time of each correct one in canvas
     digits (`2.41`, seconds) at y 172; the fastest correct one hops with stars (no extra point). Newly out: `탈락!`.
- **Points**: a correct sequence **+1** (유령 too); wrong / time out 0. A living player who was wrong or late becomes a
  유령 - unless **every** living player failed that round (`모두 틀렸어요!` / `이번엔 아무도 안 빠져요`, nobody out).
- **The end**: after round 6's reveal, everyone still living gets **+2** (`{0} 살아남았다!` for one, `모두 살아남았다!`
  for several; `TAP.bonusF` 60 f), then the 판 ends.
- Length: ~41 s at a human pace (answers ~0.6 s + 0.4 s a step); the worst honest case (every window waited out + 90 f)
  67 s, under the 75 s cap. Fast party: 3 rounds (worst 30.1 s, under `fastSecs` 35).

### 4.2 Out players

A 유령 sees the same show, answers the same way and scores +1 for each correct sequence. Being out costs only the end's
+2: an early mistake is never the end of the 판 (6 rounds of +1 are still there).

### 4.3 Controls

- Phone: 점프 (or 거품) = 위; the stick pulled ←, ↓, → = 왼쪽, 아래, 오른쪽 - one pull, one press (3.3); let go between
  presses. Keyboard: ↑ / Z / X = 위; ←, ↓, →.
- Card keys: `keys` `↑ ← ↓ → 로 눌러요 (Z·X도 ↑)`, `keysT` `점프는 위 · 조이스틱은 ← ↓ →`.

### 4.4 Players

2, 3 or 4, the same rules; the animals stand on `STAGE_X[n]` in slot order under the wall. With 2 it is a straight duel;
both can finish in (both +2, the tie-break decides).

### 4.5 The host's judging and the online fairness argument

**Each page judges its own answer; both ends of the time are on that page's clock** (바나나우유's model, party-games 4.4).

- **The show is pure**: `tapSeq(seed, k)`, `A` and `sp` give every lit frame; `g.mg` carries the seed (at the card) and
  `A` (when it starts: it is the host's now). A page draws step k when its own view clock (host: `G.frame`; guest: its
  monotonic `NET.rtHi`) reaches it, so latency moves *when* a guest sees the show, never *what* it sees.
- **Once drawn, it stays drawn** (`tapSeen`, as `milkSeen`): the first draw of `G` stores `G.drawT` in `G.mloc`; a guest's
  view clock stepping back never starts a second window.
- **My answer**: `local` runs every playing frame over `inp.pq` in time order; `mi = [판 i, r, steps, flag, ms]` (flag 0 in
  progress - steps so far -, 1 correct, 2 wrong, 3 time out), latest wins and is keyed by its round, so a dropped state
  loses nothing. The host's own seat goes through the same `local` → `input`.
- **The host** (`input`): keeps the latest steps for display and the first final flag per seat and round, clamped: a
  correct one under `TAP.minMs` 80 ms a step is wrong (no hand does 8 faucets in 0.6 s), over its window a time out.
- **Latency and jitter** change only when I see the show and when the host hears my answer; the close waits for the
  slowest report (bounded by `slackF`; a stale seat is not waited for). A faster link wins nothing.
- **The host's own seat**: measured exactly as a guest's (its own draw, its own presses). No edge.
- **No copying through the game**: friends' progress is drawn as **pips** (how many steps they have), never which faucet
  they pressed; friends' notes are not played. (Friends in one room can still look at each other's phones.)
- **Cheating bounds**: a modified page can report any answer within the clamps, and can read the seed early - the same
  list the show gives a few seconds later. Same trust as every body state. Accepted for 4 friends.

### 4.6 Places, ties, coins, awards

- `key = pts * 1e5 - msSum` (my ms on each correct round, the round's window on a wrong / late one). Equal points and equal
  ms share a place (in practice never).
- Coins: each correct sequence (`coinAct` on my page).
- Awards: only 최다 1등상.

### 4.7 Screen, HUD, sprites, sounds

- **The wall** (`draw(M, false)`): a tiled back panel (x 72-184, y 52-148, the theme's tile tint at 0.3), the four `faucet`
  sprites at 2x (32 px) in a cross centred on (128, 100) - 위 (128, 66), 왼쪽 (92, 100), 오른쪽 (164, 100), 아래 (128,
  134) - each with its handle coloured by a 6x3 canvas cap (`#ff6b6b`, `#4fa3f0`, `#3cc464`, `#ffd23c`). Lit: frame 1
  (the open valve), a 3 px pouring stream (canvas, `#8fdcff`) to a splash at the panel's foot, the handle 1 px brighter.
  During the input each page lights its **own** presses only.
- **Arrows** under the faucets (canvas, 5x5, the stick's directions; 위 also shows a tiny button disc) so the mapping is on
  screen.
- **The animals** (`pose`): idle; the jump frame for 6 f on each of my presses; on a mistake `die` frame 0, shivering, the
  `lg_2` at 2x tipping over (as 바나나우유); a 유령 at `ga` 0.55 with `fx_ghost`.
- **Progress pips** over each animal's tag (canvas, 2x2 per step, grey → its colour), my own from `G.mloc` (at once),
  friends' from their `g.mg` row (a little late). The tag anchor stays the head (`tagY` not needed).
- **HUD**: centre `clock` `3/6`; line 2 a `faucet` icon (8 px) and my points.
- **Sounds**: **new** `tap` (o.n 0-3: four notes of a major chord, a 120 ms soft square "똥"; local, `NO_ECHO`) - each lit
  step on my screen and each of my presses; `scald_splash` on my mistake (local) and on a friend's when its row says so;
  `countdown` at each reveal (local); `extend` at the end's +2 (echoed). No music.

### 4.8 Card and demo

- Name `수도꼭지 순서 기억하기`; how `순서대로 똑같이 눌러요! 틀리면 빠져요` (16 syllables); rule `점점 길어져요 · 빠져도
  유령으로 계속 해요 · 맞히면 1점, 끝까지 남으면 +2점`.
- **Demo** (`tapDemo`, 240 f, pure in `f`): floor tiles at y 28; four 8x8 faucets (the `faucet` sprite at half) in a cross
  at 위 (44, 1), 왼쪽 (34, 9), 오른쪽 (54, 9), 아래 (44, 17); `a` at x 6, `b` at x 74, both 16 px with feet at y 28 as in
  every demo (`demoSpr(..., 16)`; the arrow glyphs and marks below are drawn over their heads, y 2-10).
  - 0-90: the faucets light in turn: 위 (0-24), 오른쪽 (30-54), 아래 (60-84) - a 1x3 blue stream under each.
  - 96-150: `a` answers: a white arrow pixel-glyph flashes under it - ↑ at 100, → at 116, ↓ at 132 - each lighting the
    same faucet in `a`'s colour; 140: a green 3x3 check and a star burst over `a`.
  - 150-200: `b` answers ↑ at 154, then ← at 170 - the 왼쪽 faucet flashes red; 172: blue drops fall on `b`, it shivers.
  - 184-240: `b` fades to 0.55 (`demoSpr`'s alpha) with a 3x3 white wisp over it (a 유령), and keeps standing there.
  - Read together: watch the order, press the same; wrong → splash, ghost.

### 4.9 State and wire

```js
  // G.mini (host): seed, r, ph (0 show / input, 2 reveal, 3 the end's bonus), A, G (the go tick), C (the close tick), rep
  //   {slot: [steps, flag, ms]}, res [[slot, steps, flag, ms]] (the last reveal), pts {slot}, ms {slot}, gh {slot}, n
  // G.mloc[slot] (each page, its own seats): r, go (my go draw time), step, flag, ms; G.mloc.sh: the show's first draws
  // g.mg = ['t', r, ph, seed, A, G, C, [[slot, steps, flag, ms]] (input: steps / flag, ms 0; reveal: all), gh bits,
  //         [pts by seat], n]
  // mi   = [판 i, r, steps, flag, ms]
```

About 110 bytes at 4 players.

---

## 5. 목욕 의자 뺏기 (`chair`, scramble) — Must, built second

`MINI.chair = { c: 'h', secs: 95, fastSecs: 35, ar: ['p', 2], base: true, noFire: true, cues: false, music: 'chair', fits: (n) => n >= 2, short: '의자', ... }`
(a world game on the stage arena: bodies walk and jump on its flat floor; spawns `stageSpots(n)`).

### 5.1 Rules

- **8 stops** (`CHAIR.stops`). The 판 ends 30 f after the last stop's reveal (and its survivor beat, if any); `secs` 95 is
  a safety cap.
- **Stools**: one fewer than the players present - **3 for 4, 2 for 3, 1 for 2** (유령 count as players: 3.1).
- **A stop** (host frames; `Ms` its music start):
  1. **Music** for `ri(120, 300)` f (2-5 s, host RNG; the stop tick `S` never reaches the wire before the host's clock
     does). The stools **glide** along the floor, each back and forth at its own speed (1.4-2.0 px/f: faster than a walk,
     1.25, so nobody can shadow one) - a pure function `chairX(seed, stop, j, t - Ms)` (5.5). Touching a gliding stool
     does nothing. Everyone walks and hops freely.
  2. **The stop** at `S`: on each page **at its own view of `S`** the music cuts with a record scratch, the stools freeze
     (at `chairX(..., S - Ms)`, then spread to at least `CHAIR.gap` 18 px apart - pure too), they flash, and the banner
     `그만!` (class `hurry`) shows.
  3. **Sit**: a body standing on the floor whose feet centre is within `CHAIR.seat` ±6 px of a free stool's centre **sits**
     - automatically, no button. It is parked on the stool (`frozen`) and drawn sitting 4 px up. One stool per body.
  4. **Two on one stool**: the earlier stamp keeps it (5.5); the later one is **bumped** - `쿵!` word pop, it hops off
     (`vy` -2.0) and may run to another free stool. My own line when it is me: `밀려났어요!` / `다른 의자로!`.
  5. **Close**: every stool has a final owner, or every present non-stale player holds a final stool (after a leaver
     there can be as many stools as players), or `S + CHAIR.capF` 240 f.
  6. **Reveal** `CHAIR.revealF` 60 f: the sitters bounce on their stools with `+1` popups; the one standing: `탈락!` (a
     living player: it becomes a 유령) or `꽝!` (a 유령). One living player left → the survivor beat (`CHAIR.survF` 60 f,
     +2, everyone living again).
  7. Next stop: everyone stands up where they are; the music starts again from bar 1; the stools glide again.
- **Points**: a stool **+1** (유령 too), the set's survivor **+2**.
- **At the cap**: everyone still standing scored 0; the living among them go out - unless that would leave nobody living
  (then nobody does).
- Length: ~48 s at a human pace (music avg 3.5 s + scramble ~1.2 s + reveal 1 s, about two set ends); worst honest
  (music 300 + cap 240 + reveal + survivor every stop) 88.5 s, under 95. Fast party: 3 stops (worst 33.5 s).

### 5.2 Out players

A 유령 races for the stools like everybody: the count includes it, and a stool it takes is one the living do not get. When
the one left standing is a 유령, nobody goes out that stop (the living all sat) and the set goes on. So a 유령 is never
idle, keeps scoring +1 a stool, and its speed shapes the set.

### 5.3 Controls

- Phone: the stick runs ←→, 점프 hops (for fun: the floor is flat). Keyboard ←→, ↑ / Z. Sitting is touching.
- Card keys: `keys` `←→ 달리기 · 의자에 닿으면 앉아요`, `keysT` `조이스틱으로 달려서 의자에 닿아요`.
- Everyone has the base kit (`base: true`: no 특기, the same walk) - speed is the same for every animal.

### 5.4 Players

2 players: one stool, every stop a race and a set (the sitter +1 +2). 3 players: two stools. 4 players: three. A leaver: the
next stop has one stool fewer; in the current one its claim (if any) is dropped and its stool is free again. A leaver that
leaves one living player ends the set **without** the +2 (nobody beat anyone): everyone is living again. A stale seat
(hidden tab) counts toward the stools and simply stands.

### 5.5 The host's judging and the online fairness argument

**Who sat first is decided by stamps in view ticks** - the time each body's own screen showed, as 술래's arrivals.

- **The stools are pure**: `chairX(seed, i, j, dt) = lo + tri((ph_j + v_j dt) / (hi - lo)) (hi - lo)`, `v_j` 1.4-2.0 and
  `ph_j` from a 32-bit hash of (seed, i, j), `lo` 28 / `hi` 228, `tri` the 0-1-0 ping-pong; the freeze spread is a pure
  sweep. `g.mg` carries the seed (card), `Ms` (the host's now when it starts) and `S` (only once the host passed it - a
  guest has it before its view gets there, from this snapshot or the next: `chairView` merges `mg` and `mg1` as
  `milkView` does). Every page draws exactly the same stools at the same view tick.
- **The stop on each page**: the music cut, the freeze and the sitting rule switch on at the page's own first draw of `S`
  (`chairSeen`: `G.drawT` stored once, the view clock monotonic - `NET.rtHi` on a guest).
- **My sit** (`local`, each page for its own seats): after my draw of `S`, my body standing, feet on a stool that is free
  **in my mirror** → I park myself at once (a guest freezes itself, as 술래's arrival) and report
  `mi = [판 i, stop, stool, tick - S, dx]` - `tick` my view tick that frame (host: `G.frame`; guest:
  `Math.round(NET.rtHi)`), sent relative to `S` (3.2), `dx` my feet's distance from the stool centre x10.
- **The host** (`input`): a claim is taken when its stop matches, the stool exists, the seat's latest state (host-local:
  its body) has its feet within `CHAIR.slack` 8 px of that stool and on the floor (the state carrying the `mi` is the
  parked one, so this holds), and the seat holds no final stool. Its stamp: `miniStamp(M, p, S + max(0, mi[3]))`.
  Against the stool's current owner:
  - none → the claimant owns it (**provisional**);
  - a **final** owner → refused, whatever the stamps (3.2);
  - a provisional owner whose stamp is later (or equal with a larger `dx`, or equal `dx` and later in the rotation
    `(slot - stop) mod 4`) → the owner is **bumped** (its claim cleared, `M.bump[slot] = stop`), the claimant owns it;
  - otherwise the claim is refused.
  A claim becomes **final** at `miniPast(M, stamp, f0, skip)` (skip: the claimant and the seats already holding a final
  stool): every other body that could still claim has shown a view past the stamp (or `LAG_MAX` passed) - nobody can
  still turn up with an earlier one.
- **A bump on the bumped page**: a page whose own stool shows another owner whose claim is final or earlier than mine
  un-parks itself and hops off (its own body: no epoch). A later provisional owner on my stool means the host has not seen
  my state yet: I stay; it will be bumped.
- **A refused sit is let go**: a page whose mirror still does not show it as the owner by its own view tick
  `tick + LAG_MAX + 30` (the host has had its claim for a while: it refused it) un-parks itself; standing on a free stool it
  sits again at once with a new tick (a new `mi`, which the host takes as a new claim). Without this a refused page would
  sit on a stool nobody owns until the reveal.
- **Latency and jitter** change when a page sees the stop and when it learns about friends' claims - never its stamp. A
  guest that sat 30 view ticks after its `S` beats a host that sat 31 frames after its `S`. The price is the bump: the host
  (or a guest) may sit on a stool and be moved off 20-45 f later by a friend whose earlier stamp had not arrived yet. It
  happens only when two bodies reach one stool within the link's delay - the close contests - and it goes to whoever was
  first in their own view.
- **The host's own body**: its stamp is `G.frame`, its view, the same measure as a guest's `rt`; its claims are
  provisional like everyone's. Zero latency buys it the news of friends' claims a little sooner, not the stool.
- **What is not equal**: a guest whose playout delay grows during a scramble gets a few view ticks of physics more per host
  tick (party-games 6.4's drift: typically 2-5 ticks, rarely). A guest learns of the host's claims on time and of other
  guests' a few ticks late (peer streams). Both small next to a human reaction.
- **Cheating bounds**: a modified page could report an earlier `tick` - not before `S`, not before its state's arrival
  minus `LAG_MAX`, and only for a stool its body actually stands at; it could also read `S` from a snapshot its playout
  delay (8-24 ticks) before drawing it, as 바나나우유's events. Same trust as every body state.

### 5.6 Places, ties, coins, awards

- `key = pts * 1e5 - standF` (`standF`: on each stop my final stamp minus `S`, `capF` when I did not sit). Equal points and
  equal frames share a place (rare: 8 stops of continuous times).
- Coins: each stool I keep (my claim final in my mirror).
- Awards: only 최다 1등상.

### 5.7 Screen, HUD, sprites, music, sounds

- **The room** (`draw(M, false)`): a row of wall hooks with towels (canvas) and, during the music, `♪` note pixels drifting
  up from a radio on a shelf (x 120, y 60; canvas, 12x8). After the stop the radio shows a red pause bar.
- **Stools**: the pink plastic 목욕 의자 펑's stalls already draw (`#c86a8e` legs and rim, `#ff9ec4` top; `puffDraw`), through a
  **new** helper `drawStool(ctx, cx, footY, s, squash)` at any scale (here 16 px wide, 8 tall; squashed 1 px under a
  sitter; 8 px in the HUD, 8x4 in the demo) - the same stool as 펑 and 술래, no sprite. `puffDraw` / `sneakDraw` may call it
  later (not in this PR). Feet on the floor (y 216). Gliding ones have 2 motion pixels behind them; frozen ones flash white
  3 times over 12 f at the stop; a provisional owner's stool has a dashed outline in its colour, a final one a solid rim.
- **The animals** (`pose`): sitting (4 px up on the stool, facing the room's centre); a 유령 at 0.55 with `fx_ghost`; the
  one left standing at the reveal shows a `?` word pop.
- **HUD**: centre `clock` `3/8`; line 2 a stool icon (`drawStool` at 8 px) and my points; 유령 panels at 0.55.
- **Music**: **new** song `chair` (audio.js `CHAIR`, loop, 4 bars, ~150 bpm: a bouncy two-beat bath-house tune, square
  lead, triangle bass, light drums; `MUSICS` index 14). `miniStart` sets `G.music = 'chair'` for the whole 판 (so `mu`
  stays `chair` on the wire and `applyView` never fights the cuts). Each page, each frame (`chairSound`), asks
  `Snd.music(inMusic ? 'chair' : null)` **directly** - `inMusic` from its own view clock (`Ms <= view < S`): the cut lands
  exactly at its own draw of `S`, and the tune restarts from bar 1 at the next `Ms`. (`Snd.music` with the playing name
  is a no-op - game.js's wrapper keeps `Snd.cur` - so the per-frame call costs nothing; audio.js fades a stopped track
  over `FADE` 0.08 s, a clean cut.) The audio resync on unlock / resume (`Snd.cur = undefined; Snd.music(G.music)`)
  plays `chair` for one frame in a stop before `chairSound` cuts it again - harmless. At 끝! `setMusic(null)` as every 판.
- **Sounds**: **new** `scratch` (the cut: a 0.25 s noise sweep 1.8 kHz → 300 Hz, a soft thump; local, at each page's own
  `S`); `item` on my sit (local), `pop` when a friend's claim appears in my mirror (local); `bounce` on a bump (local);
  `ghost` when someone goes out and `extend` at the survivor's +2 (echoed from the host); `countdown` at each reveal
  (local).

Audio output latency differs per device (Bluetooth ~200 ms): **the stop is the frozen, flashing stools on screen**; the
sound follows it. Stamps are measured from the draw, so a player who waits for the sound only gives away time.

### 5.8 Card and demo

- Name `목욕 의자 뺏기`; how `음악이 멈추면 앉아요! 못 앉으면 빠져요` (16 syllables); rule `의자는 늘 하나 모자라요 ·
  빠져도 유령으로 계속 앉아요 · 앉으면 1점, 끝까지 남으면 +2점`.
- **Demo** (`chairDemo`, 240 f): floor tiles at y 28; two stools (8x4, `drawStool` at half) gliding - stool 1
  `x = 14 + 30 tri(f / 50)`, stool 2 `x = 70 - 34 tri(f / 38)` - while 2x2 white `♪` pixels rise over the three animals
  (16 px, feet at y 28: `a`, `b`, and `c` as 술래's demo derives it) walking slowly at x ~20 / 40 / 60, until 110.
  - 110: the notes stop, a red 1x4 "!" over the centre, the stools freeze and flash.
  - 112-140: `a` and `c` dash to the stools and sit (drawn 3 px up); `b` stands with a 3x5 `?`.
  - 150-190: `b` fades to 0.55 with a 3x3 wisp (a 유령).
  - 200-240: the notes again, the stools glide, all three (the ghost too) walk.
  - Read together: music → walk, it stops → sit, one short → that one is a ghost.

### 5.9 State and wire

```js
  // G.mini (host): seed, i (the stop), ph (0 music / scramble, 2 reveal, 3 survivor, 4 done), Ms, S (hidden until passed),
  //   k (stools), own {stool: [slot, stamp, dx, f0, final]}, bump {slot: stop}, sat {slot: stamp}, gh, pts, standF, rtMax, n
  // G.mloc[slot]: i, sit (stool or -1), tick, sh (the stop's first draw time)
  // g.mg = ['h', i, ph, seed, Ms, S, [[stool, slot, stamp - S, final]], gh bits, [pts by seat], n, k, bump bits, surv]
  // mi   = [판 i, stop, stool, tick - S, dx]   (relative: parseBody clamps each int to ±1e6 - 3.2)
```

About 95 bytes at 4 players.

---

## 6. 맥반석 계란 돌리기 (`egg`, hot potato) — Should, built third

`MINI.egg = { c: 'e', secs: 70, fastSecs: 35, ar: ['b'], noFire: true, cues: false, fits: (n) => n >= 2, short: '계란', ... }`
(a dry battle arena, not the last one used; kits as the party's 특기 setting, as 왕관; nobody blows bubbles).

### 6.1 Rules

- **6 rounds** (`EGG.rounds`). The 판 ends 30 f after the last round's reveal; `secs` 70 is a safety cap.
- **A round**:
  1. **Drop** `EGG.dropF` 36 f: a hot 맥반석 계란 falls from the ceiling onto a player drawn by the host (any present,
     non-stale one - `miniStale`: a hidden tab could never pass it on -, not the last round's loser when another is there).
     Banner `냥냥한테 떨어졌어요!` (class `round`); my own line `내 계란!` / `친구에게 부딪혀요` when it is me.
  2. **Live**: the fuse is `ri(210, 420)` f (3.5-7 s) from the landing - **hidden** (the burst tick `B` never reaches the
     wire before the host's clock). The holder carries the egg over its head.
  3. **Pass**: the holder's body **bumps** a friend → the egg jumps to the friend (a 12 f arc), `앗 뜨거!`. Whoever just got
     it juggles it for `EGG.coolF` 45 f and cannot pass it on before that (no ping-pong). Anyone may hold it: living or 유령.
     **Hot feet**: after its juggle the holder walks `EGG.run` 1.2x (a factor in `updatePlayer`'s walk, as `CROWN_SLOW` is
     for the crown; each page for the body it moves, from its mirror's holder or its own predicted receipt). With equal
     speeds a fleeing friend could not be caught across the link (6.5); 1.2x makes a chase end in a few seconds.
  4. **Heat** (no clock to read): from `EGG.steamF` 90 f after landing the egg steams, from 180 it shakes ±1 px, from 240 it
     glows red; the tick sound speeds up with the time since landing. None of this depends on `B`.
  5. **Burst** at `B`: `펑!` on the egg. Whoever holds it then **loses the round** (a yolk splash over it: `탈락!` if living -
     it becomes a 유령 -, `꽝!` if a 유령). Everyone else **+1**.
  6. **Reveal** `EGG.revealF` 72 f (+ the survivor beat `survF` 60 f when one living player is left: +2, everyone back).
- **Points**: a round not lost **+1**, the set's survivor **+2**.
- Length: ~48 s at a human pace; worst honest (fuse 420 + the burst wait 60 + survivor every round) 65 s. Fast party: 3
  rounds (worst 33 s).

### 6.2 Out players

A 유령 is in every round: it can be handed the egg and must get rid of it like everyone (holding at the burst costs it the
round's point, not a life). The living would rather pass to a living friend - a burst on a 유령 puts nobody out - so 유령
are both targets and hunters. Nobody watches.

### 6.3 Controls

- Phone: the stick runs, 점프 jumps (and the animal's 특기 on 점프, as in 왕관). Keyboard ←→, ↑ / Z. Passing is touching.
- Card keys: `keys` `←→ 달리기 · Z 점프 · 부딪히면 넘어가요`, `keysT` `조이스틱 · 점프 · 친구에게 부딪혀요`.

### 6.4 Players

2 players: a chase of two, every round a set. 3 / 4: free for all. A leaver holding the egg: it drops again (36 f) onto a
present player; the round's fuse goes on, but never bursts before the new holder's juggle is over (`B = max(B, landing +
coolF + 30)`, still hidden). A leaver that leaves one living player ends the set without the +2, as in 의자.

### 6.5 The host's judging and the online fairness argument

**A pass is decided on the receiver's own screen** - the one it happens to, as a dodge in battle counts on the victim's
screen (`lagTrapCheck`).

- **The touch**: each page checks the bodies it moves (host: its local seats; guest: itself): when I am not the holder in my
  mirror, the holder's juggle is over in my view (`since + coolF <= my view tick`), and my body box grown by `EGG.slack`
  3 px overlaps **the holder as my screen draws it** (a guest: the host's world at its view and other guests' peer
  streams, exactly what it shows; the host: a remote holder's `shownAt(pl)` sample, `PEER_DELAY` behind - what the host
  shows) → **I received it**: my page shows the egg on me at once (predicted) and reports
  `mi = [판 i, r, n, giver, tick - L]` (`n` my receipts this round, `tick` my view tick - host `G.frame`, guest
  `Math.round(NET.rtHi)` - relative to the landing `L`, 3.2).
- **The host** (`input`): takes a receipt when its round is live, `giver` is the current holder, its stamp
  `miniStamp(M, p, L + mi[4])` is past the giver's `since + coolF`, and the receiver is present and not the giver. Then the
  holder is the receiver and **`since` = the receipt's stamp** (not the host's frame: a remote receiver's juggle then ends
  at the same view tick as a host-local one's would - with `G.frame` it juggled the link's delay longer, 20-40 f of holding
  a bad egg). Every page sees the juggle end at view tick `since + coolF`.
- **The receiver's prediction** is dropped when its mirror shows a holder that is neither me nor the giver, when the round
  moved on (burst, reveal), or when my view passed `tick + LAG_MAX + 30` without the mirror showing me (the host refused
  it and nothing else changed - the mirror would show the giver forever).
- **The burst**: at `B` the host notes the holder `bh` and waits until every present, non-stale remote seat other than `bh`
  (only they can report a receipt from it) has `rtMax` past `B`, or `B + LAG_MAX` (`miniPast`). A receipt that arrives
  meanwhile with a stamp **before `B`**, from `bh`, past its juggle, is a **last-second pass**: the receiver loses the
  round. One stamped at or after `B` is ignored. Each page draws the burst at its own view of `B` as a crack and a steam
  puff on its mirror's holder; the yolk splash goes on the loser at the reveal, so a late pass never shows a burst on the
  wrong animal.
- **Why the receiver's view**: two bodies, two pictures. The host sees a guest about one-way + `PEER_DELAY` 6 behind (12
  ticks at 100 ms each way), a guest sees the host about one-way + its playout delay (8-24: 14-30 ticks) and other guests
  one-way + `PEER_DELAY` (12). Judged on the receiver's screen, **each receiver dodges exactly the holder it sees**, and
  each holder must be where its target will be once its own picture reaches the target's screen. Against the target's
  true position that is 12-14 ticks; against the stale picture the holder chases, the two delays add up: **~24-26 ticks
  (about 0.4 s) for every pair** - host-guest 12 + 14, guest-guest 12 + 12. Nobody's pair is shorter, so the host gets no
  zero-latency edge either way: as a holder it chases guests' images like any holder, as a receiver it dodges guests'
  images like any receiver. 0.4 s at the base walk is ~30 px a fleeing friend gains, which is why the holder runs 1.2x
  (6.1) and a near touch counts (3 px slack). (Judging on the holder's screen gives the edge to whoever sees stalest
  images; judging all bodies at one view tick puts the whole link on the host - section 17.)
- **Ties and order**: two receipts from one holder close together are taken in the order the host gets them; the 45 f
  juggle is longer than a normal link's delay, so a chain cannot fork. The host-local receiver's report is never late, so
  the rare double contact goes **against** the host (receiving is bad).
- **A hidden tab** cannot receive (its page does not run): an idle friend's animal is a wall the egg cannot reach. A hidden
  holder keeps the egg and loses the round.
- **Cheating bounds**: a modified page could never report a receipt. Same trust as every body state (a page could also walk
  through walls). Accepted for 4 friends.

### 6.6 Places, ties, coins, awards

- `key = pts * 1e5 - heldF` (frames I held the egg over the 판, the juggle included). Shared places are rare.
- Coins: a pass I made (my mirror's holder moves from me to a friend), or a round I came through having walked 64 px.
- Awards: only 최다 1등상.

### 6.7 Screen, HUD, sprites, sounds

- **The egg**: `item_egg` at 12 px over the holder's head (its tag moves 6 px up: `tagY`); heat by `tintOf(item_egg,
  '#ff7a3a', 0.15 → 0.5)` with the time since landing; steam (3 white pixels rising, canvas) from 90 f; ±1 px shake from
  180; a red 1 px rim blinking from 240. The juggle: the egg hops 2-4 px over the receiver's paws for 45 f. A pass draws a
  12 f arc from giver to receiver (each page from its mirror's change, or at once for my own prediction).
- **The burst**: at my view of `B`: `bubble_pop` frames tinted cream with 8 yolk pixels (`#ffd23c`, `#fff1a6`) and a
  steam puff; at the reveal the loser gets the yolk over its head for 48 f (drops, as 물벼락's).
- **The animals**: a 유령 at 0.55 with `fx_ghost`; the holder's HUD panel blinks orange.
- **HUD**: centre `clock` `2/6`; line 2 an `item_egg` icon (8 px) and my points.
- **Sounds**: **new** `egg_tick` (o.n 0-3: a woodblock click, higher with o.n; each page at its own rate - every 30 f, down
  to every 8 f by the time since landing; local), **new** `egg_boom` (a cartoon "퍽" - a short noise burst with a falling
  sizzle; local at each page's own `B`); `item` on a pass in my mirror and on my own receipt (local); `ghost` / `extend`
  (echoed). Music `battle`.

### 6.8 Card and demo

- Name `맥반석 계란 돌리기`; how `계란을 부딪혀 넘겨요! 들고 터지면 빠져요` (17 syllables); rule `왕관과 반대예요 · 빠져도
  유령으로 계속 해요 · 안 걸리면 1점, 끝까지 남으면 +2점`.
- **Demo** (`eggDemo`, 240 f): floor tiles at y 28 and a 2-tile ledge at x 70-86, y 20; every animal 16 px (feet at y 28,
  `c` on the ledge at y 20); `a` walks right carrying the egg (8 px) from x 4 into `b` at x 40 (0-56).
  - 56: they touch; 56-68 the egg arcs onto `b`; 68-110 it juggles over `b`; `c` (the derived third) walks on the ledge.
  - 110-168: `b` stands; the egg steams (from 110), shakes (from 140), blinks red (from 156).
  - 168: the burst - a cream splat and yolk pixels; 170-230: `b` fades to 0.55 with a wisp (a 유령).
  - 200-236: a new egg falls from the top onto `c` (8 px).
  - Read together: bump to pass; it bursts on whoever holds it; that one is a ghost.

### 6.9 State and wire

```js
  // G.mini (host): r, ph (0 drop, 1 live, 2 the burst wait, 3 reveal, 4 survivor, 5 done), h0 (the drop's holder), L (the
  //   landing tick), B (hidden until passed), holder, since, from (the last giver), bh, loser, log [[from, to, stamp, f]],
  //   gh, pts, heldF, n
  // G.mloc[slot]: r, n (my receipts), pred {from, tick} (my predicted receipt), lastHolder
  // g.mg = ['e', r, ph, holder, since, L, B, loser, gh bits, [pts by seat], n, from]   (B only once the host passed it)
  // mi   = [판 i, r, n, giver, tick - L]   (relative to the landing - 3.2)
```

About 65 bytes.

---

## 7. 미끌미끌 비누 씨름 (`sumo`, ring-out) — Could, built last

`MINI.sumo = { c: 'u', secs: 45, fastSecs: 20, ar: ['p', 4], base: true, fits: (n) => n >= 2, short: '씨름', ... }` (a world
game; bubbles on - they push instead of trapping; the normal clock cues; music `battle`, `hurry` for the last 10 s;
`fastSecs` 20 because `partySecs` gives a game without one 12 s in the debug fast party - shorter than its last stretch).

### 7.1 Rules

- **The 평상**: a raised wooden platform 144 px wide (x 56-200) over two 탕 (x 16-56 and 200-240). Its top is soaped: on it
  everyone slides - `SUMO.acc` 0.07 instead of `acc` 0.5, so starting and stopping take ~18 frames; top speed the base walk.
- **Bubbles push**: each player blows the base kit's bubble from the 거품 button (the magazine and cooldown as in battle),
  but slower - `SUMO.shotV` 2.0 px/f for `SUMO.shotF` 60 f (120 px), then it pops (no floating bubbles). A bubble that
  touches a body **pushes** it: `vx = ±SUMO.push` 2.4 the bubble's way and a small hop (`vy` -1.3); on soap one push slides
  ~40 px. A bubble pushes one body once; nobody is ever trapped. Jumping over a bubble dodges it (37 f of air). A sumo
  bubble that meets a wall or the 평상's side pops (`stepShot`'s `'wall'` would otherwise leave it floating).
- **Ring-out**: feet under the 탕's surface (`wl` 196) + 3 px → **풍덩!**: that player rides an **오리 튜브** in that 탕 (7.2).
- **Credit**: the last friend whose bubble pushed me within `SUMO.creditF` 120 f before I fell gets **+1** (`밀어냈다!`). A
  fall nobody pushed (walked off, slid off on my own) credits nobody.
- **Sets**: when at most one player is left on the 평상, 60 f later the survivor gets **+2**; then a 72 f reset - everyone
  back on the 평상's spots (`placePlayer`: a new epoch), rafts gone, bubbles gone - and the next set.
- **The last 10 s**: banner `더 미끌미끌!` / `10초 남았어요` (class `hurry`), music `hurry`: the soap gets slipperier
  (`acc2` 0.045) and pushes stronger (`push2` 3.0) - sets end.
- **Time-up** (45 s): everyone still on the 평상 in the unfinished set gets **+1** (`버텼다!`).
- **Points**: a credited push-out +1, the set's survivor +2, still standing at time-up +1.

### 7.2 Out players: 오리 튜브 and 역전

- A fallen player is a raft as in 물 v2 (`p.raft` through `raftOn`, `raftMove` on `M.wl` 196, `RAFT.walk` 0.75, a hop of
  `RAFT.hop` -3.0, the plain bubble through the magazine). Two things `raftMove` does not do today: it ignores tiles and
  clamps x to the whole room (`WALL_L - 2 .. WALL_R - 14`) - in 물 the water is full width. In sumo a raft at y 184 would
  slide **through** the 평상 (rows 21-24) into the other 탕, so a **new** gated clamp keeps it in its own 탕 (feet centre
  x 24..48 left, 208..232 right: `M.tub[slot]`, set at the fall). Its 탕 is 40 px wide; the 평상's side stops its bubbles,
  so it must **hop and blow** to reach the 평상 top (from the hop's top, y ~164, a bubble flies at the standers' height).
- A raft's bubble pushes like any. **역전**: if the friend it pushed falls in within `creditF`, the raft gets the +1 and
  **comes back** onto the 평상's centre - a **new** `sumoBack` (water's `raftBack` reads `LV.rise.revive`): `raft = false`,
  `placePlayer` on `sumo.revive`, `SUMO.revInv` 90 f blinking (not pushable), its `M.rv` - once per raft per set.
  `역전!` / `다시 올라왔어요!` (existing texts).

### 7.3 Controls

- Phone: the stick slides ←→, 점프 hops, 거품 blows. A raft: ←→ in its 탕, 점프 hops, 거품 blows. Keyboard ←→, Z, X.
- Card keys: `keys` `X 비눗방울 · Z 점프 · ←→ 미끌미끌`, `keysT` `거품으로 밀기 · 점프로 피하기`.
- Everyone has the base kit (`base: true`): no 특기 (a capy slam or a penguin slide would decide every set).

### 7.4 Players

Spots (feet centres) on the 평상: 2 players x 96 / 160, 3 players 80 / 128 / 176, 4 players 76 / 108 / 148 / 180. With 2 every
fall ends the set (a quick 1v1; no raft time). A leaver: its body is gone, the set checks again (one left by a leaver: no
+2). A **stale** seat (no state for `SUMO.staleF` 120 f: a hidden tab) falls in - a page that does not run cannot be
pushed, and a statue on the 평상 would never let a set end; the host puts its raft in the nearer 탕 (x clamped into it:
`raftOn` keeps x, which is on the 평상) and credits nobody.

### 7.5 The host's judging and the online fairness argument

**A push is decided by the page that moves the body pushed** - its own screen, its own physics.

- **The push**: each page checks the bodies it moves (host: local seats; guest: itself, in `guestSelf` beside
  `guestBounce`) against the bubbles **as it draws them** (a guest: the host's world at its view; the host: its world now).
  A touch → the push is applied to that body at once (no snap, no epoch), the bubble is hidden on that page, and
  `mi = [판 i, set, hitN, by, tick - F0, bid1, bid2]` tells the host (my push count, the last pusher, my view tick then
  relative to the set's start `F0` - 3.2 -, the last two bubble ids). The host pops those bubbles and keeps
  `last[slot] = [by, stamp]`. Until that `mi` arrives the bubble still flies in the host's world, so in the rare case of a
  second body standing within the link's delay behind the first along its path it can push that one too (accepted).
- **No captures anywhere**: a party is `G.gameMode === 'battle'`, so today a guest's `guestClaim` would send a `'tp'` claim
  for a sumo bubble touching a rival and show its predicted catch (the gulp, `trap_player`, the bubble riding on the
  rival) before the host refuses it. `guestClaim` returns at once in sumo, and `trappable` is false there (so
  `claimCheck`, `playerTrapCheck` and `lagTrapCheck` catch nothing).
- **The fall**: the host judges it from body states, as 물 does: host-local bodies each frame; a remote seat from its latest
  state of its epoch (`feet > wl + 3`), stamped `max(rt, at - LAG_MAX)`. The guest freezes its own input for at most 30 f
  under the surface while the verdict comes (물's `가라앉는 중`); the host makes it a raft (`bumpEp`; `takeOver` copies the
  raft flag). Credit: `last[slot]` if `stamp - its stamp <= creditF`.
- **Order of falls**: by stamp, so two falls close together end the set in view-tick order; equal stamps → nobody gets the
  survivor's +2 that set.
- **Why the pushed one's view**: it can only dodge what it sees; a push it did not see on its screen never moves it.
  **Every target sees every bubble's whole path on its own screen**, from where it appears to where it touches - a guest's
  bubble is born in the host's world one-way after it was blown, but at the spot it was blown from, and flies its full
  60 f there; the host's bubble reaches a guest's screen late but whole. So everybody's reaction window is the same
  (a 2 px/f bubble crosses 60 px in 30 f, a jump takes 37 f of air).
- **What differs by pair is aiming** (as in battle): a shooter aims at a picture that is 12-30 ticks old, and its bubble
  reaches the target's screen later still - about 20 ticks of lead for a guest aiming at the host, 26 for the host aiming
  at a guest, ~32 guest to guest at 100 ms each way. The host's own body is the easiest target, never the hardest. No
  correction: the draft's "split the link" advance (`hostShot` stepping a guest's bubble forward) would cut only the host's
  reaction window - left out (17).
- **Cheating bounds**: a modified page could ignore pushes. Same trust as every body state.

### 7.6 Places, ties, coins, awards

- `key = pts * 1e5 + platF` (frames I stood on the 평상 over the 판, capped 99999: the longer on, the better).
- Coins: every blow counts through `coinShot` already (`fire` calls it on my own page, a raft's blows too) - no `coinAct`.
- Awards: only 최다 1등상 (pushes are not prisons).

### 7.7 Arena, screen, HUD, sprites, sounds

**비누 평상** (`PG.PARTY_ARENAS[4]`, key `'sumo'`, theme 3): closed, 32x26, rows 21-24 solid at cols 7-24 (the 평상, top y
184), the floor row 25, the two 탕 open at cols 2-6 and 25-29 rows 21-24; nothing else. Mirror-exact.

```js
      sumo: { wl: 196, spots: { 2: [96, 160], 3: [80, 128, 176], 4: [76, 108, 148, 180] }, revive: 128 },   // feet centres (px)
```

`loadPartyArenas` keeps it (**new** `sumoOf`: `wl` between the 평상's top and the floor, spots on the 평상), else
`fallbackPartyArena('sumo')`.

- Drawn: the 평상's wooden boards (the tiles in `#c98c4c` with `#8a5428` seams, canvas over them), white soap suds dots on
  its top that shiver under a sliding body (cosmetic, `G.parts`), the 탕 water as 물's layer at the constant `wl`
  (`#3fbfe0` 0.45, the light surface line), steam wisps.
- Bubbles: the `bubble` sprite in the shooter's tint; a push: a `bubble_pop` and 4 suds pixels at the contact.
- HUD: the clock (normal, with its cues); line 2 a `bubble` icon and my points; raft seats at 0.7 (today's raft rule).
- Sounds: `bounce` on a push (the pushed page, local; others from the mirror's `hits`), `b_splash` + `splash` on a fall
  (echoed), `revive` on 역전 (echoed), `extend` on the survivor's +2 (echoed), `hurry` at the last 10 s.

### 7.8 Card and demo

- Name `미끌미끌 비누 씨름`; how `비눗방울로 밀어내요! 탕에 빠지면 탈락` (16 syllables); rule `빠지면 오리 튜브로 밀어서
  역전! · 밀어 빠뜨리면 1점, 끝까지 남으면 +2점`.
- **Demo** (`sumoDemo`, 240 f): the 평상 as tiles at x 16-80, y 24 (top), water at x 0-16 and 80-96 from y 26 (blue at
  0.45, a light line); `a` (8 px) at x 24, `b` at x 56, on the 평상.
  - 20: `a` blows a bubble (6 px) right; 20-44 it flies to `b`.
  - 44: `b` is pushed - it slides right with 2 suds pixels (44-70) and off the edge at 72; 72-84 it falls, a splash.
  - 90-150: `b` bobs on a `duck_ring` at x 84; 150 it hops and blows a bubble left; 150-176 the bubble reaches `a`.
  - 176-200: `a` slides left and falls off at x 12 (a splash); 204: `b` pops back onto the 평상 with stars (역전).
  - Read together: bubbles push, a fall makes a duck ring, pushing back brings you back.

### 7.9 State and wire

```js
  // G.mini (host): set, F0 (the set's start tick), ph (0 live, 1 the set's end, 2 reset), endAt0 (the set's end tick),
  //   outs [[slot, stamp]], last {slot: [by, stamp]}, rv {slot: 1} (came back this set), tub {slot: 0 | 1}, hits {slot},
  //   pts, platF, wl, last10
  // G.mloc[slot]: set, hitN, used (bubble ids that pushed me), by, tick
  // g.mg = ['u', set, ph, [pts by seat], [hits by seat], rv bits, last10, wl, surv, F0, tub bits]
  // mi   = [판 i, set, hitN, by, tick - F0, bid1, bid2]   (relative - 3.2)
  // (bubbles in U as in battle: at most 3 a player)
```

About 55 bytes, plus the bubbles in `U` (~30 bytes each, at most 12).

---

## 8. Network

### 8.1 Gate: `PARTY_V` 8

`PARTY_V` 7 → **8** (this page plays 수도꼭지, 의자, 계란, 씨름; the `'L' 'R' 'D'` entries are local only). A pa 7 page in a
party room is never ready and shows `새로고침 필요` (the existing `seatReady` / `seatOld` / `R.u`). An older page would read
`t h e u` as 물 (`partyView` falls back) and `mu` 14 as its last track. party-net's crafted older guest sends `pa: 7`. The
old games' wire is byte-identical; `PARTY_TRO_V` stays 5. (If the board PR or another lands first, `PARTY_V` is main's
value + 1 at build time.)

### 8.2 Who decides what

| Thing | Who | On the wire |
|---|---|---|
| The plan | host | `g.pa.L` (codes `w c b m f s t h e u`) |
| 수도꼭지: the sequence, the show, the close | host (a seed, the arm tick) | `g.mg` |
| 수도꼭지: my answer and its time | **my page** (my go draw, my presses) | `mi` |
| 의자: the stools, the stop | host (a seed, `Ms`, `S` revealed at its tick) | `g.mg` |
| 의자: my sit and its view tick | **my page** (my body on my screen) | `mi` |
| 의자: who keeps which stool | host, by stamp | `g.mg` |
| 계란: the drop, the fuse, the burst | host (RNG; `B` revealed at its tick) | `g.mg` |
| 계란: "the holder touched me" | **the receiver's page** | `mi` |
| 계란: the holder, the loser | host (giver check, juggle, late passes) | `g.mg` |
| 씨름: a push | **the pushed body's page** | `mi` |
| 씨름: falls, credits, rafts, 역전, sets | host (body states, stamps) | `P` rows (raft flag), `g.mg` |
| 유령, points, survivors | host | `g.mg` |
| My coins | each player for itself | none |

### 8.3 Snapshot fields and sizes

| Field | Size | Note |
|---|---|---|
| `g.mg` 수도꼭지 | ~110 B | seed, ticks, a row per seat |
| `g.mg` 의자 | ~95 B | seed, `Ms` / `S`, at most 3 stools |
| `g.mg` 계란 | ~65 B | |
| `g.mg` 씨름 | ~55 B | + bubbles in `U` (~30 B each, at most 12) |
| `g.pa.H` | ~8 B | only while the trophy hold runs (3.8) |
| body state `mi` | 14-26 B | per guest, every 2 frames, only while playing a game with `local` (ticks relative, 3.2) |

A party snapshot is about 1.0-1.3 KB at 4 players (씨름 with every bubble out ~1.7 KB): under `SNAP_LIMIT` 3400 (party-net
asserts it every run). `mi` is at most 7 ints (`parseBody` keeps 8).

### 8.4 Guest hooks

- `guestSelf`: the game's `local` as today (`NET.mi`); `miniParked` for chair's own sit (its `frozen` reads the local sit
  for my own body, as 술래's line); egg: the holder's run factor from my mirror / my predicted receipt (in `updatePlayer`'s
  walk); sumo: **new** push check over the view's bubbles (beside `guestBounce`), the 가라앉는 중 freeze under `wl` (today's
  branch tests `G.mini.id === 'water'`), the raft kept in its 탕 (`raftMove`'s gated clamp), and `guestClaim` off.
- `applyView`: a new `g.pa.i` resets `G.mloc`, `NET.mi`, `NET.rtHi` (as today).
- `partyView` / `miniView`: the four new `view`s mirror their `g.mg` (bounded by `nInt` as every view); `tapView` /
  `chairView` merge `mg1`'s events (an event at tick e with `a.k < e <= rt` is only in the next snapshot).
- Sounds that are each page's own (`tap`, `scratch`, `egg_tick`, `egg_boom`, sit / pass / push sounds) are played with
  `localSfx` from each page's own draws and mirror; the host plays them with `NET.rec` off.

### 8.5 Other modes

Battle and co-op never see any of this: every new branch checks `G.mini` and its `MINI` flags (`kitOf`'s `base`,
`updatePlayer`'s soap `acc` and the egg holder's run, `raftMove`'s 탕 clamp, `fire`'s sumo shot and its wall pop,
`trappable` and `guestClaim` in sumo, `guestSelf`'s push, `stickMove`'s fixed origin in tap, `drawPosed`'s scratch canvas
only when `ga < 1`), the `'L' 'R' 'D'` entries are read only by tap. `battle-net`, `mp-net`, `trophies-net`, `kits*` and
`touch` must stay green.

---

## 9. UI

### 9.1 Korean texts (verbatim; all warmed through `PARTY_TEXT`, which now also maps `short`)

| Where | Text |
|---|---|
| 수도꼭지: name / how / rule | `수도꼭지 순서 기억하기` / `순서대로 똑같이 눌러요! 틀리면 빠져요` / `점점 길어져요 · 빠져도 유령으로 계속 해요 · 맞히면 1점, 끝까지 남으면 +2점` |
| 수도꼭지: keys / keysT / short | `↑ ← ↓ → 로 눌러요 (Z·X도 ↑)` / `점프는 위 · 조이스틱은 ← ↓ →` / `수도꼭지` |
| 의자: name / how / rule | `목욕 의자 뺏기` / `음악이 멈추면 앉아요! 못 앉으면 빠져요` / `의자는 늘 하나 모자라요 · 빠져도 유령으로 계속 앉아요 · 앉으면 1점, 끝까지 남으면 +2점` |
| 의자: keys / keysT / short | `←→ 달리기 · 의자에 닿으면 앉아요` / `조이스틱으로 달려서 의자에 닿아요` / `의자` |
| 계란: name / how / rule | `맥반석 계란 돌리기` / `계란을 부딪혀 넘겨요! 들고 터지면 빠져요` / `왕관과 반대예요 · 빠져도 유령으로 계속 해요 · 안 걸리면 1점, 끝까지 남으면 +2점` |
| 계란: keys / keysT / short | `←→ 달리기 · Z 점프 · 부딪히면 넘어가요` / `조이스틱 · 점프 · 친구에게 부딪혀요` / `계란` |
| 씨름: name / how / rule | `미끌미끌 비누 씨름` / `비눗방울로 밀어내요! 탕에 빠지면 탈락` / `빠지면 오리 튜브로 밀어서 역전! · 밀어 빠뜨리면 1점, 끝까지 남으면 +2점` |
| 씨름: keys / keysT / short | `X 비눗방울 · Z 점프 · ←→ 미끌미끌` / `거품으로 밀기 · 점프로 피하기` / `씨름` |
| `short` of the first new games | 바나나우유 `바나나우유`, 펑 `펑!`, 술래 `술래` |

`PARTY_TX` additions (`{0}` filled at run time):

| Key | Text | Where |
|---|---|---|
| `ghost1` / `ghost2` | `유령이 됐어요!` / `계속 하면 점수를 모아요` | my own line when I go out (수도꼭지, 의자, 계란) |
| `miss` | `꽝!` | word pop over a 유령 that lost a round |
| `surv1` / `surv2` | `{0} 살아남았다!` / `모두 다시 살아나요` | a set's end (의자, 계란, 씨름; 수도꼭지's end with one left, sub `tpEnd`) |
| `survAll` | `모두 살아남았다!` | 수도꼭지's end with several left |
| `newGames` | `새 게임: ` | the room's rules line prefix (3.5) |
| `tpWatch` / `tpLen` | `잘 봐요!` / `{0}개를 기억해요` | each round's intro banner |
| `tpGo` | `따라 해요!` | the go banner |
| `tpWrong1` / `tpWrong2` / `tpWrongG` | `틀렸어요!` / `유령으로 계속 해요` / `아깝다!` | my own line on a mistake (living: 1 / 2; a 유령: `tpWrongG` / `tpWrong2`) |
| `tpLate` | `시간 끝!` | word pop on a time out |
| `tpAll1` / `tpAll2` | `모두 틀렸어요!` / `이번엔 아무도 안 빠져요` | every living player failed |
| `tpEnd` | `끝까지 남은 친구 +2점` | the end banner's sub |
| `chStop` | `그만!` | the stop banner |
| `chBump` / `chBump1` / `chBump2` | `쿵!` / `밀려났어요!` / `다른 의자로!` | a bump: word pop / my own line |
| `egDrop` | `{0}한테 떨어졌어요!` | the drop banner |
| `egMine1` / `egMine2` | `내 계란!` / `친구에게 부딪혀요` | my own line when it drops on me |
| `egHot` | `앗 뜨거!` | word pop on a receipt |
| `suFall` / `suPush` / `suKeep` | `풍덩!` / `밀어냈다!` / `버텼다!` | word pops (a fall, the credited pusher, standing at time-up) |
| `suRaft1` / `suRaft2` | `풍덩!` / `오리 튜브로 밀어서 역전!` | my own line when I fall in |
| `suLast1` / `suLast2` | `더 미끌미끌!` / `10초 남았어요` | the last 10 s banner |
| `troHold` | `트로피 정산까지 {0}초` | the 최종 순위 view while the hold runs (3.8, Should) |

Reused: `out` `탈락!`, `revive` `역전!`, `reviveMe` `다시 올라왔어요!`, `pfPop` `펑!`. The how lines are one line each (16 /
16 / 17 / 16 syllables, <= 17). No string uses the retired v1 title's syllables (`final-e2e2`). The canvas font draws
only digits and `- x ! : . + / ?` (the `?` is a 3x5 glyph drawn by hand): times `2.41`, `+1`, `3/8`.

### 9.2 DOM

No new element. The card's keys line reads `keys` / `keysT`; the demo canvas, the banners, the word pops and the 최종 순위
view exist. The hold line (Should) is one `<p id="pg-party-hold">` in the tally view, hidden unless `P.H > 0`.

### 9.3 Fit

| View | 1x window (17.4em of content, no rule line) | 568x320 phone (21.4em x 20.3em, rule line shown) |
|---|---|---|
| The four cards | round, name (the longest, `수도꼭지 순서 기억하기`, ~9.6em x 1.6 = 15.4em: one line; the splash at 2.6em wraps to two, as `바나나우유 잡기` does), demo, how (<= 17 syllables), keys (<= ~19em at 0.8em), ready row, button, bar | + the rule line (two lines at 0.82em: the longest, 의자's, ~42 characters) and the touch keys (the longest new one, 의자's, ~16em - shorter than 펑's) |
| Room rules | the new-games line one row | the line wraps once at 320 px; the room panel scrolls (its ready row is sticky) |
| 최종 순위 + hold line | the rows + one 0.8em line | the same |

The fit tests check each card at 1x, 2x and 568x320 with 4 players and 12-syllable nicks (`scrollHeight <= clientHeight`).

### 9.4 HUD

- 수도꼭지 `3/6` · faucet + points. 의자 `3/8` · stool + points. 계란 `2/6` · egg + points (the holder's panel blinks). 씨름
  the clock · bubble + points (raft panels 0.7). 유령 panels at 0.55 with `fx_ghost`. No magazine pips where `noFire`.

---

## 10. Sprites and sound

### 10.1 Sprites (sprites.js house style: palette strings, characters face right, a comment saying what each pixel is)

| Sprite | Size | What |
|---|---|---|
| **new** `faucet` | 16x16, 2 frames | a chrome 수도꼭지 (W / a shading, k outline) from the wall: frame 0 shut, frame 1 the valve turned with a c drip at the spout. The handle cap is left W for a canvas colour cap. `REQUIRED` + `SPR_SIZE` |
| **new** `fx_ghost` | 8x8, 1 frame | a small 김 유령: a w puff with a W wavy tail and two k eyes (over a 유령's head, the HUD) |
| Reused | | `item_egg` (the egg, tinted), `bubble_pop` (the burst, cream), `lg_2` (the 바가지), `water_cold_top` (drops), `bubble` (pushes), `duck_ring` (rafts), the animals' `idle walk jump fall shoot die` |

### 10.2 Sound (`audio.js`, in the `SFX` table's style; levels at or under the v1 ones)

| Name | Sound | Echo |
|---|---|---|
| **new** `tap` (o.n 0..3) | a 120 ms soft square "똥", C5 / E5 / G5 / C6 (위 / 왼쪽 / 오른쪽 / 아래), a fast decay | local (`NO_ECHO`) |
| **new** `scratch` | 0.25 s: band-passed noise sweeping 1.8 kHz → 300 Hz + a soft 80 Hz thump (the record stopping) | local (`NO_ECHO`) |
| **new** `egg_tick` (o.n 0..3) | a 30 ms woodblock click, 900 Hz + 150 Hz x o.n | local (`NO_ECHO`) |
| **new** `egg_boom` | a 60 ms noise burst "퍽" with a 0.3 s falling sizzle (high-passed noise) | local (`NO_ECHO`) |
| **new** song `chair` | loop, 4 bars, ~150 bpm, two-beat: square lead, triangle bass, `k . s .` drums; in `DEFS`, `MUSICS` 14 | the track rides as `mu`; the per-stop cuts are each page's own |

Reused: `item`, `pop`, `bounce`, `countdown`, `scald_splash`, `b_splash`, `splash`, `ghost`, `extend`, `revive`, `hurry`.

---

## 11. Constants (top constants block, next to `MILK` / `PUFF` / `SNEAK`)

```js
  const PARTY_V = 8;
  // (declared ABOVE SNEAK, whose lagMax reads it - a const read before its own line throws at load)
  const LAG_MAX = 60;   // a remote seat's view tick is never older than its state's arrival minus this (SNEAK.lagMax reads it)
  // the out players of 수도꼭지 / 의자 / 계란 (3.1): drawn at alpha; the set's survivor (수도꼭지: everyone in at the end)
  const GHOST = { alpha: 0.55, bonus: 2 };
  // 수도꼭지 순서 기억하기 (4): rounds, the first length (+1 a round), frames a step by round and its dark tail, the intro,
  // the gap before go, the window (winMs + perMs x length, ms), the fastest honest step (ms), the host's slack past a
  // window (f), the reveal, my splash, the end's bonus beat, endF, the fast party's rounds
  const TAP = { rounds: 6, len0: 3, sp: [30, 30, 24, 24, 20, 20], dark: 8, intro: 36, goGap: 12, winMs: 1500, perMs: 700, minMs: 80,
    slackF: 90, revealF: 66, splashF: 48, bonusF: 60, endF: 30, fast: 3 };
  // 목욕 의자 뺏기 (5): stops, the music (f, host RNG), the stools' speeds (px/f) and their floor span (feet centres), the
  // spread at the stop (px), the seat (feet within px of the centre), the host's check (px), the close cap after the
  // stop, the reveal, the survivor beat, endF, the fast party's stops, the sitting lift (px)
  const CHAIR = { stops: 8, music: [120, 300], spd: [1.4, 2.0], lo: 28, hi: 228, gap: 18, seat: 6, slack: 8, capF: 240, revealF: 60,
    survF: 60, endF: 30, fast: 3, sit: 4 };
  // 맥반석 계란 돌리기 (6): rounds, the drop, the fuse (f, host RNG, hidden), the juggle, the touch slack (px), the heat
  // stages (f since landing), the reveal, the survivor beat, endF, the fast party's rounds, a survived round's coin (px),
  // the holder's walk after its juggle (x its walk: a pass stays reachable across the ~0.4 s of two pictures)
  const EGG = { rounds: 6, dropF: 36, fuse: [210, 420], coolF: 45, slack: 3, steamF: 90, shakeF: 180, glowF: 240, revealF: 72,
    survF: 60, endF: 30, fast: 3, moveCoinPx: 64, run: 1.2 };
  // 미끌미끌 비누 씨름 (7): the soap's acc (the last 10 s: acc2), the push bubble (px/f, f), the push (vx, the last 10 s
  // push2) and its hop, the credit window, a set's end after at most one is left, the survivor beat, the reset, 역전's
  // blink, a stale seat falls in after (f), the last stretch (s)
  const SUMO = { acc: 0.07, acc2: 0.045, shotV: 2.0, shotF: 60, push: 2.4, push2: 3.0, hop: -1.3, creditF: 120, early: 60, survF: 60,
    resetF: 72, revInv: 90, staleF: 120, lastS: 10 };
  // MINI: tap 75 s, chair 95 s, egg 70 s (safety caps: they end by their last round), sumo 45 s (its clock); fastSecs 35
  // for tap / chair / egg, 20 for sumo; MINI_IDS + 'tap', 'chair', 'egg', 'sumo'
```

Tuning knobs after the friends' next play: `TAP.sp` / `perMs` (how hard to remember, how much time), `CHAIR.music` /
`spd` (how long the wait, how hard to be near a stool), `EGG.fuse` / `coolF` / `slack` / `run` (how hectic, how easy a
pass), `SUMO.acc` / `push` / `shotV` (how slippery, how strong, how dodgeable), `GHOST.bonus` (how much the survivor
matters).

---

## 12. Code placement

| File | What |
|---|---|
| `game.js`, top constants | `PARTY_V` 8, `LAG_MAX`, `GHOST`, `TAP`, `CHAIR`, `EGG`, `SUMO`; `MINI.tap / chair / egg / sumo` (with `music`, `base`, `short`, `keys`, `keysT`), `short` on milk / puff / sneak, `MINI_IDS`; `PARTY_TX` additions; `PARTY_TEXT` adds `short`. |
| `game.js`, input layer | `onKeyDown` pushes `'L' 'R' 'D'`; `stickTap` and `STICK.td` in `stickMove` (reset in `stickReset`); `stickMove` skips the origin drag while tap plays. |
| `game.js`, world | `kitOf` reads `miniFlag('base')`; `updatePlayer`'s `acc` for sumo's soap (gated `G.mini.id === 'sumo'` and on the 평상) and the egg holder's `EGG.run` in the walk chain (beside `CROWN_SLOW`); `raftMove`'s 탕 clamp in sumo; `fire` / `newShot` the sumo shot (speed, life, no float, a wall pops it); `trappable` false in sumo and `guestClaim` returns in sumo; the push check for host-local bodies (in the sumo tick) and in `guestSelf` (own body), with the 가라앉는 중 freeze for sumo too; `drawPosed` draws a `ga < 1` pose through a scratch canvas (`ctx` swapped); **new** `drawStool` (펑's stool rects at any scale). |
| `game.js`, party section | `miniRt` / `miniStamp` / `miniPast`; `ghostOut` / `ghostSet` / `ghostBits` (`M.gh` only - never `p.out` / `p.ghost`); `miniStart` reads `music`; `P.crownAr` → `P.lastAr` (`newParty`, `partyView`, `miniLoad`); `partyRules`' line from `short`; `troPartyWait`'s `P.H` and the hold line (Should). |
| `game.js`, the games (after 술래's section) | 수도꼭지: `tapSeq`, `tapPlan`, `tapRound`, `tapTick`, `tapSeen`, `tapLocal`, `tapInput`, `tapClose`, `tapView`, `tapDraw`, `tapPose`, `tapHud`, `tapDemo`. 의자: `chairX`, `chairStools`, `chairStop`, `chairSeen`, `chairLocal`, `chairInput`, `chairTick` (final, close, cap), `chairClose`, `chairFrozen`, `chairSound`, `chairView`, `chairDraw`, `chairPose`, `chairHud`, `chairDemo`. 계란: `eggRound`, `eggDrop`, `eggSeen` (the holder as this screen draws it), `eggLocal`, `eggInput`, `eggTick` (the burst wait, late passes), `eggClose`, `eggView`, `eggDraw`, `eggPose`, `eggHud`, `eggDemo`, `eggHolder(p)` (the run factor's test, as `crownHolder`) - all apart from the frog's `eggCap` / `ty: 'egg'`. 씨름: `sumoSpawns`, `sumoTick` (falls, credits, 역전, sets, the last 10 s, time-up), `sumoPush` (a body's own page), `sumoLocal`, `sumoInput`, `sumoFall` (its raft in the nearer 탕), `sumoBack` (역전 onto `sumo.revive`), `sumoSet`, `sumoView`, `sumoDraw`, `sumoHud`, `sumoDemo`; the four `MINI_FN` entries. |
| `game.js`, render / HUD | `drawHUDParty`'s 유령 panel and icon; the 수도꼭지 progress pips and reveal marks; egg's `tagY`. |
| `game.js`, debug | `PG.debug.party`: `tap()`, `tapSeq(seed, k)`, `answer(slot, list, msEach)`, `chair()`, `chairX(seed, i, j, dt)`, `stoolsAt(t)`, `stopAt(t)`, `sit(slot, stool, tick)`, `egg()`, `burstAt(t)`, `recv(slot, giver, tick)`, `sumo()`, `pushMe(slot, dir)`, `fall(slot)`, `ghosts()`, `music()` (`Snd.cur`: the track this page asked for - `PG.Audio._state().track` stays null while audio is locked in a headless run); a fake remote seat's state and `mi` through the **existing** `fakeBody(slot, st)` (it already takes `k / rt / ep / mi / x / y / fl` and stamps `at`; extend it to take `at`), presses through the existing `press(slot, act, t)` (`'L' 'R' 'D'` too) - `answer` builds on it; `consts()` + `TAP CHAIR EGG SUMO GHOST LAG_MAX`; `state().mini` + each game's fields. |
| `levels.js` | `PG.PARTY_ARENAS[4]` 비누 평상 (`'sumo'`, its `sumo` field). Engine: `PARTY_KEYS` + `'sumo'`, `fallbackPartyArena('sumo')`, `sumoOf`. |
| `sprites.js` | `faucet`, `fx_ghost` (~40 lines). |
| `audio.js` | `tap`, `scratch`, `egg_tick`, `egg_boom` (~50 lines); `CHAIR` song (~40 lines); `VARIANTS` for the o.n ones. |
| `page.html` | `#pg-party-hold` (Should). |
| `tools/validate-levels.js` | `PARTY_KEYS` / `PARTY_NAMES` + 비누 평상: closed, mirror-exact, the 평상 (rows 21-24, cols 7-24) with nothing over it up to row 1, each 탕 open from row 21 to the floor, `wl` between the 평상's top and the floor, every spot on the 평상 standable, `revive` over it. |

---

## 13. Build order, cut lines, effort

Each step leaves the party playable; each game is added to `MINI_IDS` only when its tests pass.

1. **Must - shared machinery v2**: `PARTY_V` 8, `MINI` flags (`music`, `base`, `short`), the room line, `'L' 'R' 'D'` +
   `stickTap`, 유령 (`ghostOut` / `ghostSet`, `ga`, `fx_ghost`, the HUD), `LAG_MAX` + `miniRt` / `miniStamp` / `miniPast`,
   `P.lastAr`, the debug hooks, the rotation tests for ten ids.
2. **Must - 수도꼭지**: the wall, the seed, the show, `따라 해요!` per page, the judge, the close, the reveal, 유령, the end's
   +2, `faucet`, `tap`, demo, wire; its tests. (Cheapest and most robust: `world: false`, 바나나우유's per-page model.)
3. **Must - 의자 뺏기**: the gliding stools, the hidden stop, the per-page cut (`chair`, `scratch`), sits by stamp,
   provisional / final, bumps, refused sits let go, the cap, sets, `drawStool`, demo, wire; its tests and both games'
   online checks.

   **— cut line A: two new games ship here (the rotation runs with 8 / 7) —**

4. **Should - 맥반석 계란 돌리기**: drops, the hidden fuse and heat, receipts on the receiver's screen, the juggle, the burst
   wait and late passes, sets, `egg_tick` / `egg_boom`, demo, wire; its tests.

   **— cut line B: three (9 / 8) —**

5. **Could - 미끌미끌 비누 씨름**: the arena (+ validator), soap, push bubbles decided by the pushed page, falls by stamp,
   credits, rafts and 역전, sets, the last 10 s, time-up, demo, wire; its tests.
6. **Could / Should polish**: the trophy hold line (3.8, Should), 의자's frame-exact guest tick (fallback: the state's
   `rt` that first shows the sit), 의자's provisional / final outlines.

**Effort**: about **3,300-3,800 changed lines**: `game.js` ~1,900 (machinery ~270, 수도꼭지 ~330, 의자 ~480, 계란 ~410, 씨름
~430), `levels.js` ~45, `validate-levels.js` ~45, `sprites.js` ~40, `audio.js` ~90, `page.html` ~5, tests ~1,300 (party ~750,
party-net ~450 incl. the `#lag` sections, touch ~40, check-integration / audio-node small). For scale: PR #26 (three games)
was planned at 2,900-3,400 in three passes. So: **four lean build passes** (1: steps 1-2, 2: step 3 + the online
checks of both, 3: step 4, 4: steps 5-6 if time allows), **one check, one full suite run** (`node tools/run-all.js`, every
Chrome run with `--mute-audio`). Plan for the cut line A games and treat 씨름 as the bonus (question 3).

---

## 14. Tests

### 14.1 `src/tests/party.js` (virtual time, stepped; `vclock` sets press and draw times exactly)

If the four sections push `party` past its 120 s budget (it ran 43 s after PR #26), they move to **new** `party2.js` with its
own job (`party2`, `test-party2.html`, 120000); `party` keeps the machinery, rotation, flow and fit.

1. **Machinery**: `'L' 'R' 'D'` from keys (fresh only); `stickTap`: cardinal pulls one entry each, a 45° pull **one** entry,
   a held pull none, ← then ↓ without the middle `'L'`, `'D'`; `music` (tap none, chair `chair`); `base` gives `KIT_BASE` in
   chair / sumo / 술래 (술래 unchanged); 유령: `ghostOut` / `ghostSet` (+2, revive), nobody out when every living one lost,
   a leaver leaving one living player (everyone back, no +2), `ga` drawn and never on the wire (a 유령 drawn through the
   scratch canvas: its pixels at ~0.55 alpha, an invuln-blinking or raft animal next to it unchanged; `p.out` / `p.ghost`
   never set), the HUD panel; `miniRt` monotonic and clamped by `LAG_MAX`, `miniStamp` bounds, `miniPast` by `rtMax`
   and by `LAG_MAX`, a provisional sitter waited for, a final seat not; **relative ticks**: a `mi` with `tick - anchor`
   survives `parseBody` with `G.frame` set past 1e6 (an absolute one would clamp); `P.lastAr` (crown and egg never repeat
   an arena); the room line from `short`; `PARTY_TEXT` holds every new string; 술래's tests still green (`LAG_MAX`).
2. **Rotation** (generic over `MINI_IDS`, as rewritten in PR #26): over 300 seeds for 2 / 3 / 4 players and 3 / 5 판 every
   game that fits shows up (10 / 9), never twice in a row, 3판 / 5판 distinct; with `MINI_IDS` cut at A and B the same.
3. **수도꼭지**: `tapSeq` pure, 0-3, never three alike; lengths 3-8 and `sp` by round; the show's lit frames; the go draw
   once (a view clock stepping back keeps one window); answers on `vclock`: right, a wrong second press (done at once, the
   splash), presses before go ignored, a time out at exactly `1500 + 700 L`, the clamp (`minMs` 80 x L), the ms; the close on
   all reports, on a stale seat, at the cap (missing = time out); points, 유령, everyone wrong → nobody out, a 유령 scoring;
   the end's +2 for one / several; the key's ms; coins per correct sequence; a leaver mid-round; `tapView` bounds and the
   `mg1` merge; the fast party (3 rounds, under `fastSecs`); the worst honest 판 under 75 s; friends' pips without
   directions.
4. **의자 뺏기**: `chairX` pure, inside `lo..hi`, every speed in 1.4-2.0; the freeze spread (>= 18 px, pure, inside); `S` never
   in `g.mg` before its tick; stools n - 1 (유령 counted); a gliding stool cannot be sat on; a sit at `S`, at `S + 40`; the
   seat edge (6 / 6.1 px), airborne no; a host-local and a remote claim (`fakeBody` with its `mi`) on one stool: the earlier
   stamp keeps it either way round, the later one bumped (its page un-parks and hops), equal stamps by `dx` then the
   rotation; a claim final only once every remote seat that can still claim is past it (or `LAG_MAX`) - a provisional
   sitter elsewhere waited for; an earlier stamp against a **final** owner refused (the final one is never bumped); a
   stale seat not waited for; a refused claim (feet 9 px off in its state) and its page letting go at `tick + LAG_MAX +
   30`, sitting again with a new tick; the close when every stool is final, when every non-stale player holds a final
   stool (after a leaver), at the cap (living standers out, unless all); points, 유령, the survivor's +2 and revive, 2
   players (every stop a set); the music cut on each page's own `S` (`music()` - `Snd.cur` - null from that frame,
   `chair` again at the next `Ms`, `G.music` stays `chair`); the key; coins per kept stool; a leaver holding a claim; 8
   stops then the end; worst honest under 95 s; fast 3 stops.
5. **맥반석 계란 돌리기**: the drop (never the last loser when another is there, never a stale seat); `B` hidden; heat
   stages from the landing only; a receipt on the receiver's screen: overlap with the 3 px slack (3 / 3.1 px), during the
   juggle refused, from a non-holder refused, the host's view of a remote holder is its `shownAt` sample; `since` = the
   receipt's stamp (a remote receipt stamped 30 f before it arrived: the juggle ends 30 f earlier than with `G.frame`); the
   receiver's prediction and its undo (another holder; the round moved on; `tick + LAG_MAX + 30` with no change); the
   holder's run (1.2x walk after the juggle, on the host for a host-local holder and on a guest for its own predicted /
   mirrored holding; 1.0x during the juggle and for everyone else); the burst wait: a remote receipt stamped `B - 5`
   arriving at `B + 20` makes the receiver the loser, one stamped `B` ignored, the wait ends by `rtMax` (the holder `bh`
   not waited for) or `LAG_MAX`; points, 유령 holding at the burst (no one out), the survivor's +2; a leaver holding
   (re-drop; `B` pushed past the new juggle); a hidden-tab holder loses; the key (`heldF`); coins (a pass, a walked
   round); 6 rounds then the end; fast 3.
6. **미끌미끌 비누 씨름**: the arena loads (and its fallback); soap: from rest to top speed and back ~18 f on the 평상, normal
   off it; the sumo shot (2.0 px/f, 60 f, pops, a wall or the 평상's side pops it, never floats, never traps); no
   `guestClaim` (no `'tp'` sent, no predicted catch) and no capture through `claimCheck`; a push on a host-local body (vx,
   hop, once per bubble), on a guest's own body through `guestSelf` with a view bubble (and its `mi`, the host popping
   it); a fall at `wl + 3`, by stamp for a remote state; the raft (kept in its 탕 - walking into the 평상 side stops it,
   it never comes out in the other 탕 -, its hop, its bubble over the 평상 edge from the hop's top); credit within 120 f
   (121 none), no credit for a lone fall; 역전 once a set (`sumoBack` onto `revive`); set end 60 f after one left (equal
   stamps: no survivor), the reset; the last 10 s (acc2, push2, banner, music); time-up +1; a stale seat falls in after
   120 f, its raft in the nearer 탕; the key (`platF`); coins from blows (`coinShot`); a leaver; fast party 20 s.
7. **Demos**: each new `demo` draws 240 frames into a 96x32 context without errors and leaves pixels; its animals 16 px.
8. **Fit**: each new card at 1x (no rule line; how and keys one line each), 2x and the 568x320 phone (`#fit`, touch keys line,
   rule line): `scrollHeight <= clientHeight`; the room line at 320; the 최종 순위 view with the hold line.
9. **Trophies**: `tro.partyHold` with a forced plan of 술래 + 의자 + 바나나우유 at bot speed: the 최종 순위 waits for the
   floor and the hold line counts down (`P.H`), then the podium.
10. **No regressions**: a battle and a co-op round after a party: kits, bubbles that trap (and a guest's `guestClaim`),
    normal `acc` and walk, a raft-free `raftMove`, the stick's origin following the thumb again, the music.

### 14.2 `src/tests/party-net.js` (4 bc frames, real time)

**Plain run** (every frame 8 / 4 ms; forced plans, the fast party):

1. Adjust: the crafted older guest sends `pa: 7`; the forced plans include `t h e u`.
2. 수도꼭지 smoke: each page answers its own (scripted real key events after its own go draw); B answers wrong in round 2 -
   the splash and its 유령 on every page; rows and points agree everywhere; the 판 ends by its rounds.
3. 의자 smoke: the stools are identical on every page at the same view tick (`stoolsAt` hashes); `S` is the same; A walks
   onto a stool and keeps it; the one left standing is a 유령 on every page; the music track is null on each page after its
   own `S` and `chair` again after the next `Ms`.
4. 계란 smoke: A carries the egg into B: B receives it (B's screen decides), every page shows B as the holder; the burst's
   loser is a 유령 everywhere.
5. 씨름 smoke: A's bubble pushes B on B's screen, B slides; B falls: a raft on every page, A credited; B's raft pushes A in:
   역전 on every page.
6. Snapshots under 3400 bytes throughout; `mi` only during the new games.

**`#lag` run** (`party-net-lag`, frame 3 = C at lat 100 / jit 40, the others 8 / 4; `rt` budget raised by the new sections):

7. 수도꼭지: H, A and C answer the same list with real key events 300 ms apart from their **own** go draw: each page's
   reported ms equals its own event time minus its own go draw (the plumbing, exact); C's ms within 30 of A's though its
   link is slow; with C scripted 200 ms a step and A 320, C places above A.
8. 의자: a stool placed (debug `stopAt` + a forced seed) so that C's body reaches it **10 view ticks before** H's own body:
   C keeps it on every page although its state reaches the host later; H, provisionally seated, is bumped (its page shows
   `밀려났어요!`); a claim stays provisional until C's `rtMax` is past it. INFO: the bump's delay in frames.
9. 계란: C carries the egg into the host's animal: the pass happens when the host's screen shows C touching (the receiver's
   view), not when C's does (logged lead in ticks, INFO); the host carries it toward C while C walks away on its own view:
   no pass until C's screen shows the touch; A carries the egg into C so that C's screen shows the touch at its view tick
   `B - 5`: C is the loser on every page although C's report reaches the host after `B` (the burst wait); C's juggle ends
   at its receipt's view tick + 45 on every page (`since` = the stamp).
10. 씨름: the host blows at C; C jumps over the bubble **on its own screen**: no push anywhere; C stands still: pushed, and
    the push shows on every page; C pushed off: its fall stamped by its own view, the credit to the host.
11. INFO: each guest's playout delay at each game's start and end; snapshots under 3400 bytes.

### 14.3 Other tests and jobs

- `src/tests/touch.js`: `'L' / 'R' / 'D'` from the stick's dominant edge with the pointermove's time; one entry per pull; a
  45° pull gives one; a pull held gives no more; back under `STICK_OFF` and a new pull gives the next; during tap an
  over-pull (past R) then the thumb back on its first touch point gives **no** opposite entry (the origin held still),
  outside tap the origin still follows; keyboard ←→↓ fresh only (no auto-repeat).
- `tools/validate-levels.js`: 비누 평상 (section 12).
- `tools/check-integration.js`: every new literal sprite name the engine draws exists with its size (`faucet` 16x16 x2,
  `fx_ghost` 8x8; reused `item_egg` 16x16, `bubble_pop`, `lg_2` 8x8, `duck_ring` 16x8, `bubble`).
- `tools/audio-node-test.js`: `tap` o.n 0..3 (four distinct pitches), `scratch`, `egg_tick` 0..3, `egg_boom` - no NaN, short,
  under the sfx level, in `NO_ECHO`; the `chair` song compiles, loops, its bars have the right length.
- `check-pages` / `final-e2e2`: the warm-up text, the retired syllables; `ux-roomrow` (and `-320`): the new-games line fits.
- `run-all.js`: `party` (or `party` + `party2`), `party-fit-568`, `party-net`, `party-net-lag` (budgets raised for the new
  sections). One full suite run at the end, `--mute-audio`.

---

## 15. Risks

1. **The 유령 rule changes the pitch's win condition** ("끝까지 남으면 1등" → "+2점", the 판 won by points). It is what keeps
   out players busy; if the friends find it muddy, `GHOST.bonus` can grow (3-4) or the owner can choose plain elimination
   (question 1).
2. **의자: position luck.** Where you stand when it stops matters, as in the real game. The stools glide faster than a walk
   so nobody camps one; `CHAIR.spd` / `music` are the knobs. A sit that gets bumped 0.3-0.7 s later can feel like a take-
   back; it happens only in close contests, with a clear `쿵! 밀려났어요`.
3. **의자: audio latency** (Bluetooth ~200 ms). The stop is the frozen stools on screen; the sound follows it; the demo
   shows both together (the stools freeze as the notes stop).
4. **계란: "I touched them!"** Judged on the receiver's screen, a holder has to be ~24-26 ticks (about 0.4 s at 100 ms
   each way) ahead of the picture it chases - the same for every pair, the host's included. The 3 px slack covers a near
   touch and the holder's 1.2x run closes the gap on a fleeing friend; `EGG.slack` / `run` are the knobs (if passes still
   feel impossible, `run` 1.3 before anything else; 17 keeps throwing as the fallback). The holder sees the egg leave a
   round trip later (no prediction on the giver's side - it could be wrong).
5. **계란: rare double contacts** go in the host's arrival order (never in the host's favour: its own receipts are never
   late). A hidden tab cannot receive (an idle friend is a wall).
6. **씨름 touches shared physics** (`updatePlayer`'s `acc`, `raftMove`, the shot, `trappable`, `guestClaim`, `guestSelf`'s
   push): every branch is behind `G.mini.id === 'sumo'`; battle / co-op / kits tests must stay green. It is the last game
   for that reason.
7. **씨름's pushes are self-applied**: a modified page could ignore them. Same trust as bodies. Aiming leads differ by pair
   (~20 ticks at the host's body, ~32 guest to guest at 100 ms) as in battle; the reaction window to a bubble is the same
   for everybody.
8. **수도꼭지 on a stick**: a sloppy diagonal is a dead band (no press) rather than two; a player who never lets the stick go
   back gets no second press - the arrows on the wall and `let go` in the keys line teach it; touch.js covers it.
9. **수도꼭지 copying** in one room (friends see each other's phones): not preventable; friends' pips never show directions.
10. **Hidden or stalled tabs**: 수도꼭지 time-outs, 의자 stands (and goes out), 계란 cannot receive / loses holding, 씨름 falls
    in after 2 s. Nobody waits for it (`miniStale`, `LAG_MAX`).
11. **Rotation dilution**: with ten games a favourite (물, 펑) shows up in ~30% of 3판 parties. The owner's free draw stands.
12. **The trophy hold** can reach ~37 s in a theoretical bot-speed staked party; the hold line says why (Should).
13. **Size of the PR**: the largest party PR yet (~3,500 lines); the cut lines are real - 씨름 is the bonus.
14. **party.js budget**: four more games in virtual time; the `party2` split is ready.
15. **The 1x window hides the rule line**: there the card says only `틀리면 빠져요` / `못 앉으면 빠져요` / `들고 터지면
    빠져요`, and that 유령 still score is learned in play (my line `유령이 됐어요! 계속 하면 점수를 모아요`). The phone at
    568x320 shows the rule line. If the friends read "빠져요" as "done", the how lines can say the points instead (question 1).
16. **의자: a refused sit** waits `LAG_MAX + 30` view ticks (1.5 s) before its page lets go - rare (the host's feet check on
    the very state that carries the claim), but visible as sitting on a stool nobody owns for that long.

---

## 16. Open questions for the owner (each with the default this spec uses)

1. **Out players in 의자 / 계란 / 수도꼭지**: they become **유령** and keep playing for points; the last one in gets +2 and
   the 판 is won on points. **Default: 유령 + points** (nobody waits, comebacks possible). Alternatives: plain elimination -
   out players watch, "끝까지 남으면 1등" as pitched (the first one out waits 20-30 s); or 유령 + points with the how lines
   saying the points (`맞히면 1점` / `앉으면 1점` / `안 걸리면 1점` in place of `빠져요`, so the 1x card - no rule line - tells
   how to win).
2. **All four with 2 players** (의자: one stool; 계란: a chase of two; 씨름: one fall ends the set; 수도꼭지: a duel). **Default: on**
   (as 술래). Alternative: leave 계란 out for 2 (a chase of two is the thinnest, and the most hurt by the link's 0.4 s).
3. **Scope**: build in the order 수도꼭지 → 의자 → 계란 → 씨름 and ship what passes the check in this PR; if the build runs
   long, 씨름 comes in the next PR. **Default: as written** (cut lines A / B). Alternative: all four or nothing.
4. **계란: the holder runs faster** (1.2x after its 0.75 s juggle - "뜨거워서 발이 빨라져요"): over the relay a pass needs the
   holder ~0.4 s ahead of the friend it sees, and at equal speed a friend who runs away is never caught. **Default: on
   (1.2x)**. Alternatives: off (equal speed; passes only by cornering - the drop decides more rounds); or 1.3x (more
   hectic).

Everything else (round counts, timings, speeds, slack, the scoring numbers) is a tuning knob (section 11), not a question.

---

## 17. Considered and left out

- **계란 by throwing** (a host-simulated arc judged like 술래's look - fair by construction): not the pitch (`부딪혀서`), and a
  guest's throw reaches the others a link late, so it needs a 0.5 s wind-up to be dodgeable. Kept as the fallback if bumping
  feels bad.
- **계란: judging the pass on the holder's screen** (favour the tagger): whoever sees the stalest images tags from farthest
  away. **Judging both bodies at one view tick** (the 술래 stamp for contact): every guest sees the host exactly in view
  ticks while the host sees guests 20-45 ticks late, so the whole link lands on the host (it would chase images half a
  second old). The receiver's screen gives everyone the same lead.
- **의자: stools that pop up at random spots at the stop** (instant sits for whoever stands there, nothing to watch during
  the music) and **fixed visible stools** (everyone camps one). **A ↓ press to sit**: on a phone the stick cannot run and
  pull down at once. **Revival by sitting** (a 유령 that sits comes back): then every stop is the same race and the
  elimination means nothing.
- **Pure elimination with spectators**: the "everyone stays active" rule (question 1 keeps it open).
- **씨름: a shrinking 평상** (map changes need a sync path nothing has - polish 4.1.6); **body-to-body pushes** (two pages own
  the two bodies: nobody can apply the push to the other without a snap); **trapping bubbles** (that is 가두기, not 씨름);
  **kits** (a capy slam or a penguin slide would decide every set).
- **수도꼭지: a speed bonus** (+1 for the fastest) - speed is the tie-break only, so the rule line stays short; **거꾸로
  rounds** (a second rule to read); **showing friends' presses** (copying); **one long ladder until one is left** (variable
  length against the cap).
- **New awards** (최다 생존상, 최다 밀어내기상): the three awards are fixed polish; the new games feed 최다 1등상.
- **씨름: "split the link"** (the first draft's Should: `hostShot` stepping a guest's bubble forward by half its one-way
  estimate, `SUMO.back`): it assumed the host's body had an edge. It has none in dodging - every target sees each bubble's
  whole path on its own screen - and as a target the host is already the easiest to aim at; the advance would only cut
  the host's reaction window (7.5).
- **의자: a `bath_stool` sprite**: 펑's stalls and 술래's corridor already draw a pink 목욕 의자 with canvas rects; a sprite
  would be a second, different stool in the same party. `drawStool` reuses the drawing at any scale.
- **계란: no tag-backs** (the giver may not receive it back for a while): the 0.75 s juggle already stops ping-pong, and a
  pass back after it is a fair chase.
- **계란: the holder's run on the giver's prediction** (the giver slows as soon as it touches): the giver's page cannot
  know the receiver's screen agreed; it keeps running 1.2x until its mirror shows the pass (a round trip). Harmless.
- None of the four copies a specific minigame: they are genre-level ideas (Simon-style memory, musical chairs, hot potato,
  ring-out sumo) with our own rules, names, art and sounds.

---

## 18. Checked against the code (while writing)

| Found in the code | Consequence | Where |
|---|---|---|
| `applyView` calls `setMusic(mu)` whenever the snapshot's `mu` differs from `G.music` | a per-stop `setMusic(null)` on the host would reach guests one snapshot late and fight a local cut | 5.7: `G.music` stays `chair`; each page cuts with `Snd.music` at its own `S` |
| `Snd.music(name)` restarts only when another (or no) track plays | a per-frame call with the same name is free; `music(null)` then `music('chair')` starts at bar 1 | 5.7 |
| `stickDir` and `stickDown` can both be on at (0.3, 0.6) | one diagonal pull could give a left / right and a down | 3.3: `stickTap`'s exclusive zones |
| `hostDisplayIn` draws a remote body `PEER_DELAY` behind; a guest draws the host's world `SNAP_DELAY`+ behind | contact has two pictures; view-tick judging puts the whole link on the host | 6.5: the receiver's screen |
| `takeOver` copies x / y / vx / vy and the raft flag on a new epoch | a host-applied push would snap a guest back; a raft hand-over works as in 물 | 7.5: pushes on the pushed page; falls → rafts by epoch |
| `trappable` is false for a raft; `raftMove` reads `G.mini.wl` | sumo's rafts work with a constant `wl`; sumo also turns trapping off for everyone | 7.2 |
| `kitOf` already special-cases 술래 | `base` generalises it | 3.4 |
| `sneakJudge` clamps `rt` by `at - SNEAK.lagMax` and keeps `rtMax` | chair / egg / sumo use the same clamp with one stamped claim each | 3.2 |
| `troPartyWait` counts host frames only; `troPartyReal` counts `CO.bshots` | nothing breaks; the hold grows | 3.8 |
| `MINI_OLD` 3 and `partyRules`' `gn` list every later game by name | seven long names would take three room rows at 320 px | 3.5: `short` |
| `PARTY_ARENAS` indexes 0-3 load through `loadPartyArenas`, `viewKindOf`, `loadView` | index 4 needs only its key, fallback and validator branch | 7.7, 12 |
| the canvas font has digits and `- x ! : . + /` | `?` needs a hand-drawn glyph; Korean only in DOM (banners, word pops, my lines) | 9.1 |

---

## 19. Check against the code (before the build)

An adversarial read of this spec against `feat/party-games-2` as it is (game.js: the party, `MINI` / `MINI_FN`, the
card / demo / beats / awards / coins, `partyPlan` / `partyReplan`, the trophy floor, the body state and `parseBody`,
`hostBodyIn`, the guest's view and `guestSelf`, the press queue and the stick, `drawPlayer` / `drawPosed`, the rafts,
the shot and capture code; levels.js; audio.js; sprites.js; the party tests). What it found and what changed:

| Found in the code | Consequence for the draft | Changed |
|---|---|---|
| `parseBody` clamps every `mi` int to ±1e6; `G.frame` counts from page load (1e6 frames = 4.6 h); 술래's stamps come from `st.rt` (bounded 1e12), never `mi` | chair / egg / sumo put absolute view ticks in `mi`: a host page open for an evening would clamp every claim to 1e6 | 3.2, 5.5, 6.5, 7.5, 5.9 / 6.9 / 7.9: `tick - anchor` (S, L, F0), the host adds it back; shorter on the wire too |
| `SNEAK` is a `const` object literal near the top; `LAG_MAX` would be read by its `lagMax` | declared below it, the page throws at load | 3.2, 11: `LAG_MAX` above `SNEAK` |
| `drawPlayer` sets `ctx.globalAlpha` itself (back to 1 after its blinks, the raft ring, the shine) | "`ctx.globalAlpha = ga` around `drawPlayer`" would draw half the 유령 opaque | 3.1: a scratch canvas, `ctx` swapped as the hub preview already does, blitted at `ga` |
| co-op's `p.ghost` (ghost bubble, `drawGhost`, revives), `GHOST_*`, the `<animal>_ghost` sprites; `drawPlayer` draws nothing for `p.out` | a builder reaching for "ghost" fields would draw co-op bubbles or nothing | 2, 3.1: a 유령 is `M.gh` only, never `p.ghost` / `p.out`; the `ghost` sfx fits and is reused |
| `stickMove` drags the stick's origin after a thumb past R | in tap an over-pull, then the thumb back on its first point, reads as a pull the other way (a phantom `'L'` after `'R'`) | 3.3: the origin holds still while tap plays; touch.js test |
| `KEYMAP`: KeyD is → | `'D'` (down) next to the D key invites a mix-up | 3.3: said so |
| `stopCurrent` fades 0.08 s; game.js's `Snd.music` wrapper dedupes on `Snd.cur`; the audio resync resets `Snd.cur` | the cut is clean; a resync during a stop plays one frame of `chair` | 5.7: said so |
| the tests read `Snd._state()` - `Snd` has no such member; `PG.Audio._state().track` stays null while audio is locked (headless) | the music-cut test would test nothing | 12, 14.1: a `music()` debug hook returning `Snd.cur` |
| `miniPast`'s skip set was "seated" | a provisional sitter could be skipped, bumped later, and claim another stool with a stamp earlier than that stool's already final one | 3.2: skip only the claimant and final seats; a final claim is never bumped (an equal stamp too) |
| chair: the host's refusal is invisible to the claimant (its mirror just never shows it as owner) | a refused page would sit on a stool nobody owns until the reveal | 5.5: it lets go at `tick + LAG_MAX + 30` and may sit again |
| chair close: "every stool final (one left standing)" | after a leaver there can be as many stools as players: the stop would always run to the cap | 5.1: also "every present non-stale player holds a final stool" |
| a leaver can leave one living player | the set would pay +2 to someone who beat nobody | 5.4, 6.4, 7.4: everyone back, no +2 |
| 펑's stalls and 술래's corridor draw the pink 목욕 의자 with canvas rects (`#c86a8e` / `#ff9ec4`) | a `bath_stool` sprite would be a second, different stool | 5.7, 10.1: **new** `drawStool` helper, no sprite |
| `shownAt(pl)` is the host's one-body display sample; `hostDisplayIn` swaps every body in for `netTap` | the draft named the swap for a single check | 2, 6.5: `shownAt` |
| guests draw other guests `PEER_DELAY` behind their newest state | the draft's "12-14 ticks" lead counted one picture; against the picture the holder chases the two add up | 6.5: ~24-26 ticks (0.4 s) for every pair, the host's too - symmetric, but at equal speed a fleeing friend is never caught |
| `updatePlayer`'s walk chain already has `crownHolder ? CROWN_SLOW` | a holder factor is one term, host and guest alike | 6.1, 11: `EGG.run` 1.2 after the juggle (question 4) |
| the draft set `since = G.frame` at acceptance | a remote receiver juggled the link's delay longer (20-40 f more holding a bad egg) than a host-local one | 6.5: `since` = the receipt's stamp |
| the receiver's prediction was dropped "when its mirror shows another holder" | a refusal that changes nothing (a juggle clamp) leaves the mirror on the giver forever | 6.5: also on the round moving on, or at `tick + LAG_MAX + 30` |
| `miniStale` exists for exactly this | an egg dropped on a hidden tab is a lost round nobody can play | 6.1: never dropped on a stale seat |
| a re-drop takes 36 f | the hidden fuse could burst during a leaver's re-drop or the new juggle | 6.4: `B = max(B, landing + coolF + 30)` |
| `eggCap` / `ty: 'egg'` are the frog's egg bubble | a grep for `egg` mixes the two | 12: kept apart (`eggHolder` etc.); watch list |
| `raftMove` ignores tiles and clamps x to the whole room (물's water is full width) | a sumo raft at y 184 slides through the 평상 into the other 탕 | 7.2: a gated clamp to its own 탕 (`M.tub`) |
| water's `raftBack` places on `LV.rise.revive`; `raftOn` keeps x | sumo's 역전 has no spots there; a stale seat's raft would sit inside the 평상 | 7.2 / 7.4: **new** `sumoBack` on `sumo.revive`; a stale raft in the nearer 탕 |
| a party is `G.gameMode === 'battle'`: `guestClaim` sends `'tp'` claims and shows a predicted catch | in sumo a guest would gulp friends into bubbles for a round trip before the host refuses | 7.5, 8.4: `guestClaim` returns in sumo; `trappable` false (so `claimCheck` / `playerTrapCheck` / `lagTrapCheck` too) |
| `stepShot`'s `'wall'` turns a line shot into a floating bubble | a sumo bubble against a wall or the 평상's side would float | 7.1: it pops |
| `fire` calls `coinShot` (my blows -> `CO.bshots`) as in every arena game | sumo's `coinAct` would count twice | 3.6, 7.6: blows only |
| the draft's split-link advance assumed a host dodging edge | every target sees each bubble's whole path; as a target the host is already the easiest to aim at | 7.5, 17: dropped (`SUMO.back` gone) |
| `partySecs` gives a game without `fastSecs` 12 s in the debug fast party | sumo's last 10 s would start at 2 s | 7: `fastSecs` 20 |
| `guestSelf`'s 가라앉는 중 freeze tests `G.mini.id === 'water'` | sumo needs it too | 8.4 |
| every demo draws its animals at 16 px (`demoSpr(..., 16)`, feet y 28) | the draft's 8 px animals would be a different, hard-to-read style | 4.8, 5.8, 6.8 |
| the debug API has `fakeBody(slot, st)` (k / rt / ep / mi / x / y / fl, stamps `at`) and `press(slot, act, t)` | `remMi` would duplicate it | 12, 14.1 |
| 수도꼭지's shortest: the end's bonus beat 60 and 80 ms answers (14-38 f) | 1686 f was low by ~20 | 3.8: ~1706 f - still longer than 의자, so the shortest party is unchanged |

Checked and fine as written: the `MINI` / `MINI_FN` contract (the optional `local input clock pose frozen tagY hold held
win over demo` all have readers); `miniTick` takes a remote `mi` only from the latest state of this gid and 판 and calls
`input` only on a change; `miniLoad`'s spawns (`world: false` -> `stageSpots`, else `F.spawns` - chair returns
`stageSpots`); `noFire` -> no `START_INV` blink and no `'shot'` (`fire`, `hostShot`); the 무대 목욕탕 map (a plain box, floor
y 216); `partyPlan` is generic over `MINI_IDS` (83% / 30% / 33% right), `partyReplan` untouched (none of the four is
excluded); `partyDrop` -> `drop`; the awards' top-0 rule; `coinAct` -> `CO.bshots`, `COIN.roundShots` 2 / `gameShots` 5 /
`minF` 3600; `troPartyWait` is game-blind (5913 / 5007 f and holds of 1287 / 2193 f recomputed); `PARTY_PTS`,
`PARTY_LAST_X`; `MUSICS` has 14 entries (index 14 is next); `KEYMAP`, `pressPush` / `readInputs` / `pq`, `STICK_ON` 0.3 /
`STICK_OFF` 0.2 / `STICK_DN_ON` 0.6; `hostBodyIn`'s `s.at`; `NET.rtHi` monotonic and reset on a new 판; the `seatReady` /
`seatOld` gate; plan codes `t h e u` free; `PARTY_KEYS` + `'sumo'` at index 4 through `loadPartyArenas` /
`fallbackPartyArena`; the 비누 평상 geometry (`PF_TOP` 16, `TS` 8: row 21 top y 184, cols 7-24 = x 56-200, the 탕 x 16-56 /
200-240, `wl` 196 over a floor at 216); the raft hop's top (~y 164), the base jump (38 px, 37 f), a 2.4 push at `acc` 0.07
(~41 px); every worst / fast length (수도꼭지 66.9 / 30.1 s, 의자 88.5 / 33.5 s, 계란 65.3 / 32.9 s); the how lines'
syllables (16 / 16 / 17 / 16); no retired syllables; the snapshot budget; the reused sprites (`item_egg`, `lg_2`,
`duck_ring`, `bubble_pop`, `water_cold_top`, `bubble`) and sounds (`item pop bounce countdown scald_splash b_splash splash
ghost extend revive hurry`). Card fit at 568x320 and 1x stays an estimate until the fit tests run.

### 19.1 Builder watch list

1. **`LAG_MAX` above `SNEAK`**, and 술래's tests green after `lagMax: LAG_MAX`.
2. **Relative ticks in `mi`** (chair `S`, egg `L`, sumo `F0`); `Math.round(NET.rtHi)` on a guest, `G.frame` on the host;
   views bound absolute ticks in `g.mg` at 1e12 as `milkView` does.
3. **A 유령 is `M.gh` only** - never `p.out`, never `p.ghost`. `drawPosed` goes through the scratch canvas only when
   `ga < 1` (one extra blit per 유령 per frame).
4. **의자**: a final claim is never bumped; `miniPast` waits for provisional sitters; the refused-sit let-go; the close
   after a leaver; `G.music` stays `chair` for the whole 판 and only `chairSound` calls `Snd.music` (never `setMusic`) in
   a stop.
5. **계란**: `since` = the stamp; `shownAt` for a remote holder on the host; no drop on a stale seat; `B` pushed past a
   re-drop's juggle; `EGG.run` in `updatePlayer`'s walk chain on host and guest (from the mirror / my prediction); keep
   the new code apart from the frog's `eggCap` / `ty: 'egg'`.
6. **씨름** (shared physics - last, all gated on `G.mini.id === 'sumo'`): `raftMove`'s 탕 clamp, `sumoBack` (not
   `raftBack`), a stale raft in the nearer 탕, `guestClaim` off, `trappable` false, a wall pops the sumo shot, the
   가라앉는 중 freeze, coins from `coinShot` only, `fastSecs` 20. Battle / co-op / kits suites green after it.
7. **수도꼭지**: the stick's origin fixed only while tap plays (`stickReset` clears `STICK.td`); `'D'` is down, KeyD is
   `'R'`; tap ignores `'down'`.
8. **Demos** at 16 px with `demoSpr`; `drawStool` with 펑's two pinks.
9. **Tests**: `music()` (`Snd.cur`), `fakeBody` (+ `at`), `press` - no new fake-remote helper; watch party.js's 120 s and
   split to `party2` early rather than late.
10. **`PARTY_V`**: main's value + 1 at build time (7 -> 8 today); party-net's crafted old guest sends that minus one.
