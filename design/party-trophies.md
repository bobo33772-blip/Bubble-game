# 뽀득뽀득 목욕탕: 파티 트로피 (party trophies) v1 — design spec

Status: **built** on `feat/party-trophies` (worktree `bogeul-ptro`, from `origin/main` d7e065a = PR #23, 파티 다듬기,
merged) with the owner's decision below - **section 14 is the as-built record** (what differs from the body, tests). It reverses design/party.md section 0 "Reward" and 8.4 "No trophies": a party room can now stake
trophies like a battle, and the pot is split by the final party standing. Everything else of trophies.md (the store, the
holds, 안 걸고 참여, 꼴등 빼고, the cloud) and of the party (design/party.md 18, design/party-polish.md 14) is reused as built.
Code is referenced by function name, never by line number. Every function named here exists on main unless it is marked
**new**. Every number in the tables of section 2 was computed with a simulation of `troPartyTable` (2.1), with 200,000
random tables for the bounds: the pot is always paid out exactly, the most a player can lose is stake + 6 and the most it
can win is +150 (a 기권승) or +116 (a finished party). **Section 13** is the adversarial review against the code
(2026-10-29): what it changed in this spec, and every `NET.mode` read on main with what it needs.

The owner asked (2026-10-29): `파티에도 트로피 걸게해주고 123등 트로피 차등으로 배분해줘` - let a party bet trophies too, and
share them out in steps for 1st / 2nd / 3rd instead of the battle's winner-takes-the-pot.

> **Owner decision (2026-10-30, open question 12.1; it overrides the body):** a party at **안 걸기 is NOT a 트로피 경기** -
> it stays exactly as today (coins only: no hold, no place points, no +5, no `tro`, 내 기록 untouched). Only a party with
> a stake (5 / 10 / 20 / 50) is a 트로피 경기 with the place points, the pot split and the +5. Consequences to carry
> through the build: `troPartyOn()` (or its equivalent) is true only for a party room with `stakeNow() > 0`; a switch
> between 파티 at 안 걸기 and co-op / battle un-readies nobody (as today); the stake-0 rows of the tables in section 2, the
> stake-0 UI lines of section 7 (e.g. `트로피 경기: 최종 1등 +16 ...` at q 0, stake 0) and the stake-0 tests are dropped
> or turned into "nothing changes" checks; risk 11.1 shrinks to "a party with a stake costs trophies"; the guest summary
> at 안 걸기 says nothing about trophies (as today). The 2-minute void (`PARTY_TRO_MINF`) and everything else apply only
> to staked parties. Also in flight on other branches: fix/crown-last (왕관: the holder at time-up wins, `PARTY_V` 4) and
> feat/party-games (3 new games, its own `PARTY_V` bump, games of 40-57 s - re-check `PARTY_TRO_MINF` against a 3판
> party of new games when the two meet). Merge `origin/main` before building; `PARTY_V` = main's value + 1.

---

## 0. Decisions in one table

| Question | Decision |
|---|---|
| What changes | A party room is a **트로피 경기** like a battle room: the same `트로피 걸기` row (안 걸기 / 5 / 10 / 20 / 50, the host picks, default 안 걸기), the same 안 걸고 참여, the same practice rules (`troPractice`: tabs of one browser, one device's store). Coins stay exactly as today, paid in addition. |
| One stake for the whole party | Held once, at the **first 판's 시작!** (stake + 6, only the stake in 견습), settled once at the **final standing** (the podium, after the awards). Later 판 hold nothing more. Leaving during the first card / 3-2-1 is free; from the first 시작! to the podium, leaving is last place. |
| Place points | The battle's `BASE` for n = players at the first 시작!: 2 players +12 / −6; 3 players +15 / +5 / −6; 4 players +16 / +8 / +2 / −6, by the **final** place (`partyStandings`). Ties average their places' points (rounded); 견습 never loses by place. |
| The pot | All stakes put in, split by final place (**new** `PARTY_SHARE`): 4 players **50% / 30% / 20% / 0**; 3 players **60% / 30% / 10%**; 2 players **100% / 0**. The split runs over the stakers' own order (안 걸고 참여: nothing in, nothing out). Floors, then the best staker takes what is left; a tie splits its places' shares evenly, the remainder one each in seat order, rotated by the game id (2.1). The pot is never created or lost. |
| 오늘 트로피 보너스 | **+5 once per finished real party** (not per 판), 꼴등 빼고, from the same daily pool (`DAY_CAP` 40). Real = the coins' own test, over the whole party: 2+ finishers, at least 5 bubbles I blew and at least 60 s of play (`COIN.gameShots`, `COIN.minF`), read from that party's own counters (`CO.pa`). |
| 기권승 / everyone left | As a battle: the one left gets **the pot only** (no base, no +5), and only when someone left on purpose (`gg`); nobody gave up → void, refund. Players lost between 판 are leavers like in a battle (their `gg` or their dropped link decides). |
| Too short | **New**: a finished party whose **first 시작! → final standing took under 2 minutes** (`PARTY_TRO_MINF` 7200 host frames, the shortest battle's clock) is void: every hold refunded at once. The span counts the cards, 3-2-1s and result beats after the first 시작! (real minutes of the match), not only the playing frames. Today only 3 players' 물 · 왕관 · 물 with two 물 drowned on purpose can be that short; it keeps a party at or under a battle's pace (5.1) and gives guests the battle's 105 s check against a hostile host (5.3). |
| Leavers / the host | A leaver mid-party is settled as a battle leaver (나가기 = `gg` + forfeit; a dropped link while watching = refund). The host leaving = `host_left` → refund for everyone; the host's 방으로 before the podium = the host forfeits, guests are refunded after 15 s. The paths are the battle's, checked in 3.3. |
| Network | No new message type, `NET_V` stays 4. **`PARTY_V` 3 → 4** (a pa-3 page is never ready in a party room). New fields: `R.pv` (the host's party version, party rooms), `rd.md` (the mode the guest readied for), `tro.v` (a short party: refund now). |
| Cloud | `firebase/firestore.rules` **unchanged**. A tab never pushes while its own hold is open (`clCanPush`: `!troOpenHere()`), so the settle is one write of net + 5 (≤ +121 finished, ≤ +150 기권승); ≤ +177 / +206 only if another tab of the same browser pushed the held count meanwhile. All ≤ 250; `clStep` splits a rise the time rule would refuse. `de` stays ≤ 40, `g` +1 a party. |
| 내 기록 | Parties count in the same `w` / `g` (one game per party); its row `배틀` reads `배틀·파티`. No store or cloud change. |
| Apps in Toss | Trophies stay off there: every party path goes through `stakeNow` / `troHostGo` / `troGuestGo` / `troEscrow` / `troApply` / `troResultIn`, which the Toss build (feat/toss, not on main yet) turns off with `AIT.on`; `troPartyResult` and `troPartyOn()` get their own `AIT.on` test, and no party trophy text shows there (risk 4). |

---

## 1. Ground truth from the code (what this builds on)

| Thing | Code on main | Consequence |
|---|---|---|
| Stake | `stakeNow() = NET.mode === 'battle' ? NET.opts.bet \| 0 : 0`; `canAfford`, `canStart`, `troSeatFree`, `R.o[4]`, `R.f`, the badges and the room messages all read it. | `stakeNow` becomes `pvp() ? …` (battle or party): most of the room follows by itself. |
| Options box | `buildOpts`: the 트로피 걸기 row is `data-for 'b'`; the 판 수 row (`'p'`) is the last row; `syncOpts` hides by mode. | The row becomes `'bp'`; it already sits before 판 수. |
| Hold | `troHostGo` returns for `G.party` (and is called only from the battle branch of `updateCountdown`'s 시작! frame; the party branch calls `coinGo(); miniStart();`). Guests: `guestHostIn` runs `troGuestGo` / `troWait` only for `g.m === 'b'`. `troEscrow` is once per match id (`TRO.seen`). | One game id = one party (all 판 share `NET.gid`), so `mid = NET.ms + '.' + gid` is the party's id: holding "once per mid" is exactly "once per party". The host must not rebuild `TRO.match` at the 2nd 판's 시작! (it would drop `gg` / `st`). |
| Result | `troHostResult` from `endBattle` only; a party never calls `endBattle`; `partyFinal(walk)` builds `G.podium = {order, t, te, pl}` from `partyStandings`, then `coinPartyNow`, then `showOverlay('podium')`. | **New** `troPartyResult(walk)` in `partyFinal`, after `G.podium`, before `showOverlay`. Places come from `G.podium.pl` (shared places repeat). |
| The +5 | `troApply(…, real)`: +`TRO_PLAY` unless a 기권승 (one row) or my place is the highest of 2+ rows (`last`); `troReal` reads `CO.bshots` (per 판 in a party) and the battle clock. | A party needs its own real test: that party's `CO.pa` (`shots`: all my blows, closed per 판 by `coinPartyClose`; `pf`: the playing frames per 판). `coinPartyStart` replaces `CO.pa` at the next party's first snapshot, so a guest keeps a reference to its party's object with its hold (`TRO.live`, 3.2). `troApply` itself is unchanged. |
| Min time | `troGuestGo` holds with `min = NET.opts.time * 60000 − TRO_SLACK_MS` (the battle clock - for a party today that would be the room's unused battle time option); `troApply` refuses a guest's result before it. | A party gets `PARTY_TRO_MINF / 60 * 1000 − TRO_SLACK_MS` = 105 s (5.3). |
| Leavers | `hostDropPlayer` → `partyDrop(slot)`; < 2 left → `partyFinal(true)`. `gg` (`troGg`, `troSessionEnd('left')`, hidden tab) and `st` are matched to `TRO.match.mid`. | A leaver is missing from `G.podium.order`; `M.slots` / `M.gg` say whether its stake is in the pot, as in a battle. |
| Host leaving | `netStatusIn('closed', 'host_left')` → `netLeave(…, 'host_left')` → `netClose('host_left')` → `troSessionEnd('host_left')` (refund), then `idleWorld` (clears `G.party`). Host 방으로: `netToRoom` forfeits an open hold when `G.mode !== 'podium'`; guests: `guestToRoom` → `troWait`. Tab close: `pagehide` → `troSessionEnd('left')`. | All mode-agnostic: a party reaches them unchanged (3.3). |
| Podium | `troPodiumUI` returns into `partyPodiumUI` for `G.party` **before** it builds the practice `TRO.pod` (so a practice party's sr line has no trophy part today); `partyPodiumUI` sets the tag `3판`, **hides `#pg-podium-bonus`** and **always enables 파티 한 번 더**. `troPodiumTag` would write `연습` / `기권승` / `무승부` over the tag; `troPodBonus` fills its line only after `upDone`, which `troPodiumTick` sets only when `TRO.pod.rows` is not empty; `troPodiumTick` flies cups to whoever took a share. `fillPodium`'s sr line reads `TRO.pod` and knows `'prac'` only. | The party branch gains the trophy pieces (7.3) with a party tag rule and a no-rows bonus line; cups fly to every block with a gain; `fillPodium` gains the `'short'` text. |
| Room rules | `partyRules(q)` lists `PARTY_TX.noTro` `트로피는 걸지 않아요`; the battle's trophy lines are `troRulesLine`, `troFreeLine`, the +5 line and the 견습 line. | The party branch replaces `noTro` with its own trophy lines (7.1). |
| Versions | `PARTY_V = 3`; `seatReady` / `seatOld` keep a page with a lower `hi.pa` out of a party room; nothing tells a guest the **host's** party version (party-polish 14.4, open). | `PARTY_V` 4, and **new** `R.pv` so a new guest never holds for an older host's party. |
| Cloud | firestore.rules: a slot write rises `t` by ≤ 250 and `rise × 500 ≤ 10000 + dt`; `g` +0..20; `w` ≤ the rise of `g`; `ko` +0..400; `de` 0..40. `clStep` splits a bigger rise. `clCanPush` refuses while this tab has an open hold (`troOpenHere`), and sign-in / sign-out are refused while `S.esc` has a hold (`clMsg('held')`). | Section 6: no change. The hold is never written; a party is one no-push window of 2-7 minutes. |
| 내 기록 | `fillRec`: `S.w + '승 / ' + S.g + '판'` under `<dt>배틀</dt>`. | Shared counters; the label changes. |

---

## 2. The rules

### 2.1 The table (`troPartyTable`, **new**, host only, pure)

```js
  // 파티 트로피 (design/party-trophies.md): top constants block, next to BASE
  const PARTY_SHARE = { 2: [100, 0], 3: [60, 30, 10], 4: [50, 30, 20, 0] };  // % of the pot by place (stakers' order)
  const PARTY_TRO_V = 4;        // the PARTY_V of the release that first ranks parties (R.pv); 5 if feat/party-games lands first
  const PARTY_TRO_MINF = 7200;  // a finished party pays only when its first 시작! -> final standing took this many host
                                // frames (G.frame: cards, 3-2-1s and beats included; 2 min = the shortest battle's clock)

  // host: one row [slot, place, base, share, 0, st] per finisher of a party. fin = the players at the podium, best first
  // (G.podium.order), each {slot, pl, p, z}: pl its podium place (G.podium.pl: shared places repeat), p 견습 at the first
  // 시작!, z 안 걸고 참여. n, s, gl, gz as troTable (n = players at the first 시작!). The pot (only the stakes put in) is split
  // by PARTY_SHARE[n] over the STAKERS' order: the k-th staker's place (k >= 2) gets floor(pot x share / 100), the best
  // staker the rest - the floors and the places no staker filled - so the pot is paid out exactly. A tie group adds up the
  // amounts of the staker places it covers and splits them evenly; the remainder goes one each to its stakers in seat
  // order, starting at (rot mod their count) - rot = the game id, so it turns from party to party (never always the
  // host). Place points: BASE[n] by place as a battle; a tie group averages its places' (rounded), 견습 never below 0.
  // 무승부 (everyone tied): base 0, the pot split among the stakers. A 기권승 / void: exactly as troTable. r[4] (KOs) is
  // 0: a party has no 뽀득 KO
  function troPartyTable(n, s, fin, gl, gz, rot) {
    const m = fin.length, B = BASE[n], W = PARTY_SHARE[n], st = (r) => (s > 0 && r.z ? 0 : 1);
    const K = fin.filter(st).length, pot = s * (K + Math.max(0, gl - (gz | 0)));
    if (!B || !m || (m === 1 && !gl)) return [];
    if (m === 1) return [[fin[0].slot, 1, 0, st(fin[0]) ? pot : 0, 0, st(fin[0])]];     // 기권승: the pot only
    const amt = []; let rest = pot;
    for (let q = 1; q < K; q++) { amt[q] = Math.floor(pot * (W[q] || 0) / 100); rest -= amt[q]; }
    if (K) amt[0] = rest;                                                               // (the best staker: the rest)
    const draw = fin.every((r) => r.pl === fin[0].pl), out = []; let c = 0;
    for (let i = 0; i < m;) {
      let j = i; while (j + 1 < m && fin[j + 1].pl === fin[i].pl) j++;
      let b = 0; for (let q = i; q <= j; q++) b += B[q];
      const k = j - i + 1, bb = draw ? 0 : Math.round(b / k), stk = fin.slice(i, j + 1).filter(st);
      let g = 0; for (let q = c; q < c + stk.length; q++) g += amt[q] | 0;
      c += stk.length;
      const each = stk.length ? Math.floor(g / stk.length) : 0, r = g - each * stk.length, r0 = stk.length ? (rot | 0) % stk.length : 0;
      for (let q = i; q <= j; q++) {
        const f = fin[q], si = stk.indexOf(f), extra = si >= 0 && (si - r0 + stk.length) % stk.length < r ? 1 : 0;
        out.push([f.slot, draw ? 1 : i + 1, f.p && bb < 0 ? 0 : bb, si >= 0 ? each + extra : 0, 0, st(f)]);
      }
      i = j + 1;
    }
    return out;
  }
```

A row becomes my change exactly as a battle row: **net = base + share − the stake I put in** (`troApply`, unchanged: my
players and stake from my own hold, `row[5] === 0` pays no stake, the share capped at stake × n).

- **Stakes the table never pays out** (lost, never created - as in a battle): a `gg` leaver's when no finisher put a
  stake in (everyone left played without it); and a leaver that forfeits on its own page (away when its link dropped)
  while its `gg` never reached the host (the table counts it as a dropped link: not in the pot).
- **Why over the stakers' order**: 안 걸고 참여 means nothing in, nothing out. A free 1st place takes its place points and no
  share; the stakers behind it take the shares as if they were 1st, 2nd, 3rd among themselves. With fewer staking
  finishers than places (leavers, free seats), the unfilled places' shares go to the best staker.

### 2.2 Results (net = base + share − stake; the +5 is not in it)

**Distinct places** (everyone puts the stake in):

| Stake | 2 players | 3 players | 4 players |
|---|---|---|---|
| 0 | +12 / −6 | +15 / +5 / −6 | +16 / +8 / +2 / −6 |
| 5 | +17 / −11 | +20 / +4 / −10 | +21 / +9 / +1 / −11 |
| 10 | +22 / −16 | +23 / +4 / −13 | +26 / +10 / 0 / −16 |
| 20 | +32 / −26 | +31 / +3 / −20 | +36 / +12 / −2 / −26 |
| 50 | +62 / −56 | +55 / 0 / −41 | +66 / +18 / −8 / −56 |

The shares inside it (the pot, then 1st / 2nd / 3rd / 4th): 4 players at 10: 40 → 20 / 12 / 8 / 0; at 5: 20 → 10 / 6 / 4 / 0;
at 50: 200 → 100 / 60 / 40 / 0. 3 players at 10: 30 → 18 / 9 / 3; at 5: 15 → **10** / 4 / 1 (floors of 4.5 and 1.5: the
1st takes the rest). 2 players: the whole pot to 1st, as a 1v1 battle - the 2-player column equals the battle's.

Next to a battle (4 players, stake 10): battle +46 / −2 / −8 / −16, party +26 / +10 / 0 / −16. The last place loses the
same (its hold), 2nd now wins, 3rd breaks even.

**Ties** (the common ones; `pl` from `partyStandings`: equal points, 1등 count and last-판 place):

| Case | Stake 0 | Stake 5 | Stake 10 | Stake 50 |
|---|---|---|---|---|
| 4p, 1st = 2nd | +12 / +12 / +2 / −6 | +15 / +15 / +1 / −11 | +18 / +18 / 0 / −16 | +42 / +42 / −8 / −56 |
| 4p, 2nd = 3rd | +16 / +5 / +5 / −6 | +21 / +5 / +5 / −11 | +26 / +5 / +5 / −16 | +66 / +5 / +5 / −56 |
| 4p, 3rd = 4th | +16 / +8 / −2 / −2 | +21 / +9 / −5 / −5 | +26 / +10 / −8 / −8 | +66 / +18 / −32 / −32 |
| 4p, 1st = 2nd = 3rd | +9 / +9 / +9 / −6 | +11 / +11 / +10 / −11 | +13 / +12 / +12 / −16 | +26 / +26 / +25 / −56 |
| 4p, 1st = 2nd, 3rd = 4th | +12 / +12 / −2 / −2 | +15 / +15 / −5 / −5 | +18 / +18 / −8 / −8 | +42 / +42 / −32 / −32 |
| 3p, 1st = 2nd | +10 / +10 / −6 | +12 / +12 / −10 | +14 / +13 / −13 | +28 / +27 / −41 |
| 3p, 2nd = 3rd | +15 / 0 / 0 | +20 / −2 / −3 | +23 / −4 / −4 | +55 / −20 / −20 |
| everyone tied (무승부) | 0 each | 0 each | 0 each | 0 each |

- The odd ones are the remainder: 4p at 10, 1st = 2nd = 3rd share 20 + 12 + 8 = 40 → 14 / 13 / 13; 3p at 10, 1st = 2nd share
  18 + 9 = 27 → 14 / 13. The extra trophy goes to the tie's stakers in seat order from (game id mod their count): the table
  shows game id 0 (the first seat of the tie); the same tie in the next party gives it to the next seat.
- 3p, 2nd = 3rd at stake 0: (5 − 6) / 2 rounds to 0, as the battle (trophies.md 3.1).

**Leavers and 안 걸고 참여** (stake 10; "gg" = left on purpose: its stake is in the pot):

| Case | Result |
|---|---|
| 4 at the hold, one left with gg (3 finish) | +26 / +10 / 0, the leaver −16 (shares 20 / 12 / 8 of 40) |
| 4 at the hold, one link dropped (no gg) | +21 / +7 / −2 (pot 30: 15 / 9 / 6); the dropped one refunded or forfeited on its own page |
| 4 at the hold, two left with gg (2 finish) | +34 / +10 (pot 40: 28 / 12 - the 3rd place's 20% goes to the best staker) |
| 3 at the hold, one left with gg | +26 / +4 (pot 30: 21 / 9) |
| 4 at the hold, three left with gg (기권승) | +30 (the pot 40 − 10) |
| 4 at the hold, three left, one of them with gg (기권승) | +10 (the pot 20 − 10) |
| Everyone else's link dropped (no gg) | void: the host is refunded |
| 2 at the hold, the other left with gg | +10 (기권승) |
| 4p, the 1st without the stake (pot 30) | +16 / +13 / +1 / −10 (the stakers take 15 / 9 / 6 as 1st / 2nd / 3rd among themselves) |
| 4p, the 4th without the stake | +21 / +7 / −2 / −6 |
| 4p, 1st and 2nd without it (pot 20) | +16 / +8 / +6 / −10 |
| 4p, tie for 1st, one of the two without it | +12 / +17 / +1 / −10 (the staker of the tie takes the 1st staker's 15) |
| 2p, either one without it | +12 / −6 (one staker gets its own stake back) |

**Bounds** (simulated over 200,000 random tables): Σ share = pot whenever a staker finished; every net ≥ −(stake + 6);
the best non-walkover net is **+116** (4 at the hold, stake 50: one staker and one free finisher, two gg leavers - the
staker 1st takes the pot of 150); a 기권승 at most **+150**. Below the battle's +166 / +150.

### 2.3 오늘 트로피 보너스, 기권승, void

- **The +5** (`TRO_PLAY`), once per party, through `troApply`'s `real` argument (unchanged code): a party is real when it
  has 2+ finishers, I blew at least `COIN.gameShots` (5) bubbles in the whole party and the party had at least
  `COIN.minF` (60 s) of play - the battle's `troReal` test, read from that party's own coin counters (`A.shots`, closed per
  판 by `coinPartyClose`, and `A.pf`; the fast debug party waives the play time as `coinPartyNow` does). The play-time
  test is not implied by the void floor (that counts the cards and beats too) and matters once feat/party-games adds
  45 s games. **꼴등 빼고** as built: the highest place of the rows, every member of a tie for it, gets none; a 무승부 has no
  last. Practice, a refund, a void party, a leaver and a replayed result never pay it.
- **기권승**: fewer than 2 players left at any point (`partyDrop` → `partyFinal(true)`): the one left (always the host - a
  guest's session ends with the host) gets the pot only when at least one leaver sent `gg`, no base, no +5; otherwise the
  party is void and the host's hold is refunded. Players who left in earlier 판 count exactly like players who left in the
  last one: each one's `gg` (or its dropped link) decides whether its stake is in the pot.
- **Too short (void, new)**: the host notes the frame of the first 시작! in `TRO.match.f0 = G.frame` (`troHostGo`). A
  finished party (`partyFinal(false)`) with `G.frame - M.f0 < PARTY_TRO_MINF` pays nothing: the host refunds its own hold
  and sends `{t:'tro', m, n, s, r: [], v: 1}`; each guest refunds its hold of that party at once. The podium says why
  (7.3). `G.frame` runs on every host frame of the match (card, countdown, playing, result) and stops with a hidden host
  tab, so the span is the match's own length on the host's clock - the same clock and the same 2 minutes a battle's
  hold-to-podium has. Today only one plan can end under it: 3 players' 물 · 왕관 · 물 (or a 4-player party re-drawn to it
  after a leaver) with the two 물 together under about 40 s when the host skips every beat (about 20 s when the beats
  run); the first 물 step drowns the floor at 7 s, so only players who drown on purpose get there. 2 or 4 players always
  play 왕관 and 축구 (60 s each) in a 3판; 3 players' 왕관 · 물 · 왕관 and every 5판 have two 60 s games.
- (The first draft counted only the playing frames. That voids honest parties of short games: with feat/party-games, a
  3판 of 펑 (45 s) + 물 + 바나나우유 (8 rounds, often under a minute) would have under 2 minutes of play most of the time,
  while its cards and beats make it as long as a battle. Per minute is about the friends' real time, so the span is the
  right measure; it is also one stamp instead of a sum in `partyResult`.)

### 2.4 What stays

Coins: `coinParty` unchanged, paid in addition. 견습 protection twice (in the table from the counts at the first 시작!, and
by each page from its own hold). Practice (`NET.q !== 0`) holds nothing. The points per 판, the x2 last 판, the 보너스상 and
the tie-breaks decide the final standing exactly as today; trophies only read it.

---

## 3. Holding and settling

### 3.1 Hold at the first 판's 시작!

- **Host**: `updateCountdown`'s party branch (`else if (G.party && G.mini) {…}`) also calls `troHostGo()`. `troHostGo` drops
  its `G.party` return (keeping every other test of that line - and feat/toss's `AIT.on`) and gains, right after `mid` is
  known and before anything else, `if (TRO.match && TRO.match.mid === mid) return;` (a party's later 판: already held -
  `TRO.match` keeps its `gg`, `st` and `f0`; `TRO.seen` would stop a second hold anyway, but a rebuilt `TRO.match` would
  drop the `gg` / `st` of the earlier 판). `TRO.match` gains `f0: G.frame`. n = `G.players.length` and the 견습 flags are
  taken at that frame, as for a battle (a leaver during the first card or 3-2-1 is not counted).
- **Guest**: `guestHostIn`'s trophy line becomes
  `if ((g.m === 'b' || (g.m === 'p' && NET.pv >= PARTY_TRO_V)) && NET.q === 0 && NET.ms) { if (g.ph === 'p') troGuestGo(id, g.m === 'p'); … }`.
  The party's first `'p'` snapshot is its first 시작!; later 판's `'p'` snapshots find the mid in `TRO.seen`; phase `'d'`
  is only the final podium (`PH_CODE`: card `'a'`, countdown `'c'`, result `'r'`, podium `'d'`). It runs before
  `coinPartyGuest` on the same snapshot, as today.
- `troGuestGo(id, party)` (**new** argument: the snapshot's own mode, not `G.party`): `min = party ? PARTY_TRO_MINF / 60 *
  1000 − TRO_SLACK_MS : NET.opts.time * 60000 − TRO_SLACK_MS` (105 s), the consent test also checks the mode:
  `if (s > 0 && (s !== TRO.agreed || NET.mode !== TRO.agreedM)) return;`, and after a hold `if (party)
  TRO.live.get(mid).pa = CO.pa;` (that party's coin counters, for its +5: 3.2). Everything else (안 걸고 참여, `st`, `gg`
  when hidden) is the battle's.

### 3.2 Settle at the final standing (`troPartyResult(walk)`, **new**, host)

```js
  // host, in partyFinal after G.podium is set: the table over the final standing; void (refund at once) when nobody gave
  // up in a walkover, or when a finished party's first 시작! -> now took under PARTY_TRO_MINF host frames (cards and
  // beats included); else my row and the reliable 'tro'
  function troPartyResult(walk) {
    const M = TRO.match; TRO.match = null;
    if (!M || !G.online || G.role !== 'host' || M.mid !== NET.ms + '.' + NET.gid || !G.podium) return;   // (none before the first 시작!; feat/toss: AIT.on returns here too)
    const z = (sl) => (M.s > 0 && !M.st[sl] ? 1 : 0), pd = G.podium;
    const fin = pd.order.map((sl, i) => ({ slot: sl, pl: pd.pl[i] || i + 1, p: M.p[sl] | 0, z: z(sl) }));
    const left = M.slots.filter((sl) => !fin.some((f) => f.slot === sl) && M.gg.has(sl));
    const short = !walk && G.frame - M.f0 < troPartyMinF();
    const rows = short ? [] : troPartyTable(M.n, M.s, fin, left.length, left.filter(z).length, NET.gid);
    if (!rows.length) {
      troClose(M.mid, 'refund', short ? 'short' : 'void');
      if (short && NET.sess) NET.sess.send('*', { t: 'tro', m: M.mid, n: M.n, s: M.s, r: [], v: 1 });
      troPodium(M.mid, [], M.n, M.s, null, short ? 'short' : 'void'); return;
    }
    const res = troApply(M.mid, rows, 0, true, troPartyReal(CO.pa, fin.length));
    if (NET.sess) NET.sess.send('*', { t: 'tro', m: M.mid, n: M.n, s: M.s, r: rows });
    TRO.lastRes = { mid: M.mid, s: M.s };            // (the 파티 한 번 더 gate waits for each guest's 'cup')
    troPodium(M.mid, rows, M.n, M.s, res);
  }
  // the +5's real party (troReal for a party): 2+ finishers, >= COIN.gameShots of my blows and >= COIN.minF frames of play
  // over the whole party - A is that party's CO.pa (closed per 판; the 판 still open counts while A is still the current
  // one); the fast debug party waives the play time, as coinPartyNow does. Read only: never closes a 판 itself
  function troPartyReal(A, nf) {
    if (!A || nf < 2) return false;
    const open = A === CO.pa && A.go > A.seen ? CO.bshots : 0, pf = A.pf.reduce((s, f) => s + (f | 0), 0);
    return A.shots + open >= COIN.gameShots && (PARTY_FAST || pf >= COIN.minF);
  }
```

- No change in `partyResult` (the first draft summed playing frames there; the span needs only `M.f0`).
- `troPartyMinF()` is the debug override when one is set (9.1), else 0 in the debug fast party (`PARTY_FAST`: 12 s games,
  as `coinPartyNow` skips its play-time gate there), else `PARTY_TRO_MINF`.
- **Guest** (`troResultIn`, after feat/toss's `AIT.on` return): a party is recognised by **its own hold**, not by
  `G.party` (which `idleWorld` clears once the guest is back in the room) nor by `CO.pa.gid` (a quick 파티 한 번 더 - stake
  0 opens the gate at once - replaces `CO.pa` at the next party's first snapshot, while a reliable `tro` can still be on
  its way; trophies.md 12 "A result arrives after the next match began"): `const L = TRO.live.get(mid), A = L && L.pa`.
  Then `real = A ? troPartyReal(A, rows.length) : troReal(rows.length, 0)`. `troResultIn` never calls
  `coinPartyClose` (it would close a 판 of the next party): the 판 still open is read through `open` above.
- **`v: 1`** (a short party): `if (m.v === 1 && !rows.length) { if (A) {…} return; }` - inside, `troClose(mid,
  'refund', 'short')` (this tab's hold of that party only: `TRO.live` holds this tab's), then the display under the existing replay guard
  (`if (!P || P.t0 < 0) troPodium(mid, [], …, null, 'short')`), and return (`troClose` already sends the `cup`). A
  `v: 1` for a mid with no party hold of mine (a battle, one already applied, a replay) changes nothing. Everything else
  (apply once, not before `min`, `cup` reply) is the battle's.

### 3.3 How a party's hold ends (the battle's table, trophies.md 5.4, read for a party)

| Event | My hold | Path (checked on main) |
|---|---|---|
| I leave before the first 시작! (its card, its 3-2-1) | nothing held | - |
| The final podium, a result for me | applied once | `troPartyResult` / `troResultIn` → `troApply` |
| 나가기 / 로비로 / closing the tab, from the first 시작! to the podium (a 판, a card, a result beat) | forfeit after `gg`: last place, my stake into the pot | `homeOrRoom` → `netLeave('')` → `netClose('left')` → `troSessionEnd('left')`; `pagehide` → the same |
| My link drops while I watch | refund; my stake not in the pot | `netStatusIn('closed', 'lost')` → `netClose('lost')`, `!troAway()` |
| My link drops while away (hidden tab, switched apps) | forfeit (`gg` went out at hidden) | the same, `troAway()` |
| The host leaves (tab close, F5) or its session closes | refund | `net.js` `close('host_left')` → `netStatusIn` → `netLeave(…, 'host_left')` → `netClose('host_left')` → `troSessionEnd('host_left')`; then `idleWorld` clears `G.party` |
| The host's own link dies | guests: refund (lost while watching); host: every guest drops without `gg` → `partyFinal(true)` → void → refund | `partyDrop` → `partyFinal(true)` → `troPartyResult(true)` → `troPartyTable` `[]` |
| The host's 방으로 before the podium (any party phase) | host: forfeit (its confirm says `· 내 트로피 -16`); guests: `'wait'` → refund after 15 s | `netToRoom`: `G.mode !== 'podium'` covers `'card'`, `'countdown'`, `'playing'`, `'result'`; guests `guestToRoom` → `troWait` |
| A hot reload | refund | `stopEngine` → `netClose('reload')` |
| Under 2 players left | the one left: 기권승 (pot only) if a leaver sent `gg`, else void → refund | 2.3 |
| A finished party whose first 시작! → final standing took under 2 minutes | refund at once (`tro.v`) | 2.3 |
| No result 15 s after my podium | refund | `troWait` on the `'d'` snapshot |
| My tab hidden between 판 (switched apps), back before the end | nothing: a finisher with a row | `visibilitychange` → `troGg(1)`, back → `troGg(0)`; both match the party's mid, which `TRO.match` keeps across 판 |
| My tab reloaded (F5) between 판 | forfeit: last place, my stake in the pot | hidden first (`gg` on), then `pagehide` → `troSessionEnd('left')`; the session is locked, so the new page cannot come back in |
| A quick 파티 한 번 더 (stake 0: the gate opens at once) before my `tro` arrived | the old hold is `'wait'` from `guestBegin`; the `tro` still applies within 15 s with the old party's +5 test (`TRO.live`'s `pa`) | 3.2 |

Nothing in the party changes these paths; the only new trophy code on them is the guest's `g.m === 'p'` gate (3.1) and
`troPartyResult` in `partyFinal`. Checked on main for the host leaving: `net.js` closes a guest with `'host_left'` on the
host's `bye` or when its peer is gone (`close('host_left')`), which reaches `netStatusIn` → `netLeave` → `netClose` →
`troSessionEnd('host_left')` (refund) whatever the mode; `partyDrop` returns at the podium, and `hostDropPlayer` takes the
party branch before the battle's `endBattle` test. `troStale` (15 min) still covers a crashed tab: a 5판 party is about
6.5 minutes.

---

## 4. Network (`NET_V` stays 4)

| Where | New | Validation / meaning |
|---|---|---|
| `hi` | `pa: 4` (`PARTY_V` 3 → 4) | unchanged code: in a party room a seat with `pa < 4` is never ready (`seatReady`), shows `새로고침 필요` (`seatOld`, `R.u`). party-net's crafted older guest sends `pa: 3`. |
| `R` (party rooms, room and game phase) | `pv: PARTY_V` | guest: `NET.pv = R.m === 'p' ? nInt(R.pv, 0, 99, 0) : 0` (and 0 in `netAttach`). `R` rides in every snapshot (`netSnapshot` caches `NET.R`), and `guestHostIn` reads it before `g`, so the gate is current on the very snapshot it judges. A party is ranked for my trophies only with `NET.pv >= PARTY_TRO_V`: an older host's party (no `pv`; its `R.o[4]` is 0 there, its `stakeNow` being battle-only) holds nothing for me (it would never send a result - a 6-trophy hold refunded after the podium, and wrong trophy lines). +7 bytes. |
| `R.o[4]` | the stake now also in a party room | unchanged reads (`bet`); an older guest is gated out anyway. |
| `rd` | `md: 'b' \| 'p' \| 'c'` (the mode the guest saw) | host: a staked ready also needs `!('md' in m) ? NET.mode === 'battle' : m.md === modeCode()` - an older page's staked ready is accepted in a battle room only (in a party room `seatReady` refuses it anyway). Closes the race of a battle ready landing after a switch to a staked party. |
| `tro` | `v: 1` with `r: []` | a party too short to count: guest refunds this tab's party hold of `m` now (none: ignored - a battle hold, an applied one, a replay). A hostile host could only refund me early. |
| `tro` rows | the battle's 6 elements, `r[4]` 0 | unchanged `troApply` / `troPodium`. |
| `gg`, `st`, `cup` | - | unchanged; matched to `TRO.match.mid`, which lives from the first 시작! to the podium. |

**Consent across modes.** Ready means ready for that stake **in that mode**: `TRO.agreedM` (**new**, beside
`TRO.agreed`) is set in `netReady` and reset with it. On the host, `netSetOpts` un-readies every guest when the mode
changes while `stakeNow() > 0` (the stake test `s0` alone no longer catches it: battle and party share `NET.opts.bet`).
On a guest, `guestRoom`'s consent line also fires on `NET.ready && stakeNow() > 0 && NET.mode !== TRO.agreedM`, with its
own 4 s message (7.1). At 안 걸기 a switch needs no new ready (a battle's 안 걸기 is not consent-gated either): a guest ready
in a co-op room stays ready when the host switches to 파티 at 안 걸기, exactly as co-op → 배틀 does today (open question 1
decides whether a party at 안 걸기 is a 트로피 경기 at all).

**Old pages.**

| Host | Guest | What happens |
|---|---|---|
| new (pa 4) | pa 3 page | never ready in a party room (`새로고침 필요`), as party-polish 6.1. Battle / co-op unchanged. The bump is required, not cosmetic: a pa 3 page holds nothing in a party (`g.m === 'b'` only) but has no `r.z`, so `troHostGo` would count its stake in the pot when its count covers it (`st = !r.z && t >= s`) - a stake nobody paid, shared out by place, and its place loss never taken. |
| pa 3 page | new | no `R.pv`: the party is unranked for the new guest (no hold, no lines), as today. |
| new | new | the party trophies. |

---

## 5. Anti-farm and integrity

### 5.1 Per minute, a party never pays more than a battle

Place points and the +5 are the only trophies that are made (stakes only move). A ranked party pays the same `BASE` and
at most the same +5 as one battle, and takes longer:

Times are a match cycle without the podium dwell (both modes have one): a battle's 3-2-1 + clock; a party's first card
(at least `cardMin` 150 f when everyone is ready) + 3-2-1 + its span from the first 시작! to the final standing, with the
host skipping every beat it may (`skipMin` 30 f; 끝! cannot be skipped).

| (1st place, +5 included: 21) | Shortest | Typical | Per minute (shortest / typical) |
|---|---|---|---|
| Battle, 2 min (the fastest option) | 2.05 min (3-2-1 + 120 s) | 2.05 | **10.2** / 10.2 |
| Battle, 3 min (default) | 3.05 | 3.05 | 6.9 / 6.9 |
| Party 3판 | 2.09 min (the void floor: ≥ 2 min from the first 시작! + the first card and 3-2-1 ≈ 5.5 s); 2 or 4 players ≥ 2.55 (왕관 + 축구 + 물 ≥ 8 s, + ≈ 20 s of cards and beats) | 3.8 | ≤ 10.0 / 5.5 |
| Party 5판 | 3.1 (3 players: 물 · 왕관 · 물 · 왕관 · 물, two 60 s games + ≈ 35 s of cards and beats); 2 or 4 players 3.9 (three 60 s games at least) | 6.3 | 6.8 (3 players) · 5.3 (2 or 4) / 3.3 |

Made per match (Σ BASE + the +5s): 4 players 20 + 15, 3 players 14 + 10, 2 players 6 + 5, the same in both modes; a
ranked party's match is never shorter than the fastest battle's (its span alone is at least the battle's clock, and it
has a card before it). Without the void, 3 players drowning themselves in both 물 of a 물 · 왕관 · 물 party (two 8 s 물:
about 1.7 min a cycle) would make 14 + 10 per 1.7 min against a 3-player 2-minute battle's 14 + 10 per 2.05: that is the
gap the void closes.

### 5.2 Two friends trading wins, alts, practice

- **Two friends trading wins (2-player party, 100% / 0)**: per two parties each one nets (12 + s) + (−6 − s) = +6, plus one
  +5 (the loser is last: 꼴등 빼고) = **+11 per two parties**, the stake cancels out. A 1v1 battle gives the same +11 per two
  battles: 2.7 a minute each at 2 minutes; the party 2.2 at its shortest (2 players always play 왕관 + 축구: 2.55 min) and
  1.45 typical. In 견습 (no place loss): +17 per two matches, battle 4.1 a minute, party 3.3 / 2.2.
- **Extra browser profiles** (the local-user limit of trophies.md 13): a real player with idle alts earns at most BASE[n][0]
  + 5 per party, at the party's pace (above): less per minute than the same farm in 2-minute battles. The +5 still needs
  5 of my own blows and 60 s of play, and comes from the shared daily 40. Feeding alts' gifts through stakes pays less
  than in a battle: a 1st place takes half of a 4-player pot (+16 + s net) where a battle's winner takes all of it
  (+16 + 3s): at stake 50, +66 against +166.
- **Practice / same device**: unchanged `troPractice` - tabs of one browser (bc) and two players from one device's store
  make the whole party practice (no holds, the room says so). A guest whose own transport is bc, whose store is read-only,
  or who did not agree to the stake in this mode plays the party as practice for itself.

### 5.3 What each party can do (trophies.md 13, for a party)

| Who | Can | Cannot |
|---|---|---|
| Hostile host | Give me last place: −(stake + 6) per party, and not before 105 s of real time after my hold (my `min`: a ranked party lasts ≥ 2 min from its first 시작! on the host's clock, so this is the battle's own check). Gift me trophies, claim practice, refuse to pay (refund after 15 s), void the party (`v: 1`: refund now), keep starting 파티 한 번 더 (I can leave at the podium for free). | Take more than I hold; apply twice; change my players or stake (my hold is the truth); hold a stake I did not agree to in this mode; make me pay a stake I did not put in (`row[5]`); make me hold over bc. |
| Hostile guest | As in a battle: lie about its count, skip its hold, send `gg` / `cup`, claim in `st` a stake it never held (the pot gets up to one stake nobody paid, split by place). | Change anyone else's count; block the result. |
| Local user | Alts on other devices, at the party's pace (5.2). | Beat the battle's pace. |

---

## 6. Cloud (`firebase/firestore.rules`): no change

- **The hold is never written.** `clCanPush` refuses while this tab has an open hold (`!troOpenHere()`, cloud-trophies.md:
  "never during an open hold"), so from the first 시작! to the settle this tab pushes nothing, and the settle's write
  rises `t` by net + the +5 against the slot's last write (made before the party): a finished party at most
  116 + 5 = **121**, a 기권승 at most **150** - the same 기권승 bound as a battle's, and under a battle win's 166 + 5.
- **Another tab of the same browser** (one store, one slot) may push meanwhile, with the hold already subtracted from
  `S.t`; then the settle rises by up to stake + 6 more: **177** / **206**. Every case is ≤ 250 (the rule's `rise <= 250`).
- **Time**: `rise × 500 ≤ 10000 + dt` (dt since that slot's last write). A finished ranked party's span is ≥ 2 min, so a
  write from before the party allows ≥ 260. A 기권승 seconds after the hold, or the other-tab case, can be refused by the
  time rule; `clStep` caps each write to what the rule allows and the rest goes in the next writes, exactly as for a
  battle's early walkover.
- `de` ≤ 40: the +5 comes from the same `DAY_CAP` 40. `g` +1 a party (≤ 20); `w` +0..1 (≤ the rise of `g`); `ko` +0 (a party
  has no 뽀득 KO). The coins of the same podium (`coinPartyNow`) ride in the same write and keep their own `ce` limits,
  which `clStep` already caps. The invite rule already accepts `mode: 'party'`. Nothing to publish before this deploy.
- **The no-push window is now a whole party** (2-7 minutes instead of a 2-5 minute battle), and sign-in / sign-out are
  refused while `S.esc` has a hold (`clMsg('held')`): a friend who tries mid-party is told to wait until the podium
  (risk 8).

---

## 7. UI (Korean texts verbatim)

### 7.1 Room

- **Options**: the `트로피 걸기` row (label, `.pg-bets` and its 5 buttons) becomes `data-for 'bp'`; the 판 수 row stays last.
  `syncOpts` is unchanged (it disables a stake above my count, title `내 트로피가 모자라요`).
- **Badges, seats, messages**: follow `stakeNow()` by themselves - `#pg-room-bet` `10개씩`, the seat tags `안 걸고 참여` /
  `트로피 부족`, the ready button `안 걸고 준비`, `트로피가 모자라요 · 안 걸고 같이 해요`, `트로피가 모자란 친구가 있어요 · 걸기를
  낮춰 주세요`. `troLowerStake`'s message (`걸기를 낮췄어요: 10개씩`) now shows when `pvp()`, not only in a battle.
- **Mode switch with a stake** (guest, 4 s, `troMsgSet`): `파티로 바뀌었어요: 10개씩 · 다시 준비해 주세요` / `배틀로 바뀌었어요:
  10개씩 · 다시 준비해 주세요`.
- **Guest summary**: `파티 · 미니게임 3판 · 능력 있음 · 트로피 10개씩` (`트로피 안 걸기` at 0; then ` · 연사`, ` · 연습 경기` as today).
- **Ranked for me** (**new** `troPartyOn()`, one helper for every party trophy text - rules, summary item, countdown
  sub, card chip): `NET.role === 'host' || NET.pv >= PARTY_TRO_V`. A guest of an older host keeps today's lines
  (`PARTY_TX.noTro`, no summary item, no countdown part, no chip): that party holds nothing for it (4).
- **Rules** (`partyRules(q)`: `PARTY_TX.noTro` is replaced by the trophy lines when `troPartyOn()`; the numbers from
  `troPartyTable` with n = the room's size clamped to 2..4, distinct places):
  1. `미니게임 3판! 판마다 1등 4점 · 2등 2점 · 3등 1점 · 4등 0점` (unchanged), `마지막 판은 점수 2배!`, `끝나면 보너스상 3개 · 상마다
     +2점`, the tie line and the games line (unchanged)
  2. q 0, stake 0: `트로피 경기: 최종 1등 +16 · 2등 +8 · 3등 +2 · 4등 -6`
  3. q 0, stake > 0, nobody without it: `모두 10개씩 걸고 최종 등수대로 나눠요: 1등 +26 · 2등 +10 · 3등 0 · 4등 -16`
     (3 players `1등 +23 · 2등 +4 · 3등 -13`, 2 players `1등 +22 · 2등 -16`)
  4. q 0, someone plays without it: `판돈 30개 (3명이 10개씩): 건 사람끼리 최종 등수대로 나눠요`, then `troFreeLine()` as in a
     battle (`안 걸고 참여: 등수 점수만 받아요 · 1등 +16 · …`, or `트로피가 모자라면 안 걸고 참여해요 (등수 점수만 받아요)`)
  5. q 0: `끝까지 하면 파티마다 오늘 트로피 보너스 +5 (꼴등 빼고 · 하루 40개까지)`
  6. q 0: `견습 리그는 등수로 잃지 않아요 · 파티 중간에 나가면 꼴찌로 쳐요`
  7. q 1 / 2: `연습 경기라 트로피는 그대로예요` (the coin line beside it already says why)
  8. the coin line, the magazine / 연사 line, the trap line and `판 중간에 나가면 비누 코인이 없어요` (unchanged)

  The list grows from 10 lines to 13 (14 with a free seat); a battle room has 8-9. The room screen must still fit at
  568x320 with the list as tall as that (check it where the room's fit is tested; if it does not, drop the tie line
  `PARTY_TX.tie` first - the podium's notes say it when it happens).

### 7.2 Countdown and the card

- **3-2-1 of the first 판** (`troCountSub`'s party branch: `partyRoundTx(true)` + this, only while `G.party.i === 0`,
  online and `troPartyOn()`; later 판 unchanged. Like a battle's, the line is the host's view - its stake, its `NET.q` -
  carried to guests in `g.bn`): `1판 / 3판 · 트로피 10개씩 걸어요!` (class ` bet`), `1판 / 3판 · 트로피 경기`, practice `1판 / 3판 · 연습
  경기` (class ` prac`). The host's banner reaches guests in `g.bn` as today.
- **The first card**: a chip in the round line beside `#pg-party-x2`: **new** `<b id="pg-party-bet" class="pg-party-bet"
  hidden><canvas class="pg-ic pg-cup" width="8" height="8" aria-hidden="true"></canvas><span>10개씩</span></b>`, shown on the
  first card of a ranked staked party only (the hold comes at its 시작!), each page from its own `stakeNow()` / `NET.q` /
  `troPartyOn()` (and hidden on a page that would play it as practice for itself: bc without `allowBc`, or a ready that
  was not for this stake in this mode - the same tests as `troGuestGo`);
  `안 걸고 참여` when this seat plays without the stake. aria-label `트로피 10개씩 걸어요` / `안 걸고 참여해요`. Inline (no
  height): the round line `1판 / 3판` + the chip is about 9em, inside the 1x card's 17.4em (party.md 9.2). CSS as `.pg-party-x2`
  with `var(--duck)` on ink, like `.pg-badge.pg-bet`. Under 17em of height the round line hides (and the chip with it);
  the 3-2-1 sub still says it.

### 7.3 The final podium

`troPodiumUI`'s party branch becomes: `partyPodiumTitle()`, the practice `TRO.pod` exactly as a battle builds it (`NET.q
!== 0`: kind `'prac'` - today the party returns before it), `partyPodiumUI()`, then the trophy pieces a battle has, with
the party's own tag and note (below) - never `troPodiumTag`'s `연습` / `기권승` / `무승부`, which the party's note and
lines say instead.

- **Blocks**: the 2nd line flips from the party points to cup + my change (`troPodLine`, unchanged; the points stay in the
  HUD panels and the sr line), then alternates with my coins (`coinPodLine`, unchanged). The flip happens for every
  ranked party, stake 0 too (place points).
- **Cups**: from every block with a loss to the blocks with a **gain**, best first, round-robin (`TRO.pod.party`; a
  battle keeps "to whoever took the pot"). At stake 0, one cup per losing block, as a battle.
- **`#pg-podium-bonus`** (every page, after my count-up): `오늘 트로피 보너스 +5`, `안 걸고 참여 · 오늘 트로피 보너스 +5`,
  `안 걸고 참여`; a short party `파티가 너무 빨리 끝나서 트로피는 그대로예요` **at once** - a short (or void, or practice)
  `TRO.pod` has no rows, so `troPodiumTick` returns before `upDone` and `troPodBonus` would never fill it: `troPodBonus`
  shows the `'short'` text without waiting for `upDone`. `partyPodiumUI` no longer hides the line.
- **Tag**: `3판` / `5판` as today; `승급! 온탕 단골` (class `pg-promo`) replaces it after my count-up when I was promoted
  (`troPodiumTag`'s party branch: 승급 or `P.n + '판'`, nothing else).
- **Note** (`#pg-podium-note`, one line): in this order - a void walkover `친구가 나가서 일찍 끝났어요 · 트로피는 그대로예요`; a
  paid walkover `친구가 나가서 일찍 끝났어요 · 기권승`; the host's blocked gate `트로피가 모자란 친구가 있어요 · 방으로 가서 걸기를
  바꿔요`; the tie notes (unchanged: `동점은 1등을 더 많이 한 친구가 위예요`, `동점은 마지막 판 등수로 정했어요`, `공동 2등!`); the
  host's `내 트로피가 모자라서 다음 파티는 안 걸고 해요` / `다음 파티는 안 걸고 하는 친구가 있어요`.
- **파티 한 번 더**: disabled while `!troCanRematch()` (host), as 한 판 더 (`primaryAction` and the click already check it;
  `partyPodiumUI` stops forcing `disabled = false`).
- **Guest wait line**: `방장이 다음 판을 고르고 있어요 · 다음 파티도 10개씩` (+ ` · 나는 안 걸고 해요`), stake 0 unchanged.
- **Screen reader** (`fillPodium`: one new branch, `P.kind === 'short'`): `1위 방장 (꽥꽥이) 12점, … , 내 트로피 +26개,
  오늘 트로피 보너스 +5개, 지금 131개` + the coins (unchanged code); practice `, 연습 경기라 트로피는 그대로예요` (unchanged code,
  now reached because a practice party builds its `'prac'` pod); a short party `, 파티가 너무 빨리 끝나서 트로피는 그대로예요`
  (new).
- **Leaving** (unchanged code, now armed mid-party): `한 번 더 누르면 나가요 · 트로피 -16`, `한 번 더 누르면 모두 방으로 · 내
  트로피 -16`.
- **내 기록**: `<dt>배틀</dt>` → `<dt>배틀·파티</dt>` (the same `N승 / N판`, static in `page.html`); its note line
  `오늘 트로피 보너스 N/40개 · 목욕도 배틀도 받아요` → `… · 목욕도 배틀도 파티도 받아요` (`fillRec`; the +5 now comes from parties
  too).

### 7.4 New strings (`PARTY_TX`, warmed through `PARTY_TEXT`; numbers and stakes filled at run time)

| Key | Text |
|---|---|
| `troZero` | `트로피 경기: 최종 ` (+ the places) |
| `troAll` | `모두 {0}개씩 걸고 최종 등수대로 나눠요: ` (+ the places) |
| `troPot` | `판돈 {0}개 (` + k + `명이 ` + s + `개씩): 건 사람끼리 최종 등수대로 나눠요` (built as `troRulesLine`) |
| `troPlay` | `끝까지 하면 파티마다 오늘 트로피 보너스 +5 (꼴등 빼고 · 하루 40개까지)` (from `TRO_PLAY` / `DAY_CAP`) |
| `troLeave` | `견습 리그는 등수로 잃지 않아요 · 파티 중간에 나가면 꼴찌로 쳐요` |
| `troPrac` | `연습 경기라 트로피는 그대로예요` |
| `toParty` / `toBattle` | `파티로 바뀌었어요: ` / `배틀로 바뀌었어요: ` (+ `10개씩 · 다시 준비해 주세요`) |
| `countBet` / `countTro` / `countPrac` | ` · 트로피 {0}개씩 걸어요!` / ` · 트로피 경기` / ` · 연습 경기` |
| `chipFree` | `안 걸고 참여` (the card chip) |
| `short` | `파티가 너무 빨리 끝나서 트로피는 그대로예요` |
| `walkVoid` / `walkPaid` | `친구가 나가서 일찍 끝났어요 · 트로피는 그대로예요` / `친구가 나가서 일찍 끝났어요 · 기권승` |
| `nextFreeMe` / `nextFree` | `내 트로피가 모자라서 다음 파티는 안 걸고 해요` / `다음 파티는 안 걸고 하는 친구가 있어요` |
| `waitBet` | ` · 다음 파티도 {0}개씩` |
| `recRow` | `배틀·파티` |
| (`fillRec`, `TRO_TEXT` warm-up) | `목욕도 배틀도 파티도 받아요` (replaces `목욕도 배틀도 받아요`) |

New syllables (`최종`'s 종 is in `최종 순위`; `나눠요`, `너무`, `끼리` are new to the party text) are warmed by `PARTY_TEXT`.
party.js's font check covers them.

---

## 8. Code changes (`src/game.js` unless named)

| Where | Change |
|---|---|
| Top constants | `PARTY_V = 4`; `PARTY_SHARE`, `PARTY_TRO_V`, `PARTY_TRO_MINF` (2.1); the `PARTY_TX` keys of 7.4. |
| `troPartyTable`, `troPartyReal`, `troPartyMinF`, `troPartyResult`, `troPartyOn` | **New** (2.1, 3.2, 7.1). |
| `stakeNow` | `pvp() ? NET.opts.bet \| 0 : 0` (feat/toss: keep `&& !AIT.on`). |
| `troHostGo` | No `G.party` return (the rest of that line stays); `if (TRO.match && TRO.match.mid === mid) return;` first; `TRO.match.f0 = G.frame`. |
| `updateCountdown` | The party branch calls `troHostGo()` after `miniStart()`. |
| `partyResult` | No change. |
| `partyFinal` | `troPartyResult(walk)` after `G.podium`, before `coinPartyNow` / `showOverlay('podium')`. |
| `guestHostIn` | The trophy line for `g.m === 'p' && NET.pv >= PARTY_TRO_V`; `troGuestGo(id, g.m === 'p')` (3.1). |
| `troGuestGo` | `party` argument; the party `min`; the mode in the consent test; `TRO.live.get(mid).pa = CO.pa` after a party hold. |
| `troResultIn` | Party detection by `TRO.live`'s `pa`, `troPartyReal(A, …)`, `v: 1` for a party hold of this tab only (3.2); `troPodium(…)` marks `party` (`!!G.party`) for the cups. |
| `troPodium` / `troPodiumTick` | `TRO.pod.party`; cups to the blocks with a gain (7.3); kind `'short'`. |
| `troPodBonus` | The `'short'` text, shown without `upDone` (no rows: no count-up). |
| `troPodiumTag` | A party: 승급 or `P.n + '판'` only. |
| `troPodiumUI` / `partyPodiumUI` | 7.3: the practice pod for a party too, the bonus line, the tag's 승급, the notes' order, the gate, the wait line. |
| `fillPodium` | The `'short'` sr text. |
| `troCountSub` / `troCountCls` | The first 판's trophy part (7.2). |
| `fillParty` (card view) | The `#pg-party-bet` chip (7.2). |
| `partyRules` | The trophy lines when `troPartyOn()` (7.1); `troParts(s)` takes the party table in a party room (`troRulesLine` / `troFreeLine` call it). |
| `roomInfo` | `R.pv = PARTY_V` in a party room. |
| `netAttach` | `NET.pv = 0`; `TRO.agreedM = ''` beside `TRO.agreed = -1`. |
| `guestRoom` | `NET.pv`; the mode-consent line and its message. |
| `guestToRoom` | `TRO.agreedM = ''` beside `TRO.agreed = -1`. |
| `netReady` | `TRO.agreedM = NET.ready ? NET.mode : ''`; `rd` gains `md`. |
| `netMsgIn` `'rd'` | The `md` test (4). |
| `netSetOpts` | A mode change while `stakeNow() > 0` un-readies every guest. |
| `troLowerStake` | Its message when `pvp()`. |
| `renderRoom` | The guest summary's `트로피 …` item in a party. |
| `buildOpts` | The 트로피 걸기 row `data-for 'bp'`. |
| `fillRec` / `src/page.html` | `<dt>배틀·파티</dt>`, `목욕도 배틀도 파티도 받아요`; the `#pg-party-bet` chip and its CSS. |
| Comments | The party section's "비누 코인 only (no trophies)" (above `rematch`'s party section), `troHostGo`'s "(a party holds no trophies)", `partyRules`' "(no trophy lines: a party has none)" and the 1.x notes of party.md 0 / 8.4 point here. |
| `PG.debug.tro` / `PG.debug.party` | 9.1. |

About **220-260 changed lines** in `game.js`, ~10 in `page.html`, ~300 in tests.

---

## 9. Debug / test API and tests

### 9.1 Debug

- `PG.debug.tro.ptable(n, s, fin, gl, gz, rot)` (the pure table), `PG.debug.tro.partyMin(f)` (the void floor in frames;
  `null` = the default: 0 in the fast party, else `PARTY_TRO_MINF`), `PG.debug.tro.preal(nf)` (`troPartyReal(CO.pa, nf)`),
  `PG.debug.tro.gg(on)` (`troGg(on)`), `hold(mid, s, n, min, nos, pa)` (6th argument: mark the hold's `TRO.live` with
  `CO.pa`),
  `state()` gains `agreedM`, `pv`, `match.f0` and `livePa` (the `live` mids that carry a party's counters; `live` itself
  stays the array of mids existing tests read).
  `PG.debug.party.state()` is unchanged.

### 9.2 `src/tests/trophies.js` (virtual time)

1. `ptable` for n 2 / 3 / 4 x the 5 stakes matches 2.2's distinct table; every tie row of 2.2 at stakes 0 / 5 / 10 / 50;
   the leaver and 안 걸고 rows; `m = 1, gl = 0` → `[]`; a 기권승 pays the pot only.
2. Over random fins (seeded): Σ share === pot when a staker finished, 0 when none did; every net ≥ −(s + 6); ≤ +150;
   the remainder rotates with `rot` (three runs of 4p 1st = 2nd = 3rd at stake 5: each seat gets the extra once).
3. `apply` of party rows: the +5 once, none for the last place or a tie for it, none in a 기권승; a hostile row clamped as
   a battle's; `row[5] === 0` pays no stake.
4. `troPartyReal` over crafted party counters (`CO.pa` as `PG.debug.party`'s coin tests craft it): 2 blows in each of 3
   판 (6, no single 판 reaching 5) → real; 4 in all → not; 5 blows but `pf` under 3600 → not (and real again with the
   fast party on); one finisher → not.
5. Replays on a party hold (the debug `hold` gains a 6th argument `pa`: after the hold, `TRO.live.get(mid).pa = CO.pa`, as
   `troGuestGo` does): `apply({v: 1, r: []})` for a battle hold (no `pa`) changes nothing; for the party hold refunds it
   once and shows `'short'`; a normal result after it, or a second `v: 1`, changes nothing and never restarts the pod; a
   `v: 1` after an applied result changes nothing.
6. The quick-rematch race: a party hold with `pa`, then `CO.pa` replaced by a new party's (another gid, 0 blows), then the
   old party's result → applied once, with the +5 from the OLD party's counters (the new `CO.pa` untouched: no
   `coinPartyClose` from `troResultIn`).

### 9.3 `src/tests/trophies-net.js` (3 bc frames, real time)

- **Mode consent**: guests ready for a battle at 10; the host switches to 파티: every guest un-readied on both sides with
  `파티로 바뀌었어요: 10개씩 · 다시 준비해 주세요`; an `rd` with `md: 'b'` arriving after the switch is refused; back to 배틀
  at 안 걸기 un-readies nobody.
- **R in a party room**: `o[4]` the stake, `pv` 4, `R.f` for a short seat; the 트로피 걸기 row visible and enabled for the host.
- **Older host**: a party room's R without `pv` (patched host) → the new guest holds nothing at the first 시작!, its room
  rules say `트로피는 걸지 않아요` (no trophy line, no `트로피 …` summary item) and its first card has no chip.

### 9.4 `src/tests/party.js` (virtual time, offline engine)

- The room rules lines by n (2 / 3 / 4), stake (0 / 10), a free seat and q (0 / 1 / 2) - the strings of 7.1 exactly, from
  a fake roster (`PG.debug.mp` room state).
- The countdown sub on the first 판 only (`1판 / 3판 · 트로피 10개씩 걸어요!`, class ` bet`; 2판 without it); the card chip
  on the first card only (and `안 걸고 참여`).
- The podium pieces from a crafted `TRO.pod` (`PG.debug.tro.apply` on a fake online party): the bonus line, the short
  line, the tag's 승급, the notes' order, the cups to the gains, 파티 한 번 더 disabled by the gate.
- Fit: the first card with the chip at 1x, 2x and 568x320 (`#fit`): the round line one line, `scrollHeight <= clientHeight`.
- `PARTY_TEXT` holds every 7.4 string; an offline party still leaves the trophy store byte-identical (unchanged check).

### 9.5 `src/tests/party-net.js` (4 bc frames, real time, `party.fast(true)` - the void floor is 0 there - and `tro.fast(true)`)

- **Flip** the two checks that said a party holds nothing (`trophies: unchanged everywhere`, and the practice sr line
  without `트로피`): a ranked party now settles; practice says `연습 경기라 트로피는 그대로예요`.
- **A staked 3판 party (stake 10)**: nothing held on the first card or its 3-2-1; every frame holds 16 exactly once at the
  first 시작!; no second hold at 2판 / 3판; at the podium every count matches `ptable` of the final standing (+5 for all
  but the last); one `tro` per guest, a `cup` + `m` back; the podium lines and cups on every frame; 파티 한 번 더 waits for
  the cups, then holds again at its first 시작!.
- **Leavers between 판**: a guest leaves with 나가기 during the 2판 card: forfeit (−16, g +1) and its stake in the pot (the
  others' counts by the n = 4 table); another's link is cut instead: refunded, its stake not in the pot.
- **Down to one**: the last guest leaves with 나가기 → 기권승 for the host (+ the pot only, no +5); with a cut link instead →
  void, the host refunded.
- **Too short**: `tro.partyMin(1e9)` → every frame refunded at once (`v: 1`) and `파티가 너무 빨리 끝나서 트로피는 그대로예요`.
- **The host's 방으로 mid-party** (a result beat of 2판): the host −16; guests refunded after `expire()`. **The host leaving
  mid-party**: guests refunded (`host_left`) and in the lobby (the existing check).
- `hi.pa: 3` crafted guest: never ready in a staked party room; snapshots stay ≤ 3400 bytes.
- **The guest's minimum time** (the one path `tro.fast(true)` hides): one guest frame with `tro.fast(false)` - the fast
  party ends far under 105 s, so its result is refused there (`'wait'`), refunded after `expire()`, while the other
  frames apply theirs.
- **Away between 판** (**new** `PG.debug.tro.gg(on)` = `troGg(on)`, since an iframe cannot be hidden): one guest sends
  `gg` on during the 2판 card and off again before the end → a finisher with its normal row; another sends `gg` on, then
  `away(true)` and its link is cut → forfeit on its own page, its stake in the pot on the host.
- **The +5's real test online**: a guest frame that blows nothing during the whole party gets its place points but no
  +5; the others (the test drivers blow in every 판) get it, the last place excepted.
- **Short party gate**: after `v: 1`, 파티 한 번 더 is enabled at once (no `TRO.lastRes`), and the next party holds again.

### 9.6 Jobs

No new run-all job (`trophies`, `trophies-net`, `party`, `party-fit-568`, `party-net` exist; `party` stays in CI `JOBS`).
One full suite run at the end (`node tools/run-all.js`), every Chrome run with `--mute-audio`.

---

## 10. Build order and effort

One lean build pass (engine + UI), one tests pass, one suite run (about the size of 안 걸고 참여). Each step leaves the game
working:

1. **Must**: the constants, `troPartyTable` + `PG.debug.tro.ptable`, trophies.js 9.2 (the numbers are the contract).
2. **Must**: the hold and the settle - `stakeNow`, `troHostGo` (`f0`), `partyFinal` → `troPartyResult`, the guest's
   `g.m === 'p'` line, `troGuestGo(id, party)` (min, mode consent, `TRO.live`'s `pa`), `troResultIn`'s party real test;
   **the void under 2 minutes with `tro.v`** (it ships with the guest's 105 s `min`: without it a short honest party
   would pay the host while every guest's result is refused as too early and refunded - the host's trophies made from
   nothing); `PARTY_V` 4 and `R.pv`.
3. **Must**: the room - the 트로피 걸기 row for a party, `troPartyOn()`, the rules lines, the summary; mode consent
   (`agreedM`, the switch, `rd.md`).
4. **Must**: the podium - the party branch of `troPodiumUI` (practice pod, bonus line incl. the short one, tag, gate,
   notes, wait line), `fillPodium`'s short text, cups to the gains.
5. **Should**: the countdown sub; `배틀·파티` and the 내 기록 note.
6. **Could**: the first card's chip (fallback: the countdown sub alone says it).
7. Tests (9.3-9.5), then the suite run; the "As built" note in this file.

---

## 11. Risks

1. **The party feels different**: today a party never costs trophies; now even at 안 걸기 the last place loses 6 (the
   place points, like a battle) and leaving between 판 is last place. The room rules, the first card / 3-2-1 and the leave
   confirm say it; the friends may still be surprised the first time.
2. **One hold for a long match**: 6-7 minutes for a 5판 party. A guest that steps away mid-party (switching apps) and loses
   its link is last place, as in a battle, but the window is longer. `troStale`'s 15 min covers a 5판 party about twice;
   a host tab left hidden for minutes freezes the party (and the hold) as it freezes a battle.
3. **The 2-minute void** (first 시작! → final standing) voids only a deliberately drowned 3-player 물 · 왕관 · 물 today.
   **feat/party-games** adds 펑 (45 s) and round games that often end under a minute; with the span (cards and beats
   included) a 3판 of them stays over 2 minutes unless its 물 is drowned on purpose, but that PR must still re-check it
   with its real lengths (and its `fastSecs` for the debug floor). If the floor ever moves, the guest's `min` moves with
   it (`PARTY_TRO_MINF / 60 * 1000 − TRO_SLACK_MS`): a host floor below the guests' `min` pays the host while refusing
   every guest.
4. **Merges**: feat/party-games also bumps `PARTY_V` (the later PR takes the next; `PARTY_TRO_V` must equal the
   `PARTY_V` of the release that ships party trophies) and edits `partyRules`, `partyPodiumUI`, `PARTY_TX`, `partyPlan`;
   it may add the host's party version to `R` too (party-polish 14.4) - then reuse it instead of `pv`. feat/toss (as on
   its branch today) gates `stakeNow` (`&& !AIT.on`), `troEscrow`, `troApply`, `troWait`, `troResultIn`, `troGuestGo` and
   `troHostGo` on `AIT.on`, and gives the battle texts an `AIT_TX` branch (`partyRules` uses `AIT_TX.friendly` instead of
   `PARTY_TX.noTro`). Whoever lands second: keep `!AIT.on` in the new `stakeNow`; keep `AIT.on` first in `troHostGo`'s
   rewritten return line (then `TRO.match` stays null and `troPartyResult` returns at once - give it its own `AIT.on`
   return too); put `troResultIn`'s new party / `v: 1` branch after its `AIT.on` return; and make `troPartyOn()` false
   when `AIT.on`, so the room rules keep `AIT_TX.friendly` and no party trophy text (rules, summary, countdown, chip,
   podium bonus) shows in Toss. Trophies stay off there even if a text is missed, because every hold and result goes
   through the gated functions.
5. **Older pages**: a cached pa-3 page must refresh to play a party (`새로고침 필요`); a new page as a guest of a pa-3 host
   plays its party unranked (no `R.pv`). Nothing on the wire can mint or lose trophies across versions.
6. **Tests that assumed no trophies in a party** (party-net's two checks, any count of `t === 100` after a party) must
   flip in the same PR.
7. **The 3rd place breaks even at stake 10 with 4 players** (+2 + 8 − 10 = 0) and loses a little at 20 / 50: intended
   ("차등"), but friends may read 0 as "nothing happened". The podium's flip shows `0` in the grey of a battle's 0.
8. **The cloud waits a whole party**: no push from the first 시작! to the podium (2-7 minutes), and sign-in / sign-out
   are refused with the `held` message until then. A phone that dies mid-party keeps its hold locally until `troStale`
   (15 min) on its next load, as for a battle.
9. **The party room's rules list** grows to 13-14 lines (7.1): the room must still fit a 568x320 phone.
10. **A quick 파티 한 번 더 at 안 걸기** opens the gate at once (`TRO.lastRes.s === 0`), so a guest's `tro` can land after
    the next party's first snapshot: covered by the hold's own `pa` (3.2) and the `'wait'` window, but it is the one
    party path where the result and the next game overlap.

---

## 12. Open questions for the owner (each with the default this spec uses)

1. A party at 안 걸기: a 트로피 경기 with place points (+16 … −6) and the +5, like a battle - or no trophies at all unless a
   stake is set? **Default: like a battle** (one rule for both modes). **Owner (2026-10-30): no trophies at 안 걸기** (the block at the top).
2. The split 4명 50 / 30 / 20 / 0, 3명 60 / 30 / 10, 2명 100 / 0? **Default: as written** (constants, `PARTY_SHARE`).
3. A tie's leftover trophy (at most 2): rotated by the game id? **Default: rotated** (never always the host; the other
   choice is seat order).
4. A party whose first 시작! → final standing took under 2 minutes pays no trophies (every hold refunded)? **Default:
   yes** (keeps a party at or below a battle's pace and matches the guests' 105 s check; today only a 3-player
   물 · 왕관 · 물 with both 물 drowned on purpose is that short).
5. Party wins and games in the same 내 기록 row (`배틀·파티`)? **Default: shared** (separate counters need a new store
   version and a cloud rules change).
6. The stake chip on the first card only, or on every card? **Default: first card only** (the hold is at its 시작!; the
   last card already carries `점수 2배!`).
7. A switch between 배틀 and 파티 with a stake on un-readies everyone? **Default: yes** (ready means ready for that stake
   in that mode).

---

## 13. Review against the code (2026-10-29)

An adversarial pass over sections 0-12 against `src/game.js`, `src/net.js`, `firebase/firestore.rules`, the tests on
main and the open branches (feat/toss, feat/party-games). The table function was re-run: every number in 2.2 holds, the
pot is paid out exactly with any ties, leavers and 안 걸고 참여 (floors, then the best staker takes the rest; a tie group's
remainder one each in seat order from the game id). What changed in this spec:

| # | Found | Fix (where) |
|---|---|---|
| 1 | The void counted only playing frames (summed in `partyResult`). Per minute is the friends' real time; the cards and beats are part of the match. With feat/party-games' 45 s games a 3판 would be void most of the time while lasting as long as a battle. | The span from the first 시작! to the final standing on the host's `G.frame` (`TRO.match.f0`); no change in `partyResult` (0, 2.3, 3.2, 5.1, 11.3, 12.4). |
| 2 | The void was a **Should**. Without it, a short honest party pays the host while every guest's result is refused by the 105 s `min` and refunded: trophies made from nothing on the host. | The void ships with the hold and the settle (10, step 2). |
| 3 | Section 6 said the hold syncs at the first 시작!. `clCanPush` never pushes while this tab holds (`!troOpenHere()`). | The settle is one write of net + 5 (≤ 121 / ≤ 150; ≤ 177 / 206 only after another tab's push). Rules unchanged. The whole party is a no-push window; sign-in / sign-out refused meanwhile (6, risk 8). |
| 4 | The guest found its party by `CO.pa.gid` and called `coinPartyClose` from `troResultIn`. At stake 0 the 파티 한 번 더 gate opens at once; the next party's first snapshot replaces `CO.pa`, and a late `tro` would then be read as a battle (wrong +5 test) - or close a 판 of the new party. | The hold keeps its party's counters (`TRO.live.get(mid).pa = CO.pa` in `troGuestGo`); `troPartyReal(A, nf)` reads them without closing anything (3.1, 3.2, 3.3, tests 9.2.5-6). |
| 5 | The +5's real test had no play-time part ("implied by the void"): not true once the void counts the beats, and not true for 45 s games. | `troPartyReal` = the battle's `troReal` for a party: 2+ finishers, ≥ 5 blows and ≥ `COIN.minF` frames of play over the party (`A.pf`; waived in the fast party) (0, 2.3). |
| 6 | `v: 1` refunded any hold of mine with that mid. | Only a party hold of this tab (`TRO.live`'s `pa`), after feat/toss's `AIT.on` return, under the existing replay guard; `troClose` already sends the `cup` (3.2, 4). |
| 7 | `troGuestGo` read `G.party` to pick the party `min`. | `troGuestGo(id, party)` with the snapshot's own mode (3.1). |
| 8 | The podium: `troPodiumTag` would print `연습` / `기권승` / `무승부` over a party's `3판`; the short line could never show (`troPodBonus` waits for `upDone`, which needs rows); `fillPodium` has no short text ("unchanged code" was wrong); a practice party never builds its `'prac'` pod, so the practice sr line the tests expect would not appear. | 7.3 and 8: the party tag rule, the short line at once, `fillPodium`'s new branch, the practice pod for a party. |
| 9 | A guest of an older host (no `R.pv`) would still have shown the trophy rules, summary, countdown part and chip. | `troPartyOn()` gates every party trophy text (7.1, 7.2, test 9.3). |
| 10 | 5.1 / 5.2: a 3-player 5판 can have two 60 s games, not three; 2 players always play 왕관 + 축구; the battle's 2-minute cycle is 2.05 min. | Recomputed: party ≤ 10.0 a minute against the battle's 10.2; 2 friends trading 2.2 against 2.7 (5.1, 5.2). |
| 11 | The `PARTY_V` bump read as cosmetic. | It prevents a pa 3 guest's unpaid stake entering the pot (4, Old pages). |
| 12 | Tests never exercised the guest's `min` (`tro.fast(true)` everywhere), the hidden-between-판 `gg`, the per-party blow count, the late `tro`, or an older host's room text. | 9.2 items 4-6, 9.3, 9.5 additions; `PG.debug.tro.gg`, `preal`, `hold`'s `pa`. |
| 13 | Not in the spec: `TRO.agreedM` reset in `netAttach` / `guestToRoom`; `NET.pv` reset in `netAttach`; the 내 기록 note `목욕도 배틀도 받아요`; the stale "no trophies" comments; the room rules list length. | 8, 7.3, 7.4, 7.1, risk 9. |

Checked and fine as written: one game id per party, so `TRO.seen` and the mid make "once per party" free; phase `'d'` is
only the final podium (`PH_CODE`); `R` rides in every snapshot, read before `g`; `troApply` clamps a party row like a
battle's (share ≤ stake × n covers the best staker's whole pot; a stale guest `n` only loosens or tightens a clamp, never
mints); the host-leave paths (`net.js` `close('host_left')` → `netStatusIn` → `netLeave` → `netClose` →
`troSessionEnd`) and the host's 방으로 (`netToRoom`'s `G.mode !== 'podium'` covers card, countdown, playing, result) are
mode-agnostic; `partyDrop` returns at the podium and `hostDropPlayer` takes the party branch before `endBattle`; a
hidden guest tab still holds and settles (network events); a reload between 판 is a `gg` leaver (hidden, then
`pagehide`); `firestore.rules` needs no change (`de` ≤ 40 from `DAY_CAP`, `g` +1, `w` ≤ `g`, `ko` +0, every rise ≤ 250,
the time rule handled by `clStep`).

### 13.1 Every `NET.mode` read on main, for party trophies

| Where (function) | Reads | Change |
|---|---|---|
| `stakeNow` | `=== 'battle'` | **`pvp()`** (feat/toss: `&& !AIT.on`) |
| `troLowerStake` | `=== 'battle'` for its message | **`pvp()`** |
| `palRowEl` (invite button aria), `palRender` (its cache key), `ivInvite` (the invite's mode) | the mode's name | none |
| `pvp`, `seatReady`, `seatOld` | `!== 'coop'`, `=== 'party'` (the pa gate) | none (`PARTY_V` 4 does the gating) |
| `netAdvertise` | `mode` of an open room | none (no stake in an ad) |
| `roomInfo` | `R.m`, `R.u` | **`R.pv`** in a party room |
| `netSetOpts` | sets the mode | **un-ready every guest on a mode change while `stakeNow() > 0`** |
| `netStart` | which game to start | none |
| `guestRoom` | `R.m` → `NET.mode` | **`NET.pv`; the mode-consent line** (`TRO.agreedM`) |
| `syncOpts` | `'p'` / `'b'` rows | none (`buildOpts` puts the 트로피 걸기 row on `'bp'`; the lobby's pre-host options follow) |
| `renderFriends` (lobby: mode buttons, `MODE_DESC`, the pre-host options, 방 만들기 label) | labels | none (`PARTY_TX.desc` says nothing about trophies) |
| `renderRoom`: mode label, seat cache key, mode buttons, options box | labels / visibility | none (the stake badge, seat tags, ready button and messages follow `stakeNow()`) |
| `renderRoom`: guest summary | battle parts carry `트로피 …`, party parts do not | **`트로피 10개씩` / `트로피 안 걸기` in a party when `troPartyOn()`** |
| `renderRoom`: rules | battle `tro` lines / `partyRules(q)` | **`partyRules` trophy lines** (7.1) |
| `renderRoom`: refresh message | `=== 'party'` | none |
| `PG.debug.mp` state / decode | reports the mode | none (`state()` gains `pv`) |

---

## 14. As built (feat/party-trophies, 2026-10-30)

Built in the order of section 10 with the owner's decision applied everywhere: **a party at 안 걸기 is exactly today's
party** (coins only - no hold, no place points, no +5, no `tro`, 내 기록 untouched, the same room rules, summary, 3-2-1, card
and podium); only a party at 5 / 10 / 20 / 50 is a 트로피 경기. About 310 changed lines in `game.js`, 9 in `page.html`.

### 14.1 What differs from the body

| Where | As built |
|---|---|
| Versions | `PARTY_V` **5** and `PARTY_TRO_V` 5 (final, 14.4: main is still 3 and the open PR #24, fix/crown-last, takes 4 - two branches at the same number would merge silently into one version). Whoever lands after the other keeps both equal to the `PARTY_V` of the release that ships party trophies; feat/party-games bumps it again. |
| `troPartyOn()` | `NET.mode === 'party' && stakeNow() > 0 && (host \|\| NET.pv >= PARTY_TRO_V)` - the stake test is the owner's decision. It gates the rules, the summary item, the 3-2-1 part, the card chip, the wait line and the practice pod. |
| Hold | `troHostGo` returns for a party at 안 걸기 (`G.party && !(stakeNow() > 0)`); the guest's line in `guestHostIn` also needs `stakeNow() > 0`. Everything else as 3.1 (`f0`, the mid test first, `troGuestGo(id, party)`, the 105 s `min`, the mode in the consent test, `TRO.live`'s `pa`). |
| Settle | `troPartyResult(walk)` as 3.2, called in `partyFinal` right after `setMusic` / before `coinPartyNow` and `showOverlay('podium')`. `troPartyReal`, `troPartyMinF` (`TRO.pmin`: the debug override) as written. |
| `troResultIn` | As 3.2; the display's replay guard also keeps a `'short'` pod (`P.t0 < 0 && P.kind !== 'short'`): a short pod has no rows, so its `t0` stays -1 and a later normal result would otherwise redraw it. |
| Strings dropped | The stake-0 ones: `troZero` survives only for a staked room where every seat plays without the stake (`트로피 경기: 최종 1등 +16 ...`), `countTro` (` · 트로피 경기`) is gone. ` · 연습 경기` shows on a staked practice party only. New: `chipBetA` / `chipFreeA` (the chip's aria-labels `트로피 10개씩 걸어요` / `안 걸고 참여해요`). |
| Rules | `PARTY_TX.noTro` is replaced in place (after the coin line, before the magazine line): 13 lines for a staked 4-player room (the free line replaces `트로피가 모자라면 ...`, so a free seat keeps 13). The room panel scrolls on a phone (its ready row is sticky), so the tie line stays. |
| Card chip | `<b id="pg-party-bet">` beside `#pg-party-x2`, its cup 0.9em (no taller than the text: the round line keeps its height). Shown only on the first card of a ranked staked party (each page by its own stake, `NET.q` and consent: `partyCardBet`; a 1판 debug party's only card is also its last: 14.3). |
| Podium | `troPodiumUI`: the practice pod for a party only when `troPartyOn()` (a practice party at 안 걸기 still has no trophy line), and a new practice pod refills the sr line at once (`fillPodium`: a party's podium is filled before it). `partyPodiumUI`: `troPodiumTag` (party: 승급 or `N판`), `troPodBonus` (the short line at once), the note in the order of 7.3 (walk void / 기권승 / the plain walk at 안 걸기, the blocked gate, the ties, the next-party lines), 파티 한 번 더 disabled while `!troCanRematch()`, the wait line with ` · 다음 파티도 10개씩`. |
| Cups | `TRO.pod.party` (`!!G.party` in `troPodium`): to every block with a gain, best first; a battle keeps "to whoever took the pot". A party where nobody finishing loses (a 3-finisher party with a gg leaver: +26 / +10 / 0) flies no cups. |
| Network | As section 4: `R.pv` in a party room (room and game phase), `NET.pv` (0 in `netAttach` and for a non-party R), `rd.md` (`modeCode()`), `TRO.agreedM` (reset with `TRO.agreed`), the un-ready on a mode change with a stake, the guest's `파티로 / 배틀로 바뀌었어요: 10개씩 · 다시 준비해 주세요`. |
| Debug | `PG.debug.tro`: `ptable`, `partyMin(f)`, `preal(nf)`, `gg(on)`, `hold(..., pa)`, `apply(m, slot)` (offline unit tests read `troResultIn` as that seat), `state()` + `agreedM`, `pv`, `match.f0`, `livePa`. `PG.debug.party`: `rules(o)` (a fake roster's room rules), `count(o)` (the 3-2-1 sub / class and the chip as an online host), `coinPa(o)` (the party coin counters by hand). `PG.debug.mp.state().party.pv`, `mp.guestRoom(R).pv`. |
| Apps in Toss | Not on main yet (feat/toss unmerged): nothing to gate. When it lands: `troPartyOn()` false and `troPartyResult` returning on `AIT.on`, `stakeNow` keeps `&& !AIT.on` (risk 4). |

### 14.2 Tests (all green on this branch)

| Driver | Added |
|---|---|
| `trophies.js` | `partyTableTests`: every distinct row of 2.2 (stake 0 as 안 걸고 참여's place points), the shares, every tie row at 0 / 5 / 10 / 50, the leaver / 안 걸고 rows, void, the rotation of the tie's extra trophy by game id, 4000 random tables (pot paid out exactly, -(s + 6)..+150; seen: finished +108, 기권승 +150). `partyApplyTests`: the +5 once / 꼴등 빼고 / none in a 기권승, a hostile row clamped, `row[5] === 0`, `troPartyReal` over crafted counters (an open 판's blows count), `v: 1` (battle hold untouched, party hold refunded once, no restart, none after an applied result), the quick-rematch race (the OLD party's +5, the new `CO.pa` untouched). 내 기록's `배틀·파티` and the new note. |
| `trophies-net.js` §14 | 배틀 → 파티 at 10 un-readies (both sides, the message), a late `rd` with `md: 'b'` or without `md` refused; a party room's R (`o[4]`, `pv`, `f`), the 트로피 걸기 row, the rules, the guest summary; 안 걸기 exactly as before and 파티 → 배틀 at 안 걸기 un-readies nobody; an older host (no `R.pv`): no trophy line, summary item, chip or hold for its guests. |
| `party.js` | `troTests`: the rules by n / stake / free seat / q / older host (13 lines, 안 걸기 unchanged), the 3-2-1 sub and class and the chip of the first 판 only (안 걸고 참여 when short), the 7.4 strings verbatim and warmed; the fit test shows the chip in the round line at 1x, 2x and 568x320 (one line, no scroll). |
| `party-net.js` §10 | A staked 3판 party of 4 with a known standing (the host hands the crown and ends each 판): the chip, nothing held on the card / 3-2-1, the 3-2-1 text, one hold of 16 (none at 2판 / 3판), +26 / +10 / 0 / -16 and the +5 only for a real party (B never blows) and not the last, one `tro` per guest, `cup` + `m`, the rows, 2 cups to the gains, the bonus line, the sr line, the gate; 파티 한 번 더 holds again: B away + cut (forfeit, in the pot), C's 나가기 at the 2판 card, A's gg on / off, the n 4 table with two gg leavers (+34 / +10), A by the real clock (refused before 105 s → wait → refund); too short (`v: 1`, refund at once, the short line, the gate open, the next party holds); the host's 방으로 in a result beat; down to one (기권승 the pot only / void); a staked practice party. The crafted older guest now says `pa: 4`; the host leaving mid-party is staked (guests refunded, the host forfeits). Budget rt600000 (≈ 280 s here). |

### 14.3 Not built / open

- Not built (the owner's decision): every stake-0 rule, line and test of the body (risk 11.1 is now "a party with a stake
  costs trophies").
- `party.js` does not craft the podium pieces offline (9.4's third bullet): `party-net` checks them live (bonus line, short
  line, notes for 기권승 / void, cups, gate); the party's 승급 tag and the older-guest gate note are not tested for a party
  (the code is the battle's).
- A 1판 debug party shows the chip next to `점수 2배!` on its only card: the round line then wraps at 1x (real parties have 3
  or 5 판, so the first card is never the last).
- Open: `PARTY_V` / `PARTY_TRO_V` when this and #24 / feat/party-games meet (14.4); re-check `PARTY_TRO_MINF` against a
  3판 of feat/party-games' shorter games (risk 3); the Apps in Toss gates when feat/toss lands (risk 4).

### 14.4 Verify pass (2026-10-30)

- **Main**: `origin/main` was still d7e065a (nothing to merge). `PARTY_V` stays **5**: main's 3 + 1 is 4, which the open
  PR #24 (fix/crown-last) already uses; a gap is harmless (every test is `>=`), a shared number is not.
- **Fixed**: a guest holds on a `'p'` snapshot of the **first 판 only** (`g.pa.i === 0` in `guestHostIn`). A page that
  missed every `'p'` of 1판 used to hold at 2판's 시작!: its `st` reached the host (`TRO.match` lives across 판), so its
  stake went into the pot, while its own result could be refused by the 105 s `min` (counted from that later hold) and
  refunded - trophies made from nothing. Now it plays the party without a hold, and the host counts no stake for it.
- **Checked and fine** (against the code): the pot is paid out exactly (300,000 random tables with ties, 견습, 안 걸고
  참여, gg / dropped leavers and the rotation: Σ share = pot whenever a staker finished, every net ≥ −(s + 6), the base
  inside `BASE[n]`, the share ≤ s × n); `G.frame` never resets (the void span); `TRO.match` is cleared only by
  `netAgain`, `troSessionEnd`, `netToRoom` and the settle, never between 판; `troWait` keeps `TRO.live` (a late `tro` keeps
  its party's +5 test); a replayed `tro` or `v: 1` changes nothing; `netAgain` clears `TRO.lastRes`, so a 안 걸기 party's
  podium never shows a gate or a next-party line from an earlier battle; the host's 방으로 before the podium forfeits
  only its own hold; stake 0 never reaches `troHostGo`'s hold, `troPartyResult`, the guest's line or `troApply`; the cloud
  push waits on `troOpenHere`; battle paths read the same as on main (the practice pod now also refreshes a battle's sr
  line at once - text only).
- **Known, as a battle**: a leaver's forfeit stands in a void party (too short, or a walkover nobody won): its stake is
  lost, not shared (leaving is last place either way); a pot whose finishers all played without the stake is lost.
