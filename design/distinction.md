# 뽀득뽀득 목욕탕: telling players apart, the 몬스터 출현 option, and 친구와 하기 on a link that cannot use it

Status: **final** (reviewed against the code and against `design/shop.md` on 2026-10-16; the review's changes are listed in §7). Implement it in the passes of §6, before shop.md's passes. It covers three user requests:
- (2) "같이 하기 할 때 사용자 구분이 잘 가게 해줘 너무 헷갈려": players are too hard to tell apart in co-op and battle.
- (1) "배틀에는 몬스터 출현 체크 박스 만들어줘": a battle-room option that turns off the grime monsters. It is on by default.
- (4) Already decided: on a public link that cannot use the Claude room, joining with a code must explain the problem instead of saying "방을 찾을 수 없어요".

Line numbers refer to `src/game.js` / `src/page.html` as of 2026-10-16 and go stale as passes land: find the code by the function name given with each. All visual changes are cosmetic. No hit box, physics or netcode timing changes. Solo play is pixel-identical to today (with a bare store: worn items from the shop show in solo by design).

The 상점 / 마이페이지 design (`design/shop.md`: wearable items and 비누 코인) is implemented after this one. §2.12 is the joint contract both docs now state the same way: one drawing order (frame → twin recolour → worn items → tint → ink ring of the final frame), one `headTop(p)` for every mark above the head, the feet for the ground marker, and looks and twin colours both frozen at match start.

---

## 0. Decisions in one table

| # | Decision | Why |
|---|---|---|
| D1 | **Keep the four slot colours** (`SLOT_COLS` `#ffd447 #f6a6bd #7fdcc8 #8dc9ff`, 노랑/분홍/민트/하늘). Fix legibility with contrast, numbers and shapes, not new hues. | They are the brand palette (duck yellow, mint UI), the room cards already teach them, and five tests pin the hex values. A hue change alone would not fix the real failures (§1.2). |
| D2 | **A number on everything**: 1P–4P = seat 1–4 (1P is always the 방장). It goes on the name tag, the HUD panel, the room seat card and the co-op result rows. | Colour-blind safety. Under deuteranopia 분홍 and 민트 are ΔE 5.5 apart (the same colour). Under tritanopia 민트 and 하늘 are ΔE 8.9 apart. |
| D3 | **Ink-ringed outline**: a 1 px slot-colour ring (8-connected), then a 1 px ink ring outside it. This replaces today's 1 px 4-connected slot ring. | Every slot colour has contrast ≤ 1.5:1 against every light tile theme, and the duck's body *is* slot 1's colour. Against the ink they all reach 9.3–12.3:1 (`SLOT_INK` `#1c1530`; 9.8–13:1 against the page ink `#071619` in §1.2). |
| D4 | **Ground marker (발판 표시)**: a slot-colour pixel ellipse under each animal, drawn below the bodies (and below the kits' floor rings: lily pads, slam splashes) and projected onto the floor while jumping. **A floating animal gets two slot-colour ripples beside it at the waterline instead** (drawn over the water, never over the body). Mine has a white rim; others have an ink rim. | Readable when animals overlap, through blinking (respawn invulnerability), on any tile. It sits at the feet, so it never collides with hats or scarves. A filled ellipse drawn over the water would cut a floating animal in half at the waist (it floats 5 px deep). |
| D5 | **Twin colour (쌍둥이 색)**: when two or more players pick the same animal, the lowest seat keeps the natural colours. Each later copy has its body palette swapped to *its own* slot colour ramp (2P pink duck, 3P mint duck, 4P sky duck). The swap is frozen at match start. Which keys are "body" is data in `sprites.js` (`PG.TWIN_KEYS`), next to the art. | "Four of the same animal" is the worst case today: four ducks differ only by a 1 px ring. A full body recolour reads at a glance, as in Crazy Arcade. It is applied **before** the worn items are composited, so items keep their colours even when they use body keys (the shop's 바가지 모자 is `Y y L`, the duck's own keys). |
| D6 | **Name tags v2**: a solid slot pill holding a number chip and the nick. **My tag** holds a white "나" chip and a 2 px white ring, and is never shortened. **White rings mean "me" only**: a trapped player's tag (today a 0.7-white ring, L384, which would read as "me") gets a ring in the trapper's colour. Tags that would overlap collapse to the number chip instead of stacking into towers. Tags never cover the HUD or leave the canvas sideways, and sit above a worn hat (`headTop`). | Today the tags overlap or stack away from their animals (`rv-tags-coop-390-zoom.png`), and "me" is a faint 2.5 px white shadow, shown online only. |
| D7 | **Me spotlight**: three white-and-slot rings pulse around my animal for 90 f at the countdown, after a battle KO respawn and after a co-op revive. My tag grows ×1.3 for 120 f at those moments. | The moments a player loses track of themselves. |
| D8 | **HUD panels are placed by seat, not by array index**, and drawn in the slot colour with the number box, the animal icon (twin colour included) and the score. My panel has a white number box and a white underline. | Today a player leaving shifts every later panel. The HUD shows no names, so with twins the icons are identical. |
| D9 | **Bubble owner ring**: battle shots in flight get a **2 px** opaque ring. Floating bubbles keep a 1 px ring (now fully opaque). Plain (non-kit) owned bubbles get a ring too. A trapped rival's prison gets a 2 px trapper ring. A co-op ghost's revive ring becomes 2 px. | The kit bubble films use hues equal to slot colours (penguin film ≈ 하늘, otter film ≈ 민트). The 1 px ring at 0.9 alpha was the only owner cue. |
| D10 | **몬스터 출현** checkbox (default ✓): when off, no arena enemies at the start or on respawn, **and the intruding boss summons no minions**. The 보스 난입 option stays separate. It travels as `R.o[5]` (missing or anything but `0` = on). | Today the 6 arena enemies keep `minionCount() ≥ MINION_CAP (4)`, so an intruder almost never summons. Removing arena enemies without capping minions would let the boss *add* up to 4 monsters (§3.3). |
| D11 | On a page where online only reaches this browser's tabs (`localOnly()`: the public-link viewer of the artifact, or the deploy page with PeerJS failed): the friends panel shows a **coral block card**. 방 만들기 is **disabled**. 참여 **answers at once, with no network wait**: "이 링크로는 친구와 하기를 쓸 수 없어요 · 방장에게 이메일 초대를 부탁해요". Forced bc (`?net=bc`, every test) is untouched. | The friend arriving with a code needs the true reason at the moment they act. A room nobody can enter must not be makeable. "친구와 하기" replaces the user's "같이 하기" in the sentence, because 같이 하기 is also the co-op mode's name and would read as "co-op is off, battle works". |

---

## 1. Ground truth: how players look today, and why four of them are confusing

### 1.1 What draws a player in multiplayer (`multi()` = 2+ players)

| Element | Code | Today |
|---|---|---|
| Slot colours | `SLOT_COLS` L104, `makePlayer` L889 `color: SLOT_COLS[slot]` | 노랑 `#ffd447`, 분홍 `#f6a6bd`, 민트 `#7fdcc8`, 하늘 `#8dc9ff`. Slot = seat, and seat 0 is the host. |
| Body outline | `drawPlayer` L5209 `o.outline = p.color` → `outlineOf` L542 | A 1 px ring drawn at 4 offsets (no diagonals, so corners are broken), in the slot colour, outside the art's own ink outline. |
| Name tag | `syncTags` L6165, CSS `.pg-tag` page.html L368 | A DOM pill in the slot colour holding the nick (default `P1` locally, `손님NN` online). Tags that overlap are lifted above the earlier one (up to 4 passes). |
| Tag pointer | `drawTagArrows` L5252, sprite `tag_arrow` 5x3 | A canvas ▼ in the slot colour under each tag. |
| "Me" | `.pg-tag.is-me` page.html L374 | A `0 0 0 2.5px #fff` box-shadow on my tag, online only. Nothing in the canvas, nothing in the HUD. A trapped player's tag (`.pg-tag.is-trap`, L384) gets an almost identical `2.5px rgba(255,255,255,0.7)` ring, so a trapped rival looks like "me". |
| HUD, battle | `drawHUDBattle` L5803 | `X = [2, 54, 156, 208][i]` by **array index**. Each panel has the 8x8 `life_<char>` icon, the score in the slot colour, a grey "KO n" and a crown on the leader. No name and no number. |
| HUD, co-op | `drawHUDCoop` L5783 | Row 2 (y 8–15) has panels `pw = floor(252 / max(2, n))` by **index**: icon and score in the slot colour. |
| Bubbles | `drawKitBubble` L5312, `drawBubble` L5383 | Kit bubble: the film in the **animal's** hue plus a 1 px owner ring at alpha 0.9. Plain bubble: a 0.35 slot tint, no ring. Trapped rival: the bubble tinted with the trapper's colour plus a 1 px ring. |
| Ghost (co-op) | `drawGhost` L5243 | A pale ghost sprite with a 1 px slot ring that drains as the revive timer. The tag is at opacity 0.6. |
| Podium | `drawPodium` L5823 | Animals with outlines, crowns, tags and tag arrows. |
| Room | `renderRoom` L8159 | Seat cards with a slot-colour border, portrait, nick, animal name, trophies, status and a "나" chip on my card. |

### 1.2 Why four players are confusing: the concrete failures

Evidence: `kits-battle.png`, `mpn-battle.png`, `mpn-coop.png`, `mp-battle-phone.png`, `kits-online.png`, `rv-tags-coop-390-zoom.png` in `C:/Temp/bogeul`, and the numbers below, computed from the palette.

1. **Four of the same animal.** Nothing stops four friends from all picking 꽥꽥이, which the card even badges as "처음이라면 추천". Then the four bodies are pixel-identical. The only differences are a 1 px ring and a small tag. In the HUD they are four identical `life_duck` icons. (`kits-online.png`: two ducks and a capy are already hard to follow.)
2. **The outline vanishes.** All four slot colours are light pastels, and so is every tile theme. Contrast of each slot colour against the tiles:

   | slot | vs 민트 tile `#7fdcbf` | vs 하늘 tile `#8dc9ff` | vs 노랑 tile `#f6da7e` | vs 분홍 tile `#ff8fb1` | vs ink `#071619` |
   |---|---|---|---|---|---|
   | 1P 노랑 | 1.14 | 1.24 | **1.03** | 1.50 | 12.97 |
   | 2P 분홍 | 1.16 | 1.07 | 1.37 | **1.13** | 9.76 |
   | 3P 민트 | **1.01** | 1.09 | 1.18 | 1.32 | 11.40 |
   | 4P 하늘 | 1.08 | **1.00** | 1.28 | 1.22 | 10.49 |

   The battle arenas use 대리석 (white), 하늘 (냉온탕 대결), 노랑 (사우나 계단) and 민트 (때밀이 링). Each slot colour therefore disappears against its own namesake arena. The duck's body (`Y #ffd23c`) is slot 1's colour, so the 1P duck's ring just looks like a fatter duck (`kits-battle.png`, P1 at the bottom left; `mpn-battle.png`, 뽀숑).
3. **Corners are broken.** `outlineOf` stamps the silhouette at 4 offsets only. Diagonal edges (ears, beaks, feet) get no ring, so the ring reads as dots on a busy tile.
4. **The colours are too close, and colour-blind players cannot use them.** CIELAB ΔE between slot pairs:

   | pair | normal | deuteranopia | protanopia | tritanopia |
   |---|---|---|---|---|
   | 분홍–민트 | 65.2 | **5.5** | 15.6 | 75.5 |
   | 민트–하늘 | 43.3 | 33.4 | 34.8 | **8.9** |
   | 노랑–분홍 | 78.5 | 67.4 | 82.1 | **18.8** |

   Nothing but colour tells the slots apart (no number, no shape). With four friends it is likely that one of them is colour-blind.
5. **Bubble hues lie.** The kit films use the animal's hue, and the hues sit right on the slot colours. Penguin `#9fdcff` ≈ 하늘, otter `#5fe0c8` ≈ 민트, duck `#ffe36b` ≈ 노랑, capy `#ffa98a` and the cat's pink yarn ≈ 분홍. A 3P penguin's shot looks like a 4P bubble. The owner ring is 1 px at alpha 0.9 on a bubble whose own sheen is cyan and violet (`mpn-battle.png`, the bubble cluster in the middle).
6. **The tags collide.** Animals 16 px apart carry pills 26–40 canvas px wide (wider on phones, where the font floor is 11 px ≈ 8 canvas px). The tags either overlap (`rv-tags-coop-390-zoom.png`: 손님4 is cut off by 말랑두부) or stack into a tower up to 4 high, far from the animals they name. A tag on a top-row player rises into the HUD strip (y < 16) and covers the scores.
7. **No "me".** The only cue is a faint white shadow on my tag, online only. After a KO respawn (1.5 s gone, then 2.5 s of blinking) or a co-op revive, nothing helps me find myself.
8. **The HUD doesn't map to the arena.** It has no names or numbers. Panels sit by array index, so a guest who leaves (`removePlayer` L8451 filters the array) shifts every later panel. The scores are coloured text on a dark strip, with no panel colour.

### 1.3 What is already right (keep it)

- The slot colour is the seat colour everywhere: room card border, tag, outline, bubble, `.pg-team` nick, podium confetti. One identity per seat.
- The tags are DOM, so Korean nicks stay crisp at any zoom.
- The hint chips (`연타!`, `구해 줘!`, `친구가 닿으면 살아나요`) sit right on the animals.

---

## 2. Player distinction (request 2)

### 2.1 What shows where

| Element | Solo | Co-op | Battle | Podium |
|---|---|---|---|---|
| Ink-ringed slot outline (§2.3) | – | ✓ | ✓ | ✓ |
| Ground marker (§2.4) | – | ✓ | ✓ | – (the blocks are the stands) |
| Twin colour (§2.5) | – | ✓ | ✓ | ✓ |
| Tag: number chip + nick (§2.6) | – | ✓ | ✓ | ✓ |
| Tag: "나" chip + white ring (§2.7) | – | ✓ online | ✓ online | ✓ online |
| Me spotlight (§2.7) | – | countdown, revive | countdown, respawn after KO | – |
| HUD seat panels (§2.8) | – | row 2 (8 px) | 4 panels (16 px) | (HUD hidden behind the overlay) |
| Bubble owner ring (§2.9) | – | 1 px | 2 px in flight, 1 px floating | – |
| Trapped-rival ring (§2.9) | – | – | 2 px, trapper colour | – |
| Ghost ring (§2.9) | – | 2 px | – | – |

Everything is gated by `multi()`. "Online" means `G.online`; local multiplayer (the test API) has no "me", exactly as today's `is-me`.

### 2.2 Slot identity constants (top constants, next to `SLOT_COLS`)

```js
const SLOT_COLS = ['#ffd447', '#f6a6bd', '#7fdcc8', '#8dc9ff'];   // unchanged
const SLOT_NAMES = ['노랑', '분홍', '민트', '하늘'];               // unchanged
const SLOT_INK = '#1c1530';    // the art's own ink (palette k): outer outline ring, marker rim
// twin colour ramps [L, M, D, DD] per slot (index 0 is never used: seat 1 is always the first copy)
const SLOT_RAMP = [
  ['#fff1a6', '#ffd447', '#e39a1e', '#a8661a'],
  ['#ffd6e4', '#f6a6bd', '#d0658c', '#8e3a5e'],
  ['#c6f6e6', '#7fdcc8', '#3fa587', '#22705a'],
  ['#d4ebff', '#8dc9ff', '#4f8fd6', '#2d5b9a'],
];
const slotNum = (pl) => String(pl.slot + 1);   // "1".."4"; tags and HUD show it, the room card shows "1P".."4P"
// the mark above an animal's head: p.y until shop.md S2 makes it p.y - lookLift(p.char, p.look) (a worn hat)
const headTop = (p) => p.y;
```

The ramps are runtime recolours, not palette keys, so the 64-colour palette limit (`tools/check-sprites.js` L32) is not touched. The 민트 ramp reuses the tile palette values `X / x / j`.

**The twin key table lives in `src/sprites.js`** as `PG.TWIN_KEYS` (the table of §2.5 as data: `{ duck: { L: 0, Y: 1, y: 2 }, capy: { K: 0, f: 1, F: 2, H: 3 }, … }`, role index into `SLOT_RAMP[slot]`), next to the art it describes, like shop.md's anchors: whoever redraws an animal fixes its twin keys in the same file, and `check-sprites.js` checks them without loading game.js. game.js reads it at bake time; an animal missing from it simply has no twin colour (the ring, marker, number and tag still tell it apart).

### 2.3 Ink-ringed outline

`outlineOf(f, flip, color)` → `ringOf(f, flip, color)`. It builds a canvas of size `(f.w + 4) x (f.h + 4)`, drawn at `(X - 2, Y - 2)`:

1. `sil` = the frame's silhouette (`f.wh` / `f.whm`), `source-in` filled with the slot colour. `ink` = the same, filled with `SLOT_INK`.
2. Draw `ink` at the 12 offsets that make a 2 px dilation (the 8 neighbours plus the 4 two-away: (±2,0), (0,±2), (±1,±1), (±1,0), (0,±1)).
3. Draw `sil` (slot colour) at the 8 offsets (±1,0), (0,±1), (±1,±1).
4. The body is drawn on top by `drawEnt`, as now.

The result, from the inside out: the art's own ink edge, then a solid 1 px slot band including the corners, then a 1 px ink band. Measured in sizes, the animal reads 20x20 instead of 18x18.

- `drawEnt` L5019 (the scaled / squashed path keeps `kx, ky`, now `2 * kx` and `2 * ky`) and `drawTurned` L5048 (offset `-f.w / 2 - 2`).
- **What it traces:** the frame `drawEnt` is about to draw, after its twin recolour and (once shop.md S2 lands) its worn-items composite: `f = frameOf → twinFrame → lookFrame → tintOf → ringOf(f, …)`. So the ring wraps body and hat in one band, and a 24x24 composite gets a 28x28 ring drawn at −2, with no other change.
- Cache: `lookOf(f, 'r' + flip + color, ...)` on that final frame object, built lazily, one per frame / flip / colour that is actually drawn. The worst case is about 1,000 canvases of about 20x20 (28x28 with items), well under 3 MB. A twin's frames get their own rings; with ≤ 4 players that is a few dozen more, so no sharing trick is needed.
- Unchanged: `white` flash, invulnerability blink (the ring blinks with the body), the dead spin. The trapped and ghost frames get no ring, as today.

### 2.4 Ground marker (발판 표시)

A small pixel ellipse in the slot colour under each animal, like a fighting-game player ring. It shows where everyone is and where they will land. A floating animal gets two ripples beside it instead.

**Sprites.** Baked once per slot × rim at boot, as pixel rows: `c` = slot colour, `#` = rim (`SLOT_INK` for others, `#ffffff` for me), `.` = clear.

```
L (14x5, standing)               M (10x3, low air)      S (6x3, high air)
...########...                   .########.             .####.
.##cccccccc##.                   #cccccccc#             #cccc#
#cccccccccccc#                   .########.             .####.
.##cccccccc##.
...########...

R (24x3, afloat: two ripples at the waterline; the middle 16 columns stay clear)
.###................###.
#ccc................ccc#
.###................###.
```

**Where.**
- **Afloat** (the feet are in water: `waterIdx(p.x + 8, p.y + 15) >= 0`; a floating animal sits `FLOAT_SUB` = 5 px deep): R, alpha 1, drawn from `x − 4` with its rows at `surf − 1 .. surf + 1`, `surf = surfY(that cell)`. Its ripples cover `x − 3 … x − 1` and `x + 16 … x + 18`, one clear column from the body on each side: nothing is drawn over the floating body (an L ellipse there would cut it in half at the waist), and a shop tube (≤ 2 px beyond the body) touches a ripple by 1 px at most.
- **Otherwise** `surf` = the nearer of two surfaces below the feet:
  - `landTile(p.x + 3, p.x + 13, p.y + 16, p.y + 56)`, the same feet span `updateDead` uses for falling bodies;
  - the first water surface `surfY(waterIdx(p.x + 8, p.y + 16 + 8k))`, for k = 0..5.
- `d = surf - (p.y + 16)`:
  - `d ≤ 1`: L, alpha 1.
  - `2 ≤ d ≤ 16`: M, alpha 0.85.
  - `17 ≤ d ≤ 40`: S, alpha 0.6.
  - farther, or no surface: no marker.
- Placement: centred on `x + 8`. The widest row sits on `surf - 1`, the animal's bottom pixel row:
  - L rows run `surf - 3 .. surf + 1`, so the ring hugs the feet and spills 2 rows onto the tile top.
  - M and S rows run `surf - 1 .. surf + 1`.
- The rule is geometric, so it works the same on a guest (other players' `onGround` / `water` are not needed) and through the drain wrap (`wrapDraw` on `surf`).

**When.**
- Hidden when `p.out`, `p.koT > 0`, `p.trap`, `p.ghost` or `p.dead` (co-op dying), in `transition` (doors) and on the podium.
- **Not** hidden by the invulnerability blink or the stun flash. The marker stays solid, which is exactly when a player hunts for their own animal.

**Draw order** (`renderScene`):
- Floor markers (L / M / S on a tile) are **floor decals**: drawn right after `drawWisps()` and before `drawItems()`, so snacks, pickups, enemies, the kits' floor rings (`drawKfx(true)`: the frog's lily pads, the capy's slam splash) and the bodies all lie on top of them. A frog's lily pad must not vanish under its own marker.
- Water markers (R, and an M / S whose surface is water) are drawn after `drawWater()`, so the 0.6–0.82 water overlay does not drown them. Only R can sit beside a body, and it never covers it.

**Cost.** 4 players × (1 `landTile` over ≤ 6 rows + ≤ 7 `waterIdx` + 1 `drawImage`) per frame. This is negligible.

### 2.5 Twin colour (쌍둥이 색): the same animal twice

**Who.**
- `twinOf(p) = G.players.some(q => q.slot < p.slot && q.char === p.char)`. The lowest seat with that animal keeps its natural colours. Every later copy is recoloured with **its own** slot ramp `SLOT_RAMP[p.slot]`.
- Seat 1 is never recoloured, so a 노랑 twin never exists.
- Computed **once per match** in `setupPlayers` and stored as `p.twin = true | false`. Guests build players from the same roster, so every screen agrees with no network field. It is not recomputed when a player leaves: a pink duck stays pink for the whole match. 한 판 더 recomputes it from the same roster, with the same result.
- In the room it is live: the seat portraits and my kit card preview it (§2.10).

**What changes.**
- Only the animal's own body ramp keys (`PG.TWIN_KEYS[char]`, §2.2) are swapped, by exact pixel match on the baked frame (`recolourFrame(f, map)` → `finishFrame`, cached `lookOf(f, 'v' + slot)`). A pixel match is a key match because no two palette keys share a value (57 keys, all distinct today); `check-sprites.js` asserts that it stays so.
- Eyes, beak, cheeks, outlines and any item layer keep their colours: the recolour runs on the bare body frame, **before** shop.md's items are composited onto it.
- The `L / M / D / DD` columns mean the `SLOT_RAMP[slot]` entries:

| animal | key → ramp role | result (2P / 3P / 4P) |
|---|---|---|
| duck | `L`→L, `Y`→M, `y`→D | pink / mint / sky duck, orange beak kept |
| capy | `K`→L, `f`→M, `F`→D, `H`→DD | the body recoloured, the yuzu (`Y L y`) kept |
| otter | `U`→M, `5`→D | the body recoloured, cream face `E` kept |
| penguin | `2`→M, `1`→D | dark-ramp body, white belly and pink towel kept |
| cat | `w`→L, `W`→M, `4`→M, `o`→D | a tinted white coat and tabby patches (the weakest twin, because the cat is mostly white; the marker and ring carry it). Its eye glints are `w` too and take the light tint: accepted, the pupils (`k`) stay. |
| frog | `n`→L, `t`→M, `m`→M, `T`→D | the body recoloured, eye whites and cheeks kept |

**Which frames.**
- The body poses drawn by `drawPlayer`: `<char>_idle|walk|jump|fall|shoot|die` and the move poses in `POSE` (`duck_glide`, `capy_slam`, `otter_dash`, `penguin_slide`, `cat_flip`).
- The HUD icon `life_<char>` and `portrait_<char>` (the art uses the same keys).
- Not the `_trapped` and `_ghost` frames: they are small curled copies, on screen briefly, and the 2 px rings and tags carry the identity there.

**Plumbing.** `drawEnt(name, i, x, y, flip, o)` gains `o.twin = slot`. The frame becomes `twinFrame(f, char, slot)` first, before shop.md's `lookFrame` (items), any tint, the ring or a scale. `drawRaw` gets a sibling `drawRawTwin(name, slot, x, y)` for the HUD. `portraitCanvas(c, name, size, lk, tw)` takes an optional twin slot `tw` (and, from shop.md S2, an optional look `lk`; the bust is recoloured first, then the items are drawn on it).

**Check** (art track, pass A0). `tools/check-sprites.js` asserts that `PG.TWIN_KEYS` names all six animals, that every key in it appears in at least one of that animal's body frames, and that the palette values are pairwise distinct. An art edit that renames a key fails loudly instead of silently dropping the twin colour.

### 2.6 Name tags v2

**Markup** (built once per tag, in `syncTags` L6165). Today `syncTags` writes `el.textContent = txt`; v2 writes only the two inner elements (`.pg-tag-n` and `.pg-tag-t`), never the tag's own `textContent`, which would delete them. The tag's `textContent` becomes "2뽀숑", which still contains the nick (`final-v3.js` L508 matches with `indexOf`).

```html
<span class="pg-tag" style="--slot:#f6a6bd"><i class="pg-tag-n">2</i><span class="pg-tag-t">뽀숑</span></span>
<!-- mine (online): -->
<span class="pg-tag is-me" style="--slot:#7fdcc8"><i class="pg-tag-n">나</i><span class="pg-tag-t">까삐</span></span>
```

**CSS** (page.html, replacing L368–L375 and the `.pg-tag.is-trap` rule at L384):

```css
.pg-tag { position:absolute; transform:translate(-50%,-100%); display:inline-flex; align-items:center; gap:0.25em;
  max-width:7em; white-space:nowrap; font-family:var(--font-body); font-weight:700; font-size:0.7em; line-height:1.05;
  padding:0.1em 0.42em 0.14em 0.14em; border-radius:0.6em; background:var(--slot,#fff); color:var(--ink);
  box-shadow:0 0 0 1px rgba(7,22,25,0.9); }
.pg-tag-n { flex:none; min-width:1.15em; height:1.15em; border-radius:0.45em; display:grid; place-items:center;
  font-style:normal; font-family:var(--font-sign); background:var(--ink); color:var(--slot,#fff); }
.pg-tag-t { min-width:0; overflow:hidden; text-overflow:ellipsis; }         /* min-width:0 lets a flex item ellipsize */
.pg-touch-on .pg-tag { font-size:max(0.7em, 11px); }                       /* the phone floor, kept from L373 */
.pg-tag.is-cmp { padding-right:0.14em; } .pg-tag.is-cmp .pg-tag-t { display:none; }
/* trapped: a ring in the TRAPPER's colour (syncTags sets --ring; none when the trapper is gone). White means "me" only */
.pg-tag.is-trap { box-shadow:0 0 0 1px rgba(7,22,25,0.9), 0 0 0 2.5px var(--ring, rgba(7,22,25,0.9)); }
/* me: a 1 px ink line, then 2 px of white (after is-trap, so my own trapped tag stays white) */
.pg-tag.is-me { box-shadow:0 0 0 1px rgba(7,22,25,0.9), 0 0 0 3px #ffffff; }
.pg-tag.is-me .pg-tag-n { background:#ffffff; color:var(--ink); }
.pg-tag.is-hi { font-size:0.91em; }                                   /* x1.3, the me moments (§2.7) */
.pg-touch-on .pg-tag.is-hi { font-size:max(0.91em, 14px); }
.pg-tag.is-ghost { opacity:0.85; }                                   /* was 0.6: a ghost's name must stay readable */
@media (prefers-reduced-motion: no-preference) { .pg-tag.is-hi { animation:pg-tag-bob 0.5s ease-in-out infinite alternate; } }
@keyframes pg-tag-bob { to { transform:translate(-50%,-100%) translateY(-2px); } }
```

**Placement** (all in canvas px; `W = 256`, `PF_TOP = 16`).
- Order: me first, then by seat.
- `anchorY = headTop(p) - 5 - lift`, where `lift` is 9 on the podium and `headTop` is the §2.2 stub (`p.y`) until shop.md S2 lifts it over a worn hat.
- Width and height are measured as today, cached per text and per mode (`_wF`, `_hF`, and the compact `_wC`, measured once per `screenScale`).
- `y = max(anchorY, PF_TOP + 1 + h)`: a tag never rises into the HUD strip. At worst it overlaps the top 2–3 px of an animal on the ceiling row.
- `cx = clamp(p.x + 8, w/2 + 1, W - w/2 - 1)`: a tag never clips at the walls. The canvas pointer stays at `p.x + 8`.
- Mode, for anyone but me:
  - **full** if its box clears every placed box by ≥ 1 px, *and* it has fitted for 20 consecutive frames (`el._fitN`, the hysteresis, so two animals walking past each other do not flicker);
  - otherwise **compact** (`is-cmp`, the number chip only, about 9–12 canvas px wide, which fits over a 16 px animal).
- If even compact collides, lift it above the hit (≤ 3 passes, as today), unless that would cross `PF_TOP + 1 + h`. Then it stays where it is and the overlap is accepted. Me is always full and placed first.
- Visibility is unchanged: `on` in `syncTags`, hidden for `out` / `koT`. The hint chip (`.pg-tip`) still sits on top of the tag at its final y.

**Canvas pointer** (`drawTagArrows` L5252): unchanged 5x3 ▼ in the slot colour, at `headTop(p) - f.h - 2 - lift`. Mine is white.

**Trapped ring colour.** `--ring` = `SLOT_COLS[owner]` of the bubble holding the player: the host has `p.trap.b.owner`; a guest has the trap's bubble id in the P row (index 20) and that bubble's owner in its U row. When neither is known, `--ring` is unset (ink).

### 2.7 "Me" (online only)

- **Tag:** the "나" chip, a white ring (2 px of white outside a 1 px ink line), never compact (§2.6).
- **Spotlight:**
  - Triggers: the first frame of `countdown`, and every transition of *my* player from not drawn (`koT > 0`, `ghost`, `out`) to drawn. That covers a battle KO respawn and a co-op revive, and the rule works the same on host and guest.
  - Draw: 3 rings, one every 30 f, 90 f in all. Each ring grows from r 9 to r 16 around `(p.x + 8, p.y + 8)` over 30 f, alpha 0.9 → 0. A 1 px white circle at r, with a 1 px slot-colour circle at r − 1.
  - It follows my animal as it moves. It is its own draw, not `kfx()`, because `kfx()` returns early under reduced motion. It is drawn after the players and before `drawTagArrows`.
  - Reduced motion: one static ring (white r 12 plus slot r 11) for 60 f.
- **Big 나:** for 120 f from each trigger my tag gets `is-hi` (×1.3, and it bobs 2 px unless the player prefers reduced motion).
- **Ground marker:** white rim (§2.4).
- **HUD:** white number box and a white underline (§2.8).
- **Off-screen / wrap indicator: none.** The arena is one fixed 256x224 screen. The only time an animal leaves it is the drain wrap, a few frames long, where `wrapDraw` already draws both copies and the marker and tag follow `p.y`.

### 2.8 HUD panels by seat

Both HUDs place panels by `p.slot`, never by array index. A player who leaves leaves an empty slot, and nobody's panel moves. `HUD bg #0a1a1d`.

**Battle** (`drawHUDBattle` L5803), the 16 px strip. Panel `x0 = [1, 53, 153, 205][slot]`, width 50. The timer (scale 2, about 46 px) stays at the centre, 105–151.

| part | rect / position | colour |
|---|---|---|
| panel | `fillRect(x0, 0, 50, 16)` | slot colour, alpha 0.16 |
| number box | `fillRect(x0, 0, 7, 9)` | slot colour, solid; **mine `#ffffff`** |
| number | `text(slotNum, x0 + 1, 1)` | `#0a1a1d` |
| icon | `life_<char>` (twin colour) at `(x0 + 8, 0)` | alpha 0.45 when KO'd or trapped (as today) |
| score | `text(score, x0 + 17, 1)` (5 digits end at `x0 + 46`) | slot colour |
| leader crown | `SPR_CROWN` at `(x0 + 8, 8)` | – |
| KO | `text('KO ' + kos, x0 + 17, 9)` | `#9fb8b4` |
| me underline | `fillRect(x0, 15, 50, 1)` | `#ffffff`, over the `#16363a` separator |

**Co-op** (`drawHUDCoop` L5783). Row 1 is unchanged. Row 2, y 8–15: panel `x0 = 2 + slot * 63`, width 61.

| part | rect / position | colour |
|---|---|---|
| panel | `fillRect(x0, 8, 61, 8)` | slot colour, alpha 0.16 (a down player blinks it at 0.25 / 0.45, as the icon today) |
| number box | `fillRect(x0, 8, 7, 8)` | slot colour; **mine `#ffffff`** |
| number | `text(slotNum, x0 + 1, 9)` | `#0a1a1d` |
| icon | `life_<char>` (twin colour) at `(x0 + 8, 8)` | – |
| score | `text(score, x0 + 17, 9)` (6 digits end at `x0 + 52`) | slot colour, or `#7a8e8c` when down (as today) |
| power dot | `(x0 + 54, 10)`, 3x3 | as today |
| me underline | `fillRect(x0, 15, 61, 1)` | `#ffffff` |

### 2.9 Bubbles, prisons, ghosts

- **Kit bubbles** (`drawKitBubble` L5312): the ring alpha goes from `0.9 * a0` to `a0`. In battle while `b.state === 'shot'`: `lineWidth 2` at r `9 * sx` / `9 * sy`. Otherwise 1 px at `8.5`. The film keeps the animal hue (the animal identity).
- **Plain bubbles** (`drawBubble` L5383, the 능력 끄기 or non-kit look): the owner gets the same ring as kit bubbles, on top of today's 0.35 tint.
- **Trapped rival** (battle): ring `lineWidth 2`, r 9, in the **trapper's** colour, plus today's tint. The victim's tag (number and nick, `is-trap`) names who is inside.
- **Co-op ghost** (`drawGhost` L5243): the revive ring goes to `lineWidth 2`, r 10, in the ghost's own slot colour. The tag opacity goes from 0.6 to 0.85 (§2.6).
- **Co-op shots** keep 1 px, because ownership only splits score there.

### 2.10 Room, results, podium

- **Room seat card** (`renderRoom` L8159): add a number chip `"1P".."4P"` at the top right of each filled card (`.pg-pc-n`, 0.72em, solid slot background, ink text). The "나" chip stays at the top left. The portrait shows the **twin colour** when that seat's animal duplicates a lower seat's (`portraitCanvas(r.char, 'portrait_', 32, lk, tw)`, §2.5; `lk` arrives with shop.md). The card `_key` gains the twin flag.
- **My kit card** (`#pg-room-kit`): when I am a twin, add one line under 특기: `같은 동물이 있어서 ${SLOT_NAMES[slot]}색으로 나와요` (for example "같은 동물이 있어서 분홍색으로 나와요"). It names the colour, not the animal, so no particle has to follow a name ("꽥꽥이로" / "개굴이로" would need a 받침 check; "분홍색 / 민트색 / 하늘색" all take "으로").
- **Co-op result rows** (`fillTeam` L6128): put the number chip inside the nick cell (`<i class="pg-tag-n">`, styled as on tags), so the grid stays at 5 columns.
- **Podium:** outline, twin colour and tags v2. No markers, no spotlight. The crown (today `p.y - 7`) and the flying trophy cups (today `p.y - 3`) move onto `headTop(p)` in shop.md S2.

### 2.11 Readability and performance budget

- Per frame, per player: 1 marker `drawImage`, 1 ring `drawImage`, 1 body `drawImage`, plus ≤ 13 tile and water lookups. Rings, twin frames and markers are cached canvases.
- DOM: still ≤ 4 tags and 4 tips. Each update is a class toggle or a style write, guarded by the same `_l` / `_t` / `className` caches as today. Widths are re-measured only when the text or mode changes.
- At 256x224 the extra 1 px ink ring makes each animal 2 px wider each way. Hit boxes, `x / y` and physics do not change.
- Phones (390 px wide, about 1.35 css px per canvas px): tags keep their 11 px font floor. Compaction is what keeps four tags attached to four animals there.

### 2.12 The joint contract with shop.md (both docs say the same)

1. **One drawing order** in `drawEnt`: `frameOf` → `twinFrame` (this doc, body keys only) → `lookFrame` (shop.md 6.2: the worn items composited onto the body) → `tintOf` (afterimages) → `ringOf` traced from that final frame. Items are never recoloured; the slot-plus-ink ring always wraps body and hat in one band.
2. **`headTop(p)`** is the only place that knows how tall a hat is. This doc adds it as `(p) => p.y` (pass D3, with the constants) and points the tag and its pointer at it (pass D4); shop.md S2 makes it `p.y - lookLift(p.char, p.look)` and moves the stun stars, the capy's slam lines, the podium crown and the flying trophy cups onto it.
3. **The feet belong to the ground marker.** No item draws below the feet line or more than 4 px sideways (a tube ≤ 2 px); no effect draws a ring on the floor; e6's footprints start at the heel.
4. **Frozen at match start:** twin colours (§2.5) and worn looks (shop.md 6.5, 7.1). Looks ride only in room-phase R, so snapshots do not grow.
5. **No body-colour skins or dyes.** The body colour is how twins are told apart. If skins ever ship, the twin colour wins in multiplayer.
6. **Battle coins never count monster kills** (shop.md 3.1 pays minutes, place, KOs and 탕), so 몬스터 출현 on or off earns the same.
7. **No item copies an identity or gameplay sign:** no crown shape, no gold-and-red, no round shiny bubble, no ring, nothing white around a tag (white = "me").

### 2.13 Implementation map

| Where | Change |
|---|---|
| top constants (L104) | `SLOT_INK`, `SLOT_RAMP`, `slotNum`, `headTop` stub (§2.2) |
| `src/sprites.js` (art pass A0) | `PG.TWIN_KEYS` (§2.2, §2.5); `tools/check-sprites.js` checks it |
| `outlineOf` L542 | → `ringOf` (§2.3); `drawEnt` L5019 and `drawTurned` L5048 use it with offset 2 |
| new `recolourFrame`, `twinFrame` | next to `tintFrame` L492 |
| `setupPlayers` L905 | sets `p.twin` once per match (`removePlayer` L8451 never recomputes it) |
| `drawPlayer` L5191 | `o.twin = p.twin ? p.slot : undefined` |
| new `drawMarkers(water)` | `drawMarkers(false)` right after `drawWisps()` (floor decals, under items / enemies / `drawKfx(true)` / bodies); `drawMarkers(true)` right after `drawWater()` (R ripples, M / S over water) |
| new `drawMeSpot` | after the players (§2.7); its triggers are tracked in `updateFx` |
| `drawTagArrows` L5252 | `headTop`; white for me |
| `drawKitBubble` L5312, `drawBubble` L5383, `drawGhost` L5243 | the ring widths (§2.9) |
| `drawHUDBattle` L5803, `drawHUDCoop` L5783 | the seat panels (§2.8) |
| `syncTags` L6165 + page.html L368–L375, L384 | tags v2 (§2.6), the trapper-colour ring |
| `renderRoom` L8159, `fillTeam` L6128, `portraitCanvas` L6023 | number chips, twin portraits (`tw`), the twin line (§2.10) |
| debug API | `looks()` → `[{slot, num, twin, marker: 'L'\|'M'\|'S'\|'R'\|'', tag: {text, cmp, me, hi, l, t, ring}}]` for tests |

### 2.14 Tests

Two new drivers: **`src/tests/distinction.js`** (virtual time, local players; "DIST PASS|FAIL …", "DIST DONE pass=N
fail=M"; run-all job `distinction`) and **`src/tests/distinction-net.js`** (real time, 2-4 frames over bc via
`tools/serve.js`; "DISTNET … DONE"; run-all job `distinction-net`) for everything that needs "me" (only an online game
has one).

1. **Solo unchanged:** a solo round's canvas is pixel-identical to the pre-change baseline at three moments (start, mid-round, shot), and `looks()` is empty. The baseline is three canvas hashes (the `kits.js` hash method, fixed seed and `G.frame`, a bare store) taken on the build **before** the pass changes anything and written into the test as constants.
2. **Four ducks** (`D.local.battle(['duck','duck','duck','duck'], {arena: 0, countdown: false, monsters: false, intrusion: false})`; `monsters` needs D1):
   - `looks()` twins are `[false, true, true, true]`.
   - A body pixel of slot 2 equals `SLOT_RAMP[1][1]`, slot 1 equals `#ffd23c`.
   - The ring pixel 1 px outside the silhouette equals the slot colour, and the pixel 2 px outside equals `SLOT_INK`.
   - The HUD icons of slots 2-4 are recoloured too; the room portrait of a twin seat is (D4).
3. **Twin freeze:** `removePlayer(0)` mid-match leaves slot 2's twin flag (and colour) unchanged. A rematch recomputes it.
4. **Markers:**
   - A grounded player on each of the 4 arenas has an L marker whose centre pixel at `surf - 1` equals its slot colour.
   - Jumping gives M then S, then none above 40 px.
   - A player afloat in 냉온탕 대결's water shows the R ripples over the water at `x − 3` and `x + 18`, and **no** marker pixel inside `x .. x + 15`.
   - A frog's lily pad drawn where its marker is stays visible (the pad's fill colour is found at the pad's centre).
   - During the respawn blink the marker is drawn on all frames.
5. **Tags** (local):
   - Four animals placed 16 px apart on one floor: no two tag boxes overlap, all are compact on the first frame, and every tag bottom stays within 20 px of its animal's head.
   - A player on the top row: tag top ≥ `PF_TOP + 1`.
   - A player at `x = WALL_L - 2`: the tag stays inside the canvas.
   - Hysteresis: two animals crossing do not toggle `is-cmp` more than twice in 60 f.
   - A trapped rival's tag ring is the trapper's slot colour, never white; with the trapper gone, ink.
   - Each tag's `textContent` contains its nick (the `final-v3` and `mp-local` readers).
6. **HUD by seat:**
   - Battle with slots 0, 1 and 3: slot 3's number box is at `x = 205`.
   - After slot 1 leaves, slot 3's box is still at 205.
   - Co-op with 2 players: the panels are at `x0 = 2` and `65` (63 wide each, no longer stretched to 126).
7. **Bubbles:** in battle, a shot in flight has an opaque 2 px ring at r 9, and the same bubble floating has 1 px. A co-op shot has 1 px.
8. **Online "me"** (`distinction-net`): my tag is full with the "나" chip and the white ring, every other tag is not white; my HUD panel has the white box and underline; after a KO of my player and its respawn, `looks()[me].tag.hi` is true for 120 f and the ring pixels appear; under `prefers-reduced-motion` a single static ring. The guest's `looks()` twins and markers equal the host's.
9. **Screens:** 390 and 900 px screenshots of a 4-duck battle on each arena, a co-op round with a ghost, a floating animal in 냉온탕 대결 and the podium (`dist-*-390.png`, `dist-*-900.png`), for review.
10. **Soak:** `fv3-soak` frame time with 4 players stays within 5 % of the baseline.
11. **Existing tests stay green:**
    - run-all: `mp-local` (L87 `slotColors()`, L41 visible tags), `v3-fixes` (L262-275 "name tags of animals standing together are stacked, not overlapping": compact tags + lifting keep it true), `kits`, `kits-scenes-*`, `kits-online`, `kits-net`, `check-sprites`, `sprites-*`, `mp-local-*` shots.
    - By hand (not in run-all; `node tools/run-chrome.js <page> …` as each file's header says): `final-v3.js` (L484 card `--slot`, L508 tag text), `char-sheet.js`, `review-mpmaps.js` (`#tagsN`), `ux-review.js`.
    - `check-sprites.js` gains the twin key and distinct-palette assertions (A0).

---

## 3. 몬스터 출현 (request 1)

### 3.1 The option

| Item | Value |
|---|---|
| Key | `monsters` (boolean). **Default `true`.** |
| Room UI | `buildOpts` L8055: a new `chk('monsters', '몬스터 출현', '경기 내내 때 몬스터가 나와요')` **between** 능력 끄기 and 보스 난입, giving the order 경기장 · 시간 · 능력 끄기 · **몬스터 출현** · 보스 난입 · 트로피 걸기. Checked = monsters on, a positive switch like 보스 난입. |
| Change handler | The `chk` helper's handler generalises to `netSetOpts({ [key]: key === 'perks' ? !c.checked : c.checked })`. |
| `syncOpts` L8094 | `const mo = box.querySelector('[data-opt="monsters"]'); if (mo) mo.checked = o.monsters !== false;` (guests see it disabled, as today) |
| `NET.opts` L6686 | `{ arena: -1, time: 3, perks: true, monsters: true, intrusion: true, bet: 0 }` |
| `netSetOpts` L7045 | `if ('monsters' in o) NET.opts.monsters = o.monsters !== false;` |
| `roomInfo` L7037 | `o: [arena, time, perks?1:0, intrusion?1:0, stakeNow(), NET.opts.monsters === false ? 0 : 1]`, appended at **index 5**. Index 4 (the stake) keeps its place. |
| `guestRoom` L7223 | adds `monsters: R.o[5] !== 0` to the rebuilt `NET.opts`. **Only an explicit `0` turns monsters off.** Missing (an older host), `undefined`, junk or `1` all mean on, which is what an older host does anyway. |
| `G.opts` L857 | `{ arena: -1, time: 3, perks: true, monsters: true, intrusion: true }` |
| `newBattle` L1136 | `monsters: opts.monsters !== false` in `G.opts` |
| `guestBegin` L7552 | copies `monsters: NET.opts.monsters` into `G.opts` |
| Test API `host(opts)` L8353 | already forwards `opts` to `netSetOpts`, so `monsters` works with no change. Update the comment. |

**Compatibility.**
- `NET_V` stays 4.
  - An older guest of a new host ignores `o[5]`. It simply plays a match with no enemies (its view comes from the host's snapshots) and its summary line lacks the word.
  - A new guest of an older host reads on, which is true.
- Cost: `,1` is 2 bytes in `R`, which rides with every snapshot. `snapMax ≤ 3400` still holds.
- The `trophies-net.js` L260 tamper hook rebuilds `R.o` as `slice(0, 4).concat([50])`. That drops `o[5]`, which reads as on (default). It is correct as long as that test leaves monsters at the default. Note it next to the hook.

### 3.2 What changes in the battle when monsters are off (host only; guests just render)

| Place | Change |
|---|---|
| `startArena` L3193 | skip the opening wave (the `for (k < min(BATTLE_ENEMIES, sps.length))` loop). The start banner sub becomes `'배틀 · N분 · 몬스터 없음'`; guests get it like any banner. |
| `updateBattle` L3235 | the respawn line becomes `if (G.opts.monsters !== false && up < BATTLE_ENEMIES && --bt.enemyT <= 0) …`. `bt.enemyT` simply stops counting. |
| `minionCap` L2092 | `G.gameMode === 'battle' && G.opts.monsters === false ? 0 : (today's value)` |

What the `minionCap` change does:
- **`bossMinions` summons nothing.**
- **A landed spore withers** (`updateSpore` L2683 already takes the wither branch when `minionCount() >= minionCap()`).
- The intruder is still worth `INTRUDE_PTS`, and is lathered by direct bubble hits only. Its soap is already halved: `soapMax = max(2, round(def.soap * 0.5))`.

Unchanged and verified to work with zero enemies:
- **Power-ups:** the arena pickup every `BATTLE_POWER_EVERY` (1200 f) is independent of enemies. `maybeDropPower` already returns early in battle (L1040).
- **KO scoring:** `knockOut` +500, the trap, the mash out (all player vs player).
- **Stuns:** `hitTest` with no enemies only stuns from the intruding boss, its hazards and drops. `STUN_PTS -100` is unchanged.
- **`respawnBattle`:** its danger loop over `G.enemies` sees none and the boss check stays. Spawns still pick the spot farthest from rivals.
- **Score:** with no enemies the sources are +10 per empty pop, KO +500, intruder +1500 and −100 per stun. The podium order and tie-breaks (`score, kos, koed, slot`) are unchanged.
- **Trophies:** by rank (`troHostResult`), so they are unaffected. A monster-off match is ranked or practice by the same rules as any other, and the stake applies. 능력 끄기 sets the precedent that options do not change ranking.
- **비누 코인** (other design): see §2.12 item 6.
- **한 판 더:** `rematch` copies `G.opts`, so the setting carries over.
- Guests: `G.battle.enemyT = 1e9` (L7639), so guests never spawn in either setting.

Balance note: without monsters the pace is pure player vs player. `BATTLE_POWER_EVERY` stays 1200 in v1. If play-tests feel slow, 900 when monsters are off is the knob. It is not part of this spec.

### 3.3 Why `minionCap` must change (the trap in "just stop spawning")

`minionCount()` counts **every** live enemy, arena ones included. The battle keeps up to 6 arena enemies, refilled every 90 f, and `MINION_CAP` is 4. So today an intruding boss almost never gets to summon. With the arena empty and the cap untouched, the intruder would summon 2–3 minions every 480–660 f and spores would hatch molds: turning monsters "off" would *add* monsters at 1:30. Capping minions at 0 keeps the switch's meaning: no monsters at all, only the boss if 보스 난입 is on.

### 3.4 Room text

- **Guest summary line** (`renderRoom` L8214): add `'몬스터 없음'` **only when off**, after the 능력 part. For example "배틀 · 대중탕 한판 · 3분 · 능력 있음 · 몬스터 없음 · 보스 난입 · 트로피 10개씩".
  - The default line is unchanged, and `final-v3.js` L658 keeps matching.
- **Rules list** (`renderRoom` L8240): when off, prepend `'몬스터 없이 친구끼리만 겨뤄요'` to the battle rules.
- Warm the new strings in the V3 text block (L211–L213): `몬스터 출현 경기 내내 때 몬스터가 나와요 몬스터 없음 몬스터 없이 친구끼리만 겨뤄요`.

### 3.5 Tests

Two new drivers: **`src/tests/monsters.js`** (virtual time, local; "MON … DONE"; run-all job `monsters`) for 1-3 and 5, and **`src/tests/monsters-net.js`** (real time, 2 frames over bc; "MONNET … DONE"; run-all job `monsters-net`) for 4. `final-v3` is not in run-all, so the online check cannot live there.

1. **Local, off:**
   - `D.local.battle(4 chars, {arena: 0, monsters: false, intrusion: false})`: after 600 f `G.enemies.length === 0`, and after 1300 f `G.pickup` is not null.
   - A rival trapped and popped gives `kos === 1` and +500.
   - `setTimeLeft(0)` reaches the podium.
2. **Local, off + 보스 난입:**
   - `setTimeLeft(91)`: the intruder arrives, and over the next 1500 f `G.enemies.length === 0` (no minions).
   - The moldQueen's spores wither.
   - Bursting the intruder with direct hits gives +1500.
3. **Local, default** (no `monsters` key): enemies appear after `BATTLE_OPEN_DELAY`, as today (regression).
4. **Online** (`monsters-net`: forced bc, driven through the DOM like `final-v3`):
   - The host unticks `#pg-room-opts [data-opt="monsters"]`.
   - The host's `R.o.length === 6 && R.o[5] === 0`.
   - The guest has `NET.opts.monsters === false`, `#pg-room-sum` contains `몬스터 없음`, and the guest's checkbox is disabled.
   - In game, the guest's view has no enemies.
   - `snapMax ≤ 3400`.
5. **Backward** (through a debug hook `PG.debug.mp.guestRoom(R)` that feeds a crafted R to `guestRoom`, added if none exists):
   - `guestRoom` with `o` of length 5 → monsters on.
   - With `o[5] = 'x'` → on. With `o[5] = 0` → off.
6. **Existing:** run-all `arena-gate`, `trophies-net` (its tamper hook drops `o[5]` = on), `mp-net`, `kits-net`; by hand `review-mpmaps`, `review-mpbal` and `final-v3` (L658: the default summary line) pass without the key (default on, unchanged numbers).

---

## 4. 친구와 하기 on a link that cannot use it (request 4)

### 4.1 The trace today

1. **A viewer opens the artifact by its public link.** 친구와 하기 → `netOpenFriends` L6820 → `netTransport` L6760.
   - `Net.fromQuery()` finds no `?net=`, so `trForced` stays false.
   - `Net.transports()` → `roomNs()`: `window.claude.use('room')` resolves to `null` for a public-link viewer (net.js L52–L55), so `room: false`.
   - There is no PeerJS on the artifact page, so `peer: false`. `bc: true` → **`NET.tr = 'bc'`, and `localOnly()` (L6811) is true.**
   - The same happens when the namespace exists but the room then fails `not_granted`: `markRoomDead` → the lobby's `onDead` → `netRoomDead` L6784 → transports are detected again → `'bc'`.
   - It also happens on the standalone deploy when PeerJS failed to load (`peerTag()` true → `why = peerOff`).
2. **`renderFriends`** L8115 shows the small yellow `.pg-note`: **온라인은 Claude에 로그인하고 이 게임에 초대받은 친구끼리만 할 수 있어요** / 지금은 이 브라우저의 다른 탭끼리만 함께 할 수 있어요. `off` is false, so **방 만들기 and 참여 are both enabled**.
3. **The friend types the host's code and taps 참여.** `netJoin` L6911 → `PG.Net.join({transport: 'bc'})` → the bc guest looks for the host on this browser's BroadcastChannel for `findMs = 1500 + 2·rtt` → `not_found` → **"방을 찾을 수 없어요"**. That is false: the room exists, this page just cannot reach Claude rooms.
   - Tapped while detection was still pending: `return { ok: false, code: 'local_only' }` with **no message at all**.
4. **방 만들기** → a bc room. Its hint says "이 브라우저의 다른 탭에서만 들어올 수 있어요", but its status line says "친구에게 방 코드를 알려 주세요", and the player shares a code that nobody can use. The first tap while detection was pending is swallowed silently.

### 4.2 The fix

`roomOffKind()` returns `localOnly() ? (peerTag() ? 'peer' : 'room') : ''`. Forced bc (`?net=bc`, every test) gives `''`, so tab play through `net-bc.js`, `mp-net`, `kits-net` and the others is untouched.

'room' covers a null namespace and every terminal room code (`not_granted`, `revoked`, and the rare `capability_disabled` / `capability_removed` / `transform_error` when the publisher changed the artifact). For the last three, "ask for an email invite" is not quite the reason, but the person who sees it can only ask the sender anyway; a third variant is not worth its strings.

**Friends panel when `roomOffKind()` is set** (`renderFriends`):
- `#pg-net-note` becomes a block card. Change the element from `<p>` to `<div role="note">`; tests read its `textContent`, which still works. Its class is `pg-note is-block`. Content (variant `room`):
  - heading **이 링크로는 친구와 하기를 쓸 수 없어요**
  - `NET_TEXT.roomOff`, **verbatim**: 온라인은 Claude에 로그인하고 이 게임에 초대받은 친구끼리만 할 수 있어요 (net-node-test L488 and review-room-platform L472 / L488 match this sentence)
  - 게임을 보내 준 친구에게 Claude 이메일 초대를 부탁해요 · 초대 메일 속 링크로 열면 돼요
  - 혼자 하기는 지금 바로 할 수 있어요
- Variant `peer` (deploy):
  - heading **온라인 연결 도구를 불러오지 못했어요**
  - 인터넷을 확인하고 새로고침해 주세요
  - a `새로고침` button (`location.reload()`)
- The existing `peerWatch` still switches the panel to PeerJS if it arrives late, and the card then disappears.
- **방 만들기:** `disabled`. It keeps its label ("같이 하기 방 만들기" / "배틀 방 만들기") and has `aria-describedby="pg-net-note"`. The mode and option controls stay usable; they are harmless.
- **코드 input and 참여:** stay **enabled**. The person arriving with a code gets the answer at the moment they act.
- `!NET.tr` (no BroadcastChannel either) keeps today's behaviour, with both buttons disabled, but uses the same block style for the card.

**`netJoin`:** after `await netTransport()`, whether detection was pending or not:

```js
if (roomOffKind()) { NET.busy = false; setChip(''); NET.err = roomOffKind() === 'peer' ? NET_TEXT.joinOffPeer : NET_TEXT.joinOff;
  netNoteFlash(); renderFriends(); return { ok: false, code: 'room_off', text: NET.err }; }
```

- **No bc attempt and no wait**: the answer is immediate.
- This replaces the silent `local_only` return.
- After a failed join (any code), if `PG.Net.roomDead && PG.Net.roomDead()` is true, the room died under the attempt. Then set the same `joinOff` text instead of "연결이 끊겼어요" / "방을 찾을 수 없어요", call `netRoomDead()`, and the card appears.

**`netHost`:** the same guard. It returns `null` with `NET.err = hostOff` / `hostOffPeer`, and the pending first tap is no longer swallowed silently. Reaching it needs the test API or a script, because the button is disabled. `review-room-platform` `notGranted` (L496) accepts "no code and an error", so it stays green.

**`netNoteFlash()`:**
- Adds `is-flash` to the card for 700 ms: the box-shadow pulses 0 → `0 0 0 4px rgba(255, 154, 138, 0.55)` → 0, twice, 0.35 s each. There is no animation under `prefers-reduced-motion`.
- Calls `card.scrollIntoView({block: 'nearest'})`, because on a 390 px phone the card is above the fold once the join box is focused.
- `#pg-friends-err` is `role="alert"`, so the sentence is announced.

**Room screen:** the localOnly branch of `#pg-room-hint` can no longer be reached by a real user, because hosting is refused. Keep it for safety; it costs nothing.

**CSS** (page.html, after `.pg-note` L436):

```css
.pg-note.is-block { text-align:left; padding:0.7em 0.9em; border-radius:0.9em; background:rgba(255,138,122,0.12);
  border:2px solid #ff9a8a; color:var(--cream); }
.pg-note.is-block .pg-note-h { display:block; margin-bottom:0.3em; font-family:var(--font-sign); font-size:1.1em; color:#ffb3a6; }
.pg-note.is-block span { display:block; }
.pg-note.is-block .pg-note-foot { margin-top:0.35em; color:var(--cream-dim); font-size:0.9em; }
@media (prefers-reduced-motion: no-preference) { .pg-note.is-flash { animation:pg-note-flash 0.35s ease-in-out 2; } }
@keyframes pg-note-flash { 50% { box-shadow:0 0 0 4px rgba(255,154,138,0.55); } }
```

### 4.3 Strings (`NET_TEXT` L6653; net.js `TEXT` unchanged)

| key | text |
|---|---|
| `offHead` | 이 링크로는 친구와 하기를 쓸 수 없어요 |
| `offHow` | 게임을 보내 준 친구에게 Claude 이메일 초대를 부탁해요 · 초대 메일 속 링크로 열면 돼요 |
| `offSolo` | 혼자 하기는 지금 바로 할 수 있어요 |
| `joinOff` | 이 링크로는 친구와 하기를 쓸 수 없어요 · 방장에게 이메일 초대를 부탁해요 |
| `hostOff` | 이 링크로는 방을 만들 수 없어요 · 게임을 보내 준 사람에게 이메일 초대를 부탁해요 |
| `peerHead` | 온라인 연결 도구를 불러오지 못했어요 |
| `joinOffPeer` / `hostOffPeer` | 온라인 연결 도구가 없어요 · 새로고침해 주세요 |
| `reload` | 새로고침 |

`roomOff`, `local`, `not_found` and the others are kept as they are. Warm the new strings with the V3 text.

### 4.4 Tests

1. **`review-room-platform` `notGranted`** (extend):
   - The note matches `/온라인은 Claude에 로그인하고/` **and** `/이 링크로는 친구와 하기를 쓸 수 없어요/`.
   - `#pg-host` is disabled.
   - `mp.join('ab12')` resolves in **< 300 ms** with `{ ok: false, code: 'room_off' }`, and `#pg-friends-err` is exactly the `joinOff` text.
   - **The page never shows "방을 찾을 수 없어요".**
   - `mp.host()` returns `null` with `hostOff`.
   - Solo still plays.
2. **A null namespace** (signed out / public link: `use('room')` → null): the same checks.
3. **The room dies mid-join** (`not_granted` raised on the join's presence): the error is `joinOff` and the card appears within one render.
   - The existing `never` case (the runtime never answers; 방 만들기 tapped while waiting): once detection settles on bc, the pending tap ends with `hostOff` in `#pg-friends-err` and no room (today it ends silently); its `ok()` checks ("after ~10 s the explanation appears") still hold.
4. **Pending tap:** 참여 pressed before detection resolves to localOnly gives the same `joinOff` (not silent).
5. **Forced bc unchanged:** `?net=bc` with a missing code still reads "방을 찾을 수 없어요". Two forced-bc tabs host and join (`net-bc.js`, `mp-net.js` unchanged).
6. **Deploy, PeerJS blocked** (`deploy-peerstub`-style page with the script failing): the peer card shows a `새로고침` button and join answers `joinOffPeer`. When the script arrives late, the card disappears and the buttons are enabled (`peerWatch`).
7. **Screens:** `off-friends-390.png` and `off-friends-900.png`, before and after a 참여 tap.

---

## 5. Rejected alternatives

- **New, saturated slot colours (red / blue / green / yellow).**
  - Breaks the brand palette and five tests.
  - Still fails on tile themes of the same lightness.
  - Still fails for colour-blind players without numbers.
  - The ink ring plus numbers fixes the real failures with no new hues.
- **A coloured accessory per slot (scarf, cap) to tell twins apart.** It clashes with the shop's wearable items.
- **A 2 px slot-only outline.** It disappears on a namesake tile exactly like 1 px does. Contrast, not width, is the problem.
- **A whole-sprite `tintFrame` for twins.** It also tints eyes and ink (muddy) and is weaker than a body-ramp swap.
- **Off-screen arrows.** The arena is a single fixed screen.
- **Stacking tags higher.** That is today's tower problem. Compaction keeps them attached.
- **Keeping same-browser bc play on public links.** It has no value to real users and is the source of the false "방을 찾을 수 없어요". Tests force bc explicitly anyway.
- **Monsters off without capping minions.** It makes the intruder spawn more monsters than today (§3.3).

---

## 6. Implementation passes

Two tracks, as in shop.md §19. **Code** passes edit `src/game.js` (with page.html, tools and tests) strictly one after
another, each by a single agent starting from the previous pass's green suite. The **art** pass edits only
`src/sprites.js` and `tools/check-sprites.js` and can run any time before the code pass that needs it.

**Order across both docs:** D1 → D2 → D3 → D4 → shop S1 → S2 → S3a → S3b → S4 → S5; art A0 before D3, shop A1 before S2,
shop A2 before S3a's screenshots. D1 and D2 are small and independent and can each ship on their own the moment they
are green: the user is playing online with friends now, and request 1 is a one-switch change.

**Every pass, before handing over:** `node build.js` succeeds; the pass's run-all filter is green while iterating; then
the **full** `node tools/run-all.js` is green (no console error or warning in any job); the drivers that are not in
run-all and that the pass names are run by hand (`node tools/run-chrome.js …`, see each file's header); the screenshots
the pass names are looked at with Read; anything built differently from this doc gets a short "as built" note at the end
of this file. Never start a pass while another workflow is running the suite.

| Pass | Track | Needs | Files | Size (rough) |
|---|---|---|---|---|
| A0 twin keys | art | – | sprites.js, tools/check-sprites.js | ~20 lines |
| D1 몬스터 출현 | code | – | game.js, src/tests/monsters.js (new), src/tests/monsters-net.js (new), tools/run-all.js | ~45 + 300 |
| D2 친구와 하기 on a link that cannot use it | code | D1 | game.js, page.html, src/tests/review-room-platform.js, src/tests/review-peer-deploy.js, tools/run-all.js (2 shots) | ~80 + 30 + 150 |
| D3 body identity | code | D2, A0 | game.js, src/tests/distinction.js (new), tools/run-all.js | ~260 + 350 |
| D4 tags, "me", room and results | code | D3 | game.js, page.html, src/tests/distinction.js, src/tests/distinction-net.js (new), tools/run-all.js | ~220 + 50 + 350 |

### A0 — twin keys (art track)

- **Do:** `PG.TWIN_KEYS` in `src/sprites.js` (the §2.5 table as data, §2.2); in `tools/check-sprites.js`: all six animals
  are listed, every listed key appears in that animal's body frames, roles are 0-3, and the palette values are pairwise
  distinct.
- **Accept:** `node tools/check-sprites.js` prints its OK line; run-all `check-sprites` green. (game.js ignores the table
  until D3.)

### D1 — 몬스터 출현 (request 1)

- **Do:** §3.1-3.4: the checkbox in `buildOpts` (between 능력 끄기 and 보스 난입) and the generalised `chk` handler,
  `syncOpts`, `NET.opts` / `G.opts` defaults, `netSetOpts`, `roomInfo` `o[5]`, `guestRoom`, `newBattle`, `guestBegin`,
  `startArena` (no opening wave, the banner sub "배틀 · N분 · 몬스터 없음"), `updateBattle` (no respawn), `minionCap` (0
  when off), the guest summary line and the rules line, the V3 warm-up text; `PG.debug.mp.guestRoom(R)` if no such hook
  exists; `src/tests/monsters.js` and `src/tests/monsters-net.js` (§3.5); run-all jobs `monsters` and `monsters-net`.
- **Accept:** run-all `monsters monsters-net arena-gate trophies-net mp-net kits-net net-bc` green; by hand `final-v3`
  (L658 default summary line), `review-mpmaps`, `review-mpbal`; screenshots of the friends panel's battle options and the
  room (host and guest) at 390 and 900 px: the new row sits between 능력 끄기 and 보스 난입 and nothing wraps badly.
- **Release:** may ship alone.

### D2 — 친구와 하기 on a link that cannot use it (request 4)

- **Do:** §4.2-4.3: `roomOffKind()`, the block card in `renderFriends` (`#pg-net-note` as `<div role="note">`, the
  `room` and `peer` variants, 새로고침), 방 만들기 disabled with `aria-describedby`, the `netJoin` / `netHost` guards
  (immediate answer, no silent return, the room dying mid-join), `netNoteFlash`, the `NET_TEXT` strings and their warm-up,
  the CSS; the tests of §4.4 in `review-room-platform.js` and `review-peer-deploy.js`; two screenshot jobs
  (`off-friends-390`, `off-friends-900`, before and after a 참여 tap).
- **Accept:** run-all `room-platform peer-deploy net-bc net-node mp-net` green (`net-node`'s `TEXT.roomOff` pin and the
  "온라인은 Claude에 로그인하고" matches still hold); `mp.join('ab12')` on a not-granted page answers in < 300 ms and the page
  never shows "방을 찾을 수 없어요"; the screenshots looked at (the card is the first thing under the heading on a 390 px
  phone, and 참여 scrolls it into view).
- **Release:** may ship alone.

### D3 — body identity: ring, twin colour, ground marker, HUD by seat, bubble rings (request 2, part 1)

- **Do:** first take the three solo baseline hashes on the unchanged build (§2.14 test 1). Then §2.2 (constants, the
  `headTop` stub), §2.3 `ringOf` (in `drawEnt` / `drawTurned`), §2.5 twin colour (`recolourFrame`, `twinFrame`,
  `drawRawTwin`, `p.twin` in `setupPlayers`, `o.twin` in `drawPlayer`, `portraitCanvas`'s `tw`), §2.4 markers (L / M / S /
  R, both draw calls), §2.8 HUD by seat (incl. my white box and underline online), §2.9 bubble, prison and ghost rings;
  `looks()` (twin, marker); `src/tests/distinction.js` groups 1-4, 6, 7 and 10; the `dist-*` screenshot jobs for the
  battle arenas, co-op with a ghost, a floating animal and the podium.
- **Accept:** run-all `distinction mp-local v3-fixes kits kits-scenes kits-online kits-net sprites check-sprites` green;
  solo pixel-identical to the baseline; by hand `char-sheet`, `review-mpmaps`; the screenshots looked at: every slot
  readable on its namesake arena (냉온탕 대결 for 하늘, 사우나 계단 for 노랑, 때밀이 링 for 민트), four ducks in four
  colours, a floating animal not cut by its marker, lily pads visible over markers; fv3 soak within 5 %.
- **Release:** may ship alone (tags stay as today until D4).

### D4 — name tags v2, "me", room and results (request 2, part 2)

- **Do:** §2.6 tags v2 (markup written into the inner elements, compaction with hysteresis, HUD-strip and wall clamps,
  `headTop`, the trapper-colour ring, CSS incl. the phone floor), §2.7 "me" (the 나 chip and ring, the spotlight and its
  triggers, `is-hi`), `drawTagArrows` (white for me, `headTop`), §2.10 room number chips, twin portraits, the kit card's
  twin line, co-op result chips; `looks()` tag parts; `distinction.js` group 5; `src/tests/distinction-net.js` (group 8);
  run-all job `distinction-net`; the 390 / 900 screenshots of tags in a 4-player battle and co-op.
- **Accept:** run-all `distinction distinction-net mp-local v3-fixes ux-roomrow room-platform trophies-net mp-net v3-room4
  v3-battle v3-podium` green; by hand `final-v3` (L484, L508), `ux-review`, `review-mpmaps #tags0..3 / #tagsc`; the
  screenshots looked at: four tags attached to four animals on a 390 px phone, never over the HUD strip, "나" findable at a
  glance, a trapped rival's tag never white.
- **Release:** request 2 is complete.

---

## 7. Review changes (final pass, 2026-10-16)

What the cross-review against the code and `design/shop.md` changed in this doc:

1. **Joint contract with shop.md** (§2.12 rewritten, header): one drawing order (twin → items → tint → ring of the final
   frame), one `headTop(p)` (a stub added in D3 with the constants, used by D4's tags, made real by shop S2), the feet for the marker,
   looks and twin colours frozen at match start, no identity-like items.
2. **Floating animals get two ripples (R) instead of a filled ellipse** (§2.4). A floating animal sits 5 px deep, so the
   L ellipse drawn after the water would have covered its waist (and sat exactly where a shop tube goes).
3. **Markers are floor decals drawn before items, enemies and the kits' floor rings** (§2.4). Drawn after `drawKfx(true)`
   they would have hidden the frog's lily pads and the capy's slam splash under the animal.
4. **White rings mean "me" only** (D6, §2.6): today's `.pg-tag.is-trap` ring (white at 0.7, L384) would read as "me"; it
   becomes the trapper's colour, with the data path for host and guest.
5. **Tag CSS fixes** (§2.6): the phone font floor of L373 was dropped by the replacement and is back; `min-width: 0` so the
   nick can ellipsize inside the flex pill; the tag's `textContent` must not be overwritten (inner elements only).
6. **The twin key table moved to `sprites.js`** as `PG.TWIN_KEYS` (§2.2, §2.5) so the art pass and `check-sprites` own
   it without loading game.js; `check-sprites` also asserts distinct palette values (the pixel-match recolour relies on
   it; true today for all 57 keys). The `_dizzy` frames named before do not exist and are gone.
7. **Copy:** the twin line names the colour ("같은 동물이 있어서 분홍색으로 나와요") so no particle follows an animal name;
   `offHow` no longer says "같이 하려면" (the doc's own rule: 같이 하기 is the co-op mode) and is shorter; "지금 바로".
8. **Tests made runnable:** `final-v3`, `review-mpmaps`, `review-mpbal`, `char-sheet` and `ux-review` are not in
   run-all, so the online checks moved to new run-all drivers (`monsters-net`, `distinction-net`) and the others are
   listed as by-hand runs; the solo baseline hashes are taken before the change; new checks for the ripple, lily pads, the
   trap ring, 2-player co-op panels and the `never` host tap.
9. **Terminal room codes** (§4.2): which ones show the 'room' card, and why no third variant.
10. **Implementation passes** (§6): A0 and D1-D4 with files, sizes and acceptance checks; D1 and D2 can ship at once.

## 8. As built

### As built (pass A0, art track, 2026-10-16)

- **`PG.TWIN_KEYS`** is in `src/sprites.js` right before `PG.PALETTE = PALETTE` (after the portraits), exactly the §2.5
  table: `duck { L: 0, Y: 1, y: 2 }`, `capy { K: 0, f: 1, F: 2, H: 3 }`, `otter { U: 1, '5': 2 }`, `penguin { '2': 1,
  '1': 2 }`, `cat { w: 0, W: 1, '4': 1, o: 2 }`, `frog { n: 0, t: 1, m: 1, T: 2 }` (role = index into `SLOT_RAMP[slot]`;
  digit keys quoted like the palette's). game.js does not read it yet (D3).
- **`tools/check-sprites.js`**: the spec's checks (all six animals listed, every key drawn in that animal's body poses =
  idle walk jump fall shoot die + its move pose, roles integers 0-3) plus four cheap guards: no name other than the six
  animals, never the ink `k` (the ring is traced around it), roles run light to dark (a key with a lower role is never
  darker by luminance than one with a higher role), and `life_<char>` and `portrait_<char>` each show at least one
  twin key (the HUD icon is how twins differ there). The pairwise-distinct palette assertion already existed (L33,
  case-insensitive); its message now names the twin recolour and both keys of a clash (`y=6`). The OK line reads
  `OK: 150 required sprites, 57 palette colours (all distinct), twin keys for 6 animals` (run-all's `^OK: \d+ required
  sprites` still matches). Each failure was provoked once on a scratch copy and fails with a named message.
- **Contact sheet** (not asked for): `chars.html` gains a "twin colours" section, natural / 2P / 3P / 4P of idle 0,
  walk 1, jump, the move pose (frog: fall), shoot, die 1, the life icon and the portrait, then all six animals at 1x / 2x
  on dark and each theme. It uses a preview copy of the §2.2 `SLOT_RAMP` inside the tool; if D3 changes the ramps, update
  that copy. `chars.html?tw=1&ns=1` skips the per-animal frames. Looked at (`C:/Temp/bogeul/twin-a0.png`,
  `twin-a0b.png`): every animal reads as four colours at 1x; the cat is better than §2.5 feared (its whole `w` coat takes
  the light tint); the pink frog's `p` cheeks and the pink capy's `p` cheek are low-contrast on the pink body (accepted).
- Accept: `node build.js` OK; `node tools/check-sprites.js` OK; run-all `sprites v3-sprites check-sprites` 7/7 green;
  `check-integration` OK.

### As built (pass D1, code track, 2026-10-17)

- §3.1-3.4 as written, in the named functions: the `chk('monsters', '몬스터 출현', '경기 내내 때 몬스터가 나와요')` row
  between 능력 끄기 and 보스 난입 in both option boxes (ids `pg-host-opts-monsters` / `pg-room-opts-monsters`: the `chk`
  helper now ids every switch `<box id>-<key>`), the generalised handler (`perks` is the one negative switch), `syncOpts`,
  the `NET.opts` / `G.opts` defaults, `netSetOpts`, `roomInfo` `o[5]` (index 4, the stake, unchanged), `guestRoom`
  (`R.o[5] !== 0`: only a numeric 0 is off - `false`, `null`, `'x'`, `1` and a missing entry all read on), `newBattle`,
  `guestBegin`, `startArena` (no opening wave; sub `배틀 · N분 · 몬스터 없음`), `updateBattle` (no respawn), `minionCap`
  (0 in a monsters-off battle; co-op untouched), the rules line, the V3 warm-up words. `NET_V` stays 4.
- **Deviation - 시작! carries the word.** Every online start runs the 3-2-1, and `updateCountdown`'s "3" replaces the
  arena banner on the countdown's first frame (as before this pass), so `배틀 · N분 · 몬스터 없음` is only ever seen in a
  start without a countdown (the test API). With monsters off the 시작! banner of a battle now has the sub `몬스터 없음`
  (on: `''` as before); guests get it with the banner like any other. `monsters.js` and `monsters-net.js` check both.
- **Guest summary line:** each part is its own `<i>` (`white-space: nowrap`, `.pg-room-sum i`), so a 390 px phone wraps
  between parts and never inside `몬스터 없음`; the text is the same `배틀 · a · b …` line (`final-v3` L658 matches).
- **`PG.debug.mp.guestRoom(R)`** (new): feeds a crafted R to `guestRoom`, returns the options it read, and puts back
  every NET field it set (`roster mode opts q ms hostPh ready outR`), so it is harmless on any page.
- `trophies-net.js`: the note next to the tamper hook (L260: the forged `o` drops `o[5]` = on).
- Tests: `src/tests/monsters.js` (20 checks: §3.5 groups 1, 2, 3, 5, the four intruders one by one with a control that
  shows the §3.3 trap - monsters on, arena emptied by hand: up to 4 minions - the spores, +1500, all four arenas off / on,
  co-op after an off battle, the 3-2-1 / 시작! banner, the option row and the warm-up); `src/tests/monsters-net.js`
  (20 checks: §3.5 group 4 through the DOM over forced bc, then ticked again: the default line and enemies back;
  `?shot=friends|room|roomg` scenes for the screenshots, by hand). run-all jobs `monsters`, `monsters-net`.
- Accept: `node build.js` OK (artifact: no Firebase string, no SW, no external script); run-all `monsters monsters-net
  arena-gate trophies-net mp-net kits-net net-bc` green - MON 20/0, MONNET 20/0, AGATE 12/0, TROPHYNET 68/0, MPNET 102/0,
  NETBC 33/0, KITSNET 54/0 (kits-net's otter-dash peer-stream check, total <= 200 ms, failed twice at 301 / 222 ms while
  the machine was busy with the suite and passed on a lone rerun; it is real-time latency, untouched by D1); by hand
  `final-v3 ?only=battle&arenas=0` 37/0 (L658 line matched) and `?only=room` 30/0, `review-mpmaps #sim` (runs, stuns
  and kills as before), `review-mpbal ?exp=ffa&n=4&arenas=0,1&seeds=1-2` (4 matches, enemies killed: default on);
  screenshots looked at (`C:/Temp/bogeul/mon-{friends,room,roomg}-{390,900}.png`): the row sits between 능력 끄기 and
  보스 난입 on both widths, the guest's line wraps between parts, the rules lead with 몬스터 없이 친구끼리만 겨뤄요.

### As built (pass D2, code track, 2026-10-17)

- §4.2-4.3 as written: `roomOffKind()`, `#pg-net-note` is `<div role="note">`, the `room` card (heading, `roomOff`
  verbatim, `offHow`, the `offSolo` foot) and the `peer` card (`peerHead`, `인터넷을 확인하고 새로고침해 주세요`, a
  `새로고침` button `.pg-btn.pg-small.pg-note-btn` that reloads), 방 만들기 disabled with `aria-describedby="pg-net-note"`
  (removed again when online works), 참여 enabled, the CSS of §4.2 (`.pg-note-btn` margin added), the strings with their
  warm-up. The card is rebuilt only when its content changes (`el._key`), so a flash or a focused 새로고침 survives
  re-renders.
- **One helper for both answers:** `netOffAnswer(join)` ends busy / the chip, sets `joinOff` / `hostOff` (`…Peer` on a
  `peer` page), renders, then `netNoteFlash()` (so the card is visible when it pulses and scrolls). `netJoin` returns
  `{ ok: false, code: 'room_off', text }` - pending or not, with no bc search; `netHost` returns `null`. The silent
  `local_only` / pending returns are gone.
- **The room dying under an attempt** (`tr === 'room'` and `PG.Net.roomDead()` after a failed join): `netRoomDead()`,
  then the join **awaits the new detection** before answering, so the card and transport `bc` are there when the answer
  is. `netHost` does the same (not in the spec; `hostOff` instead of 온라인에 연결할 수 없어요).
- **Stale answers cleared:** a `joinOff` / `hostOff` line left on the panel is cleared once online works there
  (`renderFriends`: transport known and no off kind - PeerJS arrived late and `peerWatch` switched the panel).
- **No transport at all** (no BroadcastChannel): the same block style, heading = the old first line (`roomOff` /
  `peerOff`), then `noNet`, then the `offSolo` foot; both buttons off as before. A new key `peerHow` holds the peer card's
  second line (§4.3 lists its text in §4.2 only).
- Tests (written in the cut-off attempt, run unchanged): `review-room-platform.js` phases `null`, `never` (incl. the
  pending 방 만들기 tap -> `hostOff`, and a second viewer's pending 참여 -> `joinOff`), `not_granted`, `dies` (the room
  dies 250 ms into a join; then forced bc: no card, a missing code still reads 방을 찾을 수 없어요, hosting works) and
  `?shot=off|off-tap`; `review-peer-deploy.js` (the blocked deploy page: the peer card, 새로고침, `joinOffPeer` < 300 ms,
  `mp.host()` refused; PeerJS arriving late removes the card, re-enables 방 만들기 and clears the line). run-all jobs
  `off-friends-{390,900}` and `off-friends-tap-{390,900}`.
- Accept: `node build.js` OK; run-all `room-platform peer-deploy net-bc net-node mp-net off-friends` green - RRP 90/0
  (`mp.join('ab12')` answered in 2-4 ms on the not-granted / null pages, the pending one at detection's end; no panel
  ever showed 방을 찾을 수 없어요), RPD 22/0, NETBC 33/0, NET NODE OK (`TEXT.roomOff` pin), MPNET 102/0 (its
  `friendsnote` match still holds); `off-friends-390` failed once with "frame S did not load" (a 30 s iframe load under
  the suite's load) and passed on rerun; by hand `final-v3 ?only=room` 30/0 (L1149); screenshots looked at
  (`off-friends{,-tap}-{390,900}.png`): the card is the first thing under the heading on a 390 px phone, 방 만들기 greyed,
  after 참여 the joinOff line sits under the code box and the card stays in view; the peer card checked on a scratch
  copy of the deploy page with PeerJS unreachable (button disabled, `joinOffPeer`).

### As built (pass D3, code track, 2026-10-17)

- **Baseline first.** `src/tests/distinction.js ?base=1` took the three solo canvas hashes on the unchanged build
  (seed 20261017, `G.frame` 0, hiscore 0, a fresh Chrome profile = a bare store, run synchronously so no rAF render
  slips in: the start, after 340 f of walking / jumping, a duck bubble in flight), twice, identical:
  `[-221629064, 347395985, -1000955601]` - the constants `BASE` of group 1, still matched after D3 and D4.
- §2.2 constants as written (`SLOT_INK`, `SLOT_RAMP`, `slotNum`, the `headTop` stub), next to `SLOT_COLS`.
- §2.3 `ringOf` replaces `outlineOf` (the 12-offset ink dilation, then the 8-offset slot band; `(w + 4) x (h + 4)` at
  -2; `drawEnt`'s sized path uses `2 * kx` / `2 * ky`, `drawTurned` `-f.w / 2 - 2`), cached per final frame.
- §2.5 twin colour: `twinMap` (per animal x slot, from `PG.TWIN_KEYS` + `PG.PALETTE`: exact RGB of opaque pixels),
  `recolourFrame`, `twinFrame(f, name, slot)`. **It takes the sprite name** (as shop.md 6.2's `drawEnt` calls it) and
  reads the animal from it (`duck_idle`, `life_duck`, `portrait_duck`); slot 0 or an animal without keys returns `f`.
  Twin frames are cached per frame object in their own WeakMap (`[, slot 1, slot 2, slot 3]`), and the pixels are read
  back from a scratch canvas, never from the new frame (a read-back canvas is kept in a slower CPU mode by Chrome; with
  it, four ducks cost +6 % a frame). `drawEnt` / `drawTurned` apply `o.twin` first in the joint order (a comment marks
  where S2's `lookFrame` goes); `drawAfterimages` passes it too; `drawRawTwin`; `portraitCanvas(c, name, size, lk, tw)`
  (`lk` unused until S2). `p.twin` is set once in `setupPlayers` (`makePlayer` defaults it false). **`addLocalPlayer`**
  (the test API's drop-in): the newcomer is a twin when anyone already has its animal (the others stay frozen).
- §2.4 markers: `MARK_ROWS` baked per slot x rim through `pixelRows`; `markerOf(p)` -> `{k, x, y, a, w}` with the
  geometry of §2.4 (`w`: drawn in the water pass); `drawMarkers(false)` right after `drawWisps()` (past the podium's
  early return) works them out once per render, `drawMarkers(true)` right after `drawWater()` reuses them. Hidden off
  `multi()`, in a transition (also paused from one) and on the podium, never by the blink. No `wrapDraw`: a surface is
  only ever found inside the playfield, and an animal over the drain gap has none.
- §2.8 HUD by seat as the tables say; each seat's panel (wash, my underline, number box, number) is baked once per
  seat x size x me and drawn with one `drawImage`. **Co-op, a down player:** the icon blinks 0.25 / 0.45 and the score
  greys, as before; the panel's 16 % wash does not blink (a blinking 16 % wash reads as nothing).
- §2.9 rings: `ownerRing(b, cx, cy, sx, sy, a0)` for kit and plain owned bubbles (alpha `a0`; 2 px at r 9 for a battle
  shot in flight, else 1 px at r 8.5; a squished plain bubble's ring follows its feet-anchored squash); the trapped
  rival 2 px r 9 at alpha 1; the ghost 2 px r 10 (alpha 0.9 kept).
- `PG.debug.looks()` (`[]` in solo): `{slot, num, twin, marker, mark: {x, y, a, water}, tag: {text, cmp, me, hi, l, t,
  r, b, cx, ring}}` in canvas px; plus `spot()` and `twinPixels(name, i, slot)` for the tests.
- Tests: `src/tests/distinction.js` groups 1-4, 6, 7, 10 (5 and the staged 8 below); the height / jump / tag tests swap
  a plain room into arena 0 while they run (`inRoom`: open floor, nothing overhead) and put it back. run-all
  `distinction` and the screenshot jobs `dist-{battle0..3,coop,float,podium,tags}-{390,900}` (the 390 ones through the
  cdp runner with phone emulation, like `v3-title-390`; without it the canvas overflows a 390 px window). By hand:
  `?shot=sheet&kind=coop|battle` puts every tile theme (co-op rounds 1-5) / every arena with four ducks and with four
  different animals on one 2x contact sheet; `&zoom=x,y,w,h` blows a canvas region up to look at pixels.
  `mp-local.js`: the two readers of an exact tag / result-row text (L262, L344) now read the nick part (the tag's
  `.pg-tag-t`, the row's text after its chip) and check the number chip.
- **Frame cost** (`?perf=1`, real time, update + render of a 4-player battle, best of 5 x 600 f), A/B against the
  pre-D3 tree built to a scratch dir, six alternating runs each: mixed animals 0.219 -> 0.222 ms (+1 %), four ducks
  0.222 -> 0.231 ms (+4 %). (Before the panel / marker / twin caches it was +3 % / +6.5 %.)
- Accept: `node build.js` OK (the artifact: no Firebase string, no service worker, no external script); run-all
  `distinction mp-local v3-fixes kits kits-scenes kits-online kits-net sprites check-sprites` green - DIST 42/0 (incl.
  the D4 groups), MP 38/0, FIXES 23/0, KITS 40/0, the 11 kits-scenes, KO 6/0 and 4/0, KITSNET 54/0, the 6 sprite
  scenes, check-sprites OK; solo pixel-identical to the baseline; by hand `char-sheet` (SHEET DONE), `review-mpmaps #sim`
  (stuns, re-landings and the KO respawns as before), `check-integration` OK, `check-pages` 40/0. Screenshots looked at
  (`C:/Temp/bogeul/dist-*.png`, `dist-sheet-{coop,battle}.png`, zooms): four ducks read as four colours on every theme;
  each slot stays readable on its namesake arena (하늘 on 냉온탕 대결, 노랑 on 사우나 계단, 민트 on 때밀이 링: the ink
  band separates the slot band from the tiles); a floating duck's ripples sit beside it at the waterline, nothing over
  its body; a lily pad stays visible over a marker; a grounded animal's L marker mostly hides under its own feet and
  ring (its two spill rows show on the tile top), M / S under a jumper read well.

### As built (pass D4, code track, 2026-10-17)

- §2.6 tags v2: `syncTags` rewritten as specified (only the inner `.pg-tag-n` / `.pg-tag-t` are written; me first,
  then by seat; the `headTop` anchor; the HUD-strip and wall clamps; both sizes measured only when the text, the size
  class or the screen scale change; the 20-frame hysteresis; <= 3 lifts unless into the HUD). Tag elements are kept
  **by seat** (a leaver shifts nobody's tag). **A new round / arena (`G.rid`) restarts the hysteresis**, so every tag
  starts compact on its first frame - without it a tag shown at the previous game's spot came in full. `trapperOf(p)`:
  the host's `trap.b`, a guest's `trap.bid` -> that view row, else the `player` row holding p; -1 (ink) once the
  trapper has left. The hint chips still use this page's own player offline (`구해 줘!` in local co-op, as before).
- CSS as §2.6 (the old white `.pg-tag.is-trap` ring removed; `is-me` after `is-trap`).
- §2.7: `meSpotTick` (in `updateFx`, once per `G.frame`) and `drawMeSpot`, drawn right before `drawTagArrows` (so no
  water overlay or particle dims it); `SPOT_F` 90, `SPOT_CALM_F` 60, `SPOT_HI_F` 120; `tagHi`; `drawTagArrows` at
  `headTop` and white for me; my marker's rim white; my HUD box and underline white.
- §2.10: `.pg-pc-n` (`1P`-`4P`, top right; the 나 chip stays top left), the twin portrait (`portraitCanvas(..., null,
  twinAt(r) ? s : 0)`, the card `_key` has the twin flag), the kit card's line `#pg-room-twin` (`.pg-kit-twin`, a dot of
  my seat colour before it) - live from the roster and my current pick; the co-op result rows' chip
  (`.pg-team-nick .pg-tag-n`) and their twin icons. The warm-up text has 나, 1P-4P and the four twin lines.
- Test 8 is split: **staged** in `distinction.js` (an online page's look on a local battle - `G.online` and
  `G.localSlot` set, no session - so every pixel is under control: my white HUD box and underline, the 나 tag full and
  white-ringed 16 px from the others and nobody else white, my white marker rim and pointer, the spotlight's radius by
  age (9.0 11.9 14.9 9.0 8.6 14.9 px at 2/15/28/32/60/88 f), off at 90 f, the big 나 to 119 f, a KO + respawn of mine
  starting it and someone else's not, reduced motion: one still ring at r 12 for 60 f) and **end to end** in
  `src/tests/distinction-net.js` (3 bc frames: the room's chips / twin portrait / kit-card line, also live when a third
  duck is picked; the same twins and markers on every page; 나 / white ring / HUD box on every page; the spotlight from
  the countdown on every page; the trapper's ring read from the bubble id on the third page, white on the victim's own;
  a KO by the host's touch, the respawn's spotlight and the x1.3 tag for ~2 s on that page only). run-all job
  `distinction-net`.
- Accept: run-all `distinction distinction-net mp-local v3-fixes ux-roomrow room-platform trophies-net mp-net v3-room4
  v3-battle v3-podium` green - DIST 42/0, DISTNET 18/0, MP 38/0, FIXES 23/0, ROOMROW 5/0, RRP 90/0, TROPHYNET 68/0,
  MPNET 102/0 and the 7 v3 room / battle / podium shots; by hand `final-v3 ?only=coop,room` 73/0 (L484 card `--slot`,
  L508 tags) and `?only=battle,leaves&arenas=1` 60/0, `review-mpmaps #tags0..3 / #tagsc` (a 6-letter nick ellipsizes
  in its pill as before), `ux-review` scenes on a 390 x 844 phone (`battle4-hud`, `coop4-hud`, `battle-trapped-other`,
  `battle-ko`, `room-guest4-ready`, `coop-over`: no element off screen, tags 15 px high at the 11 px floor, compact
  chips 16 px wide). Screenshots looked at (`dist-tags-{390,900}`, `v3-battle(-390)`, `v3-podium(-390)`,
  `runall-kits-online.png`, the ux scenes): four tags stay on four animals on a 390 px phone (a chip that would cover a
  neighbour's pill goes compact or one row up), none over the HUD strip, "나" (white chip, white ring, white HUD box,
  white pointer) findable at a glance, a trapped rival's tag ringed in the trapper's colour.

### As built (review fixes, code track, 2026-10-18)

The four findings of the review of D3 / D4 were each confirmed on the code and fixed; none was a non-issue.

1. **My tag under the other tags (high).** `.pg-tag.is-me { z-index: 2 }` and `.pg-tip { z-index: 3 }` (a hint chip stays
   above it), so my tag paints over every chip whatever the DOM order. In `syncTags` a chip whose lift is refused by the
   HUD clamp no longer just overlaps: every spot comes from `tagSpot` - where it belongs, else lifted over what it lies on
   (<= 3 times, never into the HUD strip), else set beside each thing it lies on (left / right, inside the walls) - the
   least covered spot wins, then the nearest (a lift counts 1.5x). Test (`distinction.js` group 5+, desktop and the new
   run-all job `distinction-phone`, 390 x 844 touch, the 11 px floor): three ducks side by side on the top row, mine in
   each place - no tag box on mine, `elementFromPoint` at my 나 chip's centre is my tag, its z-index 2.
2. **Tags lying on animals (medium).** The animals are obstacles too: every shown animal's body box (`x - 1 .. x + 17`,
   from `headTop(p)` - so a worn hat counts from S2 on - to `y + 16`). A tag lying on another animal by more than
   `TAG_ROWS` (3) rows, or on MY animal by any row (weight 6), is a misfit like a tag overlap, so it keeps the 20-frame
   hysteresis (the tag goes compact) and `tagSpot` moves a compact chip / my tag off it. Tests: two animals on ledges
   16-24 px apart in 7 offsets x 2 orders x 3 "me" stagings - no tag on more than 25 % of the other's body, none on
   mine (worst 18.8 % desktop, 0 % phone); a soak of 120 random 4-animal layouts - 0 / 120 with a tag on > 25 % of
   another animal (worst 18 % / 15 %), 0 on mine.
3. **Seat chips over the podium's place blocks (low).** On the podium a tag is never compact while a full spot exists
   (the screen is static: a colliding tag lifts instead), and its chip reads `1P`..`4P` there (`나` stays mine). Test:
   the podium with four ducks - four full pills, none overlapping, chips `1P`-`4P`, mine `나`.
   (`C:/Temp/bogeul/dist-podium-390.png`: the four pills staggered, no bare digit over a block.)
4. **The room's faint 나 (low).** `.pg-pc-me` is the in-game 나 chip (white, ink text, the `.pg-pc-n` padding and radius)
   and my card gets a white 2 px ring (`.pg-pc.is-me`), so "white = me" holds from the room on. Test
   (`distinction-net.js`): on every page only its own seat's card has the white chip and the white ring
   (`C:/Temp/bogeul/v3-room4-390.png`).
- Accept: run-all `distinction` 47/0, `distinction-phone` 13/0, `distinction-net` 19/0, `mp-local`, `v3-fixes`,
  `ux-roomrow`, `room-platform`, the `dist-*` shots (re-taken at 390 px after S2: tags, podium, battle, co-op).

### As built (final verification, code track, 2026-10-18)

- The whole run-all suite (206 jobs) passed two full runs in a row, with no `src/` change. The test races fixed on the
  way are listed in `design/shop.md` under "As built (final verification)": `shop-net`'s two-page wait, `mp-net`
  coop2's roaming enemies, and `rv-net`'s v 3 fuzz states.
- By hand, as 2.14 and pass D4 ask:
  - `final-v3` (full): 272/0. L484 card `--slot`, L508 tag text and L658 default summary line all matched.
  - `review-mpmaps #tags0..3 / #tagsc`: looked at.
  - `ux-review` 390 x 844 scenes (battle4-hud, coop4-hud, battle-trapped-other, battle-ko, room-guest4-ready,
    coop-over): nothing off screen. Tags are 15 px high at the 11 px floor, and compact chips are 16 px wide.
