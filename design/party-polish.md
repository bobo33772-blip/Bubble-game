# 뽀득뽀득 목욕탕: 파티 다듬기 (party polish) v1 — design spec

Status: **built** on `feat/party-polish` (worktree `bogeul-polish`, from `origin/main` c71e3ee = PR #21 merged) - every
step of section 12, nothing cut; section 14 records what was built and where it differs from the text above, 14.4 the
audit before the PR.
It builds on the party as built in design/party.md sections 18 (PR A) and 18.1 (PR B): the sequencer `G.party`,
the minigame contract `MINI` / `MINI_FN`, the card / result / podium, the coins and the host-driven sync. Code is
referenced by function name and section, never by line number. Every function named here exists today unless it is
marked **new**.

The owner and 3 friends played the party (2026-10-29) and said: the rules are bland (`재미·규칙이 싱거워요`), the flow is
awkward (`진행이 어색해요`: no Mario-Party-like excitement), the worst game is 물 차오르기, and the three feel alike. Scope
decided with the owner: **A** a Mario-Party-style presentation and flow, **B** spice up 왕관 뺏기 / 거품 축구 and redesign
물 차오르기 - in this one PR. New minigames of other genres (연타, 반응속도, 기억력, 1대3) are the **next PR**: section 5
keeps the contract ready for them. The board (주사위, 칸, 황금 오리) is **on hold**.

---

## 0. Decisions in one table

| Question | Decision |
|---|---|
| The 판 loop | card (splash → how-to demo + 준비 완료) → 3-2-1 + start fanfare → play → **끝!** → **winner stage** → **tally** (points count up, rows re-sort) → [before the last 판: **마지막 판!** standings] → next card. After the last 판: tally → **보너스상** (3 awards) → **최종 순위** → podium. Section 3. |
| Card | 1.2 s title splash (the name zooms in, `mg_title` sting), then the how-to: an **animated demo** (a 96x32 canvas loop per game, my animal + a rival), the one-line how, the keys, the team line (축구), a **ready row** (a chip per player) and a big `준비 완료!` button. Starts 0.5 s after everyone is ready (never before 2.5 s), else **auto-starts after 10 s** (6 s when this game was already played in this party). No scoreboard on the card any more (the tally shows it). |
| Ready input | Jump or shoot press, Enter, or a tap on the button. A guest's ready rides in its **body state** (`pr`: the 판 index I am ready for) - latest wins, no new message type. |
| Skips | Only the **host** speeds up the result beats (winner, tally, standings, awards, final sort: its press jumps to the next beat, never before 0.5 s into a beat). Nobody skips the splash, 끝!, the 3-2-1 or someone else's 준비. |
| Comeback in the flow | **The last 판 pays double** (`PARTY_LAST_X` 2: 1등 8점, 4 players 8 / 4 / 2 / 0), announced on the 마지막 판! screen and the card. **3 보너스상**, `+2점` each: 최다 1등상 (판 won), 최다 가두기상 (rivals trapped), 최다 탈출상 (escapes by mashing). An award goes to the top value (ties share it); none when the top is 0 or everybody shares it. |
| 물 차오르기 v2 | 60 s (was 75). The water still rises in 5 steps (each drowns one tier) but **2 surges** (a 1.6 s wave over the next tier: jump or climb) and a **마지막 물결** (52-59 s: the water floods the top shelves - everybody goes out, the last one out wins; jumping buys time). **비누 방울** float above the waterline (7 a 판): one held = **one save** from the water (a hop out), and each one picked breaks ties. **Out = 오리 튜브**: the animal floats on the surface in a duck ring, moves, hops, blows plain bubbles - its capture of a dry friend that then drowns is **역전!** (the rafter is back on a top shelf, once a 판, never during the flood). Places: the later out the better; same frame: more 비누; still equal: shared. Section 4.1. |
| 왕관 뺏기 | **왕관이 날아가요**: at 15 / 30 / 45 s the crown leaves its holder and falls again from the centre top (a new race each time). **황금 왕관**: from the 45 s flight it is gold and held time counts **x2**. Section 4.2. **2026-10-29 owner change**: the one wearing it at time-up is 1st, 2nd and on by held time; the gold crown stays as the last race's signal, no x2 (4.2, 14.5). |
| 거품 축구 | **공이 2개**: from 45 s a second ball drops; while there are two, a goal does not stop the clock or reset the field (that ball re-drops after 0.75 s). **골든 골**: tied at time-up → play on, the next goal wins, at most 20 s, then a draw. Section 4.3. |
| Sounds / music | 8 new synthesized sfx in `audio.js` (`mg_title`, `mg_go`, `mg_finish`, `mg_win`, `tally`, `rank_up`, `drumroll`, `award`) and 1 new loop `party` (the between-판 screens). Everything else reused (section 8). |
| Sprites | 1 new: `duck_ring` (the 오리 튜브, 16x8, 2 frames). The gold crown, the 2nd ball, the soap bubble, the award icons and the demos reuse existing frames (tints). |
| Network | Host-authoritative as today. **No new message type.** `g.pa` gains the beat, the ready mask, awards and bonuses; each `g.mg` gains its new fields; the guest body state gains `pr`; `P` flag 512 = 오리 튜브. **`PARTY_V` 3**: a PR-B page (pa 2) in a party room is never ready and shows `새로고침 필요` (the existing gate, section 6). |
| Coins | Unchanged (`coinParty`; the rank bonus by final place, which now includes the 보너스상). A 3판 still takes about 3.8 minutes (물 is 15 s shorter, the beats are longer). |
| Next PR | The contract gains optional hooks now (`demo`, `over`, `MINI[id].keys`) and reserves two for other genres (`world: false`, the body-state field `mi` + `input`), section 5. |

---

## 1. Why: each change against the feedback

| Feedback | Change | Why it answers it |
|---|---|---|
| 진행이 어색해요 (flow) | Splash + demo + 준비 완료 instead of a fixed 5 s card | The 판 starts when the kids are ready (a fixed timer felt like waiting for nothing, or rushed); the demo shows the rule in 4 s without reading. |
| 진행이 어색해요 | 끝! → winner stage + jingle → tally that counts up and re-sorts | Today a 판 just stops and a banner says `1등 방장!` for 3 s: no moment for the winner, no feeling of the standings moving. Mario Party's beat (FINISH, the winner's pose, the coins counting in) is exactly this. |
| no excitement | 마지막 판! x2 + 보너스상 | The end of a party had no climax (the leader after 판 2 usually won). A doubled last 판 and three awards make the last minute matter for everyone, as Mario Party's "last 5 turns" and bonus stars do. |
| 싱거워요 (bland), 물 the worst | 물 v2: surges, 비누 방울, 오리 튜브 with 역전, the final flood | 물 was "climb to the top shelf and wait": 45 s of waiting, then everyone often shared 1st (no difference in points), and an out player only watched (`친구들을 구경해요`). Now there is a reason to go down (비누 near the water), a reason to move mid-step (surges), a role and a way back for the out (튜브, 역전), and a final scramble that always decides a winner. |
| 싱거워요 | 왕관이 날아가요 + 황금 왕관 | One early grab decided 왕관: the leader ran for 60 s. Three new races (15 / 30 / 45 s) and a gold last 15 s give the trailing players three restarts and a doubled finish. |
| 싱거워요 | 공이 2개 + 골든 골 | A 60 s soccer with one ball was often 1 : 0 or a 0 : 0 draw (everyone 4 points: nothing happened). Two balls in the last 15 s mean more goals and chaos; a golden goal removes most draws. |
| 셋이 비슷해요 (all alike) | One spike of a different kind per game | 물 is now **escape and sabotage** (vertical survival, the out fight back), 왕관 a **race** (three restarts), 축구 **team chaos** (two balls). No twist repeats across games (no "last 15 s x2" in every game), each demo shows its own identity, and the next PR adds other genres. |

---

## 2. Ground truth from the code (what this builds on)

| Thing | Code today | Consequence |
|---|---|---|
| Sequencer | `newParty` → `partyNext` (`miniLoad`, `G.mode = 'card'`, `setMusic('lobby')`, `Snd.sfx('door')`, `showOverlay('party')` + `fillParty`) → `updateCard` (`P.t` to `partyCardF()` 300 f, then `beginCountdown`) → `updateCountdown` (시작!: `coinGo`, `miniStart`) → `miniTick` each playing frame → `miniOver()` → `partyResult` (places → points, `G.mode = 'result'`, prisons opened, banner, `N등 +N` word pops, `'win'`) → `updateResult` (`partyResultF()` 180 f) → `partyNext` / `partyFinal`. | The beats of section 3 live in `updateCard` / `updateResult` as sub-states of the two existing phases (`'a'`, `'r'`): no new phase code, so `PH_CODE` / `PH_NAME`, `guestPhase` and the coin closing on the first `'r'` snapshot stay as they are. |
| Wire | `partySnap` → `g.pa = {n, i, L, t, ft, cl, P: [[slot, pts, wins, last, gain]], F?, W?, T?}`; `partyView` mirrors it on a guest before `guestPhase`; `g.mg` per game (`MINI_FN[id].snap / view`). `g.bn` carries the host's banner, events `'s'` its sfx (except `NO_ECHO`), `'w'` its word pops. | The beat and its clock (`b`, `bt`), the ready mask (`R`), the awards (`A`) and the bonuses (`B`) go into `g.pa`. Shared one-shot sounds (끝!, the jingle, the awards) echo as today; the tally ticks are each page's own (`uiSfx`). |
| Guest body state | `guestSend` → `setState({v, k, gid, ep, x, y, vx, vy, f, fl, sh, bb, ny, rt, lc, dp})` every `BODY_EVERY` (2) frames, in every mode; the host reads `NET.remote.get(id).st` (`hostInputs` copies the body only for a free, same-epoch player while playing). | `pr` (ready) is one more field of it, read by the host in `updateCard`. An older host ignores it. |
| Player states | `alive` (not dead / out / KO / ghost), `free` (alive, not trapped), `canTouch` (+ not stunned), `trappable(v, b)` (`free(v)`, not invulnerable, not the owner); `p.out` hides the animal (`drawPlayer` returns) and takes its control away (`takeOver` needs flag 64 = free); `bodyAt` clears `out`; `snapPlayers` flags 1..256 used (`fl` is read 0..1023). | The 오리 튜브 is **not** `out`: it is a live, free player with `p.raft` (flag 512), so its page keeps control (`takeOver`), `hostInputs` copies its body and `hostShot` takes its bubbles unchanged; it is excluded from `canTouch` / `trappable` / the water check, and `perk()` is false for it (plain moves, plain bubbles). |
| Captures | `trapPlayer(v, b)` keeps `v.trap = {b, t, prog, mash, by: b.owner}`; `updateTrapped` / `mashTrap` add `PTRAP_MASH` per press, `escapeTrap` frees at `ptrapMax()` (`MINI_TRAP` 90 f); `waterOut` releases a trapped animal before putting it out. | 가두기 counts in `trapPlayer` (owner ≥ 0, owner ≠ victim), 탈출 in `escapeTrap` when `t.mash >= 3`; 역전 reads `v.trap.by` in `waterOut` before the release. |
| Water | `waterAt(f, R, k)` (steps only, pure), `waterTick` (warnings at exact frames, the out check through `waterBody`, the last one standing), `waterView` (the guest draws `waterAt` at its estimate of the host's now), `riseOf` parses `rise`. | Surges and the flood are more pure schedule data inside `waterAt`: the guest's water stays exact. |
| Crown / ball | `crownTick` / `crownDrop` / `crownView`; `ballTick` / `ballGoal` / `ballKickoff` / `ballView`; `MINI_FN.ball.hold` stops the clock during 골!. `miniOver` is `left <= 0 \|\| endAt reached`. | A flight is a timed `crownDrop` without a dropper; the second ball is a second body through the same step; the golden goal needs an `over` hook so `miniOver` can wait past time-up. |
| Screen | 1x desktop window 23.3em x 20.4em (card content 17.4em x 16.6em), 568x320 landscape phone 27.6em x 24.1em (21.4em x 20.3em of content); `@container (max-height: 22em)` hides the rule line (design/party.md 9.2). The card at 1x is 152 px tall (축구 178) of 224 today. | Section 7.3 budgets every view against these two boxes. |
| Audio | `win` (C-major stabs), `extend` (1-up fanfare), `promote` (brass), `ticket`, `powerup`, `revive`, `countdown`, `go`, `hurry`, `steam`, `item`, `ready`, `door`; music `lobby`, `battle`, `hurry`, `podium`, `victory`. `MUSICS` is the wire index list of `g.mu`. | Section 8 lists what is reused and the 8 sfx + 1 loop that are new. |

---

## 3. A: the flow

### 3.1 The loop and its timings (host; 60 frames a second)

```
partyNext  -> 'card'    splash (72)  -> how-to + 준비 완료  -> start: all ready + 30 (never before 150) | auto 600 / 360
           -> 'countdown' 3-2-1 (180, unchanged) -> 시작! + mg_go
           -> 'playing'  60 s (축구: + golden goal <= 20 s)
miniOver   -> 'result'  b 'f' 끝! (54) -> 'w' winner stage (132) -> 't' tally (168)
                        [the 판 before the last: 's' 마지막 판! (150)]
                        [the last 판: 'a' 보너스상! (54) -> 'A' award k (108 each, <= 3) -> 'z' 최종 순위 (96)]
           -> partyNext (the next card) | partyFinal (the podium)
```

| Stretch | Frames | Seconds | Skip |
|---|---|---|---|
| Card: splash | 72 | 1.2 | no |
| Card: earliest start | 150 | 2.5 | (everyone ready → start 30 f later, not before 150) |
| Card: auto start | 600 / 360 | 10 / 6 (a game already played in this party) | - |
| 3-2-1 | 180 | 3 | no |
| 끝! | 54 | 0.9 | no |
| Winner stage | 132 | 2.2 | host, after 30 f |
| Tally | 168 | 2.8 | host, after 30 f |
| 마지막 판! (once, before the last 판) | 150 | 2.5 | host, after 30 f |
| 보너스상! intro | 54 | 0.9 | host, after 30 f |
| One award | 108 | 1.8 | host, after 30 f |
| 최종 순위 | 96 | 1.6 | host, after 30 f |

Between two 판 (not the last): 354 f of result + a card (typically 4 s when all press) + 3 s = **about 13 s** (11 s today;
about 9 s when the host skips). A 3판 party: 3 x (60 + ~13) s + 2.5 s (마지막 판!) + up to 8.2 s of awards ≈ **3.8 min**
(3.8 today: 물 is 15 s shorter). 5판 ≈ 6.3 min.

`PARTY_FAST` (debug) shortens everything: splash 24, earliest 40, auto 90, finish 20, win 40, tally 60, stand 40, award
intro 20, award 36, final 30; games 12 s (section 9).

### 3.2 The card (`'card'`)

**State** (host): `P.t` as today; **new** `P.rdy = {slot: 1}`, `P.allAt` (the frame everyone was ready, -1), `P.auto`
(600 or 360: 360 when `P.plan.slice(0, P.i).includes(P.plan[P.i])`), `P.cl = P.auto` (the bar's length, sent as `cl`).

**`updateCard()`** (changed):
1. `P.t++`, `updateFx()`.
2. Ready: each present player not yet ready is ready when (a) local (`p.local !== false`): its `ins[slot].jumpP || shootP`
   this frame, or this screen's button / Enter (`partyReadyMe()`, **new**, sets `NET.partyReady = P.i` on a guest and
   `P.rdy[G.localSlot] = 1` on the host / offline); (b) remote: `NET.remote.get(p.id).st` has `gid === NET.gid` and
   `pr === P.i`. A new ready plays `'ready'` (exists, echoed) once and re-fills the ready row.
3. Ignored while `G.menuOpen` (the pause menu covers the card) and before `P.t >= 12` (a press held from the last beat
   does not count).
4. Everyone present ready → `P.allAt = G.frame` once; the card ends at `max(PARTY_F.cardMin, P.t at allAt + PARTY_F.allIn)`;
   else at `P.auto`. Ending: `if (!G.menuOpen) showOverlay(null)`, `beginCountdown()` as today.
5. A leaver during the card: its entry leaves `P.rdy`; `allAt` is re-tested against the players left (`partyDrop` →
   `partyReplan` as today; a re-drawn 판 restarts the card with `P.rdy = {}`).

**What the card shows** (`fillParty('card')`, the card's own class `is-splash` while `P.t < PARTY_F.splash`):
- Splash: the round line (`1판 / 3판`, the last `마지막 판! 3판 / 3판` + the chip `점수 2배!`) and the game's name at 2.6em
  (the sign font) zooming in (`pg-splash` keyframes, 0.45 s; none under `reducedMotion`). `mg_title` at `P.t === 6`.
- How-to (`P.t >= 72`): the name settles to 1.6em; under it the **demo canvas** (section 3.2.1), the how line, the rule
  line (hidden under 22em of screen height, as today), the keys line (`MINI[id].keys` / `keysT` when the game has its
  own, else `PARTY_TX.keys` / `keysT`), the team line (축구, unchanged), the **ready row** (each present player in slot
  order: the 16 px bust - `portraitCanvas` as the board rows - and, once ready, the room's ready mark `SPR_READY` beside it;
  my chip has the `나` outline), the **button** `준비 완료!` (keyboard pages: `준비 완료! (Z)`; after my press
  `준비됐어요!`, disabled), and the bar (fills over `P.cl`; jumps to full when everyone is ready; its text: `N초 뒤 시작`,
  rewritten once a second; everyone ready: `모두 준비됐어요!`).
- Gone from the card: the scoreboard (`#pg-party-board` moves to the tally views, 3.6).

#### 3.2.1 The animated how-to (`MINI_FN[id].demo`, **new** optional hook)

A `<canvas id="pg-party-demo" width="96" height="32">` (CSS `width: calc(96px * var(--pg-px, 1))`, height likewise,
`image-rendering: pixelated`; `fit()` also sets **new** `--pg-px` to the canvas scale `s` beside `--fs`). Each screen draws its own
(never on the wire) from `renderScene`'s end while `shownOverlay === 'party'` and the view is `card` (`drawPartyDemo()`,
**new**): `MINI_FN[id].demo(dx, f, a, b)` with `dx` the demo's 2d context, `f = P.t % 240` (a 4 s loop), `a` my animal's
char (or slot 0's offline), `b` the next seat's. Frames come from `frameOf` (the animals' `_idle` / `_walk` / `_jump`, tiles
`tile_<theme>`, `water_cold_top`, `crown`, `giant_bubble`, `bubble`, `coin`, the new `duck_ring`). A game without `demo`
hides the canvas (the how line then takes its place). Scripts (keyframes in frames of the 240 loop):

| Game | Script |
|---|---|
| 물 | Three 3-tile tiers (y 28 / 20 / 12). The water band rises from y 32 to y 22 over 0-150. `a` hops tier to tier (jumps at 30, 90), grabs a 비누 (a `coin` frame in a ring) floating over the water at 110 (a pink ring appears on it). `b` gets caught by a bubble at 60, its prison sinks into the water at 100, and from 140 it bobs on a `duck_ring` and blows a bubble toward `a`. |
| 왕관 | A floor and a centre stage. `b` walks wearing the crown (0-60); at 60 a sparkle and the crown flies up (an arc, 60-110) and falls on the stage; `a` jumps and takes it at 120; from 170 the crown blinks gold. |
| 축구 | The field with the right goal net. `a` walks into the ball (0-80), the ball rolls into the net (80-120, net wobble, star sparkles); at 150 a second, pink ball drops from the top. |

Each script is a pure function of `f` (no state), so a page drawing it late or skipping frames is still right.

**Why a demo and not a short practice**: a practice would need the playing world (bodies, bubbles, ammo, captures) to
run during the card on every page and then reset everyone to their spawns, touching every `G.mode === 'playing'` guard;
the demo is a local drawing with no sync at all, and it shows the new rule of each game, which a free practice would not.

### 3.3 3-2-1 and 시작!

Unchanged mechanics (`updateCountdown`, `COUNT_FRAMES` 180, `'countdown'` beeps, the `count` banners). In a party:
- 시작! plays **`mg_go`** (a short brass `빰빠라밤!`) instead of `'go'`, banner `시작!` / the game's name as today.
- The "2" / "1" sub line on the last 판: `3판 / 3판 · 마지막 판! · 점수 2배` (`troCountSub`'s party branch).
- The music: `setMusic('battle')` at 시작! (unchanged; `miniStart`).

### 3.4 끝! (beat `'f'`)

`partyResult()` (changed) computes the places and points as today (the last 판 x `PARTY_LAST_X`, 3.7), opens every prison,
bursts the bubbles, then: `P.b = 'f'; P.bt = 0`; `showBanner(PARTY_TX.finish, '', PARTY_F.finish, 'finish')` (`끝!`, a new
banner class: `#pg-banner-main` 4.6em in `--duck` with a white 0.08em outline and the `pg-pop` animation),
`Snd.sfx('mg_finish')` (echoed), `setMusic(null)`. The world is frozen (`updateResult` runs only `updateFx`), every
animal stays where the 판 ended (a 오리 튜브 too). The `N등 +N` word pops of today are dropped (the tally shows them).

### 3.5 The winner stage (beat `'w'`)

At its start: `showBanner(<winner line>, MINI[id].name + ' ' + PARTY_TX.next | PARTY_TX.lastEnd, PARTY_F.win, 'clear')` - the
winner line exactly as today (`1등 방장!`, `공동 1등!`, `왼쪽 팀 승리!`, `오른쪽 팀 승리!`, `무승부!`) - and
`Snd.sfx('mg_win')` (echoed). Drawn by **new** `drawPartyWin()` from `renderScene` while `G.mode === 'result' && P.b === 'w'`,
on every page from synced data only (the places `P.last`, `bt`):
- The arena dims (`rgba(6,20,24,0.55)` over the playfield) with the podium's spotlight gradient at (128, 100).
- The 1st-place animals stand side by side on a small stage at feet y 132, centred on x 128 (20 px apart), doing the
  podium dance (`updatePodium`'s hop formula on `bt`, winners `|sin|` x 6 px, facing flipping every 50 f) with
  `STAR_COLS` confetti (`G.parts`, `fxr`, local cosmetic). Everybody else stands in a row at feet y 196 (x spread over
  48..208), facing the stage, no hop. A 무승부 puts everyone on the stage.
- Positions are a draw-time swap (set `p.x` / `p.y`, draw with `drawPlayer`, put them back - as `hostDisplayIn` /
  `hostDisplayOut` do), so no body moves and no epoch changes; worn looks show (no scaling). A 오리 튜브 is drawn as a
  normal animal here (`p.raft` is ignored by this draw).
- Name tags are hidden in this beat (`syncTags`: the tags follow the bodies, which the stage does not move); the banner
  names the winner.

### 3.6 The tally (beat `'t'`)

`#pg-party` shows again in its **tally view** (`fillParty('tally')`): a header `1판 결과` (`{0}판 결과`), then
`#pg-party-board` (the rows of today: place, bust, nick, `나` chip, points, gain) in the **standing before this 판**
(`partyStandings` over `pts - gain`), each row with `+N` (the last 판: `+8` and the header chip `점수 2배!`). Each page
animates it from `bt` alone (`partyTallyTick()`, **new**, from `syncDOM`; DOM writes only when a shown number changes):
- `bt` 12 + 10 x row: that row's `+N` pops in; its total counts up one point every 5 frames (an 8-point gain takes 40 f),
  each step plays `tally` with `o.n` = the step (the pitch climbs) - **this page's own sound** (`uiSfx`, never echoed).
- `bt` 96: the rows move to the new standing with a FLIP slide (each row's `transform: translateY(old - new)` then a
  0.4 s transition to 0; none under `reducedMotion`); rows that moved up get `▲1` / `▲2` (`.pg-party-mv.is-up`, mint),
  down `▼1` (cream-dim); my row moving up plays `rank_up` (local). Places shared after the sort show the same digit.
- At the end (`bt` 168) → the next beat; the overlay hides only at the next card (it is the same `#pg-party`).
The host's screen shows `방장: 눌러서 넘기기` at the bottom of the view (`#pg-party-skip`, host only) from `bt` 30.

### 3.7 마지막 판! (beat `'s'`) and the double last 판

Shown once, at the end of the result of the second-to-last 판 (`P.i === P.n - 2`; a 1-판 forced debug plan has none).
The view `stand`: header `마지막 판!`, sub `점수 2배 · 1등 8점 · 2등 4점 · 3등 2점` (by the present player count: 3 players
`1등 8점 · 2등 4점`, 2 players `1등 8점`), the standing rows with `선두` on the leaders and `1위와 3점 차` on the others
(instead of `+N`). Sounds: `drumroll` at `bt` 0, `mg_title` at `bt` 54 (echoed). Then `partyNext()`.

`partyResult` multiplies the table value by `PARTY_LAST_X` (2) when `P.i === P.n - 1`. A 2v2 축구 last 판 then pays 8 / 8 /
2 / 2, a draw 8 to everyone. `wins`, `last` and the tie-breaks are unchanged. A replan that changes the last game keeps
the doubling (it is by index).

### 3.8 보너스상 (beats `'a'`, `'A'`, `'z'`)

After the last 판's tally. **New** counters in `G.party` (host): `caps {slot: n}` (`trapPlayer`: `G.party && b.owner >= 0 &&
b.owner !== v.slot` → `caps[b.owner]++`; a 오리 튜브's bubble counts), `esc {slot: n}` (`escapeTrap`: `G.party &&
t.mash >= 3` → `esc[slot]++`; the timer alone, a friend's touch or a kickoff release do not count), `wins` (exists).

`partyAwards()` (**new**, pure over `P` and the present slots) → `A = [[code, value, [slots]], ...]` in the order of
`AWARDS` (section 9), keeping an award only when its top value is ≥ 1 and not every present player has it; ties share it.
Beats:
- `'a'` (54 f): the view `award` with `보너스상!` / `상마다 +2점`, `drumroll`. When `A` is empty the awards beats are
  skipped entirely (straight to `'z'`).
- `'A'` k (108 f each): the award's icon (a 16 px canvas: `crown` / `bubble` / `bubble_pop`), its name (`최다 1등상`), its
  line (`1등을 가장 많이 했어요`), its winners (busts + nicks; two or more: `공동 수상!` above them), the value (`3번`) and
  `+2점`. At `bt` 18: `Snd.sfx('award')` (echoed) and the points: `P.pts[s] += AWARD_PTS`, `P.bonus[s] += AWARD_PTS`,
  `p.score = P.pts[s]` for each winner.
- `'z'` (96 f): the view `tally` titled `최종 순위`: the rows in the standing before the awards, each winner's `+2` / `+4`
  (its bonus) counting in, then the FLIP re-sort at `bt` 40 (`rank_up` on my row if it rose). Then `partyFinal(false)`.

The podium is unchanged: its order is `partyStandings` (which now includes the bonuses), its blocks show `p.score`.

### 3.9 Who can speed what (`partySkip()`, **new**)

The host's own press (jump / shoot, Enter, a tap on the overlay) during beats `'w' 't' 's' 'a' 'A' 'z'` with `bt >= 30`
jumps to the next beat's start (an award jumped to still adds its points). Offline (`local.party`) any local player's
press does the same. Guests' presses do nothing there (their screens follow the host's `b` / `bt`). The card is never
skipped (it ends when everyone is ready), nor are 끝! and the 3-2-1.

### 3.10 State and code placement

```js
  G.party += { rdy: {slot: 1}, allAt: -1, auto: 600,                 // the card
    b: '', bt: 0, bk: 0,                                              // the result beat, frames into it, the award index
    caps: {}, esc: {}, bonus: {}, A: null };                          // the award counters, the bonuses, the awards
```

| Function | Change |
|---|---|
| `partyNext` | `P.rdy = {}`, `P.allAt = -1`, `P.auto` / `P.cl`, `setMusic('party')` (instead of `'lobby'`), `'door'` as today. |
| `updateCard` | Ready, all-ready start, auto start (3.2). |
| `partyResult` | The last-판 multiplier; beat `'f'` (3.4) instead of today's banner / word pops. |
| `updateResult` | **Rewritten** as a beat machine: `P.t++` (kept for the coins / tests), `P.bt++`; at a beat's end `partyBeatNext()` (**new**): `f → w → t → (s \| a \| next)`; `a → A0..Ak → z → partyFinal(false)`. Each beat's start does its banner / sound / `showOverlay('party')` + `fillParty(view)` (or `showOverlay(null)` for `f` / `w`). `setMusic('party')` at `t`. |
| `partySkip` | 3.9. Called from `primaryAction` (its `'result'` branch, **new**) and from `updateResult` for the host's local presses. |
| `partyAwards`, `partyTallyTick`, `drawPartyWin`, `drawPartyDemo`, `partyReadyMe` | **New** (3.2-3.8). |
| `fillParty(view)` | One overlay, four views: `card`, `tally`, `stand`, `award` (the `data-view` attribute on `#pg-party` switches the CSS). |
| `trapPlayer`, `escapeTrap` | The award counters (3.8). |
| `partyDrop` | During `'result'`: fewer than 2 left → `partyFinal(true)` as today (no awards); otherwise the beats go on with the players left (the awards are computed at `'a'` from the present players). |
| `primaryAction` | `'card'`: `partyReadyMe()`; `'result'`: `partySkip()` (host / offline only). |
| `pauseGame` / `resumeGame` | Unchanged rules; `resumeGame` returns to `showOverlay('party')` with the current view when `G.mode === 'card'` or a result beat that shows the overlay. |

---

## 4. B: the rules

### 4.1 물 차오르기 v2

**One line** (the card's how, 15 syllables): `물이 차올라요! 가장 늦게 젖으면 1등`. **Rule line**:
`비누 방울을 먹으면 한 번 살아나요 · 빠지면 오리 튜브로 친구를 맞혀 역전!`

#### 4.1.1 The schedule (arena data, `PG.PARTY_ARENAS[0].rise`)

```js
      rise: { y0: 222, warn: 2,
        steps: [[4, 7, 206], [18, 21, 174], [30, 33, 142], [42, 45, 110], [48, 50, 78]],   // [from s, to s, level y]: each drowns one tier
        surges: [[13, 1.6, 178], [37, 1.6, 114]],     // [at s, length s, peak y]: a half-sine wave up from the level and back
        flood: [52, 59, 34],                          // 마지막 물결: [from s, to s, level y] - over the top shelves
        soaps: [3, 9, 15, 24, 28, 36, 46],            // 비누 방울: the seconds one appears (over the water, 4.1.3)
        revive: [{ col: 8, row: 4 }, { col: 23, row: 4 }] },   // 역전: the top shelves' spots (4.1.4)
```

`MINI.water.secs` 60. `waterAt(f, R, k)` adds the surges (`level + (peak - level) * sin(pi * u)`, u = 0..1 over the
surge) on top of the step value and the flood after the last step; still pure, still scaled by `k` (the debug fast
party). What each moment does (feet = the standing animal's bottom; out when feet > level + 3):

| s | Water | Who it threatens |
|---|---|---|
| 3 | 비누 #1 over the floor water line (reachable from the floor) | teaches 비누 |
| 4-7 | 222 → 206 | the floor (feet 216) |
| 13 (+1.6) | surge 206 → 178 → 206 | row 21 (feet 184) for ~0.47 s around the peak: jump at the right moment or climb to row 17 |
| 18-21 | → 174 | row 21 |
| 30-33 | → 142 | row 17 |
| 37 (+1.6) | surge 142 → 114 → 142 | row 13 (feet 120) |
| 42-45 | → 110 | row 13 |
| 48-50 | → 78 | row 9; the two top shelves (feet 56) stay dry |
| 52-59 | → 34 (마지막 물결, 6.3 px/s) | the shelves (feet 56) go under at ~56 s; a jump timed just before buys up to one airtime (~0.6 s; a cat's 2단 점프 or a duck's glide more); nothing is dry past ~58.5 s (the ceiling stops every jump with the feet at y 40); a 비누 save buys ~0.75 s more. In practice the last animal goes under at 56-58 s and the last-one-standing end (+1 s) closes the 판 |

Warnings (`waterTick`, exact frames as today): steps `물이 차올라요!` / `더 높이!` 2 s before; surges `큰 물결!` /
`점프로 피해요!` (class `hurry`) 1.5 s before with `'steam'` (the rush) and a row of small up-arrows drawn 6 px above the
surface for that 1.5 s (`waterDraw`, canvas triangles in `#ffffff` at 0.7 alpha, blinking); the flood `마지막 물결!` /
`계속 점프!` 2 s before. The music goes `'hurry'` at the 4th step's warning (as today).

#### 4.1.2 Out, places, the end

- The out check is today's (`waterBody`, `WATER_SLACK` 3), for every present player that is **dry** (`!p.out && !p.raft`).
- `waterOut(p, M)` (changed): its trap released as today, `M.outs.push([slot, frame])`, splash, the `탈락!` pop, and then
  the animal **becomes a 오리 튜브** (4.1.4) instead of `p.out = true`. My own line: `탈락! 3등` / `오리 튜브로 친구를 맞혀요!`
  (`partyMyLine`; the second line replaces `친구들을 구경해요`).
- **Places**: `key = (out ? outFrame : 1e9) * 100 + min(got, 99)` (`got`: 비누 방울 picked this 판), so the later out is
  better, the same frame is decided by 비누, and equal 비누 share the place. A rafter that came back (역전) has no out
  entry until it goes out again (its new frame counts).
- **The end**: time-up, or `PARTY_F.early` (60 f) after at most one present player is dry (`n0 >= 2`), as today. The flood
  makes a shared 1st rare (only animals that go under on the same frame with the same 비누 share it).

#### 4.1.3 비누 방울 (soap bubbles)

- At each `rise.soaps` second (scaled by `k`), if fewer than `SOAP.max` (2) float, the host makes one:
  `{id, x: ri(WALL_L + 8, WALL_R - 24) (at least 32 px from any other), t0: M.t}`. It floats `SOAP.hover` (20) px above the
  surface - at the feet of an animal standing on the lowest dry tier, so a tier just above it collects it and one over
  open water must be grabbed with a jump off the edge (the risk) - bobbing ±`SOAP.bob` (2) px, for `SOAP.life` (480 f),
  then bursts. Its y is a pure function of `waterAt` and `t0`, so a guest draws it exactly (`waterView`).
- Pickup (host; host-local bodies exact, remote with `SOAP.slack` 4 px, as the crown): the first `canTouch` player whose
  body box overlaps the soap's 8x8 box. `M.got[slot]++`; if it holds none, `M.sh[slot] = 1` (the save). Word pop `비누!`,
  sfx `'item'` (echoed). A 오리 튜브 cannot pick one (`canTouch` is false for it).
- **The save**: in the out check, a dry player with `M.sh[slot]` is not put out: `M.sh[slot] = 0`, `M.safe[slot] = G.frame +
  SOAP.grace` (45: not judged until then), its prison (if any) bursts (`releasePlayer`), then `p.y = max(CEIL_Y,
  M.wl - SOAP.saveUp)` (22 px above the surface), `p.vy = SOAP.saveVy` (-3.4), `p.vx = 0`, `bumpEp(p)` - a guest's page takes
  its animal back at that spot with that upward speed (`takeOver` copies x / y / vx / vy) and hops on with its own
  physics; until then it stands frozen by `guestSelf`'s "가라앉는 중" freeze (a round trip, ~0.2 s: it reads as a dunk and
  a spring). Word pop `살았다!`, sfx `'extend'` (the 1-up fanfare, echoed). A held save shows as a pink soap ring around
  the animal (`drawPlayer`, the capy shield's ring in `#ffc9dc`, drawn from `M.sh` on every page).

#### 4.1.4 오리 튜브 (the out players' rafts) and 역전

- `waterOut` makes the animal a raft: `p.raft = true`, `p.y = M.wl - RAFT.dy` (12: its feet 4 px under the surface),
  `p.vx = p.vy = 0`, `bumpEp(p)`. It stays a live, free player (section 2): its page keeps control. `P` flag 512 says
  raft on the wire; `guestPlayers` / `takeOver` read it (`takeOver` sets `raft: !!(fl & 512)` beside `out`).
- Its physics (`updatePlayer`, **new** first branch `if (p.raft) { raftMove(p, inp); return; }`, on its own page, from that
  page's `G.mini.wl`): walk at `WALK * RAFT.walk` (0.75), walls as usual, no drop-through, no kit move (`perk()` is false for
  a raft); jump = a hop of `RAFT.hop` (-3.0: about 20 px up, 27 f) back down to the surface line; otherwise `y = wl - RAFT.dy`
  (it rides the rising water, clamped under the ceiling). Shoot = the plain bubble (`fire` with `perk()` false: no otter
  volley, no frog egg) through the magazine as in battle; online through `'shot'` / `hostShot` unchanged.
- It cannot be caught (`trappable` and `canTouch` gain `!v.raft`), never goes out again, cannot take 비누. Its plain bubble
  in flight catches a dry rival as any battle shot (shooter-judged `tp` claims online, as today). From the surface it
  reaches an animal that jumped out over the water for a 비누; with its hop it reaches the feet of the lowest dry tier.
- **역전**: in `waterOut(v)`, before the release, `by = v.trap ? v.trap.by : -1`; if seat `by` is a raft, has not come back
  in this 판 (`M.rv[by]` unset) and `M.t` is before the flood's start, it comes back: `p.raft = false`, `placePlayer(p, spot)`
  (the `rise.revive` spot farther from the dry animals; `placePlayer` bumps the epoch, so its page takes it over there),
  `p.invuln = RAFT.inv` (90: blinking, not trappable), its `M.outs` entry removed, `M.rv[by] = 1`. Word pop `역전!` over it,
  sfx `'revive'` (echoed); its own line `역전!` / `다시 올라왔어요!` (`partyMyLine`).
- Drawn (`drawPlayer`, raft branch, every page): the animal's idle / walk frame with its bottom 6 rows clipped
  (`ctx.save(); clip` to `y + 10`), then `duck_ring` over its waist (frame by `G.frame >> 4`), bobbing 1 px; the name tag as
  usual. HUD: the seat's line 2 shows the water icon + place (today's `waterHud` for an out seat), the panel at 0.7 alpha.
- `bodyAt` clears `raft` with `out` (the next 판), `partyFinal` too (it lists `p.out = false` beside the other resets).

#### 4.1.5 Wire, mirror, HUD

`g.mg` = `['w', wl * 10, [[slot, place]], [[id, x, t0]], sh (bit per seat), [got0, got1, got2, got3], rv (bit per seat)]`
(about 40 bytes more at most). `waterView` keeps today's water clock (`M.tt`) and draws the soaps from it; a new outs
entry splashes as today; a slot that left `outs` with `rv` set is a 역전 (its own page shows the line from its own mirror,
the others see the host's word pop). HUD line 2 (`waterHud`): dry → the `coin` icon (the pink soap disc) + `got`; out /
raft → the water icon + place.

#### 4.1.6 Considered and left out

- **Crumbling / sinking platforms**: a broken tile changes `MAP`, which every page's own physics lands on: it needs a map
  sync path (cells in `g.mg`, `buildRoundCanvas` again, a guest standing on a tile the host already broke) that nothing
  has today. The flood gives the same "the safe place shrinks" at no sync cost.
- **비누 as points** (most soap wins): it would make 물 a collection game like 왕관 (a quantity that grows) - the "alike"
  complaint. 비누 stays a save and a tie-break.
- **Rafts collecting 비누 to come back**: two ways back would blur the rule; 역전 is the one way (by skill), and it stops at
  the flood so the end stays decisive.

### 4.2 왕관 뺏기: 왕관이 날아가요 + 황금 왕관

**Rule line**: `15초마다 왕관이 날아가요 · 마지막 15초는 황금 왕관 2배!` (the how line is unchanged).

> **2026-10-29 owner change: last holder wins** ("왕관게임 가장 마지막에 들고있는 사람이 이기는걸로 바꿔줘"). As built now:
> - **1st** is the player wearing the crown at time-up (`MINI_FN.crown.key`: `(holder === slot ? 1e7 : 0) + held`, so
>   the worn crown is above any held count). Places are decided on the host (`partyResult`); guests show the host's
>   (`g.pa.P`, the winner banner in `g.bn`).
> - **2nd and on** by held time, as before. Nobody wearing it at time-up (flying after a flight or a capture, or free on
>   the floor): **everyone** by held time (the old rule, unchanged); nobody ever touched it: all share 1st, as before.
> - **황금 왕관** stays as the last race's signal (the tint, the banner, `'promote'`, the `hurry` music) but held time no
>   longer doubles: `CROWN2.goldX` is gone, `held += 1` a frame always. 1st no longer comes from time, so a x2 would only
>   be one more rule to explain.
> - Texts: how `끝날 때 왕관을 쓴 사람이 1등`, rule `15초마다 왕관이 날아가요 · 2등부터는 쓴 시간 순서`, the gold banner
>   `황금 왕관!` / `끝날 때 쓴 사람이 1등!` (one line at 1x, 2x and on the 568x320 phone - party.js measures it).
> - `PARTY_V` 3 → **4** (6.1): a pa 3 page computes nothing here (it mirrors the host's places), but its card and demo
>   would still teach the longest hold and the x2 against the host's new 1st.
>
> The bullets below are the original 10-29 polish spec; where they say x2 or "places by `held`", the note above wins.

- **Flights** at clock seconds 15, 30, 45 (`M.t === round(s * 60 * k)`, `k = total / 3600`): **new** `crownFly(M)` - a
  sparkle burst where the crown is, `cr = {x: gather.x - 8, y: gather.y - 8, vx: 0, vy: 0, onGround: false, holder: -1,
  noPick: -1}` (nobody waits: the old holder may race too), banner `왕관이 날아가요!` (class `round`), sfx `'powerup'`
  (echoed). The crown falls onto the centre stage exactly as at 시작! (every battle arena's gather is above its centre
  stage, design/party.md 4.2). `M.fl` counts the flights.
- **황금 왕관**: the 45 s flight sets `M.gold = 1` (banner `황금 왕관!` / `2배!`, class `victory`, sfx `'promote'` instead of
  the flight's; music `'hurry'`). From then `held[slot] += CROWN2.goldX` (2) a frame. The crown is drawn
  `tintOf(crown, '#ffd447', 0.6)` with a faster glint (every 4th frame), worn and free; the HUD's crown icon and seconds
  turn `#ffd447`. `10초 남았어요!` still comes at 50 s.
- Places by `held` (unchanged rule). Wire: `['c', holder, x, y, f0, f1, f2, f3, noPick, gold]` (`gold` 0 / 1; a missing
  one reads 0). `crownView` mirrors `gold`.
- **Why**: one early grab no longer decides it - the race restarts three times and the last 15 s count double, which
  gives the trailing players a real comeback without any hidden rule (the flight and the gold are on screen).
- Considered and left out: **a head stomp that steals the crown** (Mario-like, but it needs player-on-player collisions
  judged on remote bodies and a stun on the victim's own page: new physics across pages); **two crowns** (a list in the
  wire, two holders' slowdowns; more to read on a phone).

### 4.3 거품 축구: 공이 2개 + 골든 골

**Rule line**: `45초부터 공이 2개! · 비기면 골든 골` (the how line is unchanged).

- **공이 2개**: when the clock passes 45 s (`M.t >= round(2700 * k)`; `M.t` does not count the 골! freezes) and no 골! is
  running, **new** `ballTwo(M)`: `M.ball2 = {x: A.x, y: A.y, vx: 0, vy: 0, kick: BALL.kickF, rest: false}`, banner
  `공이 하나 더!` / `골을 넣으면 공이 다시 떨어져요` (class `round`), sfx `'powerup'` (echoed). `ballTick` steps both balls
  (the step body becomes `ballStep(M, B)`, **new**, for `M.ball` and `M.ball2`: field, bodies, floating bubbles, field again,
  NaN guard, clamp, cap, goals); `ballShot` (the `shotHits` test) and `ballSlam` try both. A ball touching the other is
  pushed out along the normal (no bounce maths: `ballOut` against a box around the other).
- **A goal while there are two balls**: `goals[t]++`, that ball bursts (the burst and `shake(3)` of today), banner `골!` /
  `왼쪽 팀 2 : 1` for 60 f (class `victory`), sfx `'clear'`, and that ball hangs again at the centre top for `BALL2.redrop`
  (45) frames (blinking, not in play). **No** `goalT` freeze, **no** kickoff (traps, bubbles and players stay): the clock
  runs on. (Before 45 s a goal works exactly as today.)
- **골든 골**: **new** optional contract hook `over(M)`; `miniOver()` becomes `left <= 0 && (!F.over || F.over(M))` or the
  early end. `ball.over`: when the goals differ, or only one team is present, true; when tied, the first call starts the
  overtime (`M.gg = 0`; banner `골든 골!` / `먼저 넣는 팀이 이겨요!`, class `hurry`, sfx `'hurry'`) and returns false; each
  playing frame `M.gg++` (`miniTick` keeps calling the game at `left` 0); the next goal sets `M.endAt = G.frame + 60` (the
  cheer, then the result); `M.gg >= BALL2.golden * 60` (20 s) → true (a draw). `updateBattle`'s clock stays at 0 meanwhile;
  `drawHUDParty` draws the overtime as `+0:07` in `#ffd447` (the canvas font has `+`, `:` and digits). Both balls stay in
  play during the overtime.
- Wire: `['b', x, y, vx, vy, gL, gR, goalT, kick, kn, x2, y2, vx2, vy2, kick2, gg]` (`kick2` -2: no second ball; `gg` -1: no
  overtime). `ballView` tweens the second ball like the first (only while it is in play in both snapshots), bursts a ball
  whose `kick` turns from 0 to > 0 while the goals rose, and plays `'bounce'` off `kn` as today. The second ball is drawn
  `tintOf(giant_bubble, '#ff8fb1', 0.35)` (pink) with a pink disc behind it.
- **Why**: the last 15 s get twice the chances (more goals, chaos, comebacks), and most draws (today: everybody 4 points,
  "nothing happened") end with a winner. Both are on screen (the second ball, the gold clock) - nothing hidden.
- Considered and left out: **a charged power shot** (a hold-to-charge input on every kit and page: new input semantics;
  the capy's slam is already the "big hit"); **goals worth 2 in the last 15 s** (the same twist as 황금 왕관 - "alike").

### 4.4 What stays

Rival capture is the short no-KO trap in every game (`MINI_TRAP` 90 f); placement points 4 / 2 / 1 / 0 (x2 on the last
판); the rotation (3 players: no 축구); the 3판 / 5판 option; 능력 끄기 / 연사; coins only, no trophies.

---

## 5. The minigame contract (for the next PR's other genres)

| Hook | Status | Meaning |
|---|---|---|
| `MINI[id].keys` / `keysT` | **new**, optional | The card's keys line for this game (a 연타 game: `X 연타!`). Absent: `PARTY_TX.keys` / `keysT`. |
| `MINI_FN[id].demo(dx, f, a, b)` | **new**, optional | The card's 96x32 animated how-to (3.2.1). Absent: no demo box. |
| `MINI_FN[id].over(M)` | **new**, optional | The 판 may run past time-up (축구's golden goal). Absent: time-up ends it. |
| `hold` / `held` / `win` / `spawns` / `init` / `start` / `tick` / `key` / `snap` / `view` / `drop` / `draw` / `hud` | unchanged | design/party.md 18.1. |
| `MINI[id].world: false` | **reserved** (next PR) | A game with its own screen and no platform bodies (반응속도, 기억력): `miniLoad` skips the arena and the spawns, the HUD keeps the seat panels. Not built here. |
| body state `mi` + `MINI_FN[id].input(p, mi)` | **reserved** (next PR) | A guest's own small input state for the game (latest wins, at most 8 numbers: a 연타 count, the tick of a first press), read by the host each frame like `pr`. `pr` (this PR) is the first field of this kind. Not built here. |

The sequencer, the card / tally / awards and the coins never look inside a game: a new genre is a `MINI` entry, its
`MINI_FN` hooks, its card texts and (for `world: false`) no arena. The award counters (`wins`, `caps`, `esc`) are the
sequencer's: a game without bubbles only feeds `wins`.

---

## 6. Network

### 6.1 Gate: `PARTY_V` 3

`PARTY_V` 2 → **3** (this page plays 물 v2, the beats, `pr`). A PR-B page (`hi.pa` 2) in a party room is never ready,
shows `새로고침 필요`, and the room says why - the existing `seatReady` / `seatOld` / `R.u` path (design/party.md 6.1), no
new code. party-net's crafted older guest sends `pa: 2`. The board PR, when it comes back, takes the next number.

2026-10-29 (14.5): `PARTY_V` 3 → **4** for 왕관's last-holder rule; party-net's crafted older guest now sends `PARTY_V - 1`
(3, this polish's page), and the board PR takes 5.

### 6.2 Who decides what

| Thing | Who | On the wire |
|---|---|---|
| My 준비 완료 | each player for itself | guest body state `pr` (the 판 index); host `P.rdy` → `g.pa.R` |
| The card's end, the beats, skips | host | `g.pa.b`, `bt`, `bk`, `t` |
| Points (x2 on the last 판), awards, bonuses | host (`partyResult`, `partyAwards`) | `g.pa.P`, `A`, `B`; `P` row score |
| 비누 spawn / pickup / save | host (remote bodies + 4 px) | `g.mg` soaps, `sh`, `got`; the save's body through `bumpEp` / `takeOver` |
| A 오리 튜브's body and bubbles | its own page (as any body); captures shooter-judged (`tp`) | body state; `P` flag 512 |
| 역전 | host (`waterOut`: the drowned animal's `trap.by`) | `g.mg` outs / `rv`; the rafter's new epoch |
| Crown flights / gold | host (clock frames) | `g.mg` `gold`, the holder |
| Second ball, golden goal | host | `g.mg` ball 2, `gg` |
| Tally numbers, demos, winner stage, FLIP, tally ticks | each page from the synced state | none (drawn locally) |

### 6.3 `g.pa` additions (`partySnap` / `partyView`)

```js
  // b: the result beat ('' outside a result) - 'f' 끝!, 'w' winner stage, 't' tally, 's' 마지막 판!, 'a' 보너스상!, 'A' an
  //    award (bk its index in A), 'z' 최종 순위; bt: frames into it; R: the card's ready seats (bit per seat);
  //    cl: the card's auto-start length (the bar); X: 2 on the last 판 (the card's chip, the tally's +N);
  //    A: [[code, value, [slots]]] from beat 'a' on; B: [bonus by seat] from the first award on
  g.pa = { n, i, L, t, ft, cl, P, F?, W?, T?, b?, bt?, bk?, R?, X?, A?, B? };
```

`partyView` reads them with `nInt` / `nStr` bounds as today (`b` one of `fwtsaAz`, else ''; `A` at most 3 rows of a
known code with slots 0..3). When `b` or `bk` changes, the guest switches the overlay view (`showOverlay('party')` +
`fillParty(view)`, or hides it for `f` / `w`) **before** `guestPhase` (as `partyView` already runs first). The guest's
`P.t` keeps feeding the coin close (the first `'r'` snapshot, unchanged).

Size: `b`, `bt`, `bk`, `R`, `X` ≈ 30 bytes; `A` ≈ 40, `B` ≈ 15 at the end; 물 `g.mg` + ≈ 40, 축구 + ≈ 30. Still well under
`SNAP_LIMIT` 3400 (party-net asserts it).

### 6.4 Guest hooks

- `guestSend`: `pr: NET.partyReady` while `G.mode === 'card'` and `NET.partyReady === G.party.i` (else the field is left out).
  `NET.partyReady` resets to -1 at each new `g.pa.i` (`applyView`'s fresh-판 branch).
- `guestSelf`: in `'card'`, my jump / shoot press → `partyReadyMe()` (not while `G.menuOpen`); in a raft, `updatePlayer` →
  `raftMove` as on the host (4.1.4). The "가라앉는 중" freeze is unchanged (it also covers the 비누 save's round trip).
- `takeOver`: `raft` from flag 512 (4.1.4).
- `primaryAction` on a guest: `'card'` → ready; `'result'` → nothing.
- Sounds: the beats' `mg_finish`, `mg_win`, `drumroll`, `award`, `mg_title` (마지막 판!), `ready`, and the games' `'steam'`,
  `'item'`, `'extend'`, `'revive'`, `'powerup'`, `'promote'`, `'hurry'` echo from the host (`'s'` events, in step with the
  view). `tally` and `rank_up` are each page's own (`uiSfx`) and go into `NO_ECHO` too (a host's tally must not play twice
  on a guest). `mg_go` replaces the host's `'go'` (echoed).

### 6.5 Old pages and other modes

Battle and co-op never see any of this (every new path checks `G.party` / `G.mini`); `p.raft` is only ever set in 물.
`battle-net`, `mp-net`, `trophies-net` and `kits*` must stay green (one suite run).

---

## 7. UI

### 7.1 Korean texts (verbatim; `PARTY_TX` additions, all warmed through `PARTY_TEXT`)

`{0}` is filled at run time (stripped for the warm-up, as `CLOUD_TEXT` does).

| Key | Text | Where |
|---|---|---|
| `ready` / `readyK` / `readyDone` | `준비 완료!` / `준비 완료! (Z)` / `준비됐어요!` | the card's button (touch / keyboard / after my press) |
| `allReady` / `autoIn` | `모두 준비됐어요!` / `{0}초 뒤 시작` | the card's bar line |
| `x2` | `점수 2배!` | the last card's chip, the last tally's header chip |
| `finish` | `끝!` | the 끝! banner |
| `resultH` | `{0}판 결과` | the tally's header |
| `lastH` / `lastSub` | `마지막 판!` / `점수 2배 · ` (+ the doubled table, e.g. `1등 8점 · 2등 4점 · 3등 2점`) | the 마지막 판! view |
| `lead` / `gap` | `선두` / `1위와 {0}점 차` | the 마지막 판! rows |
| `awardsH` / `awardsSub` | `보너스상!` / `상마다 +2점` | the awards intro |
| `aw` / `awL` | `최다 1등상` / `1등을 가장 많이 했어요` | award 1 |
| `ac` / `acL` | `최다 가두기상` / `친구를 가장 많이 가뒀어요` | award 2 |
| `ae` / `aeL` | `최다 탈출상` / `거품에서 가장 많이 빠져나왔어요` | award 3 |
| `times` / `awardPts` / `awardTie` | `번` / `+2점` / `공동 수상!` | an award's value, points, a shared award |
| `finalH` | `최종 순위` | the final sort |
| `skip` | `방장: 눌러서 넘기기` | host only, the result views |
| `surge1` / `surge2` | `큰 물결!` / `점프로 피해요!` | 물 surge warning |
| `flood2` | `계속 점프!` | 물 flood warning (with the existing `마지막 물결!`) |
| `soapGot` / `saved` | `비누!` / `살았다!` | 물 word pops |
| `raftMe` | `오리 튜브로 친구를 맞혀요!` | 물: my own out line (with `탈락! N등`; replaces `watch` in 물) |
| `revive` / `reviveMe` | `역전!` / `다시 올라왔어요!` | 물: the word pop / my own line |
| `crownFly` | `왕관이 날아가요!` | 왕관 flight |
| `gold1` / `gold2` | `황금 왕관!` / `2배!` (10-29, 4.2: `끝날 때 쓴 사람이 1등!`) | 왕관 gold |
| `two1` / `two2` | `공이 하나 더!` / `골을 넣으면 공이 다시 떨어져요` | 축구 second ball |
| `golden1` / `golden2` | `골든 골!` / `먼저 넣는 팀이 이겨요!` | 축구 overtime |
| `roomLast` / `roomAwards` | `마지막 판은 점수 2배!` / `끝나면 보너스상 3개 · 상마다 +2점` | the room's rules (after the points line) |

Changed `MINI` texts: 물 `how` `물이 차올라요! 가장 늦게 젖으면 1등`, `rule` `비누 방울을 먹으면 한 번 살아나요 · 빠지면 오리
튜브로 친구를 맞혀 역전!`; 왕관 `rule` `15초마다 왕관이 날아가요 · 마지막 15초는 황금 왕관 2배!` (10-29, 4.2: `how`
`끝날 때 왕관을 쓴 사람이 1등`, `rule` `15초마다 왕관이 날아가요 · 2등부터는 쓴 시간 순서`); 축구 `rule`
`45초부터 공이 2개! · 비기면 골든 골`. The `how` lines stay one line (≤ 17 syllables: 물 15). No string uses the retired v1
title's syllables (`final-e2e2`).

### 7.2 DOM (`page.html`, inside `#pg-party`'s `.pg-party-card`)

```html
            <p id="pg-party-round" class="pg-party-round">1판 / 3판<b id="pg-party-x2" class="pg-party-x2" hidden>점수 2배!</b></p>
            <h2 id="pg-party-name" class="pg-h2">물 차오르기</h2>
            <p id="pg-party-sub" class="pg-party-sub" hidden></p>                  <!-- tally / stand / award sub line -->
            <canvas id="pg-party-demo" class="pg-party-demo" width="96" height="32" aria-hidden="true"></canvas>
            <p id="pg-party-how" ...></p> <p id="pg-party-rule" ...></p> <p id="pg-party-keys" ...></p> <p id="pg-party-team" ... hidden></p>
            <ol id="pg-party-ready" class="pg-party-ready" aria-label="준비"></ol>
            <button id="pg-party-go" class="pg-btn pg-party-go" type="button">준비 완료!</button>
            <div id="pg-party-award" class="pg-party-award" hidden></div>         <!-- icon, name, line, winners, value, +2점 -->
            <ol id="pg-party-board" class="pg-party-board" aria-label="점수판"></ol>
            <i class="pg-party-bar" aria-hidden="true"><i id="pg-party-fill"></i></i><span id="pg-party-bart" class="pg-party-bart"></span>
            <p id="pg-party-skip" class="pg-party-skip" hidden>방장: 눌러서 넘기기</p>
```

`#pg-party[data-view]` (`card` / `tally` / `stand` / `award`) shows each view's parts by CSS; `.is-splash` on the card
hides everything but the round line and the name. The ready chips: `<li class="pg-party-chip">` (bust canvas + a ready
mark canvas, `is-me` outline, `aria-label` `방장 준비 완료` / `방장 기다리는 중`). `aria-live="polite"` stays on the card
(one announcement per view change, not per tally step: the counting numbers carry `aria-hidden`, the row's `aria-label`
says the final `9점, 지난 판 +4`).

### 7.3 Fit (the two tight boxes, design/party.md 9.2 numbers)

| View | 1x window (17.4em x 16.6em of content; no rule line) | 568x320 phone (21.4em x 20.3em; rule line shown) |
|---|---|---|
| card splash | round 1.1 + name 2.6em sign → 3.3 = **4.4em** | 4.4em |
| card how-to | round 1.1 + name 2.0 + demo 32 px = 2.9 (+0.3) + how 1.2 + keys 1.05 + ready row 1.6 + button 2.0 + bar 0.9 = **13.05em** (축구 + team 2.2 = **15.25**) | demo 43 px = 3.45em; + rule 2.2: **15.85em** (축구 **18.05**) |
| tally / 최종 순위 | header 1.4 + sub 1.1 + 4 rows 5.5 + skip 1.0 = **9.0em** | 9.0em |
| 마지막 판! | header 2.0 + sub 1.2 + 4 rows 5.5 = **8.7em** | 8.7em |
| award | icon + name 2.0 + line 1.2 + winners 2.4 + value 1.3 + skip 1.0 = **7.9em** | 7.9em |

Widths at 1x: the ready row 4 x (1.25em bust + 0.75em mark + 0.4em gap) ≈ 9.6em; the button 9em; the demo 8.7em; the
board rows as today (12-syllable nicks ellipsize). Under 17em of height (a window under 1x) the demo, the round line and
the bar hide (today's rule extended to `#pg-party-demo`). The 축구 card at 568x320 is the tallest (18.05 of 20.3em).

### 7.4 HUD (`drawHUDParty`, canvas: digits and sprites only)

- 물: line 2 = `coin` icon + 비누 count (dry), water icon + place (out / raft); a raft's panel at 0.7 alpha.
- 왕관: the crown icon / seconds in `#ffd447` once gold.
- 축구: unchanged; the clock shows `+m:ss` in `#ffd447` during 골든 골.
- Card / result: no minigame line (as today).

---

## 8. Sprites and sound

### 8.1 Sprites

| Need | Reuse / new |
|---|---|
| 오리 튜브 | **New** `SPR.duck_ring` (16x8, 2 frames: the ring's front half in `Y` / `y` with a `k` outline, a little duck head with an `O` beak on the right end; frame 1 lifts the head 1 px). `OPT_SPR` (optional: a missing frame draws a `#ffd23c` 2 px ellipse ring instead). In `sprites.js` style next to `fx_duck`. |
| 비누 방울 | `coin` (the pink soap disc, 8x8, frame by glint) inside a canvas ring (`#ffc9dc`, 1 px, 6 px radius). |
| A held save | `drawPlayer`'s capy shield ring, coloured `#ffc9dc`. |
| Gold crown | `tintOf(crown, '#ffd447', 0.6)` + glint. |
| Second ball | `giant_bubble` tinted `#ff8fb1` 0.35. |
| Surge arrows | canvas triangles. |
| Award icons | `crown`, `bubble` (frame 0), `bubble_pop` (frame 0) in 16 px canvases. |
| Ready mark | `SPR_READY` (the room's 8x8 check). |
| Demos | the animals' idle / walk / jump, `tile_<n>`, `water_cold_top`, `crown`, `giant_bubble`, `bubble`, `coin`, `duck_ring`. |
| Winner stage | `drawPlayer`, the podium's spotlight, `STAR_COLS` confetti. |

`REQUIRED` / `SPR_SIZE` do not change (`duck_ring` is optional, sized 16x8 in `OPT_SPR`'s size rule).

### 8.2 Sound (`audio.js`, in the `SFX` table's style: `voice` / `noise` / `drum`, short, at or under the v1 levels)

| Name | **New** sound | Echo |
|---|---|---|
| `mg_title` | Card splash sting (0.5 s): a noise swell into a 3-note rising `p25` "따-단-딴!" (G5 C6 E6) with a triangle bass, a crash on the last. | echoed |
| `mg_go` | Start fanfare (0.6 s): `go`'s chord, preceded by two quick brass pickups ("빰빠-라밤!"), kick + crash. | echoed |
| `mg_finish` | 끝! (0.7 s): a referee whistle (a `p12` 2.6 kHz with fast vibrato, 0.35 s, two blasts) and a crash. | echoed |
| `mg_win` | Winner jingle (1.6 s): a bouncy C-major run (C E G C' E' D' C') over an oom-pah bass, a held C-E-G with a 6 Hz vibrato, snare + crash (`extend`'s shape, longer, brighter). | echoed |
| `tally` (o.n 0..9) | One point counting in: a 40 ms triangle "띡", pitch C6 + 2 semitones a step (wraps after 9). | **local** (`uiSfx`, `NO_ECHO`) |
| `rank_up` | My row went up: a 0.25 s sine swoosh 600 → 1800 Hz + `item`'s ding. | **local** (`NO_ECHO`) |
| `drumroll` | 0.9 s snare roll (`drum 's'` every 35 ms, swelling) ending on a crash. | echoed |
| `award` | Award reveal (0.6 s): a sparkle (`powerup`'s top) and a two-note brass "따-란!". | echoed |

Music: **new** `party` loop (8 bars, 132 bpm, F major, the `lobby` instrument set with a bouncier bass and a bell arp) for
the card and the tally / standings / award views; appended to `MUSICS` (wire index 13, gated by `PARTY_V`). `podium`,
`battle`, `hurry` as today; 끝! stops the music (`setMusic(null)`); the winner stage has only the jingle.

Reused sounds: `ready` (a ready), `steam` (surge rush), `item` (비누), `extend` (save), `revive` (역전), `splash` (out, as
today), `powerup` (crown flight, second ball), `promote` (gold), `hurry` (golden goal), `clear` (goal), `bounce` (pushes, as
today), `countdown`, `door`, `win` (the podium, as today).

---

## 9. Balance numbers to start from (top constants block, before `V3_TEXT`)

```js
  const PARTY_V = 3;
  const PARTY_F = { early: 60,
    splash: 72, cardMin: 150, allIn: 30, auto: 600, autoRe: 360,                                    // the card
    finish: 54, win: 132, tally: 168, stand: 150, awardIn: 54, award: 108, final: 96, skipMin: 30 }; // the result beats
  const PARTY_LAST_X = 2;                 // the last 판's points (1: off)
  const AWARD_PTS = 2;                    // each 보너스상 (0: shown, no points)
  const AWARDS = [ { c: 'w', name: '최다 1등상', line: '1등을 가장 많이 했어요', icon: 'crown' },
    { c: 'c', name: '최다 가두기상', line: '친구를 가장 많이 가뒀어요', icon: 'bubble' },
    { c: 'e', name: '최다 탈출상', line: '거품에서 가장 많이 빠져나왔어요', icon: 'bubble_pop' } ];
  const ESC_MASH = 3;                     // an escape counts for 최다 탈출상 with at least this many presses
  const SOAP = { hover: 20, bob: 2, life: 480, max: 2, slack: 4, grace: 45, saveUp: 22, saveVy: -3.4, gap: 32 };
  const RAFT = { walk: 0.75, dy: 12, hop: -3.0, inv: 90 };
  const SURGE_WARN = 1.5;                 // s of warning before a surge (steps / the flood: rise.warn)
  const CROWN2 = { every: 15, goldAt: 45, goldX: 2 };   // (10-29, 4.2: goldX gone - { every: 15, goldAt: 45 })
  const BALL2 = { twoAt: 45, redrop: 45, golden: 20, cheer: 60 };
  // MINI.water.secs 60; 물 schedule: section 4.1.1 (arena data)
```

Tuning knobs after the friends' next play: `PARTY_LAST_X` / `AWARD_PTS` (how much the end can swing), `rise.surges`
peaks (how hard the jump timing is), `SOAP.hover` and `rise.soaps` (how risky 비누 are), `RAFT.hop` (how far rafts reach),
`CROWN2.every`, `BALL2.twoAt`. Bot checks are not part of this PR (no bots for the party).

---

## 10. Debug / test API and tests

### 10.1 `PG.debug.party` additions

`ready(slot)` (that seat presses 준비), `beat()` → `{b, bt, bk}`, `skipBeat()` (the host's skip), `awards()` (`partyAwards`
on the current state), `counts()` → `{caps, esc, bonus}`, `soap(x)` (a 비누 now), `raft(slot)` (make it a raft), `flight()`
(a crown flight now), `two()` (the second ball now), `golden()` (time-up with the goals as they are). `state()` gains `b,
bt, bk, R, A, B, rdy, auto` and `mini` gains `soaps, sh, got, rv, rafts, gold, fl, ball2, gg`; `card()` gains `view,
splash, ready: [{nick, ok, me}], button, demo (shown), barText, skip, award {name, line, winners, value}, sub` and its
board rows gain `mv` (`▲1` / `▼1` / ''). `consts()` gains the section 9 constants. `fast(on)`: the section 3.1 fast
timings; 물's schedule, soaps, crown flights (3 / 6 / 9 s) and the second ball (9 s) scale with `k`; golden goal max 4 s.

### 10.2 `src/tests/party.js` (virtual time, stepped; adjust + add)

Adjust: the card's 300 f / the result's 180 f (now the beats), the `N등 +N` word pops (gone), the board on the card (now
the tally), 물 75 s → 60 s and its tier / step checks (new schedule), `PARTY_V` 3, `consts()`.

Add:
1. **Card**: splash then how-to (`.is-splash` for 72 f); a press before `P.t` 12 ignored; all ready at 40 f → starts at
   150; all ready at 300 → starts at 330; nobody ready → 600 (a repeat game → 360); a leaver during the card who was the
   last not ready → starts; the ready row and the button text by seat; the bar text counts down.
2. **Beats**: `f → w → t → next card` with exact lengths; the second-to-last 판 adds `s`; the last 판 `t → a → A.. → z →
   podium`; the host's skip after 30 f only, from each skippable beat; no skip of `f` / the card / the countdown.
3. **Points**: the last 판 x2 for 2 / 3 / 4 players and for 2v2 (8 / 8 / 2 / 2, a draw 8 each); a replan keeps the
   doubling on the last index.
4. **Awards**: `caps` from rival traps only (a raft's too, not the owner's own bubble); `esc` only with ≥ 3 presses (the
   timer alone and a kickoff release do not count); `partyAwards` - the top value, shared ties, none for a top of 0 or when
   everybody has it; `+2점` lands at the award's `bt` 18 (also when skipped to); the podium order and `p.score` include
   the bonuses; an empty `A` skips to `z`.
5. **물 schedule**: `waterAt` at every step / surge / flood edge and the peak; players parked on each tier go out in the
   expected order; a jump timed over a surge stays dry, a standing one goes out; on the shelves during the flood a
   jumping animal outlasts a standing one; everybody is out by 59 s.
6. **비누**: spawn times and the max of 2, never within 32 px; y follows the water (hover + bob); the first touch takes it
   (remote with 4 px slack); a raft cannot; the save (no out, the grace, the hop for a local body, `bumpEp` for a remote
   one, a trapped animal's prison bursts) and only once per soap; `got` breaks a same-frame tie; equal `got` share.
7. **오리 튜브**: an out animal becomes a raft (not `out`, flag 512 in its `P` row), rides `wl - 12` as the water rises,
   walks at 0.75, hops ~20 px, blows only plain bubbles, cannot be trapped or take 비누 or be judged by the water; its
   bubble traps a dry animal; **역전**: that animal drowning in its prison brings the rafter back on the farther shelf with
   90 f of invuln and no out entry, once a 판, never from the flood's start; places by the last out frame; the last one
   standing counts dry animals only; `bodyAt` / `partyFinal` clear `raft`.
8. **왕관**: flights at 15 / 30 / 45 s (holder freed, nobody waits, the crown at the gather, lands on the centre stage);
   gold from 45 s: `held` +2 a frame; places by held. (10-29, 4.2: the one wearing it at time-up 1st over a longer
   holder, a capture at the buzzer - grabbed: the grabber, still flying: by held -, the rest and a free crown by held,
   `held` +1 a frame when gold.)
9. **축구**: the second ball at 45 s of clock (not counting 골! freezes; waits for a running 골!); both balls pushed by
   bodies / bubbles / the slam; a goal with two balls does not stop the clock or reset anyone and re-drops that ball after
   45 f; 골든 골 only when tied with both teams present; the next goal ends it after 60 f; 20 s → a draw; 60 s of random
   kicks with two balls never out / NaN / wrapped.
10. **Demos**: each game's `demo` draws 240 frames into a 96x32 context without errors and leaves pixels on it.
11. **Fit**: every view (splash, how-to with the ready row, tally, 마지막 판!, award, 최종 순위) for each game, 4 players
    with 12-syllable nicks, 축구 with its team line: `scrollHeight <= clientHeight` inside `#pg-screen` at **1x** (no rule
    line, the how and keys lines one line each), **2x** and the **568x320** phone (`#fit`, touch keys line, rule line).
    `PARTY_TEXT` holds every new string.
12. **No regressions**: a battle and a co-op round after a party draw no raft, no demo, the old podium title.

### 10.3 `src/tests/party-net.js` (4 bc frames, real time; adjust + add)

Adjust: 1 crafts PR B's `hi` (`pa: 2`) as the older page; the card checks read the ready row instead of the board; the
phase watcher also records `g.pa.b`.

Add:
1. **Ready**: each guest's 준비 (`D.press('jump')` on that frame) reaches the host through `pr`; the ready rows agree on
   every page within 0.5 s; all ready → the 3-2-1 starts on every page (well before the auto start); with one guest never
   pressing, the auto start (fast: 90 f) still starts everyone.
2. **Beats**: `f w t (s) ...` reach every page in order; the 끝! banner and the winner line on every page; the tally's
   final numbers and the re-sorted order agree everywhere; the host's skip moves every page to the next beat; a guest's
   press does not.
3. **Awards**: the same `A` and bonuses on every page; the podium order / places / points include them; coins still
   match `coinParty` of each page's own counters.
4. **물 v2**: a guest's out makes it a raft on every page (flag 512), its control stays local (its raft moves on the
   host); a guest raft's bubble traps the host's animal over the water → 역전 on every page and the rafter's own page
   controls it on the shelf; a guest's 비누 pickup and its save (the hop through `takeOver`, not out during the grace).
5. **왕관**: a flight frees the holder on every page; the gold crown and the doubled seconds agree at the result. (10-29,
   4.2: the held seconds agree, and the 1st on every page is the one wearing it at time-up, over a longer holder.)
6. **축구** (2v2, forced): the second ball on every page (tweened, in step with the host's path within the existing
   tolerance); a goal with two balls counted once, no freeze; a forced tie at time-up → 골든 골 on every page, the next
   goal ends it.
7. Snapshots stay under 3400 bytes throughout.

### 10.4 Other tests and jobs

- `tools/validate-levels.js` (물 arena): `steps` as today; each surge peak drowns exactly the tier above its level and no
  higher, and overlaps no step; the flood starts after the last step, ends before `secs - 1` and its level is at most
  `CEIL_Y + 16 - WATER_SLACK - 1` (36: even an animal with its head on the ceiling has its feet under the water, so
  everybody goes out); `soaps` inside the game and before the flood; `revive` spots standable on the top shelves and
  mirrored.
- `check-pages` / `final-e2e2`: the new DOM ids, the warm-up text. `ux-roomrow`: the rules list's two new lines fit.
- `run-all.js` jobs unchanged (`party`, `party-fit-568`, `party-net`); `party` stays in the CI `JOBS`. One full suite run
  at the end (`node tools/run-all.js`), every Chrome run with `--mute-audio`.

---

## 11. Risks

1. **The raft is a new player state** (alive and free but not touchable, its own physics branch). Every predicate it
   passes through (`trappable`, `canTouch`, `perk`, the water check, `takeOver`, the snapshot flag, `drawPlayer`) is
   listed in 4.1.4; it is only set in 물. Battle / co-op tests must stay green.
2. **The 비누 save of a remote animal** goes through `bumpEp` / `takeOver`: the guest stands frozen half in the water for a
   round trip before it springs out. At 300+ ms RTT it may look sticky; the grace (45 f) covers the host's side. If friends
   find it laggy, the follow-up is a guest-side spring when its own mirror shows a save.
3. **Time creep**: more beats between 판 (13 s vs 11 s). Mitigated by the all-ready start, the host skip and 물's 60 s;
   the test pins the total of a fast party, and section 3.1's table is the budget.
4. **Swing feels unfair** ("I led all game and lost on the last 판"): the x2 and the awards are announced in the room's
   rules, on the 마지막 판! screen and on the card. Both are constants (`PARTY_LAST_X` 1, `AWARD_PTS` 0 turn them off).
5. **The card fit** with the demo and the ready row (the 축구 card on a 568x320 phone uses 18.05 of 20.3em). The fit test
   covers all views; the fallback is hiding the demo under 21em of height.
6. **Sound clutter**: 8 new effects plus the existing ones in the busy end of 물 (rafts, saves, splashes). They stay at
   or under the v1 levels; `tally` is quiet and local.
7. **Revive abuse**: a rafter can come back once per 판 and never in the flood, so a 판 always ends; a friend trapping
   someone on purpose so a rafter can come back is fine (it is a party game).
8. **Old PWA pages** (PR B, `pa` 2) must refresh before playing a party: the existing gate shows it.
9. **Golden goal and the clock**: `left` stays 0 while `over` returns false; anything that treats `left <= 0` as "over"
   outside `miniOver` (the 10초 warning, coins' `playF` from `g.tl`) must be checked - `playF` does not count the
   overtime (fine: the coins' 60 s gate is met anyway).

---

## 12. Effort and build order

About **2,600-3,000 changed lines**: `game.js` ~1,400 (flow ~750, 물 v2 ~400, 왕관 ~60, 축구 ~200), `page.html` ~150 (DOM +
CSS), `audio.js` ~200 (8 sfx + the `party` loop), `sprites.js` ~20 (`duck_ring`), `levels.js` ~15, `validate-levels.js`
~60, tests ~900 (`party.js` ~550, `party-net.js` ~350). Comparable to PR A (#20). In this project's terms: **two build
passes of a lean workflow** (one engine + UI agent, one tests agent) **plus one check and one full suite run** - about a
day of wall-clock work, split over two sessions if the 5-hour limit is near.

Build order (each step leaves the party playable), with cut lines if it runs long:
1. **Must**: `PARTY_V` 3, the beats (`f w t`, `s`, the x2), the card's ready / auto start, the tally with count-up and
   FLIP, the host skip, `mg_go` / `mg_finish` / `mg_win` / `tally`, the wire, the fit. (A without demos and awards.)
2. **Must**: 물's new schedule (60 s, surges, flood) and 비누 (save + tie-break).
3. **Must**: 왕관 flights + gold; 축구 golden goal.
4. **Should**: 오리 튜브 rafts; then 역전 (cut 역전 first, then rafts - an out animal would then be hidden as today).
5. **Should**: the awards (`a A z`, `drumroll`, `award`), the winner stage.
6. **Should**: 축구's second ball.
7. **Could**: the three demos (fallback: no demo box), `mg_title`, `rank_up`, the `party` loop (fallback: `lobby`).

---

## 13. Open questions for the owner

1. The last 판 x2 and the 보너스상 (+2점 each): on by default as here, or a room option (`보너스 규칙`)?
2. 역전 once per 판 per rafter: enough of a comeback, or should a rafter come back every time its bubble drowns someone?
3. Only the host may speed up the result screens: OK, or should everyone's press count as a "다음" vote?
4. A new between-판 music loop `party`, or keep the room's `lobby` music?
5. Auto start after 10 s (6 s for a game already played): too long / too short for the friends?

Built with the defaults the lead confirmed (2026-10-29): the x2 and the 보너스상 always on (no room option); 역전 once per
판 per rafter; only the host speeds up the result screens; the new `party` loop between 판; the auto start 10 s / 6 s.
All five stay tuning questions for the friends' next play.

---

## 14. As built

Every step of section 12 is in (Musts, Shoulds and Coulds): the card's splash / demo / 준비 완료 / auto start, the beats
(`f w t s a A z`), the x2, the tally's count-up and FLIP, the host skip, the 8 sfx and the `party` loop, the wire
(`PARTY_V` 3), 물 v2 (60 s, surges, the flood, 비누, 오리 튜브, 역전), 왕관's flights and gold, 축구's second ball and 골든
골, the awards and the winner stage, the three demos. Nothing was cut.

### 14.1 Where the code differs from the text above

| Spec | As built | Why |
|---|---|---|
| 3.2: `P.allAt = G.frame` | `P.allAt` is the card's own frame (`P.t`) when the last present player became ready, checked by `partyAllCheck()` after every 준비 (`partyReadySet`, inside or outside `updateCard`) and after a leaver (`partyDrop`) | the card's end is `max(cardMin, allAt + allIn)` in card frames; a ready set between two frames (the button, a test) must not slip a frame |
| 3.2: the guest's 준비 sound | the guest's own press flips its button (`준비됐어요!`) and its chip at once; the `'ready'` sound comes from the host's echo only | one sound per ready, as the spec's "plays 'ready' (echoed) once" |
| 3.6: the 최종 순위 timeline | `tallyTimes(b)`: a 판's tally pops row k's `+N` at `12 + 10k`, counts a point every 5 f, sorts at 96 (of 168); 최종 순위 pops at `6 + 4k`, a point every 4 f, sorts at 40 (of 96); both scale with the beat's length (`PARTY_FF`) | the spec gave 최종 순위's sort only; 4 rows of bonuses must finish counting before 40 |
| 3.6: the standing before this 판 | `pts - gain`, `wins` minus this 판's 1등; the last-판 tie-break is left out of the "before" order | the place before the previous 판 is not kept anywhere |
| 3.4: my own `탈락!` line | on a guest, the beat `f` ends a live line of its own (`partyView`), so the host's `끝!` shows from the next snapshot | a guest that went out in the last second of 물 never saw `끝!` (party-net caught it) |
| 4.1.1: the warnings | the steps say `물이 차올라요!` / `더 높이!`; `마지막 물결!` / `계속 점프!` is the flood's (the last step keeps `마지막 물결!` only on an arena without a flood) | the flood is the last wave now |
| 4.1.3: `SOAP.life` 480 f | `SOAP.life x k` (the debug fast party's soaps live as much shorter as its schedule) | with 12 s games two soaps were always up and none could spawn |
| 4.1.3: the pickup | the first `canTouch` player in seat order whose box (remote: +`SOAP.slack`) touches the soap's 8x8 box | - |
| 4.1.4: the raft | `raftOn` / `raftBack` / `raftMove` / `drawRaftRing` (new); `kitOf` also gives a raft `KIT_BASE` (besides `perk`), so `newShot` / `hostShot` blow the plain bubble; the duck ring is mirrored by the rafter's facing; `drawSoapRing` draws the held save | `kitOf` is what picks the shot |
| 4.3: goals | no goal is counted once `M.endAt` is set (a golden goal's cheer, a team gone) | a second goal in the cheer could flip the golden goal's winner |
| 4.3: the second ball's tween | `ballView` tweens it only while `kick2` is 0 in both snapshots and no 골! runs; the bursting ball is the one whose kick turned from 0 to a re-drop | - |
| 6.3: `X` | sent only when the multiplier is above 1 | - |
| 7.3: fit | measured (party.js INFO): the 1x card 181 px tall for 물 / 왕관 and 206 px for 축구 (of the 224 px screen, content 177 / 202 px, no scroll); tally / 마지막 판! 113 px; an award 138 px; at 2x and on the 568x320 phone everything fits with the rule line | - |
| 8.1: the demos | 물's animals at 8 px (three tiers in 32 px), 왕관's and 축구's at 16 px with the crown at 8 px and the balls at 16 px; each script a pure function of `f` | three 16 px tiers do not fit in 32 px |
| 9: `CROWN2` | the flights run from `CROWN2.every` while under `MINI.crown.secs` (15 / 30 / 45), gold from `CROWN2.goldAt` | - |
| 10.4: the flood's end | `validate-levels` errs when the flood ends after `secs - 1` (59 s for the 60 s game) | the schedule's flood is 52-59 s |

### 14.2 New code (game.js unless named)

- Constants (section 9) as written, plus `PARTY_FF` (the fast party's frames) and `AWARDS[k].k` (the counter it reads).
- Sequencer: `partyF`, `beatAt`, `partyX`, `partyCardStart`, `partyReadyMe`, `partyReadySet`, `partyAllCheck`, `partyBeat`,
  `partyBeatNext`, `partySkip`, `partyAwards`, `partyAwardGive`, `partyOverlayOn`; `updateCard(ins)` / `updateResult(ins)`.
- Views: `fillParty` (four views), `partyCardView`, `partyResultView`, `partyRow`, `tallyTimes`, `partyTallyTick`,
  `partyAwardView`, `partyLiveTick` (from `syncDOM`), `partyWinOn` / `partyWinFx` / `drawPartyWin`, `drawPartyDemo` with
  `waterDemo` / `crownDemo` / `ballDemo`; `fit()` sets `--pg-px`.
- 물 v2: `waterAt` (surges, flood), `waterF`, `soapY`, `soapSpawn`, `soapTick`, `soapSave`, `waterOut` (raft + 역전),
  `raftOn`, `raftBack`, `raftMove`, `drawSoapRing`, `drawRaftRing`; `riseOf` reads `surges`, `flood`, `soaps`, `revive`.
- 왕관: `crownFly`; 축구: `ballsOf`, `ballStep`, `ballTwo`, `ballApart`, `ballOver`, `ballDrawOne`; `miniOver` calls `over`.
- Wire: `g.pa` `b bt bk R X A B`; `g.mg` 물 `[.., soaps, sh, got, rv]`, 왕관 `[.., gold]`, 축구 `[.., x2, y2, vx2, vy2, kick2,
  gg]`; the body state `pr`; `P` flag 512; `MUSICS[13]` `party`; `NO_ECHO` `tally`, `rank_up`.
- `audio.js`: `mg_title`, `mg_go`, `mg_finish`, `mg_win`, `tally`, `rank_up`, `drumroll`, `award`, the `PARTY` song.
- `sprites.js`: `duck_ring` (16x8, 2 frames; optional - `OPT_SPR`, sized in `sizeOf`).
- `levels.js`: the v2 `rise` of 물 차는 대욕장; `page.html`: the overlay's new parts and views, the `finish` banner.
- Debug (`PG.debug.party`): `ready`, `beat`, `skipBeat`, `awards`, `counts`, `soap`, `soapY`, `soapsOff`, `raft`, `flight`,
  `two`, `ball2`, `golden`, `demo`, `prow`, `mg`, `pa`; `state()` / `card()` / `consts()` / `mini` as in 10.1.

### 14.3 Tests

`src/tests/party.js` (virtual time, 296 checks) covers every item of 10.2; `src/tests/party-net.js` (4 bc frames, real
time, 85 checks) every item of 10.3 (the 축구 part at real lengths, with the host's `two()` / `golden()` instead of
waiting 45 / 60 s; the 역전 through a host-made prison of the rafter's, the shooter-judged claim being battle's own path);
`tools/validate-levels.js` the v2 schedule rules of 10.4; `tools/audio-node-test.js` the new sfx and loop; `final-e2e2`
the overlay's new parts.

### 14.4 Audit before the PR (2026-10-29)

Against sections 3-6 and the diff, every new path read on the host and on a guest:
- **A re-drawn card kept a guest's old 준비.** A leaver on a 축구 card (4 -> 3) draws another game at the same 판
  index, so a guest's `pr` (the index) still said "ready" and the host counted it on the new card at `P.t` 12 - the
  new game's card could start after 2.5 s with nobody having seen it. Now `partyCardStart` notes each remote seat whose
  latest state already carries `pr === P.i` (`P.prOld`); `updateCard` counts it only after a state without it, and the
  guest clears its own `NET.partyReady` when the game at its index changes on the card (`partyView`). party.js checks the
  host side with a fake remote seat.
- **A leaver during a result view** stayed in the host's tally / 마지막 판! / award rows until the next beat (the guests
  rebuild theirs every snapshot): `partyDrop` now refills whatever view `#pg-party` shows. party.js: the tally's rows
  drop to 2 on the next frame.
- **최종 순위's "before" order** left out the last 판's places as a tie-break (as the 판 tally does, 14.1), so two
  players tied on points and 1등 that the last 판 had already split showed a false `▼1` with no bonus at all. The
  awards change only the points: the "before" of 최종 순위 now uses `P.last`. party.js checks it.
- Checked and unchanged: a guest that misses 끝! / the winner stage (its first result snapshot is the tally) shows the
  tally from `guestPhase`; a beat or award change switches the view before `guestPhase`; the winner stage and the tally
  are drawn from synced data only (`P.last`, `bt`); the echoed sounds (`mg_*`, `ready`, `drumroll`, `award`, the games')
  and the local ones (`tally`, `rank_up`, in `NO_ECHO`); the soap / save / raft / 역전 decisions all on the host, a guest
  only drawing them (the water, the surges and the soaps' y pure from the host's clock) and taking its animal back
  through `takeOver` (flag 512); a raft never judged by the water, never caught, never touching (`canTouch`,
  `trappable`), plain bubbles on both sides (`kitOf`); 역전 once per rafter, never from the flood; the flights at exact
  clock frames, gold x2; the second ball only after a running 골! (the clock does not count it), two balls into goals on
  one frame count once each, in 골든 골 only the first (`M.endAt`), a time-up with tied goals starts it only with both
  teams present; `miniOver` runs on the host only; `PARTY_V` 3 through the existing `seatReady` / `seatOld`; the coins'
  paths (`coinPartyRound`, `coinPartyNow` with the bonuses in the place); every new branch in solo / co-op / battle is
  behind `G.party`, `G.mini` or `p.raft`.
- Open, not built: a fresh page (pa 3) in the room of a host whose page is older (pa 2) is let in by that host's own
  gate and would draw 물 from its own v2 schedule (the reverse of 6.1). Every page deploys together, so only a stale
  PWA host meets it; the fix (the host's party version in `R`, the guest showing 새로고침 필요 for the host) is the
  next PR's if friends hit it.

### 14.5 2026-10-29 owner change: last holder wins

The owner, after the polish was merged: "왕관게임 가장 마지막에 들고있는 사람이 이기는걸로 바꿔줘". The lead decided the
details (the owner was told these defaults); the rule is in 4.2's note.
- `MINI_FN.crown.key` = `(M.cr.holder === p.slot ? 1e7 : 0) + held`: the one wearing it at time-up first, then by held
  time; nobody wearing it (flying, free on the floor): by held time for everyone; nobody touched it: all share 1st.
- `CROWN2.goldX` removed (`held += 1` always); the gold crown keeps its tint, banner, sfx and `hurry` music.
- Texts: `MINI.crown.how` / `rule`, `PARTY_TX.gold2` (4.2). No other crown text said 가장 오래 or 2배 (the room's rules
  list has no crown line; the HUD draws digits and sprites only). The card demo already ends with `a` wearing it.
- `PARTY_V` 4 (6.1). Why: nothing on a pa 3 guest computes a crown place (`crownView` mirrors `holder` / `held` /
  `gold`; the result beats, the tally and the awards read `g.pa.P` / `A` / `B`; the winner line rides in `g.bn`), but
  that page's card and demo teach "가장 오래 버티면 1등" and "황금 왕관 2배!" while the host's banner says `끝날 때 쓴 사람이
  1등!` - a kid would play for the wrong goal. The reverse (a pa 4 guest under a stale pa 3 host) is still let in by the
  old host's gate, as in 14.4's open point.
- Tests: party.js (304 checks) - the holder at time-up over a longer holder, a capture 0.5 s before the buzzer (the
  grabber 1st), one 4 frames before it (still flying: by held time), a leaver's free crown (by held time), gold `held`
  +1 a frame, the card texts, the gold banner's sub on one line at 1x / 2x / 568x320; the x2 points helper puts the crown
  back free before time-up. party-net.js (86 checks) - the crafted older guest sends `PARTY_V - 1`; at the 왕관 result
  the 1st on every page is the one the host gave the crown 1 s before time-up, over a longer holder who is 2nd
  everywhere, and the held times agree.
