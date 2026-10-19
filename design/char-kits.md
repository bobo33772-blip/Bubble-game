# 뽀득뽀득 목욕탕: character kits v4 (final spec)

Status: final design, ready to implement. It replaces the v3 perks (`game.js` L92-L93).
All line numbers refer to `src/game.js` at the time of writing. Every derived number was re-simulated with the engine's own integration (`y += (vy0 + vy) / 2`, `GRAV 0.22`).

---

## 0. Decisions in one table

The problem: on the 14 dry rounds and 3 dry arenas, the six animals differ only by capy walk x0.92, cat jump x1.08 and frog cooldown x0.7.

The fix: every animal gets a different **bubble** (visible on the first shot, on any stage) and a different **move** (on the JUMP button).

| | Role | Move (input) | Bubble (what it does) | Passive (kept) | 속도/점프/사거리/연사 |
|---|---|---|---|---|---|
| 꽥꽥이 duck | 만능 (all-rounder, beginner) | 둥실 활공: hold JUMP while falling | 메아리 거품: flies out, stops, comes back | no slowdown in water | 3 / 3 / 3 / 3 |
| 까삐 capy | 든든 (tank / support) | 털썩 엉덩방아: press JUMP in the air | 왕방울 거품: big (r 11), slow | hot-water shield | 2 / 3 / 2 / 3 |
| 해롱이 otter | 돌격 (brawler) | 휙 대시: press JUMP in the air | 물장구 거품: 3-way fan, short | swims x1.4 | 4 / 3 / 2 / 2 |
| 펭펭 penguin | 저격 (sniper on a sled) | 쭉 배미끄럼: press JUMP in the air | 고드름 거품: fast, 117 px | fast on ice, cold water | 5 / 3 / 5 / 1 |
| 냥냥 cat | 곡예 (acrobat) | 냥냥 2단 점프: press JUMP in the air | 털실 거품: rolls along the floor (air shots straight) | "냥!" water bounce | 3 / 5 / 3 / 3 |
| 개굴이 frog | 함정 (trapper) | 개굴 3단 뛰기: press JUMP right on landing | 개구리알 거품: stops and hangs as a trap | 연못 점프 (new, tiny) | 3 / 4 / 1 / 4 |

**No two animals share a movement verb:**
- duck: float sideways
- capy: drop and quake
- otter: flat air burst
- penguin: ground slide
- cat: second jump
- frog: rhythm hop chain

**No two share a bubble behaviour:**
- duck: boomerang
- capy: big and slow
- otter: spread
- penguin: fast and long
- cat: floor roller
- frog: stationary mine

**One rule to teach: "특기는 점프 버튼".** BUBBLE stays a plain bubble button, and autofire stays for everyone.

### 0.1 How the judges' disagreements were resolved

| Animal | J1 | J2 | Final | Why |
|---|---|---|---|---|
| duck bubble | 메아리 (echo) | 말랑 (bouncy) | **메아리** | 말랑 only shows when somebody bounces on it. The echo is visible on the duck's very first shot, and it is the simplest non-straight path: one axis, no tiles. 말랑 is the fallback. |
| otter bubble | 3-way fan | 물수제비 skip (116 px) | **fan** | The penguin takes long range. "Dash in, shotgun" against "slide to a lane, snipe" is a clean contrast. A 116 px skip plus a 117 px icicle would overlap. The fan's net pitfalls are fixed in §5. |
| penguin bubble | 고드름 (130 px) | 꽁꽁 frost | **고드름, 117 px (4.5 x 26)** | Frost changes nothing visible in battle (rival prisons are unchanged). Range is trimmed from 130 to 117 px because of J2's react-time concern, and rP 6 is kept. |
| cat bubble | yarn on the ground + straight in the air | 냥펀치 air diagonal | **J1 combo** | The rolling yarn is the most readable cat identity. Straight air shots keep fliers and the flying bosses at baseline, and they avoid J1's "double jump + downward shot" battle risk. 냥펀치 is the fallback. |
| frog bubble | 뽁뽁 rapid | 개구리알 egg | **개구리알** | 뽁뽁 is today's frog perk turned up, which is exactly what the user said feels "the same". Eggs give the frog a role no one else has. J2's prediction limit is kept (shot phase 104 f ≤ 110). J1's boss concern is met by lengthening the egg flight from 28 to 41 px. 뽁뽁 is the fallback. |
| capy, cat, otter, penguin, frog moves | | | agreed | Taken as the judges picked them. The frog uses the 3-hop chain (safe on touch), not the hold-through-landing crouch. |

---

## 1. Ground truth from the code (the numbers everything is built on)

| Thing | Code | Derived (simulated) |
|---|---|---|
| Gravity, fall cap | `GRAV 0.22`, `MAX_FALL 3.5` | |
| Walk | `WALK 1.25`, accel 0.5/f (`updatePlayer`) | |
| Jump | `JUMP_V -4.1` | apex **38.2 px** at f19, airtime 38 f, **46.6 px** across at walk |
| Bubble bounce | `BOUNCE_V -3.8` (`playerBubbles`, `guestBounce`: hold jump, falling, feet above the centre +3) | 32.8 px |
| Base shot | `SHOT_SPEED 3.5` x `SHOT_FRAMES 22`, spawn `p.x + facing*11`, `y = clamp(p.y-1, CEIL_Y, PF_BOT-18)`, r 8 (12 with shampoo), boss +2, spore +1 | 77 px |
| Fire | `SHOT_CD 14`, `AUTO_CD 24`; host limit 3 shots / 24 f (`hostShot`) | |
| Trap | `G.trapTime` 480→300 (battle 420), `SOAK_TRAP 1.5`, `SOAK_SLOW 0.5`, `PTRAP_FRAMES 240`, `OWNER_LOCK 60`, `TRAP_GRACE 15` | |
| Level rule | `levels.js` header + `tools/validate-levels.js`: a 4-row climb at JUMP_V −4.1 and walk 1.25 (capy 0.92 already validated) | **no kit lowers base jump or walks below x0.92** |
| Collision | interior `#` blocks are one-way with no side collision; only the outer walls (`wallClamp`) block sideways | no wall verbs |
| Body flags | guest `fl` (`guestSend`) bits 1..128 used; `parseBody` clamps 0..1023 | **256, 512 free** |
| Host P-row flags | `snapPlayers` bits 1..64 used; `guestPlayers` clamps 0..1023 | **128, 256 free** |
| Bubble-row flags | `snapBubbles` bits 1/2/4/8 used; `viewLists` clamps 0..255; the row carries owner and age | **16, 32 free** |
| Prediction | `updatePredicted` gives up at life 120 (seen) and only does `x += vx`; `snapBubbles` sends `sid` while age < 120 | **every shot phase ≤ 110 f**; one shared `stepShot` |
| Events | `netEv('s', name, n)`; guest keeps n in 1..99 and skips `who === localSlot`; `shake()` echoes to everyone | local shake must set `G.shake` directly |
| NO_ECHO | `jump shoot bounce splash pause start` | |

---

## 2. Shared rules (all six kits)

### 2.1 One kit table (replaces `CAPY_WALK`, `CAT_JUMP`, `FROG_CD`)

```js
// kept: CAPY_SHIELD 180, CAPY_SHIELD_CD 180, OTTER_SWIM 1.4, PENGUIN_ICE 1.3, PENGUIN_GRIP 0.09, CAT_HOP_V -3.6
const KIT_GATE = { airMin: 6, clear: 10 };
const KIT_BASE = { walk: 1, cd: [14, 24], shot: { ty: 'line', v: 3.5, f: 22, r: 8, rP: 8 } };
const KIT = {
  duck:    { walk: 1,    cd: [14, 24], shot: { ty: 'echo', v: 3.5, dec: 0.10, back: 2.6, f: 80, r: 8, rP: 8 },
             glide: { fall: 0.65, brake: 0.7, air: 1.15, max: 75, maxB: 60 } },
  capy:    { walk: 0.92, cd: [14, 24], shot: { ty: 'line', v: 2.8, f: 22, r: 11, rP: 10, scale: 1.25 },
             slam: { clear: 16, wind: 8, vy: 5.0, rec: 14, cd: 45, dx: 36, up: 24, dn: 8, soak: 300, hop: -1.6, bossCd: 90, rate: 40 } },
  otter:   { walk: 1.12, cd: [16, 26], shot: { ty: 'fan', v: 3.6, f: 16, r: 8, rP: 8,
               drop: { vx: 3.3, vy: 0.75, f: 13, r: 6, rP: 6, rivalAge: 8 } },
             dash: { v: 3.2, f: 10, cd: 20 } },
  penguin: { walk: 1,    cd: [20, 32], shot: { ty: 'line', v: 4.5, f: 26, r: 8, rP: 6 },
             slide: { diveVx: 2.6, diveVy: 1.8, v: 2.6, held: 0.985, free: 0.97, ice: 0.997, brake: 0.18,
                      end: 1.3, max: 90, bonk: 10, carry: 0.995, carryOpp: 0.25 } },
  cat:     { walk: 1,    cd: [14, 24], shot: { ty: 'yarn', v: 2.0, vy: -1.0, g: 0.16, hop: -1.8, keep: 0.92, lands: 3, f: 64, r: 8, rP: 8 },
             airShot: 'base', dj: { vy: -3.4, curl: 10 } },
  frog:    { walk: 1,    cd: [12, 20], shot: { ty: 'egg', v: 4.2, decay: 0.92, go: 18, hold: 86, holdB: 70, cap: 3, capB: 2, r: 8, rP: 8 },
             hop: { mul: [1, 1.12, 1.24], mulB: [1, 1.10, 1.20], win: 8, winB: 6 } },
};
const kitOf = (pl) => (!pl || G.perksOff || !isChar(pl.char) ? KIT_BASE : KIT[pl.char]);
```

- `perk()` (L765) stays as the gate for the old water and ice passives.
- `kitOf()` gates everything new.
- The slippers stack on top of every kit (walk x1.4, base `JUMP_V` x1.08).
- Shampoo rules are given per bubble below. Every shampoo variant keeps the shot phase ≤ 110 f.

### 2.2 Inputs and the shared air-move gate

| Input | Animals | Touch |
|---|---|---|
| press JUMP in the air (2nd tap) | capy, otter, penguin, cat | tap JUMP again (`latch` edge, `bindTouch` L4080) |
| hold JUMP while falling | duck | keep the thumb on JUMP |
| press JUMP within 8 f after landing (the 5 f `JUMP_BUF` also counts before it) | frog | tap JUMP as the frog lands (~217 ms window) |

No double-tap of a direction and no hold-to-charge. Autofire (`AUTO_CD`) is untouched for all six.

```js
// one special per airtime; never in the first 6 airborne frames; never when about to land or bounce
function airMoveOk(p, inp, clear) {
  if (!inp.jumpP || p.onGround || p.water || p.coyote > 0 || p.airT < KIT_GATE.airMin || p.mvUsed || p.mvCd > 0 || p.mv) return false;
  if (landTile(p.x + 3, p.x + 13, p.y + 16, p.y + 16 + clear) !== null) return false;   // landing soon: the buffered jump wins
  if (waterIdx(p.x + 8, p.y + 16 + clear) >= 0) return false;                            // splashing down soon
  if (p.vy > 0 && bubbleBelow(p, clear)) return false;                                    // over a bubble: holding jump bounces
  return true;
}
// bubbleBelow: any float-state, non-'player' bubble with circBox(b.x+8, b.y+8, 7.5, p.x+2, p.y+16, 12, clear)
```

- The check runs in `updatePlayer` **before** `if (inp.jumpP) p.jumpBuf = JUMP_BUF`. A consumed press sets no buffer.
- A failed gate leaves the press as today's 5-frame buffered jump, so no jump is ever eaten.
- `clear` is 10 px, or 16 px for the capy.
- `airMin 6` (100 ms) filters key bounce at take-off. A deliberate double tap takes ≥ 120 ms.

### 2.3 Body fields, lifecycle and resets

- New body fields go in `bodyAt()` (L731) and in the reset in `takeOver()` (L5210): `airT, mv, mvT, mvD, mvUsed, mvCd, glideT, carry, hop, hopAir, landT, mvA, mvB`.
  - `mv` is one of `'' | 'glide' | 'wind' | 'slam' | 'rec' | 'dash' | 'dive' | 'slide' | 'bonk' | 'curl'`.
- `airT`: 0 while `onGround` (floating in water counts as ground), +1 per airborne frame.
- `mvUsed` resets on:
  - landing;
  - entering water;
  - a bubble bounce (`playerBubbles` / `guestBounce`);
  - the cat's "냥!" hop;
  - any `ep` change (`placePlayer`, `takeOver`, `trapPlayer`, `releasePlayer`, `knockOut`).
- `glideT` and `carry` reset on landing, water and a bounce.
- `endMove(p)` sets `mv = ''`, `mvT = 0` and keeps `vx`/`vy`. It is called by:
  - `stunPlayer()` (host);
  - the battle-hit branch of `guestSelf()`;
  - `trapPlayer()` and `releasePlayer()`.

  A stunned capy that was slamming just falls, with no quake.
- **No move gives invulnerability, changes the 12x14 hit/capture box or grants enemy immunity.** This is what keeps every animal trappable and keeps solo honest.
- `physBody(b, g = GRAV, maxFall = MAX_FALL)` gains two optional parameters (glide, dash, wind-up, slam). Enemies keep the defaults.

### 2.4 Body bits (pose for viewers; effects come from edges)

| Guest body `fl` (`guestSend`) | Host P-row `fl` (`snapPlayers`) | Name |
|---|---|---|
| 256 | 128 | **A**: move active (meaning per animal below) |
| 512 | 256 | **B**: move phase 2 |

- `hostInputs` copies them to `pl.mvA` / `pl.mvB` and stamps `pl.mvAAt = G.frame` while A is set.
- `hostDisplayIn` / `hostDisplayOut` and `guestPlayers` (peer stream `a.fl`, or the P row) set `mvA` / `mvB` on viewers.
- Viewers detect rising and falling edges per player and draw the cosmetic effects at the streamed spot: puffs, rings, afterimages, splash.
- **The only world change that becomes a message is the capy quake (§4).**

### 2.5 Bubbles: one spec, one stepper, host-only state

- `newShot(p, air)` is a pure function that returns 1-3 bubble specs from `kitOf(p)`. Both `fire(p, air)` (host) and `guestFire` (prediction) use it.
- At fire time each bubble stores host-only fields: `ty, r, rP, dir, v, ph, born, vol, lands, k`.
  - `k` is the char index, for the host's own drawing.
  - These are never derived later from a player lookup. A player who left must never change a flying bubble.
- `stepShot(b)` advances one frame of the shot phase for every `ty`. It is used by:
  - the `updateBubbles` shot branch (L1389, which replaces `b.x += b.vx`);
  - `updatePredicted` (L5420, which replaces `pb.x += pb.vx`).

  Shot bubbles get `y` motion, clamped to `CEIL_Y..PF_BOT-14`, and never `wrapY`.
- Capture radii become fields:
  - `captureCheck`: `b.r`;
  - `playerTrapCheck` and `lagTrapCheck`: `b.rP`;
  - `bossShotCheck`: `b.r + 2`;
  - `sporeShotCheck`: `b.r + 1`.

  This replaces the five hard-coded `b.big ? 12 : 8`. Shampoo is already included in `r` / `rP`.
- `trapPlayer` and `trap` reset the traits (`ty = 'line'`, `drop = false`, `r = rP = 8`). The `lagTrapCheck` replacement bubble copies `r`, `rP` and `owner`.
- **Prediction reconcile (new, all types):** in `updatePredicted`, once the matched host row is visible and `|pred − row| > 6 px` on either axis, the prediction ends and the host row shows. This keeps a diverged yarn or egg honest.

### 2.6 How bubbles look in multiplayer (who and which animal)

- **Film tint = animal hue** (alpha 0.30) in solo and multi.
- **A 1 px ring in the slot colour** (r 8.5, scaled with size, alpha 0.9) on every player-owned bubble in multi. Ownership stays readable even where hue and slot colour coincide (duck/yellow, otter/mint, penguin/sky).
- **5x5 animal glyph** drawn at the bubble centre, 1 px low.
- Per-animal shape, trail and pop. Pop bursts use `[slotCol (multi only), hueA, hueB]`.
- Looks are derived on viewers from `owner slot → G.players → char`, the row state and age, and the two new bubble bits (16 droplet, 32 yarn). A missing owner, or `owner < 0` (stamp/steam), gets today's look.
- Trails spawn only while `G.parts.length < 300`. Afterimages, trails and rings are culled under `reducedMotion()`; glyph and film stay.

### 2.7 Sound rules

- Each animal's shoot sound replaces `shoot` when perks are on. Shoot sounds are local and in `NO_ECHO`, like `shoot`.
- The first pop of a player-owned bubble plays `pop` with `n = animal index 1..6`. It is echoed, and the chain ladder (`chain`) is unchanged.
- Move sounds are local (`NO_ECHO`).
- `quake` is echoed with `NET.who = slot`, so the capy's own guest does not hear it twice.
- The full recipe list is in §10.

### 2.8 능력 끄기 (`G.perksOff`, battle only; L961 `resetGame`)

`kitOf()` returns `KIT_BASE` for every animal:
- walk 1.25 and `JUMP_V −4.1`;
- straight 3.5 x 22 shot, r 8 / rP 8, CD 14/24 with autofire;
- bounce −3.8, `EMPTY_LIFE 720`;
- no air move (an air press is the plain buffered jump), no glide, no hop chain;
- no passives (`perk()` already gates them), no quake (the host rejects `qk`), no capy shield;
- body bits A/B are never set;
- the cat's `a` flag is ignored.

**Look and sound return to exactly today's:** white bubbles with the slot tint, scale 1.0, no glyph, ring or trail, and the base `shoot` / `pop`. Nothing on screen then suggests a mechanic that is off, and the result can be pixel-tested (§13).

---

## 3. 꽥꽥이 (고무 오리): duck

**Role:** 만능 (all-rounder), the beginner pick ("처음이라면 꽥꽥이!").

**First 5 s:** the first bubble flies out, stops and comes back past the duck. Holding JUMP after a jump makes it float down.

**Stats:** walk 1.25 (x1.00); jump −4.1 (38.2 px); CD 14/24. Bars: 속도 3, 점프 3, 사거리 3, 연사 3.

### Move: 둥실 활공 (word "둥실~")

- **Input:** hold JUMP while falling.
- **Conditions:** `vy > 0`, airborne, not in water, `mv === ''`, `glideT < max` (75 f; battle 60).
- **Each gliding frame:**
  - `if (vy > 0.65) vy = max(0.65, vy * 0.7)`, then `physBody(p, GRAV, 0.65)`;
  - air target speed x1.15 (1.44 px/f);
  - `glideT++`.
- **Releasing JUMP** drops normally; re-holding resumes until the meter is spent.
- **Refill:** landing, water, bubble bounce. A bounce works mid-glide as today.
- **Numbers:**
  - flat jump + hold: **110 px** across, 79 f airtime (base 46.6 px / 38 f);
  - from a ledge: 75 f glide = 108 px across for a 48 px drop.
- **Cooldown:** the meter only.
- **Side:** guest body only.
- **Net:** bit A = gliding.
- **Look:**
  - `duck_glide` (16x16, 2 frames: wings up / down) alternating every 6 f, every 3 f in the last 15 f of the meter;
  - fallback `duck_jump` with `sq ±0.08`;
  - 2 white puff pixels under the body every 10 f (life 10, g −0.02).
- **Sfx:** `flap` (local), every 12 f while gliding.

### Bubble: 메아리 거품 (echo; a quack echoing off the tiles)

- **Path (`ty 'echo'`, pure from launch + walls):**
  - out phase: `x += dir*v; v -= 0.10` from 3.5; it turns when `v ≤ 0` at **age 35, 63 px** from the spawn;
  - back phase: `v = min(2.6, v + 0.10); x -= dir*v`; it passes the spawn x at age 72;
  - the capture phase ends at **age 80, 21.5 px behind the spawn** (≈10 px behind the duck's body), then the bubble floats;
  - `y` is constant.
- **Walls:**
  - a wall in the out phase starts the back phase at once, with `v = 0.6 * v`;
  - a wall in the back phase ends the shot (float);
  - spawning inside a wall: today's float rule.
- **Radii:** r 8, rP 8. The duck's own bubble passes through the duck: shot-state bubbles are never touch-popped, and `trappable` excludes the owner.
- **Shampoo:** r 12 / rP 12, deceleration 0.08 (turns at age 44, 78 px out), phase still 80 f.
- **Look:**
  - film `#ffe36b`; glyph `icon_duck` (yellow head, orange beak `#ff8c1e`);
  - while shot, two 1 px 70° arcs (r 10 alpha 0.5, r 13 alpha 0.3, `#ffe36b`) on the side opposite the motion; viewers take the motion side from consecutive interpolated x;
  - at the turn, a ring r 8 → 14 over 8 f (`#fff3a8`); viewers draw it when they see the direction flip;
  - pop: 8 particles `['#ffe36b','#fff3a8','#ffffff']` at speed 1.5, plus a 1 px ring r 4 → 12 over 8 f.
- **Sfx:**
  - `b_echo` (local): n=0 shoot "삑"; n=1 turn "삐요", played by the owner's engine only (host-local owner or the guest's prediction);
  - pop: `pop` n=1 (echoed).

**Passive (kept):** 물에서도 느려지지 않아요.

**Solo / boss:**
- Two passes per shot make up for the 63 px forward reach, and the return catches enemies sneaking up behind.
- Gliding floats over the 왕때꼬마 shockwaves (harmless for 5 f, full height after 9 f) and keeps the duck near its apex longer for shots at 곰팡이 여왕 and 타올 대마왕.
- It never shoots weaker than the old duck.

**Battle:**
- The return traps a rival who jumped the outgoing bubble.
- **Counterplay:** the path is fixed and the return is slow (2.6 px/f), so step back in after it passes. A gliding duck is a slow, predictable target (0.65 px/f fall) with no burst escape.
- **Knobs, in order:** back 2.6 → 2.2; shot phase 80 → 70 (shorter return); glide battle 60 → 45.

**Co-op:** the return covers partners standing behind the duck. Gliding reaches high trapped bubbles and risen ghosts (`GHOST_RISE_MAX 36`).

---

## 4. 까삐 (카피바라): capybara

**Role:** 든든 (tank / support). Crowd control where it lands.

**First 5 s:** huge, slow peach bubbles. The second JUMP in the air goes "털썩!" with a hot-water splash ring.

**Stats:** walk 1.15 (x0.92, already validated); jump −4.1; CD 14/24. Bars: 속도 2, 점프 3, 사거리 2, 연사 3. The card badges explain its strength: "왕방울 · 온탕 보호막".

### Move: 털썩 엉덩방아 (ground pound; word "털썩!")

- **Input:** press JUMP in the air (gate `clear` 16 px).
- **Wind-up, 8 f (`mv 'wind'`):**
  - `vx = 0, vy = 0`, `physBody(p, 0)` (hangs);
  - facing locked, `sq −0.15`.
- **Slam (`mv 'slam'`):**
  - `vy = 5.0`, `physBody(p, GRAV, 5.0)`, `vx = 0`, no steering;
  - from a 38 px apex it lands **16 f after the press** (a normal fall from the apex takes 19 f);
  - **no bubble bounce while slamming** (gate in `playerBubbles` and `guestBounce`); floating bubbles it touches are popped by the existing touch rule (trapped enemies pay out; a rival prison is a KO).
- **Landing** (platform, floor, ice top, or water entry; water is detected as `p.water && !wasW`, because `floatBody` damps the fall):
  - quake (below);
  - **recovery 14 f** (`mv 'rec'`): no walk, no jump, `vx = 0`, shooting allowed;
  - then `mvCd = 45`.
- **Drain wrap:** if `wrapY` moves the capy during the slam (y jumps up by more than 100 px), the slam ends as a normal fall with no quake, and `mvCd` is 45.
- **Quake (host world, `quake(pl, x, y)`):**
  - box: capy centre x ± **36 px**, enemy feet inside [capy feet − 24, capy feet + 8];
  - each `grime` / `mold` / `sponge` in the box (never `fly`, which has no `_soaked` sprite) in state `active`:
    - `soakT = max(soakT, 300)` (5 s). This reuses 불은 때: speed x0.5, trap time x1.5, points x2, and snapshot enemy bit 2 already carries it;
    - if `onGround`: `vy = −1.6` (a little hop);
    - sponge: `windT = 0, chargeT = 0, chargeCd = max(chargeCd, 60)`;
  - floating empty bubbles with their centre in the box: `vy −= 1.0` (a jiggle);
  - boss in `fight` overlapping the box: `bossSoap(megaSponge && act === 'dizzy' ? 2 : 1)`, at most once per 90 f per capy (`pl.qkBoss`);
  - **rivals: never.** No host-to-guest body impulse exists, and a stun already gives 90 f of invulnerability;
  - `Snd.sfx('quake')`.
- **Look:**
  - `capy_slam` (16x16, 1 frame: curled, rump down); fallback `capy_fall` with `sq`;
  - two 1 px white speed lines 6 px long above the capy while slamming;
  - landing:
    - an ellipse ring 16 → 72 px wide, 6 px tall, over 12 f, stroke `#ffd6e0`;
    - 14 `HOT_COLS` droplets flung sideways (vx ±0.6..1.6, vy −0.8..−1.6, g 0.12);
    - `sq 0.32`;
    - **local** shake 1.5: `G.shake = max(G.shake, 1.5)` on the capy's own screen, never `shake()`.
- **Sfx:** `slam` (local, wind-up "뿅"); `quake` (echoed by the host).
- **Side:** wind-up, slam and recovery run in the guest body sim; the quake runs in the host world.
- **Net:**
  - bit A = wind-up or slam; bit B = recovery (its rising edge is the splash moment for viewers);
  - **the one new reliable message**, guest → host: `{t:'qk', x, y, ep}`.
  - **Host validation (`hostQuake(pl, m)`), all must hold:**
    1. `G.mode === 'playing'`, `pl.char === 'capy'`, `!G.perksOff`, `free(pl)`, `!(pl.stunT > 0)`, `ep === pl.ep`;
    2. `|x − pl.x| ≤ 24 && |y − pl.y| ≤ 24` against the host-known body;
    3. `G.frame − pl.mvAAt ≤ 30` (an A bit was seen recently);
    4. `G.frame − (pl.qkAt|0) ≥ 40`.

    Then `pl.qkAt = G.frame; NET.who = pl.slot; quake(pl, x, y); NET.who = −1`.
  - A host-local capy calls `quake()` directly, the same split as `fire` / `guestFire`.
  - **The host bounce gate:** `hostInputs` only turns `st.fl & 16` into `inp.jump` when `!(pl.char === 'capy' && pl.mvA)`. Otherwise the host would "bounce" a slamming capy and keep a bubble the capy popped on its own screen.

### Bubble: 왕방울 거품 (big onsen bubble)

- 2.8 px/f x 22 f = **61.6 px**.
- Capture **r 11** against enemies (boss 13, spore 12); **rP 10** against rivals.
- Shampoo: r 15 / rP 14, 33 f (92 px).
- **Look:**
  - film `#ffa98a`; drawn scale 1.25 (1.5 with shampoo);
  - glyph `icon_capy` (yuzu `#ffc928` with one `#3cc464` leaf pixel);
  - steam: two white dots rising 0-6 px above the bubble top, offset by `(age % 12) / 2` and fading alpha 0.6 → 0. Drawn from `age`, so viewers need no particles;
  - pop: 12 particles `['#ffd6e0','#ffffff','#ffa98a']` at speed 1.0, life 18, plus `foamPuff(cx, cy, 3, 12, 2)`.
- **Sfx:** `b_onsen` (local shoot "뽀옹"); pop `pop` n=2.

**Passive (kept + fixed):** 온탕 보호막.
- Entering hot water gives the one-hit shield for 180 f, re-armed 180 f after it ends (`CAPY_SHIELD`, `CAPY_SHIELD_CD`).
- **Host validation (closes the trust gap at L4818):** in `hostInputs`, a rising `st.sh` (above `pl.shieldWas`) is accepted only if all hold:
  - `pl.char === 'capy'` and `!G.perksOff`;
  - `st.fl & 2` (in hot water in the same report);
  - `st.sh ≤ 180`;
  - `G.frame − (pl.shAt ?? −1e9) ≥ 348` (360 minus 12 f of jitter).

  Then `pl.shAt = G.frame`; otherwise `pl.shieldGone = true`.

**Solo / boss:**
- r 11 (boss 13) makes flies and every boss easy to hit despite the 62 px range.
- The quake adds +1 soap per 90 f near ground bosses (왕때꼬마, 대왕 수세미; +2 while it is dizzy).
- Against the fliers the slam is a fast vertical dodge of the mitt rain.
- The 1.15 walk still outruns angry grime (0.6 x 1.6 = 0.96 px/f).

**Battle:**
- The easiest trap to land (rP 10) on the slowest body.
- **Counterplay:** jump the 2.8 px/f bubble (38 px apex against its 22 px height); stay beyond 62 px; punish the 14 f recovery.
- **Knobs:** rP 10 → 9; speed 2.8 → 2.6; CD 14 → 16; quake soak 300 → 180.

**Co-op:**
- "꽁꽁 불은 때": a quake right before partners shoot. Soaked grime is trapped x1.5 longer and worth x2, so whole floors can go in one 뽀득 chain.
- With the frog, soaked walkers reach the eggs at half speed.

---

## 5. 해롱이 (해달): otter

**Role:** 돌격 (brawler). Dash in, fire point-blank.

**First 5 s:** the fastest walker. Every shot sprays three bubbles. The second JUMP in the air zips it sideways.

**Stats:** walk 1.40 (x1.12); jump −4.1; CD 16/26. Bars: 속도 4, 점프 3, 사거리 2, 연사 2.

### Move: 휙 대시 (air dash; word "휙!")

- **Input:** press JUMP in the air (gate `clear` 10 px).
- **Behaviour:**
  - `d` = held direction, else facing;
  - for **10 f**: `vx = d * 3.2`, `vy = 0`, `physBody(p, 0)` → **32 px** flat;
  - facing locked to `d`;
  - then normal physics (accel 0.5 back to 1.40 in 4 f); `mvCd = 20` after it ends; once per airtime.
- Jump + dash at the apex covers 86 px (53 px without).
- **Rules:**
  - the outer walls stop it (`wallClamp`), and a wall hit ends the dash;
  - interior blocks have no side collision, as when walking;
  - it pops floating bubbles it touches and enemies hurt as normal;
  - it can shoot during the dash;
  - no bounce (`vy = 0`).
- **Side:** guest body.
- **Net:** bit A = dashing.
- **Look:**
  - `otter_dash` (16x16, 1 frame: stretched swim pose); fallback `otter_jump` with `sq +0.18`;
  - 3 afterimages at the positions 2/4/6 f back, alpha 0.30/0.20/0.10 (viewers keep the last 6 drawn positions);
  - 2 `#8fe3ff` droplets per frame behind (g 0.08, life 10).
- **Sfx:** `dash` (local).

### Bubble: 물장구 거품 (3-way splash fan)

- **Centre:** 3.6 px/f x 16 f = **57.6 px**, r 8, rP 8.
- **Two droplets:** `vx 3.3*dir`, `vy −0.75` and `+0.75`, 13 f → **42.9 px** forward and ±9.75 px off-axis, r 6 (spores 7).
  - They catch **rivals only while `age ≤ 8`** (≤ 26 px, ±6 px: a point-blank shotgun), rP 6.
  - At the end of their shot phase they burst (`popBubble(b, null, 'self')`, no score) and never float, so each volley leaves at most one floating bubble.
  - They never freeze (`tryFreeze` skips droplets).
- **Boss:** all three bubbles of a volley share `b.vol`. `bossShotCheck` pops a repeat without soap when `G.boss.lastVol === b.vol`, so a volley gives at most 1 soap.
- **Shampoo:** centre 24 f (86 px); centre r 12 and droplets r 10.
- **Host:**
  - `fire` builds three bubbles and returns the centre, which gets the `sid`;
  - each calls `shotHits(b, true)` as today;
  - `lagTrapCheck` applies the droplet window as `hist[i][0] − b.born ≤ 8`;
  - `MAX_BUBBLES` is unaffected (droplets are never float empties).
- **Net:**
  - bubble-row bit **16 = droplet** (0 extra bytes);
  - `guestFire` predicts all three, and only the centre has a `sid`;
  - the predicted droplets burst locally at age 13;
  - the owner hides its own host droplet rows (`bit 16 && owner === localSlot && kind 'empty' && state 'shot'`).
- **Look:**
  - film `#5fe0c8`;
  - centre glyph `icon_otter` (grey pebble `#8c8ca6` with a white glint);
  - droplets drawn at scale 0.65 with no glyph and a 2 px `#bff7ee` teardrop tail;
  - the centre drips `#8fe3ff` every 3 f (g 0.1, life 12);
  - pop: 8 droplets `['#5fe0c8','#bff7ee','#ffffff']` with g 0.12; a droplet's self-burst is 3 droplets.
- **Sfx:** `b_splash` (local shoot "촵"); pop `pop` n=3 "퐁".

**Passive (kept):** swims x1.4 (`OTTER_SWIM`).

**Solo / boss:**
- The fan covers fliers above and below.
- The droplets clean up the 곰팡이 여왕's spores.
- One soap per volley keeps boss damage close to the duck's (1 per 16 f against 1 per 14 f).
- The dash clears charges and swoops.

**Battle:**
- Dash in, then fire point-blank.
- **Counterplay:** stay more than 60 px away; the penguin and capy lanes outrange it; the dash is used up for that airtime.
- **Knobs:** droplet rival window 8 → 5 f; dash cd 20 → 30; CD 16 → 18; walk 1.12 → 1.08.

**Co-op:** the fastest reviver (dash into a ghost's 12 px reach) and the spore cleaner.

---

## 6. 펭펭 (펭귄): penguin

**Role:** 저격 (sniper on a sled). It slides to a lane and fires the longest shot.

**First 5 s:** the bubble zips across the room. The second JUMP in the air dives into a belly slide.

**Stats:** walk 1.25 (x1.00, accel 0.5 off ice); slide 2.6; jump −4.1; CD 20/32. Bars: 속도 5, 점프 3, 사거리 5, 연사 1.

### Move: 쭉 배미끄럼 (dive + belly slide; word "쭉~")

- **Input:** press JUMP in the air (gate `clear` 10 px). From the ground: jump, then press again ≥ 6 f later (hop-dive, ≈21 px up).
- **Dive (`mv 'dive'`):**
  - `d` = held direction, else facing; `vx = d * 2.6`, `vy = max(vy, 1.8)`;
  - normal gravity, no steering, facing locked;
  - from the apex it lands in 13 f, 34 px forward.
- **Slide on landing** (block, floor or ice; `mv 'slide'`): `|vx| = max(|vx|, 2.6)` along `d`. Per frame:
  - `d` held: x0.985 → **87 px**, 46 f;
  - no direction: x0.97 → 44 px, 23 f;
  - opposite: −0.18 → stops in 8 f;
  - on ice: x0.997 → up to 205 px.

  It ends below 1.3 px/f or at 90 f, and normal walking resumes.
- **Slide-jump:**
  - JUMP during the slide is a normal −4.1 jump that keeps `vx` (`carry`);
  - in the air `vx *= 0.995` per frame while the direction is held or none; opposite input uses accel 0.25;
  - long jump **76-90 px** (from slide speed 2.2-2.6) against 46.6 px;
  - a new airtime allows another dive, so stairs chain.
- **Other rules:**
  - sliding off a ledge keeps `vx` with `carry`;
  - **wall during the slide** (`wallClamp` hit): `vx = 0`, **bonk 10 f** (`mv 'bonk'`: input ignored, `sq 0.3`, word "콩!"); interior blocks cannot bonk;
  - water ends the dive or slide;
  - a bubble bounce during the dive (jump held) bounces as normal, ends the dive and refreshes `mvUsed`;
  - no i-frames; enemies hurt; the 12x14 box is kept.
- **Side:** guest body.
- **Net:** bit A = dive; bit B = slide.
- **Look:**
  - `penguin_slide` (16x16, 1 frame: lying, beak forward) drawn 3 px lower; fallback `penguin_fall` rotated 90° (as `drawEnemy` dead);
  - ice sparkles `#ffffff`/`#bff0ff` behind every 3 f; skid dust on landing.
- **Sfx:** `slide` (local): n=1 dive, n=2 slide swish, n=3 bonk.

### Bubble: 고드름 거품 (icicle)

- 4.5 px/f x 26 f = **117 px** in a straight line.
- r 8 against enemies (boss 10, spore 9); **rP 6** against rivals.
- No tunnelling: a 12 px box overlaps for ≥ 5 f.
- Shampoo: r 12 / rP 10, 39 f (to the wall).
- **Look:**
  - film `#9fdcff`; drawn 1.15x wide and 0.87x tall while shot;
  - glyph `icon_penguin` (white 5x5 snowflake);
  - contrail: dots 6/11/16 px behind, `#ffffff`/`#bff0ff`/`#7fd0ee`, alpha 0.8/0.5/0.3 (from position and direction, no particles);
  - pop: 8 `ICE_COLS` shards at speed 1.6, g 0.1, plus two 3x3 white crosses.
- **Sfx:** `b_icicle` (local shoot "슝"); pop `pop` n=4 "쨍".
- **Host:** plain line motion through `stepShot`; cold-water freezing as now.

**Passive (kept):** ice x1.3 / grip 0.09; no slowdown in cold water.

**Solo / boss:**
- The safest boss damage, from 117 px.
- 대왕 수세미's cold floor pool turns into long ice slides.
- The dive dodges charges.
- The slide is optional: plain walking is base speed.

**Battle:**
- It owns long lanes.
- **Counterplay:** play vertically; get in close (otter dash, cat); punish the 20 f gap after a miss. The dive is visible and the slide cannot steer, so shoot along the floor ahead. A penguin sliding at you meets your bubble at 6.1 px/f closing speed.
- **Knobs:** rP 6 → 5; frames 26 → 22 (99 px); CD 20 → 22; held decay 0.985 → 0.98.

**Co-op:** it picks off enemies chasing partners from across the room. Slide-jumps reach ghosts. Its cold-tub ice blocks are platforms for everyone.

---

## 7. 냥냥 (고양이): cat

**Role:** 곡예 (acrobat). Vertical reach.

**First 5 s:** it jumps again in mid-air. A bubble blown on the ground bounces along the floor like a ball of yarn.

**Stats:** walk 1.25; jump −4.1 (the old `CAT_JUMP 1.08` is retired) plus the double jump = **64.4 px**; CD 14/24. Bars: 속도 3, 점프 5, 사거리 3, 연사 3.

### Move: 냥냥 2단 점프 (word "냥냥!")

- **Input:** press JUMP in the air (gate `clear` 10 px).
- **Behaviour:**
  - `vy = −3.4` (+26.3 px; 64.4 px total when used at the apex);
  - `vx = dir * walk` if a direction is held (mid-air turn), otherwise unchanged;
  - `sq −0.3`; once per airtime.
- **Refresh:** landing, the "냥!" water hop, a bubble bounce. Battle knob 1 removes the bounce refresh.
- **Side:** guest body only; no message.
- **Net:** bit A for 10 f after the double jump (`mv 'curl'`; it does not block anything).
- **Look:**
  - `cat_flip` (16x16, 1 frame: curled ball) for 10 f; fallback `cat_jump` rotated in 90° steps every 3 f;
  - a lilac ring puff r 3 → 9 over 8 f (`#c9a8ff`) and 4 white paw-dust particles under the feet.
- **Sfx:** `djump` (local).

### Bubble: 털실 거품 (yarn ball)

- **Fired on the ground (`ty 'yarn'`):**
  - `vx 2.0*dir, vy −1.0`, gravity 0.16;
  - each landing (the bubble bottom `b.y+16` crosses a `landTile` top, an ice top, a hot-water surface, or the clamp `PF_BOT−14`): `vy = −1.8` (a 10 px hop), `vx *= 0.92`, `squish = 4`;
  - after the 3rd landing it floats; landings at age ≈14/37/60 and x ≈ 28/70/**109 px**; shot cap 64 f;
  - it rolls off ledges and keeps hopping on the shelf below;
  - the side walls end the shot (float); cold water freezes it as usual;
  - r 8 / rP 8.
- **Fired in the air:** the base straight shot (3.5 x 22 = 77 px). Flies and the two flying bosses are never harder than baseline.
- **Shampoo:** r 12; 4 landings (shot cap 86 f).
- **Net:**
  - the guest adds **`a:1`** to `{t:'shot'}` when `!p.onGround` (the host's `onGround` can be a frame stale);
  - `hostShot` calls `fire(pl, m.a === 1)`; a host-local cat uses `!p.onGround`;
  - bubble-row bit **32 = yarn**, so viewers draw the thread only on yarn shots;
  - the guest prediction runs the same `stepShot` with its own `MAP` and rebuilt `ICE_TOP`, and the reconcile rule (§2.5) covers rare ice mismatches.
- **Look:**
  - film `#c9a8ff`;
  - glyph `icon_cat` (pink `#ff8fb1` yarn swirl, 2 frames, flipping every 8 px of travel);
  - yarn trail: a 1 px `#ff8fb1` thread, 10 px long, sine amplitude 2, drawn behind as a line (not particles);
  - air shots: the same glyph with no thread;
  - pop: 6 thread bits `['#ff8fb1','#c9a8ff','#ffffff']` with g 0.04.
- **Sfx:**
  - `b_yarn` (local): n=0 shoot "냥" blip; n=1 a hop tick at each landing (owner-local);
  - pop: `pop` n=5.

**Passive (kept):** "냥!" water bounce (`CAT_HOP_V −3.6`). It also refreshes the double jump.

**Solo / boss:**
- The best at ground enemies: the yarn sweeps a shelf and the spores landed on it.
- It shoots fliers and the flying bosses from the top of a double jump with a base shot.
- The double jump skips a whole tier: boss and battle tiers are 3-4 rows apart.

**Battle:**
- It escapes upward, and the yarn hugs the floor.
- **Counterplay:**
  - jump the 10 px yarn hop;
  - stay on a higher shelf than the cat (a ground yarn cannot climb);
  - after the double jump the cat has no aerial option left, so shoot its landing spot.
- **Knobs:** no refresh on a bounce in battle; double jump −3.4 → −3.1; yarn 3 → 2 landings in battle.

**Co-op:** it clears the lower shelves while partners work the air, and it is the fastest to ghosts near the ceiling.

---

## 8. 개굴이 (개구리): frog

**Role:** 함정 (trapper).

**First 5 s:** its bubbles stop and hang in front of it as jelly eggs. Hopping again right as it lands goes higher each time.

**Stats:** walk 1.25; jump chain −4.1 x 1.00/1.12/1.24 (**38/48/59 px**); CD 12/20. Bars: 속도 3, 점프 4, 사거리 1, 연사 4.

### Move: 개굴 3단 뛰기 (hop chain; word "개굴!")

- **Input:** press JUMP within **8 f after landing** (battle 6 f). The existing 5 f `JUMP_BUF` also counts presses just before the landing. Holding does nothing (edge only).
- **Rule, in the normal jump block of `updatePlayer`:**
  ```js
  const chain = p.hopAir && p.landT <= win;   // the last airtime began with a jump, and I landed <= win frames ago
  p.hop = chain ? Math.min(2, p.hop + 1) : 0;
  if (p.water) p.hop = Math.max(p.hop, 1);    // passive 연못 점프
  p.vy = JUMP_V * mul[p.hop] * (slip ? 1.08 : 1); p.hopAir = true;
  ```
  - `landT` = grounded frames since the last landing (reset to 0 on landing).
  - Leaving the ground without a jump sets `hopAir = false`.
  - A bubble bounce keeps the level (it is not a landing).
  - Stun and `ep` changes reset `hop`.
- **Heights:** 38.2/47.9/58.7 px; battle multipliers [1, 1.10, 1.20] give 38/46/55 px.
- **Cooldown:** the rhythm itself (land, then press within 8 f).
- **Side:** guest body.
- **Net:** bit A = rising on a hop of level ≥ 1; bit B = level 2.
- **Look:**
  - no new frame (`frog_jump`);
  - a lily-pad ring at the feet on each chained take-off: ellipse r 6 (level 1) or r 8 (level 2), `#6cc644` outline over a `#c8f08a` fill, 10 f;
  - level 2 also throws 4 green droplets.
- **Sfx:** `hop` (local) with n = level 1..2, replacing `jump` on chained hops.

### Bubble: 개구리알 거품 (egg trap)

- **Flight:** `v 4.2*dir`, `v *= 0.92` per frame for 18 f → **40.8 px**.
- **Hold:**
  - it stays in the **`shot` state (capture active)** at that spot for **86 f** (battle 70), wobbling `y ± 0.5` (`sin(age*0.2)`);
  - the whole shot phase is **104 f** (battle 88), within the 110 f prediction and `sid` limit;
  - then it floats normally (`EMPTY_LIFE`).
- **Cap:** 3 holding eggs per frog (battle 2). Laying another sends the oldest to `float`.
- **Wall:** a shot fired into or toward a wall lays the egg at the wall (clamp x, go straight to the hold).
- **Touch rules:**
  - enemies, the boss (+2), spores (+1) and, in battle, rivals that touch a hanging egg are caught or popped through `shotHits` every frame;
  - partners and the frog pass through, because shot-state bubbles are never touch-popped;
  - a hanging egg over cold water freezes as now.
- r 8 / rP 8.
- **Shampoo:** r 12, cap +1, hold unchanged (keeps ≤ 110 f).
- **Host:** `stepShot` (flight, then hold); the cap is handled in `fire`. `shotNote` keeps writing `hist` for the whole shot phase, as today (`HIST_KEEP 48`).
- **Net:** the egg look is derived on viewers (owner frog, state `shot`, age > 18). It needs no new bit.
- **Look:**
  - film `#9be86a`; jelly drawn at scale 0.9; a 3x3 dark egg dot `#1d4a14` at the centre;
  - while holding, a halo ring r 9 pulsing alpha 0.25-0.45 (`#c8f08a`, period 30 f);
  - pop: 8 jelly bits `['#c8f08a','#6cc644','#ffffff']` plus one dark dot falling (g 0.15).
- **Sfx:**
  - `b_egg` (local): n=0 shoot "뿍"; n=1 "뽀옥" when the egg stops (owner-local);
  - pop: `pop` n=6 "뽁".

**Passive (new, tiny):** 연못 점프. A jump out of water starts the chain at level 1 (x1.12). The old `FROG_CD 0.7` is retired; the frog's CD is now 12/20.

**Solo / boss:**
- Enemies walk into the eggs, and 대왕 수세미's charges and 왕때꼬마's hops run through them.
- Against the two fliers, lay eggs from the top of a level-2 hop (59 px) across their cruising height and swoop paths.
- The egg's far edge sits 68 px from the frog's left edge (spawn +11, flight 41, r 8 + 8).

**Battle:**
- Zone control: two eggs for 1.2 s each.
- **Counterplay:** the reach is only 41 px; come from above or below; outrange it with the penguin or capy lanes; the frog's CD after laying is 12 f.
- **Knobs:** battle hold 70 → 50; battle cap 2 → 1; rP 8 → 7; battle hop multipliers [1, 1.1, 1.2] → [1, 1.06, 1.12]; CD 12 → 14.
- **Fallback if the solo sim shows weak boss soap:** egg flight 18 → 22 f (≈45 px).

**Co-op:** eggs wall off a ghost or a partner's flank. Capy-soaked walkers reach them at half speed.

---

## 9. Netcode plan (all features)

### 9.1 Who simulates what

| Feature | Guest body sim (`updatePlayer` on its own animal) | Host world | Viewers |
|---|---|---|---|
| duck glide | yes | none | flap pose and puffs from bit A |
| capy wind-up, slam, recovery | yes; sends `qk` at landing | quake (soak, sponge cancel, boss soap, bubble jiggle) | pose from A; splash ring on B's rising edge |
| otter dash | yes | none | afterimages from A |
| penguin dive, slide, bonk, slide-jump | yes | none | slide pose from A/B |
| cat double jump | yes | none | curl and puff on A's rising edge |
| frog hop chain | yes | none | lily ring on A's rising edge, larger with B |
| all bubbles (paths, radii, eggs, cap, fan, volley rule, droplet window) | prediction only (same `newShot` / `stepShot`) | authoritative (`fire(pl, air)` at the reported spot) | looks from owner char, state, age and bits 16/32 |
| bounce on bubbles | yes (`guestBounce`, gated for the slam) | `playerBubbles` (gated for a remote slamming capy) | |
| capy hot-water shield | yes | validated on a rising `st.sh` | ring from `sh` / P[15] |

### 9.2 New wire items

| Item | Direction | Format | Validation / cost |
|---|---|---|---|
| body bits A/B | guest → all (body stream) | `fl` 256 / 512 (passes `parseBody` 0..1023) | 0 bytes |
| P-row bits A/B | host snapshot | row `fl` 128 / 256 (passes `guestPlayers` 0..1023) | 0 bytes |
| bubble bit 16 = otter droplet, 32 = cat yarn | host snapshot `U` rows | row `fl` (passes `viewLists` 0..255) | 0 bytes |
| `{t:'qk', x, y, ep}` | guest → host, reliable | ≈40 B per slam, ≤ 1 per 71 f | `hostQuake`, see §4 |
| `{t:'shot', …, a:1}` | guest → host (existing message) | +4 B when the cat is airborne | read only for the cat with perks on |
| `quake`, `pop` n=1..6 | host → guests (existing `V` events, `'s'`) | n inside 1..99 | `NET.who = slot` for `quake` |
| `NET_V` 3 → 4 | | | refuses a v3 page against a v4 host (different body physics) |

- **No new snapshot fields.** Every trait is derived from (owner slot → char, kind, state, age) or the two free bubble bits. The snapshot budget (`SNAP_LIMIT 3400`) is unchanged.
- Extra shot-state rows (fan droplets for 13 f, the 80 f echo, the 104 f eggs) stay inside the level-2 trim, which always keeps non-floating rows. They are checked in §13.
- `hostShot` keeps its 3-per-24 f limit. The fastest shooter is the frog at 12 f, and an otter volley is one message.

---

## 10. Audio (`src/audio.js`), new SFX

Recipes use the file's `voice()` and `noise()` parameter style.

| Name | Echo | Played | Recipe |
|---|---|---|---|
| `flap` | local | duck glide, every 12 f | triangle 990→740 Hz sl 0.08 d 0.09 v 0.08 s 0.4 r 0.03 + bandpass noise 1800 Hz q 1 d 0.05 v 0.04 |
| `slam` | local | capy wind-up "뿅" | p25 700→350 Hz sl 0.08 d 0.1 v 0.12 |
| `quake` | **echoed** | capy landing (host) | sine 120→40 Hz d 0.25 v 0.5 + lowpass noise 500 Hz d 0.2 v 0.25 + bandpass noise 1400→700 Hz d 0.18 v 0.12 |
| `dash` | local | otter dash | bandpass noise 900→2600 Hz q 1.2 d 0.16 v 0.2 + sine 400→800 Hz d 0.06 v 0.08 |
| `slide` | local | penguin: n=1 dive, n=2 slide, n=3 bonk | n1: highpass noise 3000 Hz d 0.08 v 0.12 + triangle 900→600 d 0.05 · n2: highpass noise 3200→1600 Hz d 0.35 v 0.14 s 0.5 · n3: triangle 300→150 Hz d 0.06 v 0.2 + lowpass noise 600 Hz d 0.04 |
| `djump` | local | cat double jump | p25 880→1320 Hz sl 0.05 d 0.08 v 0.14 + triangle 1760 Hz d 0.05 v 0.06 |
| `hop` | local | frog chained hop, n = 1..2 | k = [1.19, 1.41][n−1]: square 220k→330k Hz d 0.06 v 0.14, then square 260k→190k Hz d 0.05 v 0.12 ("개굴") |
| `b_echo` | local | duck: n=0 shoot, n=1 turn | n0: p25 1100→1500 Hz d 0.05 v 0.16 + sine 700 Hz d 0.04 v 0.08 · n1: p12 1500→1000 Hz d 0.06 v 0.08 |
| `b_onsen` | local | capy shoot "뽀옹" | sine 220→150 Hz d 0.12 v 0.24 + lowpass noise 800 Hz d 0.1 v 0.1 |
| `b_splash` | local | otter shoot "촵" | bandpass noise 2000→700 Hz q 1.3 d 0.09 v 0.22 + sine 500→300 Hz d 0.06 v 0.12 |
| `b_icicle` | local | penguin shoot "슝" | triangle 1800→2600 Hz d 0.07 v 0.16 + highpass noise 5000 Hz d 0.03 v 0.05 |
| `b_yarn` | local | cat: n=0 shoot, n=1 hop tick | n0: triangle 1000→1300 Hz d 0.04 then 1300→900 Hz d 0.04 v 0.14 · n1: sine 1400 Hz d 0.02 v 0.05 |
| `b_egg` | local | frog: n=0 shoot, n=1 egg settles | n0: sine 420→260 Hz d 0.07 v 0.2 + highpass noise 3000 Hz d 0.01 v 0.1 · n1: sine 600→500 Hz d 0.04 v 0.06 |
| `pop` n=1..6 | echoed (existing name, new variants) | first pop of a player-owned bubble | 1 duck squeak: p25 900→2000 Hz sl 0.04 d 0.06 · 2 capy: sine 300→160 Hz d 0.1 v 0.24 + soft lowpass noise · 3 otter "퐁": sine 900→420 Hz d 0.08 + bandpass noise 1500 Hz d 0.04 · 4 penguin "쨍": triangle 2093 + 3136 Hz d 0.08 + highpass noise 6000 Hz d 0.03 · 5 cat: p25 760→1500 Hz vib 0.05 d 0.07 · 6 frog "뽁": sine 800→1600 Hz d 0.03 + square 190→130 Hz d 0.04 |

- Add every local name to `NO_ECHO` (L4234). The plain `pop` (no n) and `shoot` stay for perks off.
- Update the header doc (L7-L16).

---

## 11. Sprites (`src/sprites.js`), new frames only

All frames face right, use the shared palette and have fallbacks, so a missing frame never breaks drawing.

| Name | Size | Frames | Purpose | Fallback |
|---|---|---|---|---|
| `duck_glide` | 16x16 | 2 (wings up / down) | glide flap | `duck_jump` with `sq ±0.08` |
| `capy_slam` | 16x16 | 1 (curled, rump down) | wind-up and slam | `capy_fall` with `sq` |
| `otter_dash` | 16x16 | 1 (stretched swim) | dash | `otter_jump` with `sq +0.18` |
| `penguin_slide` | 16x16 | 1 (lying, beak forward) | dive landing and slide (**essential**) | `penguin_fall` rotated 90° |
| `cat_flip` | 16x16 | 1 (curled ball) | double-jump curl | `cat_jump` rotated in 90° steps |
| `icon_duck`, `icon_capy`, `icon_otter`, `icon_penguin`, `icon_cat`, `icon_frog` | 5x5 each | 1 | bubble glyphs (duck head + beak, yuzu + leaf, pebble, snowflake, yarn swirl, egg dot) | none drawn |

- The frog needs no new body frame.
- Rings, trails, threads and halos are drawn with `fillRect` and `arc`.
- `tools/check-sprites.js` must list the 11 new names (the 5 poses plus 6 icons).

---

## 12. UI (`src/page.html`, picker and room)

### 12.1 `CHARS` gains the card data

The `perk` string is replaced. The picker's `aria-label` becomes `name (animal): tag`.

| | role | tag (≤ 26) | move.name | move.how (≤ 26) | bub.name | bub.desc (≤ 26) | word | touch sub-label | stats [속도, 점프, 사거리, 연사] | hue |
|---|---|---|---|---|---|---|---|---|---|---|
| duck | 만능 | 처음이라면 꽥꽥이! 둥실 날고 메아리 쏘기 (23) | 둥실 활공 | 떨어질 때 점프를 꾹! 둥실둥실 천천히 (21) | 메아리 거품 | 멀리 갔다가 다시 돌아와요 (14) | 둥실~ | 꾹: 활공 | [3,3,3,3] | #ffe36b |
| capy | 든든 | 느긋한 왕방울, 엉덩방아로 때를 불려요 (21) | 털썩 엉덩방아 | 공중에서 점프 한 번 더! 쿵, 때가 불어요 (24) | 왕방울 거품 | 크고 느릿느릿, 잘 맞아요 (14) | 털썩! | 두 번: 쿵 | [2,3,2,3] | #ffa98a |
| otter | 돌격 | 휙 날아들어 세 갈래 물장구! (16) | 휙 대시 | 공중에서 점프 한 번 더! 옆으로 휙 (20) | 물장구 거품 | 세 갈래로 촤악 퍼져요 (12) | 휙! | 두 번: 대시 | [4,3,2,2] | #5fe0c8 |
| penguin | 저격 | 배로 쭉 미끄러져 멀리 쏘는 저격수 (19) | 쭉 배미끄럼 | 공중에서 점프 한 번 더! 배로 쭉~ (20) | 고드름 거품 | 빠르게 아주 멀리 날아가요 (14) | 쭉~ | 두 번: 쭉 | [5,3,5,1] | #9fdcff |
| cat | 곡예 | 2단 점프로 폴짝, 털실은 데굴데굴 (19) | 냥냥 2단 점프 | 공중에서 점프 한 번 더! 더 높이 (19) | 털실 거품 | 땅에서 쏘면 통통 굴러가요 (14) | 냥냥! | 두 번: 2단 | [3,5,3,3] | #c9a8ff |
| frog | 함정 | 폴짝폴짝 뛰며 개구리알 함정 깔기 (18) | 개굴 3단 뛰기 | 착지하자마자 또 점프! 점점 높이 (18) | 개구리알 거품 | 앞에 멈춰 기다리는 함정 (13) | 개굴! | 착지 때 또 | [3,4,1,4] | #9be86a |

The stat bars are display values tied to the numbers:
- **속도** = top ground speed: capy 1.15 → 2; 1.25 → 3; otter 1.40 → 4; penguin slide 2.6 → 5.
- **점프** = best height: 38 px → 3; frog 59 → 4; cat 64 → 5.
- **사거리** = forward reach: frog 41 → 1; capy 62 and otter 58 → 2; duck (63 + return) and cat (yarn 109 on the floor, 77 in the air) → 3; penguin 117 → 5.
- **연사** = tap CD: 20 → 1; 16 → 2; 14 → 3; 12 → 4.

### 12.2 Picker card (`.pg-pick-info` → `.pg-kit`, L556-L557)

```
[6 portraits]
냥냥 · 고양이  [곡예]                  ← name · animal, role chip
2단 점프로 폴짝, 털실은 데굴데굴         ← tag
속도 ●●●○○   점프 ●●●●●              ← 5 pips filled in the hue; aria-label "점프 5점 중 5점"
사거리 ●●●○○  연사 ●●●○○
특기  냥냥 2단 점프 · 공중에서 점프 한 번 더! 더 높이
거품  털실 거품 · 땅에서 쏘면 통통 굴러가요
```

- On phones (`.pg-touch-on` at narrow widths), show the pips plus the 특기 line, and put the rest in the `aria-label`.
- Duck badge: "처음이라면 추천". Capy badges: "왕방울 · 온탕 보호막".

### 12.3 Room card (`#pg-room-pick`, L686-L687; `renderRoom` L5583)

- A one-line compact card: name, role chip, 4 pip rows, 특기 name.
- **With 능력 끄기 on** (host option or `NET.opts.perks === false`): the card is greyed (`.pg-kit.off`), every bar shows 3/3/3/3, and the line reads **"능력 꺼짐 · 모두 같은 기본 능력이에요"**.

### 12.4 Touch label

`#pg-t-jump` gets a second small line (`#pg-t-jump-sub`, 10 px) with the touch sub-label from the table. It is hidden when perks are off and set in `syncPicker` / `setTouchMode` and when a game starts.

### 12.5 First-time hints

Counter `ppogeul-kit-<char>` through `sget` / `sset` (try/catch already in place).

| When | Banner (main / sub) |
|---|---|
| 1st round played with that animal (solo / co-op), queued on `G.bannerQ` right after "준비!" (`updateWorld` L2396), 100 f | `특기: <move.name>` / `<move.how>` |
| 2nd round with that animal | `거품: <bub.name>` / `<bub.desc>` |
| online countdown (`updateCountdown` L1011), the "3" banner, every match | sub = `내 특기: <move.name> · <touch or key hint>` |
| battle with perks off, countdown | sub = `능력 꺼짐 · 모두 같은 기본 능력` |
| first use of the move each round (owner's screen only, `NET.rec = false`) | `wordPop(word)` in the slot colour |

### 12.6 Fonts

Append every new string to `V3_TEXT` (L109), or the web-font warm-up misses the glyphs:
- all names, tags, how texts, bubble names and descriptions, and words;
- 특기, 거품, 속도, 점프, 사거리, 연사, the role chips, 처음이라면 추천, 왕방울 · 온탕 보호막;
- 능력 꺼짐 · 모두 같은 기본 능력이에요, 내 특기, the touch sub-labels, 콩!, and the pip aria text ("점 중").

---

## 13. Bots (`src/tests/review-mpbal.js`): what they need so the sims mean something

Today's bot (L23-L330) moves every animal with the same logic.
- `phys()` knows only capy 0.92 and cat 1.08.
- `threats()` models rival shots as straight `x += vx`.
- `consider()` shoots at targets within 76 px and |dy| < 9.
- `press()` holds jump for exactly one frame.

Minimum changes:
1. **Engine API:**
   - `PG.debug.kit(char)` returns the `KIT` entry (so the bot never copies numbers);
   - `PG.debug.shotPath(b, n)` returns the next n positions and radii of a live bubble through `stepShot` on a clone.
2. **`phys(p)`:** walk and jump from `kit()`; drop the cat x1.08.
3. **`press()`:** add a held channel `w.hold` that keeps jump down across frames (needed for the duck glide and for bubble bounces).
4. **`threats()`:**
   - rival shots via `shotPath`, with `rP` boxes (droplets only for ages ≤ 8);
   - eggs as stationary boxes until the hold ends;
   - yarn along its hop path; echo including the return.
5. **`simulate()`:** add move plans to the safety search (a move at frame k ∈ {6, 12, 18}) with each move's kinematics from §3-§8: glide fall 0.65; dash 3.2 x 10 f with vy 0; slam wind-up 8 f then 5.0; dive 2.6 with vy ≥ 1.8 then the slide decay; double jump −3.4; the hop chain multipliers.
6. **`consider()` per kit** (range / |dy| band):

   | Animal | Range and band |
   |---|---|
   | duck | 60 / 9; also targets up to 20 px behind |
   | capy | 58 / 12 |
   | otter | 54 / 9, or 26 / 14 for point-blank |
   | penguin | 112 / 7 against rivals, 112 / 9 against enemies |
   | cat | on the ground, 100 if the target stands on the same floor (feet within 4 px); in the air, 76 / 9 (jump-shoot fliers and anything above) |
   | frog | 44 / 9, or lay an egg when a target within 80 px is moving toward it on the same row |

7. **Minimum move policies:**

   | Animal | Policy |
   |---|---|
   | duck | hold jump while falling when the route edge needs more than 40 px across, or a threat box lies below |
   | capy | slam when an active ground enemy is within 36 px and below, when the boss is below, or as a fast drop on 'drop' edges |
   | otter | dash at the apex toward a target 40-90 px away on the same tier, or away from a rival shot within 30 px |
   | penguin | hop-dive toward a target more than 48 px away on the same row; slide-jump 'hop' edges |
   | cat | double jump at the apex on 'up' edges of ≥ 5 rows or to dodge a shot within 30 px; jump-shoot fliers |
   | frog | chain hops (press on landing) on 'up' edges of ≥ 5 rows; lay eggs as above |

8. **Metrics:**
   - per-animal move uses per minute (each must be ≥ 2/min in duels, or the run is flagged "bot not using kit");
   - trapped/min, KOs/min, soap per minute against each boss.

---

## 14. Test plan

### 14.1 New `src/tests/kits.js` (one engine, stepped with `PG.debug`, perks on unless stated)

| Animal | Check |
|---|---|
| all | A jump pressed 3 f before landing still jumps on landing (no eaten jump) for all six. An air press within 6 f of take-off does nothing special. Pressing jump over a floating bubble while holding bounces −3.8 rather than triggering the move. A stun mid-move ends it (`mv === ''`) on host and guest. |
| duck | Flat jump + hold: after the apex, `vy ≤ 0.65` within 6 f; airtime 76-82 f; ≥ 105 px across. The meter ends at 75 f (60 in battle), then `vy` exceeds 0.65. The meter refills on a bounce. Echo: max distance 62-64 px at age 34-36; passes the spawn x by age 73; state `shot` until age 80; ends 19-24 px behind the spawn. A wall within 40 px flips it early. A grime 15 px behind the duck is trapped on the return. |
| capy | Wind-up 8 f with \|Δy\| < 0.01; then `vy === 5.0` each frame; lands ≤ 17 f after the press from a 38 px apex. The quake soaks a grime 30 px away on the same floor (`soakT === 300`), not a fly 20 px away, not a grime 48 px away. Recovery 14 f (no x change with right held); `mvCd 45`. Slamming through a floating empty pops it. A remote capy holding jump while slamming does not bounce on the host, and the bubble pops on the host. `qk` rejected for: another char, perks off, ep mismatch, 30 px away, a second one within 40 f, no A bit in 30 f. Bubble: catches an enemy box 10.5 px from its centre, a rival only within 10; range 61-62 px. Shield: a guest report of `sh 180` out of hot water is ignored; a real dip is accepted once per 348 f. |
| otter | Dash: 31-33 px in 10 f with \|Δy\| < 0.01; never past `WALL_L − 2` / `WALL_R − 14`; once per airtime; `mvCd 20`. Fan: 3 bubbles per press; droplets ±9-10 px off-axis at age 13 and gone by age 14 (popped `'self'`); at most +1 floating bubble per volley; a droplet traps a rival at age 6 but not at age 10; a volley onto the boss adds exactly 1 soap. |
| penguin | Slide held 82-90 px; no direction 40-47 px; brake ends in ≤ 8 f; on ice ≥ 150 px (90 f cap). Slide-jump from 2.6: ≥ 85 px across. Wall bonk: 10 f with input ignored. No bonk on interior blocks. Icicle range 116-118 px; catches an enemy at 8 px, a rival at 5.5 but not at 6.5. |
| cat | Double jump: peak 63-66 px above the start floor; one per airtime; refreshed by landing, bounce and "냥!"; with ground ≤ 10 px below, a press is a buffered jump instead. Yarn: 3 landings at ages 14±1 / 37±1 / 60±1 and x ≈ 28 / 70 / 109 (±2); follows a lower shelf after rolling off; an air shot is identical to the base (77 px, y constant). `a:1` makes the host fire the straight shot. |
| frog | Hops with presses on landing: apex 38 / 48 / 59 px (±1). A press 9 f after landing resets to 38. A walk-off landing resets the chain. A jump from water starts at 48. Egg: stops at 40-42 px; \|Δx\| < 1 for 86 f in `shot`; traps a grime that walks into it at age 60; the 4th egg sends the oldest to float (battle: the 3rd); shot phase ≤ 110 f. |
| perks off | For all six animals, a scripted 600-frame input trace (walk, jumps, air presses, holds, shots) gives body traces (x, y per frame) and bubble traces (x, y, state per frame) identical to the duck with perks off. Bits A/B stay 0. The bubble draw output of one frame is pixel-identical across the six (canvas hash). `qk` is rejected and a shield report is ignored. |
| levels | `tools/validate-levels.js` passes unchanged (no kit lowers jump or walk). |

### 14.2 Online parity (bc transport, `?net=bc&lat=80&jit=30`, extending `mp-net.js` / `rv-net.js`)

- The same scripted input on a host-local animal and on a guest animal (lat 0) gives identical body traces for each move.
- Bits A/B round-trip. Another guest sees A within 100 ms, through the peer stream and through the P row.
- For each animal, the guest's predicted bubble equals the host row at the same host tick within 1.5 px for all ages (echo, fan centre, icicle, yarn, egg). There is no phantom burst for echo or egg (`pb.life` never passes 120). The owner never sees its droplets twice.
- A remote capy slam pops the bubbles in its path on the host and in every view. `qk` soaks on the host. Other guests hear `quake` once; the capy hears it once (its own).
- `NET.snapMax ≤ 3400` with 4 otters on autofire, 4 frogs with full egg caps, 4 ducks on autofire, and a mixed 4P battle with the boss intruding (check in `tools/net-node-test.js`).
- With `NET_V` 4, a v3 state is ignored (version mismatch).

### 14.3 Solo viability (`review-mpbal.js exp=coop n=1 chars=<a>`, seeds 1-10, rounds 0-23)

- Every animal reaches and beats 이태리 타올 대마왕 at least as often as the perks-off duck minus 10 points.
- No round where an animal's clear rate is below 70% of the best animal's.
- Time to fill each boss's soap gauge is within ±30% of the duck's for every animal. If the frog misses this, apply the egg-flight fallback.
- Narrow-ledge rounds 13 and 15 are watched for the penguin's slide and the duck's glide: the death rate must not exceed the duck's by more than 15%.

### 14.4 Battle balance (`review-mpbal.js`)

- `exp=duel&pairs=all&arenas=0,1,2,3&seeds=1-10`: 15 pairs x 2 slot orders x 4 arenas x 10 seeds = **1,200 matches**. **Every pair 43-57%** (ties count half).
- Control `perks=0`: every pair 46-54% (the harness check of 능력 끄기).
- **Never untrappable:** each animal's trapped-per-minute ≥ 0.8 x its perks-off mirror mean.
- `exp=ffa&n=4&chars=random&seeds=1-40`: each animal's mean rank 2.2-2.8.
- **Tuning order if a pair is above 57%:** the first knob of the winning animal (listed under each kit), one step at a time, then re-run that pair.
- Predicted watch list: penguin (range), duck (return), frog (eggs), cat (evasion). Predicted under-dogs: capy and otter. Their buff knobs are the reverse of the listed knobs.

### 14.5 Tests to update in the same change

- `final-v3.js`: L339 picker text, now `pg-pick-name` and the move line. Rewrite the perks phase L381-L436:
  - walk table: capy 1.15, otter 1.40, the rest 1.25;
  - cat take-off −4.1;
  - frog cooldown 12/20;
  - add the move and bubble checks from §14.1.
- `mp-local.js`: L75-L79 checks `CHARS[c].tag` instead of `.perk`; L129+ perk measures.
- `mp-fixes.js`, `review-mpfeel.js`, `v2-core.js`: perk text and number assertions.
- `tools/audio-node-test.js`: add `SFX_V4 = ['flap','slam','quake','dash','slide','djump','hop','b_echo','b_onsen','b_splash','b_icicle','b_yarn','b_egg']` to `SFX_NAMES`.
- `tools/check-sprites.js` / `tools/check-integration.js`: the 11 new sprite names and the sfx names.
- `tools/net-node-test.js`: bits, `qk`, `NET_V` 4, snapshot size.

---

## 15. Migration

### 15.1 Perks

| v3 perk | v4 |
|---|---|
| duck: no water slowdown | **kept** (passive) |
| capy: walk x0.92 | **kept** (stat) |
| capy: hot-water shield 180 f / CD 180 | **kept**, plus host validation |
| otter: swim x1.4 | **kept**; walk raised to x1.12 |
| penguin: ice x1.3, grip 0.09, no cold-water slowdown | **kept** |
| cat: "냥!" water bounce | **kept**; also refreshes the double jump |
| cat: `CAT_JUMP 1.08` | **dropped** (replaced by the double jump) |
| frog: `FROG_CD 0.7` (10/17) | **changed** to CD 12/20 as part of the egg kit |

### 15.2 Code sites

**`src/game.js`**
- **Constants and data:**
  - L92-L93: replace with `KIT_GATE`, `KIT_BASE`, `KIT`, `kitOf`;
  - `CHARS` (L74): add `role, tag, stats, move{name,how,word,touch}, bub{name,desc}, hue`;
  - `V3_TEXT` (L109);
  - `NET_V` (L4231) → 4;
  - `NO_ECHO` (L4234).
- **Physics and body:**
  - `physBody` (params);
  - `bodyAt` and `placePlayer` (new fields);
  - `updatePlayer`: kit walk, CD and jump; `airMoveOk`; the six move blocks; landing events; the hop chain in the jump block; `fire(p, !p.onGround)`;
  - new `endMove`, `bubbleBelow`, `quake`;
  - `stunPlayer`, `trapPlayer`, `releasePlayer`, `knockOut` (`endMove`).
- **Bubbles:**
  - `makeBubble` (fields);
  - `fire(p, air)` with new `newShot` (egg cap, fan, volley id);
  - `updateBubbles` shot branch with new `stepShot` (echo, fan droplet burst, yarn, egg hold; droplets skip `tryFreeze`);
  - `captureCheck`, `bossShotCheck` (r+2, volley rule), `sporeShotCheck` (r+1), `playerTrapCheck` (rP, droplet age), `lagTrapCheck` (rP, `born`; `nb` copies r/rP);
  - `trap`, `trapPlayer` (reset traits);
  - `popBubble` (`pop` n variant, kit palettes);
  - `playerBubbles` (slam gate; bounce refreshes `mvUsed` / `glideT`, ends the dive).
- **Net:**
  - `hostInputs` (A/B bits, `mvAAt`, bounce gate, shield validation);
  - `netMsgIn` (`'qk'` case) and new `hostQuake`;
  - `hostShot` (`m.a`);
  - `hostDisplayIn` / `hostDisplayOut` (copy A/B);
  - `snapPlayers` (bits 128/256), `snapBubbles` (bits 16/32), `guestPlayers` (bits), `takeOver` (reset fields);
  - `viewLists`: bits, the owner hides own droplets, kit pop palettes, echo turn detection;
  - `guestSelf`: battle-hit branch calls `endMove`;
  - `guestBounce` (slam gate, refreshes);
  - `guestFire`: `newShot` prediction for 1-3 bubbles, sends `a`;
  - `updatePredicted`: `stepShot`, droplet burst at 13, the 6 px reconcile;
  - `guestSend` (bits 256/512).
- **Drawing:**
  - `drawPlayer`: poses, afterimages, glide puffs, slam lines, splash ring, curl puff, lily rings; edge detection from `mvA` / `mvB`;
  - `drawBubble`: hue film, slot ring, glyph, shapes, trails, egg halo, yarn thread; perks off → today's path.
- **UI:**
  - `buildPicker` / `syncPicker` (kit card, touch sub-label), `renderRoom` (compact card, perks-off state);
  - hint banners in `updateWorld` (after "준비!") and `updateCountdown`.
- **Debug:** `PG.debug` (L5850): `kit(char)`, `shotPath(b, n)`, `mv`/`hop`/`glideT` in the player state.

**Other files**
- **`src/sprites.js`:** the 5 pose frames and 6 icons (§11).
- **`src/audio.js`:** the 13 SFX plus the `pop` n variants (§10), and the header doc.
- **`src/page.html`:**
  - the picker card markup and CSS (`.pg-kit`, pips, role chip, `.off`) replacing L557;
  - the room card replacing L687;
  - the `#pg-t-jump-sub` span and its CSS next to L482.
- **`src/net.js`, `src/levels.js`, `tools/validate-levels.js`:** no change. Messages are generic (`MSG_MAX 900`), and the base jump and walk floors are unchanged.
- **Tests:** §14.5 plus the new `src/tests/kits.js`.

**Estimated size:**
- `game.js`: +750 / ~70 changed lines;
- `sprites.js`: +160;
- `audio.js`: +110;
- `page.html`: +60;
- tests and tools: +550 (of which bots ~150 and `kits.js` ~300).

**Order:**
1. Shared infrastructure: `KIT`, `physBody` params, gate, bits, `newShot` / `stepShot` with radius fields, `NET_V` 4.
2. The six moves.
3. The six bubbles.
4. Looks and sounds.
5. UI, hints and `V3_TEXT`.
6. Bots, sims and tuning.

---

## 16. Risks

1. **Bot fidelity:** the 57% target means nothing until the bots use the moves and read the bubble paths (§13). Human ceilings (slide-jump chains, glide plus bounce) will be higher.
2. **Accidental air moves for jump mashers:** mitigated by `airMin 6`, the 10/16 px landing probe, the bubble probe, once per airtime, and the first-round banner. The capy's wind-up is the most noticeable; its first knob is `clear` 16 → 20.
3. **Self-inflicted hits:** dash, slide and slam can carry the animal into enemies, because no i-frames are given by design. The banner teaches it; bonk and recovery are short.
4. **Score inflation in co-op** (the quake's soak doubles points): knob soak 300 → 180. Old high scores are not directly comparable, which is acceptable.
5. **4P readability:** the slot ring carries ownership, while film, glyph, shape and trail carry the animal. Check with `char-sheet.js`-style screenshots of all six bubbles x 4 slots.
6. **Snapshot growth:** eggs, echoes and droplets are shot-state rows; covered by the `snapMax` test (§14.2).
7. **Yarn and egg prediction drift:** cosmetic; the host decides captures and the 6 px reconcile hands over to the host row.
8. **Version mix:** `NET_V` 4 refuses old pages. Rebuild both outputs with `node build.js`; players with a cached page must reload.

---

## Appendix A. Claude 밖에서 배포하기 (the user's first question)

`node build.js` produces two builds. `deploy/index.html` (≈670 KB, one file) is the one for publishing outside Claude.

| File | Use | Online play |
|---|---|---|
| `dist/ppogeul-bath.html` | Claude artifact (`room` capability) | Claude room (requires sign-in and an invite) |
| `deploy/index.html` | **standalone page for any static host** | PeerJS WebRTC (`peer` transport; `peerjs@1.5.4` pinned with SRI) |

**Steps**
1. In the `bogeul` folder, run `node build.js`, which refreshes `deploy/index.html`. After the v4 kits land, rebuild so that `NET_V` 4 ships in both builds.
2. Upload it to any static HTTPS host. It is a single file, so no server code is needed. Any one of these works:
   - **GitHub Pages:** push `index.html` to a repository, then Settings → Pages → choose the branch.
   - **Netlify Drop** (app.netlify.com/drop): drag the `deploy` folder onto the page.
   - **Cloudflare Pages:** upload the `deploy` folder.
   - **itch.io:** zip `index.html` and upload it as an "HTML" game.
3. 친구와 하기 → 방 만들기 gives a 4-letter code. Sharing with 코드 복사 also includes a `?join=CODE` link, which opens the room for whoever taps it.

**Notes**
- Online play goes through the public PeerJS signalling server (0.peerjs.com), and the game data then flows P2P between players. It is free, but it is a best-effort service.
- On some company networks, school Wi-Fi or mobile carriers, P2P connections can be blocked. For reliability you need a TURN server (for example coturn or Metered) and, if desired, your own PeerServer.
  - `net.js` already passes `{peerOptions}` to `new Peer()`, but the game (`netHost` / `netJoin` in `game.js`) does not pass it yet.
  - This needs a small change: for example, have `netHost` / `netJoin` read `window.PG_PEER_OPTIONS` and inject it from `build.js`.
- Solo play works even fully offline. If anything about the page changes after release, rebuild and upload it again. Because of the `NET_V` check, players on an old cached page are refused until they refresh.
