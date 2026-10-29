# 뽀득뽀득 목욕탕: 파티 트로피 (party trophies) v1 — design spec

Status: design, ready to build on `feat/party-trophies` (worktree `bogeul-ptro`, from `origin/main` d7e065a = PR #23,
파티 다듬기, merged). It reverses design/party.md section 0 "Reward" and 8.4 "No trophies": a party room can now stake
trophies like a battle, and the pot is split by the final party standing. Everything else of trophies.md (the store, the
holds, 안 걸고 참여, 꼴등 빼고, the cloud) and of the party (design/party.md 18, design/party-polish.md 14) is reused as built.
Code is referenced by function name, never by line number. Every function named here exists on main unless it is marked
**new**. Every number in the tables of section 2 was computed with a simulation of `troPartyTable` (2.1), with 200,000
random tables for the bounds: the pot is always paid out exactly, the most a player can lose is stake + 6 and the most it
can win is +150 (a 기권승) or +116 (a finished party).

The owner asked (2026-10-29): `파티에도 트로피 걸게해주고 123등 트로피 차등으로 배분해줘` - let a party bet trophies too, and
share them out in steps for 1st / 2nd / 3rd instead of the battle's winner-takes-the-pot.

---

## 0. Decisions in one table

| Question | Decision |
|---|---|
| What changes | A party room is a **트로피 경기** like a battle room: the same `트로피 걸기` row (안 걸기 / 5 / 10 / 20 / 50, the host picks, default 안 걸기), the same 안 걸고 참여, the same practice rules (`troPractice`: tabs of one browser, one device's store). Coins stay exactly as today, paid in addition. |
| One stake for the whole party | Held once, at the **first 판's 시작!** (stake + 6, only the stake in 견습), settled once at the **final standing** (the podium, after the awards). Later 판 hold nothing more. Leaving during the first card / 3-2-1 is free; from the first 시작! to the podium, leaving is last place. |
| Place points | The battle's `BASE` for n = players at the first 시작!: 2 players +12 / −6; 3 players +15 / +5 / −6; 4 players +16 / +8 / +2 / −6, by the **final** place (`partyStandings`). Ties average their places' points (rounded); 견습 never loses by place. |
| The pot | All stakes put in, split by final place (**new** `PARTY_SHARE`): 4 players **50% / 30% / 20% / 0**; 3 players **60% / 30% / 10%**; 2 players **100% / 0**. The split runs over the stakers' own order (안 걸고 참여: nothing in, nothing out). Floors, then the best staker takes what is left; a tie splits its places' shares evenly, the remainder one each in seat order, rotated by the game id (2.1). The pot is never created or lost. |
| 오늘 트로피 보너스 | **+5 once per finished real party** (not per 판), 꼴등 빼고, from the same daily pool (`DAY_CAP` 40). Real = 2+ finishers and at least 5 bubbles I blew in the whole party. |
| 기권승 / everyone left | As a battle: the one left gets **the pot only** (no base, no +5), and only when someone left on purpose (`gg`); nobody gave up → void, refund. Players lost between 판 are leavers like in a battle (their `gg` or their dropped link decides). |
| Too short | **New**: a finished party with under **2 minutes of play** (`PARTY_TRO_MINF` 7200 frames, the shortest battle) is void: every hold refunded at once. Only 3 players with two very short 물 rounds can make one; it keeps a party at or under a battle's pace (5.1) and gives guests the battle's 105 s check against a hostile host (5.3). |
| Leavers / the host | A leaver mid-party is settled as a battle leaver (나가기 = `gg` + forfeit; a dropped link while watching = refund). The host leaving = `host_left` → refund for everyone; the host's 방으로 before the podium = the host forfeits, guests are refunded after 15 s. The paths are the battle's, checked in 3.3. |
| Network | No new message type, `NET_V` stays 4. **`PARTY_V` 3 → 4** (a pa-3 page is never ready in a party room). New fields: `R.pv` (the host's party version, party rooms), `rd.md` (the mode the guest readied for), `tro.v` (a short party: refund now). |
| Cloud | `firebase/firestore.rules` **unchanged**: the biggest single write is +206 (≤ 250), `de` stays ≤ 40, `g` +1 a party. |
| 내 기록 | Parties count in the same `w` / `g` (one game per party); its row `배틀` reads `배틀·파티`. No store or cloud change. |
| Apps in Toss | Trophies stay off there: every party path goes through `stakeNow` / `troEscrow` / `troApply` / `troResultIn`, which the Toss build already turns off (`AIT.on`); its texts get the same `AIT.on` branch (11, risk 4). |

---

## 1. Ground truth from the code (what this builds on)

| Thing | Code on main | Consequence |
|---|---|---|
| Stake | `stakeNow() = NET.mode === 'battle' ? NET.opts.bet \| 0 : 0`; `canAfford`, `canStart`, `troSeatFree`, `R.o[4]`, `R.f`, the badges and the room messages all read it. | `stakeNow` becomes `pvp() ? …` (battle or party): most of the room follows by itself. |
| Options box | `buildOpts`: the 트로피 걸기 row is `data-for 'b'`; the 판 수 row (`'p'`) is the last row; `syncOpts` hides by mode. | The row becomes `'bp'`; it already sits before 판 수. |
| Hold | `troHostGo` returns for `G.party` (and is called only from the battle branch of `updateCountdown`'s 시작! frame; the party branch calls `coinGo(); miniStart();`). Guests: `guestHostIn` runs `troGuestGo` / `troWait` only for `g.m === 'b'`. `troEscrow` is once per match id (`TRO.seen`). | One game id = one party (all 판 share `NET.gid`), so `mid = NET.ms + '.' + gid` is the party's id: holding "once per mid" is exactly "once per party". The host must not rebuild `TRO.match` at the 2nd 판's 시작! (it would drop `gg` / `st`). |
| Result | `troHostResult` from `endBattle` only; a party never calls `endBattle`; `partyFinal(walk)` builds `G.podium = {order, t, te, pl}` from `partyStandings`, then `coinPartyNow`, then `showOverlay('podium')`. | **New** `troPartyResult(walk)` in `partyFinal`, after `G.podium`, before `showOverlay`. Places come from `G.podium.pl` (shared places repeat). |
| The +5 | `troApply(…, real)`: +`TRO_PLAY` unless a 기권승 (one row) or my place is the highest of 2+ rows (`last`); `troReal` reads `CO.bshots` (per 판 in a party) and the battle clock. | A party needs its own real test: `CO.pa.shots` (all my blows, closed per 판 by `coinPartyClose`). `troApply` itself is unchanged. |
| Min time | `troGuestGo` holds with `min = NET.opts.time * 60000 − TRO_SLACK_MS` (the battle clock); `troApply` refuses a guest's result before it. | A party gets `PARTY_TRO_MINF / 60 * 1000 − TRO_SLACK_MS` = 105 s (5.3). |
| Leavers | `hostDropPlayer` → `partyDrop(slot)`; < 2 left → `partyFinal(true)`. `gg` (`troGg`, `troSessionEnd('left')`, hidden tab) and `st` are matched to `TRO.match.mid`. | A leaver is missing from `G.podium.order`; `M.slots` / `M.gg` say whether its stake is in the pot, as in a battle. |
| Host leaving | `netStatusIn('closed', 'host_left')` → `netLeave(…, 'host_left')` → `netClose('host_left')` → `troSessionEnd('host_left')` (refund), then `idleWorld` (clears `G.party`). Host 방으로: `netToRoom` forfeits an open hold when `G.mode !== 'podium'`; guests: `guestToRoom` → `troWait`. Tab close: `pagehide` → `troSessionEnd('left')`. | All mode-agnostic: a party reaches them unchanged (3.3). |
| Podium | `troPodiumUI` returns into `partyPodiumUI` for `G.party`, which sets the tag `3판`, **hides `#pg-podium-bonus`** and **always enables 파티 한 번 더**; `troPodiumTick` flies cups to whoever took a share. `fillPodium`'s sr line reads `TRO.pod`. | The party branch gains the trophy pieces (7.3); cups fly to every block with a gain. |
| Room rules | `partyRules(q)` lists `PARTY_TX.noTro` `트로피는 걸지 않아요`; the battle's trophy lines are `troRulesLine`, `troFreeLine`, the +5 line and the 견습 line. | The party branch replaces `noTro` with its own trophy lines (7.1). |
| Versions | `PARTY_V = 3`; `seatReady` / `seatOld` keep a page with a lower `hi.pa` out of a party room; nothing tells a guest the **host's** party version (party-polish 14.4, open). | `PARTY_V` 4, and **new** `R.pv` so a new guest never holds for an older host's party. |
| Cloud | firestore.rules: a slot write rises `t` by ≤ 250 and `rise × 500 ≤ 10000 + dt`; `g` +0..20; `w` ≤ the rise of `g`; `ko` +0..400; `de` 0..40. `clStep` splits a bigger rise. | Section 6: no change. |
| 내 기록 | `fillRec`: `S.w + '승 / ' + S.g + '판'` under `<dt>배틀</dt>`. | Shared counters; the label changes. |

---

## 2. The rules

### 2.1 The table (`troPartyTable`, **new**, host only, pure)

```js
  // 파티 트로피 (design/party-trophies.md): top constants block, next to BASE
  const PARTY_SHARE = { 2: [100, 0], 3: [60, 30, 10], 4: [50, 30, 20, 0] };  // % of the pot by place (stakers' order)
  const PARTY_TRO_V = 4;        // the first PARTY_V that ranks parties (R.pv); 5 if feat/party-games lands first
  const PARTY_TRO_MINF = 7200;  // a finished party pays only after this much play (frames: 2 min = the shortest battle)

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

- **The only stake never paid out**: a `gg` leaver's, when no finisher put a stake in (everyone left played without it).
  It stays lost, as in a battle (the leaver forfeited it on its own page; nobody gains it).
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
  has 2+ finishers and I blew at least `COIN.gameShots` (5) bubbles in the whole party (`CO.pa.shots`, the coins' own
  counter, closed per 판 by `coinPartyClose`). Play time needs no own test: a ranked party has at least 2 minutes of play
  (the void below), more than `COIN.minF`. **꼴등 빼고** as built: the highest place of the rows, every member of a tie for it,
  gets none; a 무승부 has no last. Practice, a refund, a void party, a leaver and a replayed result never pay it.
- **기권승**: fewer than 2 players left at any point (`partyDrop` → `partyFinal(true)`): the one left (always the host - a
  guest's session ends with the host) gets the pot only when at least one leaver sent `gg`, no base, no +5; otherwise the
  party is void and the host's hold is refunded. Players who left in earlier 판 count exactly like players who left in the
  last one: each one's `gg` (or its dropped link) decides whether its stake is in the pot.
- **Too short (void, new)**: the host sums each 판's playing frames into `TRO.match.pf` (in `partyResult`). A finished party
  (`partyFinal(false)`) with `pf < PARTY_TRO_MINF` pays nothing: the host refunds its own hold and sends
  `{t:'tro', m, n, s, r: [], v: 1}`; each guest refunds its hold of that party at once (an older page ignores `v` and is
  refunded after 15 s by `troWait`). The podium says why (7.3). Only a 3판 with a single 60 s game can be that short:
  물 · 왕관 · 물 (3 players, or a 4-player party whose 축구 was re-drawn after a leaver) with the two 물 together under a
  minute. 2 or 4 players otherwise play 왕관 and 축구 (60 s each); every 5판 and 3 players' 왕관 · 물 · 왕관 have two 60 s
  games.

### 2.4 What stays

Coins: `coinParty` unchanged, paid in addition. 견습 protection twice (in the table from the counts at the first 시작!, and
by each page from its own hold). Practice (`NET.q !== 0`) holds nothing. The points per 판, the x2 last 판, the 보너스상 and
the tie-breaks decide the final standing exactly as today; trophies only read it.

---

## 3. Holding and settling

### 3.1 Hold at the first 판's 시작!

- **Host**: `updateCountdown`'s party branch (`else if (G.party && G.mini) {…}`) also calls `troHostGo()`. `troHostGo` drops
  its `G.party` return and gains, right after `mid` is known, `if (TRO.match && TRO.match.mid === mid) return;` (a party's
  later 판: already held - `TRO.match` keeps its `gg`, `st` and `pf`). `TRO.match` gains `pf: 0`. n = `G.players.length` and
  the 견습 flags are taken at that frame, as for a battle (a leaver during the first card or 3-2-1 is not counted).
- **Guest**: `guestHostIn`'s trophy line becomes
  `if ((g.m === 'b' || (g.m === 'p' && NET.pv >= PARTY_TRO_V)) && NET.q === 0 && NET.ms) { …as today… }`. The party's first
  `'p'` snapshot is its first 시작!; later 판's `'p'` snapshots find the mid in `TRO.seen`; phase `'d'` is only the final
  podium (cards are `'a'`, results `'r'`, 3-2-1 `'c'`).
- `troGuestGo`: `min = G.party ? PARTY_TRO_MINF / 60 * 1000 − TRO_SLACK_MS : NET.opts.time * 60000 − TRO_SLACK_MS` (105 s),
  and the consent test also checks the mode: `if (s > 0 && (s !== TRO.agreed || NET.mode !== TRO.agreedM)) return;`.
  Everything else (안 걸고 참여, `st`, `gg` when hidden) is the battle's.

### 3.2 Settle at the final standing (`troPartyResult(walk)`, **new**, host)

```js
  // host, in partyFinal after G.podium is set: the table over the final standing; void (refund at once) when nobody gave
  // up in a walkover, or when the party had under PARTY_TRO_MINF frames of play; else my row and the reliable 'tro'
  function troPartyResult(walk) {
    const M = TRO.match; TRO.match = null;
    if (!M || !G.online || G.role !== 'host' || M.mid !== NET.ms + '.' + NET.gid || !G.podium) return;   // (none before the first 시작!)
    const z = (sl) => (M.s > 0 && !M.st[sl] ? 1 : 0), pd = G.podium;
    const fin = pd.order.map((sl, i) => ({ slot: sl, pl: pd.pl[i] || i + 1, p: M.p[sl] | 0, z: z(sl) }));
    const left = M.slots.filter((sl) => !fin.some((f) => f.slot === sl) && M.gg.has(sl));
    const short = !walk && M.pf < troPartyMinF();
    const rows = short ? [] : troPartyTable(M.n, M.s, fin, left.length, left.filter(z).length, NET.gid);
    if (!rows.length) {
      troClose(M.mid, 'refund', short ? 'short' : 'void');
      if (short && NET.sess) NET.sess.send('*', { t: 'tro', m: M.mid, n: M.n, s: M.s, r: [], v: 1 });
      troPodium(M.mid, [], M.n, M.s, null, short ? 'short' : 'void'); return;
    }
    const res = troApply(M.mid, rows, 0, true, troPartyReal(fin.length));
    if (NET.sess) NET.sess.send('*', { t: 'tro', m: M.mid, n: M.n, s: M.s, r: rows });
    TRO.lastRes = { mid: M.mid, s: M.s };            // (the 파티 한 번 더 gate waits for each guest's 'cup')
    troPodium(M.mid, rows, M.n, M.s, res);
  }
  // the +5's real party: 2+ finishers and >= COIN.gameShots of my blows over the party (CO.pa, closed per 판)
  const troPartyReal = (nf) => nf >= 2 && !!CO.pa && CO.pa.shots >= COIN.gameShots;
```

- `partyResult` adds `if (TRO.match) TRO.match.pf += G.mini.t | 0;` (each 판's playing frames, golden goal included).
- `troPartyMinF()` is the debug override when one is set (9.1), else 0 in the debug fast party (`PARTY_FAST`: 12 s games,
  as `coinPartyNow` skips its play-time gate there), else `PARTY_TRO_MINF`.
- **Guest** (`troResultIn`): a party is recognised by its id, not by `G.party` (which `idleWorld` clears if the guest is
  already back in the room): `const party = !!CO.pa && CO.pa.gid === +mid.slice(7)`. For a party: first
  `if (CO.pa.go > CO.pa.seen) coinPartyClose(CO.pa.go)` (my last 판, if no `'r'` snapshot reached me yet), then
  `real = troPartyReal(rows.length)`. `m.v === 1 && !rows.length` → `troClose(mid, 'refund', 'short')` for my hold of that
  mid and `troPodium(…, 'short')`. Everything else (apply once, not before `min`, `cup` reply) is the battle's.

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
| A finished party under 2 minutes of play | refund at once (`tro.v`) | 2.3 |
| No result 15 s after my podium | refund | `troWait` on the `'d'` snapshot |

Nothing in the party changes these paths; the only new trophy code on them is the guest's `g.m === 'p'` gate (3.1) and
`troPartyResult` in `partyFinal`. `troStale` (15 min) still covers a crashed tab: a 5판 party is about 6.5 minutes.

---

## 4. Network (`NET_V` stays 4)

| Where | New | Validation / meaning |
|---|---|---|
| `hi` | `pa: 4` (`PARTY_V` 3 → 4) | unchanged code: in a party room a seat with `pa < 4` is never ready (`seatReady`), shows `새로고침 필요` (`seatOld`, `R.u`). party-net's crafted older guest sends `pa: 3`. |
| `R` (party rooms, room and game phase) | `pv: PARTY_V` | guest: `NET.pv = R.m === 'p' ? nInt(R.pv, 0, 99, 0) : 0`. A party is ranked for my trophies only with `NET.pv >= PARTY_TRO_V`: an older host's party (no `pv`) holds nothing for me (it would never send a result - a 6-trophy hold refunded after the podium, and a wrong `트로피 경기` line). +7 bytes. |
| `R.o[4]` | the stake now also in a party room | unchanged reads (`bet`); an older guest is gated out anyway. |
| `rd` | `md: 'b' \| 'p' \| 'c'` (the mode the guest saw) | host: a staked ready also needs `!('md' in m) ? NET.mode === 'battle' : m.md === modeCode()` - an older page's staked ready is accepted in a battle room only (in a party room `seatReady` refuses it anyway). Closes the race of a battle ready landing after a switch to a staked party. |
| `tro` | `v: 1` with `r: []` | a party too short to count: guest refunds its hold of `m` now. A hostile host could only refund me early. |
| `tro` rows | the battle's 6 elements, `r[4]` 0 | unchanged `troApply` / `troPodium`. |
| `gg`, `st`, `cup` | - | unchanged; matched to `TRO.match.mid`, which lives from the first 시작! to the podium. |

**Consent across modes.** Ready means ready for that stake **in that mode**: `TRO.agreedM` (**new**, beside
`TRO.agreed`) is set in `netReady` and reset with it. On the host, `netSetOpts` un-readies every guest when the mode
changes while `stakeNow() > 0` (the stake test `s0` alone no longer catches it: battle and party share `NET.opts.bet`).
On a guest, `guestRoom`'s consent line also fires on `NET.ready && stakeNow() > 0 && NET.mode !== TRO.agreedM`, with its
own 4 s message (7.1). At 안 걸기 a switch needs no new ready (a battle's 안 걸기 is not consent-gated either).

**Old pages.**

| Host | Guest | What happens |
|---|---|---|
| new (pa 4) | pa 3 page | never ready in a party room (`새로고침 필요`), as party-polish 6.1. Battle / co-op unchanged. |
| pa 3 page | new | no `R.pv`: the party is unranked for the new guest (no hold, no lines), as today. |
| new | new | the party trophies. |

---

## 5. Anti-farm and integrity

### 5.1 Per minute, a party never pays more than a battle

Place points and the +5 are the only trophies that are made (stakes only move). A ranked party pays the same `BASE` and
at most the same +5 as one battle, and takes longer:

| (4 players, 1st place, +5 included) | Shortest | Typical | Per minute (shortest / typical) |
|---|---|---|---|
| Battle, 2 min (the fastest option) | 2.1 min (3-2-1 + 120 s + podium) | 2.1 | **10.0** / 10.0 |
| Battle, 3 min (default) | 3.1 | 3.1 | 6.8 / 6.8 |
| Party 3판 | 2.4 min (≥ 2 min of play by the void rule + 3 cards, 3-2-1s and beats ≈ 23 s) | 3.8 | 8.8 / 5.5 |
| Party 5판 | 3.9 (three 60 s games at least + 5 cards, 3-2-1s and beats ≈ 39 s) | 6.3 | 5.4 / 3.3 |

Made per match (Σ BASE + the +5s): 4 players 20 + 15, 3 players 14 + 10, 2 players 6 + 5, the same in both modes; the
party's match is always the longer one. Without the 2-minute void, 3 players drowning themselves in both 물 of a
물 · 왕관 · 물 party (about 1.6 min) would make 14 + 10 per 1.6 min against a 3-player 2-minute battle's 14 + 10 per 2.1:
that is the gap the void closes.

### 5.2 Two friends trading wins, alts, practice

- **Two friends trading wins (2-player party, 100% / 0)**: per two parties each one nets (12 + s) + (−6 − s) = +6, plus one
  +5 (the loser is last: 꼴등 빼고) = **+11 per two parties**, the stake cancels out. A 1v1 battle gives the same +11 per two
  battles: 2.6 a minute each at 2 minutes; the party 2.3 at its shortest (2.4 min) and 1.45 typical. In 견습 (no place loss):
  +17 per two matches, battle 4.0 a minute, party 3.5 / 2.2.
- **Extra browser profiles** (the local-user limit of trophies.md 13): a real player with idle alts earns at most BASE[n][0]
  + 5 per party, at the party's pace (above): less per minute than the same farm in 2-minute battles. The +5 still needs
  5 of my own blows and comes from the shared daily 40.
- **Practice / same device**: unchanged `troPractice` - tabs of one browser (bc) and two players from one device's store
  make the whole party practice (no holds, the room says so). A guest whose own transport is bc, whose store is read-only,
  or who did not agree to the stake in this mode plays the party as practice for itself.

### 5.3 What each party can do (trophies.md 13, for a party)

| Who | Can | Cannot |
|---|---|---|
| Hostile host | Give me last place: −(stake + 6) per party, and not before 105 s of real time after my hold (my `min`: a ranked party has ≥ 2 min of play, so this is the battle's own check). Gift me trophies, claim practice, refuse to pay (refund after 15 s), void the party (`v: 1`: refund now), keep starting 파티 한 번 더 (I can leave at the podium for free). | Take more than I hold; apply twice; change my players or stake (my hold is the truth); hold a stake I did not agree to in this mode; make me pay a stake I did not put in (`row[5]`); make me hold over bc. |
| Hostile guest | As in a battle: lie about its count, skip its hold, send `gg` / `cup`, claim in `st` a stake it never held (the pot gets up to one stake nobody paid, split by place). | Change anyone else's count; block the result. |
| Local user | Alts on other devices, at the party's pace (5.2). | Beat the battle's pace. |

---

## 6. Cloud (`firebase/firestore.rules`): no change

- **Biggest single write**: the hold (−56) syncs at the first 시작!; the settle gives it back with the net and the +5. A
  finished party: at most 56 + 116 + 5 = **177**; a 기권승: 56 + 150 = **206**; both ≤ 250 (the rule's `rise <= 250`).
- **Time**: a finished ranked party has ≥ 2 min of play after the hold write, so `rise × 500 ≤ 10000 + dt` allows 260 by
  then: no split. A 기권승 can come seconds after the hold (everyone leaves); `clStep` splits a rise the rule would refuse,
  exactly as for a battle's early walkover. No coin write happens mid-party (`coinPartyNow` pays at the podium), so the
  slot's last write before the settle is the hold.
- `de` ≤ 40: the +5 comes from the same `DAY_CAP` 40. `g` +1 a party (≤ 20); `w` +0..1 (≤ the rise of `g`); `ko` +0 (a party
  has no 뽀득 KO). The invite rule already accepts `mode: 'party'`. Nothing to publish before this deploy.

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
- **Rules** (`partyRules(q)`: `PARTY_TX.noTro` is replaced by the trophy lines; the numbers from `troPartyTable` with
  n = the room's size clamped to 2..4, distinct places):
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

### 7.2 Countdown and the card

- **3-2-1 of the first 판** (`troCountSub`'s party branch: `partyRoundTx(true)` + this, only while `G.party.i === 0` online;
  later 판 unchanged): `1판 / 3판 · 트로피 10개씩 걸어요!` (class ` bet`), `1판 / 3판 · 트로피 경기`, practice `1판 / 3판 · 연습
  경기` (class ` prac`). The host's banner reaches guests in `g.bn` as today.
- **The first card**: a chip in the round line beside `#pg-party-x2`: **new** `<b id="pg-party-bet" class="pg-party-bet"
  hidden><canvas class="pg-ic pg-cup" width="8" height="8" aria-hidden="true"></canvas><span>10개씩</span></b>`, shown on the
  first card of a ranked staked party only (the hold comes at its 시작!), each page from its own `stakeNow()` / `NET.q`;
  `안 걸고 참여` when this seat plays without the stake. aria-label `트로피 10개씩 걸어요` / `안 걸고 참여해요`. Inline (no
  height): the round line `1판 / 3판` + the chip is about 9em, inside the 1x card's 17.4em (party.md 9.2). CSS as `.pg-party-x2`
  with `var(--duck)` on ink, like `.pg-badge.pg-bet`. Under 17em of height the round line hides (and the chip with it);
  the 3-2-1 sub still says it.

### 7.3 The final podium

`troPodiumUI`'s party branch becomes: `partyPodiumTitle()`, `partyPodiumUI()`, then the trophy pieces a battle has.

- **Blocks**: the 2nd line flips from the party points to cup + my change (`troPodLine`, unchanged; the points stay in the
  HUD panels and the sr line), then alternates with my coins (`coinPodLine`, unchanged). The flip happens for every
  ranked party, stake 0 too (place points).
- **Cups**: from every block with a loss to the blocks with a **gain**, best first, round-robin (`TRO.pod.party`; a
  battle keeps "to whoever took the pot"). At stake 0, one cup per losing block, as a battle.
- **`#pg-podium-bonus`** (every page, after my count-up): `오늘 트로피 보너스 +5`, `안 걸고 참여 · 오늘 트로피 보너스 +5`,
  `안 걸고 참여`; a short party `파티가 너무 빨리 끝나서 트로피는 그대로예요`. `partyPodiumUI` no longer hides it.
- **Tag**: `3판` / `5판` as today; `승급! 온탕 단골` (class `pg-promo`) replaces it after my count-up when I was promoted.
- **Note** (`#pg-podium-note`, one line): in this order - a void walkover `친구가 나가서 일찍 끝났어요 · 트로피는 그대로예요`; a
  paid walkover `친구가 나가서 일찍 끝났어요 · 기권승`; the host's blocked gate `트로피가 모자란 친구가 있어요 · 방으로 가서 걸기를
  바꿔요`; the tie notes (unchanged: `동점은 1등을 더 많이 한 친구가 위예요`, `동점은 마지막 판 등수로 정했어요`, `공동 2등!`); the
  host's `내 트로피가 모자라서 다음 파티는 안 걸고 해요` / `다음 파티는 안 걸고 하는 친구가 있어요`.
- **파티 한 번 더**: disabled while `!troCanRematch()` (host), as 한 판 더 (`primaryAction` and the click already check it;
  `partyPodiumUI` stops forcing `disabled = false`).
- **Guest wait line**: `방장이 다음 판을 고르고 있어요 · 다음 파티도 10개씩` (+ ` · 나는 안 걸고 해요`), stake 0 unchanged.
- **Screen reader** (`fillPodium`, unchanged code): `1위 방장 (꽥꽥이) 12점, … , 내 트로피 +26개, 오늘 트로피 보너스 +5개,
  지금 131개` + the coins; practice `, 연습 경기라 트로피는 그대로예요`; a short party `, 파티가 너무 빨리 끝나서 트로피는 그대로예요`.
- **Leaving** (unchanged code, now armed mid-party): `한 번 더 누르면 나가요 · 트로피 -16`, `한 번 더 누르면 모두 방으로 · 내
  트로피 -16`.
- **내 기록**: `<dt>배틀</dt>` → `<dt>배틀·파티</dt>` (the same `N승 / N판`).

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

New syllables (`최종`'s 종 is in `최종 순위`; `나눠요`, `너무`, `끼리` are new to the party text) are warmed by `PARTY_TEXT`.
party.js's font check covers them.

---

## 8. Code changes (`src/game.js` unless named)

| Where | Change |
|---|---|
| Top constants | `PARTY_V = 4`; `PARTY_SHARE`, `PARTY_TRO_V`, `PARTY_TRO_MINF` (2.1); the `PARTY_TX` keys of 7.4. |
| `troPartyTable`, `troPartyReal`, `troPartyMinF`, `troPartyResult` | **New** (2.1, 3.2). |
| `stakeNow` | `pvp() ? NET.opts.bet \| 0 : 0`. |
| `troHostGo` | No `G.party` return; `if (TRO.match && TRO.match.mid === mid) return;`; `TRO.match.pf = 0`. |
| `updateCountdown` | The party branch calls `troHostGo()` after `miniStart()`. |
| `partyResult` | `TRO.match.pf += G.mini.t`. |
| `partyFinal` | `troPartyResult(walk)` after `G.podium`, before `coinPartyNow` / `showOverlay('podium')`. |
| `guestHostIn` | The trophy line for `g.m === 'p' && NET.pv >= PARTY_TRO_V` (3.1). |
| `troGuestGo` | The party `min`; the mode in the consent test. |
| `troResultIn` | Party detection by `CO.pa.gid`, `troPartyReal`, `v: 1` (3.2); `troPodium(…)` gets `party` for the cups. |
| `troPodium` / `troPodiumTick` | `TRO.pod.party`; cups to the blocks with a gain (7.3); kind `'short'`. |
| `troPodBonus` | The `'short'` text. |
| `troPodiumUI` / `partyPodiumUI` | 7.3: the bonus line, the tag's 승급, the notes' order, the gate, the wait line. |
| `troCountSub` / `troCountCls` | The first 판's trophy part (7.2). |
| `fillParty` (card view) | The `#pg-party-bet` chip (7.2). |
| `partyRules` | The trophy lines (7.1); `troParts(s)` takes the party table in a party room (`troRulesLine` / `troFreeLine` call it). |
| `roomInfo` | `R.pv = PARTY_V` in a party room. |
| `guestRoom` | `NET.pv`; the mode-consent line and its message. |
| `netReady` | `TRO.agreedM = NET.ready ? NET.mode : ''`; `rd` gains `md`. |
| `netMsgIn` `'rd'` | The `md` test (4). |
| `netSetOpts` | A mode change while `stakeNow() > 0` un-readies every guest. |
| `troLowerStake` | Its message when `pvp()`. |
| `renderRoom` | The guest summary's `트로피 …` item in a party. |
| `buildOpts` | The 트로피 걸기 row `data-for 'bp'`. |
| `fillRec` / `src/page.html` | `<dt>배틀·파티</dt>`; the `#pg-party-bet` chip and its CSS. |
| `PG.debug.tro` / `PG.debug.party` | 9.1. |

About **220-260 changed lines** in `game.js`, ~10 in `page.html`, ~300 in tests.

---

## 9. Debug / test API and tests

### 9.1 Debug

- `PG.debug.tro.ptable(n, s, fin, gl, gz, rot)` (the pure table), `PG.debug.tro.partyMin(f)` (the void floor in frames;
  `null` = the default: 0 in the fast party, else `PARTY_TRO_MINF`), `state()` gains `agreedM`, `pv` and `match.pf`.
  `PG.debug.party.state()` is unchanged.

### 9.2 `src/tests/trophies.js` (virtual time)

1. `ptable` for n 2 / 3 / 4 x the 5 stakes matches 2.2's distinct table; every tie row of 2.2 at stakes 0 / 5 / 10 / 50;
   the leaver and 안 걸고 rows; `m = 1, gl = 0` → `[]`; a 기권승 pays the pot only.
2. Over random fins (seeded): Σ share === pot when a staker finished, 0 when none did; every net ≥ −(s + 6); ≤ +150;
   the remainder rotates with `rot` (three runs of 4p 1st = 2nd = 3rd at stake 5: each seat gets the extra once).
3. `apply` of party rows: the +5 once, none for the last place or a tie for it, none in a 기권승; a hostile row clamped as
   a battle's; `row[5] === 0` pays no stake.

### 9.3 `src/tests/trophies-net.js` (3 bc frames, real time)

- **Mode consent**: guests ready for a battle at 10; the host switches to 파티: every guest un-readied on both sides with
  `파티로 바뀌었어요: 10개씩 · 다시 준비해 주세요`; an `rd` with `md: 'b'` arriving after the switch is refused; back to 배틀
  at 안 걸기 un-readies nobody.
- **R in a party room**: `o[4]` the stake, `pv` 4, `R.f` for a short seat; the 트로피 걸기 row visible and enabled for the host.
- **Older host**: a party room's R without `pv` (patched host) → the new guest holds nothing at the first 시작!.

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

### 9.6 Jobs

No new run-all job (`trophies`, `trophies-net`, `party`, `party-fit-568`, `party-net` exist; `party` stays in CI `JOBS`).
One full suite run at the end (`node tools/run-all.js`), every Chrome run with `--mute-audio`.

---

## 10. Build order and effort

One lean build pass (engine + UI), one tests pass, one suite run (about the size of 안 걸고 참여). Each step leaves the game
working:

1. **Must**: the constants, `troPartyTable` + `PG.debug.tro.ptable`, trophies.js 9.2 (the numbers are the contract).
2. **Must**: the hold and the settle - `stakeNow`, `troHostGo`, `partyResult` / `partyFinal` → `troPartyResult`, the guest's
   `g.m === 'p'` line, `troGuestGo`'s min, `troResultIn`'s party real test; `PARTY_V` 4 and `R.pv`.
3. **Must**: the room - the 트로피 걸기 row for a party, the rules lines, the summary; mode consent (`agreedM`, the switch,
   `rd.md`).
4. **Must**: the podium - the party branch of `troPodiumUI` (bonus line, gate, notes, wait line), cups to the gains.
5. **Should**: the void under 2 minutes (`tro.v`, the short line); the countdown sub; `배틀·파티`.
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
3. **The 2-minute void** could void a rare honest 3-player 물 · 왕관 · 물 party, and **feat/party-games** may add games under
   60 s: a party of short games would then be void every time. That PR must re-check `PARTY_TRO_MINF` (a per-game
   minimum, or a lower floor with the guest's `min` lowered to match).
4. **Merges**: feat/party-games also bumps `PARTY_V` (the later PR takes the next; `PARTY_TRO_V` stays the version that
   first ranked parties) and edits `partyRules`, `partyPodiumUI`, `PARTY_TX`; it may add the host's party version to `R`
   too (party-polish 14.4) - then reuse it instead of `pv`. feat/toss edits `stakeNow`, `troHostGo`, `troCountSub` /
   `troCountCls` and the room's trophy lines: whoever lands second adds `AIT.on` to the new party branches (the texts of
   7.1-7.3). Trophies stay off in Toss even if a text is missed, because every hold and result goes through `troEscrow` /
   `troApply` / `troResultIn`.
5. **Older pages**: a cached pa-3 page must refresh to play a party (`새로고침 필요`); a new page as a guest of a pa-3 host
   plays its party unranked (no `R.pv`). Nothing on the wire can mint or lose trophies across versions.
6. **Tests that assumed no trophies in a party** (party-net's two checks, any count of `t === 100` after a party) must
   flip in the same PR.
7. **The 3rd place breaks even at stake 10 with 4 players** (+2 + 8 − 10 = 0) and loses a little at 20 / 50: intended
   ("차등"), but friends may read 0 as "nothing happened". The podium's flip shows `0` in the grey of a battle's 0.

---

## 12. Open questions for the owner (each with the default this spec uses)

1. A party at 안 걸기: a 트로피 경기 with place points (+16 … −6) and the +5, like a battle - or no trophies at all unless a
   stake is set? **Default: like a battle** (one rule for both modes).
2. The split 4명 50 / 30 / 20 / 0, 3명 60 / 30 / 10, 2명 100 / 0? **Default: as written** (constants, `PARTY_SHARE`).
3. A tie's leftover trophy (at most 2): rotated by the game id? **Default: rotated** (never always the host; the other
   choice is seat order).
4. A party under 2 minutes of play pays no trophies? **Default: yes** (keeps a party at or below a battle's pace; only a
   3-player 물 · 왕관 · 물 can be that short).
5. Party wins and games in the same 내 기록 row (`배틀·파티`)? **Default: shared** (separate counters need a new store
   version and a cloud rules change).
6. The stake chip on the first card only, or on every card? **Default: first card only** (the hold is at its 시작!; the
   last card already carries `점수 2배!`).
7. A switch between 배틀 and 파티 with a stake on un-readies everyone? **Default: yes** (ready means ready for that stake
   in that mode).
