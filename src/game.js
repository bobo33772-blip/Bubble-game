/* Bathhouse arcade engine: physics, water, entities, rendering, HUD font, input, DOM UI, storage, debug API.
   The user-visible game name lives in GAME_NAME below (page.html carries the same string literally). */
window.PG = window.PG || {};
(function () {
  'use strict';
  const PG = window.PG;
  const GAME_NAME = '뽀득뽀득 목욕탕';
  PG.GAME_NAME = GAME_NAME;

  // ------------------------------------------------------------------ constants
  const W = 256, H = 224, TS = 8, COLS = 32, ROWS = 26;
  const PF_TOP = 16, PF_H = ROWS * TS, PF_BOT = PF_TOP + PF_H;   // playfield 16..224
  const WALL_L = 16, WALL_R = 240, CEIL_Y = PF_TOP + TS;           // inner wall edges, underside of ceiling
  const GRAV = 0.22, MAX_FALL = 3.5, WALK = 1.25, JUMP_V = -4.1, BOUNCE_V = -3.8;
  const COYOTE = 4, JUMP_BUF = 5;
  const STEP_MS = 1000 / 60;
  const SHOT_SPEED = 3.5, SHOT_FRAMES = 22, SHOT_CD = 14, AUTO_CD = 24; // (today's base bubble: KIT_BASE runs these numbers)
  const EMPTY_LIFE = 720, FLASH = 120, SPECIAL_LIFE = 900, ITEM_LIFE = 600;
  const CHAIN_DIST = 18, CLUSTER = 16, MAX_BUBBLES = 36;
  const SOLO_LIVES = 4;   // 혼자 하기: lives at the start (3 until 2026-10-20 - the user asked for one more)
  // a floating EMPTY bubble by mode - 2-4 players fill the screen four times as fast, so there it goes sooner and each
  // player keeps only a few: [life (frames from the blow; the blink starts here), blink frames, floating empties one
  // player may keep (0: no cap), all players' together (0: no cap)]. Solo stays EMPTY_LIFE + FLASH (14 s), no cap;
  // co-op ~7 s (still long enough to ride one and to chain a cluster), battle ~5 s (a short-lived obstacle / step).
  // The caps only catch a held / mashed BUBBLE (co-op 7 each: two players never reach the 14 in all), and a capped
  // bubble is not popped at once: it blinks CAP_BLINK frames first (capEmpties). Battle's 3 each (12 in all) is only a
  // backstop: there a player has at most SHOT_CAP (3) of their own out in all, the 4th blow pops the oldest at once
  // (capMine). Read only through emptyRule() / emptyLife() (the host's world, a guest's view of it and the drawing all
  // agree). Measured with tests/review-mpbal.js exp=clutter (4 bots blowing ~1.7 a second)
  const EMPTY_RULE = { solo: [EMPTY_LIFE, FLASH, 0, 0], coop: [330, 90, 7, 14], battle: [210, 90, 3, 12] };
  // a capped bubble's warning blink (then the plain self-pop); a bubble bounced on in the last RIDE_HOLD frames (one
  // bounce cycle is ~34 frames, a gliding duck's ~52) is never the one a cap takes - the next-oldest goes instead
  const CAP_BLINK = 30, RIDE_HOLD = 90;
  const HURRY_AT = 1800, SCALD_AT = 2700;
  const DIE_FRAMES = 90, INVULN = 120, CLEAR_WAIT = 180;
  // sliding-door round transition: shut, hold (banner), open
  const DOOR_CLOSE = 30, DOOR_HOLD = 36, DOOR_OPEN = 30, TR_END = DOOR_CLOSE + DOOR_HOLD + DOOR_OPEN;
  const INTRO_NAME = 80, INTRO_READY = 50;
  // 뽀득 combo (k-th kill in one chain = 500k, capped) and the speed bonus at round clear
  const COMBO_STEP = 500, COMBO_CAP = 5000, SPEED_PAR = 60, SPEED_PTS = 100;
  // bathhouse stamp card
  const STAMPS_FULL = 10, STAMP_MIN = 1100, STAMP_MAX = 1300;
  // broken shower: scalding drops
  const DROP_FORM = 40, DROP_INT0 = 90, DROP_INT_MIN = 30, DROP_INT_STEP = 5;
  // water
  const FLOAT_SUB = 5, WATER_SLOW = 0.8, WADE = 0.6, SOAK_FRAMES = 360, SOAK_SLOW = 0.5, SOAK_TRAP = 1.5, HOT_LIFT = 1.6;
  const ICE_LIFE = 360, ICE_FLASH = 90, ICE_PTS = 500;
  // bath-goods power-ups
  const POWER_TYPES = ['shampoo', 'slippers', 'bathbomb'];
  const POWER_FRAMES = 720, POWER_DROP = 0.35, PICKUP_LIFE = 600, BOMB_SOAK = 480;
  const POWER_INFO = {
    shampoo: { name: '샴푸!', sub: '거품이 크고 멀리' },
    slippers: { name: '고무 슬리퍼!', sub: '더 빠르고 높이' },
    bathbomb: { name: '입욕제!', sub: '때가 모두 불었어요' },
  };
  const ITEM_TYPES = ['tangerine', 'yogurt', 'egg', 'banana_milk', 'sikhye', 'icecream', 'watermelon', 'towel_hat'];
  const ITEM_VALUES = [100, 200, 300, 500, 700, 1000, 2000, 3000];
  const ENEMY_TYPES = ['grime', 'mold', 'fly', 'sponge'];
  const BUBBLE_COLS = ['#ffffff', '#c8f4ff', '#8fe3ff', '#ffc7e0', '#d9fff4'];
  const STAR_COLS = ['#ffe36b', '#ffffff', '#ffb24a', '#ff8fb1'];
  const STEAM_COLS = ['#ffffff', '#eaf6f6', '#cfe9ea'];
  const KILL_COLS = ['#ffe36b', '#ffb24a', '#ff8fb1', '#9ff0d8', '#8fe3ff', '#ffffff'];
  const SCALD_COLS = ['#ffffff', '#ffb0a0', '#ff7a5a'];
  const HOT_COLS = ['#ffd6e0', '#ffffff', '#ff9eb8'];
  const COLD_COLS = ['#e6fbff', '#ffffff', '#8fdcff'];
  const ICE_COLS = ['#ffffff', '#bff0ff', '#7fd0ee'];
  const SOAK_COL = '#ff9ec4';
  // boss rounds (보스전): a 32x32 boss, 3 HP segments, a soap (비누칠) gauge that seals it in a giant bubble
  const BOSS_DEF = {
    kingGrime: { num: 1, name: '왕때꼬마', soap: 8, spr: 'grime', fly: false, minions: ['grime'], music: 'boss', hint: '거품을 맞혀 비누칠! 충격파는 점프!' },
    moldQueen: { num: 2, name: '곰팡이 여왕', soap: 10, spr: 'mold', fly: true, minions: ['mold'], music: 'boss', hint: '떨어진 포자는 거품으로 없애요!' },
    megaSponge: { num: 3, name: '대왕 수세미', soap: 12, spr: 'sponge', fly: false, minions: ['sponge', 'grime'], music: 'boss', hint: '돌진은 피하고, 어지러울 때 비누칠 2배!' },
    towelKing: { num: 4, name: '이태리 타올 대마왕', soap: 14, spr: 'towel', fly: true, minions: ['grime', 'mold', 'fly', 'sponge'], music: 'final', hint: '급강하·장갑 비·휩쓸기를 피해요!' },
  };
  const BOSS_HP = 3, BOSS_G = 0.24;
  const BOSS_DROP0 = 50, BOSS_LAND = INTRO_NAME, BOSS_FIGHT = 150;     // intro: hidden, drop-in, lands at 80 (등장!), fight at 150
  const STUN_FRAMES = 240, STUN_WARN = 70, DOWN_FRAMES = 100, DEFEAT_BOOM = 50, BOSS_CLEAR = 250;
  const MINION_CAP = 4, MINION_GRACE = 45, MINION_EVERY = [0, 660, 570, 480], SPORE_HATCH = 180;
  const BOSS_DMG_PTS = 2000, BOSS_KILL_PTS = 10000, BOSS_STAMPS = 3;
  const SOAP_COLS = ['#ffffff', '#e6fbff', '#bdf0ff', '#ffd6ec'];
  // every Korean string the boss rounds put in DOM banners (warmed in the web fonts at boot)
  const BOSS_TEXT = Object.keys(BOSS_DEF).map((k) => BOSS_DEF[k].name + ' 등장! 분노! 퇴치! ' + BOSS_DEF[k].hint).join(' ') +
    ' 거품 감옥! 큰 거품에 몸을 부딪쳐! 탈출했다! 다시 비누칠! 거품 폭탄! 비누칠 +3 뽀득! 2단계! 더 빨라졌다 마지막 단계! 더 거칠어졌다 세신 0123456789,+';

  // ------------------------------------------------------------------ v3: animal characters, player slots, modes
  // Six bathhouse animals (all face right). v4 kits: each has its own move (on JUMP) and bubble; the battle option
  // "능력 끄기" turns them off. The card data (char-kits §12.1, texts verbatim): role chip, tag line, badge, the 4 stat
  // bars [속도, 점프, 사거리, 연사] (display values tied to the kit numbers), the move (name, how, the word it pops, the
  // touch JUMP sub-label), the bubble (name, desc) and hue (the animal's bubble film / card colour)
  const CHAR_IDS = ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog'];
  const CHARS = {
    duck: { name: '꽥꽥이', animal: '고무 오리', col: '#ffd447', dark: '#3a2a10', role: '만능', tag: '처음이라면 꽥꽥이! 둥실 날고 메아리 쏘기',
      badge: '처음이라면 추천', stats: [3, 3, 3, 3], hue: '#ffe36b',
      move: { name: '둥실 활공', how: '떨어질 때 점프를 꾹! 둥실둥실 천천히', word: '둥실~', touch: '꾹: 활공' }, bub: { name: '메아리 거품', desc: '멀리 갔다가 다시 돌아와요' } },
    capy: { name: '까삐', animal: '카피바라', col: '#c4895a', dark: '#3a2414', role: '든든', tag: '느긋한 왕방울, 엉덩방아로 때를 불려요',
      badge: '왕방울 · 온탕 보호막', stats: [2, 3, 2, 3], hue: '#ffa98a',
      move: { name: '털썩 엉덩방아', how: '공중에서 점프 한 번 더! 쿵, 때가 불어요', word: '털썩!', touch: '두 번: 쿵' }, bub: { name: '왕방울 거품', desc: '크고 느릿느릿, 잘 맞아요' } },
    otter: { name: '해롱이', animal: '해달', col: '#9b6b47', dark: '#2e1c10', role: '돌격', tag: '휙 날아들어 세 갈래 물장구!',
      badge: '', stats: [4, 3, 2, 2], hue: '#5fe0c8',
      move: { name: '휙 대시', how: '공중에서 점프 한 번 더! 옆으로 휙', word: '휙!', touch: '두 번: 대시' }, bub: { name: '물장구 거품', desc: '세 갈래로 촤악 퍼져요' } },
    penguin: { name: '펭펭', animal: '펭귄', col: '#34406a', dark: '#141a30', role: '저격', tag: '배로 쭉 미끄러져 멀리 쏘는 저격수',
      badge: '', stats: [5, 3, 5, 1], hue: '#9fdcff',
      move: { name: '쭉 배미끄럼', how: '공중에서 점프 한 번 더! 배로 쭉~', word: '쭉~', touch: '두 번: 쭉' }, bub: { name: '고드름 거품', desc: '빠르게 아주 멀리 날아가요' } },
    cat: { name: '냥냥', animal: '고양이', col: '#f2a65a', dark: '#4a2410', role: '곡예', tag: '2단 점프로 폴짝, 털실은 데굴데굴',
      badge: '', stats: [3, 5, 3, 3], hue: '#c9a8ff',
      move: { name: '냥냥 2단 점프', how: '공중에서 점프 한 번 더! 더 높이', word: '냥냥!', touch: '두 번: 2단' }, bub: { name: '털실 거품', desc: '땅에서 쏘면 통통 굴러가요' } },
    frog: { name: '깨굴이', animal: '개구리', col: '#6cc644', dark: '#1d4a14', role: '함정', tag: '폴짝폴짝 뛰며 개구리알 함정 깔기',
      badge: '', stats: [3, 4, 1, 4], hue: '#9be86a',
      move: { name: '깨굴 3단 뛰기', how: '착지하자마자 또 점프! 점점 높이', word: '깨굴!', touch: '착지 때 또' }, bub: { name: '개구리알 거품', desc: '앞에 멈춰 기다리는 함정' } },
  };
  // the kit card's stat rows and its 능력 끄기 line (every animal the same base kit: 3/3/3/3)
  const STAT_NAMES = ['속도', '점프', '사거리', '연사'], STATS_OFF = [3, 3, 3, 3];
  // (AMMO: a battle room's rule line, and a magazine as its kit line says it - 거품 3발 · 장전 2초 / 1.4초)
  const AMMO_RULE = '거품을 다 쏘면 잠깐 장전해요 · 동물마다 발 수와 장전 시간이 달라요';
  const magTx = (m) => '거품 ' + m[0] + '발 · 장전 ' + Math.round(m[1] / 6) / 10 + '초';
  const OFF_LINE = '능력 꺼짐 · 모두 같은 기본 능력이에요', OFF_COUNT = '능력 꺼짐 · 모두 같은 기본 능력';
  const CHAR_ANIMS = { idle: 2, walk: 4, jump: 1, fall: 1, shoot: 1, die: 4 };
  // an animal id from outside (network, storage, tests): one of the six, never an inherited key like 'constructor'
  const isChar = (c) => typeof c === 'string' && CHAR_IDS.indexOf(c) >= 0;
  // player slot colours: name tag, outline tint, bubble tint
  const SLOT_COLS = ['#ffd447', '#f6a6bd', '#7fdcc8', '#8dc9ff'];
  const SLOT_NAMES = ['노랑', '분홍', '민트', '하늘'];
  // telling players apart (design/distinction.md §2.2): the art's own ink (palette k) for the outer ring of the slot
  // outline and the ground marker's rim; the twin colour ramps [L, M, D, DD] per slot (index 0 is never used: seat 1 is
  // always the first copy of an animal) - runtime recolours, not palette keys (PG.TWIN_KEYS in sprites.js maps an
  // animal's body keys to a ramp role)
  const SLOT_INK = '#1c1530';
  const SLOT_RAMP = [
    ['#fff1a6', '#ffd447', '#e39a1e', '#a8661a'],
    ['#ffd6e4', '#f6a6bd', '#d0658c', '#8e3a5e'],
    ['#c6f6e6', '#7fdcc8', '#3fa587', '#22705a'],
    ['#d4ebff', '#8dc9ff', '#4f8fd6', '#2d5b9a'],
  ];
  const slotNum = (pl) => String(pl.slot + 1);   // "1".."4": tags and the HUD show it, the room card shows "1P".."4P"
  // the mark above an animal's head (shop.md 6.6): p.y, lifted over a worn hat - the one place that knows how tall a hat
  // is (name tags and their pointers, stun stars, the slam's speed lines, the podium crown, the flying trophy cups)
  const headTop = (p) => p.y - lookLift(p.char, p.look);
  const MAX_PLAYERS = 4;
  // UI sprites drawn through variables (8x8 crown / check, 5x3 name-tag pointer)
  const SPR_CROWN = 'crown', SPR_TAG = 'tag_arrow', SPR_READY = 'ready';
  // (v4 trophies: the 8x8 cup, 2 frames - front / turned; the league icons are 'lg_' + index)
  const SPR_CUP = 'trophy', LG_PRE = 'lg_';
  // passives (gated by perk()): the capy's hot-water shield, the otter's swim, the penguin's ice, the cat's "냥!" hop
  const CAPY_SHIELD = 180, CAPY_SHIELD_CD = 180, OTTER_SWIM = 1.4, PENGUIN_ICE = 1.3, PENGUIN_GRIP = 0.09, CAT_HOP_V = -3.6;
  // v4 character kits (design/char-kits.md): per animal a walk multiplier, the fire cooldowns [tap, autofire], the
  // bubble (shot) and the move on the JUMP button. kitOf() gates everything new: 능력 끄기 (G.perksOff) = KIT_BASE.
  // Air moves (capy / otter / penguin / cat: JUMP pressed in the air) pass KIT_GATE first: airborne >= airMin frames,
  // nothing to land on / splash into / bounce on within `clear` px below (the capy: slam.clear)
  const KIT_GATE = { airMin: 6, clear: 10 };
  // the bubbles (shot): ty = the path stepShot runs, v px/f, f = shot-phase frames (capture on; then it floats), r the
  // capture radius against enemies (boss r + 2, spores r + 1), rP against rivals; sh = the shampoo variant (every shot
  // phase stays <= SHOT_MAX f: the guest's prediction and its sid live that long)
  // mag: battle only - [blows per magazine, frames of quiet that refill it whole] (장전: see AMMO below; 능력 끄기 /
  // KIT_BASE 3 in 2.0 s for everyone; co-op and solo never read it)
  const KIT_BASE = { walk: 1, cd: [14, 24], mag: [3, 120], shot: { ty: 'line', v: 3.5, f: 22, r: 8, rP: 8, sh: { f: 33, r: 12, rP: 12 } } };
  const KIT = {
    // 둥실 활공: hold JUMP while falling - vy eased down to `fall` (x brake per frame), air speed x air, max frames (battle maxB)
    // 메아리 거품: out at v slowing by dec a frame, turns at 0, comes back speeding up by dec (the same 0.10 with shampoo) to `back`
    duck: { walk: 1, cd: [14, 24], mag: [3, 132], shot: { ty: 'echo', v: 3.5, dec: 0.10, back: 2.6, f: 80, r: 8, rP: 8, sh: { r: 12, rP: 12, dec: 0.08 } },
      glide: { fall: 0.65, brake: 0.7, air: 1.15, max: 75, maxB: 60 } },
    // 털썩 엉덩방아: wind-up (hang) `wind` f, slam at vy, recovery `rec` f, then cd; the quake box is centre x +- dx,
    // feet - up .. feet + dn; soak frames, enemy hop vy, boss soap at most once per bossCd f per capy
    // 왕방울 거품: big and slow (drawn x scale)
    capy: { walk: 0.92, cd: [14, 24], mag: [2, 72], shot: { ty: 'line', v: 2.8, f: 22, r: 11, rP: 10, scale: 1.25, sh: { f: 33, r: 15, rP: 14 } },
      slam: { clear: 16, wind: 8, vy: 5.0, rec: 14, cd: 45, dx: 36, up: 24, dn: 8, soak: 300, hop: -1.6, bossCd: 90, rate: 40 } },
    // 휙 대시: v px/f flat (no gravity) for f frames, then cd
    // 물장구 거품: a straight centre + two droplets (vx, -+vy) that catch rivals only up to rivalAge and burst at the end
    otter: { walk: 1.12, cd: [16, 26], mag: [2, 96], shot: { ty: 'fan', v: 3.6, f: 16, r: 8, rP: 8, sh: { f: 24, r: 12, rP: 12 },
      drop: { vx: 3.3, vy: 0.75, f: 13, r: 6, rP: 6, rivalAge: 8, sh: { r: 10, rP: 10 } } },
      dash: { v: 3.2, f: 10, cd: 20 } },
    // 쭉 배미끄럼: dive (vx, vy >= diveVy), belly slide at >= v decaying x held / free / ice per frame (brake: opposite
    // input), ends below `end` px/f or at max f; a wall bonks for `bonk` f; slide-jump / ledge carry x carry (opposite: carryOpp)
    // 고드름 거품: fast and long, a thin catch against rivals
    penguin: { walk: 1, cd: [20, 32], mag: [2, 78], shot: { ty: 'line', v: 4.5, f: 26, r: 8, rP: 6, sh: { f: 39, r: 12, rP: 10 } },
      slide: { diveVx: 2.6, diveVy: 1.8, v: 2.6, held: 0.985, free: 0.97, ice: 0.997, brake: 0.18,
        end: 1.3, max: 90, bonk: 10, carry: 0.995, carryOpp: 0.25 } },
    // 냥냥 2단 점프: vy, curl pose frames
    // 털실 거품 (blown on the ground): vx / vy under gravity g; each landing hops at `hop` keeping vx x keep; floats after
    // `lands` landings or f frames. In the air the cat blows the base bubble (airShot)
    cat: { walk: 1, cd: [14, 24], mag: [4, 144], shot: { ty: 'yarn', v: 2.0, vy: -1.0, g: 0.16, hop: -1.8, keep: 0.92, lands: 3, f: 64, r: 8, rP: 8, sh: { r: 12, rP: 12, lands: 4, f: 86 } },
      airShot: 'base', dj: { vy: -3.4, curl: 10 } },
    // 깨굴 3단 뛰기: JUMP within win f of landing (battle winB) chains x mul[level] (battle mulB)
    // 개구리알 거품: flies `go` f at v x decay a frame, then hangs (still capturing) hold f (battle holdB); at most cap (battle
    // capB) hang per frog - one more lets the oldest float
    frog: { walk: 1, cd: [12, 20], mag: [3, 108], shot: { ty: 'egg', v: 4.2, decay: 0.92, go: 18, hold: 86, holdB: 70, cap: 3, capB: 2, r: 8, rP: 8, sh: { r: 12, rP: 12, cap: 4, capB: 3 } },
      hop: { mul: [1, 1.12, 1.24], mulB: [1, 1.10, 1.20], win: 8, winB: 6 } },
  };
  const SHOT_MAX = 110; // (no shot phase is longer: checked by newShot's numbers above, see the guest's prediction)
  const ECHO_GRACE = 12;  // (frames an echo that just stopped behind its duck cannot be touch-popped)
  const kitOf = (pl) => (!pl || G.perksOff || !isChar(pl.char) ? KIT_BASE : KIT[pl.char]);
  // the word each move pops over its owner the first time it is used in a round (that player's own screen only)
  const MOVE_WORD = {}; CHAR_IDS.forEach((c) => { MOVE_WORD[c] = CHARS[c].move.word; });
  // each animal's own blow sound (replaces 'shoot' with perks on; local, like 'shoot')
  const SHOOT_SFX = { duck: 'b_echo', capy: 'b_onsen', otter: 'b_splash', penguin: 'b_icicle', cat: 'b_yarn', frog: 'b_egg' };
  // p.mv values: whose kit each belongs to, and the ones that hold the facing / forbid the ground jump
  const MV_OF = { glide: 'duck', wind: 'capy', slam: 'capy', rec: 'capy', dash: 'otter', dive: 'penguin', slide: 'penguin', bonk: 'penguin', curl: 'cat' };
  const MV_LOCK = { wind: 1, slam: 1, dash: 1, dive: 1, slide: 1, bonk: 1 };
  const MV_NOJUMP = { wind: 1, slam: 1, rec: 1, dash: 1, dive: 1, bonk: 1 };
  // co-op (같이 하기): a fallen player is a ghost bubble for 8 s; a partner's touch revives them on the spot
  const GHOST_DIE = 40, GHOST_FRAMES = 480, REVIVE_INV = 120, COOP_OVER_WAIT = 60, COOP_SOAP = 0.4;
  // co-op scoring: popping a partner's catch pays 60 % to the popper (40 % to the trapper); a boss kill pays 40 % to
  // the one who burst it and splits the other 60 % evenly over the team (so the MVP is not just the last hit)
  const COOP_POP_SHARE = 0.6, COOP_BOSS_SHARE = 0.4;
  // the ghost rises 0.08 px a frame to at most 36 px above where it fell, drifts toward the nearest standing partner
  // at <= 0.25 px a frame; touching within 12 px of its centre revives
  const GHOST_RISE = 0.08, GHOST_RISE_MAX = 36, GHOST_DRIFT = 0.25, GHOST_REACH = 12;
  // battle (배틀)
  // (a blink - respawn KO_INV, escape, the end of a stun - ends as soon as that player blows a bubble)
  const BATTLE_OPEN_DELAY = 75, BATTLE_ENEMIES = 6, BATTLE_RESPAWN = 90, BATTLE_KILL_STEP = 100, BATTLE_POWER_EVERY = 1200;
  const PTRAP_FRAMES = 240, PTRAP_MASH = 12.5, KO_PTS = 500, KO_WAIT = 90, KO_INV = 150, START_INV = 150;
  const STUN_FRAMES_P = 60, STUN_PTS = 100, STUN_INV = 30, INTRUDE_LEFT = 90 * 60, INTRUDE_PTS = 1500;
  const COUNT_FRAMES = 180, PODIUM_LOCK = 60;
  const BOSS_TYPES = Object.keys(BOSS_DEF);
  // ---- v4 trophies (트로피, design/trophies.md): the constants live up here - REQUIRED / SPR_SIZE and the font warm-up
  // read them at load (the trophy code itself is its own section after the word pops)
  const TRO_KEY = 'ppogeul-trophy', TRO_V = 5, TRO_MAX = 99999, TRO_GIFT = 100;   // (TRO_V 2: + the shop's coins and items, shop.md 5; 3: the worn set per animal, design/looks-per-animal.md; 4: the 뽑기, gacha.md; 5: the 2026-10 trophy balance, design/trophies.md - no new field, but a v 4 page clamps de to its DAY_CAP 20)
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
  const BASE = { 2: [12, -6], 3: [15, 5, -6], 4: [16, 8, 2, -6] };     // by place; n = players at 시작! (last place -6: the hold stays s + 6)
  // 목욕 보너스 per run / the 오늘 트로피 보너스 per local day (solo, co-op and battles share it) / per real battle (troReal)
  const RUN_CAP = 30, DAY_CAP = 40, TRO_PLAY = 5;
  const TRO_WAIT_MS = 15000, TRO_AWAY_MS = 30000, TRO_STALE_MS = 15 * 60000, TRO_SLACK_MS = 15000;
  const MID_RE = /^[0-9a-z]{6}\.\d{1,9}$/, ID6_RE = /^[0-9a-z]{6}$/;
  const leagueOf = (t) => { let i = 0; while (i + 1 < LEAGUES.length && t >= LEAGUES[i + 1].min) i++; return i; };
  // every Korean string the trophy UI shows (warmed in setupDOM next to V3_TEXT; kept apart from it on purpose)
  const TRO_TEXT = LEAGUES.map((l) => l.name).join(' ') +
    ' 내 트로피 내 기록 트로피 개 개씩 개부터 최고 트로피 배틀 승 판 뽀득 KO 혼자 최고 점수 리그 다음 리그까지 최고 리그예요! 닫기' +
    ' 오늘 트로피 보너스 목욕도 배틀도 받아요 이 브라우저에서는 기록이 저장되지 않아요 처음 선물로 트로피 100개를 받았어요! 친구와 배틀할 때 걸어 봐요' +
    ' 끝까지 한 판마다 하루 개까지' +
    ' 트로피 걸기 안 걸기 트로피 부족 연습 경기 트로피가 모자라요 방장에게 걸기를 낮춰 달라고 해요 트로피가 모자란 친구가 있어요 걸기를 낮춰 주세요 내 트로피가 모자라요' +
    ' 걸기를 낮췄어요: 걸기가 바뀌었어요: 다시 준비해 주세요 트로피 경기: 모두 개씩 걸고 1등이 다 가져요: 1등 2등 3등 4등' +
    ' 견습 리그는 등수로 잃지 않아요 판 중간에 나가면 꼴찌로 쳐요 연습 경기예요: 이 브라우저의 탭끼리는 트로피가 바뀌지 않아요 같은 기기에서 들어온 친구가 있어요' +
    ' 끝까지 갈수록 모두 트로피를 받아요 (잃지 않아요) 개씩 걸어요! 연습 경기 · 트로피 없음 결과 발표! 무승부 기권승 연습 승급!' +
    ' 방으로 가서 걸기를 바꿔요 친구가 나가서 이번 판은 무효예요 방장이 다음 판을 고르고 있어요 다음 판도 개씩 오늘 보너스 끝' +
    ' 한 번 더 누르면 나가요 한 번 더 누르면 모두 방으로 걸었던 트로피를 돌려받았어요 이번 판은 진 걸로 쳤어요 ? + - / · : % 0123456789,' +
    // (안 걸고 참여: the seat mark, the ready button, the rules, the room / podium lines)
    ' 안 걸고 참여 안 걸고 준비 트로피가 모자라요 · 안 걸고 같이 해요 판돈 개 (명이 개씩): 건 사람 중 1등이 다 가져요 안 걸고 참여: 등수 점수만 받아요' +
    ' 트로피가 모자라면 안 걸고 참여해요 (등수 점수만 받아요) 내 트로피가 모자라서 다음 판은 안 걸고 해요 다음 판은 안 걸고 하는 친구가 있어요 나는 안 걸고 해요';
  const V3_TEXT = CHAR_IDS.map((c) => { const d = CHARS[c]; return [d.name, d.animal, d.role, d.tag, d.badge, d.move.name, d.move.how, d.move.touch, d.bub.name, d.bub.desc].join(' '); }).join(' ') +
    // (v4 kit cards, hints, the countdown line; the pips' aria text)
    ' ' + STAT_NAMES.join(' ') + ' 특기: 거품: ' + OFF_LINE + ' 내 특기: 5점 중 3점' +
    // (AMMO: the battle room's magazine line, its rule; the kit card's aria text)
    ' 배틀 거품 발 · 장전 초 . ' + AMMO_RULE +
    ' 혼자 하기 친구와 하기 같이 하기 배틀 보스 난입! 뽀득 KO! 냥! 시작! 결과 발표 한 판 더 로비로 MVP 점 때 구조 위 KO 살아났다! 다 함께 덕분에 목욕탕이 뽀득뽀득해졌어요 1234' +
    // (online panels / messages)
    ' 친구 기기와 연결하지 못했어요 같은 와이파이에서 해 보거나 잠시 뒤 다시 해 주세요' +
    ' 내 이름 방 만들기 코드로 참여 열린 방 뒤로 방 코드 복사했어요 내 캐릭터 게임 설정 준비 취소 나가기 방장 빈 자리 경기장 랜덤 시간 분 능력 끄기 켜기' +
    ' 방장이 나갔어요 연결이 끊겼어요 방을 찾을 수 없어요 꽉 찼어요 연결 중… 불안정해요 이미 시작됐어요 방으로 다음 판을 고르고 있어요 손님 님의' +
    ' 메뉴 게임은 계속 진행돼요! 내 동물도 그대로 있어요 준비 완료 기다리는 중 있음 없음 첫 번째 탕부터 끝까지 청소 연타! 친구가 닿으면 살아나요 구해 줘! 어질!' +
    ' 한 번 더 누르면 모두 방으로 방이 닫혀요 열린 방에 이 방이 보여요 Claude 로그인·초대 필요 링크와 보내 주세요 복사에 링크도 담겨요 다른 탭에서만 들어올 수 있어요' +
    ' 연결 도구를 불러오는 중… 복사가 안 됐어요 코드를 직접 알려 주세요 보냈어요! 갇히면 점프·거품 연타로 빨리 빠져나와요 갇힌 친구를 터뜨리면 쓰러진 친구는 거품이 돼요 거품에 닿으면 바로 살아나요 목숨은 다 함께 써요' +
    // (몬스터 출현: the option row, the summary word, the rules line - design/distinction.md 3.4)
    ' 몬스터 출현 경기 내내 때 몬스터가 나와요 몬스터 없음 몬스터 없이 친구끼리만 겨뤄요' +
    // (a link that cannot use 친구와 하기: the block card and the answers to 참여 / 방 만들기 - distinction.md 4.3)
    ' 이 링크로는 친구와 하기를 쓸 수 없어요 게임을 보내 준 친구에게 Claude 이메일 초대를 부탁해요 · 초대 메일 속 링크로 열면 돼요' +
    ' 혼자 하기는 지금 바로 할 수 있어요 방장에게 이메일 초대를 부탁해요 이 링크로는 방을 만들 수 없어요 게임을 보내 준 사람에게' +
    ' 온라인 연결 도구를 불러오지 못했어요 인터넷을 확인하고 새로고침해 주세요 온라인 연결 도구가 없어요 새로고침' +
    // (telling players apart: the "나" chip, seat numbers 1P-4P, the kit card's twin line - distinction.md 2.6-2.10)
    ' 나 1P 2P 3P 4P 같은 동물이 있어서 ' + SLOT_NAMES.join('색으로 나와요 ') + '색으로 나와요' +
    // (v4 move words)
    ' ' + CHAR_IDS.map((c) => MOVE_WORD[c]).join(' ') + ' 콩!';
  // v4 cloud trophies (the STANDALONE deploy with a cloud config only - design/cloud-trophies.md 9.4): every line and
  // message of 내 기록's cloud row ({0} {1}: a number / the host name; ' · ' parts wrap as units), the sign-in button's
  // labels, and their warm-up text (added to #pg-fontwarm only when the cloud is on)
  const CL_TX = {
    // (v4 shop 8.5: the account carries the coins and items too - "트로피·꾸미기가"; the swap names what else is put aside)
    pitch: '로그인하면 다른 기기에서도 트로피·꾸미기가 이어져요 · 구글 계정 이름·메일은 저장하지 않아요', authing: '구글 창에서 로그인을 마쳐 주세요',
    linking: '구글 계정에 연결하는 중…', ok: '구글 계정에 저장돼요', pushing: '저장하는 중…', wait: '저장 대기 중',
    offline: '오프라인이에요 · 연결되면 저장돼요', up: '구글 계정에 트로피 {0}개를 저장했어요', got: '구글 계정의 트로피 {0}개를 불러왔어요',
    swap: '구글 계정의 트로피 {0}개예요 · 이 기기의 트로피 {1}개와 꾸미기는 로그아웃하면 다시 보여요', out: '로그아웃했어요 · 다시 로그인하면 계정 트로피가 돌아와요',
    cancel: '로그인을 취소했어요', late: '로그인을 마치지 못했어요 · 다시 눌러 주세요', popup: '팝업이 막혔어요 · 한 번 더 눌러 주세요',
    frame: '이 화면에서는 로그인이 안 돼요 · 새 창에서 열어 주세요', framens: '새 창에서 열면 기록이 저장되고 로그인도 돼요', frame0: '이 화면에서는 구글 로그인을 쓸 수 없어요',
    inapp: '앱 안 브라우저에서는 구글 로그인이 안 돼요 · 크롬이나 사파리에서 열어 주세요', nostore: '이 브라우저에서는 로그인을 쓸 수 없어요',
    fail: '로그인하지 못했어요 · 잠시 뒤에 다시 해 주세요', sdk: '로그인 도구를 불러오지 못했어요 · 인터넷이나 광고 차단을 확인해 주세요',
    domain: '승인되지 않은 주소예요: {0}', setup: '로그인이 아직 준비되지 않았어요 · 설정을 확인해 주세요', disabled: '이 계정은 쓸 수 없어요',
    held: '경기가 끝난 뒤에 해 주세요', relog: '다시 로그인해 주세요', dirty: '저장 안 된 기록이 있어요 · 한 번 더 누르면 로그아웃', outkeep: '로그아웃했어요 · 저장 안 된 기록은 다시 로그인하면 올라가요',
    quota: '지금은 저장할 수 없어요 · 나중에 다시 저장돼요', newer: '새 버전에서 저장한 기록이에요 · 새로고침해 주세요', full: '이 기기는 저장할 수 없어요 (기기 16대까지)',
  };
  // (again: 'auth' by popup - the Google window may be a tab the player left; a tap opens it again)
  const CL_BTN = { out: '구글로 로그인', load: '불러오는 중…', auth: '로그인 중…', again: '다시 열기', link: '로그인 중…', in: '로그아웃', relog: '다시 로그인', frame: '새 창에서 열기', inapp: '다른 브라우저로 열기' };
  // (내 기록's note in a frame that keeps nothing, warmed with the rest)
  const CL_NOTE = '이 화면에서는 기록이 저장되지 않아요';
  const CLOUD_TEXT = Object.keys(CL_TX).map((k) => CL_TX[k].replace(/\{\d\}/g, '')).join(' ') + ' ' + Object.keys(CL_BTN).map((k) => CL_BTN[k]).join(' ') + ' ' + CL_NOTE + ' · : ( ) 0123456789,';
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
  const RARITY = [{ name: '보통', col: '#c4b99f' }, { name: '고급', col: '#6fd08a' }, { name: '희귀', col: '#c9a8ff' }, { name: '전설', col: '#ffb24a' }];
  // on: the wear verb, off: the take-off verb, done: the bought / worn message, offDone: the taken-off message (a hat is
  // 쓰다, never 입다). 등 holds things worn four ways: its default is a backpack's (메다); a cape, a tube and wings name
  // their own verbs in the catalog (vb: [on, off, done, offDone] - review 2026-10-18)
  const SLOT_INFO = { h: { name: '머리', at: 'H', on: '쓰기', off: '벗기', done: '썼어요', offDone: '벗었어요' }, f: { name: '얼굴', at: 'E', on: '하기', off: '빼기', done: '했어요', offDone: '뺐어요' },
    n: { name: '목', at: 'N', on: '하기', off: '빼기', done: '했어요', offDone: '뺐어요' }, b: { name: '등', at: 'B', on: '메기', off: '벗기', done: '멨어요', offDone: '벗었어요' },
    e: { name: '효과', at: '', on: '켜기', off: '끄기', done: '켰어요', offDone: '껐어요' } };
  const VB_CAPE = ['두르기', '벗기', '둘렀어요', '벗었어요'], VB_TUBE = ['끼기', '빼기', '꼈어요', '뺐어요'], VB_WING = ['달기', '떼기', '달았어요', '뗐어요'];
  const VB_ROBE = ['입기', '벗기', '입었어요', '벗었어요'];   // (gacha.md 4.1: b9, a robe)
  // the catalog (section 4): id = slot letter + one base-36 digit (the worn set stores that digit; never reused, and a
  // price never changes - a new price is a new id); rar -1 = 처음 선물, 0-3 = RARITY; lg = the best league needed (S.bl);
  // at = where a 등 item hangs (B: behind the shoulder, W: a tube round the waist). The order is the 상점's: by slot,
  // then by price, then the slot's draw-only items (dr: 1, price 0: never sold, only drawn - design/gacha.md 4.1)
  const ITEMS = [
    { id: 'h1', name: '양머리 수건', rar: 0, price: 60, lg: 0, desc: '분홍 수건을 돌돌 말아 만든 양 귀' },
    { id: 'h2', name: '샤워캡', rar: 0, price: 70, lg: 0, desc: '주름 고무줄이 귀여운 하늘빛 샤워캡' },
    { id: 'h3', name: '때타월 두건', rar: 0, price: 80, lg: 0, desc: '초록 이태리타올을 질끈 묶은 두건' },
    { id: 'h4', name: '귤 껍질 모자', rar: 0, price: 90, lg: 0, desc: '찜질방 귤 반쪽을 쏙 쓴 모자' },
    { id: 'h5', name: '바가지 모자', rar: 1, price: 160, lg: 0, desc: '노란 목욕 바가지를 거꾸로 쓴 모자' },
    { id: 'h6', name: '고무장갑 볏', rar: 1, price: 180, lg: 0, desc: '빨간 고무장갑이 닭 볏처럼 쫑긋' },
    { id: 'h7', name: '거품 왕방울 머리', rar: 1, price: 200, lg: 0, desc: '몽글몽글 비누 거품이 머리 가득' },
    { id: 'h8', name: '금테 양머리', rar: 1, price: 220, lg: 3, desc: '양머리 고수만 쓰는 금테 수건' },
    { id: 'h9', name: '오리 머리띠', rar: 2, price: 380, lg: 0, desc: '용수철 위에서 고무 오리가 통통' },
    { id: 'ha', name: '맥반석 계란 투구', rar: 2, price: 420, lg: 0, desc: '반쯤 깐 맥반석 계란 껍질 투구' },
    { id: 'hb', name: '사우나 모자', rar: 2, price: 450, lg: 5, desc: '사우나 명인의 펠트 모자' },
    { id: 'hc', name: '황금 대야 투구', rar: 3, price: 1200, lg: 6, desc: '목욕탕 왕의 번쩍이는 황금 대야' },
    { id: 'hd', name: '진주 이태리타올', rar: 3, price: 0, lg: 0, dr: 1, desc: '때밀이 달인도 탐내는 반짝반짝 진주빛 때수건' },
    { id: 'he', name: '딸기우유 모자', rar: 2, price: 0, lg: 0, dr: 1, desc: '목욕 끝엔 딸기우유! 빨대 꽂은 단지 모자' },
    { id: 'f1', name: '하트 볼터치', rar: 0, price: 60, lg: 0, desc: '볼에 콕 찍은 분홍 하트' },
    { id: 'f3', name: '새내기 별 스티커', rar: 0, price: 70, lg: 1, desc: '뽀득 새내기가 받은 별 스티커' },
    { id: 'f2', name: '수경', rar: 0, price: 80, lg: 0, desc: '파란 끈 수영 수경' },
    { id: 'f4', name: '김서림 안경', rar: 1, price: 160, lg: 0, desc: '목욕탕 김이 서린 동그란 안경' },
    { id: 'f5', name: '선글라스', rar: 1, price: 180, lg: 0, desc: '반짝 하얀 빛이 도는 까만 선글라스' },
    { id: 'f6', name: '오이 팩', rar: 1, price: 200, lg: 0, desc: '눈 위에 시원한 오이 한 조각' },
    { id: 'f7', name: '황금 외알 안경', rar: 2, price: 400, lg: 0, desc: '줄이 달랑, 황금 외알 안경' },
    { id: 'f8', name: '오리 잠수경', rar: 2, price: 0, lg: 0, dr: 1, desc: '주황 테에 오리 부리가 콕, 잠수 수경' },
    { id: 'f9', name: '거품 수염', rar: 1, price: 0, lg: 0, dr: 1, desc: '비누 거품으로 만든 몽실몽실 콧수염' },
    { id: 'n1', name: '초록 때타월 리본', rar: -1, price: 0, lg: 0, desc: '처음 선물! 이태리타올 리본' },
    { id: 'n2', name: '수건 목도리', rar: 0, price: 70, lg: 0, desc: '줄무늬 수건을 둘둘 감은 목도리' },
    { id: 'n3', name: '딸랑 방울', rar: 0, price: 80, lg: 0, desc: '빨간 목줄에 금방울 딸랑' },
    { id: 'n4', name: '나비넥타이', rar: 0, price: 90, lg: 0, desc: '물방울 무늬 나비넥타이' },
    { id: 'n5', name: '사물함 열쇠 목걸이', rar: 1, price: 150, lg: 2, desc: '온탕 단골의 고무줄 열쇠' },
    { id: 'n6', name: '거품 진주 목걸이', rar: 1, price: 200, lg: 0, desc: '비누 거품을 꿰어 만든 진주' },
    { id: 'n7', name: '세신 달인 금메달', rar: 1, price: 220, lg: 4, desc: '세신 달인에게 주는 금메달' },
    { id: 'n8', name: '꽃 목걸이', rar: 2, price: 380, lg: 0, desc: '알록달록 꽃을 엮은 목걸이' },
    { id: 'n9', name: '냉탕 얼음 목걸이', rar: 1, price: 0, lg: 0, dr: 1, desc: '냉탕에서 건진 차가운 얼음 조각' },
    { id: 'na', name: '무지개 비누 목걸이', rar: 2, price: 0, lg: 0, dr: 1, desc: '알록달록 작은 비누를 줄줄이 꿴 목걸이' },
    { id: 'b1', name: '망토 수건', rar: 0, price: 90, lg: 0, at: 'B', vb: VB_CAPE, desc: '어깨에 두른 분홍 줄무늬 수건' },
    { id: 'b2', name: '도넛 튜브', rar: 1, price: 160, lg: 0, at: 'W', vb: VB_TUBE, desc: '분홍 설탕옷 도넛 튜브' },
    { id: 'b3', name: '오리 튜브', rar: 1, price: 180, lg: 0, at: 'W', vb: VB_TUBE, desc: '앞에 오리 머리가 달린 노란 튜브' },
    { id: 'b4', name: '목욕 바구니 배낭', rar: 1, price: 200, lg: 0, at: 'B', desc: '샴푸가 쏙 나온 목욕 바구니' },
    { id: 'b5', name: '바가지 등껍질', rar: 2, price: 400, lg: 0, at: 'B', desc: '거북이처럼 등에 멘 초록 바가지' },
    { id: 'b6', name: '비누방울 날개', rar: 2, price: 480, lg: 0, at: 'B', vb: VB_WING, desc: '무지갯빛이 도는 비누방울 날개' },
    { id: 'b7', name: '무지개 망토', rar: 3, price: 950, lg: 0, at: 'B', vb: VB_CAPE, desc: '바닥까지 펄럭이는 무지개 망토' },
    { id: 'b8', name: '샴푸 제트팩', rar: 2, price: 0, lg: 0, dr: 1, at: 'B', desc: '샴푸 두 통을 등에 멘 제트팩' },
    { id: 'b9', name: '선녀 날개옷', rar: 3, price: 0, lg: 0, dr: 1, at: 'B', vb: VB_ROBE, desc: '목욕하러 내려온 선녀의 하늘하늘 날개옷' },
    { id: 'e2', name: '착지 물방울', rar: 0, price: 80, lg: 0, desc: '착지할 때 물방울이 톡' },
    { id: 'e1', name: '김 모락모락', rar: 0, price: 90, lg: 0, desc: '가만히 있으면 김이 모락모락' },
    { id: 'e3', name: '점프 반짝이', rar: 1, price: 200, lg: 0, desc: '뛰어오를 때 반짝반짝' },
    // (e4's line is not the spec's: its doubled bubbling word starts with the retired v1 title's two syllables, which stay
    // out of the page - final-e2e2)
    { id: 'e4', name: '걸을 때 비누방울', rar: 1, price: 220, lg: 0, desc: '걸으면 비누방울이 퐁퐁 솟아요' },
    { id: 'e5', name: '하트 뿅뿅', rar: 2, price: 450, lg: 0, desc: '크게 점수를 내면 하트가 뿅' },
    { id: 'e6', name: '무지개 발자국', rar: 3, price: 1100, lg: 0, desc: '걷는 자리마다 무지개 발자국' },
    { id: 'e7', name: '아기 오리 졸졸', rar: 2, price: 0, lg: 0, dr: 1, desc: '걸으면 아기 오리들이 졸졸 따라와요' },
    { id: 'e8', name: '뜨끈뜨끈 온천 기운', rar: 3, price: 0, lg: 0, dr: 1, desc: '어디서든 뜨끈한 온천 기운이 피어올라요' },
  ];
  const ITEM = {}; ITEMS.forEach((it) => { it.slot = it.id[0]; ITEM[it.id] = it; });
  const STARTER = 'n1';
  // an item's verbs ({on, off, done, offDone}: its own vb, else its slot's)
  const verbOf = (it) => { const V = SLOT_INFO[it.slot], b = Array.isArray(it.vb) && it.vb.length === 4 ? it.vb : null;
    return b ? { on: b[0], off: b[1], done: b[2], offDone: b[3] } : { on: V.on, off: V.off, done: V.done, offDone: V.offDone }; };
  // ---- v4 뽑기 (비누 캡슐 뽑기, design/gacha.md): one draw costs DRAW.price coins, ten cost ten times that (no discount:
  // the cloud rules check spent coins by the draw count) and one of the ten comes from the 희귀 / 전설 tiers. Weights are
  // per item in 1/10,000 - wr by rarity for a shop item, wd for a draw-only one - and the pool adds up to exactly 10,000
  // (check-shop); league items and the starter are never in it. The weights, the pity and the refunds are what the 확률
  // 보기 panel promises: change one only together with its tests. The price never changes (the cloud counts draws, not
  // coins: a new price would be a new counter)
  const DRAW = { price: 200, ten: 10, pity: 10, refund: [30, 60, 100, 150], wr: [375, 200, 100, 50], wd: [0, 500, 200, 100], rare: 2, nw: 16, log: 10 };
  // (0 = not drawn now: league items, the starter, an item retired from the 상점)
  const drawW = (it) => (it.lg || it.rar < 0 || it.retired ? 0 : (it.dr ? DRAW.wd : DRAW.wr)[it.rar] | 0);
  // every id that is or ever was drawable - GROW-ONLY (the catalog never drops an id; retiring an item keeps it here):
  // what a list of drawn items may hold, in the store (gd), the link record and the rules (poolIds). A drawn item that
  // left this list would make every later write of its slot fail the rules
  const DRAW_IDS = ITEMS.filter((it) => !it.lg && it.rar >= 0).map((it) => it.id);    // 43 ids
  // the ids drawn NOW, by weight (drawCands and the 확률 보기 panel only)
  const DRAW_POOL = ITEMS.filter((it) => drawW(it) > 0).map((it) => it.id);          // 43 ids today, in the 상점's order
  const DRAW_ONLY = DRAW_POOL.filter((id) => ITEM[id].dr);                             // the draw-only ids drawn now (10)
  const isPoolId = (id) => typeof id === 'string' && DRAW_IDS.includes(id);
  // (looks-per-animal.md 8) an animal's name as a subject: a final consonant takes the friendly 이 first, as a kid says a
  // pet's name - "꽥꽥이가" / "까삐가" / "해롱이가" / "펭펭이가" / "냥냥이가" / "깨굴이가"
  const aniSubj = (c) => { const n = (CHARS[c] || CHARS.duck).name, k = n.charCodeAt(n.length - 1) - 0xac00; return n + (k >= 0 && k < 11172 && k % 28 ? '이가' : '가'); };
  // every Korean string the shop UI shows (warmed in setupDOM next to TRO_TEXT; section 12)
  const SHOP_TEXT = ITEMS.map((it) => it.name + ' ' + it.desc).join(' ') + ' ' + RARITY.map((r) => r.name).join(' ') +
    ' 처음 선물 비누 코인 상점 마이페이지 내 기록 머리 얼굴 목 등 효과 사기 한 번 더 누르면 사요 개 모자라요 리그부터 닫기' +
    ' 쓰기 벗기 하기 빼기 켜기 끄기 샀어요! 바로 썼어요 했어요 켰어요 마이페이지에서 바꿀 수 있어요' +
    ' 게임을 하면 비누 코인이 모여요 이기든 지든, 혼자 해도! 아이템을 골라 봐요' +
    ' 이름 없음 아직 없어요 상점에서 골라 봐요 상점 가기 꾸미기 처음 선물: 초록 때타월 리본을 해 봐요 오늘 첫 판 하면 코인 +!' +
    ' 일 연속 내일 첫 판 상점에서 써요! 오늘은 반만 모여요 이기든 지든 비누 코인을 받아요 연습 경기라 비누 코인도 없어요' +
    ' 이 브라우저에서는 저장되지 않아요 트로피·꾸미기가 이어져요 꾸미기는 0123456789,· :' +
    // (S3a: the 상점's answer when another tab of this browser bought the item first)
    ' 이미 가지고 있어요' +
    // (review 2026-10-18: the taken-off messages, the 등 items' own verbs, the shortfall, the first card's goal, day 1, a
    // purchase another tab's write lost)
    ' 벗었어요 뺐어요 껐어요 ' + [VB_CAPE, VB_TUBE, VB_WING, [SLOT_INFO.b.on, SLOT_INFO.b.done]].map((v) => v.join(' ')).join(' ') +
    ' 개 더 모아요 개 모으면 첫 아이템! 오늘 보너스 받았어요 다시 사 주세요' +
    // (looks-per-animal.md 8: the per-animal lines; the names are in V3_TEXT, aria-labels are not warmed)
    ' 동물마다 따로 꾸며요 이제 동물마다 따로 꾸며요! 가 이가';
  // (v4 뽑기, design/gacha.md 10) every Korean string the 뽑기 shows ({n}-style parts are built from these syllables;
  // aria-labels are not warmed). No string may contain the retired v1 title's syllables (final-e2e2). The catalog's
  // names / descs are in SHOP_TEXT
  const GACHA_TEXT = ' 뽑기 비누 캡슐 뽑기 1회 뽑기 10회 뽑기 한 번 더 누르면 뽑아요 다 모았어요! 개 더 모아요' +
    ' 첫 뽑기는 뽑기 전용 아이템 확정! 회 안에 뽑기 전용 아이템 확정 다음 뽑기에 뽑기 전용 아이템 확정!' +
    ' 뽑기 전용 아이템을 다 모았어요! 남은 아이템은 상점에서 사요 10회 뽑기는 희귀 이상 1개 확정 뽑기 확률 가지고 있어요' +
    ' 확률 보기 확률 닫기 뽑기 전용 아이템 뽑기 1회의 확률 등급 합계 아이템 1개 상점 아이템 종 각 %' +
    ' 첫 뽑기는 뽑기 전용 아이템 확정 10회 안에 아직 없는 뽑기 전용 아이템 1개 확정 (고급 : 희귀 : 전설 = 5 : 2 : 1 비율로)' +
    ' 10회 뽑기 중 1개는 희귀·전설 중에서 나와요 이미 있는 아이템이 나오면 코인을 돌려받아요:' +
    ' 리그 아이템과 처음 선물은 나오지 않아요 뽑기 전용 아이템은 상점에서 팔지 않아요 뽑기 전용 아이템을 다 모으면 뽑기가 끝나요' +
    ' 비누 코인은 게임을 해야만 모여요 아이템별 확률 보통 뽑기 희귀 이상 뽑기 확정 뽑기' +
    ' 건너뛰기 두근두근… 새 아이템! 이미 있어요 코인 + 뽑기 전용 확정! 희귀 이상 확정 확인 지금 지난 뽑기 결과예요' +
    ' 새 아이템 개 모두 이미 있어요 뽑기 결과 뽑기로 가기 뽑기에서만 나와요 뽑기가 저장되지 않았어요 코인은 그대로예요' +
    ' 이 브라우저에서는 저장되지 않아요 ' + VB_ROBE.join(' ') + ' 0123456789,.·:()=/';

  // ------------------------------------------------------------------ utils
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeIO = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function overlap(ax, ay, aw, ah, bx, by, bw, bh) { return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by; }
  function circBox(cx, cy, r, bx, by, bw, bh) {
    const nx = clamp(cx, bx, bx + bw), ny = clamp(cy, by, by + bh);
    const dx = cx - nx, dy = cy - ny; return dx * dx + dy * dy < r * r;
  }
  function hexRgba(h) {
    let s = String(h || '').trim().replace('#', '');
    if (s.length === 3 || s.length === 4) s = s.split('').map((c) => c + c).join('');
    const n = parseInt(s.slice(0, 6), 16);
    if (!/^[0-9a-fA-F]{6}/.test(s) || isNaN(n)) return [255, 0, 255, 255];
    const a = s.length >= 8 ? parseInt(s.slice(6, 8), 16) : 255;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, isNaN(a) ? 255 : a];
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rng = mulberry32((Date.now() ^ 0x5bd1e995) >>> 0);
  let fxr = mulberry32(0x9e3779b9);
  const rr = (a, b) => a + (b - a) * rng();
  const ri = (a, b) => a + Math.floor((b - a + 1) * rng());
  function sget(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { window.localStorage.setItem(k, String(v)); } catch (e) { /* storage blocked */ } }
  function mq(q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } }
  let rmq = null;
  try { rmq = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (e) { rmq = null; }
  const reducedMotion = () => !!(rmq && rmq.matches);
  // listener registry so a hot-reloaded engine can tear the previous one down cleanly
  const LISTENERS = [];
  function listen(target, type, fn, opts) { if (!target) return; target.addEventListener(type, fn, opts); LISTENERS.push([target, type, fn, opts]); }
  let stopped = false;
  function stopEngine() {
    stopped = true;
    for (const [t, ty, fn, o] of LISTENERS) { try { t.removeEventListener(ty, fn, o); } catch (e) { /* ignore */ } }
    LISTENERS.length = 0;
    try { netClose('reload'); } catch (e) { /* ignore */ } // (a hot-reloaded engine does not keep the old one's game; trophies held: refunded)
    try { clStop(); } catch (e) { /* ignore */ }         // (cloud trophies: the listener, the auth observer, the timers)
  }

  // ------------------------------------------------------------------ audio (safe wrapper)
  const Snd = {
    cur: undefined, localMute: false,
    api() { const a = PG.Audio; return a && typeof a === 'object' ? a : null; },
    call(fn, ...args) { const a = this.api(); if (!a || typeof a[fn] !== 'function') return undefined; try { return a[fn](...args); } catch (e) { return undefined; } },
    unlock() { this.call('unlock'); },
    // (an online host also records it for the guests: see netEv; a player's own movement sounds stay local)
    sfx(n, o) { if (G.attract || G.mode === 'title') return; if (NET.rec && !NO_ECHO[n]) netEv('s', n, o ? (o.open ? 'o' : o.n | 0) : 0); this.call('sfx', n, o); },
    music(t) { if (t === this.cur) return; this.cur = t; this.call('music', t); },
    muted() { const a = this.api(); if (!a || typeof a.isMuted !== 'function') return this.localMute; try { return !!a.isMuted(); } catch (e) { return this.localMute; } },
    setMuted(m) { this.localMute = !!m; this.call('setMuted', !!m); },
  };

  // ------------------------------------------------------------------ sprites
  const SPR = {};
  const REQUIRED = {
    duck_idle: 2, duck_walk: 4, duck_jump: 1, duck_fall: 1, duck_shoot: 1, duck_die: 4,
    bubble_new: 2, bubble: 3, bubble_pop: 2, steam_bubble: 2, steam_bolt: 2, life: 1,
    boss_grime_idle: 2, boss_grime_jump: 1, boss_grime_hurt: 1, boss_mold_idle: 2, boss_mold_shoot: 1, boss_mold_hurt: 1,
    boss_sponge_idle: 2, boss_sponge_charge: 2, boss_sponge_hurt: 1, boss_towel_idle: 2, boss_towel_swoop: 1, boss_towel_hurt: 1,
    giant_bubble: 2, spore: 2, shockwave: 2, scald_drop: 2, mini_mitt: 2,
    stamp_bubble: 2, stamp: 1, stamp_empty: 1, pw_shampoo: 1, pw_slippers: 1, pw_bathbomb: 1,
    grime_soaked: 2, mold_soaked: 2, sponge_soaked: 2,
    water_hot_top: 2, water_hot: 1, water_cold_top: 2, water_cold: 1, ice_block: 1, drain: 1, shower: 1,
  };
  ENEMY_TYPES.forEach((t) => { REQUIRED[t + '_walk'] = 2; REQUIRED[t + '_angry'] = 2; REQUIRED[t + '_trapped'] = 2; REQUIRED[t + '_dead'] = 1; });
  ITEM_TYPES.forEach((t) => { REQUIRED['item_' + t] = 1; });
  for (let i = 0; i < 5; i++) REQUIRED['tile_' + i] = 1;
  // v3: every animal's body animations (the duck's already listed); bubble / ghost / life / portrait frames are
  // derived from the idle frames when the art does not have them yet
  CHAR_IDS.forEach((c) => { for (const a in CHAR_ANIMS) REQUIRED[c + '_' + a] = CHAR_ANIMS[a]; });
  REQUIRED[SPR_CROWN] = 1; REQUIRED[SPR_TAG] = 1; REQUIRED[SPR_READY] = 1;
  const SPR_SIZE = {
    giant_bubble: [40, 40], spore: [8, 8], shockwave: [16, 8], scald_drop: [8, 8], stamp: [8, 8], stamp_empty: [8, 8],
    water_hot_top: [8, 8], water_hot: [8, 8], water_cold_top: [8, 8], water_cold: [8, 8], drain: [8, 8], shower: [16, 8], life: [8, 8],
    crown: [8, 8], ready: [8, 8], tag_arrow: [5, 3], trophy: [8, 8], coin: [8, 8], shop: [8, 8], lock: [8, 8],
  };
  // v4 trophies (design/trophies.md §9): the cup and the 7 league icons
  REQUIRED[SPR_CUP] = 2;
  LEAGUES.forEach((l, i) => { REQUIRED[LG_PRE + i] = 1; SPR_SIZE[LG_PRE + i] = [8, 8]; });
  // v4 shop (shop.md 10): the 비누 코인 (2 frames: front, glint), the 상점 button's basket and the league lock - stand-ins
  // when the art lacks them (a pink disc, a pink square, a grey square); the items themselves are never stood in for
  Object.assign(REQUIRED, { coin: 2, shop: 1, lock: 1 });   // (their 8x8 size: SPR_SIZE above)
  // v4 (char-kits §11): the move poses (16x16) and the 5x5 bubble glyphs are optional - a missing or misshapen one is
  // left out (never a stand-in box): drawPlayer falls back to the spec's frame (duck_jump, capy_fall, otter_jump,
  // penguin_fall turned, cat_jump spinning) and drawBubble simply draws no glyph. Reached through POSE / KIT_LOOK below
  const OPT_SPR = { duck_glide: 2, capy_slam: 1, otter_dash: 1, penguin_slide: 1, cat_flip: 1,
    icon_duck: 1, icon_capy: 1, icon_otter: 1, icon_penguin: 1, icon_cat: 2, icon_frog: 1 };
  // v4 shop (shop.md 10): the worn items' art (얼굴: [profile, front]; a tube: [back half, front half]), the 효과 icons
  // and the 5 slot icons are optional too, sized by PG.ITEM_SIZE (sprites.js): a missing or misshapen frame is left out
  // and that item draws nothing in play - never a stand-in box
  ITEMS.forEach((it) => { if (it.slot === 'e') OPT_SPR['ic_' + it.id] = 1; else OPT_SPR['it_' + it.id] = it.slot === 'f' || it.at === 'W' ? 2 : 1; });
  LOOK_SLOTS.forEach((s) => { OPT_SPR['slot_' + s] = 1; });
  // (v4 뽑기, gacha.md 8) the 상점's capsule icon, e7's duckling, the machine, its crank and the capsules (whole, halves)
  Object.assign(OPT_SPR, { ic_cap: 1, fx_duck: 2, gacha: 1, gacha_h: 4, cap: 4, cap_t: 4, cap_b: 1 });
  function sizeOf(name) {
    if (/^boss_|^portrait_/.test(name)) return [32, 32];
    if (/^tile_|^life_/.test(name)) return [8, 8];
    if (/^icon_/.test(name)) return [5, 5];
    // (the shop sprites: their size from the art, PG.ITEM_SIZE - none there = [0, 0], so every frame is left out)
    // (gacha.md 8: ic_cap, fx_duck and the machine / crank / capsules too - exact names: /^cap/ would take the capybara)
    if (/^(it_|ic_|slot_|fx_)|^(gacha|gacha_h|cap|cap_t|cap_b)$/.test(name)) { const s = PG.ITEM_SIZE && Object.prototype.hasOwnProperty.call(PG.ITEM_SIZE, name) ? PG.ITEM_SIZE[name] : null; return Array.isArray(s) && s.length === 2 ? s : [0, 0]; }
    return SPR_SIZE[name] || [16, 16];
  }

  function finishFrame(c) {
    const w = c.width, h = c.height;
    const m = mk(w, h), mx = m.getContext('2d'); mx.translate(w, 0); mx.scale(-1, 1); mx.drawImage(c, 0, 0);
    const wh = mk(w, h), wx = wh.getContext('2d'); wx.drawImage(c, 0, 0); wx.globalCompositeOperation = 'source-in'; wx.fillStyle = '#ffffff'; wx.fillRect(0, 0, w, h);
    const whm = mk(w, h), wmx = whm.getContext('2d'); wmx.translate(w, 0); wmx.scale(-1, 1); wmx.drawImage(wh, 0, 0);
    return { c, m, wh, whm, w, h };
  }
  function bakeFrame(rows, rgb) {
    if (typeof rows === 'string') rows = rows.split('\n');
    if (!Array.isArray(rows) || !rows.length) return null;
    rows = rows.map((r) => String(r));
    const h = rows.length, w = Math.max(1, ...rows.map((r) => r.length));
    const c = mk(w, h), x = c.getContext('2d'), id = x.createImageData(w, h), d = id.data;
    for (let yy = 0; yy < h; yy++) {
      const row = rows[yy];
      for (let xx = 0; xx < row.length; xx++) {
        const ch = row[xx]; if (ch === '.' || ch === ' ') continue;
        const col = rgb[ch]; if (!col) continue;
        const o = (yy * w + xx) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = col[3];
      }
    }
    x.putImageData(id, 0, 0);
    return finishFrame(c);
  }
  // ---- v3 fallbacks: simple stand-in animals (used only while the art for one is missing)
  const ANIMAL_RE = /^(capy|otter|penguin|cat|frog)_(idle|walk|jump|fall|shoot|die)$/;
  function pixelRows(x, rows, cols, outline) {
    const h = rows.length, w = rows[0].length, on = (c, r) => r >= 0 && r < h && c >= 0 && c < w && rows[r][c] !== '.';
    if (outline) {
      x.fillStyle = outline;
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (!on(c, r) && (on(c - 1, r) || on(c + 1, r) || on(c, r - 1) || on(c, r + 1))) x.fillRect(c, r, 1, 1);
    }
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { const ch = rows[r][c]; if (ch !== '.' && cols[ch]) { x.fillStyle = cols[ch]; x.fillRect(c, r, 1, 1); } }
  }
  function animalFallback(x, name, i) {
    const m = name.match(ANIMAL_RE), c = m[1], anim = m[2], def = CHARS[c];
    const body = def.col, ink = def.dark;
    const dy = anim === 'idle' ? (i & 1) : anim === 'jump' ? -1 : 0;
    const ell = (cx, cy, rx, ry, fill) => { x.beginPath(); x.ellipse(cx, cy + dy, rx, ry, 0, 0, Math.PI * 2); x.fillStyle = fill; x.fill(); };
    const px = (px0, py0, w, h, col) => { x.fillStyle = col; x.fillRect(px0, py0 + dy, w, h); };
    // outline first (a slightly larger dark silhouette), then the body
    ell(7.5, 10.5, 6.3, 5.3, ink); ell(10.5, 6, 4.6, 4.3, ink);
    ell(7.5, 10.5, 5.3, 4.3, body); ell(10.5, 6, 3.6, 3.3, body);
    const belly = c === 'penguin' ? '#f4f6ff' : c === 'frog' ? '#c8f08a' : c === 'otter' ? '#e8cfa6' : c === 'cat' ? '#ffe2c0' : '#e2b48a';
    ell(8, 11.5, 3, 2.4, belly);
    if (c === 'capy') { px(8, 1, 2, 2, ink); px(11, 5, 4, 3, '#a8703f'); px(14, 5, 1, 1, ink); }
    else if (c === 'otter') { ell(12, 6.8, 2.3, 1.8, '#f3e2b4'); px(14, 6, 1, 1, ink); px(15, 7, 1, 1, '#ffffff'); }
    else if (c === 'penguin') { ell(12, 6.5, 1.8, 2, '#f4f6ff'); px(14, 6, 2, 1, '#ff8c1e'); }
    else if (c === 'cat') { px(7, 1, 2, 2, body); px(12, 1, 2, 2, body); px(7, 0, 1, 1, ink); px(13, 0, 1, 1, ink); px(4, 9, 1, 3, '#c97830'); px(7, 8, 1, 3, '#c97830'); px(14, 6, 1, 1, '#ff8fb1'); }
    else if (c === 'frog') { ell(9, 2.6, 1.8, 1.8, body); ell(12.5, 2.6, 1.8, 1.8, body); px(9, 2, 1, 1, ink); px(12, 2, 1, 1, ink); px(10, 8, 5, 1, ink); }
    // eye (dead: an x), legs
    if (anim === 'die') { px(11, 4, 1, 1, ink); px(13, 4, 1, 1, ink); px(12, 5, 1, 1, ink); px(11, 6, 1, 1, ink); px(13, 6, 1, 1, ink); }
    else if (c !== 'frog') { px(12, 5, 1, 2, ink); }
    if (anim === 'shoot') { px(14, 8, 2, 2, ink); }
    const step = anim === 'walk' ? i & 3 : 0;
    const lx = step === 1 ? 1 : step === 3 ? -1 : 0;
    if (anim !== 'jump' && anim !== 'die') { px(5 + lx, 14, 2, 2, ink); px(9 - lx, 14, 2, 2, ink); }
    else if (anim === 'jump') { px(5, 15, 2, 1, ink); px(9, 15, 2, 1, ink); }
    if (anim === 'die' && i) {
      // tumble: rotate the frame a quarter turn per frame
      const t = mk(16, 16), tx = t.getContext('2d'); tx.drawImage(x.canvas, 0, 0);
      x.clearRect(0, 0, 16, 16); x.save(); x.translate(8, 8); x.rotate(i * Math.PI / 2); x.drawImage(t, -8, -8); x.restore();
    }
  }
  // bubble-wrapped animal: trapped (battle) or a pale ghost (co-op revive)
  function bubbleWrap(f, ghost, i) {
    const c = mk(16, 16), x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    if (f) {
      if (ghost) {
        x.globalAlpha = 0.7; x.drawImage(f.c, 0, 0, f.w, f.h, 2, 3, 12, 12);
        x.globalAlpha = 0.55; x.drawImage(f.wh, 0, 0, f.w, f.h, 2, 3, 12, 12); x.globalAlpha = 1;
      } else x.drawImage(f.c, 0, 0, f.w, f.h, 2, 3, 12, 12);
    }
    x.beginPath(); x.arc(8, 8, 7, 0, Math.PI * 2);
    x.fillStyle = ghost ? 'rgba(230,251,255,0.18)' : 'rgba(160,230,255,0.22)'; x.fill();
    x.strokeStyle = ghost ? '#e6fbff' : '#bdf0ff'; x.lineWidth = 1; x.stroke();
    x.fillStyle = '#ffffff'; x.fillRect(4 + (i & 1), 3, 2, 2); x.fillRect(3 + (i & 1), 5, 1, 1);
    return finishFrame(c);
  }
  function resized(f, w, h) {
    const c = mk(w, h), x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    if (f) x.drawImage(f.c, 0, 0, f.w, f.h, 0, 0, w, h);
    return finishFrame(c);
  }
  function deriveCharSprites() {
    for (const c of CHAR_IDS) {
      const idle = (k) => frameOf(c + '_idle', k);
      if (!SPR[c + '_trapped'] || !SPR[c + '_trapped'].length) SPR[c + '_trapped'] = [0, 1].map((k) => bubbleWrap(idle(k), false, k));
      if (!SPR[c + '_ghost'] || !SPR[c + '_ghost'].length) SPR[c + '_ghost'] = [0, 1].map((k) => bubbleWrap(idle(k), true, k));
      if (!SPR['life_' + c] || !SPR['life_' + c].length) SPR['life_' + c] = c === 'duck' && SPR.life && SPR.life.length ? SPR.life : [resized(idle(0), 8, 8)];
      if (!SPR['portrait_' + c] || !SPR['portrait_' + c].length) SPR['portrait_' + c] = [resized(idle(0), 32, 32)];
    }
  }
  function fallbackFrame(name, i) {
    const sz = sizeOf(name), w = sz[0], h = sz[1];
    const c = mk(w, h), x = c.getContext('2d');
    const circle = (cx, cy, r, fill, stroke) => { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); if (fill) { x.fillStyle = fill; x.fill(); } if (stroke) { x.strokeStyle = stroke; x.lineWidth = 1; x.stroke(); } };
    const ENEMY_COL = { grime: '#8d7a62', mold: '#69c24a', fly: '#5a5f6e', sponge: '#f0cf4c' };
    const typ = name.split('_')[0];
    if (/^tile_/.test(name)) { const cols = ['#7fd6c2', '#f3a9c0', '#8cc8f0', '#f6dc7c', '#d9d4cc']; x.fillStyle = cols[+name.slice(5) || 0]; x.fillRect(0, 0, 8, 8); x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, 7, 8, 1); x.fillRect(7, 0, 1, 8); x.fillStyle = 'rgba(255,255,255,.4)'; x.fillRect(0, 0, 7, 1); }
    else if (name === 'life') { circle(4, 4, 3.4, '#ffd447', '#3a2a10'); x.fillStyle = '#f08a1c'; x.fillRect(6, 4, 2, 2); }
    else if (ANIMAL_RE.test(name)) animalFallback(x, name, i);
    else if (name === SPR_CROWN) pixelRows(x, ['........', '.#..#..#', '.##.#.##', '.#######', '.#y#y#y#', '.#######', '..#####.', '........'], { '#': '#ffd447', y: '#e0303c' }, '#3a2a10');
    else if (name === SPR_TAG) pixelRows(x, ['#####', '.###.', '..#..'], { '#': '#ffffff' });
    else if (name === SPR_READY) pixelRows(x, ['........', '......##', '.....##.', '#...##..', '##.##...', '.###....', '..#.....', '........'], { '#': '#7fe08f' }, '#14301a');
    // (v4 trophies: the cup's draft rows; a league icon is a disc in its colour)
    else if (name === SPR_CUP) pixelRows(x, i & 1 ? ['.kkkkk..', 'ykLYYyk.', 'ykLYYyk.', '.kYYyk..', '..kYk...', '...y....', '..kYyk..', '.kyyyk..']
      : ['.kkkkkk.', 'ykLLYYky', 'ykLYYYky', '.kYYYyk.', '..kYyk..', '...yy...', '..kYYk..', '.kyyyyk.'], { k: '#1c1530', Y: '#ffd23c', L: '#fff1a6', y: '#e39a1e' });
    else if (name.indexOf(LG_PRE) === 0) { const l = LEAGUES[+name.slice(LG_PRE.length)] || LEAGUES[0]; circle(4, 4, 3.4, l.col, '#1c1530'); }
    else if (name === 'coin') { circle(4, 4, 3.4, '#ff9ec4', '#1c1530'); x.fillStyle = '#ffffff'; x.fillRect(2 + (i & 1), 2, 2, 1); }
    else if (name === 'shop' || name === 'lock') { x.fillStyle = '#1c1530'; x.fillRect(0, 1, 8, 7); x.fillStyle = name === 'shop' ? '#ff9ec4' : '#9aa6ae'; x.fillRect(1, 2, 6, 5); }
    else if (/^duck/.test(name)) { circle(8, 9, 6, '#ffd447', '#3a2a10'); x.fillStyle = '#f08a1c'; x.fillRect(12, 8, 4, 3); x.fillStyle = '#222'; x.fillRect(10, 6, 2, 2); }
    else if (/^boss_/.test(name)) {
      const bc = { grime: '#8d7a62', mold: '#69c24a', sponge: '#f0cf4c', towel: '#3f9a52' }[name.split('_')[1]] || '#999999';
      circle(16, 18, 13, /_hurt$/.test(name) ? '#ffffff' : bc, '#1d1410');
      x.fillStyle = '#fff'; x.fillRect(17, 11, 5, 5); x.fillRect(24, 11, 5, 5); x.fillStyle = '#000'; x.fillRect(19, 12, 2, 3); x.fillRect(26, 12, 2, 3);
    }
    else if (name === 'giant_bubble') { x.strokeStyle = '#bdf0ff'; x.lineWidth = 2; x.beginPath(); x.arc(20, 20, 18, 0, Math.PI * 2); x.stroke(); x.fillStyle = '#ffffff'; x.fillRect(9, 9, 4, 2); x.fillRect(9, 11, 2, 2); }
    else if (name === 'spore') circle(4, 4, 3, '#8fd64c', '#2a4a1a');
    else if (name === 'shockwave') { x.fillStyle = '#d9c9a8'; x.fillRect(1, 4, 14, 4); x.fillStyle = '#ffffff'; x.fillRect(3, 2 + (i & 1), 3, 2); x.fillRect(10, 3 - (i & 1), 3, 2); }
    else if (name === 'scald_drop') {
      if (i === 0) circle(4, 2.5, 2, '#ff8a6a', '#ffffff');
      else { x.fillStyle = '#ff6a4a'; x.beginPath(); x.moveTo(4, 0); x.lineTo(7, 5); x.arc(4, 5, 3, 0, Math.PI); x.closePath(); x.fill(); x.fillStyle = '#ffffff'; x.fillRect(3, 4, 1, 2); }
    }
    else if (name === 'mini_mitt') { x.fillStyle = '#3cc464'; x.fillRect(3, 3, 10, 11); x.fillRect(1, 6, 3, 5); x.fillStyle = '#1b7a3a'; x.fillRect(3, 12, 10, 2); }
    else if (name === 'stamp_bubble') { circle(8, 8, 6.5, 'rgba(160,230,255,.25)', '#bdf0ff'); circle(8, 8.5, 3.6, '#e0303c'); x.fillStyle = '#ffffff'; x.fillRect(4, 4, 2, 2); x.fillRect(7, 7, 2, 2); }
    else if (name === 'stamp') { circle(4, 4, 3.5, '#e0303c', '#7a1018'); x.fillStyle = '#ffd0d0'; x.fillRect(3, 3, 2, 2); }
    else if (name === 'stamp_empty') { circle(4, 4, 3, null, 'rgba(255,160,160,.5)'); }
    else if (name === 'pw_shampoo') { x.fillStyle = '#ff8fb1'; x.fillRect(4, 5, 8, 10); x.fillStyle = '#ffffff'; x.fillRect(6, 1, 4, 4); x.fillRect(5, 8, 6, 3); }
    else if (name === 'pw_slippers') { x.fillStyle = '#4fa3f0'; x.fillRect(1, 10, 14, 4); x.fillStyle = '#2b5fb4'; x.fillRect(4, 6, 7, 4); }
    else if (name === 'pw_bathbomb') { circle(8, 9, 5.5, '#b9a0ff', '#5b3fb8'); x.fillStyle = '#ffffff'; x.fillRect(6, 6, 2, 2); x.fillRect(10, 10, 1, 1); }
    else if (/^water_/.test(name)) {
      const hot = /hot/.test(name);
      x.fillStyle = hot ? '#e8708e' : '#4fb0e6'; x.fillRect(0, 0, 8, 8);
      if (/_top$/.test(name)) { x.fillStyle = hot ? '#ffc6d3' : '#c9f1ff'; for (let k = 0; k < 8; k++) x.fillRect(k, ((k + i * 2) >> 1) & 1, 1, 1); }
    }
    else if (name === 'ice_block') { x.fillStyle = '#c4f2ff'; x.fillRect(0, 0, 16, 16); x.fillStyle = '#86d6f0'; x.fillRect(0, 13, 16, 3); x.fillRect(13, 0, 3, 16); x.fillStyle = '#ffffff'; x.fillRect(2, 2, 6, 2); x.fillRect(2, 4, 2, 3); }
    else if (name === 'drain') { x.fillStyle = '#1c2427'; x.fillRect(0, 0, 8, 8); x.fillStyle = '#8c98a0'; for (let k = 1; k < 8; k += 3) x.fillRect(k, 1, 1, 7); x.fillRect(0, 0, 8, 1); }
    else if (name === 'shower') { x.fillStyle = '#9aa6ae'; x.fillRect(0, 0, 16, 7); x.fillStyle = '#5a646c'; for (let k = 2; k < 16; k += 4) x.fillRect(k, 5, 1, 1); x.fillStyle = '#d8e0e4'; x.fillRect(0, 0, 16, 1); }
    else if (/^bubble|^steam_bubble/.test(name)) { circle(8, 8, 6.5, 'rgba(160,230,255,.25)', '#bdf0ff'); x.fillStyle = '#fff'; x.fillRect(4, 4, 2, 2); if (name === 'steam_bubble') { x.fillStyle = '#fff'; x.fillRect(6, 7, 5, 2); } }
    else if (name === 'steam_bolt') { circle(5, 8, 4, '#ffffff'); circle(11, 8, 3.5, '#e8f6f6'); }
    else if (ENEMY_COL[typ]) {
      if (/_trapped$/.test(name)) { circle(8, 8, 6.5, 'rgba(160,230,255,.25)', '#bdf0ff'); circle(8, 9, 3.5, ENEMY_COL[typ]); }
      else { circle(8, 10, 5.5, /_angry$/.test(name) ? '#e0504a' : ENEMY_COL[typ], '#1d1410'); x.fillStyle = '#fff'; x.fillRect(9, 8, 2, 2); }
    } else if (/^item_/.test(name)) { circle(8, 9, 5, '#ff9b3d', '#3a1d10'); x.fillStyle = '#5bbf4a'; x.fillRect(7, 3, 3, 2); }
    else { x.fillStyle = '#f0f'; x.fillRect(4, 4, Math.max(1, w - 8), Math.max(1, h - 8)); }
    if (i % 2 === 1) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(0, 0, w, h); }
    return finishFrame(c);
  }
  function tintFrame(f, color, alpha) {
    const c = mk(f.w, f.h), x = c.getContext('2d');
    x.drawImage(f.c, 0, 0);
    x.globalCompositeOperation = 'source-atop'; x.globalAlpha = alpha; x.fillStyle = color; x.fillRect(0, 0, f.w, f.h);
    return finishFrame(c);
  }
  function derive(dst, src, color, alpha) {
    if (SPR[dst] && SPR[dst].length) return;
    const s = SPR[src]; if (!s || !s.length) return;
    SPR[dst] = s.map((f) => tintFrame(f, color, alpha));
  }
  function bakeSprites() {
    const pal = PG.PALETTE || {}, rgb = {};
    for (const k in pal) rgb[k] = hexRgba(pal[k]);
    const src = PG.SPRITES || {};
    for (const name in src) {
      const frames = src[name];
      if (!Array.isArray(frames)) continue;
      // tolerate a single frame given directly as an array of strings
      const list = frames.length && typeof frames[0] === 'string' && frames.every((r) => typeof r === 'string') && frames.length > 4 ? [frames] : frames;
      const baked = [];
      for (const f of list) { try { const b = bakeFrame(f, rgb); if (b) baked.push(b); } catch (e) { /* skip bad frame */ } }
      if (baked.length) SPR[name] = baked;
    }
    for (const name in OPT_SPR) {
      const sz = sizeOf(name), ok = (SPR[name] || []).filter((f) => f.w === sz[0] && f.h === sz[1]);
      if (ok.length) SPR[name] = ok; else delete SPR[name];
    }
    for (const name in REQUIRED) {
      if (/_soaked$/.test(name)) continue; // derived below from the walk frames when the art is missing
      if (!SPR[name] || !SPR[name].length) {
        SPR[name] = [];
        for (let i = 0; i < REQUIRED[name]; i++) { const f = fallbackFrame(name, i); f.fb = true; SPR[name].push(f); } // (fb: a stand-in - never wears items)
      }
    }
    // soaked / frozen looks: the art's own frames when present, otherwise tinted walk / trapped frames
    for (const t of ENEMY_TYPES) {
      derive(t + '_soaked', t + '_walk', '#ff6fa8', 0.42);
      derive(t + '_trapped_soaked', t + '_trapped', '#ff6fa8', 0.3);
      derive(t + '_frozen', t + '_walk', '#a8ecff', 0.5);
    }
    deriveCharSprites();
  }
  // per-player looks, cached per frame: the slot ring, the twin colour, slot-tinted bubbles
  const lookCache = new WeakMap();
  function lookOf(f, key, make) {
    let m = lookCache.get(f); if (!m) { m = new Map(); lookCache.set(f, m); }
    let v = m.get(key); if (!v) { v = make(); m.set(key, v); }
    return v;
  }
  // the ink-ringed slot outline (distinction §2.3): from the inside out the art's own ink edge, a solid 1 px band in
  // the slot colour (8-connected: corners too), then a 1 px band of SLOT_INK (the 12-offset 2 px dilation, so its own
  // corners are rounded). It reads on every tile theme - the slot colours are pastels like the tiles, the ink is not.
  // A (w + 4) x (h + 4) canvas drawn at (X - 2, Y - 2), traced from the frame drawEnt is about to draw (after the twin
  // recolour and, from shop.md S2, the worn items), so body and hat get one band
  const RING_INK = [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]];
  const RING_SLOT = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  function ringOf(f, flip, color) {
    return lookOf(f, 'r' + (flip ? 1 : 0) + color, () => {
      const sil = (col) => { const s = mk(f.w, f.h), sx = s.getContext('2d'); sx.drawImage(flip ? f.whm : f.wh, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = col; sx.fillRect(0, 0, f.w, f.h); return s; };
      const ink = sil(SLOT_INK), band = sil(color);
      const c = mk(f.w + 4, f.h + 4), x = c.getContext('2d');
      for (const [ox, oy] of RING_INK) x.drawImage(ink, 2 + ox, 2 + oy);
      for (const [ox, oy] of RING_SLOT) x.drawImage(band, 2 + ox, 2 + oy);
      return c;
    });
  }
  // ---- twin colour (distinction §2.5): a later copy of an animal (a lower seat already has it) gets its body keys -
  // PG.TWIN_KEYS[animal] {key: ramp role}, from sprites.js - swapped for its own slot's ramp, by exact pixel match on
  // the baked frame (no two palette keys share a value: check-sprites asserts it). Eyes, beaks, cheeks, ink and props
  // keep their colours. Runs on the bare body frame, BEFORE shop.md's worn items are composited onto it
  const TWIN_RE = /^(?:life_|portrait_)?(duck|capy|otter|penguin|cat|frog)(?:_|$)/;
  const twinMaps = new Map();
  // the swap table of an animal for a slot: Map(0xRRGGBB -> [r, g, b]); null = nothing to swap (no keys for it)
  function twinMap(c, slot) {
    const id = c + slot; if (twinMaps.has(id)) return twinMaps.get(id);
    const keys = (PG.TWIN_KEYS && typeof PG.TWIN_KEYS === 'object' && Object.prototype.hasOwnProperty.call(PG.TWIN_KEYS, c)) ? PG.TWIN_KEYS[c] : null;
    const ramp = SLOT_RAMP[slot], pal = PG.PALETTE || {};
    let m = null;
    if (keys && ramp && slot > 0) {
      m = new Map();
      for (const k in keys) {
        const from = pal[k], to = ramp[keys[k] | 0];
        if (typeof from !== 'string' || !to) continue;
        const a = hexRgba(from), b = hexRgba(to);
        m.set((a[0] << 16) | (a[1] << 8) | a[2], [b[0], b[1], b[2]]);
      }
      if (!m.size) m = null;
    }
    twinMaps.set(id, m);
    return m;
  }
  // (the pixels are read back from a scratch canvas, never from the new frame: a canvas read back is kept in a slower
  // CPU mode by the browser, and the twin frames are drawn every frame)
  function recolourFrame(f, map) {
    const r = mk(f.w, f.h), rx = r.getContext('2d', { willReadFrequently: true });
    rx.drawImage(f.c, 0, 0);
    const id = rx.getImageData(0, 0, f.w, f.h), d = id.data;
    for (let o = 0; o < d.length; o += 4) {
      if (!d[o + 3]) continue;
      const to = map.get((d[o] << 16) | (d[o + 1] << 8) | d[o + 2]);
      if (to) { d[o] = to[0]; d[o + 1] = to[1]; d[o + 2] = to[2]; }
    }
    const c = mk(f.w, f.h); c.getContext('2d').putImageData(id, 0, 0);
    return finishFrame(c);
  }
  // frame f of sprite `name` (a body pose, life_<animal> or portrait_<animal>) as the twin of seat `slot` (cached per
  // frame object); f itself for slot 0 / an animal without twin keys / any other sprite
  // (cached per frame object as [_, slot 1, slot 2, slot 3]: a drawn frame costs one WeakMap lookup)
  const twinCache = new WeakMap();
  function twinFrame(f, name, slot) {
    if (!f || !(slot > 0)) return f;
    let a = twinCache.get(f); if (!a) { a = []; twinCache.set(f, a); }
    let v = a[slot];
    if (v === undefined) {
      const m = TWIN_RE.exec(name), map = m ? twinMap(m[1], slot | 0) : null;
      v = a[slot] = map ? recolourFrame(f, map) : f;
    }
    return v;
  }
  function tintOf(f, color, alpha) { return lookOf(f, 't' + color + alpha, () => tintFrame(f, color, alpha)); }
  function frameOf(name, i) {
    const fr = SPR[name]; if (!fr || !fr.length) return null;
    const n = fr.length; return fr[(((i | 0) % n) + n) % n];
  }
  // ---- v4 shop: worn items in play (design/shop.md 6.1-6.8). A worn set lk is 5 digits (머리 얼굴 목 등 효과, '0' =
  // nothing); the first four are art composited onto the body, the fifth is particles (lookFx). Per body frame and set,
  // one 24x24 composite with the body at (4, 8) - drawEnt centres and bottom-aligns it, so the body lands exactly where
  // the bare 16x16 frame did and flip, squash, bob, the penguin's dy, the white flash, tints and the slot ring all work
  // on it unchanged. Order (the joint contract with distinction §2.12): the twin recolour of the body first (drawEnt),
  // then a 등 item behind (B, or a tube's back half at W), the body, the hat's hide box cleared (the capy's yuzu, the
  // cat's ears), a tube's front half, 목 at N, 얼굴 at E (front faces: the 2-lens frame), 머리 at H - items are never
  // recoloured, and the ring traces the result. Anchors are data in sprites.js (PG.ANCHORS); a frame without them (die,
  // trapped, ghost, life, portraits, a stand-in, a turned fallback pose) draws bare - never a guessed position
  const LOOK_W = 24, LOOK_H = 24, LOOK_X = 4, LOOK_Y = 8;
  const LOOK = { bare: false };   // (PG.debug.shop.bare: everyone drawn without items on this screen - comparison shots)
  const lookOn = (lk) => !LOOK.bare && typeof lk === 'string' && lk.length === 5 && lk !== LOOK0;
  const ownKey = (o, k) => !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
  const ANIM_RE = /^(duck|capy|otter|penguin|cat|frog)_/;
  // the anchors of sprite `name` frame fi: {face 'p' | 'f', H, E, N, B, W ([x, y] in the frame's pixels, or null), hide
  // ([x0, y0, x1, y1] or null)} or null. PG.ANCHORS[animal].off[name][j] is [dx, dy] added to the base points (and the
  // hide box), or a full 10-number array (-1, -1 = no such point) that may carry its own hide box (else the base one,
  // unmoved) - exactly tools/anchors.js. j is the frame frameOf draws; cached per (name, j)
  const anchCache = new Map();
  function anchorsOf(name, fi) {
    const fr = typeof name === 'string' ? SPR[name] : null, m = fr && fr.length ? ANIM_RE.exec(name) : null; if (!m) return null;
    const j = (((fi | 0) % fr.length) + fr.length) % fr.length, key = name + '|' + j;
    if (anchCache.has(key)) return anchCache.get(key);
    const D = ownKey(PG.ANCHORS, m[1]) ? PG.ANCHORS[m[1]] : null, list = D && ownKey(D.off, name) && Array.isArray(D.off[name]) ? D.off[name] : null, o = list ? list[j] : null;
    const ints = (a, n) => Array.isArray(a) && a.length >= n && a.slice(0, n).every((v) => Number.isInteger(v));
    let A = null;
    if (!fr[j].fb && ints(D && D.base, 10) && ((ints(o, 2) && o.length === 2) || ints(o, 10))) {
      let pts, hide = ints(D.hide, 4) ? D.hide.slice(0, 4) : null;
      if (o.length === 2) { pts = D.base.slice(0, 10).map((v, i) => v + o[i & 1]); if (hide) hide = [hide[0] + o[0], hide[1] + o[1], hide[2] + o[0], hide[3] + o[1]]; }
      else { pts = o.slice(0, 10); if (ints(o, 14)) hide = o.slice(10, 14); }
      const pt = (i) => (pts[i] === -1 && pts[i + 1] === -1 ? null : [pts[i], pts[i + 1]]);
      A = { face: D.face === 'f' ? 'f' : 'p', H: pt(0), E: pt(2), N: pt(4), B: pt(6), W: pt(8), hide };
    }
    anchCache.set(key, A);
    return A;
  }
  // item `id`'s art, frame `part` (얼굴: 0 profile / 1 front; a tube: 0 back half / 1 front half): {c, m, w, h, px, py}
  // with its pivot (PG.ITEM_PIVOT: the item pixel that lands ON the anchor pixel), or null (no art: draws nothing)
  function itemFrame(id, part) {
    const fr = isItemId(id) ? SPR['it_' + id] : null, pv = fr && ownKey(PG.ITEM_PIVOT, id) ? PG.ITEM_PIVOT[id] : null;
    if (!fr || !fr.length || !Array.isArray(pv)) return null;
    const p = Array.isArray(pv[0]) ? pv[Math.min(part | 0, pv.length - 1)] : pv;
    if (!Array.isArray(p) || !Number.isInteger(p[0]) || !Number.isInteger(p[1])) return null;
    const f = fr[Math.min(part | 0, fr.length - 1)];
    return { c: f.c, m: f.m, w: f.w, h: f.h, px: p[0], py: p[1] };
  }
  // the worn item of slot i (0 머리 .. 3 등) in a worn set, '' for none
  const lookId = (lk, i) => { const id = lk[i] && lk[i] !== '0' ? LOOK_SLOTS[i] + lk[i] : ''; return isItemId(id) ? id : ''; };
  // the first opaque row of a frame (read from a scratch copy: a canvas that is drawn every frame is never read back),
  // cached; 99 for an empty frame
  const topCache = new WeakMap();
  function opaqueTop(f) {
    let v = topCache.get(f); if (v !== undefined) return v;
    const s = mk(f.w, f.h), sx = s.getContext('2d', { willReadFrequently: true }); sx.drawImage(f.c, 0, 0);
    const d = sx.getImageData(0, 0, f.w, f.h).data; v = 99;
    for (let o = 3; o < d.length; o += 4) if (d[o]) { v = ((o >> 2) / f.w) | 0; break; }
    topCache.set(f, v); return v;
  }
  // body frame f (sprite `name`, frame fi; twin-recoloured already) wearing lk: the composite (cached per frame object
  // and worn digits - a twin body and a natural one each get their own; a frame's cache is emptied past 24 looks, a
  // player trying everything in the 상점), or f itself (nothing worn, no anchors: zero cost for bare players)
  // (keyed by the whole worn set - it is frozen per player, so no string is built per frame - and a frame that wears
  // nothing caches itself)
  const lookComps = new WeakMap();
  function lookFrame(f, name, fi, lk) {
    if (!f || !lookOn(lk)) return f;
    let m = lookComps.get(f); if (!m) { m = new Map(); lookComps.set(f, m); }
    let v = m.get(lk);
    if (!v) {
      const k = lk.slice(0, 4), A = k === '0000' ? null : anchorsOf(name, fi);
      if (m.size >= 24) m.clear();
      if (!A) { m.set(lk, f); return f; }
      const c = mk(LOOK_W, LOOK_H), x = c.getContext('2d'); x.imageSmoothingEnabled = false;
      const put = (id, part, P) => { const it = P ? itemFrame(id, part) : null; if (it) x.drawImage(it.c, LOOK_X + P[0] - it.px, LOOK_Y + P[1] - it.py); };
      const hat = lookId(k, 0), face = lookId(k, 1), neck = lookId(k, 2), back = lookId(k, 3), tube = !!back && ITEM[back].at === 'W';
      if (back) put(back, 0, tube ? A.W : A.B);                                 // behind: capes / wings / shells, a tube's back half
      x.drawImage(f.c, LOOK_X, LOOK_Y);
      if (hat && A.hide && A.H && itemFrame(hat, 0)) x.clearRect(LOOK_X + A.hide[0], LOOK_Y + A.hide[1], A.hide[2] - A.hide[0] + 1, A.hide[3] - A.hide[1] + 1);
      if (tube) put(back, 1, A.W);                                               // a tube's front half
      if (neck) put(neck, 0, A.N);
      if (face) put(face, A.face === 'f' ? 1 : 0, A.E);
      if (hat) put(hat, 0, A.H);
      v = finishFrame(c); m.set(lk, v);
    }
    return v;
  }
  // (6.6) how far marks above the head lift for a worn set: the px its composite reaches above the frame top in the
  // animal's idle frame 0, minus 1, floored at 0 (per animal and set, so a tag never jitters with the poses)
  // (lookReach: the px themselves, <= 0 when nothing rises above the frame; -99 bare)
  const liftCache = new Map();   // (animal -> worn set -> px: headTop asks every frame, so no string is built)
  function lookReach(c, lk) {
    if (!lookOn(lk)) return -99;
    let m = liftCache.get(c); if (!m) { if (!isChar(c)) return -99; m = new Map(); liftCache.set(c, m); }
    let v = m.get(lk);
    if (v === undefined) {
      const name = c + '_idle', f = frameOf(name, 0), L = lookFrame(f, name, 0, lk);
      v = L && L !== f ? LOOK_Y - opaqueTop(L) : -99;
      m.set(lk, v);
    }
    return v;
  }
  const lookLift = (c, lk) => Math.max(0, lookReach(c, lk) - 1);
  // (6.8) the 32x32 portrait of animal c wearing lk's 머리 / 얼굴 / 목 at 2x on the bust's own anchors (port: [Hx, Hy, Ex,
  // Ey, Nx, Ny]; an item's pivot pixel becomes a 2x2 block whose top-left is the anchor), the bust twin-recoloured first
  // (tw: the seat, distinction §2.10). A hat clears porthide (the capy's yuzu, the cat's ears); an item rising above row 0
  // drops the bust dy = min(8, that) px (its bottom rows cropped). Cached per (bust, the three digits)
  function lookPortrait(c, lk, tw) {
    const name = 'portrait_' + c, f0 = frameOf(name, 0); if (!f0) return null;
    const bust = tw > 0 ? twinFrame(f0, name, tw) : f0;
    if (!lookOn(lk) || lk.slice(0, 3) === '000') return bust;
    const D = ownKey(PG.ANCHORS, c) ? PG.ANCHORS[c] : null, P = D && Array.isArray(D.port) && D.port.length >= 6 && D.port.slice(0, 6).every((v) => Number.isInteger(v)) ? D.port : null;
    if (!P || bust.w !== 32 || bust.h !== 32) return bust;
    const k = 'P' + lk.slice(0, 3);
    let m = lookComps.get(bust); if (!m) { m = new Map(); lookComps.set(bust, m); }
    let v = m.get(k);
    if (!v) {
      if (m.size >= 24) m.clear();
      const parts = [];                                                          // [item frame, anchor] in drawing order: 목, 얼굴, 머리
      const add = (id, part, i) => { const it = id ? itemFrame(id, part) : null; if (it) parts.push([it, [P[i * 2], P[i * 2 + 1]]]); };
      const hat = lookId(lk, 0);
      add(lookId(lk, 2), 0, 2); add(lookId(lk, 1), D.face === 'f' ? 1 : 0, 1); add(hat, 0, 0);
      let need = 0;
      for (const [it, Q] of parts) { const t = opaqueTop(it); if (t < 99) need = Math.max(need, -(Q[1] - 2 * it.py + 2 * t)); }
      const dy = Math.min(8, need), cv = mk(32, 32), x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
      x.drawImage(bust.c, 0, dy);
      const ph = D.porthide;
      if (hat && itemFrame(hat, 0) && Array.isArray(ph) && ph.length >= 4 && ph.slice(0, 4).every((q) => Number.isInteger(q))) x.clearRect(ph[0], ph[1] + dy, ph[2] - ph[0] + 1, ph[3] - ph[1] + 1);
      for (const [it, Q] of parts) x.drawImage(it.c, 0, 0, it.w, it.h, Q[0] - 2 * it.px, Q[1] + dy - 2 * it.py, it.w * 2, it.h * 2);
      v = finishFrame(cv); m.set(k, v);
    }
    return v;
  }

  // ------------------------------------------------------------------ bitmap font (5x7)
  const FONT_SRC = {
    '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.', '1': '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
    '2': '.###.|#...#|....#|...#.|..#..|.#...|#####', '3': '#####|...#.|..#..|...#.|....#|#...#|.###.',
    '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.', '5': '#####|#....|####.|....#|....#|#...#|.###.',
    '6': '..##.|.#...|#....|####.|#...#|#...#|.###.', '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
    '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.', '9': '.###.|#...#|#...#|.####|....#|...#.|.##..',
    'A': '.###.|#...#|#...#|#####|#...#|#...#|#...#', 'B': '####.|#...#|#...#|####.|#...#|#...#|####.',
    'C': '.###.|#...#|#....|#....|#....|#...#|.###.', 'D': '###..|#..#.|#...#|#...#|#...#|#..#.|###..',
    'E': '#####|#....|#....|####.|#....|#....|#####', 'F': '#####|#....|#....|####.|#....|#....|#....',
    'G': '.###.|#...#|#....|#.###|#...#|#...#|.####', 'H': '#...#|#...#|#...#|#####|#...#|#...#|#...#',
    'I': '.###.|..#..|..#..|..#..|..#..|..#..|.###.', 'J': '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
    'K': '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#', 'L': '#....|#....|#....|#....|#....|#....|#####',
    'M': '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#', 'N': '#...#|#...#|##..#|#.#.#|#..##|#...#|#...#',
    'O': '.###.|#...#|#...#|#...#|#...#|#...#|.###.', 'P': '####.|#...#|#...#|####.|#....|#....|#....',
    'Q': '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#', 'R': '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
    'S': '.####|#....|#....|.###.|....#|....#|####.', 'T': '#####|..#..|..#..|..#..|..#..|..#..|..#..',
    'U': '#...#|#...#|#...#|#...#|#...#|#...#|.###.', 'V': '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
    'W': '#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.', 'X': '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
    'Y': '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..', 'Z': '#####|....#|...#.|..#..|.#...|#....|#####',
    '-': '.....|.....|.....|.###.|.....|.....|.....', 'x': '.....|.....|#...#|.#.#.|..#..|.#.#.|#...#',
    '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..', ':': '.....|..#..|.....|.....|.....|..#..|.....',
    '.': '.....|.....|.....|.....|.....|.....|..#..', '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
    '/': '....#|...#.|...#.|..#..|.#...|.#...|#....', ' ': '.....|.....|.....|.....|.....|.....|.....',
  };
  const FONT_CHARS = Object.keys(FONT_SRC);
  const FONT_IDX = {}; FONT_CHARS.forEach((ch, i) => { FONT_IDX[ch] = i; });
  const fontCache = {};
  function fontAtlas(color) {
    if (fontCache[color]) return fontCache[color];
    const c = mk(FONT_CHARS.length * 6, 7), x = c.getContext('2d'); x.fillStyle = color;
    FONT_CHARS.forEach((ch, i) => { const rows = FONT_SRC[ch].split('|'); for (let r = 0; r < 7; r++) for (let k = 0; k < 5; k++) if (rows[r][k] === '#') x.fillRect(i * 6 + k, r, 1, 1); });
    fontCache[color] = c; return c;
  }
  function textW(str, sc) { return str.length * 6 * sc - sc; }
  function drawGlyphs(c, str, x, y, sc) {
    for (let i = 0; i < str.length; i++) {
      let ch = str[i]; if (FONT_IDX[ch] === undefined) ch = ch.toUpperCase(); const gi = FONT_IDX[ch]; if (gi === undefined) continue;
      ctx.drawImage(c, gi * 6, 0, 5, 7, x + i * 6 * sc, y, 5 * sc, 7 * sc);
    }
  }
  function text(str, x, y, color, o) {
    o = o || {}; str = String(str); const sc = o.scale || 1;
    const w = textW(str, sc);
    if (o.align === 'center') x -= Math.floor(w / 2); else if (o.align === 'right') x -= w;
    x = Math.round(x); y = Math.round(y);
    if (o.outline) { const oc = fontAtlas(o.outline); for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) drawGlyphs(oc, str, x + dx, y + dy, sc); }
    if (o.shadow) drawGlyphs(fontAtlas(o.shadow), str, x, y + sc, sc);
    drawGlyphs(fontAtlas(color), str, x, y, sc);
  }

  // ------------------------------------------------------------------ levels & themes
  const FALLBACK_THEMES = [
    { name: '민트', bg: '#0f3135', bgTile: '#13393d', grout: '#0b272a', tile: 'tile_0' },
    { name: '분홍', bg: '#2c1c28', bgTile: '#332130', grout: '#22151f', tile: 'tile_1' },
    { name: '하늘', bg: '#13263a', bgTile: '#172c43', grout: '#0e1d2d', tile: 'tile_2' },
    { name: '버터', bg: '#2d2814', bgTile: '#342e18', grout: '#231f0f', tile: 'tile_3' },
    { name: '대리석', bg: '#22252b', bgTile: '#282c33', grout: '#1a1c21', tile: 'tile_4' },
  ];
  function themeOf(L) {
    const th = (Array.isArray(PG.THEMES) && PG.THEMES.length ? PG.THEMES : FALLBACK_THEMES);
    const t = th[clamp(L.theme | 0, 0, th.length - 1)] || FALLBACK_THEMES[0];
    const fb = FALLBACK_THEMES[clamp(L.theme | 0, 0, 4)];
    return { bg: t.bg || fb.bg, bgTile: t.bgTile || fb.bgTile, grout: t.grout || fb.grout, tile: SPR[t.tile] ? t.tile : 'tile_' + clamp(L.theme | 0, 0, 4) };
  }
  function fallbackLevel() {
    const map = [];
    for (let r = 0; r < ROWS; r++) {
      let s = '##' + '.'.repeat(28) + '##';
      if (r === 0 || r === ROWS - 1) s = '##' + '#'.repeat(12) + '....' + '#'.repeat(12) + '##';
      if (r === 7 || r === 13 || r === 19) s = '##' + '....' + '#'.repeat(8) + '....' + '#'.repeat(8) + '....' + '##';
      map.push(s);
    }
    return { name: '연습 탕', theme: 0, map, player: { col: 3, row: 24 }, gather: { col: 15, row: 3 },
      enemies: [{ type: 'grime', col: 9, row: 18, dir: 1 }, { type: 'mold', col: 22, row: 12, dir: -1 }, { type: 'fly', col: 15, row: 9, dir: 1 }] };
  }
  const isLiquid = (ch) => ch === '~' || ch === '=';
  function normLevel(L, idx) {
    L = L && typeof L === 'object' ? L : {};
    let map = Array.isArray(L.map) ? L.map.slice(0, ROWS).map(String) : [];
    while (map.length < ROWS) map.push('');
    map = map.map((row, r) => {
      const a = row.slice(0, COLS).padEnd(COLS, '.').split('').map((ch) => (ch === '#' ? '#' : isLiquid(ch) && r > 0 && r < ROWS - 1 ? ch : '.'));
      a[0] = a[1] = a[COLS - 2] = a[COLS - 1] = '#';
      return a.join('');
    });
    // liquid has to rest on liquid or a block (bottom-up, so dropping a cell also drops what sat on it)
    for (let r = ROWS - 2; r >= 1; r--) {
      if (!/[~=]/.test(map[r])) continue;
      const a = map[r].split('');
      for (let c = 2; c < COLS - 2; c++) if (isLiquid(a[c]) && map[r + 1][c] === '.') a[c] = '.';
      map[r] = a.join('');
    }
    let gap = [];
    for (let c = 2; c < COLS - 2; c++) if (map[ROWS - 1][c] === '.') gap.push(c);
    if (!gap.length) {
      for (const r of [0, ROWS - 1]) { const a = map[r].split(''); for (let c = 14; c <= 17; c++) a[c] = '.'; map[r] = a.join(''); }
      gap = [14, 15, 16, 17];
    }
    const okCell = (s) => s && isFinite(s.col) && isFinite(s.row);
    const pl0 = okCell(L.player) ? L.player : Array.isArray(L.players) && okCell(L.players[0]) ? L.players[0] : { col: 3, row: 24 };
    const ga = L.gather && isFinite(L.gather.col) ? L.gather : { col: 15, row: 3 };
    const enemies = (Array.isArray(L.enemies) ? L.enemies : []).filter((e) => e && isFinite(e.col) && isFinite(e.row));
    const player = { col: clamp(pl0.col | 0, 2, 29), row: clamp(pl0.row | 0, 1, 24) };
    // v3: four player spawns (P1 = the classic spawn); missing ones are found on nearby solid ground
    const given = (Array.isArray(L.players) ? L.players : []).map((s) => (okCell(s) ? { col: clamp(s.col | 0, 2, 29), row: clamp(s.row | 0, 1, 24) } : null));
    const players = [player];
    for (let k = 1; k < MAX_PLAYERS; k++) players.push(given[k] || null);
    fillSpawns(map, players, enemies);
    const es = (Array.isArray(L.enemySpawns) ? L.enemySpawns : []).filter(okCell).map((s) => ({ col: clamp(s.col | 0, 2, 29), row: clamp(s.row | 0, 1, 24) }));
    return {
      name: typeof L.name === 'string' && L.name ? L.name : (idx + 1) + '번 탕',
      theme: clamp(L.theme | 0, 0, 4), map,
      player, players,
      gather: { col: clamp(ga.col | 0, 2, 29), row: clamp(ga.row | 0, 1, 23) },
      enemies, special: L.special,
      // boss rounds: the boss type and the top-left cell of its 4x4-cell body
      boss: typeof L.boss === 'string' ? L.boss : null,
      bossSpawn: L.bossSpawn && isFinite(L.bossSpawn.col) && isFinite(L.bossSpawn.row) ? { col: L.bossSpawn.col | 0, row: L.bossSpawn.row | 0 } : null,
      gapX: ((gap[0] + gap[gap.length - 1] + 1) / 2) * TS,
      // battle arenas: where the grime family (re)spawns
      enemySpawns: es.length ? es : enemies.map((e) => ({ col: clamp(e.col | 0, 2, 29), row: clamp(e.row | 0, 1, 24) })),
      arena: !!L.arena,
    };
  }
  // a cell a 16x16 body can stand in: open (and not water) here and above, a block (with open space over it) below
  function standCell(map, c, r) {
    if (c < 2 || c > COLS - 3 || r < 2 || r > ROWS - 2) return false;
    const open = (cc, rr) => map[rr][cc] === '.';
    return open(c, r) && open(c, r - 1) && map[r + 1][c] === '#' && (open(c - 1, r) || open(c + 1, r));
  }
  // fill the null entries of `spawns` with standing cells near P1: same shelf first, at least 2 columns from
  // every other spawn and clear of the enemies' starting spots
  function fillSpawns(map, spawns, enemies) {
    const p1 = spawns[0];
    for (let k = 1; k < spawns.length; k++) {
      if (spawns[k]) continue;
      let best = null, bestScore = 1e9;
      for (let r = 2; r < ROWS - 1; r++) for (let c = 2; c < COLS - 2; c++) {
        if (!standCell(map, c, r)) continue;
        if (spawns.some((s) => s && s.row === r && Math.abs(s.col - c) < 3) || spawns.some((s) => s && s.col === c && s.row === r)) continue;
        if (enemies.some((e) => Math.abs(e.col - c) <= 3 && Math.abs(e.row - r) <= 2)) continue;
        const score = Math.abs(c - p1.col) + Math.abs(r - p1.row) * 4 + (c < p1.col ? 0.5 : 0);
        if (score < bestScore) { bestScore = score; best = { col: c, row: r }; }
      }
      spawns[k] = best || { col: p1.col, row: p1.row };
    }
    return spawns;
  }
  let LEVELS = [];
  function loadLevels() {
    const src = Array.isArray(PG.LEVELS) && PG.LEVELS.length ? PG.LEVELS : [fallbackLevel()];
    LEVELS = src.map((L, i) => { try { return normLevel(L, i); } catch (e) { return normLevel(fallbackLevel(), i); } });
    loadArenas();
  }
  // ---- battle arenas (PG.ARENAS from levels.js; a built-in one while that data is missing)
  function fallbackArena() {
    const map = [];
    for (let r = 0; r < ROWS; r++) {
      let s = '##' + '.'.repeat(28) + '##';
      if (r === 0 || r === ROWS - 1) s = '##' + '#'.repeat(12) + '....' + '#'.repeat(12) + '##';
      if (r === 21 || r === 13) s = '##....########....########....##';
      if (r === 17 || r === 9) s = '#######' + '.'.repeat(18) + '#######';
      if (r === 5) s = '##.......##############.......##';
      map.push(s);
    }
    return { name: '대중탕 한판', theme: 2, map, gather: { col: 15, row: 3 },
      players: [{ col: 4, row: 24 }, { col: 27, row: 24 }, { col: 4, row: 16 }, { col: 27, row: 16 }],
      enemySpawns: [{ col: 9, row: 20 }, { col: 22, row: 20 }, { col: 9, row: 12 }, { col: 22, row: 12 }, { col: 12, row: 4 }, { col: 19, row: 4 }] };
  }
  let ARENAS = [];
  function loadArenas() {
    const src = Array.isArray(PG.ARENAS) && PG.ARENAS.length ? PG.ARENAS : [fallbackArena()];
    ARENAS = src.map((A, i) => {
      const base = A && typeof A === 'object' ? A : fallbackArena();
      try { return normLevel(Object.assign({}, base, { arena: true, enemies: [], boss: null, special: undefined }), i); } catch (e) { return normLevel(Object.assign(fallbackArena(), { arena: true }), i); }
    });
  }

  // ------------------------------------------------------------------ map + water queries
  let LV = null, MAP = null;
  // WATER[i]: 0 none, 1 hot (온탕), 2 cold (냉탕); SURF[i]: row of that pool column's surface; ICE_TOP: ice-block tops
  const WATER = new Uint8Array(ROWS * COLS), SURF = new Uint8Array(ROWS * COLS), ICE_TOP = new Uint8Array(ROWS * COLS);
  let waterCells = [];
  function buildWater(map) {
    WATER.fill(0); SURF.fill(0); ICE_TOP.fill(0); waterCells = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = map[r][c], k = ch === '~' ? 1 : ch === '=' ? 2 : 0;
      if (!k) continue;
      const i = r * COLS + c;
      WATER[i] = k;
      SURF[i] = r > 0 && WATER[i - COLS] ? SURF[i - COLS] : r;
      waterCells.push({ c, r, k, top: SURF[i] === r });
    }
  }
  function waterIdx(x, y) {
    const c = Math.floor(x / TS), r = Math.floor((y - PF_TOP) / TS);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return -1;
    const i = r * COLS + c; return WATER[i] ? i : -1;
  }
  const surfY = (i) => PF_TOP + SURF[i] * TS;
  function solidCell(col, row) {
    if (col < 0 || col >= COLS) return true;
    row = ((row % ROWS) + ROWS) % ROWS;
    return MAP[row].charCodeAt(col) === 35;
  }
  function iceTop(col, row) { return col >= 0 && col < COLS && row >= 0 && row < ROWS && ICE_TOP[row * COLS + col] === 1; }
  // First platform top crossed by feet moving down from f0 to f1 (one-way landing).
  // Only exposed tops inside the map count: rows past the floor are left to wrapY (no wrapping to the
  // ceiling row here, which used to act as an invisible second floor 8 px down inside narrow gaps),
  // and a tile with another tile directly above it is not a landing surface (no resting inside pillars).
  // Ice blocks floating on cold water are one-way platforms too.
  // `skip` (optional) is a row a boss is dropping down through.
  function landTile(x0, x1, f0, f1, skip) {
    const r0 = Math.max(0, Math.ceil((f0 - PF_TOP) / TS - 1e-6)), r1 = Math.min(ROWS - 1, Math.floor((f1 - PF_TOP) / TS));
    const c0 = Math.max(2, Math.floor(x0 / TS)), c1 = Math.min(COLS - 3, Math.floor((x1 - 0.001) / TS));
    for (let r = r0; r <= r1; r++) {
      if (r === skip) continue;
      for (let c = c0; c <= c1; c++) if ((solidCell(c, r) && !solidCell(c, r - 1)) || ICE_TOP[r * COLS + c] === 1) return PF_TOP + r * TS;
    }
    return null;
  }
  function ceilingAt(x0, x1) {
    const c0 = Math.floor(x0 / TS), c1 = Math.floor((x1 - 0.001) / TS);
    for (let c = c0; c <= c1; c++) if (MAP[0].charCodeAt(c) === 35) return true;
    return false;
  }
  function wrapY(b) {
    if (b.y >= PF_BOT - 8) b.y -= PF_H;
    else if (b.y < PF_TOP - 8) b.y += PF_H;
  }
  function wallClamp(b) {
    if (b.x + 2 < WALL_L) { b.x = WALL_L - 2; return -1; }
    if (b.x + 14 > WALL_R) { b.x = WALL_R - 14; return 1; }
    return 0;
  }
  // Ground body physics: walls block horizontally, interior blocks are one-way, floor gap wraps.
  // (g / maxFall: the moves - glide, dash, wind-up, slam; everything else keeps the defaults. b.thruR: a player's
  // 내려가기 - the platform row it is dropping through, see dropThrough)
  function physBody(b, g = GRAV, maxFall = MAX_FALL) {
    b.x += b.vx;
    const hit = wallClamp(b);
    const vy0 = b.vy;
    b.vy = Math.min(maxFall, b.vy + g);
    const f0 = b.y + 16;
    b.y += (vy0 + b.vy) / 2;
    b.onGround = false;
    if (b.vy >= 0) {
      const t = landTile(b.x + 3, b.x + 13, f0, b.y + 16, b.thruR);
      if (t !== null) { b.y = t - 16; b.vy = 0; b.onGround = true; }
    } else if (b.y + 2 < CEIL_Y && f0 - 14 >= CEIL_Y - 0.01 && ceilingAt(b.x + 3, b.x + 13)) {
      b.y = CEIL_Y - 2; b.vy = 0;
    }
    wrapY(b);
    return hit;
  }
  // Buoyant body (the rubber duck): eases toward floating with FLOAT_SUB px of its 16 px body under the
  // surface of pool cell wi, never sinking through the pool floor. Counts as standing (it can jump out).
  function floatBody(b, wi, entering) {
    b.x += b.vx;
    const hit = wallClamp(b);
    if (entering && b.vy > 1.2) b.vy = 1.2; // the splash soaks up the fall
    const target = surfY(wi) + FLOAT_SUB - 16;
    const want = clamp((target - b.y) * 0.12, -1.6, 1.6);
    b.vy += (want - b.vy) * 0.3;
    const f0 = b.y + 16;
    b.y += b.vy;
    if (b.vy > 0) { const t = landTile(b.x + 3, b.x + 13, f0, b.y + 16); if (t !== null) { b.y = t - 16; b.vy = 0; } }
    b.onGround = true;
    return hit;
  }
  // Snacks and power-ups bob up to the surface and rest there.
  function floatSettle(o, wi, sub) {
    const target = surfY(wi) + sub - 16;
    o.vy = clamp((target - o.y) * 0.2, -1.2, 1.2);
    o.y += o.vy;
    if (Math.abs(o.y - target) < 0.3) { o.y = target; o.vy = 0; o.onGround = true; o.floating = true; }
  }
  // Is there hot water straight below this bubble (nothing solid in between)?
  function overHot(b) {
    const c = Math.floor((b.x + 8) / TS);
    if (c < 2 || c > COLS - 3) return false;
    for (let r = Math.max(0, Math.floor((b.y + 8 - PF_TOP) / TS)); r < ROWS; r++) {
      const k = WATER[r * COLS + c];
      if (k) return k === 1;
      if (MAP[r].charCodeAt(c) === 35) return false;
    }
    return false;
  }

  // ------------------------------------------------------------------ game state
  const G = {
    mode: 'title', attract: true, round: 0, loop: 0, score: 0, hiscore: 0, lives: SOLO_LIVES, stamps: 0,
    frame: 0, roundT: 0, roundClock: 0, roundDeaths: 0, introT: 0, clearT: -1, hurry: false, scald: false, dropT: 0, dropN: 0,
    enemies: [], bubbles: [], items: [], bolts: [], parts: [], kfx: [], pops: [], wisps: [], drops: [], ice: [], pickup: null,
    shake: 0, banner: null, bannerQ: [], invincible: false, manual: false, music: null, pausedFrom: null,
    dieT: 0, transT: 0, trans: null, stampT: 0, steamT: -1, trapTime: 480, loopMul: 1, attractT: 0,
    stampFlash: 0, ticketFlash: 0, seq: 0, ap: null, newHi: false, lastBonus: null,
    boss: null, hazards: [], foam: [], shotLog: [],
    // v3: N players. gameMode 'solo' | 'coop' | 'battle'; role 'host' (this engine runs the world) | 'guest'
    players: [], gameMode: 'solo', role: 'host', online: false, localSlot: 0, sel: 'duck', perksOff: false,
    opts: { arena: -1, time: 3, perks: true, monsters: true, intrusion: true }, battle: null, coopOverT: 0, countT: 0, countNext: null,
    podium: null, words: [], menuOpen: false,
    rid: 0, // (+1 for every round / arena this engine loads: a move's word pops once per round)
  };
  // the single-player era's `G.p` / `G.power` stay as views of player 1
  Object.defineProperty(G, 'p', {
    enumerable: true, configurable: true,
    get() { return G.players[0] || null; },
    set(v) { if (v) G.players[0] = v; else G.players.length = 0; },
  });
  Object.defineProperty(G, 'power', {
    enumerable: true, configurable: true,
    get() { const p = G.players[0]; return (p && p.power) || null; },
    set(v) { const p = G.players[0]; if (p) p.power = v || null; },
  });
  let roundCanvas = null;

  // physics body at a spawn cell (also what a respawn resets)
  function bodyAt(sp) {
    return { x: clamp(sp.col * TS - 4, WALL_L - 2, WALL_R - 14), y: (sp.row + 1) * TS, vx: 0, vy: 0, onGround: true, facing: 1,
      coyote: 0, jumpBuf: 0, shootCd: 0, autoCd: 0, shootBuf: 0, shootAnim: 0, invuln: 0, dead: false, walkT: 0, sq: 0, water: 0, waterSkip: 0,
      splashY: undefined, splashK: undefined, dieT: 0, ghost: null, trap: null, stunT: 0, koT: 0, out: false, shield: 0, shieldCd: 0, hotIn: false,
      thruR: -1, thruT: 0, ...MV_BODY };
  }
  // the move state of a body (v4 kits): airT airborne frames (0 on the ground / afloat); mv the move running ('' |
  // 'glide' | 'wind' | 'slam' | 'rec' | 'dash' | 'dive' | 'slide' | 'bonk' | 'curl'), mvT its frames, mvD its direction;
  // mvUsed (one air move per airtime), mvCd; glideT the duck's meter; carry (penguin slide speed in the air); hop / hopAir /
  // landT (the frog's chain level, "this airtime began with a jump", grounded frames since landing); mvA / mvB the
  // body bits other screens draw the pose from
  const MV_BODY = { airT: 0, mv: '', mvT: 0, mvD: 1, mvUsed: false, mvCd: 0, glideT: 0, carry: false, hop: 0, hopAir: false, landT: 0, mvA: false, mvB: false };
  // a player: body + who it is (slot colour, animal, nick) + personal score / stats
  function makePlayer(sp, info) {
    info = info || {};
    const slot = clamp(info.slot | 0, 0, MAX_PLAYERS - 1);
    return Object.assign(bodyAt(sp), {
      slot, char: isChar(info.char) ? info.char : 'duck', nick: typeof info.nick === 'string' ? info.nick.slice(0, 12) : '',
      color: SLOT_COLS[slot], local: info.local !== false, id: info.id || null, twin: false,
      // (the worn set, shop.md 6.5: frozen at match start like the twin colour - only the lists that build players set it)
      look: lookParse(info.look),
      score: 0, kills: 0, revives: 0, kos: 0, koed: 0, power: null,
    });
  }
  // (online: `ep`, the control epoch, changes whenever the host takes a player's animal over or hands it back -
  // spawn / respawn / revive here, and fall, trap, release, KO, podium below - see the ONLINE section)
  function placePlayer(pl, sp) { Object.assign(pl, bodyAt(sp)); pl.ep = (pl.ep | 0) + 1; return pl; }
  const bumpEp = (pl) => { pl.ep = (pl.ep | 0) + 1; };
  function spawnOf(slot) {
    const L = LV; if (!L) return { col: 3, row: 24 };
    return (slot > 0 && L.players && L.players[slot]) || L.player;
  }
  function setupPlayers(list) {
    G.players = [];
    (list && list.length ? list : [{ char: G.sel }]).slice(0, MAX_PLAYERS).forEach((info, k) => {
      G.players.push(makePlayer({ col: 3, row: 24 }, Object.assign({ slot: k }, info)));
    });
    // twin colour (distinction §2.5), once per match: a lower seat already has this animal. Every screen builds its
    // players from the same roster, so they all agree with no network field; a player leaving never recomputes it (a
    // pink duck stays pink), 한 판 더 recomputes it from the same roster (same result)
    for (const p of G.players) p.twin = G.players.some((q) => q.slot < p.slot && q.char === p.char);
    return G.players;
  }
  const multi = () => G.players.length > 1;
  // the floating-empty rule in force (see EMPTY_RULE): solo (one player, the title demo too), co-op or battle
  const emptyRule = () => (!multi() ? EMPTY_RULE.solo : G.gameMode === 'battle' ? EMPTY_RULE.battle : EMPTY_RULE.coop);
  // (a guest blinks at its host's life, sent in each snapshot as g.el - an older host sends none: it runs EMPTY_LIFE)
  const emptyLife = () => (G.online && G.role === 'guest' && NET.el ? NET.el : emptyRule()[0]);
  const alive = (pl) => !!pl && !pl.dead && !pl.out && !pl.koT && !pl.ghost;
  const free = (pl) => alive(pl) && !pl.trap;
  // perks are on unless the battle option "능력 끄기" (or a test) turned them off
  const perk = (pl, c) => !!pl && pl.char === c && !G.perksOff;
  // the player an enemy / boss goes after: the nearest free one (player 1 in single play, whatever its state).
  // Battle (mirror-symmetric arenas, a drain half a tile left of the axis): an enemy  leans a little toward one
  // half of the arena by its id, so near-ties between mirror-image rivals do not always go to the left / lower slot
  function aim(x, y, who) {
    const ps = G.players;
    if (ps.length <= 1) return ps[0];
    let best = null, bd = 1e9;
    const lean = who && G.gameMode === 'battle' ? ((who.id & 1) ? 1 : -1) : 0;
    for (const pl of ps) {
      if (!free(pl)) continue;
      const dx = pl.x - x, dy = pl.y - y, d = (dx * dx + dy * dy * 1.5) * (lean ? 1 - 0.2 * lean * (pl.x + 8 < W / 2 ? -1 : 1) : 1);
      if (d < bd) { bd = d; best = pl; }
    }
    return best || ps.find(alive) || ps[0];
  }
  const nameOf = (pl) => (pl && pl.nick) || (pl ? 'P' + (pl.slot + 1) : '');
  function makeEnemy(d, k) {
    const type = ENEMY_TYPES.indexOf(d.type) >= 0 ? d.type : 'grime';
    const x = clamp((d.col | 0) * TS - 4, WALL_L - 2, WALL_R - 14);
    const y = type === 'fly' ? clamp(PF_TOP + (d.row | 0) * TS - 4, CEIL_Y, PF_BOT - 24) : ((d.row | 0) + 1) * TS;
    return { id: ++G.seq, type, x, y, vx: 0, vy: 0, dir: d.dir === -1 ? -1 : 1, state: 'descend', angry: false, escaped: false,
      onGround: false, spawnY: y, startY: 0, delay: k * 5, t: 0, hopT: 0, jumpCd: 0, committed: false,
      windT: 0, chargeT: 0, chargeCd: 0, fvx: 0, fvy: 0, bubble: null, deadT: 0, chainK: 1, gone: false, soakT: 0, water: 0, ice: null,
      grace: 0, minion: false };
  }
  // (v4 traits of a blown bubble, host-only - set from newShot at fire time, never looked up again: ty its path, r / rP
  // its capture radii against enemies / rivals, drop an otter droplet, k the blower's animal 1..6 (0: none / 능력 끄기),
  // vol its volley, born the frame it was blown; the path state dir, v, ph, lands, go, oy, stopAt in shotFrom)
  function makeBubble(kind, x, y, owner) {
    return { id: ++G.seq, kind, state: 'float', x, y, vx: 0, vy: 0, age: 0, phase: rng() * 100, shotT: 0, popT: 0, chain: null,
      enemy: null, trapT: 0, trapMax: 0, squish: 0, bounceCd: 0, grace: 0, dead: false, big: false, soaked: false,
      owner: owner === undefined ? -1 : owner, victim: null, ty: 'line', r: 8, rP: 8, drop: false, k: 0, vol: 0, born: 0 };
  }

  // points go to a player's own score; solo / co-op also add them to the team score (the HUD's and the high
  // score's), a battle keeps only the personal ones
  function addScore(n, pl) {
    if (G.attract) return;
    if (!pl && G.players.length === 1) pl = G.players[0];
    if (pl) pl.score = Math.max(0, pl.score + n);
    if (G.gameMode === 'battle') return;
    G.score += n;
    if (G.score > G.hiscore) { G.hiscore = G.score; G.newHi = true; }
  }
  function bossKillScore(n, by) {
    const team = G.gameMode === 'coop' ? G.players : [];
    if (team.length < 2 || !by) { addScore(n, by); return; }
    const each = Math.floor((n * (1 - COOP_BOSS_SHARE)) / team.length / 10) * 10;
    for (const p of team) if (p !== by) addScore(each, p);
    addScore(n - each * (team.length - 1), by);
  }
  function saveHi() { if (G.attract || G.gameMode === 'battle') return; G.hiscore = Math.max(G.hiscore, G.score); sset('ppogeul-hiscore', G.hiscore); clKick(); }
  function shake(n) { if (NET.rec) netEv('k', Math.round(n * 10) / 10); if (!reducedMotion()) G.shake = Math.max(G.shake, n); }
  function burst(x, y, n, cols, sp, life, g) {
    if (G.parts.length > 360) return;
    sp = sp || 1.6; life = life || 18; g = g || 0;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + fxr() * 0.6, s = sp * (0.45 + fxr() * 0.75);
      G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life + ((fxr() * 8) | 0), max: life + 8, c: cols[i % cols.length], sz: fxr() < 0.3 ? 2 : 1, g });
    }
  }
  // water splash: droplets thrown up from a surface
  function splash(x, y, kind, n) {
    if (G.parts.length > 360) return;
    const cols = kind === 1 ? HOT_COLS : COLD_COLS;
    n = n || 8;
    for (let i = 0; i < n; i++) {
      const s = (i / (n - 1 || 1)) - 0.5;
      G.parts.push({ x: x + s * 10, y: y - 1, vx: s * 1.6 + (fxr() - 0.5) * 0.3, vy: -0.9 - fxr() * 1.1, life: 16 + ((fxr() * 6) | 0), max: 22, c: cols[i % cols.length], sz: 1, g: 0.12 });
    }
  }
  function popup(x, y, txt, scale, color, combo) {
    const q = { x: clamp(x, 20, W - 20), y: clamp(y, PF_TOP + 12, PF_BOT - 12), txt: String(txt), scale: scale || 1, color: color || '#ffffff', combo: combo || '', t: 0 };
    G.pops.push(q);
    if (NET.rec) netEv('p', Math.round(q.x), Math.round(q.y), q.txt, q.scale, q.color, q.combo);
  }
  function showBanner(main, sub, dur, cls) {
    if (G.attract) return;
    G.banner = { main, sub: sub || '', end: G.frame + dur, cls: cls || '', id: ++G.seq };
  }
  // a reward banner waits for the current one instead of replacing it
  function queueBanner(main, sub, dur, cls) {
    if (G.attract) return;
    if (G.banner && G.frame < G.banner.end) G.bannerQ.push({ main, sub, dur, cls });
    else showBanner(main, sub, dur, cls);
  }
  // a boss banner never covers the boss or its giant bubble: it moves to the lower part of the bath while
  // the boss is up where a banner normally sits
  function bossBanner(main, sub, dur, cls) {
    const b = G.boss, fy = b ? (b.giant ? b.giant.y + 20 : b.y + 16) : 0;
    showBanner(main, sub, dur, cls + (b && fy > 46 && fy < 124 ? ' low' : ''));
  }
  function setMusic(t) { G.music = t; if (G.mode !== 'paused') Snd.music(t); }

  // ------------------------------------------------------------------ stamps, power-ups, speed bonus
  function addStamps(n, x, y, by) {
    n = n | 0;
    if (G.attract || n <= 0 || G.gameMode === 'battle') return;
    G.stamps += n; G.stampFlash = 50;
    Snd.sfx('stamp');
    const p = by && alive(by) ? by : G.p;
    let px = x, py = y;
    if (p && !p.dead) { px = p.x + 8; py = p.y - 26; if (py < PF_TOP + 6) { py = p.y - 4; px = p.x + 8 + (p.x + 8 < W / 2 ? 22 : -22); } }
    if (isFinite(px) && isFinite(py)) {
      const q = { x: clamp(px, 24, W - 24), y: clamp(py, PF_TOP + 4, PF_BOT - 24), txt: '+' + n, icon: 'stamp', scale: 1, color: '#ffd6d6', combo: '', t: 0 };
      G.pops.push(q);
      if (NET.rec) netEv('i', Math.round(q.x), Math.round(q.y), q.txt);
    }
    while (G.stamps >= STAMPS_FULL) {
      G.stamps -= STAMPS_FULL;
      G.lives = Math.min(9, G.lives + 1);
      G.ticketFlash = 100;
      Snd.sfx('ticket');
      queueBanner('무료 입장권!', '도장 ' + STAMPS_FULL + '개 · 한 판 더', 110, 'ticket');
    }
  }
  function spawnPickup(type, x, y) {
    if (POWER_TYPES.indexOf(type) < 0) type = POWER_TYPES[0];
    G.pickup = { type, x: clamp(x - 8, WALL_L, WALL_R - 16), y: clamp(y - 8, CEIL_Y, PF_BOT - 40), vx: 0, vy: 0, onGround: false, floating: false, age: 0, land: 0 };
    burst(x, y, 8, ['#ffffff', '#fff4b0', '#c8f4ff'], 1.2, 14);
    return G.pickup;
  }
  function maybeDropPower(x, y) {
    if (G.attract || G.pickup || G.gameMode === 'battle' || rng() >= POWER_DROP) return;
    spawnPickup(POWER_TYPES[ri(0, POWER_TYPES.length - 1)], x, y);
  }
  // a power-up works for the player who touched it (the bath bomb soaks every enemy for everyone)
  function applyPower(type, pl) {
    if (POWER_TYPES.indexOf(type) < 0) return false;
    pl = pl || G.players[0];
    Snd.sfx('powerup');
    const info = POWER_INFO[type];
    if (type === 'bathbomb') {
      // instant: fizz across the whole bath, every active enemy turns into soggy 불은 때
      for (let i = 0; i < 46 && G.parts.length < 420; i++) {
        G.parts.push({ x: WALL_L + fxr() * (WALL_R - WALL_L), y: PF_TOP + 12 + fxr() * (PF_H - 20), vx: (fxr() - 0.5) * 0.4, vy: -0.3 - fxr() * 0.7, life: 24 + ((fxr() * 20) | 0), max: 40, c: ['#d9c8ff', '#ffffff', '#ff9ec4', '#b9a0ff'][i & 3], sz: fxr() < 0.4 ? 2 : 1, g: 0 });
      }
      for (const e of G.enemies) if (e.state === 'active') e.soakT = Math.max(e.soakT, BOMB_SOAK);
      showBanner(info.name, info.sub, 70, 'power');
      return true;
    }
    if (pl) pl.power = { type, t: POWER_FRAMES };
    showBanner(info.name, multi() ? nameOf(pl) + ' · ' + info.sub : info.sub, 70, 'power');
    return true;
  }
  const powerIs = (t, pl) => { pl = pl || G.players[0]; return !!(pl && pl.power && pl.power.type === t); };
  function roundCleared() {
    clearDrops(true); G.scald = false;
    const secs = Math.floor(G.roundClock / 60);
    const bonus = Math.max(0, SPEED_PAR - secs) * SPEED_PTS;
    G.lastBonus = { secs, bonus };
    addScore(bonus);
    showBanner('청소 완료!', '세신 보너스 +' + bonus.toLocaleString('ko-KR') + ' · ' + secs + '초', 130, 'clear');
    if (!G.roundDeaths) addStamps(1);
  }

  // ------------------------------------------------------------------ rounds
  function startRound(i, extraBanner) {
    if (!LEVELS.length) loadLevels();
    G.round = clamp(i | 0, 0, LEVELS.length - 1);
    LV = LEVELS[G.round]; MAP = LV.map; G.rid++;
    buildWater(MAP);
    roundCanvas = buildRoundCanvas(LV);
    G.gather = { x: LV.gather.col * TS + 4, y: PF_TOP + LV.gather.row * TS + 4 };
    G.enemies = LV.enemies.slice(0, 12).map((d, k) => makeEnemy(d, k));
    G.bubbles = []; G.items = []; G.bolts = []; G.parts = []; G.kfx = []; G.pops = []; G.drops = []; G.ice = []; G.pickup = null;
    G.hazards = []; G.foam = [];
    G.boss = LV.boss ? makeBoss(LV) : null;
    G.hurry = false; G.scald = false; G.roundT = 0; G.roundClock = 0; G.roundDeaths = 0; G.introT = 0; G.clearT = -1; G.trans = null;
    // the stamp-bubble timer is NOT re-rolled here: it counts play time across rounds, so a 도장 거품 rises
    // every ~20 s of play however quickly rounds are cleared; a fresh game (newGame/toTitle zero it) gets
    // its first one a little sooner, within 10-15 s
    if (!(G.stampT > 0)) G.stampT = ri(600, 900);
    G.steamT = LV.special === 'steam' ? 200 : -1;
    G.loopMul = Math.pow(1.25, Math.min(G.loop, 3));
    // trapped time shrinks gently: bubbles trapped low need ~300+ frames to drift up to the cluster
    G.trapTime = Math.max(300, 480 - G.round * 6 - G.loop * 60);
    if (!G.players.length) setupPlayers([{ char: G.sel }]);
    for (const pl of G.players) placePlayer(pl, spawnOf(pl.slot)); // everyone (fallen partners too) back at their spawn
    G.coopOverT = 0;
    G.attractT = 0; G.ap = null;
    G.mode = G.attract ? 'title' : 'playing';
    if (!G.attract) {
      const n = G.round + 1;
      showBanner(LV.name, (G.loop > 0 ? (G.loop + 1) + '회차 · ' : '') + n + '번째 탕', INTRO_NAME + (extraBanner | 0), 'round');
      // after a door transition the clear / victory jingle is still ringing: let it finish, main starts with
      // "준비!" (a boss round stays quiet until the boss lands and its own music starts with "… 등장!")
      if (G.music !== 'clear' && G.music !== 'victory') setMusic(G.boss ? null : 'main');
    }
    palStageRun();                               // (친구 순위: the best 탕 of 혼자 하기)
  }
  // the shared part of every new game (solo / co-op / battle); `list` = [{char, nick, local, id}] in slot order
  function resetGame(gameMode, list) {
    G.gameMode = gameMode;
    setupPlayers(list);
    G.attract = false; G.score = 0; G.stamps = 0; G.loop = 0; G.newHi = false; G.stampFlash = 0; G.ticketFlash = 0;
    G.lives = gameMode === 'coop' ? 3 + (G.players.length - 1) : gameMode === 'solo' ? SOLO_LIVES : 3;   // (solo: SOLO_LIVES; co-op: the team's 3 + 1 a partner)
    G.stampT = 0; // re-rolled by startRound
    G.bannerQ = []; G.battle = null; G.podium = null; G.coopOverT = 0; G.words = []; G.menuOpen = false;
    G.perksOff = gameMode === 'battle' && G.opts.perks === false;
    TRO.run = null; // (a 목욕 보너스 run: newGame / newCoop / continueLoop start one; a battle has none)
    CO.run = null; CO.pod = null; // (the 비누 코인 run likewise; the podium's coin line belongs to one game)
  }
  function newGame(i, list) {
    PAL.run = (i | 0) === 0;                     // (친구 순위: a solo game from 탕 1 records its best 탕)
    // (solo is always me: my worn set unless the list names one - shop.md 6.5)
    resetGame('solo', (list || [{ char: G.sel }]).map((e, k) => (k || (e && e.look !== undefined) ? e : Object.assign({}, e, { look: myLook(e && e.char) }))));   // (the list's animal in its own set)
    G.mode = 'playing';
    startRound(i | 0);
    troRunStart(); coinRunStart();
    showOverlay(null);
  }
  // 같이 하기: the campaign for 2-4 players (team lives 3 + (n - 1)), after a 3-2-1 countdown
  function newCoop(list, i, countdown) {
    resetGame('coop', list);
    G.mode = 'playing';
    startRound(i | 0);
    troRunStart(); coinRunStart();
    showOverlay(null);
    if (countdown !== false) beginCountdown();
  }
  // 배틀: 2-4 players in an arena; opts {arena (-1 = random), time (2 / 3 / 5 minutes), perks, monsters, intrusion,
  // countdown}; matchNo: 0 for a new battle, +1 for each 한 판 더 (monsters: the 몬스터 출현 switch, on unless false)
  function newBattle(list, opts, matchNo) {
    opts = opts || {};
    G.matchNo = matchNo | 0;
    const t = +opts.time;
    G.opts = {
      arena: isFinite(+opts.arena) ? +opts.arena | 0 : -1,
      time: t > 0 && t <= 5 ? t : 3,
      perks: opts.perks !== false,
      monsters: opts.monsters !== false,
      intrusion: opts.intrusion !== false,
    };
    resetGame('battle', list);
    G.lives = 0;
    startArena(G.opts.arena);
    showOverlay(null);
    if (opts.countdown !== false) beginCountdown();
  }
  function toTitle() {
    if (NET.sess) netClose(); // (the title is offline: an online game is left first)
    if (G.mode !== 'title') saveHi();
    G.gameMode = 'solo'; G.online = false; G.role = 'host'; G.perksOff = false; G.battle = null; G.podium = null; G.words = []; G.menuOpen = false;
    TRO.run = null; TRO.pod = null; CO.run = null; CO.pod = null;
    setupPlayers([{ char: G.sel, look: myLook(G.sel) }]); // (the attract demo wears my pick's set: shop.md 6.5, looks-per-animal.md 3)
    G.attract = true; G.score = 0; G.lives = SOLO_LIVES; G.stamps = 0; G.loop = 0; G.banner = null; G.bannerQ = []; G.stampT = 0; G.power = null;
    startRound(0);
    G.mode = 'title';
    setMusic('title');
    showOverlay('title');
  }
  // 3-2-1 before a multiplayer start: the world waits (sfx 'countdown' x3, then 'go')
  function beginCountdown() {
    G.countNext = G.mode === 'transition' ? 'transition' : 'playing';
    G.mode = 'countdown'; G.countT = 0;
  }
  // first-time hints (char-kits §12.5): the 1st round played with an animal (solo / co-op, after "준비!") names its
  // move, the 2nd its bubble (counter ppogeul-kit-<animal>; this screen's own animal)
  function kitHint() {
    const p = myPlayer() || G.p;
    if (!p || G.perksOff || !isChar(p.char)) return;
    const key = 'ppogeul-kit-' + p.char, n = parseInt(sget(key) || '0', 10) || 0, d = CHARS[p.char];
    if (n >= 2) return;
    if (n === 0) queueBanner('특기: ' + d.move.name, d.move.how, 100, 'hint');
    else queueBanner('거품: ' + d.bub.name, d.bub.desc, 100, 'hint');
    sset(key, n + 1);
  }
  // the countdown's "3" says my move every match (a guest puts in its own: see guestBanner); 능력 끄기 says so instead
  function countSub() {
    const p = myPlayer() || G.p;
    if (G.perksOff) return OFF_COUNT;
    if (!p || !isChar(p.char)) return '';
    const d = CHARS[p.char];
    return '내 특기: ' + d.move.name + ' · ' + (touchMode ? d.move.touch : d.move.how);
  }
  // (an online battle: "2" and "1" say what is at stake - "트로피 10개씩 걸어요!" / "트로피 경기" / "연습 경기 · 트로피 없음";
  // the "3" keeps my move. Trophies are held on the "시작!" frame: troHostGo here, a guest at its first 'p' snapshot)
  function updateCountdown() {
    const t = G.countT++;
    if (t === 0 || t === 60 || t === 120) { showBanner(String(3 - t / 60), t ? troCountSub() : countSub(), 60, 'count' + (t ? troCountCls() : '')); Snd.sfx('countdown'); }
    updateFx();
    if (G.countT >= COUNT_FRAMES) {
      G.mode = G.countNext || 'playing'; G.countNext = null;
      Snd.sfx('go');
      // (co-op: the round name now; its usual "준비!" would come after the 3-2-1 and is skipped)
      if (G.gameMode === 'coop' && LV) { showBanner(LV.name, (G.round + 1) + '번째 탕 · 다 함께!', INTRO_NAME, 'round'); G.introT = Math.max(G.introT, INTRO_NAME + 1); }
      // (몬스터 출현 off: 시작! says 몬스터 없음 - the arena's own banner, '배틀 · N분 · 몬스터 없음', is replaced by the
      // "3" on the countdown's first frame, so a countdown start would never show the word otherwise)
      else { showBanner('시작!', G.gameMode === 'battle' && G.opts.monsters === false ? '몬스터 없음' : '', 60, 'ready'); troHostGo(); coinGo(); }
    }
  }
  function nextRound() {
    saveHi();
    // (비누 코인: this 탕 cleared - once a run, if I blew >= 2 bubbles in it; the last one with the ending's +50, paid
    // before the card that shows it)
    const ci = G.loop * LEVELS.length + G.round;
    if (G.round + 1 >= LEVELS.length) {
      coinClear(ci, true);
      G.mode = 'ending'; G.enemies = []; G.bubbles = []; G.items = []; G.bolts = []; G.drops = []; G.ice = []; G.pickup = null;
      G.boss = null; G.hazards = []; G.foam = [];
      ICE_TOP.fill(0);
      setMusic('ending'); showOverlay('ending'); return;
    }
    coinPop(coinClear(ci, false));
    beginTransition(G.round + 1);
  }
  function continueLoop() {
    G.loop++; G.mode = 'playing'; startRound(0); troRunStart(); coinRunStart(); showOverlay(null);
  }
  // Sliding bath doors (미닫이문): shut over the old round, hold while the banner names the next one, open on it.
  function beginTransition(next) {
    G.mode = 'transition'; G.transT = 0;
    G.trans = { next, door: 0, swapped: false };
    G.enemies = []; G.bubbles = []; G.items = []; G.bolts = []; G.drops = []; G.ice = []; G.pickup = null; G.hurry = false; G.scald = false;
    G.boss = null; G.hazards = []; G.foam = [];
    ICE_TOP.fill(0);
    for (const p of G.players) { p.vx = 0; p.vy = 0; p.invuln = 0; if (p.trap) p.trap = null; }
    if (G.music !== 'victory') setMusic('clear'); // after a boss the victory fanfare plays on through the doors
    Snd.sfx('door');
  }
  function updateTransition() {
    const T = ++G.transT, tr = G.trans;
    if (T <= DOOR_CLOSE) tr.door = easeIO(T / DOOR_CLOSE);
    else if (T <= DOOR_CLOSE + DOOR_HOLD) {
      tr.door = 1;
      if (!tr.swapped) {
        // doors are shut: build the next round behind them (duck already at its spawn)
        tr.swapped = true;
        startRound(tr.next, TR_END - T);
        G.mode = 'transition'; G.trans = tr;
        shake(1.5);
      }
    } else {
      if (T === DOOR_CLOSE + DOOR_HOLD + 1) Snd.sfx('door', { open: true });
      tr.door = 1 - easeIO((T - DOOR_CLOSE - DOOR_HOLD) / DOOR_OPEN);
    }
    updateFx();
    if (T >= TR_END) { G.trans = null; G.mode = 'playing'; }
  }

  // ------------------------------------------------------------------ player
  // standing on top of a floating ice block?
  function onIce(p) {
    if (!p.onGround || p.water || !G.ice.length) return false;
    const r = Math.round((p.y + 16 - PF_TOP) / TS);
    for (let c = Math.floor((p.x + 3) / TS); c <= Math.floor((p.x + 12) / TS); c++) if (iceTop(c, r)) return true;
    return false;
  }
  function updatePlayer(p, inp) {
    if (p.invuln > 0) p.invuln--;
    if (p.shield > 0) p.shield--;
    if (p.shieldCd > 0) p.shieldCd--;
    if (p.mvCd > 0) p.mvCd--;
    // the kit: kc = whose move this body has ('' with 능력 끄기); a move of another kit (perks / animal switched by a
    // test) just stops
    const k = kitOf(p), kc = k === KIT_BASE ? '' : p.char;
    if (p.mv && MV_OF[p.mv] !== kc) endMove(p);
    if (p.carry && kc !== 'penguin') p.carry = false;
    // timed phases run out at the start of the frame after their last one (so a phase shows for exactly its frames)
    if (p.mv === 'wind' && p.mvT >= k.slam.wind) { p.mv = 'slam'; p.mvT = 0; }
    else if (p.mv === 'rec' && p.mvT >= k.slam.rec) { endMove(p); p.mvCd = k.slam.cd; }
    else if (p.mv === 'dash' && p.mvT >= k.dash.f) { endMove(p); p.mvCd = k.dash.cd; }
    else if ((p.mv === 'bonk' && p.mvT >= k.slide.bonk) || (p.mv === 'curl' && p.mvT >= k.dj.curl)) endMove(p);
    if (p.mv === 'bonk') inp = NO_INPUT; // (the penguin slid into the wall: dazed for a moment, input ignored)
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir && !MV_LOCK[p.mv]) p.facing = dir;
    const slip = powerIs('slippers', p);
    // water slows everyone to 0.8x, except: the duck (never), the penguin in cold water, the otter (swims 1.4x)
    let wmul = 1;
    if (p.water) {
      wmul = WATER_SLOW;
      if (perk(p, 'duck') || (perk(p, 'penguin') && p.water === 2)) wmul = 1;
      else if (perk(p, 'otter')) wmul = WATER_SLOW * OTTER_SWIM;
    }
    const ice = perk(p, 'penguin') && onIce(p);
    let walk = WALK * k.walk * (slip ? 1.4 : 1) * wmul * (ice ? PENGUIN_ICE : 1);
    const acc = ice ? PENGUIN_GRIP : 0.5; // the penguin skates: slow to start and to stop on ice
    // ---- 특기 (the move on the JUMP button). An air press (capy / otter / penguin / cat) is looked at BEFORE the jump
    // buffer: one the gate takes sets no buffered jump; one it refuses stays today's 5-frame buffered jump (no jump is
    // ever eaten)
    let took = false;
    if ((kc === 'capy' || kc === 'otter' || kc === 'penguin' || kc === 'cat') && airMoveOk(p, inp, kc === 'capy' ? k.slam.clear : KIT_GATE.clear)) {
      startMove(p, kc, k, dir, walk); took = true;
    }
    // the duck glides while JUMP is held on the way down, until its meter runs out (refilled on landing, afloat, on a bounce).
    // A fresh press waits out its jump buffer first: a press just before landing must not slow the fall past the buffer
    // (that would eat the jump); a re-hold high up resumes a few frames later, without costing meter
    if (kc === 'duck') {
      const on = inp.jump && !inp.jumpP && !(p.jumpBuf > 0) && !p.onGround && !p.water && p.vy > 0 && (p.mv === '' || p.mv === 'glide') && p.glideT < (G.gameMode === 'battle' ? k.glide.maxB : k.glide.max);
      if (on && p.mv !== 'glide') { p.mv = 'glide'; p.mvT = 0; moveWord(p); } else if (!on && p.mv === 'glide') endMove(p);
    }
    if (p.mv === 'glide') walk *= k.glide.air;
    // horizontal: walking, or what the move does with vx
    if (p.mv === 'wind' || p.mv === 'slam' || p.mv === 'rec' || p.mv === 'bonk') p.vx = 0;
    else if (p.mv === 'dash') p.vx = p.mvD * k.dash.v;
    else if (p.mv === 'dive') { /* (no steering) */ }
    else if (p.mv === 'slide') {
      const s = k.slide;
      if (dir === -p.mvD) p.vx -= p.mvD * Math.min(s.brake, Math.abs(p.vx)); // braking
      else p.vx *= ice ? s.ice : dir ? s.held : s.free;
    } else if (p.carry && !p.onGround) {
      // slide-jump / slid off a ledge: the slide's speed carries on through the air (opposite input pulls it back slowly)
      if (dir && dir === -sign(p.vx)) p.vx += clamp(dir * walk - p.vx, -k.slide.carryOpp, k.slide.carryOpp);
      else p.vx *= k.slide.carry;
      if (Math.abs(p.vx) <= walk) p.carry = false;
    } else p.vx += clamp(dir * walk - p.vx, -acc, acc);
    if (inp.jumpP && !took) p.jumpBuf = JUMP_BUF; else if (p.jumpBuf > 0) p.jumpBuf--;
    if (p.onGround) { p.coyote = COYOTE; p.landT++; } else if (p.coyote > 0) p.coyote--;
    if (p.jumpBuf > 0 && p.coyote > 0 && !MV_NOJUMP[p.mv]) {
      // 깨굴 3단 뛰기: a jump within `win` frames of landing from a jump goes one level higher (x1.12, x1.24); a jump out
      // of the water starts at level 1 (연못 점프)
      let mul = 1;
      if (kc === 'frog') {
        const h = k.hop, bt = G.gameMode === 'battle';
        const chain = p.hopAir && p.landT <= (bt ? h.winB : h.win);
        p.hop = chain ? Math.min(2, p.hop + 1) : 0;
        if (p.water) p.hop = Math.max(p.hop, 1);
        mul = (bt ? h.mulB : h.mul)[p.hop];
      }
      p.vy = JUMP_V * mul * (slip ? 1.08 : 1); p.onGround = false; p.coyote = 0; p.jumpBuf = 0; p.sq = -0.22; p.hopAir = true;
      if (p.mv === 'slide') { endMove(p); p.carry = true; } // slide-jump: the belly-slide speed goes along (long jump)
      if (p.water) p.waterSkip = 10; // a full-strength jump out of the bath (no buoyancy damping on the way up)
      if (kc === 'frog' && p.hop > 0) { Snd.sfx('hop', { n: p.hop }); moveWord(p); } else Snd.sfx('jump');
    }
    // 내려가기: down on an interior platform (not afloat, not in the capy's wind-up / slam / recovery, a dash, a dive or a
    // bonk - MV_NOJUMP; a jump this frame already left the ground)
    if (inp.down && p.onGround && !p.water && !MV_NOJUMP[p.mv]) dropThrough(p);
    const wasG = p.onGround, vy0 = p.vy, wasW = p.water, y0 = p.y;
    if (p.waterSkip > 0) p.waterSkip--;
    let wi = p.waterSkip > 0 ? -1 : waterIdx(p.x + 8, p.y + 15);
    if (wi >= 0 && perk(p, 'cat')) {
      // the cat hates baths: touching water flings it straight back up ("냥!"), it never floats (and may double-jump again)
      const sy = surfY(wi);
      p.y = Math.min(p.y, sy - 14); p.vy = CAT_HOP_V; p.onGround = false; p.coyote = COYOTE; p.waterSkip = 8; p.sq = -0.25; p.mvUsed = false;
      splash(p.x + 8, sy, WATER[wi], 8); Snd.sfx('splash');
      burst(p.x + 8, sy - 2, 6, ['#ffffff', '#e6fbff'], 1.1, 12);
      wordPop(p.x + 8, p.y - 2, '냥!', p.color);
      if (G.online && G.role === 'guest') NET.nyang++; // (the others show it from our body state)
      wi = -1;
    }
    let hit = 0;
    if (wi >= 0) {
      if (p.mv && p.mv !== 'slam' && p.mv !== 'rec' && p.mv !== 'curl') endMove(p); // (water ends a glide, dash, dive or slide)
      hit = floatBody(p, wi, !wasW);
    } else if (p.mv === 'wind' || p.mv === 'dash') { p.vy = 0; hit = physBody(p, 0); }     // hangs / flat
    else if (p.mv === 'slam') { p.vy = k.slam.vy; hit = physBody(p, GRAV, k.slam.vy); }
    else if (p.mv === 'glide') {
      const gl = k.glide;
      if (p.vy > gl.fall) p.vy = Math.max(gl.fall, p.vy * gl.brake);
      hit = physBody(p, GRAV, gl.fall);
      if (++p.glideT % 12 === 1) Snd.sfx('flap');
    } else hit = physBody(p);
    p.water = wi >= 0 ? WATER[wi] : 0;
    // (내려가기: the row is let go once the feet are past its top, on landing, rising or after THRU_F frames)
    if (p.thruR >= 0 && (p.onGround || p.vy < 0 || --p.thruT <= 0 || p.y + 16 > PF_TOP + p.thruR * TS + 1)) p.thruR = -1;
    // the capybara loves hot water: getting in gives a one-hit shield for 3 s (a new one 3 s after the last ran out:
    // bobbing in and out of the tub is not a lasting shield - in a battle it also takes a capture)
    if (p.water === 1 && !p.hotIn && perk(p, 'capy') && !(p.shieldCd > 0)) { p.shield = CAPY_SHIELD; p.shieldCd = CAPY_SHIELD + CAPY_SHIELD_CD; burst(p.x + 8, p.y + 8, 8, ['#c8f4ff', '#ffffff'], 1.2, 14); }
    p.hotIn = p.water === 1;
    if (p.water && !wasW) {
      splash(p.x + 8, surfY(wi), p.water, vy0 > 1.5 ? 10 : 6); Snd.sfx('splash');
      if (vy0 > 1.4) p.sq = Math.min(0.28, vy0 * 0.07);
      p.splashY = surfY(wi); p.splashK = p.water;
    } else if (!p.water && wasW) {
      splash(p.x + 8, p.splashY || p.y + 12, p.splashK || wasW, 7); Snd.sfx('splash');
    } else if (p.onGround && !wasG && !p.water) {
      if (vy0 > 1.4) { p.sq = Math.min(0.32, vy0 * 0.085); for (let i = 0; i < 4; i++) G.parts.push({ x: p.x + 8 + (i - 1.5) * 3, y: p.y + 15, vx: (i - 1.5) * 0.35, vy: -0.25 - fxr() * 0.2, life: 12, max: 12, c: '#e8f4f0', sz: 1, g: 0 }); }
      p.coyote = COYOTE;
    }
    if (p.water) { p.splashY = surfY(wi); p.splashK = p.water; if (p.onGround) p.coyote = COYOTE; }
    // ---- the move after this frame's physics: phases, endings, landings
    if (p.mv === 'slam') {
      if (p.y < y0 - 100) { endMove(p); p.mvCd = k.slam.cd; }  // (through the drain to the top: just a fall, no quake)
      else if (p.onGround) slamLand(p);                        // floor, platform, ice top or the water
    } else if (p.mv === 'wind' || p.mv === 'rec' || p.mv === 'bonk' || p.mv === 'curl') p.mvT++;
    else if (p.mv === 'dash') { if (hit || p.onGround) { endMove(p); p.mvCd = k.dash.cd; } else p.mvT++; } // (a wall ends it)
    else if (p.mv === 'dive') {
      if (p.onGround) { p.mv = 'slide'; p.mvT = 0; p.vx = p.mvD * Math.max(Math.abs(p.vx), k.slide.v); Snd.sfx('slide', { n: 2 }); }
    } else if (p.mv === 'slide') {
      if (hit) { p.vx = 0; p.mv = 'bonk'; p.mvT = 0; p.sq = 0.3; ownWord(p, '콩!'); Snd.sfx('slide', { n: 3 }); } // (only the outer walls bonk)
      else if (!p.onGround) { endMove(p); p.carry = true; }                                       // slid off a ledge
      else if (Math.abs(p.vx) < k.slide.end || ++p.mvT >= k.slide.max) endMove(p);
    }
    // landing (afloat counts as ground) refreshes the air move, the glide meter, the carry; airborne frames count up
    if (p.onGround) {
      if (!wasG) p.landT = 0;
      p.airT = 0; p.mvUsed = false; p.glideT = 0; p.carry = false;
    } else {
      p.airT++;
      if (wasG) p.hopAir = false; // walked off a ledge (a jump clears onGround before wasG is taken)
    }
    // body bits for the other screens: A = the move is on (frog: rising on a chained hop), B = its second phase
    // (capy recovery, penguin slide; frog: level 2)
    let A = false, B = false;
    if (kc === 'frog') { A = p.hop >= 1 && !p.onGround && p.vy < 0; B = A && p.hop === 2; }
    else if (kc) { const m = p.mv; A = m === 'glide' || m === 'wind' || m === 'slam' || m === 'dash' || m === 'dive' || m === 'curl'; B = m === 'rec' || m === 'slide'; }
    p.mvA = A; p.mvB = B;
    // shooting (the cooldowns come with the kit)
    if (p.shootCd > 0) p.shootCd--;
    if (p.autoCd > 0) p.autoCd--;
    if (inp.shootP) p.shootBuf = 6; else if (p.shootBuf > 0) p.shootBuf--;
    if (p.shootCd === 0 && (p.shootBuf > 0 || (inp.shoot && p.autoCd === 0))) {
      // battle, the magazine empty (AMMO): nothing - a press says a quiet 칙 (its buffer stays: a press just before the
      // refill blows on it), a held button just waits and blows on the frame it refills (no cooldown spent)
      if (!shotCapped(p) && !ammoTake(p)) { if (inp.shootP) Snd.sfx('dry'); p.autoCd = 0; }
      else {
        p.shootBuf = 0;
        if (shotCapped(p)) Snd.sfx('dry'); // (only a guest of an older host: its in-flight cap - see SHOT_CAP)
        else fire(p, !p.onGround); // (the cat's yarn rolls only when blown on the ground)
        p.shootCd = k.cd[0]; p.autoCd = k.cd[1];
      }
    }
    if (p.shootAnim > 0) p.shootAnim--;
    p.walkT += Math.abs(p.vx);
    p.sq *= 0.78; if (Math.abs(p.sq) < 0.02) p.sq = 0;
  }
  // ---- the moves (v4 kits)
  // one air move per airtime: never in the first airMin frames, never with something to land on / splash into within
  // `clear` px below, never over a bubble while falling (holding JUMP there bounces)
  function airMoveOk(p, inp, clear) {
    if (!inp.jumpP || p.onGround || p.water || p.coyote > 0 || p.airT < KIT_GATE.airMin || p.mvUsed || p.mvCd > 0 || p.mv) return false;
    if (landTile(p.x + 3, p.x + 13, p.y + 16, p.y + 16 + clear) !== null) return false; // landing soon: the buffered jump wins
    if (waterIdx(p.x + 8, p.y + 16 + clear) >= 0) return false;                         // splashing down soon
    if (p.vy > 0 && bubbleBelow(p, clear)) return false;                                 // over a bubble
    return true;
  }
  function bubbleBelow(p, clear) {
    for (const b of G.bubbles) {
      if (b.dead || b.pred || b.state !== 'float' || b.kind === 'player') continue;
      if (circBox(b.x + 8, b.y + 8, 7.5, p.x + 2, p.y + 16, 12, clear)) return true;
    }
    return false;
  }
  function startMove(p, kc, k, dir, walk) {
    const d = dir || p.facing;
    p.mvUsed = true; p.mvT = 0; p.mvD = d;
    if (kc === 'capy') { p.mv = 'wind'; p.vx = 0; p.vy = 0; p.sq = -0.15; Snd.sfx('slam'); }      // (facing kept)
    else if (kc === 'otter') { p.mv = 'dash'; p.facing = d; Snd.sfx('dash'); }
    else if (kc === 'penguin') { p.mv = 'dive'; p.facing = d; p.vx = d * k.slide.diveVx; p.vy = Math.max(p.vy, k.slide.diveVy); Snd.sfx('slide', { n: 1 }); }
    else { p.mv = 'curl'; p.vy = k.dj.vy; if (dir) p.vx = dir * walk; p.sq = -0.3; Snd.sfx('djump'); } // the cat (mid-air turn)
    moveWord(p);
  }
  // a move stops where it is (vx / vy kept): stun, trap, release; a stunned capy that was slamming just falls
  function endMove(p) { p.mv = ''; p.mvT = 0; }
  // a new control epoch (trapped, released, KO'd): no move, chain or carry goes along
  function clearMoves(p) { endMove(p); p.mvUsed = false; p.hop = 0; p.hopAir = false; p.carry = false; p.mvA = false; p.mvB = false; p.thruR = -1; }
  // ---- 내려가기 (↓ / S, the stick pulled down): the platform row a standing body would drop through, or -1. Only an
  // interior platform: never the bottom floor row, nor a block whose column stays solid down to it (a thick floor -
  // the body would sink through it and wrap); walls never (landTile's columns stop short of them). Ice tops count
  function dropRowOf(p) {
    const rf = (p.y + 16 - PF_TOP) / TS, r = Math.round(rf);
    if (Math.abs(rf - r) > 0.02 || r < 1 || r >= ROWS - 1) return -1;
    const c0 = Math.max(2, Math.floor((p.x + 3) / TS)), c1 = Math.min(COLS - 3, Math.floor((p.x + 13 - 0.001) / TS));
    let top = false;
    for (let c = c0; c <= c1; c++) {
      if (ICE_TOP[r * COLS + c] === 1) { top = true; continue; }
      if (!solidCell(c, r) || solidCell(c, r - 1)) continue;
      top = true;
      let k = r; while (k < ROWS - 1 && solidCell(c, k + 1)) k++;
      if (k >= ROWS - 1) return -1;
    }
    return top ? r : -1;
  }
  // down held while standing on one (a fresh press, or still held on landing: on through each platform below): the
  // body leaves it like walking off a ledge (no coyote jump, the frog's chain broken, a penguin slide carries on through
  // the air), and that row's top is ignored until the feet are past it (thruR / thruT, physBody). A little dust where it
  // went through: the guests see the host's from an event ('d'), the others a guest's from its body state's count (dp)
  const THRU_F = 12, THRU_VY = 1;
  function dropThrough(p) {
    const r = dropRowOf(p); if (r < 0) return false;
    p.thruR = r; p.thruT = THRU_F; p.onGround = false; p.coyote = 0; p.hopAir = false; p.sq = -0.14;
    if (p.vy < THRU_VY) p.vy = THRU_VY;
    dropDust(p.x + 8, PF_TOP + r * TS);
    if (G.online && G.role === 'guest') NET.drops = (NET.drops | 0) + 1;
    else if (NET.rec) netEv('d', Math.round(p.x + 8), PF_TOP + r * TS);
    return true;
  }
  function dropDust(x, y) {
    for (let i = 0; i < 6; i++) G.parts.push({ x: x + (i - 2.5) * 2.2, y: y - 0.5, vx: (i - 2.5) * 0.32, vy: -0.12 - fxr() * 0.18, life: 13, max: 13, c: i & 1 ? '#e8f4f0' : '#cfe9ea', sz: 1, g: 0 });
  }
  // a bubble bounce refreshes the air move and the glide meter, and ends a penguin's dive
  function bounceRefresh(p) { p.mvUsed = false; p.glideT = 0; p.carry = false; if (p.mv === 'dive' || p.mv === 'glide') endMove(p); }
  // words over the owner, on its own screen only (never echoed to the others)
  function ownWord(p, txt) { const rec = NET.rec; NET.rec = false; wordPop(p.x + 8, p.y - 4, txt, p.color); NET.rec = rec; }
  function moveWord(p) { if (p.wordRid === G.rid || !MOVE_WORD[p.char]) return; p.wordRid = G.rid; ownWord(p, MOVE_WORD[p.char]); }
  // 털썩: the slam hit the ground (or the water) - recovery, and the quake in the host's world (a guest's capy asks
  // the host with a reliable 'qk'; it hears its own quake here, the host's echo skips it)
  function slamLand(p) {
    p.mv = 'rec'; p.mvT = 0; p.vx = 0; p.sq = 0.32;
    if (!reducedMotion()) G.shake = Math.max(G.shake, 1.5); // (this screen only: shake() would echo to everyone)
    if (G.online && G.role === 'guest') {
      if (NET.sess) NET.sess.send(NET.hostId, { t: 'qk', x: r1(p.x), y: r1(p.y), ep: p.ep });
      Snd.sfx('quake');
    } else { const who = NET.who; NET.who = p.slot; quake(p, p.x, p.y); NET.who = who; }
  }
  // the quake (host world): grime / mold / sponge in the box get soaked (불은 때: slow, trapped longer, double points) and
  // hop, a sponge forgets its charge, floating empties jiggle, a ground boss gets soap (once per bossCd per capy).
  // Rivals never (no host-to-guest body impulse exists)
  function quake(pl, x, y) {
    const s = KIT.capy.slam, cx = x + 8, feet = y + 16, inBox = (ex, ey) => Math.abs(ex - cx) <= s.dx && ey >= feet - s.up && ey <= feet + s.dn;
    for (const e of G.enemies) {
      if (e.state !== 'active' || e.type === 'fly' || !inBox(e.x + 8, e.y + 16)) continue;
      e.soakT = Math.max(e.soakT, s.soak);
      if (e.onGround) { e.vy = s.hop; e.onGround = false; }
      if (e.type === 'sponge') { e.windT = 0; e.chargeT = 0; e.chargeCd = Math.max(e.chargeCd, 60); }
    }
    for (const b of G.bubbles) if (!b.dead && b.kind === 'empty' && b.state === 'float' && inBox(b.x + 8, b.y + 8)) b.vy -= 1.0;
    const B = G.boss;
    if (B && B.state === 'fight' && G.frame - (pl.qkBoss ?? -1e9) >= s.bossCd && overlap(cx - s.dx, feet - s.up, s.dx * 2, s.up + s.dn, B.x + 2, B.y + 2, 28, 28)) {
      pl.qkBoss = G.frame;
      bossSoap(B.type === 'megaSponge' && B.act === 'dizzy' ? 2 : 1, B.x + 16, B.y + 16);
    }
    Snd.sfx('quake');
  }
  // ---- the six bubbles (v4 kits)
  // newShot: what one press of BUBBLE blows, as pure specs from the kit - the base bubble or the animal's own (the
  // otter: a centre and two droplets). fire (host) and guestFire (the guest's prediction) build the same bubbles from
  // them. air: the cat blows the base bubble in the air. Blown into a wall: today's rule (it floats at the wall; no
  // droplets), except the frog's egg, which is laid at the wall
  function newShot(p, air) {
    const k = kitOf(p), d = p.facing < 0 ? -1 : 1, big = powerIs('shampoo', p), battle = G.gameMode === 'battle';
    const s = air && k.airShot === 'base' ? KIT_BASE.shot : k.shot, sh = big ? s.sh : null;
    const x0 = p.x + p.facing * 11, y = clamp(p.y - 1, CEIL_Y, PF_BOT - 18), wall = x0 < WALL_L || x0 + 16 > WALL_R;
    const one = { x: wall ? clamp(x0, WALL_L, WALL_R - 16) : x0, y, ty: s.ty === 'fan' ? 'line' : s.ty, dir: d, v: s.v, vx: wall ? 0 : d * s.v, vy: 0, ph: 0,
      f: (sh && sh.f) || s.f, r: sh ? sh.r : s.r, rP: sh ? sh.rP : s.rP, drop: false, big, k: k === KIT_BASE ? 0 : CHAR_IDS.indexOf(p.char) + 1, float: wall };
    if (s.ty === 'echo') one.dec = sh ? sh.dec : s.dec;
    else if (s.ty === 'yarn') { one.vy = s.vy; one.lands = sh ? sh.lands : s.lands; }
    else if (s.ty === 'egg') {
      one.go = s.go; one.f = s.go + (battle ? s.holdB : s.hold); one.cap = sh ? (battle ? sh.capB : sh.cap) : battle ? s.capB : s.cap;
      if (wall) { one.float = false; one.ph = 1; } // (laid at the wall: it hangs there at once)
    }
    if (wall || s.ty !== 'fan') return [one];
    const dr = s.drop, ds = big ? dr.sh : null;
    const drop = (vy) => Object.assign({}, one, { vx: d * dr.vx, vy, v: dr.vx, f: dr.f, r: ds ? ds.r : dr.r, rP: ds ? ds.rP : dr.rP, drop: true });
    return [one, drop(-dr.vy), drop(dr.vy)];
  }
  // a bubble (the host's, or a guest's predicted copy) takes its traits and path state from a newShot spec
  function shotFrom(b, s) {
    Object.assign(b, { x: s.x, y: s.y, ty: s.ty, dir: s.dir, v: s.v, vx: s.vx, vy: s.vy, ph: s.ph, r: s.r, rP: s.rP, drop: s.drop, big: s.big, k: s.k,
      dec: s.dec, lands: s.lands, go: s.go, oy: s.y, stopAt: 0 });
    if (s.float) b.state = 'float'; else { b.state = 'shot'; b.shotT = s.f; }
    return b;
  }
  // one frame of a capture-phase bubble's own path (the caller has counted its age; the host's bubbles, the guest's
  // predictions and the bots' shotPath all run this). y stays inside CEIL_Y..PF_BOT-14 and never wraps.
  // Returns what happened: '' | 'wall' (an outer wall: it floats - a droplet bursts at the end of the frame instead) |
  // 'turn' (the echo turns back) | 'land' (a yarn landing: it hops, or floats after the last one) | 'stop' (the egg hangs)
  function stepShot(b) {
    let ev = '';
    const out = !b.ph; // (the echo's way out / the egg's flight, as this frame began)
    if (b.ty === 'echo') {
      // 메아리: out slowing down, turns at 0 (age 35, 63 px), back speeding up to `back` past the duck
      const s = KIT.duck.shot;
      if (!b.ph) { b.vx = b.dir * b.v; b.x += b.vx; b.v -= b.dec; if (b.v <= 1e-9) { b.v = 0; b.ph = 1; ev = 'turn'; } }
      else { b.v = Math.min(s.back, b.v + s.dec); b.vx = -b.dir * b.v; b.x += b.vx; }
    } else if (b.ty === 'yarn') {
      // 털실: rolls under gravity; the bottom crossing a platform / ice top, a hot-water surface or the floor clamp is a
      // landing (a 10 px hop, x keep), and after the last one it floats; it rolls off ledges onto the shelf below
      const s = KIT.cat.shot, vy0 = b.vy, f0 = b.y + 16;
      b.vy += s.g; b.x += b.vx; b.y += (vy0 + b.vy) / 2;
      if (b.vy >= 0) {
        let t = landTile(b.x + 3, b.x + 13, f0, b.y + 16);
        const wi = waterIdx(b.x + 8, b.y + 16);
        if (wi >= 0 && WATER[wi] === 1 && f0 <= surfY(wi) + 0.01 && (t === null || surfY(wi) < t)) t = surfY(wi);
        if (t === null && b.y > PF_BOT - 14) t = PF_BOT + 2;
        if (t !== null) {
          b.y = t - 16; b.vx *= s.keep; b.squish = 4; ev = 'land';
          if (--b.lands > 0) b.vy = s.hop; else { b.state = 'float'; b.vy = -0.3; }
        }
      }
      b.y = clamp(b.y, CEIL_Y, PF_BOT - 14);
    } else if (b.ty === 'egg') {
      // 개구리알: flies go f slowing x decay (40.8 px), then hangs where it stopped, wobbling +-0.5 px (still capturing)
      if (!b.ph) { b.vx = b.dir * b.v; b.x += b.vx; b.v *= KIT.frog.shot.decay; if (b.age >= b.go) ev = 'stop'; }
      else b.y = clamp(b.oy + 0.5 * Math.sin((b.age - b.stopAt) * 0.2), CEIL_Y, PF_BOT - 14);
    } else {
      // a straight line: the base bubble, the capy's, the penguin's, the otter's centre; its droplets drift off-axis
      b.x += b.vx;
      if (b.vy) b.y = clamp(b.y + b.vy, CEIL_Y, PF_BOT - 14);
    }
    if (b.x < WALL_L || b.x + 16 > WALL_R) {
      b.x = b.x < WALL_L ? WALL_L : WALL_R - 16;
      if (b.ty === 'echo' && out) { b.ph = 1; b.v = Math.abs(b.vx) * 0.6; ev = 'turn'; } // (a wall on the way out: back at once)
      else if (b.ty === 'egg') { if (out) ev = 'stop'; }                                 // (laid at the wall)
      else if (b.drop) { b.shotT = 1; ev = 'wall'; }
      else { b.state = 'float'; b.vx = 0; ev = 'wall'; }
    }
    if (ev === 'stop') { b.ph = 1; b.vx = 0; b.v = 0; b.oy = b.y; b.stopAt = b.age; }
    return ev;
  }
  // 개구리알: at most cap eggs hang per frog - laying one more lets the oldest float (the host's world; a guest's own
  // predicted copies)
  function eggCap(list, slot, cap) {
    const mine = list.filter((o) => !o.dead && o.ty === 'egg' && o.state === 'shot' && o.kind === 'empty' && o.owner === slot);
    for (let i = 0; i <= mine.length - cap; i++) { mine[i].state = 'float'; mine[i].vx = 0; mine[i].vy = 0; }
  }
  // the owner's engine plays its own bubble's path sounds (a host-local player here, the guest's prediction there)
  function shotSfx(ev) {
    if (ev === 'turn') Snd.sfx('b_echo', { n: 1 }); else if (ev === 'land') Snd.sfx('b_yarn', { n: 1 }); else if (ev === 'stop') Snd.sfx('b_egg', { n: 1 });
  }
  const ownerHere = (b) => { const o = b.owner >= 0 ? G.players.find((q) => q.slot === b.owner) : null; return !!o && o.local !== false; };
  // the blow sound: each animal's own with perks on, else today's
  const shootSfx = (p) => Snd.sfx(kitOf(p) === KIT_BASE ? 'shoot' : SHOOT_SFX[p.char]);
  function fire(p, air) {
    p = p || G.p;
    coinShot(p); // (비누 코인's anti-AFK count: my own animal's blows only - shop.md 3.3)
    if (G.online && G.role === 'guest') { guestFire(p, air); return null; } // (the host blows it; we show a prediction)
    const battle = G.gameMode === 'battle';
    // battle: blowing a bubble ends your own blink (respawn / escape / stun) - nobody attacks from behind it
    if (battle) p.invuln = 0;
    const specs = newShot(p, air);
    if (battle) capMine(p); // (SHOT_CAP of mine out in all: the oldest pops first)
    if (specs[0].ty === 'egg') eggCap(G.bubbles, p.slot, specs[0].cap);
    let c = null, vi = 0; // (the first bubble: the one hostShot gives the guest's sid; an otter volley shares its id as `vol`)
    for (const s of specs) {
      const b = shotFrom(makeBubble('empty', s.x, s.y, p.slot), s);
      b.born = G.frame; b.vol = c ? c.id : b.id; b.vi = vi++;
      if (b.state === 'float') { b.grace = 24; if (battle) shotNote(b); shotHits(b); }
      else {
        if (battle) shotNote(b);
        // (catching a rival waits for this frame's bubble pass, when every player's shot of this frame exists: two
        // players shooting each other on the same frame both get caught, whatever their slot order)
        shotHits(b, true);
      }
      G.bubbles.push(b);
      if (!c) c = b;
    }
    p.shootAnim = 10;
    shootSfx(p);
    const empties = G.bubbles.filter((o) => o.kind === 'empty' && o.state === 'float' && !o.dead);
    if (G.bubbles.length > MAX_BUBBLES && empties.length) popBubble(empties[0], null, 'self');
    return c;
  }
  function playerBubbles(p, inp) {
    p = p || G.p;
    const s = p.local ? 0 : slack(p); // (an online player's reported spot: see slack)
    const px = p.x + 2 - s, py = p.y + 2 - s;
    let chain = null, bounced = false;
    for (const b of G.bubbles) {
      if (b.dead || b.state !== 'float' || b.bounceCd > 0 || b.grace > 0) continue;
      if (b.kind === 'player' && b.victim === p) continue; // (its own prison: mashing is the way out)
      if (b.kind === 'player' && b.owner === p.slot && b.age < OWNER_LOCK) continue; // (the trapper waits a second)
      if (!circBox(b.x + 8, b.y + 8, 7.5, px, py, 12 + s * 2, 14 + s * 2)) continue;
      if (bounced) continue;
      // online: a remote player that reported bouncing on this bubble (its own physics did that) does not pop it
      if (!p.local && p.bb && p.bb.indexOf(b.id) >= 0) { b.bounceCd = 10; b.squish = 8; bounced = true; b.rideF = G.frame; continue; }
      // (a slamming capy never bounces: it pops what it lands on)
      if (b.kind !== 'player' && p.vy > 0 && inp.jump && p.y + 16 <= b.y + 8 + 3 && p.mv !== 'slam') {
        p.vy = BOUNCE_V; p.onGround = false; p.coyote = 0; p.jumpBuf = 0; p.sq = -0.2; bounceRefresh(p);
        b.bounceCd = 10; b.squish = 8; b.vy += 0.7; bounced = true;
        if (multi()) b.rideF = G.frame; // (ridden: no cap takes it - capEmpties)
        Snd.sfx('bounce');
        continue;
      }
      if (!chain) chain = { n: 0, kills: 0, by: p };
      popBubble(b, chain, 'player');
    }
  }

  // ------------------------------------------------------------------ bubbles
  function captureCheck(b) {
    const r = b.r; // (the kit's radius; shampoo included)
    for (const e of G.enemies) {
      if (e.state !== 'active') continue;
      if (circBox(b.x + 8, b.y + 8, r, e.x + 2, e.y + 2, 12, 14)) { trap(e, b); return true; }
    }
    return false;
  }
  function trap(e, b) {
    spend(b);
    b.kind = 'trapped'; b.enemy = e; b.trapT = 0; b.state = 'float'; b.age = 0;
    b.ty = 'line'; b.drop = false; b.r = 8; b.rP = 8; // (a prison is a plain bubble: no path, no droplet rules)
    // soggy 불은 때 stays trapped longer (and scores double when popped)
    b.soaked = e.soakT > 0;
    b.trapMax = Math.round(G.trapTime * (b.soaked ? SOAK_TRAP : 1));
    b.vx *= 0.3; b.vy = -0.3;
    b.x = clamp((b.x + e.x) / 2, WALL_L, WALL_R - 16); b.y = clamp(Math.min(b.y, e.y), CEIL_Y, PF_BOT - 16);
    e.state = 'trapped'; e.bubble = b; e.vx = 0; e.vy = 0; e.windT = 0; e.chargeT = 0;
    burst(b.x + 8, b.y + 8, 6, BUBBLE_COLS, 1.1, 12);
    Snd.sfx('capture');
  }
  function escape(b) {
    const e = b.enemy; b.dead = true; b.enemy = null;
    if (!e) return;
    e.state = 'active'; e.angry = true; e.escaped = true; e.bubble = null; e.soakT = 0;
    e.x = clamp(b.x, WALL_L - 2, WALL_R - 14); e.y = clamp(b.y, CEIL_Y, PF_BOT - 24); e.vx = 0; e.vy = 0; e.onGround = false;
    e.committed = false; e.hopT = 10; e.windT = 0; e.chargeT = 0; e.chargeCd = 30;
    if (e.type === 'fly') { const p = aim(e.x, e.y, e); e.fvx = sign(p.x - e.x) || 1; e.fvy = sign(p.y - e.y) || 1; }
    burst(b.x + 8, b.y + 8, 8, ['#ff8a7a', '#ffffff', '#ffd0c8'], 1.4, 14);
    Snd.sfx('escape');
  }
  function popBubble(b, chain, cause) {
    if (b.dead || b.state === 'pop') return;
    spend(b);
    b.state = 'pop'; b.popT = 0; b.chain = chain; b.vx = 0; b.vy = 0;
    const cx = b.x + 8, cy = b.y + 8, by = chain ? chain.by || null : null, kc = bubbleChar(b);
    if (kc) kitPop(kc, cx, cy, b.owner, b.drop); // (v4: an animal's bubble pops in its own colours)
    else burst(cx, cy, b.kind === 'empty' ? 7 : 10, b.owner >= 0 && multi() ? [SLOT_COLS[b.owner], '#ffffff', '#c8f4ff'] : BUBBLE_COLS, 1.5, 14);
    // (the first pop of a bubble a player blew with perks on sounds like its animal: 'pop' n = 1..6; echoed)
    const pn = b.k > 0 && b.owner >= 0 ? { n: b.k } : undefined;
    if (chain) { chain.n++; if (chain.n === 1) Snd.sfx('pop', pn); else Snd.sfx('chain', { n: chain.n - 1 }); }
    else if (cause !== 'self') Snd.sfx('pop', pn);
    if (b.kind === 'trapped') {
      const e = b.enemy; b.enemy = null;
      const k = chain ? ++chain.kills : 1;
      // 뽀득 combo: the k-th kill of one chain scores 500k (cap 5000); soaked grime scores double.
      // A battle pays 100 x the combo position instead.
      const base = G.gameMode === 'battle' ? BATTLE_KILL_STEP * k : Math.min(COMBO_CAP, COMBO_STEP * k), pts = b.soaked ? base * 2 : base;
      // co-op: popping a partner's catch shares it - 60 % to the popper, 40 % to the one who trapped it
      const trapper = G.gameMode === 'coop' && by && b.owner >= 0 && b.owner !== by.slot ? G.players.find((q) => q.slot === b.owner) : null;
      if (trapper) { const mine = Math.round((pts * COOP_POP_SHARE) / 10) * 10; addScore(mine, by); addScore(pts - mine, trapper); }
      else addScore(pts, by);
      if (by) by.kills++;
      popup(cx, cy - 10, pts, k >= 2 ? 2 : 1, b.soaked ? SOAK_COL : KILL_COLS[(k - 1) % KILL_COLS.length], k >= 2 ? 'x' + k : '');
      bossBombCheck(cx, cy, by); // 거품 폭탄: a trapped minion popped against the boss lathers it +3
      if (e) { e.bubble = null; killEnemy(e, k, by); }
      Snd.sfx('kill');
      if (k >= 2) shake(Math.min(6, 1 + k));
      if (chain && k === 2) maybeDropPower(cx, cy);
      if (chain && k === 3) addStamps(1, cx, cy, by);
    } else if (b.kind === 'player') {
      // battle: a trapped opponent. Any other player's touch (or a chain they set off) pops it: 뽀득 KO!
      const v = b.victim; b.victim = null;
      if (v && v.trap && v.trap.b === b) { if (by && by !== v) knockOut(v, by, b); else releasePlayer(v); }
    } else if (b.kind === 'empty') {
      // (a bubble spent on the boss or on a spore scores through that hit instead)
      if (cause !== 'self' && cause !== 'boss' && cause !== 'spore') addScore(10, by);
    } else if (b.kind === 'stamp') {
      if (cause !== 'self') { burst(cx, cy, 12, ['#ff6070', '#ffffff', '#ffd0d0'], 1.8, 18); addStamps(1, cx, cy, by); }
    } else if (b.kind === 'steam') {
      if (cause !== 'self') fireSteam(b, cause, by);
    }
  }
  function chainFrom(b) {
    for (const o of G.bubbles) {
      if (o === b || o.dead || o.state === 'pop' || (o.kind === 'player' && o.grace > 0)) continue;
      const dx = o.x - b.x, dy = o.y - b.y;
      if (dx * dx + dy * dy < CHAIN_DIST * CHAIN_DIST) popBubble(o, b.chain, 'chain');
    }
  }
  function clampBubble(b) {
    if (b.x < WALL_L) { b.x = WALL_L; if (b.vx < 0) b.vx = 0; }
    if (b.x > WALL_R - 16) { b.x = WALL_R - 16; if (b.vx > 0) b.vx = 0; }
    if (b.y < CEIL_Y) { b.y = CEIL_Y; if (b.vy < 0) b.vy = 0; }
    if (b.y > PF_BOT - 14) { b.y = PF_BOT - 14; if (b.vy > 0) b.vy = 0; }
  }
  function floatMove(b) {
    const g = G.gather, cx = b.x + 8, cy = b.y + 8, dx = g.x - cx, dy = g.y - cy;
    let tvx, tvy;
    // rising: drift sideways toward the (off-centre) gather point while climbing; hot water below lifts faster
    if (dy < -14) { tvy = -0.4 * (overHot(b) ? HOT_LIFT : 1); tvx = clamp(dx * 0.015, -0.42, 0.42); }
    else { tvx = clamp(dx * 0.03, -0.35, 0.35); tvy = clamp(dy * 0.03, -0.3, 0.3); }
    if (b.kind === 'stamp' || b.kind === 'steam') { if (b.age < 90) tvx *= 0.3; }
    if (Math.abs(b.vx) > 0.45) b.vx *= 0.8; else b.vx += (tvx - b.vx) * 0.05;
    b.vy += (tvy - b.vy) * 0.07;
    let wob = Math.abs(b.vx) > 0.45 ? 0 : Math.sin((b.age + b.phase) * 0.09) * 0.16;
    if (b.kind === 'trapped' && b.trapMax - b.trapT < FLASH) wob += Math.sin(b.age * 0.9) * 0.45;
    b.x += b.vx + wob; b.y += b.vy;
    clampBubble(b);
  }
  function repel() {
    const bs = G.bubbles;
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i]; if (a.state !== 'float' || a.dead) continue;
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j]; if (b.state !== 'float' || b.dead) continue;
        let dx = b.x - a.x, dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= CLUSTER * CLUSTER) continue;
        let d = Math.sqrt(d2);
        if (d < 0.01) { dx = fxr() - 0.5; dy = fxr() - 0.5; d = Math.hypot(dx, dy) || 1; }
        const push = (CLUSTER - d) * 0.1, ux = dx / d, uy = dy / d;
        a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push;
      }
    }
    for (const b of bs) if (b.state === 'float') clampBubble(b);
  }
  // ---- ice: a bubble touching a cold (냉탕) surface freezes into a 2x2-cell block floating on it
  function iceAt(c, rs) { for (const ice of G.ice) if (!ice.dead && ice.rs === rs && c >= ice.col && c <= ice.col + 1) return true; return false; }
  function rebuildIceTop() {
    ICE_TOP.fill(0);
    for (const ice of G.ice) {
      if (ice.dead) continue;
      const r = ice.rs - 1; if (r < 0) continue;
      ICE_TOP[r * COLS + ice.col] = 1; ICE_TOP[r * COLS + ice.col + 1] = 1;
    }
  }
  function tryFreeze(b) {
    let wi = waterIdx(b.x + 8, b.y + 14);
    if (wi < 0) wi = waterIdx(b.x + 8, b.y + 8);
    if (wi < 0 || WATER[wi] !== 2) return false;
    const rs = SURF[wi], c0 = Math.round(b.x / TS);
    const cands = [c0, c0 - 1, c0 + 1, c0 - 2, c0 + 2];
    const fits = (c, both) => {
      if (c < 2 || c > COLS - 4 || iceAt(c, rs) || iceAt(c + 1, rs)) return false;
      const a = WATER[rs * COLS + c] === 2, z = WATER[rs * COLS + c + 1] === 2;
      return both ? a && z : a || z;
    };
    let col = -1;
    for (const c of cands) if (fits(c, true)) { col = c; break; }
    if (col < 0) for (const c of cands) if (fits(c, false)) { col = c; break; }
    if (col < 0) return false;
    const ice = { id: ++G.seq, col, rs, x: col * TS, y: PF_TOP + (rs - 1) * TS, t: 0, enemy: null, dead: false };
    if (b.kind === 'trapped' && b.enemy) {
      const e = b.enemy; b.enemy = null; e.bubble = null;
      e.state = 'frozen'; e.ice = ice; e.x = ice.x; e.y = ice.y; e.vx = 0; e.vy = 0;
      ice.enemy = e;
    }
    b.dead = true; spend(b);
    G.ice.push(ice);
    rebuildIceTop();
    burst(ice.x + 8, ice.y + 8, 10, ICE_COLS, 1.3, 14);
    Snd.sfx('freeze');
    return true;
  }
  function meltIce(ice) {
    ice.dead = true;
    burst(ice.x + 8, ice.y + 10, 10, ICE_COLS, 1.1, 16);
    splash(ice.x + 8, PF_TOP + ice.rs * TS, 2, 6);
    Snd.sfx('melt');
    // whatever rested on top falls again
    const top = ice.y;
    const onIt = (o) => o && o.onGround && !o.floating && Math.abs(o.y + 16 - top) < 0.5 && o.x + 13 > ice.x && o.x + 3 < ice.x + 16;
    for (const it of G.items) if (onIt(it)) it.onGround = false;
    if (onIt(G.pickup)) G.pickup.onGround = false;
    const e = ice.enemy;
    if (e) {
      ice.enemy = null; e.ice = null;
      addScore(ICE_PTS);
      popup(ice.x + 8, ice.y - 4, ICE_PTS, 1, '#c8f4ff');
      killEnemy(e, 1);
      Snd.sfx('kill');
    }
  }
  function updateIce() {
    if (!G.ice.length) return;
    let changed = false;
    for (const ice of G.ice) {
      if (ice.dead) continue;
      ice.t++;
      if (ice.enemy) { ice.enemy.x = ice.x; ice.enemy.y = ice.y; }
      if (ICE_LIFE - ice.t < 40 && ice.t % 9 === 0 && G.parts.length < 360) G.parts.push({ x: ice.x + 2 + fxr() * 12, y: ice.y + 15, vx: 0, vy: 0.4, life: 12, max: 12, c: '#bff0ff', sz: 1, g: 0.05 });
      if (ice.t >= ICE_LIFE) { meltIce(ice); changed = true; }
    }
    if (changed) { G.ice = G.ice.filter((i) => !i.dead); rebuildIceTop(); }
  }
  // multiplayer: each player keeps at most rule[2] floating empties, everyone together at most rule[3] - one more that
  // starts to float (its shot phase ended, it hit a wall, a frog's newest egg let an old one go) ends that player's
  // oldest: it jumps to the last CAP_BLINK frames of its life, so it blinks, then goes by the plain self-pop of
  // updateBubbles (no score, no chain). Only bubbles not blinking yet count (age <= life). A bubble someone bounced on
  // in the last RIDE_HOLD frames is skipped (the next-oldest goes). Over the shared limit, the player with the most
  // floating gives up its oldest first (a spammer never takes a quiet partner's bubble). Solo: no cap at all.
  // (the snapshots carry the age: a guest's view blinks the same bubbles, no field of its own)
  function capEmpties() {
    const R = emptyRule(), cap = R[2], all = R[3];
    if (!cap && !all) return;
    const life = R[0], endAge = R[0] + R[1] - CAP_BLINK;
    const ridden = (b) => b.rideF !== undefined && G.frame - b.rideF < RIDE_HOLD;
    // (oldest first: the age counts from the blow; same age, the earlier blow)
    const fl = G.bubbles.filter((b) => !b.dead && b.kind === 'empty' && b.state === 'float' && b.age <= life).sort((a, b) => b.age - a.age || a.id - b.id);
    const n = new Map();
    for (const b of fl) n.set(b.owner, (n.get(b.owner) | 0) + 1);
    let left = fl.length;
    const end = (b) => { b.age = endAge; n.set(b.owner, n.get(b.owner) - 1); left--; };
    const capFor = (o) => (G.gameMode === 'battle' ? capOf(G.players.find((q) => q.slot === o)) : 0);
    if (cap) for (const b of fl) if (b.owner >= 0 && n.get(b.owner) > Math.max(cap, capFor(b.owner)) && !ridden(b)) end(b);
    while (all && left > all) {
      let pick = null;
      for (const b of fl) if (b.age <= life && !ridden(b) && (!pick || n.get(b.owner) > n.get(pick.owner))) pick = b;
      if (!pick) break;
      end(pick);
    }
  }
  function updateBubbles() {
    const R = emptyRule(), emptyEnd = R[0] + R[1];
    for (const b of G.bubbles) {
      if (b.dead) continue;
      b.age++;
      if (b.squish > 0) b.squish--;
      if (b.bounceCd > 0) b.bounceCd--;
      if (b.grace > 0) b.grace--;
      if (b.hist && b.state !== 'shot' && G.frame - b.hist[b.hist.length - 1][0] > HIST_KEEP) b.hist = null;
      if (b.state === 'pop') {
        b.popT++;
        if (b.popT === 4 && b.chain) chainFrom(b);
        if (b.popT >= 10) b.dead = true;
        continue;
      }
      const freezable = b.kind === 'empty' || b.kind === 'trapped';
      if (b.state === 'shot') {
        const ev = stepShot(b);
        if (G.gameMode === 'battle') shotNote(b);
        if (b.kind === 'empty' && shotHits(b)) continue;
        // a few frames of grace so a bubble blown while floating on 냉탕 is not frozen in the duck's face (an otter's
        // droplet never freezes)
        if (freezable && !b.drop && b.age >= 4 && waterCells.length && tryFreeze(b)) continue;
        if (ev && ev !== 'wall' && ownerHere(b)) shotSfx(ev);
        if (b.state === 'shot' && --b.shotT <= 0) {
          // (a droplet never floats: it bursts at the end, so a volley leaves at most one floating bubble)
          if (b.drop) { popBubble(b, null, 'self'); continue; }
          b.state = 'float';
        }
        // (the echo comes to rest right behind the duck that blew it: it drifts on a moment before a touch pops it)
        if (b.ty === 'echo' && b.state === 'float') b.grace = Math.max(b.grace, ECHO_GRACE);
        continue;
      }
      floatMove(b);
      if (freezable && waterCells.length && tryFreeze(b)) continue;
      if (b.kind === 'trapped') {
        b.trapT++;
        if (b.soaked && b.age % 16 === 0 && G.parts.length < 360) G.parts.push({ x: b.x + 4 + fxr() * 8, y: b.y + 2, vx: 0, vy: -0.35, life: 16, max: 16, c: SOAK_COL, sz: 1, g: 0 });
        if (b.trapT >= b.trapMax) escape(b);
      } else if (b.kind === 'player') {
        const v = b.victim;
        if (!v || !v.trap || v.trap.b !== b) { b.victim = null; popBubble(b, null, 'self'); }
      } else if (b.kind === 'empty') {
        if (b.age > emptyEnd) popBubble(b, null, 'self');
      } else if (b.age > SPECIAL_LIFE + FLASH) popBubble(b, null, 'self');
    }
    capEmpties();
    repel();
    G.bubbles = G.bubbles.filter((b) => !b.dead);
  }
  // stamp and steam bubbles rise out of the floor drain (배수구)
  function spawnFromGap(kind) {
    const b = makeBubble(kind, LV.gapX - 8, PF_BOT - 14);
    b.vy = -0.7;
    G.bubbles.push(b);
    for (let i = 0; i < 4 && G.parts.length < 360; i++) G.parts.push({ x: LV.gapX - 4 + fxr() * 8, y: PF_BOT - 4, vx: (fxr() - 0.5) * 0.6, vy: -0.6 - fxr() * 0.6, life: 12, max: 12, c: COLD_COLS[i % 3], sz: 1, g: 0.06 });
    return b;
  }
  // Steam blast. When the duck pops the steam bubble itself, the blast leaves from the duck and rolls along
  // the surface the duck stands on (or is just above, e.g. mid-jump into an overhead bubble), so it sweeps
  // the duck's own row. A steam bubble set off by a chain blows from where it was.
  function fireSteam(b, cause, by) {
    const p = by || G.p, dir = p.facing || 1;
    let x = b.x, y = b.y, ty = b.y;
    if (cause === 'player' && p && !p.dead) {
      x = clamp(p.x + dir * 6, WALL_L, WALL_R - 16);
      y = clamp(p.y, CEIL_Y, PF_BOT - 16);
      ty = y;
      if (!p.onGround) {
        const t = landTile(p.x + 3, p.x + 13, p.y + 16, p.y + 16 + 44);
        if (t !== null) ty = clamp(t - 16, CEIL_Y, PF_BOT - 16);
      }
    }
    G.bolts.push({ id: ++G.seq, x, y, ty, dir, t: 0, dead: false, by: cause === 'player' ? p : by || null });
    Snd.sfx('steam'); shake(2);
    burst(b.x + 8, b.y + 8, 10, STEAM_COLS, 1.6, 16);
    if (x !== b.x || y !== b.y) burst(x + 8, y + 8, 8, STEAM_COLS, 1.4, 14);
  }

  // ------------------------------------------------------------------ enemies
  function groundAhead(e) {
    const fx = e.dir > 0 ? e.x + 14 : e.x + 2;
    const c = Math.floor(fx / TS), r = Math.round(e.y / TS);
    return solidCell(c, r) || iceTop(c, r);
  }
  function platformAbove(e) {
    const stand = Math.round(e.y / TS), c = Math.floor((e.x + 8) / TS);
    for (let k = 2; k <= 4; k++) { const r = stand - k; if (r >= 1 && solidCell(c, r) && !solidCell(c, r - 1)) return true; }
    return false;
  }
  function killEnemy(e, k, by) {
    if (e.bubble) {
      // killed while trapped (steam blast, debug): its bubble bursts (pop animation, no chain)
      const b = e.bubble; b.enemy = null; e.bubble = null;
      if (!b.dead && b.state !== 'pop') { b.state = 'pop'; b.popT = 0; b.chain = null; b.vx = 0; b.vy = 0; }
    }
    if (e.ice) { e.ice.enemy = null; e.ice = null; }
    e.state = 'dead'; e.deadT = 0; e.chainK = k || 1; e.gone = false; e.soakT = 0;
    const from = by || aim(e.x, e.y);
    const away = e.x + 8 < from.x + 8 ? -1 : 1;
    e.vx = away * rr(1.0, 2.0); e.vy = -rr(3.6, 4.6);
    burst(e.x + 8, e.y + 8, 10, STAR_COLS, 2, 16);
  }
  function pickItem(k) {
    let idx = Math.min(5, Math.floor(G.round / 4)) + Math.min(2, G.loop) + (k - 1) + (rng() < 0.3 ? 1 : 0);
    return clamp(idx, 0, ITEM_TYPES.length - 1);
  }
  function spawnItem(e, y, airborne) {
    const idx = pickItem(e.chainK);
    const x = clamp(e.x, WALL_L - 2, WALL_R - 14);
    // a snack that lands on a pool floor bobs up to the surface instead of staying underwater
    G.items.push({ id: ++G.seq, type: ITEM_TYPES[idx], value: ITEM_VALUES[idx], x, y, vx: 0, vy: 0, onGround: !airborne && waterIdx(x + 8, y + 15) < 0, floating: false, age: 0 });
    burst(e.x + 8, y + 10, 6, ['#ffffff', '#fff4b0'], 1, 10);
  }
  function updateDead(e) {
    e.deadT++;
    const vy0 = e.vy; e.vy = Math.min(MAX_FALL, e.vy + 0.2);
    const f0 = e.y + 16;
    e.x += e.vx; e.y += (vy0 + e.vy) / 2;
    if (e.x < WALL_L - 2) { e.x = WALL_L - 2; e.vx = Math.abs(e.vx) * 0.85; }
    else if (e.x > WALL_R - 14) { e.x = WALL_R - 14; e.vx = -Math.abs(e.vx) * 0.85; }
    if (e.vy < 0 && e.y < CEIL_Y - 2) { e.y = CEIL_Y - 2; e.vy = 0.4; }
    if (e.deadT > 24 && e.vy > 0) {
      const t = landTile(e.x + 3, e.x + 13, f0, e.y + 16);
      if (t !== null) { spawnItem(e, t - 16); e.gone = true; return; }
    }
    wrapY(e);
    if (e.deadT > 420) { spawnItem(e, clamp(e.y, CEIL_Y, PF_BOT - 24), true); e.gone = true; }
  }
  function grimeAI(e, mul) {
    const p = aim(e.x, e.y, e);
    if (e.jumpCd > 0) e.jumpCd--;
    if (!e.onGround) return;
    e.vx = e.dir * 0.6 * mul;
    if (!e.committed && !groundAhead(e)) {
      const below = p.y > e.y + 8;
      if (rng() < (below ? (e.angry ? 0.85 : 0.6) : 0.25)) e.committed = true;
      else { e.dir = -e.dir; e.vx = -e.vx; }
    }
    if (e.jumpCd <= 0 && p.y < e.y - 10 && rng() < (e.angry ? 0.05 : 0.02) && platformAbove(e)) { e.vy = JUMP_V; e.onGround = false; e.jumpCd = 50; }
    if (e.angry && Math.abs(p.y - e.y) < 8 && rng() < 0.03) { const d = sign(p.x - e.x); if (d && d !== e.dir) { e.dir = d; e.vx = d * 0.6 * mul; } }
  }
  function moldAI(e, mul) {
    if (!e.onGround) return;
    e.vx *= 0.5; if (Math.abs(e.vx) < 0.05) e.vx = 0;
    if (e.hopT > 0) { e.hopT--; return; }
    const d = sign(aim(e.x, e.y, e).x - e.x) || e.dir; e.dir = d;
    e.vy = -3.2 * (e.angry ? 1.12 : 1); e.vx = d * 0.85 * mul; e.onGround = false;
    e.hopT = e.angry ? ri(14, 30) : ri(36, 70);
  }
  function flyAI(e, mul) {
    const sp = 0.7 * mul, p = aim(e.x, e.y, e);
    if (!e.fvx) { e.fvx = e.dir; e.fvy = 1; }
    if (e.angry && rng() < 0.025) { e.fvx = sign(p.x - e.x) || e.fvx; e.fvy = sign(p.y - e.y) || e.fvy; }
    e.vx = e.fvx * sp; e.vy = e.fvy * sp;
    e.x += e.vx; e.y += e.vy;
    if (e.x < WALL_L - 2) { e.x = WALL_L - 2; e.fvx = 1; } else if (e.x > WALL_R - 14) { e.x = WALL_R - 14; e.fvx = -1; }
    if (e.y < CEIL_Y) { e.y = CEIL_Y; e.fvy = 1; } else if (e.y > PF_BOT - 24) { e.y = PF_BOT - 24; e.fvy = -1; }
    // flies never touch the bath water: they bounce off the surface
    if (waterCells.length) {
      const wi = waterIdx(e.x + 8, e.y + 15);
      if (wi >= 0) { e.y = surfY(wi) - 16; e.fvy = -1; }
    }
    e.dir = e.fvx;
  }
  function spongeAI(e, mul) {
    const p = aim(e.x, e.y, e);
    if (e.windT > 0) { e.windT--; e.vx = 0; if (e.windT === 0) e.chargeT = 60; return; }
    if (e.chargeT > 0) {
      e.chargeT--; e.vx = e.dir * 2.0 * G.loopMul * (e.angry ? 1.15 : 1);
      if (e.chargeT === 0) e.chargeCd = e.angry ? 30 : 60;
      if (e.onGround && !groundAhead(e)) e.committed = true;
      return;
    }
    if (e.chargeCd > 0) e.chargeCd--;
    if (!e.onGround) return;
    e.vx = e.dir * 0.5 * mul;
    if (!e.committed && !groundAhead(e)) {
      if (rng() < (p.y > e.y + 8 ? 0.5 : 0.15)) e.committed = true; else { e.dir = -e.dir; e.vx = -e.vx; }
    }
    if (e.chargeCd <= 0 && p.onGround && !p.dead && Math.abs(p.y - e.y) < 6 && (p.x - e.x) * e.dir > 0 && Math.abs(p.x - e.x) < 150) e.windT = e.angry ? 8 : 16;
  }
  function updateEnemy(e) {
    e.t++;
    if (e.grace > 0) e.grace--; // a minion just spat out by a boss is harmless (and blinks) for a moment
    if (e.state === 'descend') {
      const t = clamp((e.t - e.delay) / 70, 0, 1), k = 1 - Math.pow(1 - t, 3);
      e.y = lerp(e.startY, e.spawnY, k);
      if (t >= 1) { e.state = 'active'; e.y = e.spawnY; e.onGround = e.type !== 'fly'; e.hopT = ri(20, 60); if (e.type === 'fly') { e.fvx = e.dir; e.fvy = 1; } }
      return;
    }
    if (e.state === 'trapped') { if (e.bubble) { e.x = e.bubble.x; e.y = e.bubble.y; } return; }
    if (e.state === 'frozen') { if (e.ice) { e.x = e.ice.x; e.y = e.ice.y; } return; }
    if (e.state === 'dead') { updateDead(e); return; }
    if (e.soakT > 0) {
      e.soakT--;
      if (e.t % 14 === 0 && G.parts.length < 360) G.parts.push({ x: e.x + 4 + fxr() * 8, y: e.y + 3, vx: (fxr() - 0.5) * 0.2, vy: -0.4, life: 18, max: 18, c: SOAK_COL, sz: 1, g: 0 });
    }
    const soakSlow = e.soakT > 0 ? SOAK_SLOW : 1;
    const mul = (e.angry ? 1.6 : 1) * G.loopMul;
    if (e.type === 'fly') { flyAI(e, mul * soakSlow); return; }
    // wading: ground enemies walk along the pool floor, slowed; hot water leaves them soaked
    const wi = waterCells.length ? waterIdx(e.x + 8, e.y + 12) : -1;
    const wasW = e.water;
    e.water = wi >= 0 ? WATER[wi] : 0;
    if (e.water === 1) e.soakT = Math.max(e.soakT, SOAK_FRAMES);
    if (e.water && !wasW) splash(e.x + 8, surfY(wi), e.water, 5);
    const slow = e.water ? WADE : soakSlow;
    if (e.type === 'grime') grimeAI(e, mul);
    else if (e.type === 'mold') moldAI(e, mul);
    else spongeAI(e, mul);
    const wasG = e.onGround, vx0 = e.vx;
    e.vx *= slow;
    const hit = physBody(e);
    e.vx = vx0;
    if (hit) { e.dir = -hit; if (e.type !== 'mold') e.vx = -e.vx; if (e.chargeT > 0) { e.chargeT = 0; e.chargeCd = 40; } }
    if (!wasG && e.onGround) e.committed = false;
  }

  // ------------------------------------------------------------------ scalding drops (샤워기 고장)
  function spawnDrop(col) {
    col = clamp(col | 0, 2, COLS - 3);
    let r = 1; while (r < ROWS - 2 && solidCell(col, r)) r++; // forms under the ceiling (or a ceiling block)
    const d = { id: ++G.seq, col, x: col * TS, y: PF_TOP + r * TS, vy: 0, t: 0, state: 'form', dead: false };
    G.drops.push(d);
    Snd.sfx('scald_warn');
    return d;
  }
  function pickDropCol() {
    const p = multi() ? G.players[G.dropN % G.players.length] : G.p; // (co-op: aimed near each player in turn)
    for (let k = 0; k < 8; k++) {
      // a third of the drops aim near the duck so standing still is never perfectly safe
      const c = p && !p.dead && rng() < 0.35 ? clamp(Math.floor((p.x + 8) / TS) + ri(-3, 3), 2, COLS - 3) : ri(2, COLS - 3);
      if (G.drops.some((d) => d.state === 'form' && Math.abs(d.col - c) < 2)) continue;
      return c;
    }
    return ri(2, COLS - 3);
  }
  function dropSplash(d, y, quiet) {
    d.dead = true;
    for (let i = 0; i < 7 && G.parts.length < 380; i++) G.parts.push({ x: d.x + 4, y: y - 1, vx: (i - 3) * 0.38 + (fxr() - 0.5) * 0.2, vy: -0.5 - fxr() * 1.0, life: 14, max: 14, c: SCALD_COLS[i % 3], sz: 1, g: 0.09 });
    if (G.parts.length < 380) G.parts.push({ x: d.x + 3, y: y - 3, vx: 0, vy: -0.35, life: 20, max: 20, c: '#ffffff', sz: 2, g: 0 });
    if (!quiet) Snd.sfx('scald_splash');
  }
  function clearDrops(fx) {
    if (fx) for (const d of G.drops) if (!d.dead) dropSplash(d, d.y + 6, true);
    G.drops = [];
  }
  function updateDrops() {
    if (!G.drops.length) return;
    for (const d of G.drops) {
      if (d.dead) continue;
      d.t++;
      if (d.state === 'form') { if (d.t >= DROP_FORM) { d.state = 'fall'; d.vy = 0.4; } continue; }
      const f0 = d.y + 8;
      d.vy = Math.min(4.2, d.vy + GRAV);
      d.y += d.vy;
      const wi = waterIdx(d.x + 4, d.y + 8);
      if (wi >= 0) { dropSplash(d, surfY(wi)); continue; }
      const t = landTile(d.x + 2, d.x + 6, f0, d.y + 8);
      if (t !== null) { dropSplash(d, t); continue; }
      if (d.y + 8 >= PF_BOT) d.dead = true; // straight down the drain
    }
    G.drops = G.drops.filter((d) => !d.dead);
  }

  // ------------------------------------------------------------------ bosses (보스전)
  // A boss round (level with `boss`) has one 32x32 boss and no placed enemies. Capture-phase bubbles cannot
  // trap it: each one that hits it lathers it (+1 soap, 비누칠); a trapped minion popped against it adds +3
  // (거품 폭탄). A full soap gauge seals the boss inside a giant bubble that floats up for ~4 s: the duck bursts
  // it by touching it (one HP segment), the boss is knocked down and gets up one phase angrier; if nobody
  // bursts it the boss breaks out unharmed. Every attack is telegraphed (crouch, "!" marks, warning bands,
  // target marks) and harmless states (intro, giant bubble, knocked down, defeat) never kill the duck.
  // States: intro -> fight <-> stun -> down -> fight ... -> defeat.
  const bossK = () => 1 + Math.min(G.loop, 3) * 0.08; // 2회차+: a touch quicker
  function makeBoss(L) {
    const type = BOSS_DEF[L.boss] ? L.boss : 'kingGrime', def = BOSS_DEF[type];
    const sp = L.bossSpawn || { col: 14, row: def.fly ? 3 : 2 };
    const x = clamp(sp.col * TS, WALL_L, WALL_R - 32), y = clamp(PF_TOP + sp.row * TS, CEIL_Y, PF_BOT - 40);
    const face = x + 16 > W / 2 ? -1 : 1;
    // co-op: more soap needed per extra player (HP unchanged); a battle's intruder is weaker (half soap, 1 HP)
    const intruder = G.gameMode === 'battle';
    const soapMax = intruder ? Math.max(2, Math.round(def.soap * 0.5)) : Math.round(def.soap * soapScale());
    return { type, def, num: def.num, name: def.name, x, y: y - 32, sx: x, sy: y, vx: 0, vy: 0, dir: face, face, onGround: false,
      hp: intruder ? 1 : BOSS_HP, phase: 1, soap: 0, soapMax, state: 'intro', t: 0, entered: false,
      act: 'rest', actT: 0, atkCd: 0, minionT: 0, calm: 0, dropRow: -1, hitFlash: 0, sq: 0, giant: null, stunT: 0,
      second: false, tx: 0, ty: 0, side: face, cycle: 0, dropT: 60, mittT: 0, bob: rng() * 6, pts: 0, intruder, lastBy: null };
  }
  const coopHurry = () => (G.gameMode === 'coop' ? 240 * Math.max(0, G.players.length - 1) : 0);
  const soapScale = () => (G.gameMode === 'coop' ? 1 + COOP_SOAP * (G.players.length - 1) : 1);
  const minionPace = () => (G.gameMode === 'coop' ? 1 - 0.12 * Math.max(0, Math.min(3, G.players.length - 1)) : 1);
  // (몬스터 출현 off: no minions either - minionCount() counts the arena enemies too, so with the arena empty an
  // intruder would otherwise summon up to MINION_CAP of its own; its spores wither; design/distinction.md 3.3)
  const minionCap = () => (G.gameMode === 'battle' && G.opts.monsters === false ? 0 : MINION_CAP + (G.gameMode === 'coop' ? G.players.length - 1 : 0));
  function spawnHazard(o) {
    if (G.hazards.length > 64) return null;
    o.id = ++G.seq; o.t = 0; o.dead = false; G.hazards.push(o); return o;
  }
  function hazardCenter(h) {
    if (h.kind === 'wave') return [h.x + 8, h.y - 4];
    if (h.kind === 'spore') return [h.x + 4, h.y + 4];
    if (h.kind === 'mitt') return [h.x + 8, h.y + 8];
    return [clamp(h.x + 12, WALL_L, WALL_R), h.sy - 6];
  }
  function clearHazards(fx) {
    if (fx) for (const h of G.hazards) if (!h.dead && (h.kind !== 'sweep' || h.state === 'go')) { const c = hazardCenter(h); burst(c[0], c[1], 5, ['#ffffff', '#e8e0d0'], 0.9, 10); }
    G.hazards = [];
  }
  function foamPuff(x, y, n, spread, rmax) {
    for (let i = 0; i < n && G.foam.length < 160; i++) {
      G.foam.push({ x: x + (fxr() - 0.5) * spread, y: y + (fxr() - 0.5) * spread * 0.7, r: 1.5 + fxr() * rmax, vx: (fxr() - 0.5) * 1.3, vy: -0.25 - fxr() * 0.7, life: 26 + ((fxr() * 22) | 0), max: 48 });
    }
  }
  function minionCount() { let n = 0; for (const e of G.enemies) if (e.state !== 'dead') n++; return n; }
  // how: 'pop' = flung out of the boss in a hop, 'stand' = already standing (feet at cy + 8), 'sink' = dropped into water
  function spawnMinion(type, cx, cy, dir, how) {
    const e = makeEnemy({ type, col: 2, row: 2, dir }, 0);
    e.state = 'active'; e.minion = true; e.grace = MINION_GRACE; e.hopT = ri(30, 60); e.delay = 0;
    e.x = clamp(cx - 8, WALL_L - 2, WALL_R - 14); e.y = clamp(cy - 8, CEIL_Y, PF_BOT - 24); e.spawnY = e.y;
    if (type === 'fly') { e.fvx = dir; e.fvy = -1; e.onGround = false; }
    else if (how === 'stand') { e.onGround = true; }
    else if (how === 'sink') { e.onGround = false; e.vx = 0; e.vy = 0.5; }
    else { e.onGround = false; e.vx = dir * rr(0.6, 1.2); e.vy = -rr(2.2, 3.0); }
    if (G.boss && G.boss.phase >= 3) e.angry = true;
    G.enemies.push(e);
    return e;
  }
  function bossMinions(b, n) {
    n = Math.min(n, minionCap() - minionCount());
    if (n <= 0) return 0;
    const cx = b.x + 16, cy = b.y + 14, list = b.def.minions;
    for (let i = 0; i < n; i++) {
      let dir = i & 1 ? -1 : 1;
      if (cx < WALL_L + 40) dir = 1; else if (cx > WALL_R - 40) dir = -1;
      spawnMinion(list[ri(0, list.length - 1)], cx + dir * 6, cy, dir, 'pop');
    }
    foamPuff(cx, cy, 6, 18, 3);
    burst(cx, cy, 12, ['#ffffff', '#e8dcc8', '#c8f4ff'], 1.7, 16);
    Snd.sfx('escape');
    return n;
  }
  // ground boss physics: a 26 px foot span (wider than the 3-column drains of the ground arenas), one-way
  // platforms like everyone else, plus an optional platform row to drop through (dropRow)
  function bossPhys(b) {
    b.x += b.vx;
    let hit = 0;
    if (b.x < WALL_L) { b.x = WALL_L; hit = -1; } else if (b.x > WALL_R - 32) { b.x = WALL_R - 32; hit = 1; }
    const vy0 = b.vy;
    b.vy = Math.min(5, b.vy + BOSS_G);
    const f0 = b.y + 32;
    b.y += (vy0 + b.vy) / 2;
    b.onGround = false;
    if (b.vy >= 0) {
      const t = landTile(b.x + 3, b.x + 29, f0, b.y + 32, b.dropRow);
      if (t !== null) { b.y = t - 32; b.vy = 0; b.onGround = true; b.dropRow = -1; }
    }
    if (b.y < CEIL_Y) { b.y = CEIL_Y; if (b.vy < 0) b.vy = 0; }
    if (b.y + 32 > PF_BOT) b.y -= PF_H; // never lost below the drain: back in from the showerhead
    return hit;
  }
  // left / right x of the platform top under the feet x0..x1 at feetY (null when there is none)
  function platformSpan(x0, x1, feetY) {
    const r = Math.round((feetY - PF_TOP) / TS);
    const top = (c) => c >= 2 && c <= COLS - 3 && ((solidCell(c, r) && !solidCell(c, r - 1)) || iceTop(c, r));
    let a = -1, z = -1;
    for (let c = Math.floor(x0 / TS); c <= Math.floor((x1 - 0.001) / TS); c++) if (top(c)) { if (a < 0) a = c; z = c; }
    if (a < 0) return null;
    while (top(a - 1)) a--;
    while (top(z + 1)) z++;
    return [a * TS, (z + 1) * TS];
  }
  // the surface the duck (the boss's current target) stands on, or will land on
  function duckLevel(p) {
    p = p || G.p;
    if (p.onGround || p.water) return p.y + 16;
    const t = landTile(p.x + 3, p.x + 13, p.y + 16, p.y + 16 + 200);
    return t !== null ? t : p.y + 16;
  }

  // ---- intro: hidden while the round name shows, drops in, lands with "… 등장!" and its music
  function bossEntrance(b) {
    if (b.entered) return;
    b.entered = true;
    b.y = b.sy; b.vy = 0;
    if (!b.def.fly) { b.onGround = true; b.sq = 0.3; shake(4); Snd.sfx('shockwave'); burst(b.x + 16, b.y + 31, 14, ['#e8dcc8', '#ffffff', '#c9b48e'], 1.6, 16); }
    else { b.onGround = false; burst(b.x + 16, b.y + 16, 16, b.type === 'moldQueen' ? ['#b48cff', '#d6ff9a', '#ffffff'] : ['#3cc464', '#ffd23f', '#ffffff'], 1.8, 18); }
    Snd.sfx('boss_roar');
    bossBanner(b.name + ' 등장!', b.def.hint, 110, 'boss');
    if (!b.intruder) setMusic(b.def.music); // (a battle keeps its own music)
  }
  function bossIntro(b) {
    const t = b.t;
    if (t < BOSS_DROP0) { b.y = b.sy - 32; return; }
    if (t < BOSS_LAND) { const k = (t - BOSS_DROP0) / (BOSS_LAND - BOSS_DROP0); b.y = b.sy - 32 + 32 * (b.def.fly ? easeIO(k) : k * k); return; }
    if (!b.entered) bossEntrance(b);
    if (t >= BOSS_FIGHT) startFight(b);
  }
  function restAct(b) { return b.type === 'towelKing' ? 'hover' : b.type === 'moldQueen' ? 'float' : 'rest'; }
  function startFight(b) {
    if (!b.entered) bossEntrance(b);
    b.state = 'fight'; b.t = 0; b.act = restAct(b); b.actT = 30; b.second = false;
    b.minionT = 150; b.atkCd = 70; b.calm = 0;
    bossSpare(b);
  }
  // the boss turns harmful again (fight start, getting up): a duck standing in it gets a moment to step out
  function bossSpare(b) {
    for (const p of G.players) if (p && !p.dead && overlap(p.x + 2, p.y + 2, 12, 14, b.x + 2, b.y + 2, 28, 30)) p.invuln = Math.max(p.invuln, 50);
  }
  function bossFight(b) {
    if (b.calm > 0) b.calm--;
    if (--b.minionT <= 0) {
      // (the queen's spores grow molds too; co-op: minions come 12 % sooner per extra player)
      b.minionT = Math.round((MINION_EVERY[b.phase] + (b.type === 'moldQueen' ? 240 : 0)) * minionPace());
      if (!aim(b.x + 16, b.y + 16).dead && b.calm <= 0) bossMinions(b, b.phase === 1 ? 2 : b.phase === 2 ? ri(2, 3) : 3); else b.minionT = 60;
    }
    // angrier phases steam from the head
    if (b.phase >= 2 && b.t % (b.phase >= 3 ? 8 : 16) === 0 && G.parts.length < 360) {
      G.parts.push({ x: b.x + 8 + fxr() * 16, y: b.y + 2, vx: (fxr() - 0.5) * 0.3, vy: -0.5 - fxr() * 0.4, life: 18, max: 18, c: b.phase >= 3 ? '#ff8a7a' : '#ffffff', sz: 2, g: 0 });
    }
    if (b.type === 'kingGrime') aiGrime(b);
    else if (b.type === 'moldQueen') aiMold(b);
    else if (b.type === 'megaSponge') aiSponge(b);
    else aiTowel(b);
  }

  // ---- 1. 왕때꼬마: heavy hops toward the duck (crouch first, shadow shows the landing); every landing rolls a
  //         shockwave both ways along the surface it landed on (jump over it). Phase 3: double hops.
  const GR_REST = [0, 72, 60, 48], GR_VX = [0, 1.35, 1.55, 1.75], GR_WAVE = [0, 1.35, 1.55, 1.75], GR_CROUCH = 24, GR_CROUCH2 = 18;
  // hop height follows the duck: high to climb to it, low to step down to it, and along its own level never
  // high enough to be caught by the platform overhead (platforms are 32 px apart). On the duck's level he
  // mixes in stomps (a jump on the spot): every 2nd move in phase 1, every 3rd in phase 2.
  function grimeLeap(b, pc, bc) {
    const lvl = duckLevel(b.tgt), bf = b.y + 32, up = lvl < bf - 20, down = lvl > bf + 12;
    b.act = 'air'; b.onGround = false;
    b.stomp = !up && !down && !b.second && b.phase < 3 && (b.cycle++ % (b.phase === 1 ? 2 : 3)) === (b.phase === 1 ? 1 : 2);
    if (b.stomp) { b.vy = -3.0; b.vx = 0; b.sq = -0.2; return; }
    // climbing: just high enough to clear the duck's shelf (+14 px), never so high that it sails past it and
    // lands on the shelf above the duck's head
    const rise = bf - lvl;
    let air;
    if (up) {
      const v = clamp(Math.sqrt(2 * BOSS_G * (rise + 14)), 4.2, 6.2);
      b.vy = -v;
      air = (v + Math.sqrt(Math.max(0, v * v - 2 * BOSS_G * rise))) / BOSS_G;
    } else {
      b.vy = down ? -2.6 : -3.7;
      air = (2 * -b.vy) / BOSS_G + (down ? 14 : 0);
    }
    let tx = pc + (b.phase === 1 ? rr(-12, 12) : 0);
    if (down) {
      // the duck is below: hop off this platform (toward the nearer edge when the duck is right under it).
      // Only an edge it can clear counts: a shelf end with less than its foot span of room before the wall
      // would just catch it again (it used to hop in place there forever).
      const span = platformSpan(b.x + 3, b.x + 29, bf);
      if (span && pc > span[0] - 12 && pc < span[1] + 12) {
        const openL = span[0] - WALL_L >= 28, openR = WALL_R - span[1] >= 28;
        const left = openL && (!openR || bc - span[0] < span[1] - bc);
        if (openL || openR) tx = left ? span[0] - 20 : span[1] + 20;
      }
    }
    const vmax = GR_VX[b.phase];
    b.vx = clamp((tx - bc) / air, -vmax, vmax);
    if (down && Math.abs(b.vx) < 0.9) b.vx = 0.9 * (sign(tx - bc) || b.face);
    b.vx *= bossK();
    b.face = sign(b.vx) || b.face;
    b.sq = -0.22;
  }
  function aiGrime(b) {
    const p = b.tgt = aim(b.x + 16, b.y + 16), pc = p.x + 8, bc = b.x + 16;
    const wasG = b.onGround;
    if (b.act === 'rest') {
      if (b.onGround) {
        b.vx = 0;
        if (!p.dead) b.face = sign(pc - bc) || b.face;
        if (--b.actT <= 0 && b.calm <= 0 && !p.dead) { b.act = 'crouch'; b.actT = b.crouchMax = GR_CROUCH; }
      }
    } else if (b.act === 'crouch') {
      b.vx = 0;
      b.sq = Math.max(b.sq, 0.1 + 0.12 * (1 - b.actT / (b.crouchMax || GR_CROUCH)));
      if (--b.actT <= 0) grimeLeap(b, pc, bc);
    }
    const hit = bossPhys(b);
    if (hit && b.act === 'air') b.vx = 0; // slides down the wall (no bounce back onto the ledge it left)
    if (b.act === 'air' && b.onGround && !wasG) {
      const fy = b.y + 32, v = GR_WAVE[b.phase] * bossK();
      spawnHazard({ kind: 'wave', x: b.x - 8, y: fy, vx: -v });
      spawnHazard({ kind: 'wave', x: b.x + 24, y: fy, vx: v });
      Snd.sfx('shockwave'); shake(3); b.sq = 0.3; b.vx = 0;
      burst(b.x + 16, fy - 1, 12, ['#e8dcc8', '#ffffff', '#c9b48e'], 1.5, 14);
      if (b.phase >= 3 && !b.second) { b.second = true; b.act = 'crouch'; b.actT = b.crouchMax = GR_CROUCH2; }
      else { b.second = false; b.act = 'rest'; b.actT = GR_REST[b.phase]; }
    }
  }

  // ---- 2. 곰팡이 여왕: floats left-right near the ceiling; every few seconds she stops, glows and lobs a 3-spread
  //         of spores (5-spread and flying lower in phase 3). A landed spore grows into a mold in 3 s.
  // cruising height: the top third of the bath, low enough that a jump from the middle shelves lines a shot up
  // with her for a good half second (phase 3 comes down to the shelves)
  const MQ_Y = [0, 50, 54, 78], MQ_V = [0, 0.55, 0.72, 0.9], MQ_CD = [0, 150, 120, 100];
  function aiMold(b) {
    const p = b.tgt = aim(b.x + 16, b.y + 16);
    if (b.act === 'charge') {
      b.vx *= 0.85;
      if (!p.dead) b.face = sign(p.x + 8 - (b.x + 16)) || b.face;
      if (--b.actT <= 0) { fireSpores(b); b.act = 'float'; b.atkCd = MQ_CD[b.phase]; }
    } else {
      b.act = 'float';
      const v = MQ_V[b.phase] * bossK();
      if (b.x <= WALL_L + 1) b.dir = 1; else if (b.x >= WALL_R - 33) b.dir = -1;
      b.vx += (b.dir * v - b.vx) * 0.08;
      b.face = b.dir;
      if (--b.atkCd <= 0 && b.calm <= 0 && !p.dead) { b.act = 'charge'; b.actT = 36; }
    }
    const ty = MQ_Y[b.phase] + Math.sin(b.t * 0.045 + b.bob) * 3;
    b.x = clamp(b.x + b.vx, WALL_L, WALL_R - 32);
    b.y += clamp((ty - b.y) * 0.06, -1.1, 1.1);
  }
  function fireSpores(b) {
    const n = b.phase >= 3 ? 5 : 3, p = b.tgt || aim(b.x + 16, b.y + 16);
    const cx = b.x + 16, cy = b.y + 22;
    const aim = clamp((p.x + 8 - cx) / 110, -0.9, 0.9), step = n === 5 ? 0.62 : 0.85;
    for (let i = 0; i < n; i++) {
      const o = i - (n - 1) / 2;
      spawnHazard({ kind: 'spore', state: 'fly', x: cx - 4, y: cy - 4, vx: aim + o * step, vy: -1.25 - Math.abs(o) * 0.12, hatch: 0, wet: 0 });
    }
    Snd.sfx('spore');
    burst(cx, cy, 8, ['#b48cff', '#d6ff9a', '#ffffff'], 1.2, 12);
  }

  // ---- 3. 대왕 수세미: walks after the duck along its shelf; when level with the duck it winds up (0.6 s: shaking
  //         + "!") and charges along its shelf: it slams into a wall -> dizzy 1 s (soap hits count double), or skids
  //         to a stop at an open shelf end (a charge never flies off onto the shelf below). Squats (shaking) before
  //         it hops up a shelf or drops through its own shelf to follow the duck.
  const MS_WALK = [0, 0.42, 0.55, 0.7], MS_RUN = [0, 2.4, 2.85, 3.3], MS_REST = [0, 54, 40, 28], MS_SQUAT = 18;
  // is there floor under the leading foot (a gap narrower than the sponge, like the drain, does not count)?
  function spongeFloorAhead(b, nx) {
    const lead = b.dir > 0 ? nx + 29 : nx + 3, r = Math.round((b.y + 32 - PF_TOP) / TS);
    const c = Math.floor(lead / TS);
    if (c < 2 || c > COLS - 3) return true; // the wall: it slams into it
    for (let k = 0; k <= 3; k++) { const cc = c + b.dir * k; if (cc < 2 || cc > COLS - 3 || solidCell(cc, r) || iceTop(cc, r - 1)) return true; }
    return false;
  }
  function aiSponge(b) {
    const p = b.tgt = aim(b.x + 16, b.y + 16), pc = p.x + 8, bc = b.x + 16;
    const wasG = b.onGround;
    switch (b.act) {
      case 'rest': if (b.onGround) b.vx = 0; if (--b.actT <= 0 && b.onGround) spongeNext(b); break;
      case 'walk':
        if (b.onGround) { b.dir = sign(pc - bc) || b.dir; b.face = b.dir; b.vx = b.dir * MS_WALK[b.phase] * bossK(); }
        if (--b.actT <= 0 && b.onGround) spongeNext(b);
        break;
      case 'wind': b.vx = 0; if (--b.actT <= 0) { b.act = 'charge'; b.actT = 160; Snd.sfx('steam'); } break;
      case 'charge':
        b.vx = b.dir * MS_RUN[b.phase] * bossK();
        if (b.onGround && !spongeFloorAhead(b, b.x + b.vx)) {
          // the end of its shelf: skid to a stop, teetering
          b.vx = 0; b.act = 'rest'; b.actT = MS_REST[b.phase]; b.sq = 0.22; shake(1);
          burst(b.x + 16 + b.dir * 12, b.y + 31, 10, ['#e8dcc8', '#ffffff', '#c9b48e'], 1.2, 12);
          break;
        }
        if (b.onGround && b.t % 3 === 0 && G.parts.length < 360) G.parts.push({ x: b.x + 16 - b.dir * 14, y: b.y + 30, vx: -b.dir * 0.6, vy: -0.4, life: 14, max: 14, c: '#e8dcc8', sz: 2, g: 0.03 });
        if (--b.actT <= 0) { b.act = 'rest'; b.actT = MS_REST[b.phase]; }
        break;
      case 'dizzy': if (b.onGround) b.vx *= 0.8; if (--b.actT <= 0) { b.act = 'rest'; b.actT = MS_REST[b.phase] >> 1; } break;
      case 'squat':
        b.vx = 0; b.sq = Math.max(b.sq, 0.08 + 0.16 * (1 - b.actT / MS_SQUAT));
        if (b.actT % 4 === 0 && G.parts.length < 360) for (const d of [-1, 1]) G.parts.push({ x: b.x + 16 + d * 15, y: b.y + 31, vx: d * 0.9, vy: -0.4, life: 14, max: 14, c: '#e8dcc8', sz: 2, g: 0.02 });
        if (--b.actT <= 0) spongeHop(b);
        break;
      default: break; // 'hop': airborne until it lands
    }
    const hit = bossPhys(b);
    if (hit && b.act === 'charge') {
      b.act = 'dizzy'; b.actT = 60; b.vx = -b.dir * 1.1; b.vy = -1.8; b.onGround = false;
      shake(4); Snd.sfx('shockwave');
      burst(hit < 0 ? WALL_L + 2 : WALL_R - 2, b.y + 16, 14, ['#ffe36b', '#ffffff', '#4fa3f0'], 1.8, 16);
    } else if (hit && b.act === 'walk') b.vx = 0;
    if (b.act === 'hop' && b.onGround && !wasG) { b.act = 'rest'; b.actT = MS_REST[b.phase]; b.vx = 0; b.sq = 0.25; shake(2); }
  }
  function spongeNext(b) {
    const p = b.tgt || aim(b.x + 16, b.y + 16);
    if (p.dead || b.calm > 0) { b.act = 'rest'; b.actT = 20; return; }
    const pc = p.x + 8, bc = b.x + 16, dy = duckLevel(p) - (b.y + 32);
    const feetRow = Math.round((b.y + 32 - PF_TOP) / TS);
    if (Math.abs(dy) <= 10) { b.act = 'wind'; b.actT = 36; b.dir = sign(pc - bc) || b.dir; b.face = b.dir; return; }
    if (dy < -18 || (dy > 18 && feetRow < ROWS - 1)) { b.act = 'squat'; b.actT = MS_SQUAT; b.hopUp = dy < 0; return; }
    b.act = 'walk'; b.actT = 45;
  }
  // after the squat: hop up a shelf toward the duck, or drop through its own shelf (aimed where the duck is now)
  function spongeHop(b) {
    const p = b.tgt || aim(b.x + 16, b.y + 16), pc = p.x + 8, bc = b.x + 16;
    b.act = 'hop'; b.onGround = false;
    if (b.hopUp) {
      b.vy = -5.3; b.vx = clamp((pc - bc) / 40, -1.1, 1.1);
      if (Math.abs(b.vx) < 0.45) b.vx = 0.45 * (sign(pc - bc) || b.dir);
    } else {
      b.dropRow = Math.round((b.y + 32 - PF_TOP) / TS); b.vy = -1.6; b.vx = clamp((pc - bc) / 60, -0.9, 0.9);
    }
    b.vx *= bossK(); b.face = sign(b.vx) || b.face;
  }

  // ---- 4. 이태리 타올 대마왕 (final): hovers beside and above the duck. Swoop: locks the duck's spot (target mark,
  //         "!", 0.7 s) then dives at it and rests at the bottom. Mitt rain: crosses the bath dropping scrub-mitts
  //         straight down. Phase 2 adds a row sweep (warning band, then a towel lash along the duck's row: jump it).
  //         Phase 3 also breaks the shower (scald drops).
  const TK_V = [0, 1.0, 1.2, 1.4], TK_CD = [0, 100, 84, 68], TK_DIVE = [0, 3.0, 3.3, 3.6], TK_MITT = [0, 22, 18, 15];
  function aiTowel(b) {
    const p = b.tgt = aim(b.x + 16, b.y + 16), pc = p.x + 8, k = bossK();
    switch (b.act) {
      case 'swoopWind':
        b.vx *= 0.85; b.vy = b.vy * 0.85 - 0.03;
        if (--b.actT <= 0) {
          const dx = b.tx - (b.x + 16), dy = b.ty - (b.y + 16), d = Math.hypot(dx, dy) || 1, v = TK_DIVE[b.phase] * k;
          b.vx = (dx / d) * v; b.vy = (dy / d) * v; b.act = 'swoop'; b.actT = Math.ceil(d / v) + 2;
          Snd.sfx('steam');
        }
        break;
      case 'swoop':
        if (b.t % 2 === 0 && G.parts.length < 360) G.parts.push({ x: b.x + 16, y: b.y + 16, vx: -b.vx * 0.2, vy: -b.vy * 0.2, life: 12, max: 12, c: '#3cc464', sz: 2, g: 0 });
        if (--b.actT <= 0 || b.y >= PF_BOT - 41) { b.act = 'recover'; b.actT = 48; b.vx = 0; b.vy = 0; }
        break;
      case 'recover':
        b.vx = 0; b.vy = Math.sin(b.t * 0.2) * 0.2;
        if (--b.actT <= 0) { b.act = 'hover'; b.atkCd = TK_CD[b.phase]; }
        break;
      case 'rain': {
        const dx = b.tx - b.x;
        b.vx = clamp(dx * 0.05, -1.6 * k, 1.6 * k);
        b.vy += (clamp(p.y - 72, CEIL_Y + 2, 96) - b.y) * 0.01; b.vy = clamp(b.vy, -0.8, 0.8);
        if (--b.mittT <= 0) { b.mittT = TK_MITT[b.phase]; spawnHazard({ kind: 'mitt', x: b.x + 8, y: b.y + 18, vy: 0.2 }); }
        if (Math.abs(dx) < 3 || --b.actT <= 0) { b.act = 'hover'; b.atkCd = TK_CD[b.phase]; }
        break;
      }
      case 'cast':
        b.vx *= 0.85; b.vy *= 0.85;
        if (--b.actT <= 0) { b.act = 'hover'; b.atkCd = TK_CD[b.phase]; }
        break;
      default: {
        b.act = 'hover';
        let tx = pc + b.side * 56 - 16;
        if (tx < WALL_L || tx > WALL_R - 32) { b.side = -b.side; tx = pc + b.side * 56 - 16; }
        tx = clamp(tx, WALL_L, WALL_R - 32);
        const ty = clamp(p.y - 64, CEIL_Y + 4, 112), v = TK_V[b.phase] * k;
        b.vx = clamp(b.vx + clamp((tx - b.x) * 0.03 - b.vx, -0.08, 0.08), -v, v);
        b.vy = clamp(b.vy + clamp((ty - b.y) * 0.03 - b.vy, -0.08, 0.08), -v, v);
        if (!p.dead) b.face = sign(pc - (b.x + 16)) || b.face;
        if (rng() < 0.003) b.side = -b.side;
        if (--b.atkCd <= 0 && b.calm <= 0 && !p.dead) towelAttack(b);
      }
    }
    if (b.act === 'swoopWind' || b.act === 'swoop') b.face = sign(b.tx - (b.x + 16)) || b.face;
    else if (b.act === 'rain') b.face = sign(b.vx) || b.face;
    b.x = clamp(b.x + b.vx, WALL_L, WALL_R - 32);
    b.y = clamp(b.y + b.vy, CEIL_Y, PF_BOT - 40);
    if (b.phase >= 3 && b.calm <= 0 && !p.dead && --b.dropT <= 0) { b.dropT = 84; spawnDrop(pickDropCol()); }
  }
  function towelAttack(b) {
    const p = b.tgt || aim(b.x + 16, b.y + 16);
    const list = b.phase >= 2 ? ['swoop', 'rain', 'sweep'] : ['swoop', 'rain'];
    const a = list[b.cycle++ % list.length];
    if (a === 'swoop') { b.act = 'swoopWind'; b.actT = 42; b.tx = p.x + 8; b.ty = clamp(p.y + 8, CEIL_Y + 16, PF_BOT - 24); }
    else if (a === 'rain') { b.act = 'rain'; b.actT = 220; b.mittT = 16; b.tx = b.x + 16 < W / 2 ? WALL_R - 40 : WALL_L + 8; }
    else { b.act = 'cast'; b.actT = 54; spawnSweep(b); }
  }
  function spawnSweep(b) {
    const p = b.tgt || aim(b.x + 16, b.y + 16), sy = duckLevel(p), dir = p.x + 8 < W / 2 ? -1 : 1; // from the far wall: the most warning
    spawnHazard({ kind: 'sweep', state: 'warn', warn: b.phase >= 3 ? 44 : 54, sy, dir, x: dir > 0 ? WALL_L - 24 : WALL_R, v: 4.2 * bossK() });
    Snd.sfx('boss_roar');
  }

  // ---- soap, stun (giant bubble), damage, break-out, phases, defeat
  function bossSoap(n, x, y) {
    const b = G.boss;
    if (!b || b.state !== 'fight' || !(n > 0)) return false;
    b.soap = Math.min(b.soapMax, b.soap + n); b.hitFlash = 6;
    Snd.sfx('boss_hit', { n: b.soap });
    if (isFinite(x) && isFinite(y)) { popup(x, y - 6, '+' + n, 1, '#c8f4ff'); foamPuff(x, y, 2 + n, 10, 2.5); }
    if (b.soap >= b.soapMax) sealBoss(b);
    return true;
  }
  // a capture-phase bubble that reaches the boss pops on it (no trapping a boss)
  function bossShotCheck(bb) {
    const b = G.boss;
    if (!b || b.state !== 'fight') return false;
    if (!circBox(bb.x + 8, bb.y + 8, bb.r + 2, b.x + 2, b.y + 2, 28, 28)) return false;
    popBubble(bb, null, 'boss');
    // (one otter volley lathers once: the other bubbles of it just pop on the boss)
    if (bb.vol && b.lastVol === bb.vol) return true;
    b.lastVol = bb.vol;
    bossSoap(b.type === 'megaSponge' && b.act === 'dizzy' ? 2 : 1, bb.x + 8, bb.y + 8);
    return true;
  }
  function bossBombCheck(cx, cy, by) {
    const b = G.boss;
    if (!b || b.state !== 'fight' || !circBox(cx, cy, 14, b.x, b.y, 32, 32)) return false;
    foamPuff(cx, cy, 10, 16, 4);
    bossSoap(3, cx, cy);
    if (b.state === 'fight') bossBanner('거품 폭탄!', '비누칠 +3', 55, 'bomb');
    return true;
  }
  // a spore caught by a capture bubble is destroyed (+100)
  function sporeShotCheck(bb) {
    const r = bb.r + 1;
    for (const h of G.hazards) {
      if (h.dead || h.kind !== 'spore' || !circBox(bb.x + 8, bb.y + 8, r, h.x, h.y, 8, 8)) continue;
      h.dead = true; addScore(100); popup(h.x + 4, h.y - 6, 100, 1, '#d6ff9a');
      burst(h.x + 4, h.y + 4, 8, ['#b48cff', '#d6ff9a', '#ffffff'], 1.2, 12);
      popBubble(bb, null, 'spore');
      return true;
    }
    return false;
  }
  // (battle: a capture-phase bubble also traps an opponent)
  // (noPlayers: the bubble was just blown - rivals are caught in the bubble pass of this frame, see fire)
  function shotHits(bb, noPlayers) { return captureCheck(bb) || (!noPlayers && G.gameMode === 'battle' && playerTrapCheck(bb)) || bossShotCheck(bb) || (G.hazards.length > 0 && sporeShotCheck(bb)); }
  function sealBoss(b) {
    b.state = 'stun'; b.t = 0; b.act = 'idle'; b.vx = 0; b.vy = 0; b.soap = b.soapMax; b.stunT = STUN_FRAMES; b.dropRow = -1;
    // a flying boss is heavy in its bubble: it sinks a little first (down to where the duck can reach it),
    // then everything floats up slowly
    b.giant = { x: b.x - 4, y: b.y - 4, vy: b.def.fly ? 1.5 : 0 };
    foamPuff(b.x + 16, b.y + 16, 12, 30, 4);
    burst(b.x + 16, b.y + 16, 16, BUBBLE_COLS, 1.8, 18);
    Snd.sfx('boss_stun');
    bossBanner('거품 감옥!', '큰 거품에 몸을 부딪쳐!', 80, 'boss');
  }
  function bossStun(b) {
    const g = b.giant, p = aim(b.giant.x + 20, b.giant.y + 20);
    b.stunT--;
    g.vy += (-0.2 - g.vy) * 0.035;
    const f0 = g.y + 36;
    g.y += g.vy;
    if (g.vy > 0) { const t = landTile(g.x + 7, g.x + 33, f0, g.y + 36); if (t !== null) { g.y = t - 36; g.vy = Math.min(g.vy, 0); } }
    g.y = clamp(g.y, CEIL_Y - 2, PF_BOT - 44);
    // drifts toward the duck (about half a playfield over the 4 s), so a bubble sealed far away or above a
    // corner ledge still comes within reach; the duck has to go and touch it. In a battle it drifts to the arena's
    // centre instead (not into the nearest player's lap: everyone races for the +1500)
    if (G.gameMode === 'battle') g.x += clamp((W / 2 - (g.x + 20)) * 0.02, -0.3, 0.3);
    else if (!p.dead) g.x += clamp((p.x + 8 - (g.x + 20)) * 0.02, -0.3, 0.3);
    g.x = clamp(g.x, WALL_L - 4, WALL_R - 36);
    b.x = g.x + 4; b.y = g.y + 4 + Math.round(Math.sin(b.t * 0.12));
    if (b.stunT <= 0) breakOut(b);
  }
  function breakOut(b) {
    const g = b.giant || { x: b.x - 4, y: b.y - 4 };
    b.state = 'fight'; b.t = 0; b.soap = 0; b.giant = null; b.act = restAct(b); b.actT = 40; b.calm = 30; b.vx = 0; b.vy = 0; b.onGround = false;
    b.atkCd = Math.max(b.atkCd, 50);
    burst(g.x + 20, g.y + 20, 18, BUBBLE_COLS, 2, 16);
    Snd.sfx('boss_roar'); shake(2);
    bossBanner('탈출했다!', '다시 비누칠!', 70, 'boss');
  }
  // the duck bursts the giant bubble: one HP segment
  function burstBoss(b, by) {
    const g = b.giant || { x: b.x - 4, y: b.y - 4 };
    if (by) b.lastBy = by;
    const cx = g.x + 20, cy = g.y + 20;
    b.giant = null; b.soap = 0; b.hitFlash = 14;
    if (G.banner && G.banner.main === '거품 감옥!') G.banner.end = G.frame; // done: no more "touch the bubble"
    foamPuff(cx, cy, 22, 34, 6);
    burst(cx, cy, 30, BUBBLE_COLS, 2.6, 26);
    shake(6); Snd.sfx('boss_damage');
    // (a battle's intruder pays +1500 to the player who burst it)
    const pts = b.intruder ? INTRUDE_PTS : BOSS_DMG_PTS * b.num;
    addScore(pts, by); popup(cx, cy - 12, pts, 2, '#ffe36b');
    clearHazards(true); // a breather: every projectile on screen fizzles
    b.hp = Math.max(0, b.hp - 1);
    if (b.hp <= 0) { defeatBoss(b); return; }
    b.state = 'down'; b.t = 0; b.vx = 0; b.vy = -2.2; b.onGround = false; b.dropRow = -1; b.act = 'idle';
  }
  function bossDown(b) {
    bossPhys(b);
    if (b.onGround) b.vx = 0;
    if (b.t >= DOWN_FRAMES) bossGetUp(b, false);
  }
  function bossGetUp(b, quiet) {
    b.phase = clamp(BOSS_HP - b.hp + 1, 1, 3);
    b.state = 'fight'; b.t = 0; b.act = restAct(b); b.actT = 36; b.calm = 40; b.second = false;
    b.atkCd = 50; b.minionT = Math.min(b.minionT, 100); b.dropT = 60;
    bossSpare(b);
    if (!quiet) {
      Snd.sfx('boss_roar'); shake(3); b.sq = -0.2;
      burst(b.x + 16, b.y + 8, 14, ['#ff8a7a', '#ffffff', '#ffd0c8'], 1.8, 18);
      bossBanner(b.name + ' 분노!', b.phase >= 3 ? '마지막 단계! 더 거칠어졌다' : '2단계! 더 빨라졌다', 90, 'boss');
    }
  }
  function defeatBoss(b) {
    if (!b || b.state === 'defeat') return;
    const g = b.giant;
    b.state = 'defeat'; b.t = 0; b.hp = 0; b.soap = 0; b.giant = null; b.vx = 0; b.vy = 0; b.act = 'idle'; b.dropRow = -1;
    if (g) { b.x = g.x + 4; b.y = g.y + 4; }
    clearHazards(true); clearDrops(true); G.scald = false;
    if (b.intruder) { b.pts = 0; b.bonus = 0; shake(4); Snd.sfx('boss_damage'); return; } // battle: it just bursts, the match goes on
    for (const e of G.enemies) if (e.state !== 'dead') killEnemy(e, 1); // the minions scatter as snacks
    // round clear: the snack window runs during the foam explosion and the victory fanfare
    const secs = Math.floor(G.roundClock / 60), bonus = Math.max(0, SPEED_PAR - secs) * SPEED_PTS;
    G.lastBonus = { secs, bonus };
    b.pts = BOSS_KILL_PTS * b.num; b.bonus = bonus;
    G.clearT = 0;
    shake(4); Snd.sfx('boss_damage');
  }
  function bossDefeatTick(b) {
    if (b.t < DEFEAT_BOOM) {
      b.hitFlash = (b.t >> 2) & 1 ? 4 : 0;
      if (!b.def.fly) bossPhys(b);
      if (b.t % 7 === 0) { foamPuff(b.x + 4 + fxr() * 24, b.y + 4 + fxr() * 24, 3, 6, 3); Snd.sfx('pop'); }
      return;
    }
    if (b.t === DEFEAT_BOOM) {
      const cx = b.x + 16, cy = b.y + 16;
      foamPuff(cx, cy, 34, 46, 8);
      burst(cx, cy, 36, BUBBLE_COLS, 3, 30); burst(cx, cy, 16, STAR_COLS, 2.2, 24);
      shake(8); Snd.sfx('boss_damage');
      if (b.intruder) { bossBanner('뽀득!', b.name + ' 퇴치!' + (b.lastBy ? ' · ' + nameOf(b.lastBy) : ''), 90, 'victory'); return; }
      bossKillScore(b.pts + b.bonus, b.lastBy);
      popup(cx, cy - 8, b.pts, 2, '#ffe36b');
      addStamps(BOSS_STAMPS + (G.roundDeaths ? 0 : 1), cx, cy, b.lastBy); // +3 for the boss, +1 more for a no-death clear
      bossBanner('뽀득!', b.name + ' 퇴치! +' + b.pts.toLocaleString('ko-KR') + (b.bonus ? ' · 세신 +' + b.bonus.toLocaleString('ko-KR') : ''), 150, 'victory');
      setMusic('victory');
    }
  }
  function updateBoss() {
    const b = G.boss; if (!b) return;
    b.t++;
    if (b.hitFlash > 0) b.hitFlash--;
    b.sq *= 0.8; if (Math.abs(b.sq) < 0.02) b.sq = 0;
    if (b.state === 'intro') bossIntro(b);
    else if (b.state === 'fight') bossFight(b);
    else if (b.state === 'stun') bossStun(b);
    else if (b.state === 'down') bossDown(b);
    else if (b.state === 'defeat') { bossDefeatTick(b); if (b.intruder && b.t > DEFEAT_BOOM + 45) G.boss = null; }
  }
  // debug helpers: bring the boss into its fight (skipping the intro / getting up) before acting on it
  function bossReady() {
    const b = G.boss; if (!b) return null;
    if (b.state === 'intro') startFight(b);
    else if (b.state === 'down') bossGetUp(b, true);
    return b;
  }
  // the duck bursts the giant bubble by touching it (even while blinking after a respawn)
  function bossTouch() {
    const b = G.boss;
    if (!b || b.state !== 'stun' || !b.giant) return;
    for (const p of G.players) {
      if (p.dead || p.trap || p.koT || p.out) continue;
      const s = slack(p);
      if (circBox(b.giant.x + 20, b.giant.y + 20, 19, p.x + 2 - s, p.y + 2 - s, 12 + s * 2, 14 + s * 2)) { burstBoss(b, p); return; }
    }
  }
  // the duck lost a life: projectiles fizzle and the boss calms its current attack
  function bossOnDeath() {
    clearHazards(true);
    const b = G.boss;
    if (!b || b.state !== 'fight') return;
    if (b.type === 'moldQueen') { if (b.act === 'charge') { b.act = 'float'; b.atkCd = 60; } }
    else if (b.type === 'towelKing') { if (b.act !== 'hover') { b.act = 'hover'; b.vx = 0; b.vy = 0; b.atkCd = 60; } }
    else if (b.act === 'wind' || b.act === 'charge' || b.act === 'crouch' || b.act === 'squat') { b.act = 'rest'; b.actT = 30; b.second = false; }
  }

  // ---- boss projectiles: shockwaves, spores, mini scrub-mitts, row sweeps
  function updateHazards() {
    if (!G.hazards.length) return;
    for (const h of G.hazards) {
      if (h.dead) continue;
      h.t++;
      if (h.kind === 'wave') updateWave(h);
      else if (h.kind === 'spore') updateSpore(h);
      else if (h.kind === 'mitt') updateMitt(h);
      else if (h.kind === 'sweep') updateSweep(h);
      else h.dead = true;
    }
    G.hazards = G.hazards.filter((h) => !h.dead);
  }
  // a dust wave rolls along the surface it started on and breaks up at its edge, a wall, water or the drain
  function updateWave(h) {
    h.x += h.vx;
    if (h.t % 3 === 0 && G.parts.length < 360) G.parts.push({ x: h.x + 8 - sign(h.vx) * 5, y: h.y - 3, vx: -sign(h.vx) * 0.3, vy: -0.5 - fxr() * 0.4, life: 12, max: 12, c: fxr() < 0.5 ? '#e8dcc8' : '#ffffff', sz: 1, g: 0.04 });
    const lead = h.vx > 0 ? h.x + 13 : h.x + 3;
    const c = Math.floor(lead / TS), r = Math.round((h.y - PF_TOP) / TS);
    const ground = (solidCell(c, r) && !solidCell(c, r - 1)) || iceTop(c, r);
    const wet = waterCells.length && waterIdx(lead, h.y - 3) >= 0;
    if (!ground || wet || h.x < WALL_L - 4 || h.x + 16 > WALL_R + 4 || h.t > 400) {
      h.dead = true;
      burst(clamp(lead, WALL_L, WALL_R), h.y - 3, 6, ['#e8dcc8', '#ffffff'], 1, 10);
    }
  }
  function updateSpore(h) {
    if (h.state === 'fly') {
      const f0 = h.y + 8;
      h.vy = Math.min(1.9, h.vy + 0.055);
      h.x += h.vx; h.y += h.vy;
      if (h.x < WALL_L) { h.x = WALL_L; h.vx = Math.abs(h.vx) * 0.5; } else if (h.x > WALL_R - 8) { h.x = WALL_R - 8; h.vx = -Math.abs(h.vx) * 0.5; }
      if (h.y < CEIL_Y) { h.y = CEIL_Y; if (h.vy < 0) h.vy = 0; }
      const wi = waterCells.length ? waterIdx(h.x + 4, h.y + 7) : -1;
      if (wi >= 0) { h.state = 'land'; h.vx = 0; h.vy = 0; h.wet = WATER[wi]; h.y = surfY(wi) - 6; splash(h.x + 4, surfY(wi), WATER[wi], 4); return; }
      if (h.vy > 0) {
        const t = landTile(h.x + 1, h.x + 7, f0, h.y + 8);
        if (t !== null) { h.state = 'land'; h.vx = 0; h.vy = 0; h.y = t - 8; burst(h.x + 4, t - 1, 4, ['#b48cff', '#d6ff9a'], 0.8, 10); return; }
      }
      if (h.y >= PF_BOT - 8) h.y -= PF_H; // down the drain, back in from the showerhead
      if (h.t > 900) h.dead = true;
      return;
    }
    h.hatch++;
    if (h.hatch < SPORE_HATCH) return;
    h.dead = true;
    const b = G.boss;
    if (b && b.state !== 'defeat' && minionCount() < minionCap()) {
      spawnMinion('mold', h.x + 4, h.wet ? h.y + 2 : h.y, h.x + 4 < aim(h.x, h.y).x + 8 ? 1 : -1, h.wet ? 'sink' : 'stand');
      burst(h.x + 4, h.y + 4, 10, ['#69c24a', '#d6ff9a', '#ffffff'], 1.4, 14);
      Snd.sfx('spore');
    } else burst(h.x + 4, h.y + 4, 6, ['#8a7a9a', '#d6ff9a'], 0.8, 10); // withers
  }
  function updateMitt(h) {
    const f0 = h.y + 16;
    h.vy = Math.min(2.4, h.vy + 0.08); h.y += h.vy;
    const wi = waterCells.length ? waterIdx(h.x + 8, h.y + 14) : -1;
    if (wi >= 0) { h.dead = true; splash(h.x + 8, surfY(wi), WATER[wi], 6); return; }
    const t = landTile(h.x + 4, h.x + 12, f0, h.y + 16);
    if (t !== null) { h.dead = true; burst(h.x + 8, t - 2, 8, ['#3cc464', '#ffffff', '#e8dcc8'], 1.2, 12); return; }
    if (h.y > PF_BOT) h.dead = true;
  }
  function updateSweep(h) {
    if (h.state === 'warn') { if (h.t >= h.warn) { h.state = 'go'; h.t = 0; Snd.sfx('steam'); } return; }
    h.x += h.dir * h.v;
    if (h.t % 2 === 0 && G.parts.length < 360) G.parts.push({ x: h.x + 12 - h.dir * 12, y: h.sy - 6 + (fxr() - 0.5) * 8, vx: -h.dir * 0.8, vy: 0, life: 10, max: 10, c: fxr() < 0.5 ? '#ffffff' : '#9ff0b0', sz: 1, g: 0 });
    if ((h.dir > 0 && h.x > WALL_R + 4) || (h.dir < 0 && h.x + 24 < WALL_L - 4)) h.dead = true;
  }
  function hazardHits(h, p) {
    const px = p.x + 4, py = p.y + 4;
    // a shockwave rises from the boss's feet: harmless for 5 frames (time to hop), full height after 9
    if (h.kind === 'wave') { const hh = clamp(h.t - 4, 0, 7); return hh > 0 && overlap(px, py, 8, 11, h.x + 2, h.y - hh, 12, hh); }
    if (h.kind === 'spore') return h.state === 'fly' && overlap(px, py, 8, 11, h.x + 1, h.y + 1, 6, 6);
    if (h.kind === 'mitt') return overlap(px, py, 8, 11, h.x + 3, h.y + 3, 10, 11);
    if (h.kind === 'sweep') return h.state === 'go' && overlap(px, py, 8, 11, h.x, h.sy - 12, 24, 11);
    return false;
  }

  // ------------------------------------------------------------------ items, power-up pickup, bolts, fx
  // can this player grab things / pop bubbles? (a remote player's reported spot is ~100 ms old: it gets 8 px of
  // slack each way for touching things; being caught by a battle bubble is judged against its own view instead, see
  // lagTrapCheck)
  const canTouch = (p) => !!p && !p.dead && !p.trap && !p.koT && !p.out && !(p.stunT > 0);
  const slack = (p) => (p.local ? 0 : 8);
  function touching(p, x, y, w, h) { const s = slack(p); return overlap(p.x + 2 - s, p.y + 2 - s, 12 + s * 2, 14 + s * 2, x, y, w, h); }
  function updateItems() {
    for (const it of G.items) {
      it.age++;
      if (!it.onGround) {
        const wi = waterCells.length ? waterIdx(it.x + 8, it.y + 15) : -1;
        if (wi >= 0) floatSettle(it, wi, 3); else physBody(it);
      }
      const p = G.players.find((q) => canTouch(q) && touching(q, it.x + 2, it.y + 3, 12, 13));
      if (p) {
        it.dead = true; addScore(it.value, p);
        popup(it.x + 8, it.y, it.value, 1, '#fff6c8');
        burst(it.x + 8, it.y + 8, 8, STAR_COLS, 1.4, 14);
        Snd.sfx('item');
      } else if (it.age > ITEM_LIFE) it.dead = true;
    }
    G.items = G.items.filter((i) => !i.dead);
  }
  function updatePickup() {
    const k = G.pickup; if (!k) return;
    k.age++;
    if (!k.onGround) {
      const wi = waterCells.length ? waterIdx(k.x + 8, k.y + 15) : -1;
      if (wi >= 0) floatSettle(k, wi, 3);
      else {
        // drifts down like a soap flake, swaying a little
        const f0 = k.y + 16;
        k.vy = 0.7; k.y += k.vy;
        k.x = clamp(k.x + Math.sin(k.age * 0.08) * 0.3, WALL_L, WALL_R - 16);
        const t = landTile(k.x + 3, k.x + 13, f0, k.y + 16);
        if (t !== null) { k.y = t - 16; k.onGround = true; }
        wrapY(k);
      }
    } else k.land++;
    if (k.land > PICKUP_LIFE || k.age > PICKUP_LIFE * 3) { burst(k.x + 8, k.y + 8, 6, ['#ffffff', '#c8f4ff'], 1, 10); G.pickup = null; return; }
    const p = G.players.find((q) => canTouch(q) && touching(q, k.x + 2, k.y + 2, 12, 13));
    if (p) {
      burst(k.x + 8, k.y + 8, 12, STAR_COLS, 1.6, 16);
      G.pickup = null;
      applyPower(k.type, p);
    }
  }
  function updateBolts() {
    for (const bo of G.bolts) {
      bo.t++; bo.x += bo.dir * 4;
      // ease down onto the duck's surface; while settling the hit box covers the whole span travelled
      const yPrev = bo.y;
      if (bo.ty !== undefined && bo.y !== bo.ty) { bo.y += (bo.ty - bo.y) * 0.4; if (Math.abs(bo.ty - bo.y) < 0.5) bo.y = bo.ty; }
      if (bo.t % 2 === 0) G.parts.push({ x: bo.x + 8 - bo.dir * 6, y: bo.y + 6 + fxr() * 6, vx: -bo.dir * 0.3, vy: -0.3 - fxr() * 0.3, life: 18, max: 18, c: STEAM_COLS[bo.t % 3], sz: 2, g: 0 });
      const hy0 = Math.min(yPrev, bo.y), hy1 = Math.max(yPrev, bo.y) + 16;
      for (const e of G.enemies) {
        if (e.state !== 'active' && e.state !== 'trapped') continue;
        if (overlap(bo.x + 1, hy0, 14, hy1 - hy0, e.x + 2, e.y + 2, 12, 14)) {
          addScore(1000, bo.by); popup(e.x + 8, e.y - 4, 1000, 1, '#ffffff');
          if (bo.by) bo.by.kills++;
          killEnemy(e, 2, bo.by); Snd.sfx('kill');
        }
      }
      if (bo.x < WALL_L || bo.x + 16 > WALL_R) { bo.dead = true; burst(clamp(bo.x + 8, WALL_L + 4, WALL_R - 4), bo.y + 8, 12, STEAM_COLS, 1.6, 20); }
    }
    G.bolts = G.bolts.filter((b) => !b.dead);
  }
  function updateFx() {
    for (const q of G.parts) { q.x += q.vx; q.y += q.vy; q.vy += q.g; q.vx *= 0.94; q.vy *= 0.94; q.life--; }
    G.parts = G.parts.filter((q) => q.life > 0);
    for (const q of G.pops) { q.t++; q.y -= q.t < 20 ? 0.6 : 0.12; }
    G.pops = G.pops.filter((q) => q.t < 64);
    if (G.foam.length) {
      for (const f of G.foam) { f.x += f.vx; f.y += f.vy; f.vx *= 0.95; f.vy *= 0.96; f.r += 0.04; f.life--; }
      G.foam = G.foam.filter((f) => f.life > 0);
    }
    if (G.stampFlash > 0) G.stampFlash--;
    if (G.ticketFlash > 0) G.ticketFlash--;
    meSpotTick(); // ("me": the spotlight's triggers, distinction §2.7)
  }
  // steam curling off hot pools, a glint now and then on cold ones
  function updateWaterFx() {
    if (!waterCells.length || reducedMotion() || G.parts.length > 300) return;
    if (G.frame % 5 !== 0) return;
    const w = waterCells[(fxr() * waterCells.length) | 0];
    if (!w || !w.top) return;
    const x = w.c * TS + fxr() * TS, y = PF_TOP + w.r * TS;
    if (w.k === 1) G.parts.push({ x, y: y - 1, vx: (fxr() - 0.5) * 0.15, vy: -0.25 - fxr() * 0.2, life: 30, max: 30, c: fxr() < 0.5 ? '#ffe4ec' : '#ffffff', sz: fxr() < 0.5 ? 2 : 1, g: 0 });
    else if (fxr() < 0.4) G.parts.push({ x, y: y + 1, vx: 0, vy: 0, life: 10, max: 10, c: '#ffffff', sz: 1, g: 0 });
  }

  // ------------------------------------------------------------------ main world update
  const NO_INPUT = { left: false, right: false, jump: false, shoot: false, down: false, jumpP: false, shootP: false };
  function updateWorld(ins) {
    const battle = G.gameMode === 'battle';
    G.roundT++; G.introT++;
    if (G.clearT < 0) G.roundClock++;
    if (G.attract) G.attractT++;
    // (a boss round gets its "… 등장!" banner and music from the boss itself when it lands)
    if (G.introT === INTRO_NAME && !G.attract && !G.boss && !battle) { showBanner('준비!', '', INTRO_READY, 'ready'); kitHint(); if (G.music === 'clear' || G.music === 'victory') setMusic('main'); }
    for (const pl of G.players) if (pl.power && --pl.power.t <= 0) pl.power = null;
    if (battle) for (const pl of G.players) ammoTick(pl); // (AMMO: the host's count for every player)
    for (const pl of G.players) updateBody(pl, ins[pl.slot] || NO_INPUT);
    if (battle && G.online) for (const pl of G.players) notePos(pl);
    for (const e of G.enemies) updateEnemy(e);
    G.enemies = G.enemies.filter((e) => !e.gone);
    if (G.boss) updateBoss();
    updateBubbles();
    if (battle && G.online) { lagTrapCheck(); lagClaims(); }
    for (const pl of G.players) if (canTouch(pl)) playerBubbles(pl, ins[pl.slot] || NO_INPUT);
    if (G.gameMode === 'coop') reviveCheck();
    if (G.boss) bossTouch();
    updateIce();
    updateHazards();
    updateDrops();
    updateBolts();
    updateItems();
    updatePickup();
    updateFx();
    updateWaterFx();
    // spawners
    if (battle) updateBattle();
    else if (G.clearT < 0) {
      if (--G.stampT <= 0) {
        G.stampT = ri(STAMP_MIN, STAMP_MAX);
        if (!G.bubbles.some((b) => b.kind === 'stamp' && !b.dead)) spawnFromGap('stamp');
      }
      if (G.steamT > 0 && --G.steamT === 0) {
        G.steamT = ri(360, 540);
        if (G.bubbles.filter((b) => b.kind === 'steam').length < 3) spawnFromGap('steam');
      }
      if (!LV.boss) {
        // hurry: enemies get angry at 30 s; at 45 s the shower breaks and scalding drops start falling
        // (co-op: 4 s sooner per extra player - more bubbles clear a round faster)
        if (!G.hurry && G.roundT >= HURRY_AT - coopHurry()) {
          G.hurry = true;
          for (const e of G.enemies) if (e.state !== 'dead') e.angry = true;
          showBanner('서둘러!', '때가 화났어요', 90, 'hurry');
          Snd.sfx('hurry'); setMusic(G.attract ? G.music : 'hurry');
        }
        if (!G.scald && G.roundT >= SCALD_AT - coopHurry()) {
          G.scald = true; G.dropN = 0; G.dropT = 20;
          showBanner('샤워기 고장!', '뜨거운 물방울 조심!', 90, 'hurry');
          Snd.sfx('scald_warn');
        }
        if (G.scald && --G.dropT <= 0) {
          spawnDrop(pickDropCol());
          G.dropN++;
          G.dropT = Math.max(DROP_INT_MIN, DROP_INT0 - (G.dropN - 1) * DROP_INT_STEP);
        }
      }
    }
    // collisions with deadly things. Solo: a life is lost. Co-op: that player becomes a ghost bubble.
    // Battle: stunned for 1 s and -100. (Only this engine's own players: a remote player reports its own.)
    if (!G.invincible && !G.attract) {
      for (const pl of G.players) {
        if (!pl.local || !alive(pl) || pl.trap || pl.invuln > 0 || pl.stunT > 0 || !hitTest(pl)) continue;
        if (pl.shield > 0) { useShield(pl); continue; }
        if (G.gameMode === 'solo') { die(); return; }
        if (G.gameMode === 'coop') coopDie(pl); else stunPlayer(pl);
      }
    }
    if (battle) { if (G.battle && G.battle.left <= 0 && G.mode === 'playing') endBattle(); return; }
    if (G.gameMode === 'coop' && coopWiped()) return;
    // round clear (a boss round clears only when its boss is beaten: defeatBoss starts the clear)
    if (G.clearT < 0 && !G.boss && !G.enemies.some((e) => e.state !== 'dead')) {
      G.clearT = 0;
      Snd.sfx('clear');
      roundCleared();
    }
    if (G.clearT >= 0) {
      // the snack-grab window only runs once every knocked-out enemy has landed and turned into a snack
      // (after a boss it runs alongside the foam explosion and the victory fanfare)
      if (!G.enemies.length || G.boss) G.clearT++;
      if (G.clearT >= (G.boss ? BOSS_CLEAR : CLEAR_WAIT)) { if (G.attract) startRound(0); else nextRound(); }
    }
    if (G.attract && G.attractT > 2400) startRound(0);
  }
  // one player's frame, by state
  function updateBody(pl, inp) {
    if (pl.out) return;
    if (pl.koT > 0) { if (--pl.koT <= 0) respawnBattle(pl); return; }
    if (pl.trap) { updateTrapped(pl, inp); return; }
    if (pl.dead) { if (G.gameMode === 'coop') updateFallen(pl); return; } // (solo: the 'dying' screen runs it)
    if (!pl.local) { if (pl.invuln > 0) pl.invuln--; if (pl.stunT > 0) pl.stunT--; if (pl.shield > 0) pl.shield--; return; }
    if (pl.stunT > 0) { pl.stunT--; updatePlayer(pl, NO_INPUT); return; }
    updatePlayer(pl, inp);
  }
  function hitTest(p) {
    for (const e of G.enemies) {
      if (e.state === 'active' && !(e.grace > 0) && overlap(p.x + 4, p.y + 4, 8, 11, e.x + 3, e.y + 4, 10, 11)) return true;
    }
    for (const d of G.drops) if (d.state === 'fall' && !d.dead && overlap(p.x + 4, p.y + 4, 8, 11, d.x + 2, d.y + 1, 4, 7)) return true;
    const b = G.boss;
    if (b && b.state === 'fight' && overlap(p.x + 4, p.y + 4, 8, 11, b.x + 5, b.y + 6, 22, 24)) return true;
    for (const h of G.hazards) if (!h.dead && hazardHits(h, p)) return true;
    return false;
  }
  // the capybara's hot-water shield takes one hit
  function useShield(pl) {
    pl.shield = 0; pl.invuln = Math.max(pl.invuln, 60);
    if (!pl.local) pl.shieldGone = true; // (online host: that player's reports keep the old shield until a new dip)
    burst(pl.x + 8, pl.y + 8, 14, ['#c8f4ff', '#ffffff', '#8fe3ff'], 1.8, 16);
    Snd.sfx('bounce');
  }
  function die() {
    const p = G.p;
    G.mode = 'dying'; G.dieT = 0; p.dead = true; p.vx = 0; p.vy = 0; p.shootAnim = 0;
    G.roundDeaths++;
    G.power = null;
    clearDrops(true); G.scald = false;
    if (G.boss || G.hazards.length) bossOnDeath();
    burst(p.x + 8, p.y + 8, 12, STAR_COLS, 1.8, 20);
    shake(3);
    Snd.sfx('die'); setMusic(null);
  }
  function updateDying() {
    G.dieT++;
    updateFx();
    if (G.dieT === 40) burst(G.p.x + 8, G.p.y + 6, 6, ['#ffffff', '#ffe36b'], 0.8, 24);
    if (G.dieT >= DIE_FRAMES) {
      G.lives--;
      if (G.lives <= 0) { G.lives = 0; gameOver(); return; }
      respawn();
    }
  }
  function respawn() {
    placePlayer(G.p, spawnOf(0)); G.p.invuln = INVULN;
    G.mode = 'playing'; G.roundT = 0; G.hurry = false; G.scald = false; G.drops = [];
    for (const e of G.enemies) if (!e.escaped) e.angry = false;
    // a boss keeps its HP (and soap); it holds its attacks for a moment while the duck gets its bearings
    const b = G.boss;
    if (b) { b.calm = Math.max(b.calm, 100); if (b.type === 'towelKing') b.dropT = Math.max(b.dropT, 120); }
    setMusic(b ? (b.entered ? b.def.music : null) : 'main');
  }
  function gameOver() {
    G.mode = 'gameover';
    G.bannerQ = [];
    saveHi();
    Snd.sfx('gameover'); setMusic('gameover');
    showOverlay('over');
  }

  // ---- co-op: fall -> ghost bubble (8 s, floats up) -> a partner's touch revives, or respawn for a team life
  function coopDie(pl) {
    pl.dead = true; pl.dieT = 0; pl.ghost = null; pl.vx = 0; pl.vy = 0; pl.shootAnim = 0; pl.power = null; pl.shield = 0;
    bumpEp(pl);
    G.roundDeaths++;
    burst(pl.x + 8, pl.y + 8, 12, STAR_COLS, 1.8, 20);
    shake(3);
    Snd.sfx('die');
  }
  function updateFallen(pl) {
    if (!pl.ghost) {
      if (++pl.dieT >= GHOST_DIE) {
        pl.y = clamp(pl.y - 2, CEIL_Y, PF_BOT - 24);
        pl.ghost = { t: 0, x0: pl.x, y0: pl.y };
        burst(pl.x + 8, pl.y + 8, 8, ['#ffffff', '#e6fbff', pl.color], 1, 16);
        Snd.sfx('ghost');
      }
      return;
    }
    const g = pl.ghost;
    if (G.clearT < 0) g.t++; // (a cleared round winding down does not cost the team a life)
    // it rises slowly, but only to a little above where it fell (still in jumping reach from that floor), and drifts
    // toward the nearest standing partner: a revive stays possible for the whole 8 s
    if (g.y0 === undefined) g.y0 = pl.y;
    pl.y = Math.max(CEIL_Y, g.y0 - GHOST_RISE_MAX, pl.y - GHOST_RISE);
    let near = null, nd = 1e9;
    for (const q of G.players) { if (q === pl || !alive(q)) continue; const d = Math.abs(q.x - pl.x) + Math.abs(q.y - pl.y); if (d < nd) { nd = d; near = q; } }
    if (near) g.x0 = clamp(g.x0 + clamp((near.x - g.x0) * 0.02, -GHOST_DRIFT, GHOST_DRIFT), WALL_L, WALL_R - 16);
    pl.x = clamp(g.x0 + Math.sin(g.t * 0.05) * 6, WALL_L - 2, WALL_R - 14);
    if (g.t >= GHOST_FRAMES) {
      if (G.lives > 0) { G.lives--; respawnCoop(pl); }
      else { pl.ghost = null; pl.out = true; } // no team lives left: sits out until the next round
    }
  }
  function reviveCheck() {
    for (const g of G.players) {
      if (!g.ghost) continue;
      for (const p of G.players) {
        if (p === g || !canTouch(p)) continue;
        const s = slack(p);
        if (circBox(g.x + 8, g.y + 8, GHOST_REACH, p.x + 2 - s, p.y + 2 - s, 12 + s * 2, 14 + s * 2)) { revive(g, p); break; }
      }
    }
  }
  function revive(g, by) {
    const x = g.x, y = clamp(g.y, CEIL_Y, PF_BOT - 24);
    placePlayer(g, spawnOf(g.slot));
    g.x = x; g.y = y; g.onGround = false; g.invuln = REVIVE_INV;
    if (by) by.revives++;
    burst(x + 8, y + 8, 16, [g.color, '#ffffff', '#ffe36b'], 1.8, 18);
    wordPop(x + 8, y - 4, '살았다!', by ? by.color : g.color);
    Snd.sfx('revive');
  }
  function respawnCoop(pl) {
    placePlayer(pl, spawnOf(pl.slot)); pl.invuln = INVULN;
    burst(pl.x + 8, pl.y + 8, 10, ['#ffffff', pl.color], 1.2, 14);
    if (!G.players.some((q) => q !== pl && alive(q))) {
      // the whole team went down: the round's pressure resets like a solo respawn
      G.roundT = 0; G.hurry = false; G.scald = false; G.drops = [];
      for (const e of G.enemies) if (!e.escaped) e.angry = false;
      const b = G.boss;
      if (b) { b.calm = Math.max(b.calm, 100); if (b.type === 'towelKing') b.dropT = Math.max(b.dropT, 120); }
      if (G.music === 'hurry') setMusic('main');
    }
  }
  // game over when nobody is up and the team has no lives left
  function coopWiped() {
    if (G.players.some(alive) || G.lives > 0) { G.coopOverT = 0; return false; }
    if (++G.coopOverT >= COOP_OVER_WAIT) { gameOver(); return true; }
    return false;
  }

  // ---- battle: trap an opponent in a bubble, they mash to escape, anyone else's touch is a 뽀득 KO
  // A capture-phase bubble catches a free, non-blinking rival. This engine's own players are tested against the
  // bubble as it is now; online, a REMOTE player is judged against what its own screen showed (lagTrapCheck: the
  // bubble where it was at that player's reported render tick, vs that player's reported body) - so a dodge that
  // worked on the victim's screen counts, at any ordinary latency.
  // A fresh prison cannot be popped for TRAP_GRACE frames (no same-frame KO), and not by its own trapper for
  // OWNER_LOCK frames (the victim gets its chance to mash out).
  const HIST_KEEP = 48, TRAP_GRACE = 15, OWNER_LOCK = 60;
  const trappable = (v, b) => v.slot !== b.owner && free(v) && !(v.invuln > 0);
  // A touch you can SEE is a catch: the owner's ring (2 px at r 9 x the drawn scale sc: its outer edge 9 s + 1) on the
  // drawn 16x16 animal, outline included (tol: the host's slack on a guest's claim). (Before: rP on the 12x14 body box -
  // a fifth of the visible touches did not count.)
  function rivalTouch(sc, x, y, px, py, tol) {
    const rx = 9 * sc[0] + 1 + (tol || 0), ry = 9 * sc[1] + 1 + (tol || 0), k = rx / ry, cx = x + 8, cy = (y + 8) * k;
    const dx = cx - clamp(cx, px, px + 16), dy = cy - clamp(cy, py * k, (py + 16) * k);
    return dx * dx + dy * dy < rx * rx;
  }
  // Online the SHOOTER's screen judges its own bubble (shooterOf): 'here' - a host-local (or offline) shooter: the rival
  // where this screen draws it (a remote one: shownAt, its interpolated body stream); 'claims' - a guest that reports
  // its own touches (guestClaim -> lagClaims checks them against the host's records); 'legacy' - an older guest page:
  // host-local rivals now, remote ones against their own view (lagTrapCheck), as before
  function shooterOf(b) {
    const o = G.players.find((q) => q.slot === b.owner);
    if (!o || o.local !== false) return 'here';
    const rem = NET.remote.get(o.id);
    return rem && rem.st && rem.st.lc ? 'claims' : 'legacy';
  }
  function shownAt(pl) {
    const rem = NET.remote.get(pl.id); if (!rem) return null;
    const s = bufSample(rem.buf, bufTick(rem.buf, PEER_DELAY)); if (!s) return null;
    const a = s.a.d, b = s.b && s.b.d.ep === a.ep ? s.b.d : null;
    return a.ep === pl.ep ? { x: lx(a.x, b && b.x, s.t), y: ly(a.y, b && b.y, s.t) } : null;
  }
  function playerTrapCheck(b) {
    if (G.gameMode !== 'battle' || b.owner < 0) return false;
    if (b.drop && b.age > KIT.otter.shot.drop.rivalAge) return false; // (an otter's droplet catches rivals point-blank only)
    const who = G.online ? shooterOf(b) : 'here';
    if (who === 'claims') return false;
    const sc = bubbleScale(b, bubbleChar(b));
    for (const v of G.players) {
      if (!trappable(v, b)) continue;
      let at = v;
      if (G.online && !v.local) { if (who === 'legacy') continue; at = shownAt(v) || v; }
      if (rivalTouch(sc, b.x, b.y, at.x, at.y, 0)) { catchPlayer(v, b); return true; }
    }
    return false;
  }
  // battle: at most SHOT_CAP of a player's OWN bubbles out at once in all - in flight + floating empties (the user,
  // 2026-10-22: "합쳐서 3개"). An otter's volley counts once (its droplets never float); a frog's eggs count like any
  // bubble, hanging or floating (its hang cap, eggCap, may still let an old egg float: it stays counted); a bubble that
  // caught a rival / a monster is not the player's any more. A blow with SHOT_CAP out first pops the oldest (capMine:
  // the plain self-pop - no score, no chain): the oldest floating one; one in flight next (a volley goes whole); one
  // bounced on in the last RIDE_HOLD frames only when nothing else is left. The cap refuses no press (the magazine,
  // AMMO below, does: the cap is its backstop, at least the magazine - capOf). The host's world
  // decides (fire): a guest shows its new shot at once and sees the pop with the snapshot. Co-op / solo: no such limit
  // (capEmpties only). An older host sent g.sc and refused past SHOT_CAP in flight: its guest still stops there with
  // the quiet 'dry' (shotCapped). This host sends no g.sc: an older guest page fires freely and this host pops its oldest
  const SHOT_CAP = 3;
  // ---- battle: the magazine (장전 - the user, 2026-10-23). Each animal blows up to mag[0] bubbles (an otter's volley and
  // a frog's egg count one blow), then must wait: the magazine refills WHOLE once mag[1] frames pass with no blow - one
  // timer from the last blow, whether it is empty or only part spent (a burst then a pause refills it; firing on and on
  // never trickles one back). A press with nothing left does nothing but a quiet 칙 ('dry'); a held button blows on the
  // frame it refills; refilled from empty: a soft 'reload' and a flash on my gauge (the HUD seat's pip column, pips
  // under my animal while short). Battle only (co-op / solo: never); 능력 끄기: KIT_BASE's 3 in 2.0 s for everyone.
  // The host decides: updateWorld ticks every player, a guest's blow (hostShot) is refused with nothing left - its refill
  // counted AMMO_SLACK frames early there, so a late message never loses an honest blow. A guest runs the same count
  // for itself (guestSelf ticks, updatePlayer asks), so it never shows a blow the host refuses (the host is the
  // lenient side). g.am = 1: this host keeps magazines - an older host sends none and its guest fires as before
  // (NET.hostAm); an older guest page fires freely, its blows past the magazine are refused here and its own copies of
  // them give up (predGiveUp), nothing else. The P rows carry each player's [left, quiet frames] (24, 25) for the HUD.
  // SHOT_CAP stays the clutter backstop, at least the magazine (capOf)
  const AMMO_SLACK = 20;
  let AMMO_OFF = false; // (PG.debug.ammo.off: the older tests of the cap alone)
  const magOf = (p) => (AMMO_OFF || G.gameMode !== 'battle' || (G.online && G.role === 'guest' && !NET.hostAm) ? null : (kitOf(p).mag || KIT_BASE.mag));
  const capOf = (p) => { const m = p && magOf(p); return m ? Math.max(SHOT_CAP, m[0]) : SHOT_CAP; };
  function ammoInit(p, m) { if (p.amN === undefined) { p.amN = m[0]; p.amT = m[1]; } }
  // one frame of a player's magazine (the host: every player, while playing; a guest: its own)
  function ammoTick(p) {
    const m = magOf(p); if (!m) return;
    ammoInit(p, m);
    if (p.amT < 9999) p.amT++;
    if (p.amN < m[0] && p.amT >= m[1]) {
      const was = p.amN; p.amN = m[0];
      if (p.local !== false) { p.amFx = G.frame; if (!was) Snd.sfx('reload'); }
    }
  }
  // may p blow now? Takes one from the magazine (no magazine: always yes). slack: the host's early refill for a guest
  function ammoTake(p, slack) {
    const m = magOf(p); if (!m) return true;
    ammoInit(p, m);
    if (slack && p.amN < m[0] && p.amT >= m[1] - slack) p.amN = m[0];
    if (p.amN <= 0) { G.ammoDry = (G.ammoDry | 0) + 1; return false; } // (for the headless tests)
    p.amN--; p.amT = 0;
    return true;
  }
  const ammoRow = (p) => (p.amN === undefined || !magOf(p) ? [-1, 0] : [p.amN | 0, Math.min(9999, p.amT | 0)]);
  const mineOut = (slot) => G.bubbles.filter((b) => !b.dead && b.owner === slot && b.kind === 'empty' && !b.drop && (b.state === 'shot' || b.state === 'float'));
  function capMine(p) {
    const mine = mineOut(p.slot);
    // (0 floating, 1 in flight, 2 floating but ridden lately; the oldest first within one - the age counts from the blow)
    const rank = (b) => (b.state !== 'float' ? 1 : b.rideF !== undefined && G.frame - b.rideF < RIDE_HOLD ? 2 : 0);
    while (mine.length >= capOf(p)) {
      let pick = null;
      for (const b of mine) if (!pick || rank(b) < rank(pick) || (rank(b) === rank(pick) && (b.age > pick.age || (b.age === pick.age && b.id < pick.id)))) pick = b;
      mine.splice(mine.indexOf(pick), 1);
      if (pick.state === 'shot') for (const o of G.bubbles) if (o.drop && !o.dead && o.vol === pick.vol && o.owner === pick.owner && o.state === 'shot') popBubble(o, null, 'self');
      popBubble(pick, null, 'self');
      G.capPops = (G.capPops | 0) + 1; // (for the headless tests)
    }
  }
  function inFlight(slot) {
    let n = 0;
    for (const b of G.bubbles) if (!b.dead && b.owner === slot && b.state === 'shot' && b.kind === 'empty' && !b.drop && b.ty !== 'egg') n++;
    return n;
  }
  function shotCapped(p) {
    if (G.gameMode !== 'battle' || !G.online || G.role !== 'guest' || kitOf(p).shot.ty === 'egg') return false;
    const cap = NET.shotCap | 0; // (only an older host sends one)
    return cap > 0 && inFlight(p.slot) >= cap;
  }
  // the host's world, frame by frame: where each player was (a guest's claim names the snapshot tick it drew from)
  const REWIND = 30, CLAIM_TOL = 2, CLAIM_WAIT = 12;
  function notePos(pl) { const h = pl.ph || (pl.ph = []); h.push([G.frame, pl.x, pl.y]); if (h.length > REWIND + 8) h.shift(); }
  // battle: where each capture-phase bubble was, tick by tick (for lagTrapCheck). The path outlives the bubble for a
  // moment (G.shotLog): a victim's screen runs behind the host, so it may still show a shot that, in host time, has
  // since been popped, has caught an enemy or has left the screen; `spentAt` is when it stopped being a free shot
  function shotNote(b) {
    if (b.owner < 0 || b.kind !== 'empty') return;
    // (the path keeps the radius / droplet rule it was blown with: a catch later resets the bubble's own traits)
    if (!b.hist) { b.hist = []; b.hist.rP = b.rP; b.hist.drop = b.drop; b.hist.sc = bubbleScale(b, bubbleChar(b)); G.shotLog.push(b); }
    b.hist.push([G.frame, b.x, b.y, b.age]); // (age: an otter droplet catches rivals only up to its rivalAge)
    if (b.hist.length > HIST_KEEP) b.hist.shift();
  }
  const spend = (b) => { if (b && b.spentAt === undefined) b.spentAt = G.frame; };
  function lagTrapCheck() {
    G.shotLog = G.shotLog.filter((b) => b.hist && b.hist.length && G.frame - b.hist[b.hist.length - 1][0] <= HIST_KEEP);
    for (const v of G.players) {
      if (v.local) continue;
      const rem = NET.remote.get(v.id), st = rem && rem.st;
      if (!st || st.ep !== v.ep || !(st.rt > 0)) continue;
      const rt = Math.round(clamp(st.rt, G.frame - HIST_KEEP, G.frame));
      for (const b of G.shotLog) {
        if (!b.hist || !trappable(v, b) || shooterOf(b) !== 'legacy') continue;
        const dropAge = b.hist.drop ? KIT.otter.shot.drop.rivalAge : 1e9;
        let hit = false;
        for (const e of b.hist) {
          if (e[0] < rt - 2 || e[0] > rt || (b.spentAt !== undefined && e[0] >= b.spentAt) || e[3] > dropAge) continue;
          if (rivalTouch(b.hist.sc, e[1], e[2], st.x, st.y, 0)) { hit = true; break; }
        }
        if (!hit) continue;
        lateCatch(v, b);
        break;
      }
    }
  }
  function lateCatch(v, b, here) {
    if (!b.dead && b.state !== 'pop' && b.kind === 'empty') {
      // (a claim: the bubble may have flown on since that touch - the prison closes where the rival is now)
      if (here) { b.x = clamp(v.x, WALL_L, WALL_R - 16); b.y = clamp(v.y, CEIL_Y, PF_BOT - 16); }
      catchPlayer(v, b); return;
    }
    // (that bubble is already used up here: the catch gets a bubble of its own, the shooter's)
    spend(b); b.hist = null;
    const nb = makeBubble('empty', clamp(v.x, WALL_L, WALL_R - 16), clamp(v.y, CEIL_Y, PF_BOT - 16), b.owner);
    nb.big = b.big; nb.r = b.r; nb.rP = b.rP; nb.k = b.k; G.bubbles.push(nb);
    catchPlayer(v, nb);
  }
  // a guest's own bubble touched a rival on ITS screen (guestClaim: the shot n, volley index i, at age a; the rival as
  // drawn at x, y from tick k - w 0: the host world's snapshot tick, w 1: that rival's own body stream). The host checks
  // it against its own records a frame or so later: that bubble's path at age a (not used up before then), the rival's
  // recorded body at that tick (within 6 px of the claim, no more than REWIND = 0.5 s of that body's own time back:
  // 2 x a 120 ms link + the view's playout delay) - they touch (CLAIM_TOL px of slack) -> the catch, else nothing (the
  // guest's predicted catch lets go: the host's bubble flies on)
  function hostClaim(pl, m) {
    if (G.gameMode !== 'battle' || G.mode !== 'playing') return;
    const c = { pl, gid: NET.gid, n: nInt(m.n, 0, 1e9, 0), i: nInt(m.i, 0, 2, 0), a: nInt(m.a, -1, SHOT_MAX, -1), s: nInt(m.s, -1, 3, -1), e: nInt(m.e, -1, 1e9, -1),
      x: nNum(m.x, WALL_L - 4, WALL_R - 12, NaN), y: nNum(m.y, PF_TOP - 24, PF_BOT, NaN), k: nNum(m.k, 0, 1e12, -1), w: m.w === 1 ? 1 : 0, until: G.frame + CLAIM_WAIT };
    if (!c.n || c.a < 0 || c.s < 0 || c.s === pl.slot || c.e < 0 || c.k < 0 || Number.isNaN(c.x) || Number.isNaN(c.y)) return;
    NET.claims = (NET.claims || []).filter((q) => q.gid === NET.gid);
    if (NET.claims.filter((q) => q.pl === pl).length < 8) NET.claims.push(c);
  }
  function lagClaims() {
    if (!NET.claims || !NET.claims.length) return;
    const keep = [];
    for (const c of NET.claims) {
      const r = c.gid === NET.gid ? claimCheck(c) : 'no';
      if (r === 'wait' && G.frame <= c.until) keep.push(c);
      else if (r !== 'ok') { NET.claimNo = (NET.claimNo | 0) + 1; const w = NET.claimWhy || (NET.claimWhy = {}), k = r === 'wait' ? 'wait:' + c.wr : r === 'age' ? 'age:' + c.wr : r; w[k] = (w[k] | 0) + 1; }
    }
    NET.claims = keep;
  }
  function claimCheck(c) {
    const pl = c.pl, v = G.players.find((q) => q.slot === c.s);
    if (!G.players.includes(pl) || !v || v.ep !== c.e) return 'ep';
    let b = null;
    for (const q of G.shotLog) if (q.owner === pl.slot && q.sid === c.n) b = q;
    if (!b) { c.wr = 'sid'; return 'wait'; } // (its shot message may still be on the way)
    if (c.i) { const b0 = b; b = G.shotLog.find((q) => q.owner === pl.slot && q.vol === b0.id && q.vi === c.i) || null; }
    if (!b || !b.hist) return 'gone';
    if (!trappable(v, b)) return 'free';
    // (its age a in the host's path - or its last capture frame, when that ended one frame short of a)
    const h = b.hist, last = h[h.length - 1], e = h.find((q) => q[3] === c.a) || (last && b.state !== 'shot' && c.a - last[3] === 1 ? last : null);
    if (!e) { c.wr = 'young' + (h.length ? h[h.length - 1][3] - c.a : ''); return h.length && h[h.length - 1][3] < c.a && b.state === 'shot' && !b.dead ? 'wait' : 'age'; }
    if ((b.spentAt !== undefined && e[0] >= b.spentAt) || (h.drop && c.a > KIT.otter.shot.drop.rivalAge)) return 'spent';
    const at = c.w ? streamAt(v, c.k) : worldAt(v, c.k);
    if (!at) return 'rewind';
    if (Math.abs(at.x - c.x) > 6 || Math.abs(at.y - c.y) > 6) return 'where';
    if (!rivalTouch(h.sc, e[1], e[2], at.x, at.y, CLAIM_TOL)) return 'miss';
    const who = NET.who; NET.who = pl.slot; // (its own engine played the gulp when it claimed)
    lateCatch(v, b, true);
    NET.who = who;
    return 'ok';
  }
  // a body at host tick k (its per-frame record) / at its own stream tick k (a guest's states as they came in)
  function interpAt(list, k, kOf, xy) {
    for (let i = list.length - 1; i >= 0; i--) {
      const ka = kOf(list[i]); if (ka > k) continue;
      const a = xy(list[i]), nb = list[i + 1], b = nb ? xy(nb) : null;
      if (!b) return k - ka <= 2 ? a : null;
      const t = clamp((k - ka) / Math.max(1e-6, kOf(nb) - ka), 0, 1);
      return Math.abs(b.x - a.x) > 40 ? a : { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; // (no tween across a wrap)
    }
    return null;
  }
  function worldAt(v, k) {
    if (!(G.frame - k <= REWIND) || !v.ph) return null;
    return interpAt(v.ph, k, (e) => e[0], (e) => ({ x: e[1], y: e[2] }));
  }
  function streamAt(v, k) {
    const rem = !v.local && NET.remote.get(v.id); if (!rem || !rem.st || !(rem.st.k - k <= REWIND)) return null;
    const L = rem.buf.list.filter((q) => q.d.ep === v.ep);
    return interpAt(L, k, (q) => q.k, (q) => q.d);
  }
  // the capybara's onsen shield takes a capture too: the bubble bursts on it
  function catchPlayer(v, b) {
    if (v.shield > 0) { useShield(v); popBubble(b, null, 'self'); return; }
    trapPlayer(v, b);
  }
  function trapPlayer(v, b) {
    spend(b);
    b.kind = 'player'; b.victim = v; b.state = 'float'; b.age = 0; b.trapT = 0; b.vx *= 0.3; b.vy = -0.3; b.big = false; b.grace = TRAP_GRACE; b.hist = null;
    b.ty = 'line'; b.drop = false; b.r = 8; b.rP = 8;
    b.x = clamp((b.x + v.x) / 2, WALL_L, WALL_R - 16); b.y = clamp(Math.min(b.y, v.y), CEIL_Y, PF_BOT - 16);
    v.trap = { b, t: 0, prog: 0, mash: 0, by: b.owner };
    v.vx = 0; v.vy = 0; v.shootAnim = 0; v.jumpBuf = 0; v.shootBuf = 0; v.water = 0; v.onGround = false;
    clearMoves(v); bumpEp(v);
    burst(b.x + 8, b.y + 8, 10, [SLOT_COLS[b.owner] || '#ffffff', '#ffffff', '#c8f4ff'], 1.3, 14);
    Snd.sfx('trap_player');
  }
  function updateTrapped(pl, inp) {
    const t = pl.trap, b = t.b;
    if (!b || b.dead || b.state === 'pop' || b.victim !== pl) { releasePlayer(pl); return; }
    pl.x = clamp(b.x, WALL_L - 2, WALL_R - 14); pl.y = b.y; pl.vx = 0; pl.vy = 0; pl.onGround = false;
    if (pl.invuln > 0) pl.invuln--;
    t.t++;
    // about 4 s to wriggle free on its own; every jump / shoot press is worth ~12 frames (12 presses ~ 1.5 s)
    const mash = pl.local ? inp.jumpP || inp.shootP : false;
    t.prog += 1 + (mash ? PTRAP_MASH : 0);
    if (mash) { t.mash++; b.squish = 6; b.vx += (fxr() - 0.5) * 0.6; }
    if (t.prog >= PTRAP_FRAMES) escapeTrap(pl);
  }
  function mashTrap(pl) { if (pl && pl.trap) { pl.trap.prog += PTRAP_MASH; pl.trap.mash++; if (pl.trap.prog >= PTRAP_FRAMES) escapeTrap(pl); } }
  function escapeTrap(pl) {
    const b = pl.trap && pl.trap.b;
    if (b) burst(b.x + 8, b.y + 8, 10, ['#ffffff', '#c8f4ff', pl.color], 1.5, 14);
    Snd.sfx('escape');
    releasePlayer(pl);
  }
  // out of the bubble without a KO (escaped, or its bubble went away)
  function releasePlayer(pl) {
    const b = pl.trap && pl.trap.b;
    pl.trap = null;
    if (b && !b.dead && b.state !== 'pop') { b.victim = null; b.state = 'pop'; b.popT = 0; b.chain = null; b.vx = 0; b.vy = 0; }
    pl.invuln = Math.max(pl.invuln, 60); pl.vy = -1.6; pl.vx = 0; pl.onGround = false; pl.coyote = 0;
    clearMoves(pl); bumpEp(pl);
  }
  function knockOut(v, by, b) {
    v.trap = null; v.koT = KO_WAIT; v.koed++; v.vx = 0; v.vy = 0; v.power = null; v.shield = 0;
    clearMoves(v); bumpEp(v);
    by.kos++;
    addScore(KO_PTS, by);
    const cx = b.x + 8, cy = b.y + 8;
    wordPop(cx, cy - 10, '뽀득 KO!', by.color);
    popup(cx, cy - 2, KO_PTS, 1, by.color);
    burst(cx, cy, 16, [v.color, '#ffffff', '#ffe36b'], 2, 18); burst(cx, cy, 8, STAR_COLS, 1.4, 16);
    shake(3);
    Snd.sfx('ko');
  }
  // back in after a KO: a safe spawn (no enemy / boss right there), then the one farthest from the rivals; blinking
  // for 2.5 s (or until it blows a bubble)
  function respawnBattle(pl) {
    const sps = (LV.players || [LV.player]).filter(Boolean);
    let best = sps[pl.slot] || sps[0], bd = -Infinity;
    for (const sp of sps) {
      const x = sp.col * TS - 4, y = (sp.row + 1) * TS;
      let d = 1e9;
      for (const q of G.players) if (q !== pl && !q.koT) d = Math.min(d, Math.abs(q.x - x) + Math.abs(q.y - y));
      if (d === 1e9) d = 0;
      let danger = 0;
      for (const e of G.enemies) if ((e.state === 'active' || e.state === 'descend') && Math.abs(e.x - x) < 56 && Math.abs(e.y - y) < 24) danger++;
      const b = G.boss;
      if (b && Math.abs(b.x + 16 - (x + 8)) < 56 && Math.abs(b.y + 16 - (y + 8)) < 48) danger += 2;
      const score = d - 400 * danger;
      if (score > bd) { bd = score; best = sp; }
    }
    placePlayer(pl, best); pl.invuln = KO_INV;
    burst(pl.x + 8, pl.y + 8, 10, ['#ffffff', pl.color], 1.2, 14);
  }
  function stunPlayer(pl) {
    pl.stunT = STUN_FRAMES_P; pl.invuln = STUN_FRAMES_P + STUN_INV;
    pl.vy = Math.min(pl.vy, -1.8); pl.onGround = false; pl.shootAnim = 0;
    endMove(pl); pl.hop = 0; // (a capy stunned mid-slam just falls: no quake)
    const lost = Math.min(STUN_PTS, Math.max(0, pl.score | 0));
    addScore(-STUN_PTS, pl);
    // (only what was really taken: a player at 0 points gets a dizzy word instead of a phantom -100)
    if (lost > 0) popup(pl.x + 8, pl.y - 6, '-' + lost, 1, '#ff8a7a'); else wordPop(pl.x + 8, pl.y - 6, '어질!', '#ff8a7a');
    burst(pl.x + 8, pl.y + 6, 8, STAR_COLS, 1.4, 16);
    Snd.sfx('escape');
  }
  // ---- battle: the arena, its timer, the grime family coming back, power-ups, the boss dropping in
  function startArena(idx) {
    if (!ARENAS.length) loadArenas();
    const i = idx >= 0 && idx < ARENAS.length ? idx | 0 : ri(0, ARENAS.length - 1);
    LV = ARENAS[i]; MAP = LV.map; G.rid++;
    buildWater(MAP);
    roundCanvas = buildRoundCanvas(LV);
    G.round = 0; G.loop = 0; G.arena = i;
    G.gather = { x: LV.gather.col * TS + 4, y: PF_TOP + LV.gather.row * TS + 4 };
    G.enemies = []; G.bubbles = []; G.items = []; G.bolts = []; G.parts = []; G.kfx = []; G.pops = []; G.drops = []; G.ice = []; G.pickup = null;
    G.hazards = []; G.foam = []; G.boss = null; G.shotLog = [];
    G.hurry = false; G.scald = false; G.roundT = 0; G.roundClock = 0; G.roundDeaths = 0; G.introT = 0; G.clearT = -1; G.trans = null;
    G.stampT = 1e9; G.steamT = -1; G.loopMul = 1; G.trapTime = 420;
    // start spots: every other match (한 판 더) the floor and top spawn pairs swap, so no slot always starts in the
    // same place (mirror pairs stay together: a 1v1 is always corner vs corner); everyone blinks for 2.5 s after 시작!
    const pss = LV.players || [];
    const rot = (G.matchNo | 0) % 2 ? [2, 3, 0, 1] : [0, 1, 2, 3];
    for (const pl of G.players) { placePlayer(pl, pss[rot[pl.slot]] || spawnOf(pl.slot)); pl.invuln = START_INV; }
    const total = clamp(Math.round((+G.opts.time || 3) * 3600), 600, 5 * 3600);
    G.battle = { arena: i, total, left: total, intruded: false, enemyT: BATTLE_RESPAWN, powerT: BATTLE_POWER_EVERY };
    const sps = LV.enemySpawns || [], mon = G.opts.monsters !== false;
    // the opening wave drops in a little after 시작! (everyone gets a moment to move first); 몬스터 출현 off: none
    if (mon) for (let k = 0; k < Math.min(BATTLE_ENEMIES, sps.length); k++) { const e = spawnArenaEnemy(sps[k], k); if (e) e.delay += BATTLE_OPEN_DELAY; }
    G.attractT = 0; G.ap = null;
    G.mode = 'playing';
    showBanner(LV.name, '배틀 · ' + Math.round(total / 3600) + '분' + (mon ? '' : ' · 몬스터 없음'), 90, 'round');
    setMusic('battle');
  }
  function spawnArenaEnemy(sp, k) {
    const sps = LV.enemySpawns || [];
    if (!sp) {
      // a respawning enemy never appears next to a player, nor on a player's row within charging range
      const near = (q, s) => { const dx = Math.abs(q.x - (s.col * TS - 4)), dy = Math.abs(q.y - (s.row + 1) * TS); return (dx < 40 && dy < 32) || (dx < 96 && dy < 24); };
      const ok = sps.filter((s) => !G.players.some((q) => alive(q) && near(q, s)));
      if (!ok.length) return null;
      sp = ok[ri(0, ok.length - 1)];
    }
    const ground = MAP[sp.row + 1] && MAP[sp.row + 1][sp.col] === '#';
    const type = ground ? ENEMY_TYPES[ri(0, ENEMY_TYPES.length - 1)] : 'fly';
    const e = makeEnemy({ type, col: sp.col, row: sp.row, dir: rng() < 0.5 ? 1 : -1 }, k | 0);
    G.enemies.push(e);
    return e;
  }
  function updateBattle() {
    const bt = G.battle; if (!bt) return;
    if (bt.left > 0) bt.left--;
    if (bt.left > 0 && bt.left <= 180 && bt.left % 60 === 0) Snd.sfx('countdown');
    if (bt.left === 600) showBanner('10초 남았어요!', '', 60, 'hurry');
    if (!bt.intruded && G.opts.intrusion !== false && bt.left <= INTRUDE_LEFT && bt.left > 0) intrude();
    const up = G.enemies.filter((e) => e.state !== 'dead' && !e.minion).length;
    // (몬스터 출현 off: nobody comes back - bt.enemyT simply stops counting)
    if (G.opts.monsters !== false && up < BATTLE_ENEMIES && --bt.enemyT <= 0) { bt.enemyT = BATTLE_RESPAWN; spawnArenaEnemy(null, 0); }
    if (--bt.powerT <= 0) {
      bt.powerT = BATTLE_POWER_EVERY;
      // power-ups float down the middle (onto the centre floaters / stage / lid, equally far from every spawn)
      if (!G.pickup) spawnPickup(POWER_TYPES[ri(0, POWER_TYPES.length - 1)], ri(13 * TS, 19 * TS), CEIL_Y + 16);
    }
  }
  // "보스 난입!": a weaker boss (half soap, 1 HP) of a random kind drops into the arena at 1:30 left, centred on the
  // arena's mirror axis (cols 14-17) so it goes after nobody first
  function intrude(type) {
    const bt = G.battle; if (!bt || G.boss) return null;
    bt.intruded = true;
    type = BOSS_DEF[type] ? type : BOSS_TYPES[ri(0, BOSS_TYPES.length - 1)];
    const def = BOSS_DEF[type];
    G.boss = makeBoss({ boss: type, bossSpawn: { col: 14, row: def.fly ? 3 : 2 } });
    showBanner('보스 난입!', def.name + ' · 큰 거품을 터뜨리면 +' + INTRUDE_PTS.toLocaleString('ko-KR'), 110, 'boss');
    Snd.sfx('boss_roar');
    return G.boss;
  }
  function endBattle() {
    const order = G.players.slice().sort((a, b) => b.score - a.score || b.kos - a.kos || a.koed - b.koed || a.slot - b.slot);
    order.forEach((p, i) => { p.rank = i + 1; });
    for (const p of G.players) {
      if (p.trap) releasePlayer(p);
      p.koT = 0; p.stunT = 0; p.dead = false; p.ghost = null; p.out = false; p.invuln = 0; p.vx = 0; p.vy = 0; p.shield = 0; p.power = null;
      bumpEp(p);
    }
    // (te: the clock it ended on - a walkover ends early; 비누 코인, shop.md 3.2. The podium's snapshots carry it, so every
    // guest pays from the host's end, not from its own last 'p' snapshot's clock)
    const leftF = G.battle ? Math.max(0, G.battle.left | 0) : 0;
    G.podium = { order: order.map((p) => p.slot), t: 0, te: leftF };
    if (G.battle) G.battle.left = 0;
    G.mode = 'podium';
    G.boss = null; G.hazards = []; G.drops = []; G.bubbles = []; G.bolts = []; G.pickup = null;
    G.bannerQ = []; G.banner = null;
    setMusic('podium'); Snd.sfx('win');
    troHostResult(); // (an online ranked battle: the trophy result for everyone - see troHostResult)
    coinBattleNow(order.map((p) => ({ slot: p.slot, sc: p.score, k: p.kos, ko: p.koed })), leftF, (myPlayer() || {}).kos | 0);
    showOverlay('podium');
  }
  // podium spots (feet x centre, block top y) for ranks 1-4
  const PODIUM = [[128, 112], [92, 122], [164, 130], [206, 144]];
  function updatePodium() {
    const pd = G.podium; if (!pd) return;
    pd.t++;
    pd.order.forEach((slot, i) => {
      const p = G.players.find((q) => q.slot === slot); if (!p) return;
      const sp = PODIUM[i] || PODIUM[3];
      // a little dance: hop (winners higher), turn now and then
      const ph = pd.t * 0.12 + i * 1.7, hop = Math.max(0, Math.sin(ph)) * (i === 0 ? 6 : i === 1 ? 4 : 3);
      p.x = sp[0] - 8; p.y = sp[1] - 16 - hop; p.onGround = hop < 0.5; p.vy = Math.cos(ph) * -1; p.vx = 0;
      if (pd.t % 50 === i * 9) p.facing = -p.facing || 1;
      p.walkT += 0.6;
    });
    if (!reducedMotion() && pd.t % 3 === 0 && G.parts.length < 200) {
      G.parts.push({ x: WALL_L + fxr() * (WALL_R - WALL_L), y: PF_TOP + 2, vx: (fxr() - 0.5) * 0.6, vy: 0.4 + fxr() * 0.5, life: 120, max: 120, c: [...SLOT_COLS, '#ffffff'][(fxr() * 5) | 0], sz: fxr() < 0.3 ? 2 : 1, g: 0.01 });
    }
    troPodiumTick(); // (the trophy cups flying to the winner, the blocks' change lines: see the trophy section)
    coinPodTick();   // (the 비누 코인 line's first swap on my block: its sound)
    updateFx();
  }
  function rematch() {
    const list = G.players.map((p) => ({ slot: p.slot, char: p.char, nick: p.nick, local: p.local, id: p.id, look: p.look })); // (the match's looks carry over)
    newBattle(list, Object.assign({}, G.opts), (G.matchNo | 0) + 1); // (start spots swap every match: see startArena)
  }

  // ------------------------------------------------------------------ word pops (Korean: drawn as DOM labels)
  function wordPop(x, y, txt, col) {
    if (G.attract) return;
    G.words.push({ id: ++G.seq, x: clamp(x, 24, W - 24), y: clamp(y, PF_TOP + 8, PF_BOT - 8), txt: String(txt), col: col || '#ffffff', t: 0 });
    if (NET.rec) netEv('w', Math.round(x), Math.round(y), String(txt), col || '#ffffff');
    if (G.words.length > 6) G.words.shift();
  }
  function updateWords() {
    if (!G.words.length) return;
    for (const w of G.words) { w.t++; w.y -= w.t < 16 ? 0.5 : 0.1; }
    G.words = G.words.filter((w) => w.t < 56);
  }

  // ------------------------------------------------------------------ v4 trophies (트로피, design/trophies.md)
  // A count per device (0..99999) in localStorage 'ppogeul-trophy' (sget / sset only). There are no accounts: storage can
  // be cleared, a private window starts with the gift, devtools or extra browser profiles can raise one's own count, and
  // the counts friends see are self-reported. What this guarantees: nobody takes more from another player than that
  // player's own hold (stake + 6, the result for last place), never faster than real matches; tabs of one browser never
  // rank against each other.
  //  - 트로피 경기 (online battle): place points BASE[n]; 트로피 걸기: everyone puts in the host's stake, 1st takes the pot.
  //    Each player holds stake + 6 (견습: the stake) at "시작!" (troEscrow); the host's 'tro' result settles it (troApply:
  //    my own row, once, clamped by my own hold). Without a result it is refunded (no fault of mine) or forfeited (I left
  //    or went away: last place) - troSessionEnd, troWait, troStale
  //  - 목욕 보너스 (solo, online co-op): progress only (troBonus)
  //  - 연습 경기 (troPractice): tabs of one browser (bc), two players from one device's store - nothing changes
  //  - 안 걸고 참여 (a stake I cannot cover): I play that match without putting it in - place points and the +5 like
  //    everyone, never a share of the pot (only the stakes put in are in it, and only those who put one in share it)
  // (tab: this page load's id; everything else per tab lives here, never in storage. free: I readied without the stake)
  const TRO = { s: null, key: TRO_KEY, tab: '', mem: false, ro: false, allowBc: false, fast: false, day: null, awayAt: 0,
    seen: new Set(), live: new Map(), agreed: -1, free: false, match: null, lastRes: null, last: null, run: null, pod: null, msg: null, msgT: 0, waits: new Map() };
  function troRand(n) {
    const A = '0123456789abcdefghijklmnopqrstuvwxyz';
    let b = null; try { b = new Uint8Array(n); window.crypto.getRandomValues(b); } catch (e) { b = null; }
    let s = ''; for (let i = 0; i < n; i++) s += A[(b ? b[i] : Math.floor(Math.random() * 256)) % 36];
    return s;
  }
  // the local date as YYYYMMDD (the 목욕 보너스 day; PG.debug.tro.today fakes it)
  function troToday() { if (TRO.day !== null) return TRO.day; const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
  // my device id as seen by one room: FNV-1a 32 of dev + ':' + code, base 36, 6 chars (differs per room code)
  function troDevHash(code) {
    const s = (TRO.s ? TRO.s.dev : '') + ':' + String(code || '');
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return (h % 2176782336).toString(36).padStart(6, '0');
  }
  // (v 2, shop.md 5.1: + ce / sp the coins ever earned / spent, own the items bought (n1 is implicit), eq the worn set,
  // cd / cde the soft cap's day and its raw coins, bd / bs the day bonus's last day and streak, sh / cv the 상점 dot)
  // (v 3, looks-per-animal.md 2: eq is 30 characters - a worn set per animal, LOOKS_LEN; lh 1 = migrated from one shared
  // set and not told about per-animal dressing yet - cleared by the first dressing, never synced)
  // (v 4, design/gacha.md 5.1: dn the draws ever made - the account's when linked -, pt the pity, gd the drawn subset of
  // own, dl / ds the last batch and the n of the last one shown, nw the drawn items not looked at, gs the 뽑기 tab seen)
  // (bl starts at the gift's league - 100 is 뽀득 새내기 - and troParse never lets it sit below the count's: no 승급! for a
  // league held from the start, and the shop's league locks read it right; trophies.md 0)
  function troFresh() { return { v: TRO_V, dev: troRand(8), t: TRO_GIFT, best: TRO_GIFT, bl: leagueOf(TRO_GIFT), w: 0, g: 0, ko: 0, day: 0, de: 0, seen: 0, esc: [],
    ce: 0, sp: 0, own: [], eq: LOOKS0, lh: 0, cd: 0, cde: 0, bd: 0, bs: 0, sh: 0, cv: 0, dn: 0, pt: 0, gd: [], dl: null, ds: 0, nw: [], gs: 0 }; }
  // untrusted (hand edits, other versions): clamped field by field; null = start fresh, 'newer' = a newer page's data.
  // v 1 (before the shop) reads with no coins and nothing worn, v 2 (one worn set) with that set copied to all six
  // animals - lossless migrations, written back as v 5 at once (troLoad); v 3 (looks) reads with no draws; v 4 (before the
  // trophy balance) reads as is; v > 5 is a newer page's (read-only - an older page can never strip dn / gd / pt / dl,
  // gacha.md 5.1, nor clamp de to an older DAY_CAP: a v 4 page's 20 would reopen today's trophy bonus, trophies.md)
  function troParse(raw) {
    let o = null; try { o = JSON.parse(raw); } catch (e) { o = null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    if (typeof o.v === 'number' && o.v > TRO_V) return 'newer';
    if ((o.v !== 1 && o.v !== 2 && o.v !== 3 && o.v !== 4 && o.v !== TRO_V) || typeof o.dev !== 'string' || !/^[0-9a-z]{8}$/.test(o.dev)) return null;
    const I = (v, hi) => nInt(v, 0, hi, 0), t = I(o.t, TRO_MAX);
    const esc = (Array.isArray(o.esc) ? o.esc : []).filter((e) => e && typeof e === 'object' && typeof e.m === 'string' && MID_RE.test(e.m) && typeof e.tab === 'string' && ID6_RE.test(e.tab))
      .slice(-8).map((e) => ({ m: e.m, tab: e.tab, h: I(e.h, 56), s: STAKES.includes(e.s) ? e.s : 0, n: nInt(e.n, 2, 4, 2),
        p: e.p ? 1 : 0, st: e.st === 'wait' ? 'wait' : 'open', t0: nNum(e.t0, 0, 9e15, 0) }));
    const out = { v: TRO_V, dev: o.dev, t, best: Math.max(t, I(o.best, TRO_MAX)), bl: Math.max(I(o.bl, LEAGUES.length - 1), leagueOf(t)), w: I(o.w, 1e6),
      g: I(o.g, 1e6), ko: I(o.ko, 1e6), day: I(o.day, 99991231), de: I(o.de, DAY_CAP), seen: o.seen ? 1 : 0, esc };
    // (the shop: valid catalog ids only, no duplicates, never the starter, <= 64; the worn set keeps only what is owned)
    const own = Array.from(new Set((Array.isArray(o.own) ? o.own : []).filter((x) => isItemId(x) && x !== STARTER))).slice(0, 64);
    Object.assign(out, { ce: I(o.ce, 1e9), sp: I(o.sp, 1e9), own, eq: looksOwned(looksParse(o.eq), own),
      lh: o.v === 2 ? (lookOwned(lookParse(o.eq), own) !== LOOK0 ? 1 : 0) : (o.lh ? 1 : 0), cd: I(o.cd, 99991231), cde: I(o.cde, 99999),
      bd: I(o.bd, 99991231), bs: I(o.bs, COIN.day.length), sh: o.sh ? 1 : 0, cv: I(o.cv, COIN_MAX) });
    // (cloud trophies: a linked browser's link record, kept only when valid - never a cs: null, so the artifact's store
    // keeps its exact shape)
    const cs = o.cs ? clParseCs(o.cs) : null; if (cs) out.cs = cs;
    // (gacha, design/gacha.md 5.1: dn the draws, pt the pity, gd the drawn subset of own - every owned draw-only id is in
    // it -, dl / ds the last batch and whether it was shown, nw new drawn items, gs the 뽑기 tab seen; below v 4: none)
    const gd0 = Array.isArray(o.gd) ? o.gd : [];
    out.gd = own.filter((id) => isPoolId(id) && (ITEM[id].dr || gd0.includes(id)));
    out.dn = Math.max(I(o.dn, 1e9), out.gd.length);          // (a hand edit or a debug set never leaves gd larger than dn: the rules refuse that)
    out.pt = I(o.pt, DRAW.pity - 1);
    out.dl = drawLogParse(o.dl, out.dn);
    out.ds = Math.min(I(o.ds, 1e9), out.dn);
    out.nw = Array.from(new Set((Array.isArray(o.nw) ? o.nw : []).filter((id) => isItemId(id) && own.includes(id)))).slice(-DRAW.nw);
    out.gs = o.gs ? 1 : 0;
    return out;
  }
  // the last batch of draws (gacha.md 5.1): its own 6-character id, n within 1..dn, 1..10 results [pool id, refund 0 or
  // that rarity's DRAW.refund, kind 0..2]; anything else null
  function drawLogParse(x, dn) {
    if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !ID6_RE.test(x.id) || !Array.isArray(x.r) || !x.r.length || x.r.length > DRAW.log) return null;
    const n = nInt(x.n, 0, 1e9, 0); if (n < 1 || n > dn) return null;
    const r = [];
    for (const e of x.r) {
      if (!Array.isArray(e) || !isPoolId(e[0])) return null;
      const ref = e[1] | 0, k = e[2] | 0;
      if ((ref !== 0 && ref !== DRAW.refund[ITEM[e[0]].rar]) || k < 0 || k > 2) return null;
      r.push([e[0], ref, k]);
    }
    return { id: x.id, n, r };
  }
  // ---- the shop's ids and worn sets (shop.md 5.2): an id is a catalog id ('constructor' & co can never match)
  const isItemId = (s) => typeof s === 'string' && /^[hfnbe][1-9a-z]$/.test(s) && Object.prototype.hasOwnProperty.call(ITEM, s);
  // a worn set from anywhere (storage, network, the cloud): 5 chars (h f n b e), each slot's digit kept only if that item
  // exists ('0' = nothing worn there)
  function lookParse(s) {
    if (typeof s !== 'string' || !/^[0-9a-z]{5}$/.test(s)) return LOOK0;
    let o = ''; for (let i = 0; i < 5; i++) { const ch = s[i]; o += ch !== '0' && isItemId(LOOK_SLOTS[i] + ch) ? ch : '0'; }
    return o;
  }
  // ... and only what this store owns (the starter is always owned)
  function lookOwned(lk, own) { let o = ''; for (let i = 0; i < 5; i++) { const id = LOOK_SLOTS[i] + lk[i]; o += lk[i] !== '0' && (id === STARTER || own.includes(id)) ? lk[i] : '0'; } return o; }
  const lookPut = (lk, slot, id) => { const i = LOOK_SLOTS.indexOf(slot); return lk.slice(0, i) + (id ? id[1] : '0') + lk.slice(i + 1); };
  // ---- worn sets per animal (design/looks-per-animal.md): the store, the link record and the cloud document keep ONE
  // string of 30 characters - 5 per animal (h f n b e, as lookParse) in CHAR_IDS order (duck capy otter penguin cat
  // frog). Everything that draws, sends or compares ONE animal's set still uses the 5-character set (aniLook)
  const LOOKS_N = CHAR_IDS.length, LOOKS_LEN = 5 * LOOKS_N, LOOKS0 = LOOK0.repeat(LOOKS_N);
  // every animal's set from anywhere (storage, the link record, the cloud): each 5-character chunk through lookParse.
  // A 5-character set (a v 2 store, link record or document: one set for every animal) is copied to all six - nobody
  // loses the look they saw; anything else is bare
  function looksParse(s) {
    if (typeof s !== 'string') return LOOKS0;
    if (s.length === 5) return lookParse(s).repeat(LOOKS_N);
    if (s.length !== LOOKS_LEN) return LOOKS0;
    let o = ''; for (let a = 0; a < LOOKS_N; a++) o += lookParse(s.slice(5 * a, 5 * a + 5));
    return o;
  }
  // ... and only what this store owns (the starter is always owned)
  function looksOwned(ls, own) { let o = ''; for (let a = 0; a < LOOKS_N; a++) o += lookOwned(ls.slice(5 * a, 5 * a + 5), own); return o; }
  // animal c's set in ls (LOOK0 for anything else) / ls with animal c's set replaced by lk
  const aniLook = (ls, c) => { const a = CHAR_IDS.indexOf(c); return a < 0 || typeof ls !== 'string' || ls.length !== LOOKS_LEN ? LOOK0 : ls.slice(5 * a, 5 * a + 5); };
  const looksPut = (ls, c, lk) => { const a = CHAR_IDS.indexOf(c); return a < 0 ? ls : ls.slice(0, 5 * a) + lk + ls.slice(5 * a + 5); };
  // does any animal wear item id (the starter note: the gift has been found)
  const looksWear = (ls, id) => { const i = LOOK_SLOTS.indexOf(id[0]); for (let a = 0; a < LOOKS_N; a++) if (ls[5 * a + i] === id[1]) return true; return false; };
  // a 3-way merge character by character (one slot of one animal each): what changed here since base stays, the rest
  // follows remote. No base or no remote: local (the cloud's worn set, 6.3)
  function looksMerge(local, base, remote) {
    if (!base || !remote) return local;
    let o = ''; for (let i = 0; i < LOOKS_LEN; i++) o += local[i] !== base[i] ? local[i] : remote[i];
    return o;
  }
  // my sets (only what this store owns), and the set of animal c (default: my pick)
  const myLooks = () => (TRO.s ? looksOwned(looksParse(TRO.s.eq), TRO.s.own || []) : LOOKS0);
  const myLook = (c) => aniLook(myLooks(), isChar(c) ? c : G.sel);
  // the store as it is NOW (another tab of this browser may have written). (A key gone missing mid-session - storage
  // turned unreadable, site data cleared - keeps this tab's copy instead of starting over at the gift)
  function troRead() {
    if (TRO.mem || TRO.ro) return TRO.s;
    const raw = sget(TRO.key);
    if (raw === null) return TRO.s || troFresh();
    const o = troParse(raw);
    if (o === 'newer') { TRO.ro = true; return TRO.s || troFresh(); }      // a newer page's data: never overwritten
    return o || troFresh();                                                // unreadable: fresh, with the gift
  }
  function troWrite(S) { if (!TRO.mem && !TRO.ro) sset(TRO.key, JSON.stringify(S)); }
  // EVERY change: read, change, write (the in-memory copy alone would overwrite another tab's count)
  function troMut(fn) { const S = troRead(); const r = fn(S); troWrite(S); TRO.s = S; troSync(); return r; }
  function troLoad() {                         // boot (before setupDOM) and PG.debug.tro.ns
    TRO.mem = false; TRO.ro = false; TRO.s = null; TRO.s = troRead();
    if (!TRO.ro) { troWrite(TRO.s); if (sget(TRO.key) === null) TRO.mem = true; }   // blocked storage: this session only
    troStale();
  }
  // my count changed (here or in another tab): R carries it, the visible trophy UI follows (nothing is sent from here)
  function troSync() {
    NET.roomDirty = true;
    clKick();                                    // (cloud trophies: the next write of a linked store; inert without the cloud)
    syncTroBadge(); syncMyTro(); lookOut(); syncShopBtn();
    if (NET.screen === 'room' && shownOverlay === 'room') renderRoom();
    if (shownOverlay === 'rec') fillRec();
    if (shownOverlay === 'hub') hubFill();      // (v4 shop: the hub follows at once - a purchase in another tab too)
  }
  // trophy sounds: always local (never echoed to guests), only once audio is unlocked
  const troSfx = (n, o) => { if (unlocked) Snd.call('sfx', n, o); };
  const troSigned = (v) => (v > 0 ? '+' : '') + v;
  const troStakeTxt = (s) => (s ? s + '개씩' : '안 걸기');

  // ---- the rules (host only: troTable); a row becomes my change as net = base + share - stake (clamped: troApply)
  const sameRes = (a, b) => a.sc === b.sc && a.k === b.k && a.ko === b.ko;
  // one row [slot, place, base, share, kos, st] per finisher. fin = the players still here, best first (G.podium.order),
  // each {slot, sc, k, ko, p, z}; p = 견습 at 시작! (reported counts), z = 안 걸고 참여 (put no stake in). n = players at
  // 시작!, s = the stake, gl = leavers who left on purpose ('gg'), gz = how many of those put no stake in. The pot is the
  // stakes actually put in (the finishers' with z 0 and the other gl - gz leavers'); the best-placed group with someone
  // who put one in takes it, split among those (nothing in, nothing out: a z row never shares). st = 1 its stake is in
  // the pot / 0 not (s 0: always 1) - a guest never pays a stake its row says was not counted (troApply).
  // [] = no result: a walkover nobody gave up (a dropped link - maybe the host's own): void, every hold refunded
  function troTable(n, s, fin, gl, gz) {
    const m = fin.length, B = BASE[n], st = (r) => (s > 0 && r.z ? 0 : 1);
    const pot = s * (fin.filter(st).length + Math.max(0, gl - (gz | 0)));
    if (!B || !m || (m === 1 && !gl)) return [];
    // 기권승 (the rest gave up): the pot only, no 1st-place base (coinBattle) - and nothing for one who put nothing in
    if (m === 1) return [[fin[0].slot, 1, 0, st(fin[0]) ? pot : 0, fin[0].k, st(fin[0])]];
    if (m >= 2 && fin.every((r) => sameRes(r, fin[0]))) {                                     // 무승부: the pot split among those who put in
      const k = fin.filter(st).length;
      return fin.map((r) => [r.slot, 1, 0, st(r) && k ? Math.floor(pot / k) : 0, r.k, st(r)]);
    }
    const out = []; let paid = false;
    for (let i = 0; i < m;) {                                   // a tie group shares its places' points; a tie for 1st, the pot
      let j = i; while (j + 1 < m && sameRes(fin[j + 1], fin[i])) j++;
      let b = 0, ks = 0; for (let q = i; q <= j; q++) { b += B[q]; ks += st(fin[q]); }
      const k = j - i + 1, bb = Math.round(b / k), sh = !paid && ks ? Math.floor(pot / ks) : 0;
      if (ks) paid = true;                                      // (the first group with a stake in takes the pot)
      for (let q = i; q <= j; q++) out.push([fin[q].slot, i + 1, fin[q].p && bb < 0 ? 0 : bb, st(fin[q]) ? sh : 0, fin[q].k, st(fin[q])]);
      i = j + 1;
    }
    return out;                                                 // (what the floors leave over is simply not paid)
  }
  // 트로피 걸기: the host's stake for everyone (co-op never has one); a roster entry's count (my own: my real count)
  const stakeNow = () => (NET.mode === 'battle' ? NET.opts.bet | 0 : 0);
  const troCupOf = (r) => (r && r.id === NET.selfId ? (TRO.s ? TRO.s.t : 0) : r ? r.cup : -1);
  const troCovers = (r) => stakeNow() === 0 || troCupOf(r) >= stakeNow();
  // 안 걸고 참여: does this seat play the stake without putting it in. Me: readied without it (TRO.free), or short of it
  // now - only where the host has the rule (a host always; a guest: NET.hz, the host's R.f). The host's view of a guest:
  // a page that has the rule (r.z, from hi / rd) and readied without it or is short by its reported count. A guest's
  // view of another seat: the host's R.f. (An older page has no r.z: it must cover the stake, as before)
  function troSeatFree(r) {
    const s = stakeNow(); if (!s || !r) return false;
    if (r.id === NET.selfId) return NET.role === 'host' ? troCupOf(r) < s : NET.hz && ((NET.ready && TRO.free) || troCupOf(r) < s);
    if (NET.role === 'host') return !!r.z && ((r.ready && r.free) || !(r.cup >= s));
    return !!r.f;
  }
  // can this seat play the room's stake: cover it, or play without it
  const canAfford = (r) => troCovers(r) || troSeatFree(r);
  // host: 0 = 트로피 경기; 1 = this browser's tabs (bc: they share one store); 2 = two players from one device's store
  function troPractice() {
    if (NET.tr === 'bc' && !TRO.allowBc) return 1;
    const ds = NET.roster.map((r) => (r.id === NET.selfId ? troDevHash(NET.code) : r.d)).filter(Boolean);
    return new Set(ds).size < ds.length ? 2 : 0;
  }

  // ---- 목욕 보너스 (solo and online co-op): progress only. A run starts at round index loop * N + round (newGame /
  // newCoop / continueLoop; a guest's co-op run at its first snapshot of a game id); +2 per 3 탕 cleared, +4 per boss, +8
  // for the ending, at most RUN_CAP a run and DAY_CAP a local day (the pool battles' +5 comes from too: troApply); paid at the 목욕 끝 / ending cards, incrementally
  function troRunStart() { TRO.run = G.attract || G.gameMode === 'battle' ? null : { at: G.loop * LEVELS.length + G.round, got: 0 }; }
  // offline solo (not the attract demo, not debug local co-op), or online co-op that is ranked (NET.q === 0)
  const troBonusOk = () => !G.attract && (G.online ? G.gameMode === 'coop' && NET.q === 0 : G.gameMode === 'solo');
  function troBonus(ended) {
    const R = TRO.run; if (!R || !troBonusOk() || !TRO.s) return null;
    const N = LEVELS.length, end = G.loop * N + G.round + (ended ? 1 : 0), cleared = Math.max(0, end - R.at);
    let boss = 0; for (let i = R.at; i < end; i++) if (LEVELS[i % N].boss) boss++;
    const P = Math.min(RUN_CAP, 2 * Math.floor(cleared / 3) + 4 * boss + (ended ? 8 : 0));
    return troMut((S) => {
      const day = troToday(); if (S.day !== day) { S.day = day; S.de = 0; }
      const want = Math.max(0, P - R.got), give = Math.min(want, DAY_CAP - S.de);
      R.got += give; S.de += give; S.t = Math.min(TRO_MAX, S.t + give); S.best = Math.max(S.best, S.t);
      return { give, got: R.got, capped: want > give, now: S.t, promo: troPromo(S), show: P > 0 || want > give };
    });
  }

  // ---- holding, closing, applying (every player, the host included)
  // hold at "시작!": min = ms of real time before a result may be accepted (guests: the battle clock - TRO_SLACK_MS).
  // nos (안 걸고 참여): 0 = a count below the stake plays the match as practice for me (an older host's room); 1 = it
  // plays without the stake instead (the hold's s is 0: place points only); 2 = without the stake anyway (I readied
  // without it - TRO.free - and a ready never puts in more than it agreed to)
  function troEscrow(mid, s, n, min, nos) {
    if (!MID_RE.test(mid) || TRO.seen.has(mid) || TRO.ro || !TRO.s) return false;
    TRO.seen.add(mid);                                                   // once per match id, whatever happens
    return troMut((S) => {
      let put = s;
      if (s > 0 && (nos === 2 || S.t < s)) { if (!nos) return false; put = 0; }   // (can't cover it, no rule: practice for me)
      const p = leagueOf(S.t) === 0 ? 1 : 0, h = Math.min(S.t, put + (p ? 0 : 6));
      S.t -= h; S.esc = S.esc.concat([{ m: mid, tab: TRO.tab, h, s: put, n: clamp(n | 0, 2, 4), p, st: 'open', t0: Date.now() }]).slice(-8);
      TRO.live.set(mid, { at: performance.now(), min });
      if (put > 0) troSfx('stake');
      return true;
    });
  }
  // the stake my hold for mid put in (0: none, or no hold)
  const troPut = (mid) => { const e = TRO.s ? TRO.s.esc.find((q) => q.m === mid && q.tab === TRO.tab) : null; return e ? e.s : 0; };
  // close without a result: how 'refund' | 'forfeit' (a forfeit stays taken: last place, and counts as a game)
  function troClose(mid, how, why) {
    troMut((S) => {
      const e = S.esc.find((q) => q.m === mid); if (!e) return;
      if (how === 'refund') S.t = clamp(S.t + e.h, 0, TRO_MAX); else S.g = Math.min(1e6, S.g + 1);
      S.esc = S.esc.filter((q) => q !== e);
      if (e.tab === TRO.tab) TRO.last = { how, why, h: e.h, at: Date.now(), shown: false };   // the friends / room line reads it
    });
    TRO.live.delete(mid);
    if (TRO.waits.has(mid)) { clearTimeout(TRO.waits.get(mid)); TRO.waits.delete(mid); }
    if (NET.sess && NET.role === 'guest') troCupOut(mid);  // the host's room chips / rematch gate want my new count
  }
  // the +5 (TRO_PLAY) 오늘 트로피 보너스 of a battle is for a real match, the same test as the battle coins (coinBattle): more
  // than one finisher (a 기권승 never pays it), >= COIN.minF played on the clock it ended on (leftF: the host's G.podium.te;
  // a guest passes 0 - troApply takes its result only after the battle clock could have run anyway), and >= COIN.gameShots
  // bubbles I blew this match (CO.bshots, reset at 시작!)
  function troReal(nf, leftF) {
    const played = ((G.opts && G.opts.time) || 3) * 3600 - (leftF > COIN.walkF ? leftF : 0);
    return nf >= 2 && played >= COIN.minF && CO.bshots >= COIN.gameShots;
  }
  // a result: my own row only, once, clamped by my own numbers (players and stake from MY hold, never the message's).
  // The stake I pay is my hold's (0 when I played without it, 안 걸고 참여) - and 0 when my row says the pot did not get it
  // (row[5] === 0): never more than I held, never one nobody received; only a stake that went in can share in the pot.
  // real (troReal): + TRO_PLAY from today's trophy bonus pool (day / de, DAY_CAP - shared with the 목욕 보너스), inside the
  // same mutation, so only a hold of mine that gets a result can pay it (never practice, a refund, a void match); kept
  // apart from net (the podium shows it as its own mark). put: the stake I paid
  function troApply(mid, rows, slot, host, real) {
    const L = TRO.live.get(mid);
    // a guest takes a result only after the match could have been played: a modified host cannot drain anyone faster
    // than the battle clock (rejected = the hold stays -> 'wait' -> refund)
    if (!host && (!L || (!TRO.fast && performance.now() - L.at < L.min))) return null;
    if (!TRO.s || !TRO.s.esc.some((q) => q.m === mid && q.tab === TRO.tab)) return null;
    const res = troMut((S) => {
      const e = S.esc.find((q) => q.m === mid && q.tab === TRO.tab); if (!e) return null;          // applied / closed already
      const row = (Array.isArray(rows) ? rows : []).find((r) => Array.isArray(r) && nInt(r[0], -1, 3, -1) === slot); if (!row) return null;
      const n = e.n, s = row.length > 5 && row[5] === 0 ? 0 : e.s, B = BASE[n];
      const place = nInt(row[1], 1, n, n);
      let base = nInt(row[2], B[n - 1], B[0], B[n - 1]); if (e.p && base < 0) base = 0;
      const share = nInt(row[3], 0, s * n, 0), kos = nInt(row[4], 0, 99, 0);
      // (a win: 1st with points, or a 기권승 - my row alone, base 0, the pot only; a 무승부 is 1st with 0 among several)
      const walk = rows.filter(Array.isArray).length === 1;
      const before = S.t + e.h, after = clamp(before + base + share - s, 0, TRO_MAX), win = place === 1 && (base > 0 || (walk && base === 0));
      let bonus = 0;
      if (real && !walk) { const day = troToday(); if (S.day !== day) { S.day = day; S.de = 0; } bonus = clamp(Math.min(TRO_PLAY, DAY_CAP - S.de), 0, TRO_MAX - after); S.de += bonus; }
      S.t = after + bonus; S.g = Math.min(1e6, S.g + 1); if (win) S.w = Math.min(1e6, S.w + 1);
      S.ko = Math.min(1e6, S.ko + kos); S.best = Math.max(S.best, S.t);
      S.esc = S.esc.filter((q) => q !== e);
      return { place, net: after - before, now: S.t, bonus, win, put: s, promo: troPromo(S) };
    });
    if (res) { TRO.live.delete(mid); if (TRO.waits.has(mid)) { clearTimeout(TRO.waits.get(mid)); TRO.waits.delete(mid); } }
    return res;
  }
  // 승급!: only the first time a league is reached (the league itself always follows the count, down too)
  function troPromo(S) { const lg = leagueOf(S.t); if (lg > S.bl) { S.bl = lg; return lg; } return -1; }
  // away: hidden now, offline now, or back (visible / online / resumed / a loop gap > 1 s) under 30 s ago - the 'lost' of
  // a phone that switched apps arrives AFTER it is visible again, so the return counts too
  const troAway = () => !!document.hidden || navigator.onLine === false || Date.now() - TRO.awayAt < TRO_AWAY_MS;
  // first thing in netClose(why), while NET.sess is still set: why 'left' (나가기, 로비로, 처음으로, the tab closing) forfeits
  // (after telling the host 'gg'), 'host_left' / 'reload' refund, 'lost' refunds unless I was away; a 'wait' always refunds
  function troSessionEnd(why) {
    const mine = TRO.s ? TRO.s.esc.filter((e) => e.tab === TRO.tab) : [];
    if (why === 'left') troGg(1);                      // (guest: tell the host I gave up, before leave())
    const away = troAway();
    for (const e of mine) troClose(e.m, e.st === 'wait' || why === 'host_left' || why === 'reload' || (why === 'lost' && !away) ? 'refund' : 'forfeit', why);
    TRO.match = null; TRO.lastRes = null;
  }
  // the match is over in my view without a result (podium / room / a newer game id): 'wait', refunded after 15 s unless
  // the result still comes (a reliable message may lag the state). In-memory check first: called on every podium snapshot
  function troWait(mid) {
    if (!TRO.s || !TRO.s.esc.some((q) => q.m === mid && q.tab === TRO.tab && q.st === 'open')) return;
    troMut((S) => { const e = S.esc.find((q) => q.m === mid && q.tab === TRO.tab); if (e) e.st = 'wait'; });
    if (TRO.waits.has(mid)) clearTimeout(TRO.waits.get(mid));
    TRO.waits.set(mid, setTimeout(() => troWaitEnd(mid), TRO_WAIT_MS));
  }
  function troWaitEnd(mid) {
    TRO.waits.delete(mid);
    if (!stopped && TRO.s && TRO.s.esc.some((q) => q.m === mid && q.tab === TRO.tab && q.st === 'wait')) troClose(mid, 'refund', 'wait');
  }
  // boot and the title: a hold of a tab that died without pagehide (crash, discarded) - another load closes it after
  // 15 min (open: forfeit, wait: refund); this tab's own holds are never touched here
  function troStale(now) {
    now = now || Date.now();
    const old = (e) => e.tab !== TRO.tab && (!(now - e.t0 < TRO_STALE_MS) || e.t0 > now + 864e5);
    if (!TRO.s || !TRO.s.esc.some(old)) return;
    troMut((S) => { for (const e of S.esc.filter(old)) { if (e.st === 'wait') S.t = clamp(S.t + e.h, 0, TRO_MAX); else S.g = Math.min(1e6, S.g + 1); S.esc = S.esc.filter((q) => q !== e); } });
  }
  // this tab's open holds: any (8.7's confirm) and how much (its label)
  const troOpenHere = () => !!TRO.s && TRO.s.esc.some((e) => e.tab === TRO.tab && e.st === 'open');
  const troHeld = () => (TRO.s ? TRO.s.esc.filter((e) => e.tab === TRO.tab && e.st === 'open').reduce((a, e) => a + e.h, 0) : 0);

  // ---- network (host computes, everyone applies their own row)
  // guest: "if I am gone at the end, I left on purpose" (나가기, the tab hidden / closing); on: 0 when visible again
  function troGg(on) {
    if (!NET.sess || NET.role !== 'guest' || !TRO.s || !NET.ms) return;
    for (const e of TRO.s.esc) if (e.tab === TRO.tab && e.st === 'open' && e.m.indexOf(NET.ms + '.') === 0) NET.sess.send(NET.hostId, { t: 'gg', m: e.m, on: on ? 1 : 0 });
  }
  const troCupOut = (mid) => { if (NET.sess && NET.role === 'guest' && TRO.s) NET.sess.send(NET.hostId, mid ? { t: 'cup', cu: TRO.s.t, m: mid } : { t: 'cup', cu: TRO.s.t }); };
  // host, on the "시작!" frame of a ranked online battle: who is 견습 (from the counts known now), then my own hold.
  // st (안 걸고 참여): whose stake is in the pot - mine from my own hold; a guest page with the rule (r.z) says what it put
  // in ('st', at its own 시작!) and counts nothing until it does (a hold it never made, a practice match for it, a lost
  // message: no stake in the pot, and its row tells it to pay none); an older guest page (no r.z) can only ready covering
  // the stake and pays it from its own hold, so it counts when its count covers it, as before
  function troHostGo() {
    if (!G.online || G.role !== 'host' || G.gameMode !== 'battle' || NET.q !== 0 || !NET.ms) return;
    const mid = NET.ms + '.' + NET.gid, s = stakeNow(), p = {}, st = {};
    let hs = 0;
    for (const pl of G.players) {
      const r = NET.roster.find((q) => q.id === pl.id), me = pl.id === NET.selfId, t = me ? TRO.s.t : r ? r.cup : -1;
      p[pl.slot] = t >= 0 && t < LEAGUES[1].min ? 1 : 0;
      if (me) hs = pl.slot; else st[pl.slot] = s > 0 && r && !r.z && t >= s ? 1 : 0;
    }
    TRO.match = { mid, s, n: G.players.length, p, st, slots: G.players.map((q) => q.slot), gg: new Set() };
    // (false = the host plays this one as practice for itself: read-only storage; short of the stake: without it)
    if (troEscrow(mid, s, G.players.length, 0, 1)) st[hs] = s > 0 && troPut(mid) === s ? 1 : 0;
  }
  // host, in endBattle: the table (only the stakes put in are in the pot - gg leavers' too; a walkover nobody gave up is
  // void), my own row, the reliable 'tro' to everyone
  function troHostResult() {
    const M = TRO.match; TRO.match = null;
    if (!M || !G.online || G.role !== 'host' || M.mid !== NET.ms + '.' + NET.gid || !G.podium) return;   // (none before 시작!)
    const z = (sl) => (M.s > 0 && !M.st[sl] ? 1 : 0);
    const fin = G.podium.order.map((sl) => G.players.find((q) => q.slot === sl)).filter(Boolean)
      .map((pl) => ({ slot: pl.slot, sc: pl.score, k: pl.kos, ko: pl.koed, p: M.p[pl.slot] | 0, z: z(pl.slot) }));
    const left = M.slots.filter((sl) => !fin.some((f) => f.slot === sl) && M.gg.has(sl));
    const rows = troTable(M.n, M.s, fin, left.length, left.filter(z).length);
    if (!rows.length) { troClose(M.mid, 'refund', 'void'); troPodium(M.mid, [], M.n, M.s, null, 'void'); return; }
    const res = troApply(M.mid, rows, 0, true, troReal(fin.length, G.podium.te));
    if (NET.sess) NET.sess.send('*', { t: 'tro', m: M.mid, n: M.n, s: M.s, r: rows });
    TRO.lastRes = { mid: M.mid, s: M.s };            // the 한 판 더 gate waits for each guest's 'cup' of this mid
    troPodium(M.mid, rows, M.n, M.s, res);
  }
  // 한 판 더 after a staked result: every guest has reported its new count for it (견습 and the room chips follow it), and
  // an older guest page (no r.z) can still cover the stake - the host and every guest with 안 걸고 참여 who are short now
  // play the next match without it
  function troCanRematch() {
    const L = TRO.lastRes; if (!G.online || G.role !== 'host' || !L || L.s === 0) return true;
    return !!TRO.s && NET.roster.every((r) => r.id === NET.selfId || (r.cupM === L.mid && (!!r.z || r.cup >= L.s)));
  }
  // guest: the host's result (the first message a guest accepts, only from NET.hostId)
  function troResultIn(m) {
    const mid = typeof m.m === 'string' && MID_RE.test(m.m) ? m.m : ''; if (!mid) return;
    const rows = Array.isArray(m.r) ? m.r.slice(0, 4) : [];
    const res = troApply(mid, rows, NET.slots.get(NET.selfId), false, troReal(rows.filter(Array.isArray).length, 0));
    // display only (8.8). A repeat for a match already shown (a replay, a hostile extra) keeps my own applied change and
    // never restarts the podium's animation
    const P = TRO.pod && TRO.pod.mid === mid ? TRO.pod : null;
    if (!P || P.t0 < 0) troPodium(mid, rows, nInt(m.n, 2, 4, 2), STAKES.includes(m.s) ? m.s : 0, res || (P && P.net !== null ? { net: P.net, now: P.now, promo: P.promo, bonus: P.bonus, put: P.put } : null), undefined, P ? P.at : undefined);
    troCupOut(mid);                                                                   // always: the host's rematch gate
    if (shownOverlay === 'podium') { fillPodium(); troPodiumUI(); }
  }
  // guest: the first 'p' snapshot of a ranked battle's game id = "시작!" for me (on a network event: a hidden tab too)
  function troGuestGo(id) {
    const mid = NET.ms + '.' + id;
    if (TRO.seen.has(mid)) return;
    if (NET.tr === 'bc' && !TRO.allowBc) return;                       // this browser's tabs share one store
    const s = stakeNow(); if (s > 0 && s !== TRO.agreed) return;      // not the stake I readied for: practice for me
    // (안 걸고 참여, where the host has it - NET.hz: readied without the stake, or short of it now -> held without it; an
    // older host's room: short = practice for me, as before)
    if (!troEscrow(mid, s, G.players.length, NET.opts.time * 60000 - TRO_SLACK_MS, !NET.hz ? 0 : TRO.free ? 2 : 1)) return;
    // (what I put in, to the host: only that is in the pot - its row then says so, and I never pay more than I held)
    if (s > 0 && NET.hz && NET.sess) NET.sess.send(NET.hostId, { t: 'st', m: mid, s: troPut(mid) });
    if (document.hidden) troGg(1);
  }
  // host: a stake the host can no longer cover drops to the largest one it can (said for 4 s, guests un-readied)
  function troLowerStake() {
    const b = NET.opts.bet | 0; if (!b || !TRO.s || TRO.s.t >= b) return false;
    let nb = 0; for (const s of STAKES) if (s <= TRO.s.t) nb = s;
    NET.opts.bet = nb;
    for (const r of NET.roster) if (r.id !== NET.selfId) r.ready = false;
    if (NET.mode === 'battle') troMsgSet('걸기를 낮췄어요: ' + troStakeTxt(nb));
    NET.roomDirty = true;
    return true;
  }
  // the room's 4 s message (stake changed / lowered, trophies refunded / forfeited)
  function troMsgSet(txt) {
    TRO.msg = { txt, until: performance.now() + 4000 };
    clearTimeout(TRO.msgT); TRO.msgT = setTimeout(() => { if (!stopped && NET.screen === 'room') renderRoom(); }, 4050);
  }
  // what my last hold ended as, while it is fresh (<= 10 s): the friends panel joins it to its error line
  function troLastText() {
    const L = TRO.last; if (!L || !(L.h > 0) || Date.now() - L.at > 10000) return '';
    return L.how === 'refund' ? '걸었던 트로피를 돌려받았어요' : '이번 판은 진 걸로 쳤어요';
  }
  // the countdown's "2" / "1" line (and its class: letters only - guests filter it)
  const troCountSub = () => (!G.online || G.gameMode !== 'battle' ? '' : NET.q ? '연습 경기 · 트로피 없음' : stakeNow() ? '트로피 ' + stakeNow() + '개씩 걸어요!' : '트로피 경기');
  const troCountCls = () => (!G.online || G.gameMode !== 'battle' ? '' : NET.q ? ' prac' : stakeNow() ? ' bet' : '');
  // (8.7) the armed label of 방으로 / 나가기 in the menu: what leaving now costs (this tab's held trophies)
  function troLeaveLabel(host) {
    const h = troHeld(), base = host ? '한 번 더 누르면 모두 방으로' : '한 번 더 누르면 나가요';
    return h > 0 ? base + ' · ' + (host ? '내 트로피' : '트로피') + ' -' + h : base;
  }
  // the room's rules line: the final result per place for this room's size and stake (troTable, distinct places); with
  // seats that play without the stake (안 걸고 참여), the pot those who put it in make and who takes it
  const troParts = (s) => { const n = clamp(NET.roster.length, 2, 4), fin = []; for (let i = 0; i < n; i++) fin.push({ slot: i, sc: n - i, k: 0, ko: 0, p: 0 });
    return troTable(n, s, fin, 0).map((r) => r[1] + '등 ' + troSigned(r[2] + r[3] - s)).join(' · '); };
  function troRulesLine() {
    const s = stakeNow(), k = NET.roster.filter((r) => !troSeatFree(r)).length;
    if (!s || !k) return '트로피 경기: ' + troParts(0);
    if (k >= NET.roster.length) return '모두 ' + s + '개씩 걸고 1등이 다 가져요: ' + troParts(s);
    return '판돈 ' + s * k + '개 (' + k + '명이 ' + s + '개씩): 건 사람 중 1등이 다 가져요';
  }
  // ... and 안 걸고 참여's own line (a stake, a host with the rule): nobody short blocks the room, and what it pays
  function troFreeLine() {
    if (!stakeNow() || !(NET.role === 'host' || NET.hz)) return '';
    return NET.roster.some(troSeatFree) ? '안 걸고 참여: 등수 점수만 받아요 · ' + troParts(0) : '트로피가 모자라면 안 걸고 참여해요 (등수 점수만 받아요)';
  }

  // ---- the podium (8.8): TRO.pod = the result as this screen shows it; the timeline runs off G.podium.t
  //   T0 = max(75, t when the result arrived): every losing block sends cups (stake 0: one; staked: ceil(-net / 10), 1..6;
  //   at most 18) to the 1st-place animal(s) (staked: whoever took the pot), 5 f apart, 30 f each; when the last lands (or
  //   at T0) every block's 2nd line flips from the score to cup + the change, counting up over 20 f; mine ends in tro_up /
  //   tro_down, 승급 20 f later
  function troPodium(mid, rows, n, s, res, kind, at) {
    const B = BASE[n] || BASE[2], m = new Map(), me = NET.role === 'host' ? 0 : NET.slots.get(NET.selfId);
    for (const r of Array.isArray(rows) ? rows : []) {
      if (!Array.isArray(r)) continue;
      const slot = nInt(r[0], -1, 3, -1); if (slot < 0 || m.has(slot)) continue;
      // (st, r[5] === 0: 안 걸고 참여 - that row put no stake in and shares none; an older host sends no r[5]: staked)
      const put = r.length > 5 && r[5] === 0 ? 0 : s, base = nInt(r[2], B[n - 1], B[0], 0), share = nInt(r[3], 0, put * n, 0);
      m.set(slot, { place: nInt(r[1], 1, n, n), base, share, net: base + share - put, free: s > 0 && !put });
    }
    // (mine: what my store did - played without the stake when my hold put none in; practice for me: my score)
    const free = !!res && s > 0 && res.put === 0;
    if (res && m.has(me)) Object.assign(m.get(me), { net: res.net, free }); else m.delete(me);
    if (!kind) {
      const all = Array.from(m.values()), rl = (Array.isArray(rows) ? rows : []).filter(Array.isArray);
      kind = rl.length >= 2 && rl.every((r) => +r[1] === 1 && +r[2] === 0) ? 'draw' : rl.length === 1 ? 'walk' : all.length ? 'win' : 'prac';
    }
    TRO.pod = { mid, kind, rows: m, n, s, net: res ? res.net : null, now: res ? res.now : null, promo: res ? res.promo : -1, bonus: res ? res.bonus | 0 : 0, put: res ? res.put : s, free,
      at: at !== undefined ? at : G.podium ? G.podium.t : 0, t0: -1, fl: null, flipAt: -1, landed: 0, upDone: false, promoDone: false };
  }
  // the result of THIS game id only (a late one for the previous game is never drawn on the next podium)
  function troPodNow() { const P = TRO.pod; return P && G.podium && P.mid === NET.ms + '.' + NET.gid ? P : null; }
  const troEase = (u) => 1 - (1 - u) * (1 - u);
  function troPodiumTick() {
    const P = troPodNow(); if (!P || !P.rows.size) return;
    const t = G.podium.t, rm = reducedMotion(), me = G.localSlot;
    if (P.t0 < 0) P.t0 = Math.max(75, P.at);
    if (t < P.t0) return;
    if (!P.fl) {
      P.fl = [];
      // (to the 1st-place animal(s) - staked: to whoever took the pot, which is the best who put a stake in: 안 걸고 참여)
      const order = G.podium.order, first = order.filter((sl) => P.rows.has(sl) && P.rows.get(sl).place === 1);
      const pot = P.s > 0 ? order.filter((sl) => P.rows.has(sl) && P.rows.get(sl).share > 0) : [], win = pot.length ? pot : first;
      if (!rm && win.length && P.kind !== 'draw') {
        for (const sl of order) {
          const r = P.rows.get(sl); if (!r || r.net >= 0) continue;
          const k = P.s > 0 ? clamp(Math.ceil(-r.net / 10), 1, 6) : 1;
          for (let j = 0; j < k && P.fl.length < 18; j++) P.fl.push({ from: sl, to: win[P.fl.length % win.length], at: P.t0 + P.fl.length * 5, landed: false });
        }
      }
      P.flipAt = P.fl.length ? P.fl[P.fl.length - 1].at + 30 : P.t0;
    }
    for (const f of P.fl) {
      if (f.landed || t < f.at + 30) continue;
      f.landed = true; P.landed++;
      troSfx('tro_fly', { n: P.landed % 6 });
      const p = G.players.find((q) => q.slot === f.to);
      if (p) burst(p.x + 8, p.y - 3, 4, ['#ffd447', '#fff1a6', '#ffb24a'], 1.2, 12);
    }
    const end = P.flipAt + (rm ? 0 : 20), mine = P.rows.get(me);
    if (!P.upDone && t >= end) { P.upDone = true; if (mine && mine.net) troSfx(mine.net > 0 ? 'tro_up' : 'tro_down'); troPodBonus(); }
    if (P.promo >= 0 && !P.promoDone && t >= end + 20) { P.promoDone = true; troSfx('promote'); troPodiumTag(); }
  }
  // drawn by drawPodium: a block's 2nd line once flipped (cup + the signed change, counting up) and the flying cups
  function troPodLine(slot, cx, y) {
    const P = troPodNow(), r = P && P.rows.get(slot);
    if (!r || P.flipAt < 0 || G.podium.t < P.flipAt) return false;
    const k = reducedMotion() ? 1 : troEase(clamp((G.podium.t - P.flipAt) / 20, 0, 1));
    const v = Math.round(r.net * k), str = troSigned(v), w = 9 + textW(str, 1), x = Math.round(cx - w / 2);
    const f = frameOf(SPR_CUP, 0); if (f) ctx.drawImage(f.c, x, y - 1);
    text(str, x + 9, y, r.net > 0 ? '#7fe08f' : r.net < 0 ? '#ff8fb1' : '#c4b99f');
    return true;
  }
  function troPodCups() {
    const P = troPodNow(); if (!P || !P.fl || !P.fl.length) return;
    const t = G.podium.t, order = G.podium.order;
    for (const f of P.fl) {
      if (f.landed || t < f.at) continue;
      const i = order.indexOf(f.from), p = G.players.find((q) => q.slot === f.to); if (i < 0 || !p) continue;
      const sp = PODIUM[i] || PODIUM[3], u = clamp((t - f.at) / 30, 0, 1);
      const x = lerp(sp[0], p.x + 8, u), y = lerp(sp[1] - 2, headTop(p) - 3, u) - 24 * Math.sin(Math.PI * u); // (lands above a worn hat)
      const fr = frameOf(SPR_CUP, (t >> 2) & 1); if (fr) ctx.drawImage(fr.c, Math.round(x - 4), Math.round(y - 4));
    }
  }
  // the podium's DOM: the title tag, the host's note + 한 판 더 gate, the guest's wait line (podium shown, 'cup', roster)
  function troPodiumTag() {
    const el = $('pg-podium-tag'); if (!el) return;
    const P = G.online ? troPodNow() : null;
    let txt = '', cls = 'pg-podium-tag';
    if (P && P.promo >= 0 && P.promoDone) { txt = '승급! ' + LEAGUES[P.promo].name; cls += ' pg-promo'; }
    else if (P && P.kind === 'draw') txt = '무승부';
    else if (P && P.kind === 'walk') txt = '기권승';
    else if (P && P.kind === 'prac') { txt = '연습'; cls += ' is-prac'; }
    if (el.textContent !== txt) el.textContent = txt;
    if (el.className !== cls) el.className = cls;
    el.hidden = !txt;
  }
  // my 오늘 트로피 보너스 of this match (troApply's bonus, apart from the net on my block): its own line once my change has
  // counted up (troPodiumTick's upDone), led by 안 걸고 참여 when I played without the stake
  function troPodBonus() {
    const el = $('pg-podium-bonus'); if (!el) return;
    const P = G.online ? troPodNow() : null;
    const txt = P && P.upDone ? [P.free ? '안 걸고 참여' : '', P.bonus > 0 ? '오늘 트로피 보너스 +' + P.bonus : ''].filter(Boolean).join(' · ') : '';
    if (el.textContent !== txt) el.textContent = txt;
    el.hidden = !txt;
  }
  function troPodiumUI() {
    if (G.online && NET.sess && NET.q !== 0 && G.podium) {
      const mid = NET.ms + '.' + NET.gid;
      if (!TRO.pod || TRO.pod.mid !== mid) TRO.pod = { mid, kind: 'prac', rows: new Map(), promo: -1, at: 0, t0: -1, fl: null, flipAt: -1, landed: 0 };
    }
    troPodiumTag(); troPodBonus();
    const host = G.online && NET.sess && NET.role === 'host', P = G.online ? troPodNow() : null;
    const again = $('pg-podium-again'), note = $('pg-podium-note');
    const ok = troCanRematch();
    if (again) again.disabled = !!host && !ok;
    let txt = '';
    if (host && P && P.kind === 'void') txt = '친구가 나가서 이번 판은 무효예요';
    else if (host && !ok && TRO.lastRes) {
      const L = TRO.lastRes;            // (only an older guest page - no 안 걸고 참여 - still has to cover the stake)
      if (NET.roster.some((r) => r.id !== NET.selfId && r.cupM === L.mid && !r.z && r.cup < L.s)) txt = '트로피가 모자란 친구가 있어요 · 방으로 가서 걸기를 바꿔요';
    }
    else if (host && TRO.lastRes && TRO.lastRes.s > 0) {
      // (안 걸고 참여: who plays the next match without the stake - the host by its own count, a friend by its 'cup' or
      // because it readied without it)
      if (troSeatFree({ id: NET.selfId })) txt = '내 트로피가 모자라서 다음 판은 안 걸고 해요';
      else if (NET.roster.some((r) => r.id !== NET.selfId && troSeatFree(r))) txt = '다음 판은 안 걸고 하는 친구가 있어요';
    }
    if (note) { if (note.textContent !== txt) note.textContent = txt; note.hidden = !txt; }
    // (a guest's wait line: the next match keeps the stake)
    const w = dom.podium ? dom.podium.querySelector('[data-net-wait]') : null;
    if (w) w.textContent = '방장이 다음 판을 고르고 있어요' + (G.online && stakeNow() > 0 ? ' · 다음 판도 ' + stakeNow() + '개씩' + (troSeatFree({ id: NET.selfId }) ? ' · 나는 안 걸고 해요' : '') : '');
  }

  // ---- UI pieces (8.1 - 8.4, 8.9)
  // the 8x8 icons: .pg-cup canvases get the cup (grey for an unknown count), .pg-lg[data-lg] the league
  function troIcon(cv, name, grey) {
    if (!cv) return;
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, cv.width, cv.height);
    let f = frameOf(name, 0); if (!f) return;
    if (grey) f = tintOf(f, '#8a9b98', 0.8);
    x.drawImage(f.c, 0, 0, f.w, f.h, 0, 0, cv.width, cv.height);
  }
  function paintCups(root) { for (const cv of (root || document).querySelectorAll('canvas.pg-cup:not([data-p])')) { troIcon(cv, SPR_CUP); cv.dataset.p = '1'; } }
  // a count chip: league icon + cup + count (an unknown count: a grey cup and "?")
  function troChip(t) {
    const known = t >= 0, s = h('span', 'pg-tchip' + (known ? '' : ' is-unknown'));
    if (known) { const lg = mk(8, 8); lg.className = 'pg-ic pg-lg'; lg.setAttribute('aria-hidden', 'true'); troIcon(lg, LG_PRE + leagueOf(t)); s.appendChild(lg); }
    const cup = mk(8, 8); cup.className = 'pg-ic'; cup.setAttribute('aria-hidden', 'true'); troIcon(cup, SPR_CUP, !known);
    s.append(cup, h('b', '', known ? t.toLocaleString('ko-KR') : '?'));
    return s;
  }
  // the title's badge (8.1): league icon, cup, count, league name; a NEW dot until 내 기록 was opened once
  function syncTroBadge() {
    const b = dom.tro, S = TRO.s; if (!b || !S) return;
    const lg = leagueOf(S.t), L = LEAGUES[lg];
    setTxt(dom.troN, S.t.toLocaleString('ko-KR')); setTxt(dom.troName, L.name);
    if (b._lg !== lg) { b._lg = lg; b.style.setProperty('--lgc', L.col); troIcon(dom.troLg, LG_PRE + lg); }
    b._aria = '내 트로피 ' + S.t + '개 · ' + L.name + ' · 마이페이지 열기';   // (v4 shop: the badge opens 마이페이지)
    clBadge();                                   // (the aria-label, + the cloud's word and mark when it is on)
    if (dom.troNew) dom.troNew.hidden = !!S.seen && !PAL.reqs.length;   // (친구 순위: requests waiting)
  }
  // the friends panel's chip (8.3): my count before I host or join
  function syncMyTro() {
    const el = dom.myTro, S = TRO.s; if (!el || !S) return;
    if (el._t === S.t) return;
    el._t = S.t; el.textContent = ''; el.appendChild(troChip(S.t)); el.setAttribute('aria-label', '내 트로피 ' + S.t + '개');
  }
  // 내 기록 (8.2): over the title (G.mode stays 'title', the demo runs behind); Escape / Enter / jump / shoot / 닫기 close it.
  // (v4 shop 9.5) from = 'hub': opened from 마이페이지's 내 기록 button - closing it goes back there (focus on that button);
  // no argument: the title, as before
  function openRec(from) {
    firstGesture();
    HUB.recFrom = from === 'hub' ? 'hub' : 'title';
    if (TRO.s && !TRO.s.seen) troMut((S) => { S.seen = 1; });
    showOverlay('rec');
    clWarm();                                    // (cloud trophies: the sign-in tools load while the card is read)
  }
  function closeRec() {
    if (HUB.recFrom === 'hub') { HUB.recFrom = 'title'; openHub('my', HUB.from, true); return; }
    showOverlay('title');
    try { if (dom.tro) dom.tro.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  function fillRec() {
    const S = TRO.s; if (!S || !dom.rec) return;
    const lg = leagueOf(S.t), L = LEAGUES[lg], nx = LEAGUES[lg + 1];
    const box = $('pg-rec-lg'); if (box) box.style.setProperty('--lgc', L.col);
    troIcon($('pg-rec-lgart'), LG_PRE + lg);
    setTxt($('pg-rec-lgname'), L.name); setTxt($('pg-rec-n'), S.t.toLocaleString('ko-KR'));
    setTxt($('pg-rec-next'), nx ? '다음 리그까지 ' + (nx.min - S.t) + '개' : '최고 리그예요!');
    const fill = $('pg-rec-fill'); if (fill) fill.style.width = (nx ? clamp((S.t - L.min) / (nx.min - L.min), 0, 1) * 100 : 100).toFixed(1) + '%';
    setTxt($('pg-rec-best'), S.best.toLocaleString('ko-KR')); setTxt($('pg-rec-win'), S.w + '승 / ' + S.g + '판');
    setTxt($('pg-rec-ko'), S.ko.toLocaleString('ko-KR')); setTxt($('pg-rec-hi'), G.hiscore.toLocaleString('ko-KR'));
    const lad = $('pg-rec-ladder');
    if (lad && lad._key !== lg + ':' + S.bl) {
      lad._key = lg + ':' + S.bl; lad.textContent = '';
      LEAGUES.forEach((l, i) => {
        const li = h('li', i <= Math.max(lg, S.bl) ? (i === lg ? 'got on' : 'got') : (i === lg ? 'on' : ''));
        const cv = mk(8, 8); cv.setAttribute('aria-hidden', 'true'); troIcon(cv, LG_PRE + i);
        li.append(cv, h('span', 'pg-sr', l.name + ' · ' + l.min + '개부터'));
        if (i === lg) li.setAttribute('aria-current', 'true');
        lad.appendChild(li);
      });
    }
    const de = S.day === troToday() ? S.de : 0;
    // (the deploy with the cloud, in a frame: it is the frame that keeps nothing - the cloud line offers the game's own page)
    setTxt($('pg-rec-note'), TRO.mem || TRO.ro ? (CLOUD.on && clEnv().framed ? CL_NOTE : '이 브라우저에서는 기록이 저장되지 않아요')
      : S.g === 0 && S.de === 0 ? '처음 선물로 트로피 ' + S.best + '개를 받았어요! 친구와 배틀할 때 걸어 봐요'   // (the store's own gift: 30 before 2026-10)
        : '오늘 트로피 보너스 ' + de + '/' + DAY_CAP + '개 · 목욕도 배틀도 받아요');
    clUI();                                      // (cloud trophies: the status line and the sign-in button)
  }
  // the 목욕 끝 / ending cards (8.9): the 트로피 row (+N and the count, or "오늘 보너스 끝"), then the 승급 chip
  function troCard(name, res) {
    const over = name === 'over', row = $(over ? 'pg-over-trow' : 'pg-end-trow'), dd = $(over ? 'pg-over-tro' : 'pg-end-tro');
    const chip = $(over ? 'pg-over-promo' : 'pg-end-promo');
    clearTimeout(TRO.cardT); clearTimeout(TRO.cardT2);
    if (chip) chip.hidden = true;
    if (!row || !dd) return;
    row.hidden = !(res && res.show);
    if (row.hidden) return;
    const sp = dd.querySelector('span'), sm = dd.querySelector('small');
    if (sp) { sp.textContent = '+' + res.got; sp.className = ''; }
    if (sm) sm.textContent = res.capped ? '오늘 보너스 끝' : res.now.toLocaleString('ko-KR') + '개';
    TRO.cardT = setTimeout(() => {
      if (stopped || shownOverlay !== name) return;
      if (sp) { void sp.offsetWidth; sp.className = 'pg-tro-pop'; }
      if (res.give > 0) troSfx('tro_up');
      if (res.promo >= 0 && chip) TRO.cardT2 = setTimeout(() => {
        if (stopped || shownOverlay !== name) return;
        chip.textContent = '승급! ' + LEAGUES[res.promo].name; chip.hidden = false; troSfx('promote');
      }, 600);
    }, 500);
  }

  // ------------------------------------------------------------------ v4 shop (비누 코인 · 상점 · 마이페이지, design/shop.md)
  // 비누 코인 are earned by playing (win or lose, solo too) and spent in the 상점 on cosmetic items; they never touch
  // trophies, play or the network. They live in the trophy store (TRO_V 2: ce earned, sp spent, own, eq - one troMut
  // per change, so another tab never loses a coin):
  //  - sources (3.1): a 탕 cleared 6 (a boss 탕 15), the ending +50, a game of >= 60 s +2, co-op revives +2 each (<= 3);
  //    a battle 2 + 4 a full minute + the place bonus (not for a walkover) + 1 a 뽀득 KO (<= 6); the day's first paid
  //    result +20 .. +40 by streak (coinGive)
  //  - anti-farming (3.5): practice, offline local co-op / battles and the demo pay nothing (coinOk); a 탕 pays only if
  //    I blew >= 2 bubbles in it, a battle and the play coin >= 5; 400 coins a local day at full rate, then halved
  //  - battle coins: every screen computes its own from the podium it shows (coinBattle) - nothing is sent
  // (per tab, never stored: the run, the battle's shots and players at 시작!, the podium's coin line)
  // (eqSent / eqT: v4 shop S4 - the worn set this guest last told its host, and the 300 ms timer of the next 'eq')
  const CO = { run: null, bshots: 0, n: 0, goId: -1, tl: 0, gi: -1, pod: null, cardT: 0, allowBc: false, eqSent: '', eqT: 0 };
  const coinBal = (S) => clamp((S ? S.ce - S.sp : 0) | 0, 0, COIN_MAX);
  // the local date before / after YYYYMMDD
  function troDayAdd(d, k) { const x = new Date(Math.floor(d / 10000), Math.floor(d / 100) % 100 - 1, d % 100 + k); return x.getFullYear() * 10000 + (x.getMonth() + 1) * 100 + x.getDate(); }
  const troYesterday = (d) => troDayAdd(d, -1), troTomorrow = (d) => troDayAdd(d, 1);
  // practice for coins: an online game of tabs of one browser (q 1, unless a test allowed 'bc') or of one device's store
  const coinPrac = () => G.online && NET.q !== 0 && !(CO.allowBc && NET.q === 1 && NET.tr === 'bc');
  // offline solo (not the attract demo, not debug local co-op), or online co-op / battle that is not practice
  const coinOk = () => !G.attract && !!TRO.s && !TRO.ro && (G.online ? !coinPrac() && (G.gameMode === 'coop' || G.gameMode === 'battle') : G.gameMode === 'solo');
  // EVERY coin award goes through here (read-modify-write; the only writer of earned coins - the 뽑기's refunds are
  // drawCommit's, gacha.md 5.5). day: this award may be the day's first paid result (the day
  // bonus). Returns {give, bonus, halved, now, first} or null (a read-only store)
  function coinGive(a, day) {
    if (!TRO.s || TRO.ro) return null;
    return troMut((S) => {
      const today = troToday(); if (S.cd !== today) { S.cd = today; S.cde = 0; }
      if (S.bd > troTomorrow(today)) { S.bd = 0; S.bs = 0; }          // a bonus day from a wrong clock: forgotten, never trusted (3.4)
      a = clamp(a | 0, 0, 999);
      const full = clamp(COIN.soft - S.cde, 0, a), half = a - full;
      let give = full + (half > 0 ? Math.max(1, Math.floor(half / 2)) : 0), bonus = 0;
      S.cde = Math.min(99999, S.cde + a);
      if (day && give > 0 && S.bd < today) {                           // (a clock set back never pays a second bonus)
        const st = S.bd === troYesterday(today) ? Math.min(S.bs + 1, COIN.day.length) : 1;
        bonus = COIN.day[st - 1]; S.bd = today; S.bs = st;
      }
      const first = S.ce === 0;
      give = Math.max(0, Math.min(give + bonus, COIN_MAX - coinBal(S)));  // (the balance stops at 99,999)
      S.ce = Math.min(1e9, S.ce + give);
      return { give, bonus, halved: half > 0, now: coinBal(S), first };
    });
  }
  // ---- solo / co-op: a run (like TRO.run). newGame / newCoop / continueLoop start one (host / solo), a guest's co-op run
  // starts in guestBegin. done: the 탕 indexes (loop * N + round) already paid; shots: my bubbles since the last clear;
  // all: my bubbles this game; got / bonus / half / first: what this run paid (the card shows it); t0: G.frame at the start
  // (rv0: my revives when the run starts - 2회차 keeps the players and their counts, so the card pays only this run's;
  // a guest takes it from its own row of the game's first co-op snapshot: coinGuestIdx)
  function coinRunStart() {
    const me = myPlayer() || G.p;
    CO.run = G.attract || G.gameMode === 'battle' ? null : { done: new Set(), shots: 0, all: 0, got: 0, bonus: 0, half: false, first: false, t0: G.frame, end: false, rv0: me ? me.revives | 0 : 0 };
  }
  function coinRunAdd(res) { const R = CO.run; if (!R || !res) return; R.got += res.give; R.bonus += res.bonus; R.half = R.half || res.halved; R.first = R.first || (res.first && res.give > 0); }
  // a 탕 was cleared: each index pays once a run, and only if I blew >= 2 bubbles in it (ended: the ending's +50 too)
  function coinClear(idx, ended) {
    const R = CO.run; if (!R || !coinOk() || R.done.has(idx)) return null;
    R.done.add(idx);
    const act = R.shots >= COIN.roundShots; R.shots = 0;
    if (!act) return null;
    const a = (LEVELS[((idx % LEVELS.length) + LEVELS.length) % LEVELS.length].boss ? COIN.boss : COIN.round) + (ended ? COIN.ending : 0);
    const res = coinGive(a, true); coinRunAdd(res);
    return res;
  }
  // the 목욕 끝 / ending card: the play coin (>= 60 s, >= 5 bubbles) and my revives (co-op), once a run
  function coinEnd() {
    const R = CO.run; if (!R || !coinOk() || R.end) return null;
    R.end = true;
    const me = myPlayer() || G.p, rv = me ? clamp((me.revives | 0) - (R.rv0 | 0), 0, COIN.reviveMax) : 0;
    const a = (R.all >= COIN.gameShots && G.frame - R.t0 >= COIN.playF ? COIN.play : 0) + (G.gameMode === 'coop' ? rv * COIN.revive : 0);
    const res = a > 0 ? coinGive(a, true) : null; coinRunAdd(res);
    return { got: R.got, res };
  }
  // a 탕 clear that paid: "+6" (or "+15") over my animal, on this screen only (9.9: never recorded for the guests)
  function coinPop(res) {
    const n = res ? res.give - res.bonus : 0, p = myPlayer() || G.p; if (n <= 0 || !p) return;
    const rec = NET.rec; NET.rec = false; wordPop(p.x + 8, p.y - 6, '+' + n, '#ffc9dc'); NET.rec = rec;
  }
  // the top of fire(p): MY animal's blows only (solo, a host's own, a guest's own - fire hands it to guestFire - never a
  // remote player's hostShot), one per blow (an otter's volley is one fire)
  function coinShot(p) {
    if (!p || p !== (myPlayer() || G.p)) return;
    if (G.gameMode === 'battle') CO.bshots++;
    else if (CO.run) { CO.run.shots++; CO.run.all++; }
  }
  // the "시작!" frame of a battle (host: updateCountdown, with troHostGo; guest: its first 'p' snapshot of a game id). n:
  // the players at 시작! - a guest counts that snapshot's rows, which are the host's players at that frame (its own view
  // drops a leaver some ticks later: a leaver in the countdown's last 0.1 s would still count; review 2026-10-18)
  function coinGo(n) { CO.n = n === undefined ? G.players.length : n; CO.bshots = 0; }
  // guest, every accepted co-op snapshot: each 탕 index passed since the last one was cleared by the team (the first
  // snapshot of a game only sets where the run starts, and takes my revives so far from my own row, r[10]: the host's
  // count carries over into 2회차)
  function coinGuestIdx(idx, g) {
    if (CO.gi < 0 && CO.run && g && Array.isArray(g.P)) { const r = g.P.find((q) => Array.isArray(q) && nInt(q[0], -1, MAX_PLAYERS - 1, -1) === G.localSlot); if (r) CO.run.rv0 = nInt(r[10], 0, 1e6, 0); }
    if (CO.gi < 0 || idx < CO.gi || idx - CO.gi > LEVELS.length) { CO.gi = idx; return; }
    for (; CO.gi < idx; CO.gi++) coinPop(coinClear(CO.gi, false));
  }
  // ---- battle (3.2): my coins for a battle that reached the podium. n = players at 시작! (CO.n), fin = the finishers best
  // first ({slot, sc, k, ko}: the podium order every screen shows), me = my slot, leftF = the clock's frames left when it
  // ended (a walkover: > walkF), timeF = the match length in frames, shots = bubbles I blew, kos = my 뽀득 KOs. Pure
  function coinBattle(n, fin, me, leftF, timeF, shots, kos) {
    fin = Array.isArray(fin) ? fin : [];
    // (an end within walkF of the clock is full time: a guest's clock comes from a snapshot a few frames before the end -
    // floor() would drop its last minute; review 2026-10-18)
    const played = Math.max(0, timeF - (leftF > COIN.walkF ? leftF : 0));
    if (played < COIN.minF || shots < COIN.gameShots || !fin.some((r) => r.slot === me)) return 0;
    let c = COIN.bBase + COIN.bMin * Math.floor(played / 3600) + Math.min(COIN.koMax, Math.max(0, kos | 0)) * COIN.ko;
    if (leftF > COIN.walkF) return c;                           // a walkover: no place bonus (alt farming earns nothing extra)
    const B = COIN.place[clamp(n | 0, 2, 4)];
    for (let i = 0; i < fin.length;) {                          // the same tie groups as troTable (sameRes: score, kos, koed)
      let j = i; while (j + 1 < fin.length && sameRes(fin[j + 1], fin[i])) j++;
      if (fin.slice(i, j + 1).some((r) => r.slot === me)) { let s = 0; for (let q = i; q <= j; q++) s += B[Math.min(q, B.length - 1)]; c += Math.floor(s / (j - i + 1)); break; }
      i = j + 1;
    }
    return c;
  }
  const coinGid = () => (G.online ? NET.gid : -1);
  // the podium of an online battle: my coins for it, once per game id (host: endBattle, with the clock it ended on;
  // guest: its first 'd' snapshot, with that snapshot's order, rows and the host's end clock te)
  function coinBattleNow(fin, leftF, kos) {
    const gid = coinGid(); if (gid < 0 || (CO.pod && CO.pod.gid === gid)) return;
    CO.pod = { gid, give: 0, bonus: 0, prac: coinPrac(), rang: false };
    if (!coinOk()) return;
    const a = coinBattle(CO.n, fin, G.localSlot, leftF, ((G.opts && G.opts.time) || 3) * 3600, CO.bshots, kos);
    const res = a > 0 ? coinGive(a, true) : null;
    if (res) { CO.pod.give = res.give; CO.pod.bonus = res.bonus; }
    if (shownOverlay === 'podium') fillPodium();
  }
  function coinGuestPod(g) {
    const rows = Array.isArray(g.P) ? g.P : [], seen = new Set(), fin = [];
    for (const v of Array.isArray(g.pd) ? g.pd.slice(0, MAX_PLAYERS) : []) {
      const s = nInt(v, -1, MAX_PLAYERS - 1, -1), r = rows.find((q) => Array.isArray(q) && nInt(q[0], -1, MAX_PLAYERS - 1, -1) === s);
      if (s < 0 || seen.has(s) || !r) continue;
      seen.add(s); fin.push({ slot: s, sc: nInt(r[8], 0, 1e10, 0), k: nInt(r[11], 0, 1e6, 0), ko: nInt(r[12], 0, 1e6, 0) });
    }
    const me = fin.find((f) => f.slot === G.localSlot);
    // (the host's own end clock, te - an older host sends none: then the last 'p' snapshot's clock)
    coinBattleNow(fin, g.te !== undefined ? nInt(g.te, 0, 1e7, 0) : CO.tl, me ? me.k : 0);
  }
  // ---- the podium (9.8): my block's 2nd line alternates every 90 f between its usual content and [coin] +N, from T1 =
  // (the trophy flip's end, or 75) + 40; the coin's glint frame for 4 f at each swap; sfx 'coin' at the first swap
  const coinT1 = () => { const P = G.online ? troPodNow() : null; return Math.max(75, P && P.flipAt >= 0 ? P.flipAt + (reducedMotion() ? 0 : 20) : 0) + 40; };
  const coinPodOn = () => !!CO.pod && CO.pod.give > 0 && !!G.podium && CO.pod.gid === coinGid();
  function coinPodTick() { if (coinPodOn() && !CO.pod.rang && G.podium.t >= coinT1()) { CO.pod.rang = true; troSfx('coin'); } }
  function coinPodLine(slot, cx, y) {
    if (slot !== G.localSlot || !coinPodOn()) return false;
    const t = G.podium.t - coinT1(); if (t < 0 || ((t / 90) | 0) % 2) return false;
    const str = '+' + CO.pod.give, w = 9 + textW(str, 1), x = Math.round(cx - w / 2);
    const f = frameOf('coin', t % 90 < 4 ? 1 : 0); if (f) ctx.drawImage(f.c, x, y - 1);
    text(str, x + 9, y, '#ffc9dc', { outline: '#0c2629' });
    return true;
  }
  // the podium's screen-reader line: my coins for this battle (and the day bonus in them), or that practice pays none
  function coinPodSr() {
    const C = CO.pod; if (!G.online || !C || C.gid !== coinGid()) return '';
    if (C.prac) return ', 연습 경기라 비누 코인은 없어요';
    return C.give > 0 ? ', 비누 코인 +' + C.give + '개' + (C.bonus ? ', 오늘 첫 판 +' + C.bonus + ' 포함' : '') : '';
  }
  // ---- the 목욕 끝 / ending cards (9.7): the play coin and the revives (once a run), then the 비누 코인 row - +N (all this
  // run paid, the day bonus included) and a small text: the first coins ever "상점에서 써요!", the day bonus "첫 판 +20",
  // halved "오늘은 반만 모여요", else the balance. Shown only when this game pays coins and paid some; with the 트로피 row
  // too, a short screen hides the card's 최고 점수 row / sub line (.has-2rows)
  function coinCard(name) {
    const over = name === 'over', row = $(over ? 'pg-over-crow' : 'pg-end-crow'), dd = $(over ? 'pg-over-coin' : 'pg-end-coin'), card = dom[name];
    clearTimeout(CO.cardT);
    // (a guest's ending pays the last boss 탕 and the ending here: its round index never moves past the last 탕)
    if (!over && G.online && G.role === 'guest') coinClear(G.loop * LEVELS.length + LEVELS.length - 1, true);
    coinEnd();
    const R = CO.run, show = !!R && coinOk() && (R.got > 0 || R.half), trow = $(over ? 'pg-over-trow' : 'pg-end-trow');
    if (row) row.hidden = !show;
    if (card) card.classList.toggle('has-2rows', show && !!trow && !trow.hidden);
    if (!show || !dd) return;
    paintCoins(dd);
    const sp = dd.querySelector('span'), sm = dd.querySelector('small');
    if (sp) { sp.textContent = '+' + R.got; sp.className = ''; }
    // (review 2026-10-18: storage that keeps nothing says so first - "저장되지 않아요": the whole line of 마이페이지 and
    // the 상점 is too long for the 1x card; the first coins send a kid to the 상점 only when they buy something there -
    // else the goal, the cheapest item in reach: "60개 모으면 첫 아이템!")
    const S = TRO.s, low = S ? ITEMS.filter((it) => it.price > 0 && S.bl >= it.lg && !S.own.includes(it.id)).reduce((m, it) => Math.min(m, it.price), Infinity) : Infinity;
    if (sm) sm.textContent = TRO.mem ? '저장되지 않아요' : R.first ? (shopCanBuy(S) || low === Infinity ? '상점에서 써요!' : fmtN(low) + '개 모으면 첫 아이템!')
      : R.bonus ? '첫 판 +' + R.bonus : R.half ? '오늘은 반만 모여요' : fmtN(coinBal(S)) + '개';
    CO.cardT = setTimeout(() => { if (stopped || shownOverlay !== name) return; if (sp) { void sp.offsetWidth; sp.className = 'pg-tro-pop'; } troSfx('coin'); }, 500);
  }
  // the room's rules line (9.6): whether this room's games pay coins
  const coinRule = (q) => (q && !(CO.allowBc && q === 1 && NET.tr === 'bc') ? '연습 경기라 비누 코인도 없어요' : '이기든 지든 비누 코인을 받아요');
  // the 8x8 coin icons in the DOM (.pg-coin canvases)
  function paintCoins(root) { for (const cv of (root || document).querySelectorAll('canvas.pg-coin:not([data-p])')) { troIcon(cv, 'coin'); cv.dataset.p = '1'; } }
  // ---- buying and wearing (5.3): each one troMut on the store as it is NOW (another tab may have spent the coins or
  // bought the item); bought = worn. coinGive is the only writer of EARNED coins (ce) - drawCommit (the 뽑기, refunds)
  // the other writer of ce -, shopBuy and drawCommit the writers of sp
  function shopBuy(id, c) {                       // bought = worn by animal c (the hub's animal; default my pick)
    const a = isChar(c) ? c : G.sel;
    const it = isItemId(id) ? ITEM[id] : null; if (!it || it.price <= 0 || it.retired || TRO.ro || !TRO.s) return { ok: false, why: TRO.ro ? 'ro' : 'bad' };
    const r = troMut((S) => {
      if (S.own.includes(id)) return { ok: false, why: 'own' };
      if (S.bl < it.lg) return { ok: false, why: 'lock' };
      const bal = coinBal(S); if (bal < it.price) return { ok: false, why: 'poor', need: it.price - bal };
      S.sp = Math.min(1e9, S.sp + it.price); S.own = S.own.concat([id]);
      S.eq = looksPut(S.eq, a, lookPut(aniLook(S.eq, a), it.slot, id)); S.lh = 0;
      return { ok: true, now: coinBal(S) };
    }) || { ok: false, why: 'bad' };
    if (r.ok) lookOut();
    return r;
  }
  // wear (id) / take off (null) in one slot of animal c (default my pick): only an owned item (or the starter)
  function lookSet(slot, id, c) {
    const a = isChar(c) ? c : G.sel;
    if (TRO.ro || !TRO.s || LOOK_SLOTS.indexOf(slot) < 0 || (id && (!isItemId(id) || ITEM[id].slot !== slot))) return false;
    const ok = troMut((S) => { if (id && id !== STARTER && !S.own.includes(id)) return false; S.eq = looksPut(S.eq, a, lookPut(aniLook(S.eq, a), slot, id)); S.lh = 0;
      if (id && S.nw.includes(id)) S.nw = S.nw.filter((q) => q !== id);   // (worn: no longer NEW, gacha.md 6.9)
      return true; });
    if (ok) lookOut();
    return ok;
  }
  // my worn set changed: the title's attract animal and the pickers' busts follow (a running match keeps its looks:
  // shop.md 6.5). troSync runs it too, so a purchase in another tab shows here at once. In a room (7.2) the others see
  // it: the host's R carries mine (troSync marks the room dirty), a guest tells the host (lookSend)
  function lookOut() {
    if (G.mode === 'title' && G.p) { const lk = myLook(G.p.char); if (G.p.look !== lk) G.p.look = lk; }   // (the demo: its animal's set)
    pickArt(dom.pick); pickArt(dom.roomPick);
    lookSend();
  }
  // a guest in a room: 'eq' with my pick's worn set (looks-per-animal.md 5.1: the host takes every pick in the room phase;
  // not seatChar(), which right after a pick still names the old animal) when it differs from what the host was last told (hi / eq), 300 ms after the
  // last change (a run of taps in the hub is one message). Room phase only: a change during a match (another tab's
  // purchase) waits for the room - guestToRoom calls this again
  function lookSend() {
    if (!NET.sess || NET.role !== 'guest' || NET.screen !== 'room' || myLook(G.sel) === CO.eqSent) return;
    clearTimeout(CO.eqT);
    CO.eqT = setTimeout(() => {
      if (!NET.sess || NET.role !== 'guest' || NET.screen !== 'room') return;
      const lk = myLook(G.sel); if (lk === CO.eqSent) return;
      CO.eqSent = lk; NET.sess.send(NET.hostId, { t: 'eq', lk });
    }, 300);
  }

  // ---- the 상점 / 마이페이지 hub (9.1 - 9.6, 9.10): #pg-hub, one full-stage .pg-panel (like 친구와 하기 / the room) with
  // two tabs and a coin chip they share, opened from the title (the 상점 button, the trophy badge) or the room (꾸미기)
  // and closed back there (Escape / 닫기; 내 기록 opens over the title and comes back to 마이페이지). A plain form: no
  // game key acts in it and nothing in it starts a game. Its preview is a 32x32 canvas at 3x, animated by hubTick (the
  // main loop, every 4th frame) with a stand-in player and particles of its own - never the world's G.players / G.parts
  // (state per tab, never stored: tab, where it came from, the opener to focus again, the 상점's slot and selected item,
  // 마이페이지's slot, the animal every hub action dresses (HUB.ani: my pick at every opening, looks-per-animal.md 3), the armed 사기 (id, when), the coin chip's count-down,
  // the preview's frame / stand-in / particles, whether the 상점 button hopped this page load, where 내 기록 goes back to)
  const HUB = { tab: 'shop', from: 'title', opener: null, slot: 'h', sel: '', mySlot: 'h', ani: '', armId: '', armAt: 0, armT: 0,
    co: -1, coFrom: 0, coT0: 0, msgT: 0, f: 0, pp: null, parts: [], kfx: [], drawn: '', nudged: false, recFrom: 'title',
    // (review 2026-10-18: when the last purchase landed and what it was - the action button ignores taps for 0.8 s after
    // it, and a storage event that lost it says so; whether the 상점 tab showed in this opening - only then has its dot
    // been seen. The preview's carousel arrows are always drawn now: looks-per-animal.md 4.2)
    buyAt: 0, buyId: '', sawShop: false,
    // (the 뽑기, gacha.md 5.6: mine = the batch this tab committed {id, at, n, newIds} - watched 5 s for a lost write;
    // lost = the last such batch was lost (the 뽑기 tab says so). The tab (6.3 - 6.7): view 'machine' | 'res'; sel = the
    // collection's selected id; res = the batch shown {id, n, r: [[id, ref, k]], past}, rsel its selected result, revAt
    // its reveal (DRAW_GUARD), bare = its result taken off (shown as worn, not tried on); odds = the panel open; line /
    // lineT = a status shown for 4 s in place of the pity line; anim = the show (G4); said = reveals announced (tests))
    draw: { mine: null, lost: null, view: 'machine', sel: '', res: null, rsel: 0, revAt: 0, bare: false, odds: false, line: '', lineT: 0, anim: null, said: 0 } };
  const HUB_ARM_MS = 2500, HUB_Y = 15;      // (the armed 사기's window; the preview animal's y: its feet on row 31, the floor)
  const HUB_BUY_GUARD = 800, HUB_LOST_MS = 5000;   // (taps ignored after a purchase; how long a purchase is watched for a lost write)
  // can this store buy anything now (an unowned item it can afford in a league it reached)
  const shopCanBuy = (S) => { const b = coinBal(S); return !!S && ITEMS.some((it) => it.price > 0 && !it.retired && it.price <= b && S.bl >= it.lg && !S.own.includes(it.id)); };
  // the hub's animal: the preview, the try-on, 쓰기 / 벗기, the purchase's "bought = worn" and 마이페이지 all dress it; the hub
  // never changes the pick (looks-per-animal.md 3)
  const hubAni = () => (isChar(HUB.ani) ? HUB.ani : G.sel);
  const shopOwns = (S, id) => id === STARTER || (!!S && S.own.includes(id));
  const shopWorn = (lk, id) => isItemId(id) && lk[LOOK_SLOTS.indexOf(id[0])] === id[1];
  // the worn words of an item's aria-label: "쓰고 있어요" / "하고 있어요" / "메고 있어요" / "두르고 있어요" / "켜 놨어요"
  const wornTxt = (it) => (it.slot === 'e' ? '켜 놨어요' : verbOf(it).on.replace(/기$/, '고 있어요'));
  const rarOf = (it) => (it.rar < 0 ? { name: '처음 선물', col: '#7fdcc8' } : RARITY[clamp(it.rar, 0, RARITY.length - 1)]);
  // the title's 상점 button (9.1): its aria-label (the balance; whether something can be bought) and the NEW dot - the 상점
  // never opened, or more coins than when it was last closed and something they buy; the first time the dot lights on
  // the title in a page load, two hops (none under reduced motion: CSS)
  function syncShopBtn() {
    const b = dom.shopBtn, S = TRO.s; if (!b || !S) return;
    // (gacha.md 6.9: or the first draw is affordable and the 뽑기 tab was never seen)
    const bal = coinBal(S), can = shopCanBuy(S), first = !S.dn && bal >= DRAW.price && !S.gs, dot = !S.sh || (bal > S.cv && can) || first;
    const aria = '상점 · 비누 코인 ' + bal.toLocaleString('ko-KR') + '개' + (can ? ' · 살 수 있는 아이템이 있어요' : '') + (first ? ' · 뽑기를 할 수 있어요' : '');
    if (b.getAttribute('aria-label') !== aria) b.setAttribute('aria-label', aria);
    if (dom.shopNew && dom.shopNew.hidden === dot) dom.shopNew.hidden = !dot;
    if (dot && !HUB.nudged && shownOverlay === 'title') { HUB.nudged = true; b.classList.remove('is-nudge'); void b.offsetWidth; b.classList.add('is-nudge'); }
    shopBtnFit();
  }
  // the label "상점" wherever the start row has room for it - measured, not by a width rule (review 2026-10-18: a 360 /
  // 375 px phone has the room, a bare basket reads as a bath basket): labelled (is-label); else labelled with the start
  // buttons' side padding a little tighter (is-snug on the row: a 360 px phone is 1 px short); else the icon alone
  // (is-tight) - also where a fallback font while the web font loads makes the label too wide. Measured only while the
  // title shows (showOverlay, fit(), the fonts arriving). Layout widths, not scrollWidth: the NEW dot's hop is a scale
  // transform that would read as overflow mid-hop
  function shopBtnFit() {
    const b = dom.shopBtn, row = b && b.parentNode, card = row && row.closest('.pg-card'), ov = card && card.parentElement; if (!ov || shownOverlay !== 'title') return;
    // (the row asks the card for its whole width - min-width: max-content - so the room is the widest the card may grow:
    // its max-width of the overlay's content box, less its own padding and border; border-box sizing)
    const px = (v) => parseFloat(v) || 0, cs = getComputedStyle(card), os = getComputedStyle(ov), ovW = ov.clientWidth - px(os.paddingLeft) - px(os.paddingRight);
    const mw = cs.maxWidth, cardW = /%$/.test(mw) ? ovW * px(mw) / 100 : /px$/.test(mw) ? Math.min(ovW, px(mw)) : ovW;
    const room = cardW - px(cs.paddingLeft) - px(cs.paddingRight) - px(cs.borderLeftWidth) - px(cs.borderRightWidth);
    const kids = Array.from(row.children).filter((k) => !k.hidden), gap = px(getComputedStyle(row).columnGap);
    const fits = () => kids.reduce((s, k) => s + k.offsetWidth, 0) + gap * Math.max(0, kids.length - 1) <= room - 1;   // (offsetWidths are rounded: a px to spare)
    b.classList.remove('is-tight'); row.classList.remove('is-snug'); b.classList.add('is-label');
    if (fits()) return;
    row.classList.add('is-snug'); if (fits()) return;
    row.classList.remove('is-snug'); b.classList.remove('is-label'); b.classList.add('is-tight');
  }
  // an item's picture for a cell / an equipment box: its art (얼굴: the front frame; a tube: both halves, as worn; an
  // effect: its 8x8 icon) cropped to its opaque box, cached; null without art (the cell then shows the slot's icon - never
  // a stand-in box)
  const picCache = new Map();
  function itemPic(id) {
    let v = picCache.get(id); if (v !== undefined) return v;
    const it = isItemId(id) ? ITEM[id] : null;
    const fr = (!it ? [] : it.slot === 'e' ? [frameOf('ic_' + id, 0)] : it.at === 'W' ? [itemFrame(id, 0), itemFrame(id, 1)] : [itemFrame(id, it.slot === 'f' ? 1 : 0)]).filter(Boolean);
    v = null;
    if (fr.length) {
      const w = Math.max(...fr.map((f) => f.w)), hh = Math.max(...fr.map((f) => f.h)), c = mk(w, hh), x = c.getContext('2d', { willReadFrequently: true });
      for (const f of fr) x.drawImage(f.c, 0, 0);
      const d = x.getImageData(0, 0, w, hh).data; let x0 = w, y0 = hh, x1 = -1, y1 = -1;
      for (let i = 3; i < d.length; i += 4) if (d[i]) { const q = i >> 2, px = q % w, py = (q / w) | 0; x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
      if (x1 >= 0) v = { c, x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }
    picCache.set(id, v); return v;
  }
  // paint item `id` centred at the largest whole scale <= k that fits canvas cv; no art: the slot's 8x8 icon at 2x
  function paintItem(cv, id, k) {
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, cv.width, cv.height);
    const p = itemPic(id);
    if (!p) { const f = isItemId(id) ? frameOf('slot_' + id[0], 0) : null; if (f) x.drawImage(f.c, (cv.width - 16) >> 1, (cv.height - 16) >> 1, 16, 16); return; }
    const s = Math.max(1, Math.min(k, Math.floor(cv.width / p.w), Math.floor(cv.height / p.h)));
    x.drawImage(p.c, p.x0, p.y0, p.w, p.h, (cv.width - p.w * s) >> 1, (cv.height - p.h * s) >> 1, p.w * s, p.h * s);
  }
  // a slot's grey 8x8 silhouette at k x, centred (duck-tinted when on)
  function paintSlot(cv, s, k, on) {
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, cv.width, cv.height);
    let f = frameOf('slot_' + s, 0); if (!f) return;
    if (on) f = tintOf(f, '#ffd447', 0.6);
    x.drawImage(f.c, (cv.width - 8 * k) >> 1, (cv.height - 8 * k) >> 1, 8 * k, 8 * k);
  }
  // the cheapest affordable unowned item of slot s (in a league reached), or '' (the catalog is in price order per slot)
  function shopCheapest(s) { const S = TRO.s, b = coinBal(S); const it = ITEMS.find((q) => q.slot === s && q.price > 0 && !q.retired && q.price <= b && S && S.bl >= q.lg && !S.own.includes(q.id)); return it ? it.id : ''; }
  function openHub(tab, from, back) {
    firstGesture();
    HUB.from = from === 'room' && NET.screen === 'room' ? 'room' : 'title';
    // (마이페이지 opens on 머리 - on 목 while the starter note shows, the ribbon one tap away; back from 내 기록 as it was)
    if (!back) { HUB.opener = document.activeElement; HUB.mySlot = TRO.s && !TRO.s.own.length && !looksWear(myLooks(), STARTER) ? STARTER[0] : 'h'; HUB.sawShop = false; HUB.ani = G.sel; }
    HUB.pp = null; HUB.parts = []; HUB.kfx = []; HUB.drawn = '';
    if (!back) Object.assign(HUB.draw, { view: 'machine', sel: '', res: null, rsel: 0, bare: false, odds: false, line: '', anim: null });
    hubDisarm();
    showOverlay('hub');
    hubShow(tab === 'my' || tab === 'draw' ? tab : 'shop', !back);
    if (back) try { $(back === 'pal' ? 'pg-my-pal' : 'pg-my-rec').focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  // the hub's animal d steps on (1 the next, -1 the previous, wrapping): every tab shows and dresses it from now on
  function hubCycle(d) {
    const n = CHAR_IDS.length;
    HUB.ani = CHAR_IDS[(CHAR_IDS.indexOf(hubAni()) + (d < 0 ? n - 1 : 1)) % n]; HUB.drawn = '';
    if (shownOverlay === 'hub') hubFill();
  }
  function closeHub() {
    if (shownOverlay !== 'hub') return;
    // (a name being typed counts: the field hides now, so its blur may never come)
    if (dom.myNick && document.activeElement === dom.myNick) dom.myNick.value = netSetNick(dom.myNick.value) || NET.nick;
    // (the dot rule: these coins were seen - in the 상점 only: an opening that showed just 마이페이지 leaves its dot)
    if (HUB.sawShop && TRO.s && !TRO.ro && TRO.s.cv !== coinBal(TRO.s)) troMut((S) => { S.cv = coinBal(S); });
    const to = HUB.from === 'room' && NET.screen === 'room' ? 'room' : 'title';
    showOverlay(to);
    if (to === 'room') renderRoom();
    const o = HUB.opener; HUB.opener = null;
    try { if (o && o.isConnected && !o.closest('[hidden]')) o.focus({ preventScroll: true }); else if (to === 'title' && dom.shopBtn) dom.shopBtn.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  // showOverlay left the hub (closed, a game started, the room went away): nothing armed, no message waiting
  // (the 뽑기's show is dropped: the batch is stored and ds not set, so its result shows next time - gacha.md 6.6)
  function hubShut() { hubDisarm(); clearTimeout(HUB.msgT); if (dom.hubMsg) dom.hubMsg.textContent = ''; HUB.coT0 = 0; HUB.co = -1; drawShut(); }
  // show tab `name`; opening: the 상점 selects the cheapest affordable unowned item of the first slot that has one (else
  // the first 머리 item) - on the very first visit nothing (the intro line); slot: the 상점 on that slot (마이페이지's
  // 상점 가기). Showing the 상점 marks it visited (S.sh: the button's first dot), 마이페이지 the badge's dot (S.seen) and
  // warms the cloud's sign-in tools (내 기록 is one tap away)
  // 뽑기 (gacha.md 6.1): marks the tab seen (gs), opens a batch not shown yet on its result view; sel = that draw-only
  // item selected in the collection (the 상점's 뽑기로 가기). A tap on another tab mid-show reveals it silently first
  function hubShow(name, opening, slot, sel) {
    const S = TRO.s;
    if (HUB.draw.anim && name !== 'draw') drawReveal(true);
    HUB.tab = name === 'my' || name === 'draw' ? name : 'shop'; hubDisarm(); HUB.drawn = '';
    for (const b of document.querySelectorAll('#pg-hub [data-hub]')) { const on = b.dataset.hub === HUB.tab; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; }
    if (dom.hubShop) dom.hubShop.hidden = HUB.tab !== 'shop';
    if (dom.hubMy) dom.hubMy.hidden = HUB.tab !== 'my';
    if (dom.hubDraw) dom.hubDraw.hidden = HUB.tab !== 'draw';
    // (the footer pattern, looks-per-animal.md 4.0: [message][the tab's own ghost button][닫기] - 내 기록 on 마이페이지,
    // 확률 보기 on 뽑기)
    if (dom.myRec) dom.myRec.hidden = HUB.tab !== 'my';
    if (dom.myPal) dom.myPal.hidden = HUB.tab !== 'my'; // (친구: with the cloud / on a preview only - palSetupDOM)
    if (dom.oddsBtn) dom.oddsBtn.hidden = HUB.tab !== 'draw';
    if (HUB.tab === 'draw') {
      if (S && !S.gs && !TRO.ro) troMut((q) => { q.gs = 1; });
      if (sel && isItemId(sel) && ITEM[sel].dr && !HUB.draw.anim) Object.assign(HUB.draw, { view: 'machine', res: null, sel, bare: false });
      drawPast();
    } else if (HUB.tab === 'shop') {
      if (slot && LOOK_SLOTS.includes(slot)) { HUB.slot = slot; HUB.sel = shopCheapest(slot) || ITEMS.find((it) => it.slot === slot).id; }
      else if (opening) {
        HUB.slot = 'h'; HUB.sel = '';
        if (S && S.sh) { const s = LOOK_SLOTS.find((q) => shopCheapest(q)); if (s) { HUB.slot = s; HUB.sel = shopCheapest(s); } else HUB.sel = 'h1'; }
      }
      if (S && !S.sh && !TRO.ro) troMut((q) => { q.sh = 1; });
      HUB.sawShop = true;
    } else {
      if (S && !S.seen && !TRO.ro) troMut((q) => { q.seen = 1; });
      clWarm();
    }
    hubFill(); hubTopFit();
    // (keyboard / mouse: the selected cell of the 상점, the selected equipment box of 마이페이지, 1회 뽑기 - not on touch,
    // and never on a tab switch: ←/→ in the tablist keep the focus there; 뽑기로 가기 focuses its collection cell)
    if (!touchMode && (opening || sel)) {
      const el = HUB.tab === 'shop' ? (dom.shopGrid && (dom.shopGrid.querySelector('[aria-selected="true"]') || dom.shopGrid.querySelector('[role="option"]')))
        : HUB.tab === 'draw' ? (sel ? dom.gachaGrid && dom.gachaGrid.querySelector('[aria-selected="true"]') : dom.gachaOne) : dom.mySlots && dom.mySlots.querySelector('[aria-selected="true"]');
      try { if (el) el.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }
  // the 상점's slot tab s: its cheapest affordable unowned item (else its first) is shown
  function hubSlot(s) {
    if (!LOOK_SLOTS.includes(s)) return;
    if (HUB.slot !== s) { HUB.slot = s; HUB.sel = shopCheapest(s) || ITEMS.find((it) => it.slot === s).id; hubDisarm(); HUB.drawn = ''; }
    hubFill();
  }
  function hubDisarm() { HUB.armId = ''; HUB.armAt = 0; clearTimeout(HUB.armT); }
  const hubArmed = (id) => !!id && HUB.armId === id && performance.now() - HUB.armAt < HUB_ARM_MS;
  function hubMsg(txt) {
    if (!dom.hubMsg) return;
    clearTimeout(HUB.msgT); dom.hubMsg.textContent = txt;
    if (txt) HUB.msgT = setTimeout(() => { if (dom.hubMsg && dom.hubMsg.textContent === txt) dom.hubMsg.textContent = ''; }, 4000);
  }
  // the action button's state for item id (9.3): k 'pick' (nothing selected: the first visit), 'ro' (a read-only store),
  // 'on' / 'off' (owned: the slot's wear / take-off verb), 'lock' (a league not reached), 'poor' (need: coins missing),
  // 'buy', 'arm' (tapped once: a second tap within 2.5 s buys)
  function shopBtnState(id) {
    const S = TRO.s, it = isItemId(id) ? ITEM[id] : null;
    if (!it || !S) return { k: 'pick' };
    if (TRO.ro) return { k: 'ro' };
    if (shopOwns(S, id)) return { k: shopWorn(myLook(hubAni()), id) ? 'off' : 'on' };
    if (it.dr) return { k: 'draw' };            // (a draw-only item: 뽑기로 가기, gacha.md 6.8 - before the league test)
    if (S.bl < it.lg) return { k: 'lock' };
    const need = it.price - coinBal(S);
    if (need > 0) return { k: 'poor', need };
    return { k: hubArmed(id) ? 'arm' : 'buy' };
  }
  // a tap on the action button. Its messages name the animal dressed (looks-per-animal.md 8: "꽥꽥이가 썼어요"); the first
  // purchase ever adds " · 동물마다 따로 꾸며요", a migrated player's first dressing here (lh, read before the call clears
  // it) " · 이제 동물마다 따로 꾸며요" instead (2.4)
  function hubAct() {
    const id = HUB.sel, it = isItemId(id) ? ITEM[id] : null, st = shopBtnState(id), V = it ? verbOf(it) : null;
    const a = hubAni(), lh = !!(TRO.s && TRO.s.lh), hint = lh ? ' · 이제 동물마다 따로 꾸며요' : '';
    if (st.k === 'draw') { hubShow('draw', false, null, id); return; }
    if (st.k === 'buy') {
      HUB.armId = id; HUB.armAt = performance.now(); clearTimeout(HUB.armT);
      HUB.armT = setTimeout(() => { if (HUB.armId === id) { hubDisarm(); hubFill(); } }, HUB_ARM_MS);
      uiSfx('arm');
      // (blocked storage: what is bought lasts this session only - said before it is bought, shop.md 5.3 / 13)
      if (TRO.mem) hubMsg('이 브라우저에서는 저장되지 않아요');
      hubFill(); return;
    }
    if (st.k === 'arm') {
      hubDisarm();
      const before = coinBal(TRO.s), first = !TRO.s.own.length;
      HUB.coFrom = before; HUB.coT0 = performance.now();     // (set first: the purchase's own refill leaves the chip at the old count;
      const r = shopBuy(id, a);                              // hubTick then counts it down over 0.4 s)
      if (r.ok) {
        HUB.buyAt = performance.now(); HUB.buyId = id;
        uiSfx('buy');
        hubMsg('샀어요! ' + aniSubj(a) + ' 바로 ' + V.done + (hint || (first ? ' · 동물마다 따로 꾸며요' : '')));
        hubSpark();
      } else {
        HUB.coT0 = 0;
        // (another tab of this browser got there first: bought it, or spent the coins)
        hubMsg(r.why === 'own' ? '이미 가지고 있어요' : r.why === 'poor' ? fmtN(r.need) + '개 모자라요' : r.why === 'lock' ? LEAGUES[it.lg].name + ' 리그부터' : '이 브라우저에서는 저장되지 않아요');
      }
      hubFill(); return;
    }
    if (st.k === 'on' || st.k === 'off') {
      // (the same hand tapping 사기 a third time right after the purchase - its take-off verb lands on the same spot - is
      // ignored for 0.8 s; review 2026-10-18)
      if (performance.now() - HUB.buyAt < HUB_BUY_GUARD) return;
      // (the message says what happened, so the purchase's "바로 썼어요" never outlives the hat)
      if (lookSet(it.slot, st.k === 'on' ? id : null, a)) { uiSfx('equip'); hubMsg(aniSubj(a) + ' ' + (st.k === 'on' ? V.done : V.offDone) + hint); hubFill(); }
    }
  }
  // a storage event (another tab of this browser wrote the store, troSync): a purchase made here in the last 5 s that
  // the other tab's write did not carry is gone - two tabs writing at the same moment, shop.md 13 - and the 상점 says so
  // (its coins came back with it)
  function hubLost() {
    const id = HUB.buyId, S = TRO.s;
    if (!id || performance.now() - HUB.buyAt > HUB_LOST_MS || !S || shopOwns(S, id)) return;
    HUB.buyId = '';
    if (shownOverlay === 'hub') { hubMsg('다시 사 주세요'); hubFill(); }
  }
  // a tap on a cell: the 상점 shows that item (nothing is bought from a cell); 마이페이지 wears it at once ('' = 없음) and
  // says who did ("냥냥이가 했어요"; 없음: the worn item's take-off verb - a footer line of <= 12 syllables, 4.0)
  function hubCell(mode, id) {
    if (mode === 'draw') { drawCell(id); return; }
    if (id) drawNwOff(id);                      // (a cell selected / tapped: no longer NEW, gacha.md 6.9)
    if (mode === 'shop') { if (HUB.sel !== id) { HUB.sel = id; hubDisarm(); HUB.drawn = ''; } hubFill(); return; }
    const s = HUB.mySlot, a = hubAni(), cur = lookId(myLook(a), LOOK_SLOTS.indexOf(s));
    if ((id || '') === cur) { hubFill(); return; }
    if (lookSet(s, id || null, a)) { uiSfx('equip'); hubMsg(aniSubj(a) + ' ' + (id ? verbOf(ITEM[id]).done : cur ? verbOf(ITEM[cur]).offDone : SLOT_INFO[s].offDone)); }
    hubFill();
  }
  // the item cells of a grid, kept per id (a refill updates them in place: a focused cell keeps its focus); mode 'shop'
  // (every item of a slot: rarity border, its price under the art - pink when the balance covers it, dim when not or
  // league-locked - a check instead when owned, the duck ring when worn, the lock + 40 % when league-locked, white inside
  // the border when selected) or 'my' (없음 + what I own; worn: the same duck ring + check as in the 상점); roving
  // tabindex. The art as large as it fits (review 2026-10-18: a 2x cap left glasses and necklaces 1-2 px dashes) - in a
  // 36x28 canvas over the price in the 상점, 32x32 in 마이페이지
  const fmtN = (n) => (n | 0).toLocaleString('ko-KR');
  // (mode 'draw': the 뽑기's collection - its odds under the art, the check when owned; S0: the store it shows, the 뽑기's
  // pre-draw copy during its show, gacha.md 6.6 - no spoilers)
  function hubGrid(box, ids, mode, S0) {
    if (!box) return;
    const S = S0 || TRO.s, lk = myLook(hubAni()), cells = box._cells || (box._cells = new Map()), bal = coinBal(S);
    const want = [];
    let tab = null;
    for (const id of ids) {
      let b = cells.get(id);
      if (!b) {
        b = h('button', 'pg-item'); b.type = 'button'; b.setAttribute('role', 'option'); b.dataset.id = id;
        if (id) {
          const cv = mode === 'my' ? mk(32, 32) : mk(36, 28); cv.setAttribute('aria-hidden', 'true'); b.appendChild(cv); paintItem(cv, id, 4);
          // (the line under the art: the price; a draw-only item in the 상점 the capsule + 뽑기 (gacha.md 6.8); the 뽑기's
          // collection its own odds in a normal draw, "5%" (6.3))
          if (mode !== 'my') {
            const pr = h('span', 'pg-item-pr'); pr.setAttribute('aria-hidden', 'true');
            if (mode === 'draw') pr.textContent = drawPct(drawW(ITEM[id]), 1e4);
            else { const c = mk(8, 8); troIcon(c, ITEM[id].dr ? 'ic_cap' : 'coin'); pr.append(c, ITEM[id].dr ? '뽑기' : fmtN(ITEM[id].price)); }
            b.appendChild(pr);
          }
        } else b.textContent = '없음';
        listen(b, 'click', (e) => { e.preventDefault(); hubCell(mode, id); });
        cells.set(id, b);
      }
      const it = id ? ITEM[id] : null, own = !!it && shopOwns(S, id), worn = it ? shopWorn(lk, id) : !lookId(lk, LOOK_SLOTS.indexOf(HUB.mySlot));
      const lock = !!it && !own && !it.dr && S.bl < it.lg, sel = mode === 'shop' ? HUB.sel === id : mode === 'draw' ? drawShown() === id : worn, pr = mode !== 'my';
      const cls = 'pg-item' + (it ? (it.rar < 0 ? ' rs' : ' r' + it.rar) : ' is-none') + (pr ? ' has-pr' : '') + (worn ? ' is-worn' : '') + (lock ? ' is-lock' : '')
        + (mode === 'shop' && !own && !it.dr && (lock || it.price > bal) ? ' is-poor' : '') + (pr && own ? ' is-own' : '') + (it && it.dr && mode === 'shop' ? ' is-dr' : '');
      if (b.className !== cls) b.className = cls;
      if (it) b.style.setProperty('--rar', rarOf(it).col);
      b.setAttribute('aria-selected', sel ? 'true' : 'false');
      // (the owned check and the lock: 8x8 sprites at 1.5x on the cell's top-right corner - the price line keeps the
      // bottom; 마이페이지 marks only the worn one: everything there is owned)
      const mark = (cl, on, spr) => { let m = b.querySelector('.' + cl); if (on && !m) { m = h('i', cl); const c = mk(16, 16); c.setAttribute('aria-hidden', 'true'); troIcon(c, spr); m.appendChild(c); b.appendChild(m); } else if (!on && m) m.remove(); };
      mark('pg-item-ck', !!it && (pr ? own : worn), SPR_READY); mark('pg-item-lk', lock, 'lock');
      const nw = !!it && !!S && S.nw.includes(id);
      drawNwDot(b, nw);
      const V = it ? verbOf(it) : SLOT_INFO[HUB.mySlot];
      const aria = !it ? V.off
        : it.name + ' · ' + rarOf(it).name + (mode === 'draw' ? ' · 뽑기 확률 ' + drawPct(drawW(it), 1e4) : it.dr ? ' · 뽑기에서만 나와요' : it.price ? ' · ' + fmtN(it.price) + '코인' : '')
          + (own ? ' · 가지고 있어요' : lock ? ' · ' + LEAGUES[it.lg].name + ' 리그부터' : '') + (worn ? ' · ' + wornTxt(it) : '') + (nw ? ' · 새 아이템' : '');
      if (b.getAttribute('aria-label') !== aria) b.setAttribute('aria-label', aria);
      if (sel && !tab) tab = b;
      want.push(b);
    }
    if (!tab) tab = want[0] || null;
    // (the roving tab stop: the selected cell, unless the focus is on another cell of this grid already)
    const foc = want.find((b) => b === document.activeElement);
    for (const b of want) b.tabIndex = b === (foc || tab) ? 0 : -1;
    if (box.children.length !== want.length || want.some((b, i) => box.children[i] !== b)) { box.textContent = ''; for (const b of want) box.appendChild(b); }
  }
  // everything shown in the hub, from the store as it is now (troSync calls this: a purchase in another tab shows at once)
  function hubFill() {
    const S = TRO.s; if (shownOverlay !== 'hub' || !S) return;
    if (!HUB.coT0) hubCoins(HUB.draw.anim ? HUB.draw.anim.co : coinBal(S));   // (mid-show: the balance before its refunds, 6.6)
    // (the previews: the hub's animal on the pill over the top border; a tap's halves / ←→ step it back and on, 4.2)
    const nm = (CHARS[hubAni()] || CHARS.duck).name;
    setTxt(dom.shopAname, nm); setTxt(dom.myAname, nm);
    for (const [el, aria] of [[dom.shopView, '미리 보기: ' + nm + ' · 눌러서 다른 동물로'], [dom.myView, nm + ' · 눌러서 다른 동물로']]) if (el && el.getAttribute('aria-label') !== aria) el.setAttribute('aria-label', aria);
    hubDots(HUB.draw.anim ? HUB.draw.anim.before : S);   // (mid-show: the dots before it - no spoilers)
    if (HUB.tab === 'shop') hubFillShop(S); else if (HUB.tab === 'draw') hubFillDraw(S); else hubFillMy(S);
    if (!HUB.drawn) hubTick();                 // (a new view: the preview at once, not 4 frames later)
  }
  function hubCoins(n) {
    const t = n.toLocaleString('ko-KR');
    setTxt(dom.hubCo, t);
    if (dom.hubCoins && dom.hubCoins.getAttribute('aria-label') !== '비누 코인 ' + t + '개') dom.hubCoins.setAttribute('aria-label', '비누 코인 ' + t + '개');
    if (dom.hubCo && dom.hubCo._n !== t.length) { dom.hubCo._n = t.length; hubTopFit(); }   // (a digit more or less: the row measured again)
  }
  // the tab row and the coin chip on one line (looks-per-animal.md 4.0; built like shopBtnFit): where the chip still
  // wraps under the tabs, is-snug (tighter tabs, the chip without its coin icon); still wrapped - left so (a 5-digit
  // balance on the narrowest panels). Run on every tab shown, a chip of another length, fit() and the fonts arriving.
  // (Wrapped = the chip starting below the tabs' bottom: the row centres its items, so a one-line chip sits ~10 px lower
  // than the 44 px tabs' top)
  function hubTopFit() {
    const top = dom.hubTop, tabs = top && top.querySelector('.pg-tabs'), chip = dom.hubCoins;
    if (!tabs || !chip || shownOverlay !== 'hub') return;
    const wrapped = () => chip.offsetTop >= tabs.offsetTop + tabs.offsetHeight - 2;
    top.classList.remove('is-snug');
    if (wrapped()) top.classList.add('is-snug');
  }
  function hubFillShop(S) {
    for (const b of dom.shopSlots ? dom.shopSlots.children : []) {
      const on = b.dataset.slot === HUB.slot;
      if (b.getAttribute('aria-selected') !== String(on)) { b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; paintSlot(b.firstChild, b.dataset.slot, 2, on); }
    }
    hubGrid(dom.shopGrid, ITEMS.filter((it) => it.slot === HUB.slot && !it.retired).map((it) => it.id), 'shop');   // (the draw-only items after the sold ones: catalog order, gacha.md 6.8)
    const it = isItemId(HUB.sel) ? ITEM[HUB.sel] : null, rar = it ? rarOf(it) : null;
    setTxt(dom.shopIname, it ? it.name : '');
    if (dom.shopRar) { setTxt(dom.shopRar, rar ? rar.name : ''); if (rar) dom.shopRar.style.setProperty('--rar', rar.col); }
    setTxt(dom.shopDesc, it ? it.desc : '게임을 하면 비누 코인이 모여요 · 이기든 지든, 혼자 해도!');
    const b = dom.shopBuy; if (!b) return;
    const st = shopBtnState(HUB.sel), V = it ? verbOf(it) : null, nm = (CHARS[hubAni()] || CHARS.duck).name;
    const key = st.k + '|' + HUB.sel + '|' + (st.need | 0) + '|' + nm;
    if (b._key !== key) {
      b._key = key; b.textContent = '';
      const coin = () => { const c = mk(8, 8); c.className = 'pg-ic pg-coin'; c.setAttribute('aria-hidden', 'true'); troIcon(c, 'coin'); return c; };
      let aria = '';
      // (numbers as the coin chip shows them: 1,200; not enough - one number, what is still missing: the price is on the
      // cell; the take-off verb is drawn as a ghost button, so it never looks like the 사기 just tapped twice)
      if (st.k === 'buy') { b.append('사기 ', coin(), fmtN(it.price)); aria = '사기 · ' + fmtN(it.price) + '코인'; }
      else if (st.k === 'arm') b.textContent = '한 번 더 누르면 사요';
      // (the short verb; the pill beside it says whose: "꽥꽥이: 쓰기" for a screen reader - never "~에게", 8)
      else if (st.k === 'on' || st.k === 'off') { b.textContent = st.k === 'on' ? V.on : V.off; aria = nm + ': ' + b.textContent; }
      else if (st.k === 'poor') { b.append(coin(), fmtN(st.need) + '개 더 모아요'); aria = fmtN(it.price) + '코인 · ' + fmtN(st.need) + '개 더 모아요'; }
      else if (st.k === 'lock') { const c = mk(8, 8); c.className = 'pg-ic'; c.setAttribute('aria-hidden', 'true'); troIcon(c, LG_PRE + it.lg); b.append(c, ' ' + LEAGUES[it.lg].name + ' 리그부터'); }
      else if (st.k === 'ro') b.textContent = '이 브라우저에서는 저장되지 않아요';
      else if (st.k === 'draw') { const c = mk(8, 8); c.className = 'pg-ic'; c.setAttribute('aria-hidden', 'true'); troIcon(c, 'ic_cap'); b.append(c, ' 뽑기로 가기'); aria = '뽑기에서만 나와요 · 뽑기로 가기'; }
      else b.textContent = '아이템을 골라 봐요';
      if (aria) b.setAttribute('aria-label', aria); else b.removeAttribute('aria-label');
      b.setAttribute('aria-disabled', st.k === 'poor' || st.k === 'lock' || st.k === 'ro' || st.k === 'pick' ? 'true' : 'false');
      b.classList.toggle('is-armed', st.k === 'arm');
      b.dataset.k = st.k;
    }
  }
  // 마이페이지's note (9.4, the first that applies): storage that keeps nothing; the starter not worn yet (nothing else
  // owned); the day bonus still to come today (+ what it pays); else the streak and tomorrow's bonus. A second line on
  // the deploy with the cloud, signed out: the sign-in pitch (it lives in 내 기록, one tap away)
  function myNote(S) {
    if (TRO.mem || TRO.ro) return '이 브라우저에서는 저장되지 않아요';
    // (a migrated store, its set copied to all six: told until its first dressing - looks-per-animal.md 2.4; one short line)
    if (S.lh) return '이제 동물마다 따로 꾸며요!';
    // (the ribbon's verb is the 목 slot's button: 하기 - "해 봐요")
    if (!S.own.length && !looksWear(myLooks(), STARTER)) return '처음 선물: 초록 때타월 리본을 해 봐요';
    const today = troToday(), next = (st) => COIN.day[clamp(st, 1, COIN.day.length) - 1];
    // (a bonus day later than tomorrow is a wrong clock's: coinGive forgets it and pays streak day 1)
    if (S.bd < today || S.bd > troTomorrow(today)) return '오늘 첫 판 하면 코인 +' + next(S.bd === troYesterday(today) ? S.bs + 1 : 1) + '!';
    // (one day is not a streak yet: "1일 연속" only from day 2)
    return (S.bs > 1 ? S.bs + '일 연속' : '오늘 보너스 받았어요') + ' · 내일 첫 판 +' + next(S.bs + 1);
  }
  function hubFillMy(S) {
    const lk = myLook(hubAni());
    if (dom.myNick && document.activeElement !== dom.myNick) { const n = NET.nick || netNick(); if (dom.myNick.value !== n) dom.myNick.value = n; }
    const tro = $('pg-my-tro');
    if (tro && tro._t !== S.t) { tro._t = S.t; tro.textContent = ''; tro.appendChild(troChip(S.t)); }
    const lg = $('pg-my-lg'), L = LEAGUES[leagueOf(S.t)];
    if (lg) { setTxt(lg, L.name); lg.style.setProperty('--lgc', L.col); }
    const note = $('pg-my-note');
    if (note) {
      const line = myNote(S), pitch = CLOUD.on && !S.cs ? CL_TX.pitch : '', key = line + '|' + pitch;
      if (note._key !== key) { note._key = key; note.textContent = line; if (pitch) note.appendChild(h('small', '', pitch)); }
    }
    // the row of six (looks-per-animal.md 4.1): each animal's bust in its own set, the hub's animal checked (roving
    // tabindex); a bust whose 등 / 효과 is set gets the dot (the bust shows only 머리 / 얼굴 / 목); its aria-label names what
    // it wears. Repainted when its chunk changes (b._lk, like pickArt; a portrait not ready yet is tried again)
    const ls = myLooks(), a = hubAni(), nm = (CHARS[a] || CHARS.duck).name;
    for (const b of dom.myAnis ? dom.myAnis.children : []) {
      const c = b.dataset.char, on = c === a, blk = aniLook(ls, c);
      if (b.getAttribute('aria-checked') !== String(on)) b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      if (b._lk !== blk) {
        const cv = b.firstChild, x = cv.getContext('2d'), f = lookPortrait(c, blk, 0);
        x.clearRect(0, 0, cv.width, cv.height); if (f) { x.imageSmoothingEnabled = false; x.drawImage(f.c, 0, 0, f.w, f.h, 0, 0, cv.width, cv.height); }
        b._lk = f ? blk : '';
        const dot = b.querySelector('.pg-ani-more'); if (dot) dot.hidden = !lookId(blk, 3) && !lookId(blk, 4);
      }
      const worn = LOOK_SLOTS.map((q, i) => lookId(blk, i)).filter(Boolean).map((id) => ITEM[id].name);
      const aria = (CHARS[c] || CHARS.duck).name + ' · ' + (worn.length ? worn.join(', ') : '아직 안 꾸몄어요');
      if (b.getAttribute('aria-label') !== aria) b.setAttribute('aria-label', aria);
    }
    if (dom.mySlots && dom.mySlots.getAttribute('aria-label') !== nm + ' 꾸미기') dom.mySlots.setAttribute('aria-label', nm + ' 꾸미기');
    // the equipment: 5 boxes, each the worn item's art as large as it fits (bare: the slot's grey silhouette) over the
    // slot's name
    for (const b of dom.mySlots ? dom.mySlots.children : []) {
      const s = b.dataset.slot, i = LOOK_SLOTS.indexOf(s), id = lk[i] !== '0' ? s + lk[i] : '', on = s === HUB.mySlot;
      b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1;
      if (b._id !== id) { b._id = id; if (id) paintItem(b.firstChild, id, 4); else paintSlot(b.firstChild, s, 3, false); }
      const aria = SLOT_INFO[s].name + ' · ' + (id && isItemId(id) ? ITEM[id].name : '없음');
      if (b.getAttribute('aria-label') !== aria) b.setAttribute('aria-label', aria);
    }
    // the grid: 없음, then what I own of that slot in purchase order (the starter first in 목); nothing owned: one line
    // and 상점 가기
    const s = HUB.mySlot, owned = (s === STARTER[0] ? [STARTER] : []).concat(S.own.filter((id) => id[0] === s && isItemId(id)));
    const none = !owned.length;
    hubGrid(dom.myGrid, none ? [] : [''].concat(owned), 'my');
    if (dom.myEmpty) dom.myEmpty.hidden = !none;
  }
  // a purchase: a few sparkles round the preview animal (not under reduced motion)
  function hubSpark() {
    if (reducedMotion()) return;
    [[-7, 3], [8, 7], [-3, -2], [6, 0], [0, 10]].forEach(([dx, dy], i) => HUB.kfx.push({ k: 'cross', x: 16 + dx, y: HUB_Y + 4 + dy, dur: 14, f0: HUB.f + 1 + i * 3 }));
  }
  // the preview (9.3), every main-loop frame while the hub shows (drawn every 4th): the animal I picked (or the one the
  // preview was tapped to) wearing my set - in the 상점 with the selected item tried on - idle, walking for the walk
  // effects (e4, e6: the floor slides back under it, so the trail is left behind), a hop every 2 s for e2 / e3, a 500-point
  // score jump every 2 s for e5; the effect is lookFx itself on a stand-in player, its particles kept here (<= 20); under
  // reduced motion the idle frame and no particles. No twin colour and no slot ring: the animal as it looks in solo
  // (an item I own shows as I really wear it - so 쓰기 / 벗기 visibly change the animal; only one I do not own yet is
  // tried on: review 2026-10-18)
  function hubLook() {
    const lk = myLook(hubAni());
    // (뽑기: a result tried on unless taken off there (bare); a collection cell as the 상점 - only when not owned)
    if (HUB.tab === 'draw') { const id = drawShown(); return !id || (drawRes() ? HUB.draw.bare : shopOwns(TRO.s, id)) ? lk : lookPut(lk, id[0], id); }
    if (HUB.tab !== 'shop' || !isItemId(HUB.sel) || shopOwns(TRO.s, HUB.sel)) return lk;
    return lookPut(lk, HUB.sel[0], HUB.sel);
  }
  function hubTick() {
    if (shownOverlay !== 'hub' || DRAW_T.hold) return;   // (hold: frozen for a test / a screenshot)
    HUB.f++;
    if (HUB.coT0) {                                   // (the coin chip counting down after a purchase, 0.4 s)
      const t = (performance.now() - HUB.coT0) / 400, to = coinBal(TRO.s);
      if (t >= 1) { HUB.coT0 = 0; HUB.co = -1; hubCoins(to); uiSfx('coin'); } else hubCoins(Math.round(lerp(HUB.coFrom, to, easeIO(clamp(t, 0, 1)))));
    }
    // (the 뽑기 tab without an animal: the machine and the show, gacha.md 6.3 / 6.6)
    if (HUB.tab === 'draw' && (HUB.draw.anim || !drawShown())) { drawTick(); return; }
    const c = hubAni(), lk = hubLook(), e = lk[4], calm = reducedMotion();
    let p = HUB.pp;
    // (e7: the stand-in a little to the right, so both ducklings fit behind it - gacha.md 4.3)
    if (!p || p.char !== c || p.look !== lk) { p = HUB.pp = { x: e === '7' ? 12 : 8, y: HUB_Y, vx: 0, vy: 0, onGround: true, facing: 1, score: 0, look: lk, char: c, slot: 0, dead: false }; HUB.parts = []; HUB.kfx = HUB.kfx.filter((o) => o.k === 'cross'); }
    const walk = !calm && (e === '4' || e === '6' || e === '7');
    p.vx = walk ? 0.6 : 0;
    if (!calm && (e === '2' || e === '3') && p.onGround && HUB.f % 120 === 60) { p.onGround = false; p.vy = -2.2; }
    if (!p.onGround) { p.vy += 0.3; p.y += p.vy; if (p.y >= HUB_Y) { p.y = HUB_Y; p.vy = 0; p.onGround = true; } }
    if (!calm && e === '5' && HUB.f % 120 === 60) p.score += 500;
    // (lookFx on the stand-in, with the world's particle lists and frame count swapped for the preview's own - one
    // synchronous call, put back at once)
    const gp = G.parts, gk = G.kfx, gf = G.frame;
    G.parts = HUB.parts; G.kfx = HUB.kfx; G.frame = HUB.f;
    try { lookFx(p, c); } finally { HUB.parts = G.parts; HUB.kfx = G.kfx; G.parts = gp; G.kfx = gk; G.frame = gf; }
    for (const q of HUB.parts) { q.x += q.vx - (walk ? 0.6 : 0); q.y += q.vy; q.vy += q.g; q.vx *= 0.94; q.vy *= 0.94; q.life--; }
    HUB.parts = HUB.parts.filter((q) => q.life > 0 && q.x > -4 && q.x < 36 && q.y > -4);
    if (HUB.parts.length > 20) HUB.parts.splice(0, HUB.parts.length - 20);
    HUB.kfx = HUB.kfx.filter((o) => HUB.f - o.f0 <= o.dur);
    const anim = !p.onGround ? (p.vy < 0 ? 'jump' : 'fall') : walk ? 'walk' : 'idle', fi = anim === 'walk' ? ((HUB.f / 8) | 0) % 4 : anim === 'idle' && !calm ? ((HUB.f / 30) | 0) % 2 : 0;
    const dk = p.lfx && p.lfx.dk, key = HUB.tab + c + lk + anim + fi + p.y + (dk ? dk.a.map((q) => Math.round(q.x) + '' + q.mv + q.f).join() + (((HUB.f / 6) | 0) & 1) : '');
    if (HUB.f % 4 && HUB.drawn) return;
    if (key === HUB.drawn && !HUB.parts.length && !HUB.kfx.length) return;   // (nothing moved: nothing to redraw)
    HUB.drawn = key;
    hubDraw(c + '_' + anim, fi, p, lk);
  }
  // the backdrop of a hub canvas: tub tiles with their grout, the floor's edge under the feet (row 31)
  function hubBack(x) {
    x.globalAlpha = 1; x.fillStyle = '#123236'; x.fillRect(0, 0, 32, 32);
    x.fillStyle = '#0d2a2d'; for (let i = 0; i < 32; i += 8) { x.fillRect(i, 0, 1, 31); x.fillRect(0, i, 32, 1); }
    x.fillStyle = '#3fae9c'; x.fillRect(0, 31, 32, 1);
  }
  // one particle: its alpha over its last fd frames; e8's big (2 px for its first `big` frames) and sw (a 1 px sway every
  // sw frames), gacha.md 4.3 - the world's draw, the podium's and the hub's
  function partDraw(x, q) {
    const age = (q.max || 0) - q.life, sz = q.big && age < q.big ? 2 : q.sz;
    x.globalAlpha = clamp(q.life / (q.fd || 8), 0, 1); x.fillStyle = q.c;
    x.fillRect(Math.round(q.x) + (q.sw ? ((age / q.sw) | 0) & 1 : 0), Math.round(q.y), sz, sz);
  }
  function hubDraw(name, fi, p, lk) {
    const cv = HUB.tab === 'shop' ? dom.shopViewCv : HUB.tab === 'draw' ? dom.gachaViewCv : dom.myViewCv; if (!cv) return;
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
    hubBack(x);
    const c0 = ctx, gk = G.kfx, gf = G.frame;
    ctx = x; G.kfx = HUB.kfx; G.frame = HUB.f;
    try {
      drawDucklings(p);                          // (e7: behind the animal)
      drawEnt(name, fi, p.x, p.y, p.facing < 0, { look: lookOn(lk) ? lk : undefined });
      drawKfx(false);
      for (const q of HUB.parts) partDraw(x, q);
      x.globalAlpha = 1;
    } finally { HUB.kfx = G.kfx; ctx = c0; G.kfx = gk; G.frame = gf; }
    // (a carousel's two arrows beside the animal, always (looks-per-animal.md 4.2): a tap on the left half shows the
    // previous animal, on the right half the next - review 2026-10-18, it was said only in the aria-label)
    for (const [bx, dir] of [[0, -1], [27, 1]]) {
      x.globalAlpha = 0.6; x.fillStyle = '#0c2629'; x.fillRect(bx, 19, 5, 7);
      x.globalAlpha = 1; x.fillStyle = '#fff1c9';
      for (let i = 0; i < 3; i++) { const cx = dir < 0 ? bx + 1 + i : bx + 3 - i; x.fillRect(cx, 22 - i, 1, 1 + 2 * i); }
    }
  }
  // ←/→ on a tab moves to the next one (and shows it); ←/→/↑/↓ in a grid move the focus (the 상점: the selection follows -
  // a key never buys anything); Enter / Space press the focused button (the browser's own)
  function hubArrow(e, code) {
    const t = e.target, role = t && t.getAttribute ? t.getAttribute('role') : '', d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -2, ArrowDown: 2 }[code];
    if (!d || !t.closest || !t.closest('#pg-hub')) return false;
    if (role === 'tab') {
      if (Math.abs(d) !== 1) return false;
      const list = Array.from(t.parentNode.querySelectorAll('[role="tab"]')), n = list[(list.indexOf(t) + d + list.length) % list.length];
      if (n && n !== t) { n.click(); try { n.focus({ preventScroll: true }); } catch (er) { /* ignore */ } }
      return true;
    }
    // (looks-per-animal.md 4.1 / 4.2) the row of six: ←/→ check and focus the neighbour, wrapping (↑/↓ inert); the
    // focused preview: ←/→ the previous / next animal, as its halves
    if (role === 'radio' && t.closest('.pg-anis')) {
      if (Math.abs(d) !== 1) return true;
      const list = Array.from(t.parentNode.querySelectorAll('[role="radio"]')), n = list[(list.indexOf(t) + d + list.length) % list.length];
      if (n && n !== t) { n.click(); try { n.focus({ preventScroll: true }); } catch (er) { /* ignore */ } }
      return true;
    }
    if (t.classList && t.classList.contains('pg-look-view')) { if (Math.abs(d) !== 1) return false; hubCycle(d); return true; }
    if (role !== 'option') return false;
    const list = Array.from(t.parentNode.querySelectorAll('[role="option"]')), i = list.indexOf(t);
    let cols = 1; while (cols < list.length && list[cols].offsetTop === list[0].offsetTop) cols++;
    const j = i + (Math.abs(d) === 1 ? d : d > 0 ? cols : -cols);
    if (j < 0 || j >= list.length) return true;
    for (const b of list) b.tabIndex = -1;
    list[j].tabIndex = 0;
    try { list[j].focus({ preventScroll: true }); } catch (er) { /* ignore */ }
    // (뽑기: the selection follows too - never a toggle off; a key never draws: drawing is two presses of a draw button)
    if (HUB.tab === 'shop' || (HUB.tab === 'draw' && list[j].getAttribute('aria-selected') !== 'true')) list[j].click();
    return true;
  }
  // setupDOM: the hub's elements, its slot tabs / equipment boxes, its clicks
  function hubSetupDOM(click) {
    dom.hub = $('pg-hub'); dom.hubShop = $('pg-hub-shop'); dom.hubMy = $('pg-hub-my'); dom.hubMsg = $('pg-hub-msg'); dom.hubCo = $('pg-hub-co'); dom.hubCoins = $('pg-hub-coins');
    dom.shopBtn = $('pg-shop-btn'); dom.shopNew = $('pg-shop-new'); dom.shopIname = $('pg-shop-iname'); dom.shopRar = $('pg-shop-rar'); dom.shopDesc = $('pg-shop-desc'); dom.shopBuy = $('pg-shop-buy');
    dom.shopSlots = $('pg-shop-slots'); dom.shopGrid = $('pg-shop-grid'); dom.mySlots = $('pg-my-slots'); dom.myGrid = $('pg-my-grid'); dom.myEmpty = $('pg-my-empty'); dom.myNick = $('pg-my-nick');
    const sv = $('pg-shop-view'), mv = $('pg-my-view');
    dom.shopViewCv = sv ? sv.querySelector('canvas') : null; dom.myViewCv = mv ? mv.querySelector('canvas') : null;
    dom.shopView = sv; dom.myView = mv; dom.shopAname = $('pg-shop-aname'); dom.myAname = $('pg-my-aname'); dom.myAnis = $('pg-my-anis'); dom.myRec = $('pg-my-rec');
    dom.hubTop = dom.hub ? dom.hub.querySelector('.pg-hub-top') : null;
    // (v4 뽑기, gacha.md 6.2)
    dom.hubDraw = $('pg-hub-draw'); dom.gachaView = $('pg-gacha-view'); dom.gachaViewCv = dom.gachaView ? dom.gachaView.querySelector('canvas') : null;
    dom.gachaAname = dom.gachaView ? dom.gachaView.parentNode.querySelector('.pg-look-name') : null;
    dom.gachaName = $('pg-gacha-name'); dom.gachaRar = $('pg-gacha-rar'); dom.gachaLine = $('pg-gacha-line'); dom.gachaSub = $('pg-gacha-sub');
    dom.gachaOne = $('pg-gacha-one'); dom.gachaTen = $('pg-gacha-ten'); dom.gachaSkip = $('pg-gacha-skip'); dom.gachaH = $('pg-gacha-h');
    dom.gachaOdds = $('pg-gacha-odds'); dom.gachaGrid = $('pg-gacha-grid'); dom.gachaSr = $('pg-gacha-sr'); dom.oddsBtn = $('pg-gacha-odds-btn');
    dom.tabDrawNew = $('pg-tab-draw-new'); dom.tabMyNew = $('pg-tab-my-new');
    troIcon($('pg-shop-ic'), 'shop');
    try { if (document.fonts && document.fonts.addEventListener) listen(document.fonts, 'loadingdone', () => { shopBtnFit(); hubTopFit(); }); } catch (e) { /* ignore */ }
    // 마이페이지's row of six (looks-per-animal.md 4.1): one radio per animal in the game's order, a 32x32 bust and the 등 /
    // 효과 dot; a tap makes it the hub's animal (navigation: no sound; the pick is unchanged)
    if (dom.myAnis) {
      dom.myAnis.textContent = '';
      for (const c of CHAR_IDS) {
        const b = h('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.char = c; b.setAttribute('aria-checked', 'false'); b.tabIndex = -1;
        const cv = mk(32, 32); cv.setAttribute('aria-hidden', 'true');
        const dot = h('i', 'pg-ani-more'); dot.setAttribute('aria-hidden', 'true'); dot.hidden = true;
        b.append(cv, dot);
        listen(b, 'click', (e) => { e.preventDefault(); HUB.ani = c; HUB.drawn = ''; hubFill(); });
        dom.myAnis.appendChild(b);
      }
    }
    for (const [box, big] of [[dom.shopSlots, false], [dom.mySlots, true]]) {
      if (!box) continue;
      box.textContent = '';
      for (const s of LOOK_SLOTS) {
        const b = h('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.slot = s; b.setAttribute('aria-selected', 'false'); b.tabIndex = -1;
        b.setAttribute('aria-controls', big ? 'pg-my-grid' : 'pg-shop-grid');
        const cv = big ? mk(32, 32) : mk(16, 16); cv.setAttribute('aria-hidden', 'true'); paintSlot(cv, s, big ? 3 : 2, false);
        b.append(cv, h('span', '', SLOT_INFO[s].name));
        // (an equipment box's NEW dot: a NEW item of its slot, gacha.md 6.9)
        if (big) { const d = h('i', 'pg-tro-new'); d.setAttribute('aria-hidden', 'true'); d.hidden = true; b.appendChild(d); }
        if (!big) b.setAttribute('aria-label', SLOT_INFO[s].name);
        listen(b, 'click', (e) => { e.preventDefault(); if (big) { HUB.mySlot = s; hubFill(); } else hubSlot(s); });
        box.appendChild(b);
      }
    }
    for (const b of document.querySelectorAll('#pg-hub [data-hub]')) listen(b, 'click', (e) => { e.preventDefault(); if (HUB.tab !== b.dataset.hub) hubShow(b.dataset.hub, false); });
    click('pg-shop-btn', () => openHub('shop', 'title'));
    click('pg-tro', () => openHub('my', 'title'));
    click('pg-room-look', () => openHub('my', 'room'));
    click('pg-hub-close', closeHub);
    click('pg-shop-buy', hubAct);
    click('pg-my-rec', () => openRec('hub'));
    click('pg-my-go', () => hubShow('shop', false, HUB.mySlot));
    // (the preview: a tap on its left half dresses the previous animal from now on, on its right half the next - the pick
    // itself is unchanged; Enter / Space (a click with no pointer, detail 0) the next)
    for (const v of [sv, mv]) if (v) listen(v, 'click', (e) => { e.preventDefault(); const r = v.getBoundingClientRect(); hubCycle(e.detail && e.clientX - r.left < r.width / 2 ? -1 : 1); });
    // (뽑기, gacha.md 6.3 - 6.7: the canvas cycles the animal only while it shows one, never in the 0.8 s after a reveal)
    const gv = dom.gachaView;
    if (gv) listen(gv, 'click', (e) => { e.preventDefault(); if (!drawShown() || HUB.draw.anim || performance.now() - HUB.draw.revAt < DRAW_GUARD) return; const r = gv.getBoundingClientRect(); hubCycle(e.detail && e.clientX - r.left < r.width / 2 ? -1 : 1); });
    click('pg-gacha-one', () => drawTap(1));
    click('pg-gacha-ten', () => drawTap(DRAW.ten));
    click('pg-gacha-skip', () => drawSkip());
    click('pg-gacha-odds-btn', () => { HUB.draw.odds = !HUB.draw.odds; hubFill(); if (HUB.draw.odds && dom.gachaOdds) try { dom.gachaOdds.scrollIntoView({ block: 'nearest' }); } catch (er) { /* ignore */ } });
    if (dom.myNick) {
      listen(dom.myNick, 'change', () => { dom.myNick.value = netSetNick(dom.myNick.value); });
      listen(dom.myNick, 'blur', () => { dom.myNick.value = netSetNick(dom.myNick.value) || NET.nick; });
    }
  }

  // ---- v4 뽑기 (비누 캡슐 뽑기, design/gacha.md): the pure draw (5.3 - 5.4). Coins earned by play only, never money; the
  // odds are the 확률 보기 panel's promise (DRAW, drawW at the top)
  // a uniform integer in [0, n), 1 <= n <= 10,000: crypto.getRandomValues with rejection sampling (2^32 is not a multiple
  // of n: the top sliver is drawn again, so no result is favoured); Math.random only where there is no crypto (old
  // browsers, some test hosts). PG.debug.draw.rng(fn) puts a test generator ([0, 1)) in front of both
  // (rng: a test generator; hold: tests / shots freeze the hub's frames; sfx: the 뽑기's last sounds, for the tests)
  const DRAW_T = { rng: null, hold: false, sfx: [] };
  const drawSfx = (n, o) => { DRAW_T.sfx.push(n + (o ? ':' + o.n : '')); if (DRAW_T.sfx.length > 40) DRAW_T.sfx.shift(); uiSfx(n, o); };
  function drawInt(n) {
    n = Math.max(1, n | 0);
    if (DRAW_T.rng) return clamp(Math.floor(DRAW_T.rng() * n), 0, n - 1);
    try {
      const b = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n;
      for (let i = 0; i < 16; i++) { window.crypto.getRandomValues(b); if (b[0] < lim) return b[0] % n; }
    } catch (e) { /* no crypto: below */ }
    return Math.floor(Math.random() * n);
  }
  // the candidates of the next draw, pure: [[id, weight] ...] and its kind - 1 a 확정 draw (an unowned draw-only item:
  // some is missing and pt reached 9, or this account never drew), 2 the 10회's 희귀+ draw (rare: it is still owed),
  // 0 a normal draw (the whole pool). Never empty. (The two fixed lists are built once - the pace simulation draws a
  // million times; callers never change a list)
  const DRAW_L = { 0: DRAW_POOL.map((id) => [id, drawW(ITEM[id])]), 2: DRAW_POOL.filter((id) => ITEM[id].rar >= DRAW.rare).map((id) => [id, drawW(ITEM[id])]) };
  function drawCands(own, pt, dn, rare) {
    const un = DRAW_ONLY.filter((id) => !own.includes(id));
    if (un.length && (dn === 0 || pt >= DRAW.pity - 1)) return { k: 1, L: un.map((id) => [id, drawW(ITEM[id])]) };
    return rare ? { k: 2, L: DRAW_L[2] } : { k: 0, L: DRAW_L[0] };
  }
  // one weighted pick from a candidate list (drawInt over the list's total)
  function drawPick(L) { let r = drawInt(L.reduce((s, e) => s + e[1], 0)); for (const e of L) { r -= e[1]; if (r < 0) return e[0]; } return L[L.length - 1][0]; }
  // the draw is done once every draw-only item is owned (3.6)
  const drawDone = (S) => !!S && DRAW_ONLY.every((id) => S.own.includes(id));
  // ONE draw booked on store S (drawCommit's loop and the pace simulation share it): 200 coins into sp, the pick, then
  // new - own, gd (the drawn subset of own, own's order), nw (the NEW dots) - or a duplicate - its FULL refund into ce,
  // never clamped (3.5: a refund is below the price just paid) -, and the pity: a new draw-only item sets it to 0, any
  // other draw adds 1 up to 9 while a draw-only item is missing. rare: the 10회's 희귀+ draw is still owed
  function drawOne(S, rare) {
    const c = drawCands(S.own, S.pt, S.dn, rare), id = drawPick(c.L), it = ITEM[id], dup = S.own.includes(id);
    const un = DRAW_ONLY.some((q) => !S.own.includes(q));
    S.dn = Math.min(1e9, S.dn + 1); S.sp = Math.min(1e9, S.sp + DRAW.price);
    let ref = 0;
    if (dup) { ref = DRAW.refund[it.rar]; S.ce = Math.min(1e9, S.ce + ref); }
    else { S.own = S.own.concat([id]); S.gd = S.gd.concat([id]); S.nw = S.nw.filter((q) => q !== id).concat([id]).slice(-DRAW.nw); }
    if (it.dr && !dup) S.pt = 0; else if (un) S.pt = Math.min(S.pt + 1, DRAW.pity - 1);
    return { id, ref, k: c.k, dup };
  }
  // n draws (1 or DRAW.ten) in ONE troMut on the store as it is NOW (5.5): the coins (sp + 200 a draw, paid up front - a
  // refund inside the batch never pays a later draw of it), every result (new: own, gd, nw; a duplicate: its full refund
  // into ce), the pity, the draw count and the batch's log with its own id - so a reload, a closed tab or a crash after
  // this never draws again and never loses a result. The animation only plays res back; nothing is worn (a draw changes
  // no worn set: no lookOut). Returns {ok: true, id, res: [{id, ref, k, dup}], now, n} or {ok: false, why: 'ro' | 'bad' |
  // 'done' | 'poor', need}
  function drawCommit(n) {
    if (TRO.ro || !TRO.s || (n !== 1 && n !== DRAW.ten)) return { ok: false, why: TRO.ro ? 'ro' : 'bad' };
    const r = troMut((S) => {
      if (drawDone(S)) return { ok: false, why: 'done' };
      const cost = DRAW.price * n, bal = coinBal(S);
      if (bal < cost) return { ok: false, why: 'poor', need: cost - bal };
      const res = []; let rare = n === DRAW.ten;
      for (let i = 0; i < n; i++) { const o = drawOne(S, rare); if (o.k === 2) rare = false; res.push(o); }
      S.dl = { id: troRand(6), n: S.dn, r: res.map((q) => [q.id, q.ref, q.k]) };
      return { ok: true, id: S.dl.id, res, now: coinBal(S), n: S.dn };
    }) || { ok: false, why: 'bad' };
    if (r.ok) HUB.draw.mine = { id: r.id, at: performance.now(), n: r.n, newIds: r.res.filter((q) => !q.dup).map((q) => q.id) };
    return r;
  }
  // a storage event (another tab wrote the store, 5.6): the batch this tab committed in the last 5 s is gone when the
  // store's log is another batch's AND (the draw count is below that batch's, or one of its new items is not owned) -
  // two tabs writing at the same moment: its coins went with it (both reverted together). A lost batch of duplicates
  // only changes nothing owned: caught by the count alone. Two batches one after the other are never 'lost'
  function drawLost() {
    const M = HUB.draw.mine, S = TRO.s;
    if (!M || !S || performance.now() - M.at > HUB_LOST_MS) return false;
    if (S.dl && S.dl.id === M.id) return false;
    if (S.dn >= M.n && M.newIds.every((id) => S.own.includes(id))) return false;
    HUB.draw.mine = null; HUB.draw.lost = { id: M.id, at: performance.now() };
    // (the 뽑기 tab: its result view of that batch closes - the show too - and the line says so, 5.6)
    const D = HUB.draw;
    if (D.res && D.res.id === M.id) Object.assign(D, { view: 'machine', res: null, anim: null, bare: false });
    drawLine('뽑기가 저장되지 않았어요 · 코인은 그대로예요', true);
    return true;
  }
  // what the 확률 보기 panel shows (6.5), as data, for a store owning own: per rarity its normal total and every pool item's
  // weight in a normal draw (w), in the 10회's 희귀+ draw (wr) and in a 확정 draw (wp: the unowned draw-only items only);
  // each column's total, so a share is w / sum
  function drawOdds(own) {
    own = Array.isArray(own) ? own : [];
    const rare = drawCands([], 0, 1, true).L, pity = drawCands(DRAW_ONLY.filter((id) => own.includes(id)), 0, 0, false);
    const W = (L, id) => { const e = L.find((q) => q[0] === id); return e ? e[1] : 0; }, P = pity.k === 1 ? pity.L : [];
    const rows = RARITY.map((r, rar) => {
      const items = DRAW_POOL.filter((id) => ITEM[id].rar === rar).map((id) => [id, drawW(ITEM[id]), W(rare, id), W(P, id)]);
      return { rar, total: items.reduce((s, e) => s + e[1], 0), items };
    });
    const tot = (L) => L.reduce((s, e) => s + e[1], 0);
    return { rows, sum: tot(drawCands([], 0, 1, false).L), sumRare: tot(rare), sumPity: tot(P), price: DRAW.price, ten: DRAW.ten, pity: DRAW.pity, refund: DRAW.refund.slice() };
  }
  // (tests, 3.7) the pace: runs collections of every draw-only item by single draws from a fresh store, plus a fresh 10회
  // and 15 fresh single draws per run, through drawOne with a seeded generator (mulberry32; the real one is put back)
  function drawSim(runs, seed) {
    runs = clamp(runs | 0, 1, 100000);
    let a = (seed | 0) || 1;
    const rng = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const keep = DRAW_T.rng, S0 = () => ({ own: [], gd: [], nw: [], dn: 0, pt: 0, ce: 0, sp: 0 });
    const newDr = (S) => S.own.filter((id) => ITEM[id].dr).length, draws = [];
    let gapMax = 0, net = 0, shop = 0, ten = 0, ten2 = 0, fifteen = 0, first = 0, tenRare = 0;
    DRAW_T.rng = rng;
    try {
      for (let r = 0; r < runs; r++) {
        let S = S0(), last = 0;
        while (!drawDone(S)) {
          const o = drawOne(S, false);
          if (S.dn === 1 && ITEM[o.id].dr) first++;
          if (ITEM[o.id].dr && !o.dup) { gapMax = Math.max(gapMax, S.dn - last); last = S.dn; }
          if (!o.dup && !ITEM[o.id].dr) shop += ITEM[o.id].price;
        }
        draws.push(S.dn); net += S.sp - S.ce;
        S = S0(); let rare = true, hi = 0;
        for (let i = 0; i < DRAW.ten; i++) { const o = drawOne(S, rare); if (o.k === 2) rare = false; if (ITEM[o.id].rar >= DRAW.rare) hi++; }
        ten += newDr(S); ten2 += hi; if (hi) tenRare++;
        S = S0(); for (let i = 0; i < 15; i++) drawOne(S, false);
        fifteen += newDr(S);
      }
    } finally { DRAW_T.rng = keep; }
    draws.sort((x, y) => x - y);
    const q = (f) => draws[Math.min(draws.length - 1, Math.floor(f * draws.length))];
    return { runs, avg: draws.reduce((s, x) => s + x, 0) / runs, p10: q(0.1), med: q(0.5), p90: q(0.9), max: draws[draws.length - 1], gapMax,
      net: net / runs, shop: shop / runs, ten: ten / runs, tenHi: ten2 / runs, tenRare: tenRare / runs, fifteen: fifteen / runs, first: first / runs };
  }
  // ---- the 뽑기 tab (gacha.md 6): the machine view (the pity line, the collection), the two draw buttons (a two-tap arm:
  // the second tap 350 ms - 2.5 s after the first, so a phone's double-tap never spends), the 확률 보기 panel built from
  // the code's own numbers, the result view - played back from the batch the store already holds (drawCommit wrote it
  // before anything is shown), wearing a result on the hub's animal. Nothing of it is ever sent
  const DRAW_GUARD = 800, DRAW_ARM_MIN = 350, DRAW_SKIP_F = 24;   // (taps ignored after a reveal; the arm's minimum; skip ignored for 24 f)
  // a share as the panel shows it: "3.75%" (at most d decimals, ko-KR)
  const drawPct = (w, t, d) => (t > 0 ? (w / t * 100) : 0).toLocaleString('ko-KR', { maximumFractionDigits: d === undefined ? 2 : d }) + '%';
  // the batch the result view shows, or null; the item the canvas shows on the hub's animal ('' = the machine)
  const drawRes = () => (HUB.draw.view === 'res' && HUB.draw.res ? HUB.draw.res : null);
  function drawShown() {
    const D = HUB.draw, R = drawRes();
    if (D.anim) return '';
    if (R) { const e = R.r[clamp(D.rsel, 0, R.r.length - 1)]; return e ? e[0] : ''; }
    return isItemId(D.sel) && ITEM[D.sel].dr ? D.sel : '';
  }
  // the best result of a batch (6.6): the highest rarity; among equals a new one first (no refund), then the first drawn
  const drawBest = (r) => r.reduce((b, e, i) => { const x = ITEM[e[0]].rar, y = ITEM[r[b][0]].rar; return x > y || (x === y && !e[1] && r[b][1]) ? i : b; }, 0);
  // an id leaves the NEW list (6.9): its cell selected / tapped (wearing it: lookSet)
  function drawNwOff(id) { if (TRO.s && !TRO.ro && TRO.s.nw.includes(id)) troMut((S) => { S.nw = S.nw.filter((q) => q !== id); }); }
  function drawNwDot(b, on) { let d = b.querySelector('.pg-item-nw'); if (on && !d) { d = h('i', 'pg-item-nw'); d.setAttribute('aria-hidden', 'true'); b.appendChild(d); } else if (!on && d) d.remove(); }
  // the hub's dots (6.9): 뽑기 until its tab is seen (gs), 마이페이지 while something is NEW, an equipment box while a NEW
  // item of its slot is
  function hubDots(S) {
    if (dom.tabDrawNew && dom.tabDrawNew.hidden !== !!S.gs) dom.tabDrawNew.hidden = !!S.gs;
    if (dom.tabMyNew && dom.tabMyNew.hidden !== !S.nw.length) dom.tabMyNew.hidden = !S.nw.length;
    for (const b of dom.mySlots ? dom.mySlots.children : []) { const d = b.querySelector('.pg-tro-new'), off = !S.nw.some((id) => id[0] === b.dataset.slot); if (d && d.hidden !== off) d.hidden = off; }
  }
  // a status too long for the footer (a lost batch, storage that keeps nothing) in place of the pity line for 4 s; sr:
  // said by the reveal's live region too
  function drawLine(txt, sr) {
    const D = HUB.draw; D.line = txt; D.lineT = performance.now() + 4000;
    if (sr && dom.gachaSr) dom.gachaSr.textContent = txt;
    clearTimeout(D.lineTm); D.lineTm = setTimeout(() => { if (shownOverlay === 'hub') hubFill(); }, 4050);
    if (shownOverlay === 'hub') hubFill();
  }
  // "지난 뽑기 결과예요" (6.7): a batch never shown (a reload, a close mid-show) opens its result view, no show, and is
  // marked shown; one whose items are gone (the store was replaced by a sign-in / sign-out) is only marked
  function drawPast() {
    const S = TRO.s, D = HUB.draw, L = S && S.dl;
    if (!L || L.n <= S.ds || D.anim) return;
    if (!TRO.ro) troMut((q) => { q.ds = Math.max(q.ds, Math.min(L.n, q.dn)); });
    if (!L.r.every((e) => S.own.includes(e[0]))) return;
    Object.assign(D, { view: 'res', res: { id: L.id, n: L.n, r: L.r.map((e) => e.slice()), past: true }, rsel: drawBest(L.r), revAt: 0, bare: false, sel: '' });
  }
  // a draw button's state (6.4): k 'go' | 'arm' | 'poor' (need) | 'done' | 'ro' (one button) | 'hide'; the result view:
  // 1회's spot 'ok' (확인), 10회's 'on' / 'off' (the selected result on the hub's animal)
  function drawBtnState(w) {
    const S = TRO.s, R = drawRes();
    if (HUB.draw.anim || !S) return { k: 'hide' };
    if (R) {
      if (w === 1) return { k: 'ok' };
      const id = drawShown(); if (!id || !shopOwns(S, id)) return { k: 'hide' };
      return { k: shopWorn(myLook(hubAni()), id) ? 'off' : 'on', id };
    }
    if (TRO.ro) return { k: w === 1 ? 'ro' : 'hide' };
    if (drawDone(S)) return { k: 'done' };
    const need = DRAW.price * w - coinBal(S);
    if (need > 0) return { k: 'poor', need };
    return { k: hubArmed('draw' + w) ? 'arm' : 'go' };
  }
  function drawBtnFill(b, w) {
    if (!b) return;
    const st = drawBtnState(w), nm = (CHARS[hubAni()] || CHARS.duck).name, key = st.k + '|' + (st.need | 0) + '|' + (st.id || '') + '|' + nm;
    if (b.hidden !== (st.k === 'hide')) b.hidden = st.k === 'hide';
    if (b._key === key) return;
    b._key = key; b.textContent = '';
    const act = w === 1 ? '1회 뽑기' : '10회 뽑기', price = fmtN(DRAW.price * w);
    let aria = '';
    // (two lines: the action over its price; the numbers as the coin chip shows them)
    if (st.k === 'go' || st.k === 'poor') {
      const c = mk(8, 8); c.className = 'pg-ic pg-coin'; c.setAttribute('aria-hidden', 'true'); troIcon(c, 'coin');
      const p = h('span', 'pg-gacha-pr'); p.append(c, price); b.append(h('span', 'pg-gacha-act', act), p);
      aria = act + ' · ' + price + '코인' + (st.k === 'poor' ? ' · ' + fmtN(st.need) + '개 더 모아요' : w === DRAW.ten ? ' · 희귀 이상 1개 확정' : '');
    } else if (st.k === 'arm') b.textContent = '한 번 더 누르면 뽑아요';
    else if (st.k === 'done') b.textContent = '다 모았어요!';
    else if (st.k === 'ro') b.textContent = '이 브라우저에서는 저장되지 않아요';
    else if (st.k === 'ok') b.textContent = '확인';
    else if (st.k === 'on' || st.k === 'off') { const V = verbOf(ITEM[st.id]); b.textContent = st.k === 'on' ? '지금 ' + V.on : V.off; aria = nm + ': ' + b.textContent; }
    if (aria) b.setAttribute('aria-label', aria); else b.removeAttribute('aria-label');
    b.setAttribute('aria-disabled', st.k === 'poor' || st.k === 'done' || st.k === 'ro' ? 'true' : 'false');
    b.classList.toggle('is-armed', st.k === 'arm');
    b.dataset.k = st.k;
  }
  // a tap on a draw button (w = 1 | 10): arm, draw, say what is missing; in the result view 확인 / wear / take off
  function drawTap(w) {
    const D = HUB.draw, st = drawBtnState(w), now = performance.now();
    if (st.k === 'hide' || st.k === 'done' || st.k === 'ro') return;
    if (st.k === 'poor') { hubMsg(fmtN(st.need) + '개 더 모아요'); return; }
    if (st.k === 'ok' || st.k === 'on' || st.k === 'off') {
      if (now - D.revAt < DRAW_GUARD) return;   // (the hand that tapped 뽑기 twice may tap a third time: 6.7)
      if (st.k === 'ok') { drawOk(); return; }
      const it = ITEM[st.id], V = verbOf(it), a = hubAni();
      if (lookSet(it.slot, st.k === 'on' ? st.id : null, a)) { D.bare = st.k === 'off'; HUB.drawn = ''; uiSfx('equip'); hubMsg(aniSubj(a) + ' ' + (st.k === 'on' ? V.done : V.offDone)); hubFill(); }
      return;
    }
    if (st.k === 'go') {                         // (arming one disarms the other)
      hubDisarm(); HUB.armId = 'draw' + w; HUB.armAt = now;
      HUB.armT = setTimeout(() => { if (HUB.armId === 'draw' + w) { hubDisarm(); hubFill(); } }, HUB_ARM_MS);
      uiSfx('arm'); hubMsg('한 번 더 누르면 뽑아요');
      // (blocked storage: what is drawn lasts this session only - said before it is drawn, 5.6)
      if (TRO.mem) drawLine('이 브라우저에서는 저장되지 않아요'); else hubFill();
      return;
    }
    if (now - HUB.armAt < DRAW_ARM_MIN) return;   // (armed: a second click within 350 ms is a double-tap - still armed)
    hubDisarm();
    const S0 = JSON.parse(JSON.stringify(TRO.s)), before = coinBal(TRO.s), r = drawCommit(w);
    // (another tab of this browser spent the coins or got the last draw-only item first: nothing animates)
    if (!r.ok) { hubMsg(r.why === 'poor' ? fmtN(r.need) + '개 더 모아요' : r.why === 'done' ? '다 모았어요!' : '이 브라우저에서는 저장되지 않아요'); hubFill(); return; }
    hubMsg('');
    drawStart(r, before, S0);
  }
  // 확인: back to the machine view, the focus on 1회 뽑기 (keyboard / mouse)
  function drawOk() {
    Object.assign(HUB.draw, { view: 'machine', res: null, sel: '', bare: false }); HUB.drawn = '';
    hubFill();
    if (!touchMode) try { dom.gachaOne.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  // a tap on a collection cell: select it (the selected one again: the machine); in a one-draw result view another cell
  // leaves the result (after the guard)
  function drawCell(id) {
    const D = HUB.draw;
    if (D.anim || !isItemId(id)) return;
    if (drawRes()) {
      if (performance.now() - D.revAt < DRAW_GUARD) return;
      if (drawShown() === id) { drawNwOff(id); hubFill(); return; }
      Object.assign(D, { view: 'machine', res: null, sel: '' });
    }
    D.sel = D.sel === id ? '' : id; D.bare = false; HUB.drawn = '';
    drawNwOff(id); hubFill();
  }
  // a tap on a result cell: that result on the hub's animal (after the guard)
  function drawResCell(i) {
    const D = HUB.draw, R = drawRes();
    if (D.anim) { drawSkip(); return; }
    if (!R || performance.now() - D.revAt < DRAW_GUARD) return;
    D.rsel = clamp(i, 0, R.r.length - 1); D.bare = false; HUB.drawn = '';
    drawNwOff(R.r[D.rsel][0]); hubFill();
  }
  // a committed batch r: the show (6.6) or, without its art (a missing machine / capsule frame), the reveal at once;
  // before = the balance before it, S0 a copy of the store before it (the show draws from it: no spoilers). The show:
  // anim = {n, f0 (HUB.f at the start), last (the last frame whose events ran), calm (reduced motion at the start),
  // before, co (the chip: the balance after the price), order (the results' opening order: ascending rarity, ties in
  // draw order, the best last), open / flash (per result cell), grid (the ten results shown), view (what was painted)}
  function drawStart(r, before, S0) {
    const D = HUB.draw, n = r.res.length;
    D.res = { id: r.id, n: r.n, r: r.res.map((q) => [q.id, q.ref, q.k]), past: false };
    Object.assign(D, { sel: '', bare: false, line: '', coFrom: before - DRAW.price * n });
    if (!gachaArt() || shownOverlay !== 'hub') { drawReveal(false); return; }
    const best = drawBest(D.res.r), order = D.res.r.map((e, i) => i).filter((i) => i !== best).sort((a, b) => ITEM[D.res.r[a][0]].rar - ITEM[D.res.r[b][0]].rar || a - b).concat([best]);
    D.anim = { n, f0: HUB.f, last: -1, calm: reducedMotion(), before: S0 || TRO.s, co: D.coFrom, order, open: new Array(n).fill(false), flash: new Array(n).fill(-1), grid: false, view: null };
    HUB.drawn = '';
    hubFill();
    if (!touchMode && HUB.tab === 'draw') try { dom.gachaSkip.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
  // the reveal (6.6 / 6.7): the result view, ds written (one troMut), the live region's one line, the reveal's sound
  // (silent: a tab switch mid-show - no sound, no count-up, no focus)
  function drawReveal(silent) {
    const D = HUB.draw, R = D.res; if (!R) return;
    Object.assign(D, { anim: null, view: 'res', revAt: performance.now(), rsel: drawBest(R.r), bare: false }); HUB.drawn = '';
    if (!TRO.ro && TRO.s && TRO.s.ds < R.n) troMut((q) => { q.ds = Math.max(q.ds, Math.min(R.n, q.dn)); });
    // (the chip: from the balance after the price, up by the refunds over 0.4 s - its coin sound at the end)
    if (!silent && R.r.some((e) => e[1]) && D.coFrom !== undefined) { HUB.coFrom = D.coFrom; HUB.coT0 = performance.now(); }
    drawSay(R);
    if (!silent) drawWinSfx(R.r[D.rsel]);
    if (shownOverlay !== 'hub') return;
    hubFill();
    if (!silent && !touchMode && HUB.tab === 'draw') { const el = drawBtnState(DRAW.ten).k === 'on' ? dom.gachaTen : dom.gachaOne; try { if (el && !el.hidden) el.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }
  // the reveal's sound by the (best) result: a new 희귀 / 전설 its fanfare, a new 보통 / 고급 the purchase's, a duplicate
  // none (the chip's coin at the end of its count is enough)
  function drawWinSfx(e) {
    if (!e || e[1]) return;
    const r = ITEM[e[0]].rar;
    if (r >= 2) drawSfx('gacha_win', { n: r }); else drawSfx('buy');
  }
  // the one announcement of a reveal (6.7), in #pg-gacha-sr - too long for the footer
  function drawSay(R) {
    const e = R.r[0], it = ITEM[e[0]], nn = R.r.filter((q) => !q[1]).length, cc = R.r.reduce((s, q) => s + q[1], 0);
    const t = R.r.length === 1 ? (e[1] ? '이미 있어요 · ' + it.name + ' · 코인 ' + e[1] + '개 돌려받았어요' : '새 아이템! ' + it.name + ' · ' + rarOf(it).name)
      : R.r.length + '회 뽑기 결과: 새 아이템 ' + nn + '개' + (cc ? ', 코인 ' + fmtN(cc) + '개 돌려받았어요' : '');
    if (dom.gachaSr) dom.gachaSr.textContent = t;
    HUB.draw.said++;
  }
  // skip the show (건너뛰기, Escape, a tap on the results grid): ignored for its first 24 f (the confirming tap may land
  // twice), then the reveal with everything open
  function drawSkip() { const A = HUB.draw.anim; if (!A || HUB.f - A.f0 < DRAW_SKIP_F) return false; drawReveal(false); return true; }
  // the hub went away mid-show: the show is dropped (the batch is stored, ds not set: "지난 뽑기 결과예요" next time)
  function drawShut() { const D = HUB.draw; if (D.anim) Object.assign(D, { anim: null, view: 'machine', res: null }); }
  function hubFillDraw(S) {
    const D = HUB.draw, R = drawRes(), A = D.anim, id = drawShown(), it = id ? ITEM[id] : null, now = performance.now();
    const nm = (CHARS[hubAni()] || CHARS.duck).name, v = dom.gachaView, ten = !!R && R.r.length > 1;
    // the canvas (6.3): decoration while it shows the machine (out of the tab order, hidden from screen readers); with an
    // animal the carousel's button and its pill
    if (v) {
      if (v.tabIndex !== (it ? 0 : -1)) v.tabIndex = it ? 0 : -1;
      if (it) { v.removeAttribute('aria-hidden'); const a = nm + ' · 눌러서 다른 동물로'; if (v.getAttribute('aria-label') !== a) v.setAttribute('aria-label', a); }
      else { v.setAttribute('aria-hidden', 'true'); v.removeAttribute('aria-label'); }
    }
    if (dom.gachaAname) { if (dom.gachaAname.hidden !== !it) dom.gachaAname.hidden = !it; setTxt(dom.gachaAname, nm); }
    setTxt(dom.gachaName, it ? it.name : '비누 캡슐 뽑기');
    if (dom.gachaRar) { const r = it ? rarOf(it) : null; setTxt(dom.gachaRar, r ? r.name : ''); if (r) dom.gachaRar.style.setProperty('--rar', r.col); }
    // the line and the sub (6.3's table, first match; the result view 6.7)
    const e = R && it ? R.r[clamp(D.rsel, 0, R.r.length - 1)] : null;
    let line, sub = it ? it.desc : '10회 뽑기는 희귀 이상 1개 확정', pre = '', dup = false;
    if (A) line = '두근두근…';
    else if (e) {
      dup = e[1] > 0; line = dup ? '이미 있어요 · 코인 +' + e[1] : '새 아이템!';
      const nn = R.r.filter((q) => !q[1]).length, cc = R.r.reduce((s, q) => s + q[1], 0);
      if (R.past) pre = '지난 뽑기 결과예요';
      else if (ten) pre = nn ? '새 아이템 ' + nn + '개' + (cc ? ' · 코인 +' + fmtN(cc) : '') : '모두 이미 있어요 · 코인 +' + fmtN(cc);
      if (!ten) sub = (e[2] === 1 ? '뽑기 전용 확정! ' : e[2] === 2 ? '희귀 이상 확정 ' : '') + it.desc;
    } else if (it) line = '뽑기 확률 ' + drawPct(drawW(it), 1e4) + (shopOwns(S, id) ? ' · 가지고 있어요' : '');
    else if (drawDone(S)) { line = '뽑기 전용 아이템을 다 모았어요!'; sub = '남은 아이템은 상점에서 사요'; }
    else line = !S.dn ? '첫 뽑기는 뽑기 전용 아이템 확정!' : S.pt >= DRAW.pity - 1 ? '다음 뽑기에 뽑기 전용 아이템 확정!' : (DRAW.pity - S.pt) + '회 안에 뽑기 전용 아이템 확정';
    if (D.line && now < D.lineT) { line = D.line; dup = false; }
    if (dom.gachaLine) { setTxt(dom.gachaLine, line); dom.gachaLine.classList.toggle('is-dup', dup); }
    if (dom.gachaSub) { const k = pre + '|' + sub; if (dom.gachaSub._k !== k) { dom.gachaSub._k = k; dom.gachaSub.textContent = ''; if (pre) dom.gachaSub.appendChild(h('b', 'pg-gacha-batch', pre)); dom.gachaSub.append(sub); } }
    drawBtnFill(dom.gachaOne, 1); drawBtnFill(dom.gachaTen, DRAW.ten);
    if (dom.gachaSkip && dom.gachaSkip.hidden !== !A) dom.gachaSkip.hidden = !A;
    // the caption and the grid: the collection (mid-show from the store before it) or the ten results
    const S0 = A ? A.before : S, rg = ten || (A && A.n > 1 && A.grid);
    const cap = rg ? '뽑기 결과' : DRAW_ONLY.filter((q) => S0.own.includes(q)).length + '/' + DRAW_ONLY.length;
    if (dom.gachaH && dom.gachaH._k !== cap) { dom.gachaH._k = cap; dom.gachaH.textContent = ''; if (rg) dom.gachaH.textContent = cap; else dom.gachaH.append('뽑기 전용 아이템 ', h('b', '', cap)); }
    if (dom.gachaGrid) dom.gachaGrid.classList.toggle('is-res', !!rg);
    if (rg) drawResGrid(dom.gachaGrid, R || D.res); else hubGrid(dom.gachaGrid, DRAW_ONLY, 'draw', A ? A.before : null);
    // 확률 보기 (the footer's ghost button) and its panel
    if (dom.oddsBtn) { setTxt(dom.oddsBtn, D.odds ? '확률 닫기' : '확률 보기'); if (dom.oddsBtn.getAttribute('aria-expanded') !== String(D.odds)) dom.oddsBtn.setAttribute('aria-expanded', D.odds ? 'true' : 'false'); }
    if (dom.gachaOdds) { if (dom.gachaOdds.hidden !== !D.odds) dom.gachaOdds.hidden = !D.odds; if (D.odds) drawOddsFill(S); }
  }
  // the ten results (6.7), keyed by position (one batch can hold an item twice): the 상점 cell's look - the art, the
  // rarity border, a NEW dot, a duplicate's refund "+60" in coin pink on the price line. (G4: closed capsules until each
  // opens, A.open)
  function drawResGrid(box, R) {
    if (!box || !R) return;
    const cells = box._rc || (box._rc = []), S = TRO.s, A = HUB.draw.anim, sel = clamp(HUB.draw.rsel, 0, R.r.length - 1), want = [];
    R.r.forEach((e, i) => {
      let b = cells[i];
      if (!b) {
        b = h('button', 'pg-item'); b.type = 'button'; b.setAttribute('role', 'option'); b.dataset.i = String(i);
        const cv = mk(36, 28); cv.setAttribute('aria-hidden', 'true'); const pr = h('span', 'pg-item-pr'); pr.setAttribute('aria-hidden', 'true');
        b.append(cv, pr); b._pr = pr; listen(b, 'click', (ev) => { ev.preventDefault(); drawResCell(i); });
        cells[i] = b;
      }
      const [id, ref] = e, it = ITEM[id], open = !A || (A.open && A.open[i]), k = id + '|' + ref + '|' + open;
      if (b._k !== k) {
        b._k = k; b.dataset.id = id;
        if (open) paintItem(b.firstChild, id, 4); else drawCapPaint(b.firstChild, it.rar);
        b._pr.textContent = open && ref ? '+' + ref : '';
      }
      const cls = 'pg-item has-pr r' + it.rar + (open && ref ? ' is-dup' : '') + (open ? '' : ' is-cap') + (A && A.flash && A.flash[i] > HUB.f ? ' is-flash' : '');
      if (b.className !== cls) b.className = cls;
      b.style.setProperty('--rar', rarOf(it).col);
      b.setAttribute('aria-selected', !A && i === sel ? 'true' : 'false');
      drawNwDot(b, open && !ref && !!S && S.nw.includes(id));
      const aria = open ? it.name + ' · ' + rarOf(it).name + ' · ' + (ref ? '이미 있어요 · 코인 +' + ref : '새 아이템') : '뽑기 결과 ' + (i + 1);
      if (b.getAttribute('aria-label') !== aria) b.setAttribute('aria-label', aria);
      want.push(b);
    });
    const foc = want.find((b) => b === document.activeElement), tab = want[sel] || want[0];
    for (const b of want) b.tabIndex = b === (foc || tab) ? 0 : -1;
    if (box.children.length !== want.length || want.some((b, i) => box.children[i] !== b)) { box.textContent = ''; for (const b of want) box.appendChild(b); }
  }
  // a closed capsule in a result cell (G4: the cap sprite at 4x, its rarity's frame); without the art the slot's icon
  function drawCapPaint(cv, rar) {
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, cv.width, cv.height);
    const f = frameOf('cap', clamp(rar, 0, 3)); if (f) x.drawImage(f.c, (cv.width - 24) >> 1, (cv.height - 24) >> 1, 24, 24);
  }
  // 확률 보기 (6.5): built from DRAW, DRAW_POOL and drawCands at fill time (drawOdds) - never typed by hand, so the panel
  // cannot drift from the code; the 확정 column for this store now. Rebuilt only when that column changes
  function drawOddsFill(S) {
    const box = dom.gachaOdds; if (!box) return;
    const O = drawOdds(S ? S.own : []), key = O.sumPity + '|' + O.rows.map((r) => r.items.map((e) => e[3]).join()).join(';');
    if (box._key === key) return;
    const was = box.querySelector('details'), open = !!(was && was.open);
    box._key = key;
    const P = drawPct, RN = (r) => RARITY[r].name;
    let s = '<table class="pg-odds"><caption>뽑기 1회의 확률</caption><thead><tr><th scope="col">등급</th><th scope="col">합계</th><th scope="col">아이템 1개</th></tr></thead><tbody>';
    for (const r of O.rows) {
      const g = (dr) => r.items.filter((e) => !!ITEM[e[0]].dr === dr), parts = [];
      for (const [dr, nm] of [[true, '뽑기 전용 '], [false, '상점 아이템 ']]) { const L = g(dr); if (L.length) parts.push(nm + L.length + '종 · 각 ' + P(L[0][1], O.sum)); }
      s += '<tr data-rar="' + r.rar + '"><th scope="row">' + RN(r.rar) + '</th><td>' + P(r.total, O.sum) + '</td><td>' + parts.join('<br>') + '</td></tr>';
    }
    s += '</tbody></table>';
    const gcd = (a, b) => (b ? gcd(b, a % b) : a), wd = DRAW.wd.slice(1), q = wd.reduce(gcd);
    const rare = O.rows.filter((r) => r.rar >= DRAW.rare).map((r) => [r.rar, r.items.reduce((t, e) => t + e[2], 0)]);
    const rules = ['첫 뽑기는 뽑기 전용 아이템 확정',
      DRAW.pity + '회 안에 아직 없는 뽑기 전용 아이템 1개 확정 (' + RARITY.slice(1).map((r) => r.name).join(' : ') + ' = ' + wd.map((w) => w / q).join(' : ') + ' 비율로)',
      DRAW.ten + '회 뽑기 중 1개는 ' + rare.map((e) => RN(e[0])).join('·') + ' 중에서 나와요 (' + rare.map((e) => RN(e[0]) + ' ' + P(e[1], O.sumRare, 0)).join(' · ') + ')',
      '이미 있는 아이템이 나오면 코인을 돌려받아요: ' + RARITY.map((r, i) => r.name + ' ' + DRAW.refund[i]).join(' · '),
      '리그 아이템과 처음 선물은 나오지 않아요 · 뽑기 전용 아이템은 상점에서 팔지 않아요', '뽑기 전용 아이템을 다 모으면 뽑기가 끝나요', '비누 코인은 게임을 해야만 모여요'];
    s += '<ul class="pg-odds-rules">' + rules.map((t) => '<li>' + t + '</li>').join('') + '</ul>';
    s += '<details class="pg-odds-all"><summary>아이템별 확률</summary><table class="pg-odds pg-odds-items"><thead><tr><th scope="col">아이템</th><th scope="col">보통 뽑기</th><th scope="col">희귀 이상 뽑기</th><th scope="col">확정 뽑기'
      + (O.sumPity ? '' : '<small>다 모았어요</small>') + '</th></tr></thead><tbody>';
    const byId = new Map(); for (const r of O.rows) for (const e of r.items) byId.set(e[0], e);
    for (const [id, w, wr, wp] of DRAW_POOL.map((q) => byId.get(q)).filter(Boolean)) {     // (pool order: the 상점's)
      const it = ITEM[id];
      s += '<tr data-id="' + id + '"><th scope="row"><canvas width="16" height="16" aria-hidden="true"></canvas><span>' + it.name + ' · ' + RN(it.rar) + (it.dr ? ' <i class="pg-odds-dr">뽑기 전용</i>' : '') + '</span></th>'
        + '<td>' + P(w, O.sum) + '</td><td>' + (wr ? P(wr, O.sumRare) : '–') + '</td><td>' + (wp ? P(wp, O.sumPity) : '–') + '</td></tr>';
    }
    s += '</tbody></table></details>';
    box.innerHTML = s;   // (every string here is the code's own: names, numbers - nothing from the store or the network)
    for (const cv of box.querySelectorAll('tr[data-id] canvas')) paintItem(cv, cv.closest('tr').dataset.id, 2);
    if (open) box.querySelector('details').open = true;
  }
  // ---- the show (6.6): frame-driven by hubTick on the 뽑기 canvas (painted every 2nd frame while it runs), from GA2's
  // sprites: the machine at (4, 3) (its feet on row 30), its crank at (24, 14), 6x6 capsules (y = the top row) in their
  // result's rarity. One draw reveals at t = 96, ten at 210, reduced motion at 24 (still: no jiggle, hop, halves, rays,
  // sparkles or cell flashes - the crank at frame 1, the capsule resting by the chute; only the roll's knock and the
  // reveal's sound). Never a stand-in box: without the art the draw goes straight to the result view
  const DRAW_REV = [96, 210], CAP_COL = ['#f3e2b4', '#6fd08a', '#b98cff', '#ffd447'];
  const gachaArt = () => !!(frameOf('gacha', 0) && frameOf('gacha_h', 3) && frameOf('cap', 3) && frameOf('cap_t', 3) && frameOf('cap_b', 0));
  const drawRevAt = (A) => (A.calm ? DRAW_SKIP_F : DRAW_REV[A.n > 1 ? 1 : 0]);
  function drawPhase(A) {
    const t = HUB.f - A.f0;
    if (A.calm) return 'still';
    if (A.n > 1) return t < 48 ? 'crank' : t < 108 ? 'roll' : 'open';
    return t < 36 ? 'crank' : t < 52 ? 'drop' : t < 64 ? 'hop' : t < 84 ? 'wobble' : t < 96 ? 'pop' : 'reveal';
  }
  // one draw's capsule at frame t: {x, y} (its top-left; y its top row) or null once it has popped
  function drawCapAt(A, t) {
    if (A.calm) return { x: 5, y: 25 };
    if (t < 36) return null;
    if (t < 52) {                                // (out of the chute: y 21 -> 25 under gravity 0.3, one 1 px bounce)
      let y = 21, vy = 0, b = false;
      for (let u = 36; u < t; u++) { vy += 0.3; y += vy; if (y >= 25) { y = 25; vy = b ? 0 : -0.75; b = true; } }
      return { x: 5, y: Math.round(y) };
    }
    if (t < 64) { const u = (t - 52) / 11; return { x: Math.round(lerp(5, 13, u)), y: Math.round(lerp(25, 16, u) - 5 * Math.sin(Math.PI * u)) }; }   // (the hop to the centre)
    if (t < 84) return { x: 13 + (((t >> 2) & 1) ? 1 : -1), y: 16 };   // (the wobble)
    return null;
  }
  // the events of frame u of the show: its sounds, the ten results' openings, the reveal
  function drawAnimEvent(A, u) {
    const ten = A.n > 1;
    if (u === 0) drawSfx('gacha_roll', { n: A.calm ? 2 : ten ? 1 : 0 });
    if (u >= drawRevAt(A)) { drawReveal(false); return; }
    if (A.calm) return;
    if (!ten) { if (u === 44) drawSfx('gacha_drop', { n: 0 }); else if (u === 84) drawSfx('gacha_pop', { n: 0 }); return; }
    // (ten: n 1 - no bounce - for the first nine; a bounce 90 ms after a drop would flam with the next capsule)
    if (u >= 48 && u < 108 && (u - 48) % 6 === 0 && (u - 48) / 6 < A.n) drawSfx('gacha_drop', { n: (u - 48) / 6 === A.n - 1 ? 0 : 1 });
    let fill = false;
    if (u === 108) { A.grid = true; fill = true; }
    if (u >= 108 && (u - 108) % 10 === 0 && (u - 108) / 10 < A.n) { const k = (u - 108) / 10, i = A.order[k]; A.open[i] = true; A.flash[i] = u + 18; drawSfx('gacha_pop', { n: k }); fill = true; }
    if (A.flash.some((f) => f === u)) fill = true;   // (a cell's 300 ms flash is over)
    if (fill) hubFill();
  }
  function drawTick() {
    const cv = dom.gachaViewCv; if (!cv) return;
    let A = HUB.draw.anim;
    if (A) {
      const t = HUB.f - A.f0;
      for (let u = A.last + 1; u <= t && HUB.draw.anim === A; u++) { A.last = u; drawAnimEvent(A, u); }
      if (HUB.draw.anim !== A) return;          // (revealed: drawReveal's refill drew the animal)
    }
    A = HUB.draw.anim;
    const calm = reducedMotion(), t = A ? HUB.f - A.f0 : 0, art = !!frameOf('gacha', 0);
    const key = A ? 'a' + (t >> 1) : 'm' + (art && !calm ? ((HUB.f / 30) | 0) & 1 : 0);
    if (HUB.drawn === key) return;
    HUB.drawn = key;
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
    hubBack(x);
    const V = { crank: 0, cap: null, halves: false, rays: 0, rayOut: 0, jig: 0, rolled: 0, flash: 0 };
    const m = frameOf('gacha', 0); if (!m) return;
    x.drawImage(m.c, 4, 3);
    const ten = !!A && A.n > 1, R = HUB.draw.res;
    // the dome: jiggling ±1 px every 4 f while the crank turns; at rest one capsule shifts 1 px every 30 f
    if (A && !A.calm && t < (ten ? 48 : 36)) { V.jig = ((t >> 2) & 1) ? 1 : -1; x.drawImage(m.c, 2, 5, 16, 7, 6 + V.jig, 8, 16, 7); }
    else if (!A && !calm && ((HUB.f / 30) | 0) & 1) x.drawImage(m.c, 4, 7, 3, 2, 9, 10, 3, 2);
    // the crank: one turn in 36 f (ten: two in 48 f); reduced motion frame 1
    V.crank = !A ? 0 : A.calm ? 1 : t < (ten ? 48 : 36) ? ((t / (ten ? 6 : 9)) | 0) % 4 : 0;
    const hf = frameOf('gacha_h', V.crank); if (hf) x.drawImage(hf.c, 24, 14);
    if (!A || !R) { if (A) A.view = V; return; }
    const rarOfI = (i) => clamp(ITEM[R.r[i][0]].rar, 0, 3), cap = (rar, cx, cy) => { const f = frameOf('cap', rar); if (f) x.drawImage(f.c, cx, cy); };
    if (ten) {
      // ten capsules leave the chute one every 6 f and roll off to the left along the feet row (-1.5 px/f)
      if (!A.calm) for (let i = 0; i < A.n; i++) { const u = t - 48 - 6 * i; if (u < 0) break; const cx = Math.round(5 - 1.5 * Math.max(0, u - 3)), cy = Math.min(25, 22 + u); if (cx > -6) { cap(rarOfI(i), cx, cy); V.rolled++; } }
      A.view = V; return;
    }
    const best = rarOfI(0), dr = ITEM[R.r[0][0]].dr, c = drawCapAt(A, t);
    if (c) { cap(best, c.x, c.y); V.cap = c; }
    // the hint: a draw-only result blinks two white sparkles beside the wobbling capsule
    const cross = (X, Y) => { x.fillStyle = '#ffffff'; x.fillRect(X - 1, Y, 3, 1); x.fillRect(X, Y - 1, 1, 3); };
    if (!A.calm && dr && t >= 64 && t < 84 && ((t >> 2) & 1)) { cross(10, 17); cross(22, 19); }
    if (!A.calm && t >= 84 && t < 96) {
      const d = t - 84;
      // the pop: the top half up-left, the bottom down-right (g 0.15), 12 f; the canvas flashes the rarity colour
      const ft = frameOf('cap_t', best), fb = frameOf('cap_b', 0);
      if (ft) x.drawImage(ft.c, Math.round(13 - 0.6 * d), Math.round(16 - 1.4 * d + 0.075 * d * d));
      if (fb) x.drawImage(fb.c, Math.round(13 + 0.6 * d), Math.round(19 + 0.3 * d + 0.075 * d * d));
      V.halves = true;
      // 희귀 / 전설: 8 one-pixel rays from (16, 19), 6 -> 12 px long, dashes alternating every 4 f, never past the canvas
      if (best >= 2 && t >= 86) {
        const len = 6 + Math.round((t - 86) * 6 / 9), ph = (t >> 2) & 1;
        x.fillStyle = CAP_COL[best];
        for (let k = 0; k < 8; k++) {
          const ax = Math.round(Math.cos(k * Math.PI / 4)), ay = Math.round(Math.sin(k * Math.PI / 4));
          for (let s = 3; s < 3 + len; s++) { if ((s + ph) & 1) continue; const px = 16 + ax * s, py = 19 + ay * s; if (px < 0 || px > 31 || py < 0 || py > 31) { V.rayOut++; continue; } x.fillRect(px, py, 1, 1); V.rays++; }
        }
        if (best === 3) { cross(6, 8); cross(26, 8); cross(5, 27); cross(27, 26); }
      }
      if (d < 8) { V.flash = d < 2 ? 0.6 : 0.6 * (1 - (d - 2) / 6); x.globalAlpha = V.flash; x.fillStyle = CAP_COL[best]; x.fillRect(0, 0, 32, 32); x.globalAlpha = 1; }
    }
    A.view = V;
  }
  function drawDebugApi() {
    const api = {
      // the store's draw fields, and the 뽑기 tab as shown (G3 / G4): its view, selection, odds panel, show {n, t, phase},
      // the two buttons {k, t (text), aria, hidden, dis}, the line / sub / name / caption, the hub's animal, the armed button
      state() {
        const S = TRO.s || troFresh(), M = HUB.draw.mine, D = HUB.draw, A = D.anim;
        const bt = (b) => (b ? { k: b.dataset.k || '', t: b.textContent, aria: b.getAttribute('aria-label') || '', hidden: b.hidden, dis: b.getAttribute('aria-disabled') === 'true' } : null);
        return { dn: S.dn, pt: S.pt, gd: S.gd.slice(), dl: S.dl ? JSON.parse(JSON.stringify(S.dl)) : null, ds: S.ds, nw: S.nw.slice(), gs: S.gs, co: coinBal(S), own: S.own.slice(),
          done: drawDone(S), pool: DRAW_POOL.length, ids: DRAW_IDS.length, only: DRAW_ONLY.slice(), ro: TRO.ro, mem: TRO.mem,
          mine: M ? Object.assign({}, M, { newIds: M.newIds.slice() }) : null, lost: D.lost ? Object.assign({}, D.lost) : null,
          tab: HUB.tab, shown: shownOverlay === 'hub', view: D.view, sel: D.sel, rsel: D.rsel, res: D.res ? JSON.parse(JSON.stringify(D.res)) : null, odds: D.odds, item: drawShown(),
          anim: A ? { n: A.n, t: HUB.f - A.f0, phase: drawPhase(A), calm: A.calm, grid: A.grid, open: A.open.slice(), order: A.order.slice(), view: A.view ? Object.assign({}, A.view) : null } : null, sfx: DRAW_T.sfx.slice(), btn: [bt(dom.gachaOne), bt(dom.gachaTen)], skip: !!(dom.gachaSkip && !dom.gachaSkip.hidden),
          line: dom.gachaLine ? dom.gachaLine.textContent : '', sub: dom.gachaSub ? dom.gachaSub.textContent : '', name: dom.gachaName ? dom.gachaName.textContent : '',
          cap: dom.gachaH ? dom.gachaH.textContent : '', ani: hubAni(), armId: HUB.armId, armAt: HUB.armAt, sr: dom.gachaSr ? dom.gachaSr.textContent : '', said: D.said,
          msg: dom.hubMsg ? dom.hubMsg.textContent : '', chip: dom.hubCo ? dom.hubCo.textContent : '' };
      },
      // (G3) the UI path: a tap on 'one' | 'ten' | 'skip' | 'ok' (1회's spot) | 'wear' (10회's spot) | 'odds' | 'view'
      // (the canvas' right half) | 'viewL' (its left half); hub frames; openHub('draw', from)
      tap(w) {
        const el = { one: dom.gachaOne, ok: dom.gachaOne, ten: dom.gachaTen, wear: dom.gachaTen, skip: dom.gachaSkip, odds: dom.oddsBtn, view: dom.gachaView, viewL: dom.gachaView }[w];
        if (!el) return api.state();
        if (w === 'view' || w === 'viewL') { const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, clientX: r.left + (w === 'viewL' ? 2 : r.width - 2), clientY: r.top + 2 })); }
        else el.click();
        return api.state();
      },
      tick: (n) => { for (let i = 0; i < (n | 0); i++) hubTick(); return api.state(); },
      open(from) { openHub('draw', from || 'title'); return api.state(); },
      // (e7, tests) a player's ducklings as this screen keeps them: {a: [{x, f, mv}], y, hid} or null
      ducks: (p) => (p && p.lfx && p.lfx.dk ? JSON.parse(JSON.stringify(p.lfx.dk)) : null),
      guard: () => ({ DRAW_GUARD, DRAW_ARM_MIN, DRAW_SKIP_F, HUB_ARM_MS }),
      hold(on) { DRAW_T.hold = !!on; return DRAW_T.hold; }, sfxClear() { DRAW_T.sfx = []; }, art: () => gachaArt(),
      commit: (n) => drawCommit(n), lost: () => drawLost(), forget() { HUB.draw.mine = null; HUB.draw.lost = null; },   // (the store only, no UI)
      cands: (own, pt, dn, rare) => { const c = drawCands(Array.isArray(own) ? own : [], pt | 0, dn | 0, !!rare); return { k: c.k, L: c.L.map((e) => e.slice()) }; },
      pick: (L) => drawPick(L), int: (n) => drawInt(n), one: (S, rare) => drawOne(S, !!rare), done: (S) => drawDone(S),
      odds: (own) => drawOdds(own === undefined && TRO.s ? TRO.s.own : own),
      rng(fn) { DRAW_T.rng = typeof fn === 'function' ? fn : null; return !!DRAW_T.rng; },
      sim: (runs, seed) => drawSim(runs, seed),
      consts: () => ({ DRAW: JSON.parse(JSON.stringify(DRAW)), pool: DRAW_POOL.slice(), ids: DRAW_IDS.slice(), only: DRAW_ONLY.slice(), w: Object.fromEntries(ITEMS.map((it) => [it.id, drawW(it)])) }),
      // (tests: drawW of an item with fields changed - a stubbed retired item - and isPoolId)
      w: (o) => drawW(Object.assign({}, o)), isPool: (id) => isPoolId(id), text: () => GACHA_TEXT,
    };
    return api;
  }

  // ------------------------------------------------------------------ v4 cloud trophies (구글 로그인, design/cloud-trophies.md)
  // Google sign-in keeps the trophy store in the player's own cloud document, so a phone, a PC and the installed app share
  // one count. Only a STANDALONE deploy page built WITH the owner's cloud config file (see the setup guide) defines
  // window.PG_CLOUD (the config, the SDK files with their integrity hashes, the SDK's global name: build.js); the Claude
  // artifact and a deploy without that file have none - CLOUD.on stays false, every hook below returns at once, nothing is loaded, shown or stored.
  // (This file names no SDK, host or URL: build.js owns all of that.)
  //  - play never waits for the cloud: the local store stays the source of truth (offline works as before); a linked
  //    browser's store carries a link record cs (6.1) in the same key, so a view and what it was built from change in one
  //    write and two tabs adopting one snapshot end up equal
  //  - players/{uid}.s: one slot per browser with the absolute totals that browser has ADDED; a write replaces my slot
  //    only, so a repeated, late or racing write never counts twice (no transaction: safe in the SDK's offline queue and
  //    with two tabs); every snapshot is adopted as view = the other slots + mine (idempotent)
  //  - the security rules (design/cloud-trophies.md 7) bound every write; this side caps its own writes to the same bounds
  //  - of the Google user only the uid is ever read (never the name, mail, photo or provider data)
  //  - never signed in where the session would not be this game's alone: a frame (a portal: itch.io serves every game
  //    from one origin, so whatever any of them runs could read the stored session), a shared host (PG_CLOUD.shared) or
  //    a page built for one (PG_CLOUD.away: tools/pack-itch.js) - there 새 창에서 열기 offers the game's own address
  //  - v4 shop (design/shop.md 8, document v 2): each slot also carries that browser's 비누 코인 earned / spent (ce, sp,
  //    absolute like t), the items it bought (o, purchase order) and its day bonus (bd, bs); the account's worn set is
  //    the document's eq (the last write wins, like nick). The account: coins = sum ce - sum sp, items = the union of the
  //    o's, the day bonus = the latest bd not later than tomorrow. A write carries at most ONE new item, with exactly its
  //    price added to sp (the rules check it against a generated catalog). The first write of this page to a v 1
  //    document makes it v 2: older pages then read 'newer' and never write it (they would drop the coin fields). v 3
  //    (looks-per-animal.md 6): eq is 30 characters, a worn set per animal; a v 2 document's 5 are copied to all six and
  //    it becomes v 3 at this page's first slot or worn-set write. v 4 (the 뽑기, design/gacha.md 7): each slot also
  //    counts its draws (dn, absolute) and lists the items it got by drawing (gd, pool ids, grow-only); o stays the items
  //    it BOUGHT. The account: draws = sum dn, owned = the union of every o and gd; a write carries <= 10 draws with
  //    exactly 200 coins each in sp and <= as many new gd items. Not synced: the pity, the log, the NEW dots
  const CL_V = 4, CL_MAXS = 16, CL_RISE = 250, CL_GAP_MS = 2500, CL_PUSH_MS = 4000, CL_PUSH_MAX_MS = 20000, CL_SOFT_MS = 60000;
  // (a slot's coins earned rise by at most 150 a write and 30 + 1 per 2 s since its last write - the rules' coinStepOk)
  const CL_CE_MAX = 150, CL_CE_BASE = 60000, CL_CE_MS = 2000, CL_ITEMS = 64;
  const CL_SDK_MS = 20000, CL_LINK_MS = 15000, CL_FOLD_MS = 8 * 864e5, CL_MSG_MS = 8000, CL_RD_MS = 10 * 60000, CL_WATCH_MS = 120000;
  const CL_QUOTA_MS = 3600000, CL_FULL_MS = 15 * 60000, CL_SLOW_MS = 10000, CL_FLUSH_MS = 4000, CL_RETRY_MS = 5000;
  // (a sign-in that finishes within 10 min of this tab's tap still links here; the popup's watch: 20 s once this page
  // is seen again; taps on 다시 열기 within 1.5 s of the popup opening are the same tap; parked copies kept: 4)
  const CL_ASK_MS = 10 * 60000, CL_BACK_MS = 20000, CL_RETAP_MS = 1500, CL_PARK_MAX = 4;
  const CL_BACKOFF = [5000, 15000, 60000, 300000, 900000];
  const CL_KEY_RE = /^[a-z][0-9a-z]{7}$/, CL_UID_RE = /^[A-Za-z0-9]{1,128}$/, CL_NICK_DEF = /^손님\d{2}$/;
  const CL_FIELDS = ['t', 'w', 'g', 'ko', 'best', 'bl', 'seen', 'hi', 'day', 'de', 'ce', 'sp', 'bd', 'bs', 'dn'];   // (+ o, gd: lists)
  // (everything per page load; the link itself lives in the trophy store. st: 'off' | 'out' | 'load' | 'auth' | 'link' |
  // 'in' | 'relog' | 'frame' | 'inapp' | 'nostore' - 9.3; gen: bumped by a reboot, so a late answer for the old state
  // is dropped)
  // (mine / askAt: this tab asked to sign in, and when; pop: 'auth' is a popup's (다시 열기 retries it); watchAt: when the
  // popup's watch gives up)
  const CLOUD = { on: false, v: '', ns: '', cfg: null, sdk: [], home: '', away: false, shared: [], mock: null, env: null, fb: null, app: null, auth: null, authUn: null,
    db: null, ref: null, refU: '', unsub: null, user: null, parts: [null, null, null], got: [false, false, false], st: 'off', msg: null, msgT: 0,
    mine: false, askAt: 0, pop: false, push: null, pushT: 0, uiT: 0, firstDirty: 0, holdUntil: 0, fails: 0, newer: false, err: '', doc: null, live: false, inAt: 0,
    watchT: 0, watchAt: 0, authAt: 0, loads: 0, linking: null, nickOut: '', armed: 0, outBusy: false, fast: false, clock: null, gen: 0, opened: '', ic: null };
  const FV = () => CLOUD.fb.firestore.FieldValue;                 // (serverTimestamp(), delete())
  // window.PG_CLOUD (the deploy page's head, from build.js): plain values only, else the cloud stays off
  (function clInit() {
    let c = null; try { c = window.PG_CLOUD; } catch (e) { c = null; }
    if (!c || typeof c !== 'object' || !c.cfg || typeof c.cfg !== 'object' || typeof c.v !== 'string' || typeof c.ns !== 'string' || !/^[a-z]{2,16}$/.test(c.ns)) return;
    const cfg = {};
    for (const k of ['apiKey', 'authDomain', 'projectId', 'appId', 'messagingSenderId', 'storageBucket']) if (typeof c.cfg[k] === 'string' && c.cfg[k].length < 200) cfg[k] = c.cfg[k];
    const url = (u) => /^https:\/\/[^\s"'<>\\]+\.js$/.test(u);
    const sdk = (Array.isArray(c.sdk) ? c.sdk : []).filter((x) => Array.isArray(x) && x.length === 3 && x.every((y) => typeof y === 'string')
      && url(x[0]) && url(x[2]) && /^sha(384|512)-[0-9A-Za-z+/=]{40,}$/.test(x[1])).map((x) => x.slice());
    if (!cfg.apiKey || !cfg.authDomain || !cfg.projectId || !cfg.appId || sdk.length !== 3) return;
    // (shared: host names whose pages are not one site's own - a page there, or under one of them, never signs in)
    const shared = (Array.isArray(c.shared) ? c.shared : []).filter((x) => typeof x === 'string' && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(x)).slice(0, 32);
    Object.assign(CLOUD, { on: true, st: 'out', v: c.v, ns: c.ns, cfg, sdk, home: typeof c.home === 'string' && /^https:\/\/[^\s"'<>\\]+$/.test(c.home) ? c.home : '',
      away: c.away === true || c.away === 1, shared });
  })();
  // the clock of the rate cap (PG.debug.cloud.clock: the test server's) and timers (PG.debug.cloud.fast: / 50)
  const clNow = () => { if (CLOUD.clock) { try { const t = +CLOUD.clock(); if (Number.isFinite(t)) return t; } catch (e) { /* the real one */ } } return Date.now(); };
  const clT = (ms) => (CLOUD.fast ? Math.max(1, Math.round(ms / 50)) : ms);
  // test namespaces (PG.debug.tro.ns) suffix these keys like the store's: 'ppogeul-cloud' {rd: a sign-in redirect on
  // its way, pk / pu: the slot key of a first upload on its way and its account}, 'ppogeul-guest' (this browser's own
  // store, put aside while an account's copy is active), 'ppogeul-park' {uid: {at, s}} (accounts' copies put aside when
  // another account signed in over them, 6.6)
  const clSfx = () => TRO.key.slice(TRO_KEY.length);
  const clMetaKey = () => 'ppogeul-cloud' + clSfx(), clGuestKey = () => 'ppogeul-guest' + clSfx(), clParkKey = () => 'ppogeul-park' + clSfx();
  function clNewKey() { let k = ''; while (!CL_KEY_RE.test(k)) k = troRand(8); return k; }
  const clJson = (k) => { let m = null; try { m = JSON.parse(sget(k) || 'null'); } catch (e) { m = null; } return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; };
  // the meta record, read-modify-write ('' / 0 drops a field; only valid fields are kept)
  function clMetaPut(o) {
    const m = Object.assign(clJson(clMetaKey()), o), out = {}, rd = nNum(m.rd, 0, 9e15, 0);
    if (rd > 0) out.rd = rd;
    if (typeof m.pk === 'string' && CL_KEY_RE.test(m.pk) && typeof m.pu === 'string' && CL_UID_RE.test(m.pu)) { out.pk = m.pk; out.pu = m.pu; }
    sset(clMetaKey(), Object.keys(out).length ? JSON.stringify(out) : '');
  }
  // the key of this browser's first slot in uid's document - taken BEFORE the upload goes and kept until a link is done:
  // an upload whose answer never came (the deadline, a closed tab) is then known as this browser's own at the next try
  function clPending(uid) {
    const m = clJson(clMetaKey());
    if (m.pu === uid && typeof m.pk === 'string' && CL_KEY_RE.test(m.pk)) return m.pk;
    const k = clNewKey(); clMetaPut({ pk: k, pu: uid }); return k;
  }
  // an account's copy put aside (another account signs in over it: the session was lost, 'relog') and taken back at that
  // account's next sign-in here: its link record and whatever it had not pushed yet survive (the newest CL_PARK_MAX)
  function clPark(S) {
    const cs = S && S.cs; if (!cs) return;
    const m = clJson(clParkKey()), out = {};
    const keep = Object.keys(m).filter((u) => u !== cs.u && CL_UID_RE.test(u) && m[u] && typeof m[u].s === 'string')
      .sort((a, b) => nNum(m[b].at, 0, 9e15, 0) - nNum(m[a].at, 0, 9e15, 0)).slice(0, CL_PARK_MAX - 1);
    for (const u of keep) out[u] = m[u];
    out[cs.u] = { at: Date.now(), s: JSON.stringify(S) };
    sset(clParkKey(), JSON.stringify(out));
  }
  // uid's parked copy (a valid store linked to uid) or null; drop: take it out
  function clParked(uid, drop) {
    const m = clJson(clParkKey()), e = CL_UID_RE.test(uid) ? m[uid] : null;
    if (!e) return null;
    if (drop) { delete m[uid]; sset(clParkKey(), Object.keys(m).length ? JSON.stringify(m) : ''); }
    const S = typeof e.s === 'string' ? troParse(e.s) : null;
    return S && S !== 'newer' && S.cs && S.cs.u === uid ? S : null;
  }
  const clHi = () => clamp(Math.floor(+G.hiscore) || 0, 0, 999999999);

  // ---- the link record and the pure parts (6.1, 6.2; PG.debug.cloud runs them). v4 shop (shop.md 8.1, 8.2): every slot,
  // the link record's c (my part at the last sync), v (the view then) and m (my slot as acknowledged) also carry ce / sp
  // (coins earned / spent), o (items, purchase order) and bd / bs (the day bonus's day and streak); cs.ev is the worn set
  // at the last sync (S.eq !== cs.ev: a local change waiting to go up). A v1 slot or record (before the shop) reads
  // with no coins: a v1 record migrates with mine.ce = the store's ce - every coin there is this browser's, which is
  // exactly right for an upload, and a join under v1 could hold none: no page with coins ever wrote a v1 document (the
  // release gate - tools/check-shop.js refuses a store v 2 with a cloud v 1)
  // (v 4, gacha.md 7.2: + dn the draws, gd the drawn items - a v 2 / v 3 slot or record reads with none: every draw in a
  // store linked before is this browser's, exact, because no page with draws ever wrote a document below v 4 - the gate)
  const clZero = () => ({ t: 0, w: 0, g: 0, ko: 0, best: 0, bl: 0, seen: 0, hi: 0, day: 0, de: 0, n: 0, ce: 0, sp: 0, o: [], bd: 0, bs: 0, dn: 0, gd: [] });
  const clMs = (ts) => { try { return ts && typeof ts.toMillis === 'function' ? nNum(ts.toMillis(), 0, 9e15, 0) : 0; } catch (e) { return 0; } };
  // (an item list from anywhere: catalog ids that are sold - never the starter - once each, in order, <= 64)
  const clItems = (a) => Array.from(new Set((Array.isArray(a) ? a : []).filter((id) => isItemId(id) && id !== STARTER))).slice(0, CL_ITEMS);
  // (a drawn-item list from anywhere: pool ids - DRAW_IDS, grow-only - once each, in order, <= 64)
  const clPool = (a) => Array.from(new Set((Array.isArray(a) ? a : []).filter(isPoolId))).slice(0, CL_ITEMS);
  const clCnt = (x) => ({ t: x.t, w: x.w, g: x.g, ko: x.ko, de: x.de, day: x.day, ce: x.ce | 0, sp: x.sp | 0, o: clItems(x.o), bd: x.bd | 0, bs: x.bs | 0, dn: x.dn | 0, gd: clPool(x.gd) });
  // troParse keeps cs only when this validates it (every number clamped, the keys and the uid by pattern)
  function clParseCs(x) {
    if (!x || typeof x !== 'object' || typeof x.u !== 'string' || !CL_UID_RE.test(x.u) || typeof x.k !== 'string' || !CL_KEY_RE.test(x.k)) return null;
    const I = (v, lo, hi) => nInt(v, lo, hi, 0);
    const cnt = (o) => (o && typeof o === 'object' ? { t: I(o.t, -999999, 999999), w: I(o.w, 0, 1e7), g: I(o.g, 0, 1e7), ko: I(o.ko, 0, 1e7),
      de: I(o.de, 0, DAY_CAP), day: I(o.day, 0, 99991231), ce: I(o.ce, 0, 1e9), sp: I(o.sp, 0, 1e9), o: clItems(o.o), bd: I(o.bd, 0, 99991231), bs: I(o.bs, 0, COIN.day.length),
      dn: I(o.dn, 0, 1e9), gd: clPool(o.gd) } : null);
    const c = cnt(x.c), v = cnt(x.v), m0 = x.m && typeof x.m === 'object' ? x.m : {};
    if (!c || !v) return null;
    const m = Object.assign(clSlot(Object.assign({}, m0, { n: 1 })), { n: nInt(m0.n, 0, 1e9, 0) }); delete m.at;
    return { u: x.u, k: x.k, c, v, m, n: Math.max(nInt(x.n, 0, 1e9, 0), m.n), mt: nNum(x.mt, 0, 9e15, 0), ev: typeof x.ev === 'string' ? looksParse(x.ev) : '' };   // (a v 2 record's 5 characters -> all six)
  }
  // one slot from the network (untrusted): clamped like the rules (a v1-shaped slot: no coins, no items)
  function clSlot(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
    const I = (v, lo, hi) => nInt(v, lo, hi, 0), g = I(x.g, 0, 1e7);
    return { t: I(x.t, -999999, 999999), w: Math.min(I(x.w, 0, 1e7), g), g, ko: I(x.ko, 0, 1e7), best: I(x.best, 0, TRO_MAX),
      bl: I(x.bl, 0, LEAGUES.length - 1), seen: x.seen ? 1 : 0, hi: I(x.hi, 0, 999999999), day: I(x.day, 0, 99991231),
      de: I(x.de, 0, DAY_CAP), n: nInt(x.n, 1, 1e9, 1), at: clMs(x.at),
      ce: I(x.ce, 0, 1e9), sp: I(x.sp, 0, 1e9), o: clItems(x.o).filter((id) => !ITEM[id].dr), bd: I(x.bd, 0, 99991231), bs: I(x.bs, 0, COIN.day.length),
      dn: I(x.dn, 0, 1e9), gd: clPool(x.gd) };       // (o: never a draw-only id - the rules never allow one there)
  }
  // a document (untrusted): { v, dev, nick, eq, s: Map }; null = unusable, 'newer' = a newer page's schema. v 1 (before
  // the shop: no coins anywhere), v 2 (one worn set: copied to all six) and v 3 are read; eq '' = the account has no worn
  // set yet; hasEq: the document has an eq field at all (an upgrade write must replace whatever is there, 6.4)
  function clDoc(d) {
    if (!d || typeof d !== 'object') return null;
    if (typeof d.v === 'number' && d.v > CL_V) return 'newer';
    if (d.v !== 1 && d.v !== 2 && d.v !== 3 && d.v !== CL_V) return null;
    const s = new Map();
    if (d.s && typeof d.s === 'object' && !Array.isArray(d.s)) for (const k of Object.keys(d.s)) {
      if (s.size > CL_MAXS) break;
      if (k === '_' || CL_KEY_RE.test(k)) { const x = clSlot(d.s[k]); if (x) s.set(k, x); }
    }
    return { v: d.v, dev: typeof d.dev === 'string' && /^[0-9a-z]{8}$/.test(d.dev) ? d.dev : '', nick: cleanNick(d.nick), s,
      eq: typeof d.eq !== 'string' ? '' : d.v >= 3 ? (/^[0-9a-z]{30}$/.test(d.eq) ? looksParse(d.eq) : '') : (/^[0-9a-z]{5}$/.test(d.eq) ? looksParse(d.eq) : ''),
      hasEq: 'eq' in d };
  }
  const clBrowsers = (D) => { let n = 0; for (const k of D.s.keys()) if (k !== '_') n++; return n; };
  // every slot but mine: counters add up (de: only the slots of that day; ce / sp too), the rest is the best seen; the
  // items are the union in slot order; the day bonus is the slot with the latest bd not later than tomorrow - a later one
  // comes from a wrong clock and would block the account's bonus until that date (shop.md 3.4): skipped
  function clAgg(s, mine, day) {
    const a = { t: 0, w: 0, g: 0, ko: 0, de: 0, best: 0, bl: 0, seen: 0, hi: 0, ce: 0, sp: 0, o: [], bd: 0, bs: 0, dn: 0, gd: [] }, tom = troTomorrow(troToday()), seen = new Set(), gs = new Set();
    for (const [k, x] of s) {
      if (k === mine) continue;
      a.t += x.t; a.w += x.w; a.g += x.g; a.ko += x.ko; if (x.day === day) a.de += x.de;
      a.best = Math.max(a.best, x.best); a.bl = Math.max(a.bl, x.bl); a.seen = Math.max(a.seen, x.seen); a.hi = Math.max(a.hi, x.hi);
      a.ce += x.ce | 0; a.sp += x.sp | 0;
      for (const id of x.o || []) if (!seen.has(id)) { seen.add(id); a.o.push(id); }
      a.dn += x.dn | 0; for (const id of x.gd || []) if (!gs.has(id)) { gs.add(id); a.gd.push(id); }     // (v 4: draws summed, drawn items the union)
      if ((x.bd | 0) > a.bd && x.bd <= tom) { a.bd = x.bd; a.bs = x.bs | 0; }
    }
    return a;
  }
  // what this browser has added: my part at the last sync + what the game changed in the view since. Coins as the
  // counters; items: what my slot had + what was bought here since (in the view now, not then); the day bonus: the
  // view's when it changed here since the last sync (this browser paid it), else my slot's own - never another
  // device's (a browser that only looks writes nothing)
  // (v 4, gacha.md 7.2: the items it BOUGHT - never one this store drew (S.gd), never a draw-only one -, the items it
  // drew, the draws as the counters; every list read defensively)
  function clMine(S, cs, hi) {
    const c = cs.c, v = cs.v, co = c.o || [], vo = v.o || [], own = Array.isArray(S.own) ? S.own : [], here = (S.bd | 0) !== (v.bd | 0);
    const cg = c.gd || [], vg = v.gd || [], sg = Array.isArray(S.gd) ? S.gd : [];
    return { t: c.t + S.t - v.t, w: Math.max(0, c.w + S.w - v.w), g: Math.max(0, c.g + S.g - v.g), ko: Math.max(0, c.ko + S.ko - v.ko),
      best: S.best, bl: S.bl, seen: S.seen, hi, day: S.day, de: S.day === v.day ? clamp(c.de + S.de - v.de, 0, DAY_CAP) : S.de,
      ce: Math.max(0, (c.ce | 0) + (S.ce | 0) - (v.ce | 0)), sp: Math.max(0, (c.sp | 0) + (S.sp | 0) - (v.sp | 0)),
      o: clItems(co.concat(own.filter((id) => !vo.includes(id) && !co.includes(id) && !sg.includes(id) && isItemId(id) && ITEM[id].price > 0))),
      bd: here ? S.bd | 0 : c.bd | 0, bs: here ? S.bs | 0 : c.bs | 0,
      gd: clPool(cg.concat(sg.filter((id) => !vg.includes(id) && !cg.includes(id)))), dn: Math.max(0, (c.dn | 0) + (S.dn | 0) - (v.dn | 0)) };
  }
  // adopt a document into the view (S changed in place, inside troMut; returns the new cs). join: this browser starts
  // from nothing (cloud wins); a slot of mine that vanished (folded, or the doc was reset) starts over the same way.
  // pending: a snapshot carrying this tab's own unacknowledged write (never taken as acknowledged). The view's clamp
  // never touches c: a debt (two devices losing more than the account had) stays in the sum - the view shows 0 and
  // later gains pay it first (clamping c would let both devices forgive the same debt)
  // v4 shop: coins and items as the counters (a debt - two devices spending the same coins offline - stays in the sums:
  // the balance shows 0 and later coins pay it); the day bonus the later of the others' and mine; the worn sets
  // (looks-per-animal.md 6.3): merged character by character (one slot of one animal) against the last ACKNOWLEDGED set
  // cs.ev - what changed here since stays, the rest follows the account; a join takes the account's - then only what the
  // account owns. A pending snapshot (my own unacknowledged write) never moves that base: a refused write would
  // otherwise be undone by the next snapshot
  function clAdopt(S, cs, D, hi, join, pending) {
    const day = Math.max(S.day, troToday());
    const fresh = join || (cs.m.n > 0 && !D.s.has(cs.k));
    const mine = fresh ? { t: 0, w: 0, g: 0, ko: 0, de: 0, day, ce: 0, sp: 0, o: [], bd: 0, bs: 0, dn: 0, gd: [] } : clMine(S, cs, hi);
    const mde = mine.day === day ? mine.de : 0, o = clAgg(D.s, cs.k, day);
    S.t = clamp(o.t + mine.t, 0, TRO_MAX); S.w = clamp(o.w + mine.w, 0, 1e6); S.g = clamp(o.g + mine.g, 0, 1e6); S.ko = clamp(o.ko + mine.ko, 0, 1e6);
    S.best = Math.max(join ? 0 : S.best, o.best, S.t); S.bl = Math.max(join ? 0 : S.bl, o.bl); S.seen = Math.max(join ? 0 : S.seen, o.seen);
    S.day = day; S.de = clamp(o.de + mde, 0, DAY_CAP);
    S.ce = clamp(o.ce + mine.ce, 0, 1e9); S.sp = clamp(o.sp + mine.sp, 0, 1e9);
    // (v 4, gacha.md 7.2: owned = every bought and drawn item; gd = the drawn ones - every draw-only one -, dn >= gd's
    // length; a join starts this store's own draw state over: the pity belongs to the store that drew, 3.3 - else the
    // guest store's pt was copied into the account at every join while staying in the put-aside guest store)
    S.dn = clamp(o.dn + mine.dn, 0, 1e9);
    S.own = clItems(o.o.concat(o.gd, mine.o, mine.gd));
    S.gd = S.own.filter((id) => isPoolId(id) && (ITEM[id].dr || o.gd.includes(id) || mine.gd.includes(id)));
    S.dn = Math.max(S.dn, S.gd.length); S.nw = (Array.isArray(S.nw) ? S.nw : []).filter((id) => S.own.includes(id));
    if (join) { S.pt = 0; S.dl = null; S.ds = 0; S.nw = []; }
    if (o.bd >= mine.bd) { S.bd = o.bd; S.bs = o.bs; } else { S.bd = mine.bd; S.bs = mine.bs; }
    const ev0 = typeof cs.ev === 'string' ? cs.ev : '', eq0 = looksParse(S.eq);
    const eq = join ? (D.eq || eq0) : looksMerge(eq0, ev0, D.eq);      // (what I changed since the last sync stays)
    S.eq = looksOwned(eq, S.own);
    const ev = pending ? ev0 : D.eq ? D.eq : join ? S.eq : ev0;         // (the new base: the account's set as acknowledged)
    if (D.dev && !NET.sess) S.dev = D.dev;                        // (in a room: the next adoption after it ends)
    const srv = D.s.get(cs.k), took = !fresh && !pending && !!srv && srv.n > cs.m.n;   // (another tab of mine wrote it)
    const m = fresh ? clZero() : took ? Object.assign({}, srv) : cs.m; delete m.at;
    return { u: cs.u, k: cs.k, c: { t: mine.t, w: mine.w, g: mine.g, ko: mine.ko, de: mde, day, ce: mine.ce, sp: mine.sp, o: mine.o.slice(), bd: mine.bd, bs: mine.bs, dn: mine.dn, gd: mine.gd.slice() },
      v: { t: S.t, w: S.w, g: S.g, ko: S.ko, de: S.de, day, ce: S.ce, sp: S.sp, o: S.own.slice(), bd: S.bd, bs: S.bs, dn: S.dn, gd: S.gd.slice() },
      m, n: fresh ? 0 : Math.max(cs.n, m.n), mt: fresh ? 0 : took ? clNow() : cs.mt, ev };
  }
  // the next write of my slot, capped to what the rules take now; null = nothing to write; {wait: ms} = too soon. (mt:
  // when the last acknowledgement ARRIVED - after the server's own time of that write - so now - mt never overstates the
  // server's dt, whatever the two clocks say)
  // (v4 shop: coins earned rise by <= 150 a write and 30 + 1 per 2 s - a new slot <= 150 in all; at most ONE new item a
  // write - the first of mine.o the server lacks, appended - with exactly its price added to sp, so the rules can check
  // the pair; the rest go in the next writes (partial). Spent coins without a new item cannot be written - the rules
  // move sp only with an item - and are no difference. The day bonus: the later one. Written in the v 2 shape)
  // (v4 뽑기, gacha.md 7.2: at most DRAW.ten draws a write, exactly DRAW.price each in sp, and at most as many new drawn
  // items as draws - each draw adds at most one, so the split always finishes. The spent check: never more sp than this
  // browser spent - the bought item goes first, then draws; what is left is an unwritable difference (clDirty reports
  // nothing for it: the push never spins) - so a wrong classification (a hand edit, a lost gd mark) never charges a shop
  // price for a 200-coin draw. Written in the v 4 shape)
  function clStep(mine, m, n, now, mt) {
    const dt = m.n ? now - mt : 1e12;
    if (dt < CL_GAP_MS) return { wait: CL_GAP_MS - dt };
    const rise = mine.t - m.t, cap = m.n ? Math.min(CL_RISE, Math.floor((10000 + dt) / 500)) : CL_RISE;
    const g = Math.max(m.g, Math.min(mine.g, m.g + 20)), ko = Math.max(m.ko, Math.min(mine.ko, m.ko + 400));
    const mo = Array.isArray(m.o) ? m.o : [], mce = m.ce | 0, msp = m.sp | 0, mbd = m.bd | 0;
    const ceCap = m.n ? Math.min(CL_CE_MAX, Math.floor((CL_CE_BASE + dt) / CL_CE_MS)) : CL_CE_MAX;
    let nu = (mine.o || []).find((id) => !mo.includes(id) && isItemId(id) && ITEM[id].price > 0);
    const mdn = m.dn | 0, mg = Array.isArray(m.gd) ? m.gd : [], msp0 = mine.sp | 0;
    let d = clamp((mine.dn | 0) - mdn, 0, DRAW.ten);
    const ng = (Array.isArray(mine.gd) ? mine.gd : []).filter((id) => !mg.includes(id) && isPoolId(id));
    const spOf = () => msp + DRAW.price * d + (nu ? ITEM[nu].price : 0);
    while (spOf() > msp0 && (nu || d > 0)) { if (nu) nu = undefined; else d--; }
    const x = { t: rise > cap ? m.t + cap : mine.t, w: Math.max(m.w, Math.min(mine.w, m.w + (g - m.g), g)), g, ko,
      best: Math.max(m.best, mine.best), bl: Math.max(m.bl, mine.bl), seen: Math.max(m.seen, mine.seen), hi: Math.max(m.hi, Math.min(mine.hi, 999999999)),
      day: mine.day, de: clamp(mine.de, 0, DAY_CAP),
      ce: Math.max(mce, Math.min(mine.ce | 0, mce + ceCap, 1e9)), sp: Math.min(1e9, spOf()), o: nu ? mo.concat([nu]) : mo.slice(),
      bd: Math.max(mbd, mine.bd | 0), bs: (mine.bd | 0) > mbd ? mine.bs | 0 : m.bs | 0,
      dn: mdn + d, gd: mg.concat(ng.slice(0, Math.min(ng.length, d))) };
    if (CL_FIELDS.every((f) => x[f] === (m[f] === undefined ? 0 : m[f])) && x.o.length === mo.length && x.gd.length === mg.length) return null;
    return { slot: Object.assign(x, { n: m.n ? Math.max(n, m.n) + 1 : 1 }),
      partial: x.t !== mine.t || x.g !== mine.g || x.w !== mine.w || x.ko !== mine.ko || x.ce !== (mine.ce | 0) || (mine.o || []).some((id) => !x.o.includes(id))
        || (mine.dn | 0) > x.dn || ng.length > x.gd.length - mg.length };
  }
  // what a write would carry, time aside: 'hard' (a count, today's bonus, coins, an item or the day bonus differs from
  // what the server has), 'soft' (only a best / seen / score), '' (in sync - also when only an unwritable difference is
  // left, e.g. a hand-edited w > g, spent coins without an item; when the day moved on and nothing was given today: the
  // server's bonus of an older day counts for nobody; and for a slot never written yet, until a count changes: a
  // browser that only looks makes no slot). The worn set goes on its own (clEqOut), like the nick
  function clDirty(S) {
    const cs = S && S.cs; if (!cs) return '';
    const st = clStep(clMine(S, cs, clHi()), cs.m, cs.n, Infinity, 0);
    if (!st) return '';
    const x = st.slot, m = cs.m;
    if (['t', 'w', 'g', 'ko'].some((f) => x[f] !== m[f]) || (x.day === m.day ? x.de !== m.de : x.de > 0)) return 'hard';
    if (x.ce !== (m.ce | 0) || x.sp !== (m.sp | 0) || x.o.length !== (m.o || []).length || x.bd !== (m.bd | 0)) return 'hard';
    if (x.dn !== (m.dn | 0) || x.gd.length !== (Array.isArray(m.gd) ? m.gd : []).length) return 'hard';   // (v 4: draws)
    return m.n && ['best', 'bl', 'seen', 'hi'].some((f) => x[f] !== m[f]) ? 'soft' : '';
  }
  // the worn set to send to the account now, or '': it changed here since the last sync (cs.ev), the document does not
  // have it already, and every item in it is the account's (the document's slots, or the slot this write carries) - so
  // another device never gets a set it would strip (the item's own write comes first)
  function clEqOut(S, slot) {
    const cs = S && S.cs, D = CLOUD.doc; if (!cs || !D) return '';
    const eq = looksParse(S.eq); if (eq === cs.ev || eq === D.eq) return '';
    // (v 4, gacha.md 7.2: known from every o AND gd - a worn drawn item no longer blocks all six sets)
    const known = new Set(slot ? (slot.o || []).concat(slot.gd || []) : []); for (const x of D.s.values()) for (const id of (x.o || []).concat(x.gd || [])) known.add(id);
    // (v 3: every item on every animal must be the account's first - the item's own slot write goes before)
    for (let i = 0; i < LOOKS_LEN; i++) { const id = LOOK_SLOTS[i % 5] + eq[i]; if (eq[i] !== '0' && id !== STARTER && !known.has(id)) return ''; }
    return eq;
  }
  // the first slot of a browser whose account had no document yet: its store as it is (w <= g, best >= t; its coins,
  // items and day bonus too - the first upload is trusted like t, shop.md 8.3)
  // (v 4: the drawn items in gd, the bought ones in o, dn >= gd's length)
  const clUpload = (S) => { const gd = clPool(S.gd); return { t: clamp(S.t, 0, TRO_MAX), w: Math.min(S.w, S.g), g: S.g, ko: S.ko, best: Math.max(S.best, S.t), bl: S.bl, seen: S.seen ? 1 : 0,
    hi: clHi(), day: S.day, de: S.de, n: 1, ce: clamp(S.ce | 0, 0, 1e9), sp: clamp(S.sp | 0, 0, 1e9), o: clItems((S.own || []).filter((id) => !gd.includes(id) && isItemId(id) && ITEM[id].price > 0)),
    bd: clamp(S.bd | 0, 0, 99991231), bs: clamp(S.bs | 0, 0, COIN.day.length), dn: clamp(Math.max(S.dn | 0, gd.length), 0, 1e9), gd }; };
  // the in-game nick for the account (never the default 손님NN); the account's for a browser that still has the default
  function clNickOut() { const n = cleanNick(NET.nick || sget('ppogeul-nick') || ''); return n && !CL_NICK_DEF.test(n) ? n : ''; }
  function clNickIn(D) {
    if (!D || !D.nick || NET.sess) return;
    const cur = cleanNick(NET.nick || sget('ppogeul-nick') || '');
    if (cur && !CL_NICK_DEF.test(cur)) return;
    sset('ppogeul-nick', D.nick); NET.nick = D.nick; NET.nickDefault = false; NET.nickProfile = false;
  }
  // the best solo score of the account (the highest slot's) when it beats this browser's
  function clHiIn(D) {
    let hi = 0; for (const x of D.s.values()) hi = Math.max(hi, x.hi);
    if (hi <= G.hiscore) return;
    G.hiscore = hi; sset('ppogeul-hiscore', hi);
    if (dom.titleHi) dom.titleHi.textContent = hi.toLocaleString('ko-KR');
    if (shownOverlay === 'rec') fillRec();
  }

  // ---- the SDK (2.2): the deploy page's three files, each an SRI-checked classic script (async = false keeps
  // insertion order), the primary CDN and then the fallback; part 0 app, 1 auth, 2 firestore - each loaded once (a failure
  // is forgotten, so a later try loads again). Nothing loads for a player who never signed in: app + auth when 내 기록
  // opens (the sign-in button is there, and Safari opens a popup only straight from the tap: the SDK must be in memory
  // by then), firestore once signed in; at boot only for a linked browser or a sign-in redirect coming back
  function clScript(src, sri) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.integrity = sri; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer'; s.async = false;
      CLOUD.loads++;
      const t = setTimeout(() => { s.onload = s.onerror = null; s.remove(); rej(new Error('timeout')); }, CL_SDK_MS);
      s.onload = () => { clearTimeout(t); res(); };
      s.onerror = () => { clearTimeout(t); s.remove(); rej(new Error('load')); };
      (document.head || document.documentElement).appendChild(s);
    });
  }
  function clLoad(part) {
    if (!CLOUD.on) return Promise.reject(new Error('off'));
    if (CLOUD.mock) { CLOUD.fb = CLOUD.mock; for (let i = 0; i <= part; i++) CLOUD.got[i] = true; return Promise.resolve(CLOUD.fb); }
    const P = CLOUD.parts;
    for (let i = 0; i <= part; i++) {
      if (P[i]) continue;
      const [src, sri, alt] = CLOUD.sdk[i], prev = i ? P[i - 1] : Promise.resolve();
      const p = P[i] = prev.then(() => clScript(src, sri).catch(() => clScript(alt, sri))).then(() => {
        let fb = null; try { fb = window[CLOUD.ns]; } catch (e) { fb = null; }   // (the SDK's global, as build.js names it)
        if (!fb || (typeof fb !== 'object' && typeof fb !== 'function') || fb.SDK_VERSION !== CLOUD.v) throw new Error('sdk');
        CLOUD.fb = fb; CLOUD.got[i] = true;
      });
      p.catch(() => { if (P[i] === p) P[i] = null; });
    }
    return P[part];
  }
  const clSdkErr = (e) => !!e && !e.code && /^(load|timeout|sdk)$/.test(e.message || '');

  // ---- where the page runs, and how to sign in (4.1)
  function clEnv() {
    if (CLOUD.env) return CLOUD.env;
    const ua = String(navigator.userAgent || '');
    let framed = true; try { framed = window.top !== window.self; } catch (e) { framed = true; }
    let host = ''; try { host = String(location.hostname || '').toLowerCase(); } catch (e) { host = ''; }
    return { framed, app: pwaIsApp(), inApp: IN_APP_UA.test(ua), same: host === CLOUD.cfg.authDomain, shared: CLOUD.shared.some((x) => host === x || host.endsWith('.' + x)),
      android: /Android/i.test(ua), kakao: /KAKAOTALK/i.test(ua), line: /Line\//.test(ua) };
  }
  // may this page sign in at all? Not in a frame, on a shared host or in a page built for one (the section's head)
  function clHere() { const e = clEnv(); return !e.framed && !e.shared && !CLOUD.away; }
  // 'inapp' (Google refuses embedded browsers) | 'frame' (no sign-in on this page: clHere) | 'nostore' (no storage:
  // nothing could stay linked) | 'popup' | 'redirect'
  function clMethod() {
    const e = clEnv();
    if (e.inApp) return 'inapp';
    if (!clHere()) return 'frame';
    if (TRO.mem || TRO.ro) return 'nostore';
    return e.app && e.same ? 'redirect' : 'popup';       // (an installed app: a popup opens outside it - unless that cannot work)
  }
  // 새 창에서 열기 / 다른 브라우저로 열기: the game's own address (home; this page only where it may sign in itself - a
  // frame's or a shared host's address is that portal's), as KakaoTalk / LINE / Android Chrome want it ('' = nowhere to
  // go: the message only)
  function clOutsideUrl() {
    const e = clEnv();
    let here = ''; try { here = /^https?:/.test(location.protocol) ? location.href.split('#')[0] : ''; } catch (er) { here = ''; }
    const url = CLOUD.home || (clHere() ? here : ''); if (!url) return '';
    if (!e.inApp) return url;
    if (e.kakao) return 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url);
    if (e.line) return url + (url.indexOf('?') < 0 ? '?' : '&') + 'openExternalBrowser=1';
    if (e.android) { try { const u = new URL(url); return 'intent://' + u.host + u.pathname + u.search + '#Intent;scheme=https;package=com.android.chrome;end'; } catch (er) { return ''; } }
    return '';
  }
  function clOpenOutside() {
    const url = clOutsideUrl(), e = clEnv(); CLOUD.opened = url;
    if (!url) return '';
    try { if (e.inApp) location.href = url; else window.open(url, '_blank', 'noopener'); } catch (er) { /* refused */ }
    return url;
  }

  // ---- auth (4.2 - 4.4)
  const clProvider = () => { const p = new CLOUD.fb.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); return p; };
  // once the app + auth files ran: the app, its auth (Korean pages) and the observer. true = the observer was just
  // registered (its first call comes by itself); false = it existed (a reboot reads currentUser itself)
  function clApp() {
    const fb = CLOUD.fb; if (!fb) return false;
    if (!CLOUD.app) {
      // (the SDK's own console lines: errors only - an offline phone is not worth a warning on every start)
      try { if (typeof fb.setLogLevel === 'function') fb.setLogLevel('error'); } catch (e) { /* ignore */ }
      CLOUD.app = fb.apps && fb.apps.length ? fb.app() : fb.initializeApp(CLOUD.cfg);
    }
    if (CLOUD.auth) return false;
    CLOUD.auth = CLOUD.app.auth();
    try { CLOUD.auth.languageCode = 'ko'; } catch (e) { /* ignore */ }
    CLOUD.authUn = CLOUD.auth.onAuthStateChanged(clAuthIn, () => { /* (an observer error: the state stays) */ });
    return true;
  }
  // the auth state: only the uid is kept
  function clAuthIn(user) {
    if (stopped || !CLOUD.on) return;
    let uid = ''; try { uid = user && typeof user.uid === 'string' && CL_UID_RE.test(user.uid) ? user.uid : ''; } catch (e) { uid = ''; }
    const was = CLOUD.user ? CLOUD.user.uid : '';
    CLOUD.user = uid ? { uid } : null;
    if (uid !== was) { clStopListen(); CLOUD.ref = null; CLOUD.refU = ''; }
    const S = TRO.s, cs = S && S.cs;
    if (uid) {
      clearTimeout(CLOUD.watchT); CLOUD.pop = false;
      if (cs && cs.u === uid) { CLOUD.mine = false; clResume(); return; }
      // (only the tab that asked links - another tab follows by its store; a sign-in finished after the watch gave up,
      // within 10 min of the tap, still counts)
      if (CLOUD.mine && Date.now() - CLOUD.askAt < CL_ASK_MS) { clLink(); return; }
      clSet(cs ? 'relog' : 'out');
      return;
    }
    // signed out (here or elsewhere): a linked store keeps playing as the account's copy until a sign-in again
    if (cs) { clSet('relog'); return; }
    if (CLOUD.st === 'in' || CLOUD.st === 'relog' || CLOUD.st === 'link') clSet('out');   // (load / auth: a sign-in is on its way)
  }
  // the tap on #pg-cloud-btn (label by state, 9.3)
  function clClick() {
    firstGesture();
    if (!CLOUD.on || CLOUD.outBusy) return;
    const st = CLOUD.st;
    if (st === 'in') { clSignOut(false); return; }
    if (st === 'frame' || st === 'inapp') { clOpenOutside(); return; }
    // (다시 열기: the popup again - the SDK cancels the one left open; not the very tap that opened it)
    if (st === 'auth' && CLOUD.pop) { if (Date.now() - CLOUD.authAt >= CL_RETAP_MS) clSignIn(); return; }
    if (st === 'load' || st === 'auth' || st === 'link' || st === 'nostore') return;
    clSignIn();
  }
  function clSignIn() {
    if (TRO.s && TRO.s.esc.length) { clMsg('held'); return; }
    clearTimeout(CLOUD.msgT); CLOUD.msg = null;            // (a new try: the last one's message is over)
    const how = clMethod();
    if (how === 'nostore' || how === 'inapp' || how === 'frame') { clSet(how); return; }
    CLOUD.mine = true; CLOUD.askAt = Date.now();
    if (CLOUD.auth) { clSignInGo(how); return; }
    const gen = CLOUD.gen;
    clSet('load');
    clLoad(1).then(() => { if (gen !== CLOUD.gen) return; clApp(); clSignInGo(how); }, () => {
      if (gen !== CLOUD.gen) return;
      CLOUD.mine = false; clSet(TRO.s && TRO.s.cs ? 'relog' : 'out'); clMsg('sdk');
    });
  }
  function clSignInGo(how) {
    const a = CLOUD.auth;
    let cu = null; try { cu = a.currentUser; } catch (e) { cu = null; }
    if (cu) { clAuthIn(cu); return; }                       // (already signed in: another tab did, or this tab before)
    if (how === 'redirect') { clRedirect(); return; }
    CLOUD.pop = true; CLOUD.authAt = Date.now(); clSet('auth');
    clWatch(CL_WATCH_MS);
    // (synchronously in the tap's handler when the SDK was in memory already: Safari opens the popup only then)
    let p; try { p = a.signInWithPopup(clProvider()); } catch (e) { clAuthFail(e); return; }
    Promise.resolve(p).then(() => { /* the observer links */ }, clAuthFail);
  }
  // the popup's watch: 'auth' back to 'out' (saying so) 2 min after the tap, or 20 s after this page is seen again (on a
  // phone the popup is a tab of its own: a player who came back without finishing it gets the button back). The sign-in
  // itself may still finish: clAuthIn links it (askAt)
  function clWatch(ms) {
    clearTimeout(CLOUD.watchT);
    CLOUD.watchAt = Date.now() + clT(ms);
    CLOUD.watchT = setTimeout(() => {
      if (stopped || CLOUD.st !== 'auth' || !CLOUD.pop) return;
      CLOUD.pop = false; clSet(TRO.s && TRO.s.cs ? 'relog' : 'out'); clMsg('late');
    }, clT(ms));
  }
  // the page is visible / focused again (visibilitychange, focus): a popup sign-in's watch shortens to 20 s
  function clBack() {
    if (!CLOUD.on || stopped || CLOUD.st !== 'auth' || !CLOUD.pop) return;
    if (CLOUD.watchAt - Date.now() > clT(CL_BACK_MS)) clWatch(CL_BACK_MS);
  }
  function clRedirect() {
    clMetaPut({ rd: Date.now() });
    CLOUD.pop = false; clSet('auth');
    const no = (e) => { clMetaPut({ rd: 0 }); clAuthFail(e); };
    try { Promise.resolve(CLOUD.auth.signInWithRedirect(clProvider())).catch(no); } catch (e) { no(e); }
  }
  // boot, a sign-in redirect coming back (meta.rd < 10 min old): the result links (the observer) and 내 기록 opens with its
  // message; a failure is said there too; a cancel (no user, no error) changes nothing
  function clRedirectBack() {
    const gen = CLOUD.gen;
    CLOUD.mine = true; CLOUD.askAt = Date.now(); clMetaPut({ rd: 0 });
    CLOUD.pop = false; clSet('auth');
    clLoad(1).then(() => { if (gen !== CLOUD.gen) return null; clApp(); return CLOUD.auth.getRedirectResult(); }).then((r) => {
      if (gen !== CLOUD.gen) return;
      let has = false; try { has = !!(r && r.user && typeof r.user.uid === 'string'); } catch (e) { has = false; }
      if (has) { clRecOpen(); return; }
      CLOUD.mine = false;
      if (CLOUD.st === 'auth') clSet(TRO.s && TRO.s.cs ? 'relog' : 'out');
    }, (e) => {
      if (gen !== CLOUD.gen) return;
      if (clSdkErr(e)) { CLOUD.mine = false; clSet(TRO.s && TRO.s.cs ? 'relog' : 'out'); clMsg('sdk'); } else clAuthFail(e);
      clRecOpen();
    });
  }
  function clRecOpen() { if (stopped) return; if (shownOverlay === 'login') LOGIN.rec = true; else if (shownOverlay === 'title') openRec(); }
  // a sign-in that did not work (4.3)
  function clAuthFail(e) {
    const code = String((e && e.code) || '');
    // (a newer popup of this tab replaced this one - 다시 열기 - and is on its way: nothing failed, nothing changes)
    if (code === 'auth/cancelled-popup-request') return;
    clearTimeout(CLOUD.watchT); CLOUD.pop = false;
    if (CLOUD.user && TRO.s && TRO.s.cs && TRO.s.cs.u === CLOUD.user.uid) return;   // (signed in meanwhile: nothing failed)
    const env = clEnv(), back = TRO.s && TRO.s.cs ? 'relog' : 'out';
    CLOUD.mine = false;
    if (/^auth\/(popup-closed-by-user|user-cancelled)$/.test(code)) { clSet(back); clMsg('cancel'); return; }
    if (code === 'auth/popup-blocked') {
      if (env.same) { CLOUD.mine = true; CLOUD.askAt = Date.now(); clRedirect(); return; }
      clSet(back); clMsg('popup'); return;
    }
    if (code === 'auth/operation-not-supported-in-this-environment' || code === 'auth/web-storage-unsupported') { clSet(clHere() ? 'nostore' : 'frame'); return; }
    if (code === 'auth/unauthorized-domain') { let hn = ''; try { hn = location.hostname; } catch (er) { hn = ''; } clSet(back); clMsg('domain', hn); return; }
    clSet(back);
    if (/^auth\/(operation-not-allowed|configuration-not-found|invalid-api-key|api-key)/.test(code)) clMsg('setup');
    else if (code === 'auth/user-disabled') clMsg('disabled');
    else if (code === 'auth/network-request-failed') clMsg(navigator.onLine === false ? 'offline' : 'fail');
    else clMsg('fail');
  }
  // sign-out (4.4): never with a hold open; unsaved trophies are pushed first (up to 4 s), and if they are still not
  // saved the line says so and a second tap (within 8 s) signs out anyway
  function clSignOut(force) {
    if (TRO.ro) { clMsg('newer'); return; }                 // (looks L0 6.7: a read-only page never writes the cloud's keys)
    if (TRO.s && TRO.s.esc.length) { clMsg('held'); return; }
    const armed = CLOUD.armed && Date.now() - CLOUD.armed < clT(CL_MSG_MS);
    if (force || armed || clDirty(troRead()) !== 'hard') { clSignOutNow(); return; }
    const gen = CLOUD.gen, t0 = Date.now();
    CLOUD.outBusy = true; clUI();
    CLOUD.holdUntil = Math.min(CLOUD.holdUntil, clNow()); clPush();
    const poll = () => {
      if (stopped || gen !== CLOUD.gen) return;
      if (clDirty(troRead()) !== 'hard') { CLOUD.outBusy = false; clSignOutNow(); return; }
      if (Date.now() - t0 >= clT(CL_FLUSH_MS)) { CLOUD.outBusy = false; CLOUD.armed = Date.now(); clMsg('dirty'); return; }
      setTimeout(poll, clT(100));
    };
    setTimeout(poll, clT(100));
  }
  function clSignOutNow() {
    CLOUD.armed = 0;
    // (gacha.md 3.8, the minimum of looks L0 6.7: a FORCED sign-out with unsaved changes parks the account's copy - the
    // next sign-in of that account here takes it back and pushes them; dropped, an offline draw was a free re-roll)
    if (TRO.ro) { clMsg('newer'); return; }               // (turned read-only while the sign-out waited for its push)
    const park = clDirty(troRead()) === 'hard';
    if (!clUnlink(park)) { clMsg('held'); return; }       // (a hold opened meanwhile, maybe in another tab: still signed in)
    CLOUD.mine = false;
    const a = CLOUD.auth;
    CLOUD.user = null; CLOUD.ref = null; CLOUD.refU = ''; CLOUD.err = ''; CLOUD.newer = false; CLOUD.fails = 0; CLOUD.holdUntil = 0; CLOUD.firstDirty = 0; CLOUD.nickOut = '';
    try { if (a) Promise.resolve(a.signOut()).catch(() => { /* the local part happened already */ }); } catch (e) { /* ignore */ }
    clSet('out'); clMsg(park ? 'outkeep' : 'out');
  }

  // ---- link, listen, push, adopt (6.3 - 6.7)
  // (late: our own deadline passed - the promise itself goes on and may still settle)
  const clWithin = (p, ms) => new Promise((res, rej) => {
    const t = setTimeout(() => rej({ code: 'deadline-exceeded', late: true }), clT(ms));
    Promise.resolve(p).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
  function clRef() {
    if (!CLOUD.db) CLOUD.db = CLOUD.app.firestore();
    const uid = CLOUD.user.uid;
    if (!CLOUD.ref || CLOUD.refU !== uid) { CLOUD.ref = CLOUD.db.collection('players').doc(uid); CLOUD.refU = uid; }
    return CLOUD.ref;
  }
  // the document is created (no document yet: this browser's store becomes the account's, one slot under the key k) or read
  function clCreateTx(k) {
    if (TRO.ro) return Promise.resolve({ ro: true });      // (looks L0 6.7: never a document from a read-only page's stale copy)
    const ref = clRef();
    return CLOUD.db.runTransaction((tx) => tx.get(ref).then((snap) => {
      if (snap.exists) return { data: snap.data() };
      if (TRO.ro) return { ro: true };
      // (v 2: the slot carries the store's coins and items, the document its worn set)
      const S = troRead(), slot = clUpload(S), nick = clNickOut(), ts = FV().serverTimestamp(), eq = looksOwned(looksParse(S.eq), S.own || []);
      tx.set(ref, Object.assign({ v: CL_V, dev: S.dev, s: { [k]: Object.assign({}, slot, { at: ts }) }, last: k, updatedAt: ts, eq }, nick ? { nick } : {}));
      return { k, slot, eq, at: { t: S.t, w: S.w, g: S.g, ko: S.ko, de: S.de, day: S.day, ce: S.ce | 0, sp: S.sp | 0, o: clItems(S.own), bd: S.bd | 0, bs: S.bs | 0, dn: S.dn | 0, gd: clPool(S.gd) } };
    }));
  }
  // first sign-in in the tab that asked (CLOUD.mine): cloud empty -> this browser's trophies are uploaded; cloud exists
  // -> the cloud wins (this browser's own store is put aside and comes back on sign-out). The upload's slot key is taken
  // first (clPending): a document that already holds it is this browser's own earlier upload whose answer was lost - the
  // link finishes as uploaded, never as a join (which would keep the same trophies here as well). A transaction past the
  // 15 s deadline goes on: its real answer still links (clLinkDone)
  function clLink() {
    if (CLOUD.linking) return CLOUD.linking;
    const u = CLOUD.user; if (!u) return Promise.resolve();
    if (TRO.ro) { CLOUD.mine = false; if (CLOUD.st === 'link' || CLOUD.st === 'auth') clSet(TRO.s && TRO.s.cs ? 'relog' : 'out'); clMsg('newer'); return Promise.resolve(); }   // (looks L0 6.7)
    const uid = u.uid, gen = CLOUD.gen, same = () => gen === CLOUD.gen && !!CLOUD.user && CLOUD.user.uid === uid;
    clSet('link');
    let tx = null, pk = '';
    const p = CLOUD.linking = clLoad(2).then(() => {
      if (!same()) return null;
      if (TRO.ro) { CLOUD.mine = false; clSet(TRO.s && TRO.s.cs ? 'relog' : 'out'); clMsg('newer'); return null; }
      clRef();
      // (another account's copy goes first - parked for that account, its unsaved part kept; this browser's own comes
      // back. Never under an open hold, maybe another tab's: signed in, not linked, 'held')
      if (TRO.s.cs && TRO.s.cs.u !== uid && !clUnlink(true)) { CLOUD.mine = false; clSet('relog'); clMsg('held'); return null; }
      if (TRO.s.cs && TRO.s.cs.u === uid) { CLOUD.mine = false; clResume(); return null; }   // (another tab linked meanwhile)
      if (TRO.s.esc.length) { CLOUD.mine = false; clSet('out'); clMsg('held'); return null; } // (signed in, not linked: the next tap links)
      // (this account's own copy, parked here earlier: back as it was - the listener adopts the account, the push sends the rest)
      if (clRestore(uid)) { CLOUD.mine = false; clMetaPut({ pk: '', pu: '' }); clResume(); return null; }
      pk = clPending(uid); tx = clCreateTx(pk);
      return clWithin(tx, CL_LINK_MS).then((res) => { if (same()) clLinkDone(res, uid, pk); });
    }).catch((e) => {
      if (!same()) return;
      // (stay signed in, not linked: CLOUD.mine stays, so 'online' or the next tap tries again)
      const code = String((e && e.code) || '');
      clSet('out');
      clMsg(clSdkErr(e) ? 'sdk' : code === 'permission-denied' ? 'setup' : navigator.onLine === false ? 'offline' : 'fail');
      if (tx && e && e.late) tx.then((res) => { if (same() && !CLOUD.linking && !(TRO.s && TRO.s.cs)) clLinkDone(res, uid, pk); }, () => { /* it failed after all */ });
    }).then(() => { if (CLOUD.linking === p) CLOUD.linking = null; });
    return p;
  }
  // the link transaction's answer (in time or late): made (my store uploaded under pk), or the document as it was -
  // holding pk (my own lost upload) or not (cloud wins: join). Every store swap re-checks inside its troMut: another
  // tab linked meanwhile (its record stands) or opened a hold (never joined under a hold: 'held')
  function clLinkDone(res, uid, pk) {
    CLOUD.mine = false;
    // (looks L0 6.7: a page read-only by now neither joins nor uploads - nothing written)
    if (TRO.ro || (res && res.ro)) { if (CLOUD.st === 'link') clSet(TRO.s && TRO.s.cs ? 'relog' : 'out'); clMsg('newer'); return; }
    let how = '', had = 0, now = 0, D = null;
    if (res && res.data !== undefined) {
      D = clDoc(res.data);
      if (D === 'newer') { CLOUD.newer = true; clSet('out'); clMsg('newer'); return; }
      if (!D) { clSet('out'); clMsg('fail'); return; }
      const own = D.s.get(pk);
      troMut((S) => {
        if (S.cs) { how = 'other'; return; }
        if (own) {
          // (my part = this whole store: the slot is what it was when uploaded, the view moved on from that since)
          const m = Object.assign({}, own); delete m.at;
          const c = clCnt(m);
          S.cs = clAdopt(S, { u: uid, k: pk, c, v: Object.assign({}, c), m, n: m.n, mt: clNow() }, D, clHi(), false, false);
          how = 'up'; now = own.t; return;
        }
        if (S.esc.length) { how = 'held'; return; }
        const o = Object.assign({}, S); delete o.cs;
        sset(clGuestKey(), JSON.stringify(o));
        had = S.t;
        S.cs = clAdopt(S, { u: uid, k: clNewKey(), c: null, v: null, m: clZero(), n: 0, mt: 0 }, D, clHi(), true, false);
        now = S.t; how = 'join';
      });
    } else if (!res || !res.slot) { clSet('out'); clMsg('fail'); return; }
    else {
      troMut((S) => {
        if (S.cs) { how = 'other'; return; }
        S.cs = { u: uid, k: res.k, c: clCnt(res.slot), v: res.at, m: Object.assign({}, res.slot), n: 1, mt: clNow(), ev: res.eq || '' };
        how = 'up'; now = res.slot.t;
      });
    }
    if (how === 'held') { clSet('out'); clMsg('held'); return; }
    clMetaPut({ pk: '', pu: '' });
    if (how === 'other') { if (TRO.s.cs && TRO.s.cs.u === uid) clResume(); else clSet('relog'); return; }
    if (how === 'up') sset(clGuestKey(), '');
    if (D) { CLOUD.doc = D; clHiIn(D); clNickIn(D); }
    clListen(); clSet('in');
    if (how === 'up') clMsg('up', now); else if (had > now) clMsg('swap', now, had); else clMsg('got', now);
    clKick();
  }
  // this browser is linked to the signed-in account: listen and push
  function clResume() {
    const gen = CLOUD.gen;
    if (CLOUD.st !== 'in') clSet('in');
    clLoad(2).then(() => {
      if (gen !== CLOUD.gen || !CLOUD.user || !TRO.s.cs || TRO.s.cs.u !== CLOUD.user.uid) return;
      clRef(); clListen(); clKick();
    }, () => { clUI(); clBadge(); });                         // (offline / blocked: the mark says wait; 'online' retries)
  }
  function clListen() {
    if (CLOUD.unsub || !CLOUD.user) return;
    const ref = clRef(), gen = CLOUD.gen;
    CLOUD.live = false;
    try {
      CLOUD.unsub = ref.onSnapshot({ includeMetadataChanges: true }, (snap) => { if (gen === CLOUD.gen) clSnap(snap); }, (e) => { if (gen === CLOUD.gen) clSnapErr(e); });
    } catch (e) { CLOUD.unsub = null; }
  }
  function clStopListen() {
    if (CLOUD.unsub) { try { CLOUD.unsub(); } catch (e) { /* ignore */ } CLOUD.unsub = null; }
    CLOUD.live = false; CLOUD.doc = null;
    clearTimeout(CLOUD.pushT); CLOUD.pushT = 0;
  }
  // every snapshot of every device (this one's echoes too) is adopted; adopting twice changes nothing
  function clSnap(snap) {
    const S0 = TRO.s; if (!S0 || !S0.cs || !CLOUD.user || S0.cs.u !== CLOUD.user.uid) return;
    let meta = null; try { meta = snap.metadata || {}; } catch (e) { meta = {}; }
    if (!meta.fromCache) CLOUD.live = true;
    if (!snap.exists) { if (!meta.fromCache && S0.cs.m.n > 0) clRecreate(); clUI(); clBadge(); return; }
    let raw = null; try { raw = snap.data({ serverTimestamps: 'estimate' }); } catch (e) { raw = null; }
    const D = clDoc(raw);
    if (D === 'newer') { CLOUD.newer = true; clSet('in'); return; }
    if (!D) return;
    CLOUD.doc = D;
    if (CLOUD.err === 'full' && (D.s.has(S0.cs.k) || clBrowsers(D) < CL_MAXS)) { CLOUD.err = ''; CLOUD.holdUntil = 0; }
    troMut((S) => { if (S.cs && CLOUD.user && S.cs.u === CLOUD.user.uid) S.cs = clAdopt(S, S.cs, D, clHi(), false, !!meta.hasPendingWrites); });
    clHiIn(D); clNickIn(D);
  }
  // a listen that failed is over (the SDK retries network trouble by itself and says nothing): refused -> sign in again
  // (signed out elsewhere, rules changed); anything else -> listen again in 5 s
  function clSnapErr(e) {
    CLOUD.unsub = null; CLOUD.live = false;
    if (String((e && e.code) || '') === 'permission-denied') { clSet('relog'); return; }
    const gen = CLOUD.gen;
    setTimeout(() => { if (gen === CLOUD.gen && CLOUD.st === 'in' && !CLOUD.unsub) clListen(); }, clT(CL_RETRY_MS));
    clUI(); clBadge();
  }
  // may this tab write now? (signed in as the store's account, nothing in flight, no newer schema, no open hold here: a
  // hold is settled within minutes, and pushing it first would only be undone by the refund)
  function clCanPush() {
    const S = TRO.s, u = CLOUD.user;
    return CLOUD.on && !stopped && CLOUD.st === 'in' && !!u && !!S && !!S.cs && S.cs.u === u.uid && !!CLOUD.ref && !CLOUD.push && !CLOUD.newer && !troOpenHere();
  }
  // after every change here or in another tab (troSync), saveHi, 'online' and every write: (re)schedule the one timer.
  // A count waits 4 s after the last change (20 s at most after the first), a best / score 60 s, all after holdUntil
  function clKick() {
    if (!CLOUD.on || stopped) return;
    const S = TRO.s;
    // (the link went away under a listener: another tab signed out, the store was reset)
    if (CLOUD.unsub && (!S || !S.cs || !CLOUD.user || S.cs.u !== CLOUD.user.uid)) { clStopListen(); if (CLOUD.st === 'in') clSet('out'); return; }
    if (!clCanPush()) return;               // (no timer: the next change, an answer, a hold closing or 'online' kicks again)
    const d = clDirty(S) || (CLOUD.nickOut ? 'nick' : '') || (clEqOut(S, null) ? 'eq' : '');
    clearTimeout(CLOUD.pushT); CLOUD.pushT = 0;
    if (!d) { if (CLOUD.firstDirty) { CLOUD.firstDirty = 0; clUI(); clBadge(); } return; }
    const now = clNow(), soft = d === 'soft';
    if (!CLOUD.firstDirty) CLOUD.firstDirty = now;
    const due = Math.max(CLOUD.holdUntil, Math.min(now + (soft ? CL_SOFT_MS : CL_PUSH_MS), CLOUD.firstDirty + (soft ? CL_SOFT_MS : CL_PUSH_MAX_MS)));
    CLOUD.pushT = setTimeout(clPush, clT(Math.max(0, due - now)));
    if (!soft) clUILater(CLOUD.firstDirty + CL_SLOW_MS - now);
  }
  function clPush() {
    clearTimeout(CLOUD.pushT); CLOUD.pushT = 0;
    if (!clCanPush()) return;
    const S = troRead(), cs = S.cs, uid = CLOUD.user.uid;
    if (!cs || cs.u !== uid) return;
    const now = clNow();
    if (now < CLOUD.holdUntil) { clKick(); return; }
    const d = clDirty(S), nick = CLOUD.nickOut && (!CLOUD.doc || CLOUD.doc.nick !== CLOUD.nickOut) ? CLOUD.nickOut : '';
    if (!d && !nick && !clEqOut(S, null)) { CLOUD.nickOut = ''; CLOUD.firstDirty = 0; clUI(); clBadge(); return; }
    // a new slot in a full document: an idle one is folded first (6.7)
    if (d && cs.m.n === 0 && CLOUD.doc && !CLOUD.doc.s.has(cs.k) && clBrowsers(CLOUD.doc) >= CL_MAXS) { clFold(); return; }
    const st = d ? clStep(clMine(S, cs, clHi()), cs.m, cs.n, now, cs.mt) : null;
    if (st && st.wait) { CLOUD.holdUntil = now + st.wait; clKick(); return; }
    // (v4 shop: the worn set goes with a slot write, or alone like the nick - only once the account owns every item in
    // it, clEqOut)
    const eq = clEqOut(S, st ? st.slot : null);
    if (!st && !nick && !eq) { CLOUD.firstDirty = 0; return; }
    // (a nick / worn set alone: not within 2 s of my own last write either - the rules take one write per 2 s per document)
    if (!st && cs.m.n && now - cs.mt < CL_GAP_MS) { CLOUD.holdUntil = cs.mt + CL_GAP_MS; clKick(); return; }
    const gen = CLOUD.gen, k = cs.k, slot = st ? st.slot : null;
    CLOUD.push = true;
    // (my write counter is taken in the shared store BEFORE the write goes: a second tab takes a higher one, and a
    // duplicate is refused by the rules - never a stale overwrite)
    if (slot) troMut((S2) => { if (S2.cs && S2.cs.k === k) S2.cs.n = Math.max(S2.cs.n, slot.n); });
    const ts = FV().serverTimestamp(), upd = { updatedAt: ts };
    if (slot) { upd['s.' + k] = Object.assign({}, slot, { at: ts }); upd.last = k; }
    // (an older document becomes v 3 with this page's first slot OR worn-set write; the rules check eq's length on every
    // write to a v >= 3 document, so the upgrade always carries 30 characters when the document has an eq at all - its
    // own set copied to all six, or bare for an unreadable one)
    const up = !!CLOUD.doc && CLOUD.doc.v < CL_V && (!!slot || !!eq);
    if (up) upd.v = CL_V;
    if (nick) upd.nick = nick;
    if (eq) upd.eq = eq;
    else if (up && CLOUD.doc.hasEq) upd.eq = CLOUD.doc.eq || LOOKS0;
    clUI(); clBadge();
    let p; try { p = CLOUD.ref.update(upd); } catch (e) { p = Promise.reject(e); }
    Promise.resolve(p).then(() => {
      if (gen !== CLOUD.gen) return;
      CLOUD.push = null; CLOUD.fails = 0; if (CLOUD.err === 'quota') CLOUD.err = '';
      if (nick && CLOUD.nickOut === nick) CLOUD.nickOut = '';
      if (upd.v && CLOUD.doc) CLOUD.doc.v = upd.v;
      // (acknowledged: what the server has now, and when that arrived - a partial write leaves the rest dirty: the kick
      // from this troMut sends it once the rules allow; the worn set sent is the one in step now)
      if (slot || eq) troMut((S3) => {
        if (!S3.cs || S3.cs.u !== uid || S3.cs.k !== k) return;
        if (slot && slot.n > S3.cs.m.n) { S3.cs.m = Object.assign({}, slot); S3.cs.mt = clNow(); }
        if (eq) { S3.cs.ev = eq; if (CLOUD.doc) CLOUD.doc.eq = eq; }
      });
      clKick(); clUI(); clBadge();
    }, (e) => {
      if (gen !== CLOUD.gen) return;
      CLOUD.push = null; clPushFail(e); clKick(); clUI(); clBadge();
    });
  }
  // a refused / failed write (never a console message): back off and try again; a missing document is made again
  function clPushFail(e) {
    const code = String((e && e.code) || ''), now = clNow();
    if (code === 'not-found') { clRecreate(); return; }
    if (code === 'resource-exhausted') { CLOUD.err = 'quota'; CLOUD.holdUntil = now + CL_QUOTA_MS; return; }
    if (code === 'unauthenticated') { clSet('relog'); return; }
    if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'aborted') { CLOUD.holdUntil = now + CL_RETRY_MS; return; }
    // (permission-denied: a refused step, a racing tab, the 2 s per document; anything else the same way)
    CLOUD.holdUntil = now + CL_BACKOFF[Math.min(CLOUD.fails, CL_BACKOFF.length - 1)]; CLOUD.fails++;
  }
  // the document is gone though this browser had written (the owner reset or deleted it): made again from the view as
  // one fresh slot. (An owner who wants a player gone disables the user in Authentication instead)
  function clRecreate() {
    if (CLOUD.push === 're' || !CLOUD.user || !CLOUD.db) return;
    const uid = CLOUD.user.uid, gen = CLOUD.gen;
    CLOUD.push = 're';
    clCreateTx(clNewKey()).then((res) => {
      if (gen !== CLOUD.gen) return;
      CLOUD.push = null;
      if (res && res.data === undefined) troMut((S) => { if (S.cs && S.cs.u === uid) S.cs = { u: uid, k: res.k, c: clCnt(res.slot), v: res.at, m: Object.assign({}, res.slot), n: 1, mt: clNow(), ev: res.eq || '' }; });
      else clKick();                                        // (another device made it again first: its snapshot is adopted)
    }, (e) => {
      if (gen !== CLOUD.gen) return;
      CLOUD.push = null;
      CLOUD.holdUntil = clNow() + CL_BACKOFF[Math.min(CLOUD.fails, CL_BACKOFF.length - 1)]; CLOUD.fails++;
      if (String((e && e.code) || '') === 'resource-exhausted') CLOUD.err = 'quota';
      clKick();
    });
  }
  // 6.7: before a NEW slot's first write into a document with 16 browser slots, the oldest one idle for 8 days (the rules
  // say 7: a day for clock differences) goes into the archive '_' (sums and bests exactly as the rules check); none ->
  // 'full': this browser plays on locally
  function clFold() {
    const ref = CLOUD.ref, mineK = TRO.s.cs.k, gen = CLOUD.gen, now = clNow();
    CLOUD.push = true; clUI();
    CLOUD.db.runTransaction((tx) => tx.get(ref).then((snap) => {
      if (!snap.exists) return { r: 'gone' };
      const D = clDoc(snap.data());
      if (!D || D === 'newer') return { r: 'bad' };
      if (D.s.has(mineK) || clBrowsers(D) < CL_MAXS) return { r: 'room' };
      let pick = null;
      for (const [k, x] of D.s) if (k !== '_' && k !== mineK && x.at > 0 && x.at < now - CL_FOLD_MS && (!pick || x.at < pick[1].at)) pick = [k, x];
      if (!pick) return { r: 'full' };
      const a = D.s.get('_') || clZero(), b = pick[1], ts = FV().serverTimestamp();
      const z = { t: a.t + b.t, w: a.w + b.w, g: a.g + b.g, ko: a.ko + b.ko, best: Math.max(a.best, b.best), bl: Math.max(a.bl, b.bl),
        seen: Math.max(a.seen, b.seen), hi: Math.max(a.hi, b.hi), day: 0, de: 0, n: a.n + 1, at: ts };
      // (v4 shop: in a v 2 document the archive is v 2 too - coins summed, items the union, no bonus day: a slot is folded
      // after a week quiet; a v 1 document keeps its v 1 archive)
      if (D.v >= 2) Object.assign(z, { ce: a.ce + b.ce, sp: a.sp + b.sp, o: clItems(a.o.concat(b.o)), bd: 0, bs: 0 });
      // (v 4: the archive's draws are the sum, its drawn items the union - slotShape3 there, else every fold is refused)
      if (D.v >= 4) Object.assign(z, { dn: (a.dn | 0) + (b.dn | 0), gd: clPool((a.gd || []).concat(b.gd || [])) });
      tx.update(ref, { ['s.' + pick[0]]: FV().delete(), 's._': z, last: pick[0], updatedAt: ts });
      return { r: 'folded', k: pick[0] };
    })).then((res) => {
      if (gen !== CLOUD.gen) return;
      CLOUD.push = null;
      if (res.r === 'full') { CLOUD.err = 'full'; CLOUD.holdUntil = clNow() + CL_FULL_MS; }
      else { if (res.k && CLOUD.doc) CLOUD.doc.s.delete(res.k); CLOUD.holdUntil = clNow() + CL_GAP_MS; }   // (2 s per document)
      clKick(); clUI(); clBadge();
    }, (e) => {
      if (gen !== CLOUD.gen) return;
      CLOUD.push = null; clPushFail(e); clKick(); clUI(); clBadge();
    });
  }
  // sign-out / another account: this browser's own store comes back (the put-aside one, else a fresh store with the gift);
  // the account's copy goes from this browser (it is in the cloud) - or, for another account signing in over it (park),
  // is parked for its own next sign-in here (clPark: what it had not pushed is not lost). Never with a hold open (checked
  // in the same read-modify-write: another tab may have opened one meanwhile) -> false, nothing changed
  // (looks L0 6.7: the soft cap is per browser and day, whichever store is active - the store coming back takes the
  // leaving store's day count, so a sign-out -> sign-in never restarts the 400-coin day)
  function clDayCarry(from, to) {
    if (from.cd > to.cd) { to.cd = from.cd; to.cde = from.cde; } else if (from.cd === to.cd) to.cde = Math.max(to.cde, from.cde);
  }
  function clUnlink(park) {
    if (TRO.ro) { clMsg('newer'); return false; }          // (looks L0 6.7: the put-aside store is never erased from here)
    let done = false;
    troMut((S) => {
      if (S.esc.length) return;
      if (park && S.cs) clPark(S);
      const g = troParse(sget(clGuestKey()) || ''), back = g && g !== 'newer' ? g : troFresh();
      clDayCarry(S, back);
      for (const k of Object.keys(S)) delete S[k];
      Object.assign(S, back); delete S.cs;
      done = true;
    });
    if (!done) return false;
    clStopListen();
    sset(clGuestKey(), '');
    return true;
  }
  // this account's parked copy comes back (clLink, before anything is uploaded or joined): this browser's own store is
  // put aside as for a join; false = none, or the store changed meanwhile (linked by another tab, a hold) - kept parked
  function clRestore(uid) {
    if (TRO.ro) return false;                              // (looks L0 6.7)
    const P = clParked(uid, false); if (!P) return false;
    let done = false;
    troMut((S) => {
      if (S.cs || S.esc.length) return;
      const own = Object.assign({}, S); delete own.cs;
      sset(clGuestKey(), JSON.stringify(own));
      clDayCarry(S, P);
      for (const k of Object.keys(S)) delete S[k];
      Object.assign(S, P); done = true;
    });
    if (done) clParked(uid, true);
    return done;
  }
  // the in-game nick changed (netSetNick): it goes to the account with the next write (alone if nothing else is dirty)
  function clNickSet(n) {
    if (!CLOUD.on || !TRO.s || !TRO.s.cs) return;
    const v = cleanNick(n);
    if (!v || CL_NICK_DEF.test(v)) return;
    CLOUD.nickOut = v; clKick();
  }
  // the hidden page / pagehide: what is dirty goes now if allowed (best effort: a write cut off by the page closing is
  // re-sent by the next load - the values are absolute)
  function clFlush() { if (clCanPush() && clDirty(TRO.s) === 'hard') clPush(); }
  function clOnline() {
    if (!CLOUD.on || stopped) return;
    const S = TRO.s;
    if (S && S.cs && !CLOUD.auth) { clLoad(1).then(() => { if (!clApp() && CLOUD.auth) clAuthIn(CLOUD.auth.currentUser); }, () => { /* still offline */ }); }
    else if (CLOUD.user && S && !S.cs && CLOUD.mine) clLink();
    else if (CLOUD.user && S && S.cs && S.cs.u === CLOUD.user.uid && !CLOUD.unsub) clResume();
    if (CLOUD.holdUntil > clNow() && !CLOUD.err) CLOUD.holdUntil = 0;   // (a back-off for the network: try at once)
    clKick(); clUI(); clBadge();
  }
  // another tab changed the store (after troRead + troSync): it linked -> load / resume here too; it signed out -> 'out'
  function clStore() {
    if (!CLOUD.on || stopped) return;
    // (looks L0 6.7: a newer page wrote this browser's store - read-only now: stop listening (clCanPush refuses with
    // CLOUD.newer), say so; nothing of the cloud's is written from here again)
    if (TRO.ro) { if (!CLOUD.newer) { clStopListen(); CLOUD.newer = true; clMsg('newer'); } clUI(); clBadge(); return; }
    const S = TRO.s;
    if (S && S.cs) {
      if (!CLOUD.auth) { if (CLOUD.st === 'out') clSet('in'); clLoad(1).then(() => { if (!clApp() && CLOUD.auth) clAuthIn(CLOUD.auth.currentUser); }, () => { clUI(); clBadge(); }); return; }
      if (CLOUD.user && S.cs.u === CLOUD.user.uid && !CLOUD.unsub && !CLOUD.linking) clResume();
    } else if (CLOUD.st === 'in' || CLOUD.st === 'relog') { clStopListen(); clSet('out'); }
  }
  // boot (after setupDOM) and every test namespace: off unless CLOUD.on; no sign-in on this page (a frame, a shared host),
  // storage blocked, an in-app browser (unless already linked) -> that state at once, nothing loaded; a linked store ->
  // 'in' (marked wait) and the SDK after the first frame; a sign-in redirect coming back; else 'out', nothing loaded
  function clBoot() {
    if (!CLOUD.on) return;
    const S = TRO.s, now = Date.now(), how = clMethod();
    if (how === 'frame' || how === 'nostore' || (how === 'inapp' && (!(S && S.cs) || TRO.mem || TRO.ro))) { clSet(how); return; }
    const rd = nNum(clJson(clMetaKey()).rd, 0, 9e15, 0);
    const back = rd > 0 && now - rd < CL_RD_MS && rd - now < 60000;
    if (rd && !back) clMetaPut({ rd: 0 });
    clSet(S && S.cs ? 'in' : 'out');
    if (back) { clRedirectBack(); return; }
    if (!S || !S.cs) return;
    const gen = CLOUD.gen;
    const go = () => {
      if (stopped || gen !== CLOUD.gen) return;
      clLoad(1).then(() => { if (gen === CLOUD.gen && !clApp() && CLOUD.auth) clAuthIn(CLOUD.auth.currentUser); }, () => { clUI(); clBadge(); });
    };
    setTimeout(() => { if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(go, { timeout: 1500 }); else go(); }, 500);
  }
  // a test namespace / PG.debug.cloud.reboot: everything per page load starts over (the SDK objects stay)
  function clReboot() {
    if (!CLOUD.on) return;
    clStop(true);
    CLOUD.gen++;
    Object.assign(CLOUD, { st: 'out', msg: null, mine: false, askAt: 0, pop: false, watchAt: 0, push: null, firstDirty: 0, holdUntil: 0, fails: 0, newer: false, err: '', doc: null,
      live: false, linking: null, nickOut: '', armed: 0, outBusy: false, user: null, ref: null, refU: '', opened: '' });
    clBoot(); clUI(); clBadge();
  }
  // stopEngine: the listener, the timers (and the auth observer unless a reboot keeps it)
  function clStop(keepAuth) {
    clearTimeout(CLOUD.pushT); clearTimeout(CLOUD.uiT); clearTimeout(CLOUD.msgT); clearTimeout(CLOUD.watchT);
    CLOUD.pushT = 0;
    if (CLOUD.unsub) { try { CLOUD.unsub(); } catch (e) { /* ignore */ } CLOUD.unsub = null; }
    if (!keepAuth && CLOUD.authUn) { try { CLOUD.authUn(); } catch (e) { /* ignore */ } CLOUD.authUn = null; }
  }

  // ---- UI (9): #pg-tro-cloud (the pixel cloud on the title badge), #pg-cloud / #pg-cloud-tx (one status line in 내 기록),
  // #pg-cloud-btn (in 내 기록's button row, before 닫기). All hidden in the markup: shown only while CLOUD.on
  const CL_ERRS = { popup: 1, frame: 1, inapp: 1, nostore: 1, fail: 1, sdk: 1, domain: 1, setup: 1, disabled: 1, held: 1, relog: 1, dirty: 1, quota: 1, newer: 1, full: 1, offline: 1, late: 1 };
  // (messages that stay until 내 기록 closes: the first sign-in that shows the account's count instead of this browser's)
  const CL_KEEP = { swap: 1 };
  function clSet(st) {
    if (!CLOUD.on) return;
    if (st === 'in' && CLOUD.st !== 'in') { CLOUD.inAt = clNow(); clUILater(CL_SLOW_MS); }
    CLOUD.st = st;
    clUI(); clBadge();
    palCloud();                                  // (친구 순위, design/friends.md: this account's card follows)
  }
  // a message: replaces the line for 8 s from when 내 기록 shows it (one pending while it is closed; CL_KEEP ones until
  // 내 기록 closes - clRecShut)
  function clMsg(key, a, b) {
    if (!CLOUD.on || !CL_TX[key]) return;
    const txt = CL_TX[key].replace('{0}', a === undefined ? '' : typeof a === 'number' ? a.toLocaleString('ko-KR') : String(a))
      .replace('{1}', b === undefined ? '' : typeof b === 'number' ? b.toLocaleString('ko-KR') : String(b));
    clearTimeout(CLOUD.msgT);
    CLOUD.msg = { key, txt, err: !!CL_ERRS[key], at: 0, keep: !!CL_KEEP[key] };
    clUI();
  }
  // 내 기록 closed (showOverlay): a kept message that was shown is over
  function clRecShut() { if (CLOUD.on && CLOUD.msg && CLOUD.msg.keep && CLOUD.msg.at) { CLOUD.msg = null; clUI(); } }
  function clUILater(ms) {
    if (!CLOUD.on || !(ms > 0)) return;
    clearTimeout(CLOUD.uiT); CLOUD.uiT = setTimeout(() => { if (!stopped) { clUI(); clBadge(); } }, clT(ms) + 20);
  }
  // the 'wait' look: offline, a count unsaved for 10 s, or no word from the server for 10 s
  function clSlow() {
    if (navigator.onLine === false) return true;
    const now = clNow();
    if (CLOUD.firstDirty && now - CLOUD.firstDirty >= CL_SLOW_MS && clDirty(TRO.s) === 'hard') return true;
    return !CLOUD.live && now - CLOUD.inAt >= CL_SLOW_MS;
  }
  function clLine() {
    switch (CLOUD.st) {
      case 'in':
        if (CLOUD.newer) return ['newer', 'is-err'];
        if (CLOUD.err) return [CLOUD.err, 'is-err'];
        if (CLOUD.push || CLOUD.outBusy) return ['pushing', 'is-in'];
        if (clSlow()) return [navigator.onLine === false ? 'offline' : 'wait', ''];
        return ['ok', 'is-in'];
      case 'relog': case 'inapp': case 'nostore': return [CLOUD.st, 'is-err'];
      // (no sign-in here: the game's own page if there is one - where this frame's storage is refused too, say what it brings)
      case 'frame': return [!clOutsideUrl() ? 'frame0' : TRO.mem || TRO.ro ? 'framens' : 'frame', 'is-err'];
      case 'auth': return CLOUD.pop ? ['authing', 'is-msg'] : ['linking', ''];
      case 'link': return ['linking', ''];
      default: return CLOUD.newer ? ['newer', 'is-err'] : ['pitch', ''];   // (signed in to a newer page's record: not linked)
    }
  }
  // the line's text, each ' · ' part an inline-block of its own (a 2-line message breaks between its parts, not inside
  // one, while a part too long for a line still wraps inside itself); the pixel cloud starts the first part
  function clLineTxt(tx, txt) {
    if (tx._t === txt) return;
    tx._t = txt; tx.textContent = '';
    const ic = CLOUD.ic, parts = String(txt).split(' · ');
    if (parts.length < 2) { if (ic) tx.appendChild(ic); tx.appendChild(document.createTextNode(txt)); return; }
    parts.forEach((p, i) => {
      const c = h('span', 'pg-cloud-c');
      if (!i && ic) c.appendChild(ic);
      c.appendChild(document.createTextNode(p + (i < parts.length - 1 ? ' ·' : '')));
      if (i) tx.appendChild(document.createTextNode(' '));
      tx.appendChild(c);
    });
  }
  function clUI() {
    if (shownOverlay === 'login') lgUI();      // (the login screen follows the same state)
    if (shownOverlay === 'friends') ngUI();    // (... and 친구와 하기's sign-in card, design/friends.md "As built (invites)")
    if (dom.recCard) dom.recCard.classList.toggle('has-cloud', CLOUD.on);
    const btn = dom.cloudBtn, line = dom.cloud, tx = dom.cloudTx;
    if (!CLOUD.on || !btn || !line || !tx) return;
    const st = CLOUD.st, M = CLOUD.msg;
    if (M && !M.at && shownOverlay === 'rec') {
      M.at = Date.now();
      clearTimeout(CLOUD.msgT);
      if (!M.keep) CLOUD.msgT = setTimeout(() => { if (CLOUD.msg === M) { CLOUD.msg = null; clUI(); } }, clT(CL_MSG_MS));
    }
    let txt, cls = 'pg-cloud';
    if (M && M.at) { txt = M.txt; cls += M.err ? ' is-err' : ' is-msg'; }
    else { const [k, c] = clLine(); txt = CL_TX[k]; if (c) cls += ' ' + c; }
    clLineTxt(tx, txt);
    if (line.className !== cls) line.className = cls;
    line.hidden = st === 'off';
    // ('auth' by popup: 다시 열기, tappable - the Google window may be a tab the player left without finishing)
    const again = st === 'auth' && CLOUD.pop;
    const lbl = again ? CL_BTN.again : CL_BTN[st] || '', busy = st === 'load' || st === 'link' || (st === 'auth' && !again) || CLOUD.outBusy;
    btn.hidden = !lbl || ((st === 'inapp' || st === 'frame') && !clOutsideUrl());
    setTxt(btn, lbl);
    // (aria-disabled, not disabled: the focused button keeps the focus through a sign-in / sign-out)
    btn.setAttribute('aria-disabled', busy ? 'true' : 'false');
    if (busy) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
    const aria = st === 'out' ? '구글로 로그인 · 트로피를 구글 계정에 저장해요' : again ? '구글 로그인 창 다시 열기' : '';
    if (aria) btn.setAttribute('aria-label', aria); else btn.removeAttribute('aria-label');
  }
  // the badge's mark (plain mint: saved; dim: waiting; pink: cannot save - a lost session included: nothing is saved
  // until a sign-in) and its words in the badge's aria-label
  function clBadge() {
    const el = dom.troCloud, b = dom.tro;
    let on = false, cls = '', st = '';
    if (CLOUD.on) {
      st = CLOUD.st;
      if (st === 'link') { on = true; cls = ' is-wait'; }
      else if (st === 'relog') { on = true; cls = ' is-err'; }
      else if (st === 'in') { on = true; cls = CLOUD.newer || CLOUD.err ? ' is-err' : !CLOUD.live || clSlow() ? ' is-wait' : ''; }
    }
    if (el) { el.hidden = !on; const c = 'pg-tro-cloud' + cls; if (el.className !== c) el.className = c; }
    if (b) b.classList.toggle('has-cloud', on);
    const word = !on ? '' : st === 'relog' ? ' · 다시 로그인해 주세요' : cls === ' is-err' ? ' · 지금은 저장할 수 없어요' : cls ? ' · 저장 대기 중' : ' · 구글 계정에 저장 중';
    if (b && typeof b._aria === 'string') b.setAttribute('aria-label', b._aria + word);
  }
  // setupDOM (and PG.debug.cloud.start): the font warm-up gets every cloud string, the card its has-cloud, the line's
  // pixel cloud goes into the text (clLineTxt places it)
  function clSetupDOM() {
    if (!CLOUD.on) return;
    try { for (const q of ['.pg-fw-body', '.pg-fw-sign']) { const fw = document.querySelector('#pg-fontwarm ' + q); if (fw && fw.textContent.indexOf(CL_BTN.out) < 0) fw.textContent += ' ' + CLOUD_TEXT; } } catch (e) { /* ignore */ }
    if (!CLOUD.ic && dom.cloud) CLOUD.ic = dom.cloud.querySelector('.pg-cloud-ic');
    if (dom.cloudTx) dom.cloudTx._t = null;
    clUI(); clBadge();
  }
  // 내 기록 opened: the SDK's first two files load now (the sign-in tap then opens the popup straight away)
  function clWarm() {
    if (!CLOUD.on || CLOUD.st !== 'out' || CLOUD.auth) return;
    const gen = CLOUD.gen;
    clLoad(1).then(() => { if (gen === CLOUD.gen) clApp(); }, () => { /* the tap tries again and says so */ });
  }

  // ---- the login screen (design/cloud-trophies.md "As built (login screen)"): on the deploy with the cloud on - and on a
  // PR preview, its Google button off - a browser that is not linked and never chose to play as a guest sees it before
  // the title. Made here (the artifact's markup has none of it); nothing at all without the cloud or a preview
  const PREVIEW = (() => { let v = ''; try { v = window.PG_PREVIEW; } catch (e) { v = ''; } return typeof v === 'string' && /^[1-9]\d{0,6}$/.test(v) ? v : ''; })();
  // (the screen is the bathhouse's front desk: a greeting, the six regulars soaking in the tub, two ways in - no
  // explanation; the line under the buttons speaks only when the sign-in has something to say)
  const LG_TX = { why: '어서 오세요, 손님!', go: 'Google로 계속하기', guest: '손님으로 입장하기', note: '', pv: '미리보기에서는 로그인을 할 수 없어요' };
  const LOGIN_TEXT = Object.keys(LG_TX).map((k) => LG_TX[k]).join(' ') + ' ' + CL_TX.authing + ' ' + CL_TX.linking;
  const LOGIN = { el: null, go: null, goTx: null, guest: null, st: null, rec: false, inUI: false };
  // (Google's four-colour "G", unaltered, on its own white disc - Google's sign-in branding; static markup only; also on
  // 친구와 하기's sign-in card)
  const GOOGLE_G = '<svg viewBox="0 0 48 48" width="18" height="18"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>'
    + '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>'
    + '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>'
    + '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  const lgOn = () => CLOUD.on || !!PREVIEW;
  // the guest choice ('1'), per test namespace like the store's keys (a preview's Storage adds its own suffix)
  const lgKey = () => 'ppogeul-login' + clSfx();
  // at load: show it? (an invite link goes straight to 친구와 하기; no storage: nothing could be remembered or linked;
  // a frame with nowhere to go and no sign-in here: nothing to offer)
  function lgWanted() {
    if (!lgOn() || NET.joinLink || TRO.mem || TRO.ro || sget(lgKey())) return false;
    if (!CLOUD.on) return true;
    if (TRO.s && TRO.s.cs) return false;
    const st = CLOUD.st;
    if (st === 'off' || st === 'nostore' || st === 'in' || st === 'relog') return false;
    return st !== 'frame' || !!clOutsideUrl();
  }
  function lgSetupDOM(click) {
    if (!lgOn() || LOGIN.el || !dom.screen) return;
    const sec = h('section', 'pg-ov pg-login'); sec.id = 'pg-login'; sec.hidden = true; sec.setAttribute('aria-labelledby', 'pg-login-h');
    const card = h('div', 'pg-card pg-login-card');
    const logo = dom.title && dom.title.querySelector('.pg-logo');
    const hd = logo ? logo.cloneNode(true) : h('h2', 'pg-logo', GAME_NAME); hd.id = 'pg-login-h';
    const why = h('p', 'pg-login-why', LG_TX.why); why.id = 'pg-login-why';
    // the tub: the six animals' busts (each in its own worn set) bobbing in the water, decoration only
    const tub = h('div', 'pg-login-tub'); tub.setAttribute('aria-hidden', 'true');
    for (const c of CHAR_IDS) { const cv = portraitCanvas(c, 'portrait_', 32, myLook(c)); cv.className = 'pg-login-ani'; tub.appendChild(cv); }
    const btns = h('div', 'pg-login-btns');
    const go = h('button', 'pg-btn pg-login-go'); go.type = 'button'; go.id = 'pg-login-go';
    // (Google's four-colour "G", unaltered, on its own white disc - Google's sign-in branding; static markup only)
    const gl = h('span', 'pg-login-g'); gl.setAttribute('aria-hidden', 'true');
    gl.innerHTML = GOOGLE_G;
    go.appendChild(gl);
    const goTx = h('span', 'pg-login-gotx', LG_TX.go); go.appendChild(goTx);
    go.setAttribute('aria-describedby', 'pg-login-why pg-login-st');
    const guest = h('button', 'pg-btn pg-ghost pg-login-guest', LG_TX.guest); guest.type = 'button'; guest.id = 'pg-login-guest';
    if (PREVIEW && !CLOUD.on) { go.disabled = true; guest.setAttribute('data-primary', ''); } else go.setAttribute('data-primary', '');
    btns.append(go, guest);
    const st = h('p', 'pg-login-st'); st.id = 'pg-login-st'; st.setAttribute('aria-live', 'polite');
    card.append(hd, tub, why, btns, st); sec.appendChild(card);
    dom.screen.insertBefore(sec, dom.title || null);
    Object.assign(LOGIN, { el: sec, go, goTx, guest, st });
    dom.login = sec;
    click('pg-login-go', lgGo); click('pg-login-guest', lgGuest);
    try { for (const q of ['.pg-fw-body', '.pg-fw-sign']) { const fw = document.querySelector('#pg-fontwarm ' + q); if (fw && fw.textContent.indexOf(LG_TX.go) < 0) fw.textContent += ' ' + LOGIN_TEXT; } } catch (e) { /* ignore */ }
  }
  // boot (after clBoot: the cloud's state is known - a redirect sign-in coming back shows it 'auth')
  function lgBoot() {
    if (!LOGIN.el || !lgWanted()) return false;
    showOverlay('login');
    clWarm();                                   // (as 내 기록 does: the SDK's first files, so the tap opens the popup at once)
    return true;
  }
  function lgGo() {
    firstGesture();
    if (!CLOUD.on || shownOverlay !== 'login') return;
    if (CLOUD.st === 'in') { lgUI(); return; }
    if (LOGIN.go.getAttribute('aria-disabled') === 'true') return;
    clClick(); lgUI();
  }
  // 로그인 없이 하기: remembered here, the title (a sign-in already on its way may still finish: the badge then shows it)
  function lgGuest() {
    firstGesture();
    if (shownOverlay !== 'login') return;
    sset(lgKey(), '1'); LOGIN.rec = false;
    if (CLOUD.on && CLOUD.msg && CLOUD.msg.err && !CLOUD.msg.at) { clearTimeout(CLOUD.msgT); CLOUD.msg = null; }   // (the screen's failure is over)
    showOverlay('title');
  }
  // signed in and linked: the title (a redirect sign-in that came back opens 내 기록 there, as from the title)
  function lgDone() {
    if (shownOverlay !== 'login') return;
    showOverlay('title');
    if (LOGIN.rec) { LOGIN.rec = false; openRec(); }
  }
  // the screen follows the cloud's state (clUI) - the same labels and lines as 내 기록's row
  function lgUI() {
    if (!LOGIN.el || shownOverlay !== 'login' || LOGIN.inUI) return;
    if (CLOUD.on && CLOUD.st === 'in' && TRO.s && TRO.s.cs) { LOGIN.inUI = true; try { lgDone(); } finally { LOGIN.inUI = false; } return; }
    let lbl = LG_TX.go, busy = false, hide = false, line = LG_TX.note, cls = 'pg-login-st';
    if (!CLOUD.on) { line = LG_TX.pv; cls += ' is-pv'; }
    else {
      const st = CLOUD.st, again = st === 'auth' && CLOUD.pop, M = CLOUD.msg;
      if (st === 'frame' || st === 'inapp') { lbl = CL_BTN[st]; hide = !clOutsideUrl(); }
      else if (again) lbl = CL_BTN.again;
      else if (st === 'load' || st === 'auth' || st === 'link') { lbl = CL_BTN[st]; busy = true; }
      else if (st === 'nostore' || st === 'relog') hide = true;
      if (M) { line = M.txt; cls += M.err ? ' is-err' : ' is-msg'; }
      else if (st !== 'out') { const [k, c] = clLine(); line = CL_TX[k]; if (c) cls += ' ' + c; }
    }
    setTxt(LOGIN.goTx, lbl);
    // (each ' · ' part a unit, as 내 기록's line: a 2-line text breaks after its '·', never before it)
    if (LOGIN.st._t !== line) {
      LOGIN.st._t = line; LOGIN.st.textContent = '';
      if (line) String(line).split(' · ').forEach((p, i, a) => { if (i) LOGIN.st.appendChild(document.createTextNode(' ')); LOGIN.st.appendChild(h('span', 'pg-cloud-c', p + (i < a.length - 1 ? ' ·' : ''))); });
    }
    if (LOGIN.st.className !== cls) LOGIN.st.className = cls;
    if (LOGIN.go.hidden !== hide) {
      LOGIN.go.hidden = hide;
      if (hide && document.activeElement === LOGIN.go) try { LOGIN.guest.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
    LOGIN.go.setAttribute('aria-disabled', busy ? 'true' : 'false');
    if (busy) LOGIN.go.setAttribute('aria-busy', 'true'); else LOGIN.go.removeAttribute('aria-busy');
  }
  // ←/→/↑/↓ between the screen's buttons (Tab works as everywhere)
  function lgArrow(code) {
    if (!LOGIN.el || !/^Arrow(Left|Right|Up|Down)$/.test(code)) return false;
    const bs = [LOGIN.go, LOGIN.guest].filter((b) => !b.hidden && !b.disabled);
    if (!bs.length) return true;
    const i = bs.indexOf(document.activeElement), d = code === 'ArrowLeft' || code === 'ArrowUp' ? -1 : 1;
    try { bs[i < 0 ? 0 : (i + d + bs.length) % bs.length].focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    return true;
  }
  function lgDebugApi() {
    const api = {
      state: () => ({ on: lgOn(), preview: PREVIEW, made: !!LOGIN.el, shown: shownOverlay === 'login', overlay: shownOverlay || null, key: lgKey(), guest: sget(lgKey()) || '',
        wanted: lgWanted(), btn: LOGIN.goTx ? LOGIN.goTx.textContent : '', btnHidden: LOGIN.go ? LOGIN.go.hidden : true, btnDisabled: LOGIN.go ? LOGIN.go.disabled : true,
        busy: LOGIN.go ? LOGIN.go.getAttribute('aria-disabled') === 'true' : false, line: LOGIN.st ? LOGIN.st.textContent : '', cls: LOGIN.st ? LOGIN.st.className : '',
        focus: document.activeElement && document.activeElement.id || '' }),
      // (tests) as at load: shown if wanted (force: shown anyway) -> the state
      show(force) { if (LOGIN.el && (force || lgWanted())) { showOverlay('login'); lgUI(); } return api.state(); },
      go() { lgGo(); return api.state(); }, guest() { lgGuest(); return api.state(); },
      forget() { sset(lgKey(), ''); return api.state(); },
    };
    return api;
  }

  // ---- PG.debug.cloud (11)
  function clDebugApi() {
    const api = {
      state() {
        const S = TRO.s, D = CLOUD.doc;
        let sum = null;
        if (D) { const a = clAgg(D.s, '', troToday()); sum = { t: a.t, w: a.w, g: a.g, ko: a.ko, de: a.de, best: a.best, hi: a.hi, ce: a.ce, sp: a.sp, o: a.o, bd: a.bd, bs: a.bs, dn: a.dn, gd: a.gd }; }
        return { on: CLOUD.on, st: CLOUD.st, msg: CLOUD.msg ? CLOUD.msg.key : null, msgTxt: CLOUD.msg ? CLOUD.msg.txt : '', user: CLOUD.user ? CLOUD.user.uid : null,
          cs: S && S.cs ? JSON.parse(JSON.stringify(S.cs)) : null, dirty: S && CLOUD.on ? clDirty(S) : '', mine: CLOUD.mine, push: !!CLOUD.push, fails: CLOUD.fails,
          holdUntil: CLOUD.holdUntil, now: clNow(), parts: CLOUD.got.slice(), method: CLOUD.on ? clMethod() : '', env: CLOUD.on ? Object.assign({}, clEnv()) : null,
          newer: CLOUD.newer, err: CLOUD.err, live: CLOUD.live, listening: !!CLOUD.unsub, loads: CLOUD.loads, opened: CLOUD.opened, nickOut: CLOUD.nickOut,
          pop: CLOUD.pop, here: CLOUD.on ? clHere() : false, park: sget(clParkKey()) || '',
          doc: D ? { slots: D.s.size, browsers: clBrowsers(D), keys: Array.from(D.s.keys()), sum, dev: D.dev, nick: D.nick, v: D.v, eq: D.eq } : null, eqOut: S && CLOUD.on ? clEqOut(S, null) : '',
          line: dom.cloudTx && dom.cloud && !dom.cloud.hidden ? dom.cloudTx.textContent : '', btn: dom.cloudBtn && !dom.cloudBtn.hidden ? dom.cloudBtn.textContent : '',
          mark: dom.troCloud && !dom.troCloud.hidden ? dom.troCloud.className : '', guest: sget(clGuestKey()) || '', meta: sget(clMetaKey()) || '' };
      },
      // (artifact-skeleton test pages) the cloud on with this config and this fake SDK; it never loads a file
      start(cfg, mock) {
        if (CLOUD.on || !mock || !cfg || typeof cfg !== 'object') return api.state();
        Object.assign(CLOUD, { on: true, v: String(mock.SDK_VERSION || ''), ns: 'mock', cfg: Object.assign({}, cfg), sdk: [], home: typeof cfg.home === 'string' ? cfg.home : '', away: !!cfg.away, shared: [], mock });
        clSetupDOM(); clReboot();
        return api.state();
      },
      use(mock) { if (CLOUD.on && !CLOUD.fb && mock) CLOUD.mock = mock; return api.state(); },   // (before anything loaded)
      env(o) { CLOUD.env = o && typeof o === 'object' ? Object.assign({ framed: false, app: false, inApp: false, same: false, shared: false, android: false, kakao: false, line: false }, o) : null; clUI(); return api.state(); },
      // (tests) one message as the game would say it (fit checks)
      say(k, a, b) { clMsg(k, a, b); return api.state(); },
      // (tests) the page's home / away as another PG_CLOUD would give them (a reboot then boots with them)
      site(o) {
        if (CLOUD.on && o && typeof o === 'object') { if (typeof o.home === 'string') CLOUD.home = o.home; if ('away' in o) CLOUD.away = !!o.away; clUI(); }
        return api.state();
      },
      reboot() { clReboot(); return api.state(); },
      fast(on) { CLOUD.fast = !!on; },
      clock(fn) { CLOUD.clock = typeof fn === 'function' ? fn : null; },
      click() { clClick(); return api.state(); },
      signOut(force) { if (CLOUD.st === 'in') clSignOut(!!force); return api.state(); },
      push() { CLOUD.holdUntil = 0; clPush(); return api.state(); },
      // the SDK's files up to part (0 app, 1 auth, 2 firestore) as a sign-in would load them -> the state, or {error}
      load: (part) => (CLOUD.on ? clLoad(clamp(part | 0, 0, 2)).then(() => { if (CLOUD.fb) clApp(); return api.state(); }, (e) => ({ error: String((e && e.message) || e) })) : Promise.resolve({ error: 'off' })),
      kick() { clKick(); return api.state(); },
      open: () => clOpenOutside(),
      outside: () => (CLOUD.on ? clOutsideUrl() : ''),
      nick: (n) => netSetNick(n),
      text: () => CLOUD_TEXT, texts: () => Object.assign({}, CL_TX), buttons: () => Object.assign({}, CL_BTN),
      looksParse, looksMerge, looksOwned,
      slot: clSlot, doc: clDoc, agg: clAgg, mine: clMine, adopt: clAdopt, step: clStep, dirty: clDirty, parseCs: clParseCs, zero: clZero, items: clItems, upload: clUpload,
      pool: clPool, cnt: clCnt, eqOut: (S, slot) => clEqOut(S, slot || null),   // (v 4, gacha.md 7.2)
    };
    return api;
  }

  // ------------------------------------------------------------------ v4 friends (친구 순위, design/friends.md)
  // On the deploy with the cloud, a signed-in player trades an 8-character friend code (ABCD-2345); a request the other
  // accepts makes a pair, and each then reads the other's card - profiles/{uid}: the nick, the best 탕 of 혼자 하기, the
  // best score, trophies, the animal and its worn set - ranked in 친구 순위 (opened from 내 기록). The security rules
  // (design/friends.md 3) keep a card to its owner and accepted friends. players/{uid} and its sync are untouched: only
  // CLOUD.db and CLOUD.user.uid are used here. A PR preview (PG_PREVIEW) stages a demo (no SDK call); the artifact has
  // none of it (no button, panel or markup). The hooks: clSet -> palCloud; newGame / startRound -> PAL.run / palStageRun;
  // showOverlay (title / over / ending) -> palKick; 내 기록's 친구 순위 button -> palOpen
  const PAL_TANG = 24, PAL_MAX = 50, PAL_LIST = 60, PAL_REQ = 20, PAL_DEB_MS = 15000, PAL_RQ_MS = 20000, PAL_CACHE_MS = 60000;
  const PAL_OLD_MS = 14 * 864e5, PAL_MUTE_MS = 30 * 864e5, PAL_MUTE_MAX = 50, PAL_REFRESH_MS = 10000, PAL_RETRY_MS = 60000, PAL_DENY_MS = 6000, PAL_MSG_MS = 6000;
  const PAL_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', PAL_CODE_RE = /^[A-HJKMNP-Z2-9]{8}$/, PAL_LK_RE = /^[0-9a-z]{5}$/;
  const PAL_TX = {
    title: '친구 순위', friend: '친구', ivWait: '초대 왔어요', code: '내 코드', copy: '복사', copied: '복사했어요', ph: '친구 코드 8자리', send: '친구 요청', reqs: '받은 요청', rank: '혼자 하기 최고 기록',
    me: '(나)', accept: '수락', decline: '거절', cut: '끊기', cancel: '취소', ask: '{0}님과 친구를 끊을까요?', refresh: '새로고침', close: '닫기',
    loading: '불러오는 중…', empty: '아직 친구가 없어요 · 내 코드를 알려 주거나 친구 코드를 넣어 보세요',
    guest: '로그인하면 친구 코드로 친구를 맺고 서로의 기록을 볼 수 있어요', login: '구글로 로그인', retry: '다시 시도',
    bad: '코드 8자리를 확인해 주세요', own: '내 코드예요', full: '친구는 50명까지예요', wait: '20초 뒤에 다시 보낼 수 있어요', none: '그런 코드가 없어요',
    already: '이미 친구예요', both: '서로 요청해서 바로 친구가 됐어요', sent0: '이미 요청했어요', sent: '친구 요청을 보냈어요', later: '잠시 후 다시 해 주세요',
    added: '{0}님과 친구가 됐어요', declined: '요청을 거절했어요', cutDone: '{0}님과 친구를 끊었어요',
    offline: '인터넷이 연결되면 다시 볼 수 있어요', rules: '친구 기능을 준비 중이에요', busy: '지금은 사람이 많아요 · 잠시 후 다시', fail: '잠시 후 다시',
    demo: '미리보기 · 예시 친구들이에요 (저장되지 않아요)', none0: '기록 없음', best: '최고 {0}라운드',
    // (친구 초대: a friend row's 초대 and what it says - here or, once the room shows, on the room's line)
    iv: '초대', ivSent: '{0}님을 초대했어요', ivWait: '10초 뒤에 다시 초대할 수 있어요', ivFull: '방이 가득 찼어요', ivStarted: '게임 중에는 초대할 수 없어요',
    ivFail: '초대를 보내지 못했어요 · 잠시 후 다시', ivDemo: '미리보기라 초대는 보내지 않아요', ivNet: '{0}',
  };
  const PAL_OK = { copied: 1, sent: 1, added: 1, both: 1, declined: 1, cutDone: 1, ivSent: 1, ivDemo: 1 };
  const PAL_TEXT = Object.keys(PAL_TX).map((k) => PAL_TX[k].replace(/\{0\}/g, '')).join(' ') + ' 위 최고 라운드 점 개 받은 요청 · ( ) - 0123456789,';
  // (per page load. gen: bumped by a sign-out / an account switch - a late answer for the old account is dropped; uid /
  // code / prof: the account, its code and the card the server has (sent: its JSON); run: this solo game counts (newGame);
  // t / wr / deny: the card's debounce, the write in flight, one refused write retried; rows / reqs / at: the friends'
  // cards, the incoming requests and when they came (cached 60 s); loadAt: the last load (새로고침 rests 10 s); rqAt: my
  // last request; busy: a call in flight (its buttons aria-disabled); ask: the friend whose 끊기 waits for a yes; said:
  // the last message's key (tests); demo: a PR preview's staged friends)
  const PAL = { gen: 0, uid: '', code: '', prof: null, sent: '', run: false, t: 0, wr: null, deny: 0, busy: false, rows: null, reqs: [], at: 0, loadAt: 0,
    loading: null, rqAt: 0, err: '', booting: null, bootErr: '', msg: '', msgErr: false, msgT: 0, said: '', open: false, ask: '', dom: null, waitT: 0, waits: 0,
    refT: 0, focus: '', demo: false, key: '', rqKey: '' };
  const palDemoOn = () => !!PREVIEW && !CLOUD.on;
  const palOn = () => CLOUD.on && CLOUD.st === 'in' && !!CLOUD.user && !!CLOUD.db;
  // (this browser's best 탕 and its mutes, per test namespace like the cloud's own keys - '' on a real page)
  const palKey = () => 'ppogeul-stage' + clSfx(), palMuteKey = () => 'ppogeul-pal-mute' + clSfx();
  const palLocal = () => clamp(parseInt(sget(palKey()) || '0', 10) || 0, 0, PAL_TANG * 100);
  const palFmt = (c) => (typeof c === 'string' && c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : '');
  const palLk = (lk) => (typeof lk === 'string' && PAL_LK_RE.test(lk) ? lk : LOOK0);
  const palNick = (n) => (typeof n === 'string' && n ? Array.from(n).slice(0, 12).join('') : '?');
  const palJson = (c) => JSON.stringify([c.nick, c.st, c.hi, c.tr, c.c, c.lk]);
  const palTs = (v) => { try { return v && typeof v.toMillis === 'function' ? +v.toMillis() || 0 : 0; } catch (e) { return 0; } };
  const palDocs = (qs) => { try { return qs && Array.isArray(qs.docs) ? qs.docs : []; } catch (e) { return []; } };
  // the best reached as ONE round count from the very first 탕 - st itself (the user, 2026-10-23: no 회차 / 탕 in the
  // ranking): 2회차's 5번째 탕 is 최고 29라운드 (0: none yet)
  function palStTx(st) {
    st = clamp(st | 0, 0, PAL_TANG * 100); if (!st) return PAL_TX.none0;
    return PAL_TX.best.replace('{0}', String(st));
  }
  // startRound: this browser's best 탕 of 혼자 하기 (st = G.loop * 24 + G.round + 1), raise-only; only a solo game begun
  // at 탕 1 (newGame sets PAL.run) - never co-op, battle, online, the attract demo or a debug start further in
  function palStageRun() {
    if (!PAL.run || G.attract || G.online || G.gameMode !== 'solo') return;
    const st = clamp(G.loop * PAL_TANG + G.round + 1, 0, PAL_TANG * 100);
    if (st > palLocal()) sset(palKey(), st);
  }
  // my card as it would be written now (the server's bests never drop: the larger of this browser's and the card's)
  function palCard() {
    const p = PAL.prof || {};
    return { nick: cleanNick(NET.nick) || '손님', st: Math.max(palLocal(), p.st | 0), hi: clamp(Math.max(Math.floor(+G.hiscore) || 0, p.hi | 0), 0, 999999999),
      tr: clamp((TRO.s && TRO.s.t) | 0, 0, 99999), c: Math.max(0, CHAR_IDS.indexOf(G.sel)), lk: palLk(myLook(G.sel)) };
  }
  const palDoc = (c, id) => CLOUD.db.collection(c).doc(id);
  const palFr = (a, b) => CLOUD.db.collection('friends').doc(a).collection('f').doc(b);
  const palReq = (to, from) => CLOUD.db.collection('reqs').doc(to).collection('in').doc(from);
  const palInCol = (me) => CLOUD.db.collection('reqs').doc(me).collection('in'), palFrCol = (me) => CLOUD.db.collection('friends').doc(me).collection('f');
  // an error's message key: offline / the rules not published yet (a load) / the quota / anything else
  function palErrKey(e, load) {
    const c = e && typeof e.code === 'string' ? e.code : '';
    if (c === 'unavailable' || c === 'deadline-exceeded' || navigator.onLine === false) return 'offline';
    if (c === 'permission-denied' && load) return 'rules';
    if (c === 'resource-exhausted') return 'busy';
    return load ? 'fail' : 'later';
  }
  // ---- the account (clSet calls this on every cloud state): signed in -> its card (another account: start over);
  // signed out -> nothing kept; on the way (load / auth / link / relog): paused, the cache kept. Signed in before the
  // database is up (a linked browser at load): looked at again every second for a while
  function palCloud() {
    if (!CLOUD.on) return;
    const st = CLOUD.st, uid = CLOUD.user ? CLOUD.user.uid : '';
    if (st === 'out' || st === 'off' || st === 'frame' || st === 'inapp' || st === 'nostore') { if (PAL.uid || PAL.code || PAL.booting) palReset(); else if (PAL.open) palRender(); ivSync(); return; }
    if (st === 'in' && uid && uid !== PAL.uid) { if (PAL.uid) palReset(); PAL.uid = uid; }
    // (a linked browser at load is 'in' before its user and database are: looked at again until both are - 친구 초대's
    // listener starts then, not at the next title)
    if (st === 'in' && !palOn()) palWait();
    else if (palOn() && !PAL.code && !PAL.booting && !PAL.bootErr) palBoot();
    if (PAL.open) palRender();
    ivSync();                                    // (친구 초대: the listener on my invites follows the account)
  }
  function palWait() {
    if (PAL.waitT || PAL.waits >= 120) return;
    PAL.waitT = setTimeout(() => { PAL.waitT = 0; PAL.waits++; if (!stopped) palCloud(); }, clT(1000));
  }
  function palReset() {
    PAL.gen++;
    clearTimeout(PAL.t); clearTimeout(PAL.waitT); clearTimeout(PAL.msgT); clearTimeout(PAL.refT);
    Object.assign(PAL, { uid: '', code: '', prof: null, sent: '', t: 0, wr: null, deny: 0, busy: false, rows: null, reqs: [], at: 0, loadAt: 0, loading: null, rqAt: 0, err: '',
      booting: null, bootErr: '', msg: '', msgT: 0, ask: '', waitT: 0, waits: 0, refT: 0, key: '', rqKey: '' });
    palDots();
    if (PAL.open) palRender();
  }
  // signed in: my card (none yet: made now), my card brought up to date, my inbox (the red dot). A failure (offline, the
  // rules not published, the quota) waits for the panel's next opening
  function palBoot() {
    if (PAL.booting) return PAL.booting;
    if (!palOn() || PAL.code) return Promise.resolve();
    const gen = PAL.gen, uid = CLOUD.user.uid;
    PAL.uid = uid; PAL.bootErr = '';
    const p = palDoc('profiles', uid).get().then((snap) => {
      if (gen !== PAL.gen) return null;
      return snap.exists ? palTake(snap.data()) : palCreate(gen, uid, 0);
    }).then(() => {
      if (gen !== PAL.gen || !PAL.code) return null;
      palKick();
      return palInbox(gen).catch(() => { /* (the dot waits for the panel) */ });
    }).catch((e) => { if (gen === PAL.gen) PAL.bootErr = palErrKey(e, true); })
      .then(() => {
        if (gen !== PAL.gen) return;
        PAL.booting = null; palDots();
        if (PAL.open) { if (PAL.code) palLoadIf(); else palRender(); }
      });
    PAL.booting = p;
    if (PAL.open) palRender();
    return p;
  }
  // the server's card: its code, what it holds (my local best rises to its st)
  function palTake(d) {
    if (!d || typeof d.code !== 'string' || !PAL_CODE_RE.test(d.code)) throw Object.assign(new Error('card'), { code: 'invalid-argument' });
    PAL.code = d.code;
    PAL.prof = { nick: typeof d.nick === 'string' ? d.nick : '', st: nNum(d.st, 0, 2400, 0) | 0, hi: nNum(d.hi, 0, 999999999, 0) | 0, tr: nNum(d.tr, 0, 99999, 0) | 0,
      c: nNum(d.c, 0, 5, 0) | 0, lk: palLk(d.lk) };
    PAL.sent = palJson(PAL.prof);
    if (PAL.prof.st > palLocal()) sset(palKey(), PAL.prof.st);
    return null;
  }
  // a code: 8 characters of PAL_ABC from crypto (bytes >= 248 thrown away: no bias)
  function palNewCode() {
    let s = '';
    const b = new Uint8Array(16);
    while (s.length < 8) { crypto.getRandomValues(b); for (const x of b) if (x < 248 && s.length < 8) s += PAL_ABC[x % 31]; }
    return s;
  }
  // the first card and its code in one transaction (a taken code: another, up to 5 tries; refused because another tab
  // of this account made the card meanwhile: that card is taken)
  function palCreate(gen, uid, n) {
    const C = palNewCode(), cref = palDoc('codes', C), pref = palDoc('profiles', uid), card = palCard();
    return CLOUD.db.runTransaction((tx) => tx.get(cref).then((s) => {
      if (s.exists) throw Object.assign(new Error('taken'), { code: 'taken' });
      tx.set(cref, { u: uid });
      tx.set(pref, Object.assign({ v: 1, code: C }, card, { at: FV().serverTimestamp() }));
      return null;
    })).then(() => {
      if (gen !== PAL.gen) return null;
      PAL.code = C; PAL.prof = card; PAL.sent = palJson(card);
      return null;
    }, (e) => {
      if (gen !== PAL.gen) return null;
      if (e && e.code === 'taken' && n < 4) return palCreate(gen, uid, n + 1);
      if (e && e.code === 'permission-denied') return pref.get().then((s) => { if (gen !== PAL.gen) return null; if (s.exists) return palTake(s.data()); throw e; });
      throw e;
    });
  }
  // the title / a result card / 친구 순위 (and every request): my card is (re)sent 15 s after the last change - the nick,
  // the look, the animal, the league, the bests; an unchanged card is never written
  function palKick() {
    if (!CLOUD.on) return;
    PAL.waits = 0; palCloud();
    if (!palOn() || !PAL.code || palJson(palCard()) === PAL.sent) return;
    clearTimeout(PAL.t); PAL.t = setTimeout(palWrite, clT(PAL_DEB_MS));
  }
  // the card write (refused: once more after 6 s - the rules' 5 s - then not before the next change; other failures: 60 s)
  function palWrite() {
    clearTimeout(PAL.t); PAL.t = 0;
    if (!palOn() || !PAL.code) return Promise.resolve();
    if (PAL.wr) { PAL.t = setTimeout(palWrite, clT(PAL_DEB_MS)); return PAL.wr; }
    const card = palCard(), j = palJson(card), gen = PAL.gen;
    if (j === PAL.sent) return Promise.resolve();
    let w;
    try { w = palDoc('profiles', PAL.uid).update(Object.assign({}, card, { at: FV().serverTimestamp() })); } catch (e) { w = Promise.reject(e); }
    PAL.wr = Promise.resolve(w).then(() => {
      if (gen !== PAL.gen) return;
      PAL.prof = card; PAL.sent = j; PAL.deny = 0;
    }, (e) => {
      if (gen !== PAL.gen) return;
      clearTimeout(PAL.t); PAL.t = 0;
      if (e && e.code === 'permission-denied') { if (!PAL.deny) { PAL.deny = 1; PAL.t = setTimeout(palWrite, clT(PAL_DENY_MS)); } else PAL.deny = 0; }
      else PAL.t = setTimeout(palWrite, clT(PAL_RETRY_MS));
    }).then(() => { if (gen === PAL.gen) PAL.wr = null; });
    return PAL.wr;
  }
  // ---- mutes (a declined player: 30 days, <= 50 kept; their later requests are deleted unseen)
  function palMutes() {
    let m = null; try { m = JSON.parse(sget(palMuteKey()) || 'null'); } catch (e) { m = null; }
    const now = clNow(), out = {};
    if (m && typeof m === 'object' && !Array.isArray(m)) for (const k of Object.keys(m)) if (CL_UID_RE.test(k) && +m[k] > now) out[k] = +m[k];
    return out;
  }
  function palMute(x) {
    const m = palMutes(), o = {}; m[x] = clNow() + PAL_MUTE_MS;
    for (const k of Object.keys(m).sort((a, b) => m[b] - m[a]).slice(0, PAL_MUTE_MAX)) o[k] = m[k];
    sset(palMuteKey(), JSON.stringify(o));
  }
  // ---- loads
  // my inbox (<= 20): requests older than 14 days, from a muted player or from a friend are deleted quietly
  function palInbox(gen) {
    const me = PAL.uid;
    return palInCol(me).limit(PAL_REQ).get().then((qs) => {
      if (gen !== PAL.gen) return;
      const now = clNow(), mute = palMutes(), out = [];
      for (const d of palDocs(qs)) {
        const x = d.id, r = (d.data && d.data()) || {}, at = palTs(r.at);
        if (!CL_UID_RE.test(x) || x === me) continue;
        if ((at && now - at > PAL_OLD_MS) || mute[x] || (PAL.rows && PAL.rows.some((q) => q.uid === x))) { palReq(me, x).delete().catch(() => { /* the next listing */ }); continue; }
        out.push({ uid: x, n: palNick(r.n), cd: typeof r.cd === 'string' && PAL_CODE_RE.test(r.cd) ? r.cd : '', c: nNum(r.c, 0, 5, 0) | 0, lk: palLk(r.lk), at });
      }
      PAL.reqs = out.sort((a, b) => b.at - a.at); palDots();
    });
  }
  function palRowOf(x, d) {
    d = d || {};
    return { uid: x, nick: palNick(d.nick), code: typeof d.code === 'string' && PAL_CODE_RE.test(d.code) ? d.code : '', st: nNum(d.st, 0, 2400, 0) | 0,
      hi: nNum(d.hi, 0, 999999999, 0) | 0, tr: nNum(d.tr, 0, 99999, 0) | 0, c: nNum(d.c, 0, 5, 0) | 0, lk: palLk(d.lk), me: false };
  }
  function palLoadIf(force) {
    if (!force && PAL.rows && !PAL.err && clNow() - PAL.at < PAL_CACHE_MS) { palRender(); return Promise.resolve(); }
    return palLoad();
  }
  // a load: my friend list (<= 60), each friend's card (in parallel; refused: that friend let go of me - my half goes
  // too once theirs is gone) and my inbox: 1 + N + 1 reads (+ the rules' N exists); kept 60 s
  function palLoad() {
    if (PAL.loading) return PAL.loading;
    if (!palOn() || !PAL.code) return Promise.resolve();
    const gen = PAL.gen, me = PAL.uid;
    PAL.err = ''; PAL.loadAt = clNow();
    const fl = palFrCol(me).limit(PAL_LIST).get().then((qs) => Promise.all(palDocs(qs).map((d) => d.id).filter((x) => CL_UID_RE.test(x) && x !== me).map((x) =>
      palDoc('profiles', x).get().then((s) => (s.exists ? palRowOf(x, s.data()) : null), (e) => {
        if (e && e.code === 'permission-denied') palFr(x, me).get().then((s) => (!s.exists && gen === PAL.gen ? palFr(me, x).delete() : null)).catch(() => { /* the next load */ });
        return null;
      }))));
    PAL.loading = Promise.all([fl, palInbox(gen)]).then(([rows]) => {
      if (gen !== PAL.gen) return;
      PAL.rows = rows.filter(Boolean); PAL.at = clNow();
      PAL.reqs = PAL.reqs.filter((r) => !PAL.rows.some((q) => q.uid === r.uid));
    }, (e) => { if (gen === PAL.gen) PAL.err = palErrKey(e, true); }).then(() => {
      if (gen !== PAL.gen) return;
      PAL.loading = null; palDots(); palRender();
      clearTimeout(PAL.refT); PAL.refT = setTimeout(() => { if (PAL.open) palRender(); }, clT(PAL_REFRESH_MS) + 20);
    });
    palRender();
    return PAL.loading;
  }
  // the ranking: my friends and me - the best round count (st) first, then the best score, trophies, the name
  function palRank() {
    const me = Object.assign(palCard(), { uid: PAL.uid || 'me', code: PAL.code, me: true });
    return (PAL.rows || []).concat([me]).sort((a, b) => b.st - a.st || b.hi - a.hi || b.tr - a.tr || (a.nick < b.nick ? -1 : a.nick > b.nick ? 1 : 0) || (a.me ? -1 : 1));
  }
  // ---- actions
  function palSay(key, a) {
    const t = PAL_TX[key]; if (!t) return;
    clearTimeout(PAL.msgT);
    PAL.msg = t.replace('{0}', a === undefined ? '' : String(a)); PAL.msgErr = !PAL_OK[key]; PAL.said = key;
    PAL.msgT = setTimeout(() => { PAL.msg = ''; if (PAL.open) palRender(); }, clT(PAL_MSG_MS));
    if (PAL.open) palRender();
  }
  // 친구 요청: the code checked here first (its form, mine, 50 friends, the 20 s), then its owner, then a request that
  // crossed mine (accepted at once) or one I sent already; then my card's write in flight lands and the request goes
  // with the outbox in one batch (refused: my card read again once - another tab may have changed it)
  async function palAdd(text) {
    if (PAL.busy) return;
    const C = String(text || '').toUpperCase().replace(/[-\s]/g, '');
    if (!PAL_CODE_RE.test(C)) { palSay('bad'); return; }
    const demo = palDemoOn();
    if (!demo && (!palOn() || !PAL.code)) { palSay('later'); return; }
    if (C === PAL.code) { palSay('own'); return; }
    if (PAL.rows && PAL.rows.length >= PAL_MAX) { palSay('full'); return; }
    if (PAL.rqAt && clNow() - PAL.rqAt < PAL_RQ_MS) { palSay('wait'); return; }
    if (demo) {
      const r = PAL.reqs.find((q) => q.cd === C);
      if (r) { palAccept(r, 'both'); return; }
      if ((PAL.rows || []).some((q) => q.code === C)) { palSay('already'); return; }
      PAL.rqAt = clNow(); palSay('sent'); if (PAL.dom) PAL.dom.inp.value = ''; return;
    }
    const gen = PAL.gen, me = PAL.uid;
    PAL.busy = true; palRender();
    try {
      const cs = await palDoc('codes', C).get();
      if (gen !== PAL.gen) return;
      const cd = cs.exists ? cs.data() : null, x = cd && typeof cd.u === 'string' && CL_UID_RE.test(cd.u) ? cd.u : '';
      if (!x) { palSay('none'); return; }
      if (x === me) { palSay('own'); return; }
      if (PAL.rows && PAL.rows.some((q) => q.uid === x)) { palSay('already'); return; }
      const r = PAL.reqs.find((q) => q.uid === x);
      if (r) { PAL.busy = false; await palAccept(r, 'both'); return; }
      const rs = await palReq(x, me).get();
      if (gen !== PAL.gen) return;
      if (rs.exists) { palSay('sent0'); return; }
      clearTimeout(PAL.t); PAL.t = 0;
      if (PAL.wr) await PAL.wr;
      for (let i = 0; ; i++) {
        const p = PAL.prof, b = CLOUD.db.batch(), ts = FV().serverTimestamp();
        b.set(palDoc('outbox', me), { rq: ts });
        b.set(palReq(x, me), { n: p.nick, cd: PAL.code, c: p.c, lk: p.lk, at: ts });
        try {
          await b.commit();
          if (gen !== PAL.gen) return;
          PAL.rqAt = clNow(); palSay('sent'); if (PAL.dom) PAL.dom.inp.value = '';
          break;
        } catch (e) {
          if (gen !== PAL.gen) return;
          if (!(e && e.code === 'permission-denied' && i === 0)) throw e;
          const s = await palDoc('profiles', me).get();
          if (gen !== PAL.gen) return;
          if (!s.exists) throw e;
          palTake(s.data());
        }
      }
    } catch (e) { if (gen === PAL.gen) palSay(palErrKey(e)); }
    finally { if (gen === PAL.gen) { PAL.busy = false; palRender(); palKick(); } }
  }
  // 수락: both halves of the pair and the request(s) in one batch, then the new friend's card
  async function palAccept(r, how) {
    if (PAL.busy || !r) return;
    if (PAL.rows && PAL.rows.length >= PAL_MAX) { palSay('full'); return; }
    if (palDemoOn()) {
      PAL.reqs = PAL.reqs.filter((q) => q.uid !== r.uid);
      const row = palRowOf(r.uid, { nick: r.n, code: r.cd, st: r.st, hi: r.hi, tr: r.tr, c: r.c, lk: r.lk });
      PAL.rows = (PAL.rows || []).concat([row]); palDots(); palSay(how === 'both' ? 'both' : 'added', row.nick); return;
    }
    if (!palOn()) return;
    const gen = PAL.gen, me = PAL.uid, x = r.uid;
    PAL.busy = true; palRender();
    try {
      const b = CLOUD.db.batch(), ts = FV().serverTimestamp();
      b.set(palFr(me, x), { at: ts }); b.set(palFr(x, me), { at: ts });
      b.delete(palReq(me, x)); b.delete(palReq(x, me));
      await b.commit();
      if (gen !== PAL.gen) return;
      PAL.reqs = PAL.reqs.filter((q) => q.uid !== x);
      let row = null;
      try { const s = await palDoc('profiles', x).get(); if (s.exists) row = palRowOf(x, s.data()); } catch (e) { /* (the request's own values until the next load) */ }
      if (gen !== PAL.gen) return;
      if (!row) row = palRowOf(x, { nick: r.n, code: r.cd, c: r.c, lk: r.lk });
      PAL.rows = (PAL.rows || []).filter((q) => q.uid !== x).concat([row]);
      palSay(how === 'both' ? 'both' : 'added', row.nick);
    } catch (e) { if (gen === PAL.gen) palSay(palErrKey(e)); }
    finally { if (gen === PAL.gen) { PAL.busy = false; palDots(); palRender(); } }
  }
  // 거절: the request deleted and its sender muted here for 30 days
  function palDecline(r) {
    if (PAL.busy || !r) return;
    PAL.reqs = PAL.reqs.filter((q) => q.uid !== r.uid);
    if (!palDemoOn()) { palMute(r.uid); if (palOn()) palReq(PAL.uid, r.uid).delete().catch(() => { /* muted: the next listing deletes it */ }); }
    palDots(); palSay('declined');
  }
  // 끊기 (after its inline yes): both halves in one batch
  async function palCut(x) {
    if (PAL.busy) return;
    const r = (PAL.rows || []).find((q) => q.uid === x); PAL.ask = '';
    if (!r) { palRender(); return; }
    if (palDemoOn()) { PAL.rows = PAL.rows.filter((q) => q.uid !== x); palSay('cutDone', r.nick); return; }
    if (!palOn()) return;
    const gen = PAL.gen, me = PAL.uid;
    PAL.busy = true; palRender();
    try {
      const b = CLOUD.db.batch(); b.delete(palFr(me, x)); b.delete(palFr(x, me));
      await b.commit();
      if (gen !== PAL.gen) return;
      PAL.rows = PAL.rows.filter((q) => q.uid !== x); palSay('cutDone', r.nick);
    } catch (e) { if (gen === PAL.gen) palSay(palErrKey(e)); }
    finally { if (gen === PAL.gen) { PAL.busy = false; palRender(); } }
  }
  // 복사: the clipboard, else the code selected in a read-only field (copied by hand)
  function palCopy() {
    const t = palFmt(PAL.code), D = PAL.dom; if (!t || !D) return;
    const hand = () => {
      D.cin.hidden = false; D.cin.value = t;
      let ok = false; try { D.cin.focus({ preventScroll: true }); D.cin.select(); ok = document.execCommand('copy'); } catch (e) { ok = false; }
      if (ok) { D.cin.hidden = true; palSay('copied'); }
    };
    try { if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') { navigator.clipboard.writeText(t).then(() => palSay('copied'), hand); return; } } catch (e) { /* the field */ }
    hand();
  }
  // ---- the PR preview's demo: four friends, one request; everything works here only, nothing is stored
  const PAL_DEMO = { code: 'PVWX2345', rows: [
    { uid: 'demo1', nick: '거품왕', code: 'K7MQ2RTA', st: 41, hi: 58200, tr: 640, c: 1, lk: '50000' },
    { uid: 'demo2', nick: '뽀득이', code: 'D3FGH9JK', st: 22, hi: 31950, tr: 210, c: 3, lk: '10100' },
    { uid: 'demo3', nick: '때밀이', code: 'S2TUV6WY', st: 9, hi: 12400, tr: 75, c: 4, lk: '00100' },
    { uid: 'demo4', nick: '수건양', code: 'B8CE4NPZ', st: 3, hi: 2600, tr: 0, c: 5, lk: '30000' }],
  req: { uid: 'demo5', n: '온탕지기', cd: 'HN4WX8PB', c: 2, lk: '90000', at: 0, st: 17, hi: 24800, tr: 150 } };
  function palDemoStart() {
    if (PAL.demo) return;
    PAL.demo = true; PAL.code = PAL_DEMO.code; PAL.rows = PAL_DEMO.rows.map((r) => Object.assign({ me: false }, r)); PAL.reqs = [Object.assign({}, PAL_DEMO.req)]; PAL.at = clNow();
    palDots();
  }
  // ---- UI (design/friends.md 5): 내 기록's 친구 순위 button and #pg-pal, a full-stage .pg-panel like #pg-hub. Made here,
  // with the cloud or on a preview only. (The button sits at the top right of 내 기록's card: its button row has no room
  // for a third button at 1x - see the "As built" note.) The red dot (requests waiting) is mirrored on the title's
  // trophy badge; 마이페이지 has its own 친구 button (the hub footer, beside 내 기록 - the easy way in, 2026-10-23) with
  // the dot for requests or an invite waiting; its 친구 순위 closes back to 마이페이지
  function palSetupDOM() {
    if (!(CLOUD.on || PREVIEW) || $('pg-pal-btn') || !dom.recCard) return;
    const b = h('button', 'pg-btn pg-ghost pg-small pg-pal-btn'); b.type = 'button'; b.id = 'pg-pal-btn';
    const cup = mk(8, 8); cup.className = 'pg-ic'; cup.setAttribute('aria-hidden', 'true'); troIcon(cup, SPR_CUP);
    const dot = h('i', 'pg-tro-new'); dot.id = 'pg-pal-new'; dot.hidden = true; dot.setAttribute('aria-hidden', 'true');
    b.append(cup, h('span', '', PAL_TX.title), dot);
    const hd = $('pg-rec-h');
    dom.recCard.insertBefore(b, hd ? hd.nextSibling : dom.recCard.firstChild);
    dom.recCard.classList.add('has-pal');
    listen(b, 'click', (e) => { e.preventDefault(); palOpen(); });
    const mr = $('pg-my-rec');
    if (mr && !$('pg-my-pal')) {
      const fb = h('button', 'pg-btn pg-ghost pg-small pg-my-pal'); fb.type = 'button'; fb.id = 'pg-my-pal'; fb.hidden = mr.hidden;
      const d2 = h('i', 'pg-tro-new'); d2.id = 'pg-pal-new2'; d2.hidden = true; d2.setAttribute('aria-hidden', 'true');
      fb.append(h('span', '', PAL_TX.friend), d2);
      mr.parentNode.insertBefore(fb, mr);
      listen(fb, 'click', (e) => { e.preventDefault(); palOpen('hub'); });
      dom.myPal = fb;
    }
    try { for (const q of ['.pg-fw-body', '.pg-fw-sign']) { const fw = document.querySelector('#pg-fontwarm ' + q); if (fw && fw.textContent.indexOf(PAL_TX.rank) < 0) fw.textContent += ' ' + PAL_TEXT + ' ' + IV_TEXT; } } catch (e) { /* ignore */ }
    // (친구 초대: the room's 친구 초대 beside 코드 복사 - a host in its room phase, signed in or on a preview)
    const side = $('pg-room') && $('pg-room').querySelector('.pg-room-side'), cp = $('pg-copy');
    if (side && !$('pg-room-iv')) {
      const ib = h('button', 'pg-btn pg-ghost pg-small pg-room-iv', IV_TX.room); ib.type = 'button'; ib.id = 'pg-room-iv'; ib.hidden = true;
      side.insertBefore(ib, cp ? cp.nextSibling : side.firstChild);
      listen(ib, 'click', (e) => { e.preventDefault(); palOpen('room'); });
      dom.roomIv = ib;
    }
    if (palDemoOn()) palDemoStart();
    palDots();
  }
  // the dots: requests are waiting (here and on the title's badge)
  function palDots() {
    const on = PAL.reqs.length > 0, iv = ivWaiting(), req = on ? ' · 받은 요청 ' + PAL.reqs.length + '개' : '';
    for (const [id, v] of [['pg-pal-new', on], ['pg-pal-new2', on || iv]]) { const d = $(id); if (d && d.hidden === v) d.hidden = !v; }
    const b = $('pg-pal-btn'), aria = PAL_TX.title + req;
    if (b && b.getAttribute('aria-label') !== aria) b.setAttribute('aria-label', aria);
    const fa = PAL_TX.friend + req + (iv ? ' · ' + PAL_TX.ivWait : '');
    if (dom.myPal && dom.myPal.getAttribute('aria-label') !== fa) dom.myPal.setAttribute('aria-label', fa);
    if (dom.troNew && TRO.s) dom.troNew.hidden = !!TRO.s.seen && !on;
  }
  function palBtn(cls, txt, id) { const b = h('button', 'pg-btn ' + cls, txt); b.type = 'button'; if (id) b.id = id; return b; }
  function palBuild() {
    if (PAL.dom) return PAL.dom;
    const stage = $('pg-stage'); if (!stage) return null;
    const sec = h('section', 'pg-panel pg-pal'); sec.id = 'pg-pal'; sec.hidden = true; sec.setAttribute('aria-labelledby', 'pg-pal-h');
    const card = h('div', 'pg-card pg-pcard pg-pal-card');
    const head = h('div', 'pg-pal-head'), hd = h('h2', 'pg-h2', PAL_TX.title); hd.id = 'pg-pal-h';
    const chip = h('p', 'pg-pal-code'); chip.id = 'pg-pal-code';
    const mine = h('b'); mine.id = 'pg-pal-mine';
    const cin = h('input', 'pg-input pg-pal-copyin'); cin.id = 'pg-pal-copyin'; cin.readOnly = true; cin.hidden = true; cin.setAttribute('aria-label', PAL_TX.code);
    const copy = palBtn('pg-ghost pg-small pg-pal-copy', PAL_TX.copy, 'pg-pal-copy');
    chip.append(h('span', 'pg-pal-codel', PAL_TX.code), mine, cin, copy);
    head.append(hd, chip);
    const form = h('form', 'pg-pal-add'); form.id = 'pg-pal-add'; form.noValidate = true; form.setAttribute('autocomplete', 'off');
    const inp = h('input', 'pg-input pg-pal-in'); inp.id = 'pg-pal-in'; inp.type = 'text'; inp.maxLength = 9; inp.placeholder = PAL_TX.ph;
    for (const [k, v] of [['autocapitalize', 'characters'], ['autocomplete', 'off'], ['autocorrect', 'off'], ['spellcheck', 'false'], ['enterkeyhint', 'send'], ['aria-label', PAL_TX.ph]]) inp.setAttribute(k, v);
    const send = h('button', 'pg-btn pg-pal-send', PAL_TX.send); send.type = 'submit'; send.id = 'pg-pal-send';
    form.append(inp, send);
    const msg = h('p', 'pg-pal-msg'); msg.id = 'pg-pal-msg'; msg.setAttribute('aria-live', 'polite');
    const note = h('p', 'pg-pal-note'); note.id = 'pg-pal-note';
    const body = h('div', 'pg-pal-body'); body.id = 'pg-pal-body';
    const rqBox = h('section', 'pg-pal-sec pg-pal-rqs'); rqBox.id = 'pg-pal-rqs'; rqBox.setAttribute('aria-labelledby', 'pg-pal-rqh');
    const rqH = h('h3', '', PAL_TX.reqs); rqH.id = 'pg-pal-rqh';
    const rq = h('ul', 'pg-pal-list'); rq.id = 'pg-pal-rq';
    rqBox.append(rqH, rq);
    const rkBox = h('section', 'pg-pal-sec pg-pal-rank'); rkBox.id = 'pg-pal-rank'; rkBox.setAttribute('aria-labelledby', 'pg-pal-rkh');
    const rkH = h('h3', '', PAL_TX.rank); rkH.id = 'pg-pal-rkh';
    const list = h('ol', 'pg-pal-list'); list.id = 'pg-pal-list';
    const line = h('p', 'pg-pal-line'); line.id = 'pg-pal-line';
    const retry = palBtn('pg-ghost pg-small pg-pal-retry', PAL_TX.retry, 'pg-pal-retry');
    rkBox.append(rkH, list, line, retry);
    body.append(rqBox, rkBox);
    const guest = h('div', 'pg-pal-guest'); guest.id = 'pg-pal-guest';
    const gl = h('p', 'pg-pal-gline'); gl.id = 'pg-pal-gline';
    const login = palBtn('pg-pal-login', PAL_TX.login, 'pg-pal-login');
    guest.append(gl, login);
    const foot = h('div', 'pg-pal-foot');
    const ref = palBtn('pg-ghost', PAL_TX.refresh, 'pg-pal-refresh'), close = palBtn('', PAL_TX.close, 'pg-pal-close');
    foot.append(ref, close);
    card.append(head, form, msg, note, body, guest, foot);
    sec.appendChild(card);
    stage.insertBefore(sec, dom.hub && dom.hub.parentNode === stage ? dom.hub : null);
    dom.pal = sec;
    PAL.dom = { sec, card, chip, mine, cin, copy, form, inp, send, msg, note, body, rqBox, rqH, rq, list, line, retry, guest, gl, login, ref, close };
    const on = (el, fn) => listen(el, 'click', (e) => { e.preventDefault(); if (el.getAttribute('aria-disabled') === 'true') return; fn(e); });
    listen(form, 'submit', (e) => { e.preventDefault(); if (send.getAttribute('aria-disabled') !== 'true') palAdd(inp.value); });
    listen(inp, 'input', () => { const v = inp.value.toUpperCase(); if (v !== inp.value) inp.value = v; });
    on(copy, palCopy); on(close, palClose); on(login, () => clClick());
    on(ref, () => palLoadIf(true));
    on(retry, () => { if (PAL.code) palLoadIf(true); else { PAL.bootErr = ''; palCloud(); palBoot(); } });
    // (the rows' buttons: data-act on the button, data-uid on its row)
    listen(body, 'click', (e) => {
      const b = e.target && e.target.closest ? e.target.closest('button[data-act]') : null; if (!b) return;
      e.preventDefault();
      if (b.getAttribute('aria-disabled') === 'true') return;
      const li = b.closest('[data-uid]'), x = li ? li.dataset.uid : '', a = b.dataset.act, r = PAL.reqs.find((q) => q.uid === x);
      if (a === 'acc') palAccept(r);
      else if (a === 'dec') palDecline(r);
      else if (a === 'cut') { PAL.ask = x; PAL.focus = 'cutno'; palRender(); }
      else if (a === 'cutno') { PAL.ask = ''; PAL.focus = 'cut:' + x; palRender(); }
      else if (a === 'cutok') palCut(x);
      else if (a === 'iv') ivInvite(x);
    });
    return PAL.dom;
  }
  // (from 'room': the room's 친구 초대 - 닫기 goes back to the room)
  function palOpen(from) {
    firstGesture();
    if (!palBuild()) return;
    PAL.open = true; PAL.ask = ''; PAL.msg = ''; clearTimeout(PAL.msgT); PAL.dom.inp.value = ''; PAL.dom.cin.hidden = true;
    PAL.from = from === 'room' && NET.sess && NET.screen === 'room' ? 'room' : from === 'hub' && shownOverlay === 'hub' ? 'hub' : '';
    showOverlay('pal');
    if (palDemoOn()) { palDemoStart(); ivDemoStage(); }
    else {
      PAL.waits = 0; palCloud();
      if (palOn()) { if (PAL.code) palLoadIf(); else { PAL.bootErr = ''; palBoot(); } }
      palKick();
    }
    palRender();
    // (the code field first - not on touch, where the keyboard would cover the list)
    setTimeout(() => {
      if (shownOverlay !== 'pal' || touchMode || G.manual) return;
      const D = PAL.dom, t = !D.form.hidden ? D.inp : !D.guest.hidden && !D.login.hidden ? D.login : D.close;
      try { t.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }, 40);
  }
  // 닫기 / Escape: back to 내 기록 (which goes back where it came from) - or to the room / 마이페이지 it was opened from
  function palClose() {
    if (shownOverlay !== 'pal') return;
    PAL.open = false; PAL.ask = '';
    if (PAL.from === 'hub') { PAL.from = ''; openHub('my', HUB.from, 'pal'); return; }
    if (PAL.from === 'room' && NET.sess && NET.screen === 'room') {
      PAL.from = ''; showOverlay('room'); renderRoom();
      setTimeout(() => { if (shownOverlay === 'room' && !touchMode) try { const b = $('pg-room-iv'); if (b && !b.hidden) b.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 60);
      return;
    }
    PAL.from = '';
    showOverlay('rec');
    setTimeout(() => { if (shownOverlay === 'rec' && !touchMode) try { const b = $('pg-pal-btn'); if (b) b.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 60);
  }
  function palRowEl(r, i) {
    const li = h('li', 'pg-pal-row' + (r.me ? ' is-me' : '')); li.dataset.uid = r.uid;
    const rk = h('b', 'pg-pal-rk', String(i + 1)); rk.appendChild(h('span', 'pg-sr', '위'));
    const av = portraitCanvas(CHAR_IDS[r.c] || 'duck', 'portrait_', 32, r.lk); av.className = 'pg-pal-av'; av.setAttribute('aria-hidden', 'true');
    const nm = h('span', 'pg-pal-nm'); nm.appendChild(h('span', 'pg-pal-nick', r.nick)); if (r.me) nm.appendChild(h('small', 'pg-pal-me', PAL_TX.me));
    const st = h('span', 'pg-pal-st');
    st.append(h('span', 'pg-pal-tang', palStTx(r.st)), h('span', 'pg-pal-dot', '·'), h('span', 'pg-pal-hi', r.hi.toLocaleString('ko-KR') + '점'), h('span', 'pg-pal-dot', '·'), troChip(r.tr));
    li.append(rk, av, nm, st);
    if (!r.me) {
      const cut = h('button', 'pg-pal-cut', PAL_TX.cut); cut.type = 'button'; cut.dataset.act = 'cut'; cut.setAttribute('aria-label', r.nick + '님과 친구 끊기');
      if (PAL.busy) cut.setAttribute('aria-disabled', 'true');
      // (친구 초대: off while a call is in flight, my room is full or playing, or I am in someone else's room)
      const why = ivWhy(), iv = h('button', 'pg-pal-iv', PAL_TX.iv); iv.type = 'button'; iv.dataset.act = 'iv';
      iv.setAttribute('aria-label', r.nick + '님을 ' + (NET.mode === 'battle' ? IV_TX.battle : IV_TX.coop) + '에 초대');
      if (PAL.busy || IV.busy || why) iv.setAttribute('aria-disabled', 'true');
      if (why === 'full' || why === 'started') iv.title = PAL_TX[why === 'full' ? 'ivFull' : 'ivStarted'];
      const acts = h('span', 'pg-pal-racts'); acts.append(iv, cut);
      li.appendChild(acts);
    }
    if (PAL.ask === r.uid) {
      const ask = h('div', 'pg-pal-ask'), yes = palBtn('pg-small pg-pal-cutok', PAL_TX.cut), no = palBtn('pg-ghost pg-small', PAL_TX.cancel);
      yes.dataset.act = 'cutok'; no.dataset.act = 'cutno';
      ask.append(h('span', '', PAL_TX.ask.replace('{0}', r.nick)), yes, no); li.appendChild(ask);
    }
    return li;
  }
  function palReqEl(r) {
    const li = h('li', 'pg-pal-row pg-pal-rqrow'); li.dataset.uid = r.uid;
    const av = portraitCanvas(CHAR_IDS[r.c] || 'duck', 'portrait_', 32, r.lk); av.className = 'pg-pal-av'; av.setAttribute('aria-hidden', 'true');
    const nm = h('span', 'pg-pal-nm'); nm.append(h('span', 'pg-pal-nick', r.n), h('small', 'pg-pal-cd', palFmt(r.cd)));
    const acc = palBtn('pg-small', PAL_TX.accept), dec = palBtn('pg-ghost pg-small', PAL_TX.decline);
    acc.dataset.act = 'acc'; dec.dataset.act = 'dec'; acc.setAttribute('aria-label', r.n + '님의 친구 요청 수락'); dec.setAttribute('aria-label', r.n + '님의 친구 요청 거절');
    if (PAL.busy) { acc.setAttribute('aria-disabled', 'true'); dec.setAttribute('aria-disabled', 'true'); }
    const bs = h('span', 'pg-pal-acts'); bs.append(acc, dec);
    li.append(av, nm, bs);
    return li;
  }
  // the panel follows the state: guest (an invitation to sign in) / signed in without a card yet (loading, an error) /
  // the panel itself (my code, the add row, 받은 요청, the ranking)
  function palRender() {
    const D = PAL.dom; if (!D || !PAL.open) return;
    const demo = palDemoOn(), inn = demo || (CLOUD.on && CLOUD.st === 'in' && !!CLOUD.user), main = inn && !!PAL.code, busy = PAL.busy ? 'true' : 'false';
    D.chip.hidden = !main; D.form.hidden = !main; D.body.hidden = !inn; D.guest.hidden = inn; D.ref.hidden = !main || demo;
    setTxt(D.mine, palFmt(PAL.code));
    if (!inn) {
      const st = CLOUD.st, can = st === 'out' || st === 'relog' || st === 'load' || st === 'auth' || st === 'link';
      setTxt(D.gl, st === 'out' ? PAL_TX.guest : CL_TX[clLine()[0]] || PAL_TX.guest);
      D.login.hidden = !can;
      setTxt(D.login, st === 'out' ? PAL_TX.login : st === 'auth' && CLOUD.pop ? CL_BTN.again : CL_BTN[st] || PAL_TX.login);
      D.login.setAttribute('aria-disabled', st === 'load' || st === 'link' || (st === 'auth' && !CLOUD.pop) ? 'true' : 'false');
    }
    setTxt(D.msg, PAL.msg); D.msg.className = 'pg-pal-msg' + (PAL.msg ? (PAL.msgErr ? ' is-err' : ' is-ok') : '');
    setTxt(D.note, demo ? PAL_TX.demo : ''); D.note.hidden = !demo;
    D.send.setAttribute('aria-disabled', busy);
    // 받은 요청 (hidden while there is none)
    const rqKey = main ? JSON.stringify(PAL.reqs.map((r) => [r.uid, r.n, r.cd, r.c, r.lk])) + busy : '';
    D.rqBox.hidden = !main || !PAL.reqs.length;
    setTxt(D.rqH, PAL_TX.reqs + ' (' + PAL.reqs.length + ')');
    if (PAL.rqKey !== rqKey) { PAL.rqKey = rqKey; D.rq.textContent = ''; if (main) for (const r of PAL.reqs) D.rq.appendChild(palReqEl(r)); }
    // the ranking (or its line: loading / no friends yet / an error with 다시 시도)
    let line = '', again = false, rows = null;
    if (!inn) line = '';
    else if (!main) { line = PAL.bootErr ? PAL_TX[PAL.bootErr] : PAL_TX.loading; again = !!PAL.bootErr && !PAL.booting; }
    else if (PAL.err) { line = PAL_TX[PAL.err]; again = !PAL.loading; }
    else if (!PAL.rows) line = PAL_TX.loading;
    else { rows = palRank(); if (!PAL.rows.length) line = PAL_TX.empty; }
    const key = rows ? JSON.stringify(rows.map((r) => [r.uid, r.nick, r.st, r.hi, r.tr, r.c, r.lk])) + PAL.ask + busy + ivWhy() + (IV.busy ? '+' : '') + NET.mode : '';
    D.list.hidden = !rows;
    if (PAL.key !== key) { PAL.key = key; D.list.textContent = ''; if (rows) rows.forEach((r, i) => D.list.appendChild(palRowEl(r, i))); }
    setTxt(D.line, line); D.line.hidden = !line; D.line.className = 'pg-pal-line' + (again ? ' is-err' : '');
    D.retry.hidden = !again;
    D.ref.setAttribute('aria-disabled', PAL.loading || clNow() - PAL.loadAt < PAL_REFRESH_MS ? 'true' : 'false');
    // (a row's buttons came back: the focus goes where the inline 끊기 question asked)
    if (PAL.focus) {
      const f = PAL.focus; PAL.focus = '';
      const el = f.indexOf('cut:') === 0 ? D.list.querySelector('[data-uid="' + f.slice(4) + '"] button[data-act="cut"]') : D.list.querySelector('button[data-act="' + f + '"]');
      try { if (el) el.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
  }
  // ---- 친구 초대 (design/friends.md "As built (invites)"): 친구 순위's 초대 on a friend's row - my room (made now the
  // normal way when I have none: netHost with my mode and options, then the room screen) and an invite into it,
  // invites/{friend}/in/{me} {code, mode, nick, at}, with my ivbox bumped in the same batch (one write per 10 s); the
  // room's 친구 초대 opens 친구 순위 over it. Signed in: one listener on my own invites (stopped on sign-out / another
  // account); the newest younger than 10 minutes is a banner over the menus (never in a game, a room or the login
  // screen) - 참여 joins with its code (netJoin, as typed), 나중에 lets it go; both, and an expired one seen, delete it.
  // Closing my room deletes the invites I sent into it. A PR preview: 초대 makes the room and says nothing was sent, and
  // one staged invite shows when 친구 순위 first opens. The artifact has none of it
  const IV_MS = 600000, IV_GAP_MS = 10000, IV_LIST = 50, IV_RETRY_MS = 60000, IV_DEMO_MS = 1500;
  const IV_TX = { ask: '같이 하자고 해요', join: '참여', later: '나중에', coop: '같이 하기', battle: '배틀', room: '친구 초대', demo: '미리보기 · 예시 초대예요',
    demoJoin: '미리보기라 예시 초대로는 참여할 수 없어요' };
  const IV_TEXT = Object.keys(IV_TX).map((k) => IV_TX[k]).join(' ') + ' 이가 님의 방에 참여 초대';
  const IV_WHERE = { title: 1, rec: 1, pal: 1, hub: 1, friends: 1, over: 1, ending: 1 };
  const IV = { un: null, uid: '', gen: 0, errAt: 0, list: [], gone: new Set(), sentAt: 0, busy: false, out: [], dom: null, cur: null, t: 0, demo: null, staged: false, said: '' };
  const ivKey = (v) => v.from + ':' + v.at;
  const ivCol = (u) => CLOUD.db.collection('invites').doc(u).collection('in');
  // 이 / 가 after a nick: 이 after a final consonant (받침), else 가
  const ivJosa = (n) => { const c = String(n).charCodeAt(String(n).length - 1); return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? '이' : '가'; };
  // why 초대 is off now: '' | 'busy' (a room on its way) | 'guest' (in someone else's room) | 'started' | 'full'
  function ivWhy() {
    if (!NET.sess) return NET.busy ? 'busy' : '';
    if (NET.role !== 'host') return 'guest';
    if (NET.ph !== 'room' || NET.screen !== 'room') return 'started';
    return NET.roster.length >= MAX_PLAYERS ? 'full' : '';
  }
  // the listener follows the account (palCloud); a failure (offline, the rules not published) is tried again a minute on
  function ivSync() {
    const uid = palOn() ? CLOUD.user.uid : '';
    if (uid && uid === IV.uid && (IV.un || clNow() - IV.errAt < IV_RETRY_MS)) return;
    if (!uid && !IV.uid && !IV.un) return;
    ivStop();
    if (!uid) return;
    const gen = IV.gen; IV.uid = uid;
    const fail = () => { if (gen !== IV.gen) return; IV.un = null; IV.errAt = clNow(); };
    try { IV.un = ivCol(uid).limit(IV_LIST).onSnapshot((qs) => { if (gen === IV.gen) ivTake(qs); }, fail); } catch (e) { fail(); }
  }
  function ivStop() {
    IV.gen++;
    if (IV.un) { try { IV.un(); } catch (e) { /* ignore */ } }
    Object.assign(IV, { un: null, uid: '', errAt: 0, list: [], out: [], sentAt: 0 });
    ivShow();
  }
  // my invites as the server has them: well-formed ones younger than 10 minutes, newest first (older ones deleted)
  function ivTake(qs) {
    const now = clNow(), out = [];
    for (const d of palDocs(qs)) {
      let x = null; try { x = d.data(); } catch (e) { x = null; }
      const from = d && typeof d.id === 'string' ? d.id : '', at = x ? palTs(x.at) : 0;
      if (!from || !x || !at || typeof x.code !== 'string' || !/^[a-z0-9]{4}$/.test(x.code) || (x.mode !== 'coop' && x.mode !== 'battle')) continue;
      const v = { from, code: x.code, mode: x.mode, nick: palNick(x.nick), at };
      if (now - at >= IV_MS) { if (!IV.gone.has(ivKey(v))) { IV.gone.add(ivKey(v)); ivDel(from); } continue; }
      out.push(v);
    }
    out.sort((a, b) => b.at - a.at);
    IV.list = out; ivShow();
  }
  // an invite waiting for me (the staged one on a preview too): 마이페이지's 친구 dot
  function ivWaiting() {
    if (IV.demo && !IV.gone.has(ivKey(IV.demo))) return true;
    const now = clNow();
    return IV.list.some((v) => !IV.gone.has(ivKey(v)) && now - v.at < IV_MS);
  }
  function ivDel(from) {
    if (!palOn() || !IV.uid || IV.uid !== CLOUD.user.uid) return;
    try { ivCol(IV.uid).doc(from).delete().catch(() => { /* (offline, gone already: it expires) */ }); } catch (e) { /* ignore */ }
  }
  // the banner: the newest live invite, over the menus only, never while I am in a room or on my way into one
  function ivShow() {
    clearTimeout(IV.t); IV.t = 0;
    const now = clNow();
    let cur = IV.demo && !IV.gone.has(ivKey(IV.demo)) ? IV.demo : null;
    if (!cur) for (const v of IV.list) if (!IV.gone.has(ivKey(v)) && now - v.at < IV_MS) { cur = v; break; }
    IV.cur = cur && !NET.sess && !NET.busy && IV_WHERE[shownOverlay] ? cur : null;
    if (IV.cur) ivPaint(IV.cur);
    else if (IV.dom && !IV.dom.el.hidden) IV.dom.el.hidden = true;
    palDots(); // (마이페이지's 친구 dot: an invite waiting)
    if (cur && !cur.demo) IV.t = setTimeout(() => { IV.t = 0; if (!stopped) ivShow(); }, clT(Math.max(50, IV_MS - (now - cur.at) + 20)));
  }
  function ivBuild() {
    if (IV.dom) return IV.dom;
    const stage = $('pg-stage'); if (!stage) return null;
    const el = h('div', 'pg-iv'); el.id = 'pg-iv'; el.hidden = true; el.setAttribute('role', 'group'); el.setAttribute('aria-labelledby', 'pg-iv-tx');
    const av = h('span', 'pg-iv-av'); av.setAttribute('aria-hidden', 'true');
    const tx = h('p', 'pg-iv-tx'); tx.id = 'pg-iv-tx'; tx.setAttribute('aria-live', 'polite');
    const join = palBtn('pg-small pg-iv-join', IV_TX.join, 'pg-iv-join'), later = palBtn('pg-ghost pg-small pg-iv-later', IV_TX.later, 'pg-iv-later');
    const acts = h('span', 'pg-iv-acts'); acts.append(join, later);
    el.append(av, tx, acts);
    // (a zero-height strip across the stage's top: the banner's container - a small stage, such as the 1x screen,
    // stacks its buttons under the line)
    const wrap = h('div', 'pg-iv-wrap'); wrap.appendChild(el);
    stage.appendChild(wrap);
    listen(join, 'click', (e) => { e.preventDefault(); ivJoin(); });
    listen(later, 'click', (e) => { e.preventDefault(); ivLater(); });
    IV.dom = { el, av, tx, join, later, key: '' };
    return IV.dom;
  }
  function ivPaint(v) {
    const D = ivBuild(); if (!D) return;
    // (a friend in my list: its bust, and its nick as my list has it)
    const fr = (PAL.rows || []).find((q) => q.uid === v.from && !q.me), nick = fr ? fr.nick : v.nick, mode = v.mode === 'battle' ? IV_TX.battle : IV_TX.coop;
    const key = [v.from, v.at, nick, mode, fr ? fr.c + fr.lk : '', v.demo ? 1 : 0].join('|');
    if (D.key !== key) {
      D.key = key; D.av.textContent = ''; D.tx.textContent = '';
      if (fr) { const cv = portraitCanvas(CHAR_IDS[fr.c] || 'duck', 'portrait_', 32, fr.lk); cv.className = 'pg-iv-cv'; D.av.appendChild(cv); }
      const md = h('span', 'pg-iv-mode' + (v.mode === 'battle' ? ' is-battle' : ''), mode);
      D.tx.append(h('b', '', nick), document.createTextNode(ivJosa(nick) + ' ' + IV_TX.ask + ' '), h('span', 'pg-iv-dot', '·'), document.createTextNode(' '), md);
      if (v.demo) D.tx.appendChild(h('small', '', IV_TX.demo));
      D.join.setAttribute('aria-label', nick + '님의 ' + mode + ' 방에 참여');
    }
    if (D.el.hidden) D.el.hidden = false;
  }
  // 참여: 친구와 하기 with the code, joined at once (the normal netJoin: a full / gone room says so there)
  function ivJoin() {
    const v = IV.cur; if (!v) return;
    firstGesture();
    IV.gone.add(ivKey(v)); IV.said = 'join';
    if (v.demo) { IV.demo = null; netOpenFriends(IV_TX.demoJoin); if (dom.code) dom.code.value = v.code.toUpperCase(); ivShow(); return; }
    ivDel(v.from);
    netOpenFriends('');
    if (dom.code) dom.code.value = v.code.toUpperCase();
    ivShow();
    netJoin(v.code);
  }
  function ivLater() {
    const v = IV.cur; if (!v) return;
    IV.gone.add(ivKey(v)); IV.said = 'later';
    if (v.demo) IV.demo = null; else ivDel(v.from);
    ivShow();
  }
  // what 초대 says: in 친구 순위 while it shows, else on the room's line
  function ivSay(key, a) {
    IV.said = key;
    if (shownOverlay === 'pal') palSay(key, a);
    else if (NET.sess && NET.screen === 'room' && PAL_TX[key]) { troMsgSet(PAL_TX[key].replace('{0}', a === undefined ? '' : String(a))); renderRoom(); }
  }
  // 초대 on friend x's row: my room (none: one made now) and the invite into it
  async function ivInvite(x) {
    const r = (PAL.rows || []).find((q) => q.uid === x && !q.me), demo = palDemoOn();
    if (!r || IV.busy || PAL.busy || (!demo && !palOn())) return;
    const why = ivWhy();
    if (why) { ivSay(why === 'full' ? 'ivFull' : why === 'started' ? 'ivStarted' : 'later'); return; }
    if (!demo && IV.sentAt && clNow() - IV.sentAt < IV_GAP_MS) { ivSay('ivWait'); return; }
    const gen = PAL.gen;
    let code = NET.sess ? NET.code : '', key = '', arg;
    IV.busy = true; palRender();
    try {
      if (!code) {
        code = await netHost();                 // (the normal way: my mode and options; the room screen when it worked)
        if (!code) { key = 'ivNet'; arg = NET.err || PAL_TX.ivFail; return; }
      }
      if (demo) { key = 'ivDemo'; return; }
      if (gen !== PAL.gen || !palOn()) return;
      const me = CLOUD.user.uid, ts = FV().serverTimestamp(), b = CLOUD.db.batch();
      b.set(palDoc('ivbox', me), { at: ts });
      b.set(ivCol(x).doc(me), { code, mode: NET.mode === 'battle' ? 'battle' : 'coop', nick: cleanNick(NET.nick) || '손님', at: ts });
      await b.commit();
      if (gen !== PAL.gen) return;
      IV.sentAt = clNow(); IV.out = IV.out.filter((o) => o.to !== x).concat([{ to: x, code }]);
      key = 'ivSent'; arg = r.nick;
    } catch (e) { key = palErrKey(e) === 'offline' ? 'offline' : 'ivFail'; }
    finally {
      IV.busy = false;
      if (key) ivSay(key, arg);
      if (PAL.open) palRender();
    }
  }
  // my room closed: the invites I sent into it are deleted (the sender may)
  function ivClosed() {
    const out = IV.out; IV.out = [];
    if (!out.length || !palOn()) return;
    try { const b = CLOUD.db.batch(), me = CLOUD.user.uid; for (const o of out) b.delete(ivCol(o.to).doc(me)); b.commit().catch(() => { /* (they expire) */ }); } catch (e) { /* ignore */ }
  }
  // (a PR preview: one staged invite from the first demo friend, the first time 친구 순위 opens)
  function ivDemoStage() {
    if (IV.staged || !palDemoOn()) return;
    IV.staged = true;
    setTimeout(() => { if (stopped) return; const f = PAL_DEMO.rows[0]; IV.demo = { from: f.uid, code: 'pv12', mode: 'coop', nick: f.nick, at: clNow(), demo: true }; ivShow(); }, clT(IV_DEMO_MS));
  }
  // ---- PG.debug.pal (tests)
  function palDebugApi() {
    const D = () => PAL.dom;
    const api = {
      state: () => ({ on: CLOUD.on || !!PREVIEW, demo: palDemoOn(), palOn: palOn(), key: palKey(), uid: PAL.uid, code: PAL.code, prof: PAL.prof ? Object.assign({}, PAL.prof) : null, run: PAL.run,
        local: palLocal(), busy: PAL.busy, rows: PAL.rows ? PAL.rows.map((r) => ({ uid: r.uid, nick: r.nick, st: r.st, hi: r.hi, tr: r.tr, c: r.c, lk: r.lk })) : null,
        reqs: PAL.reqs.map((r) => ({ uid: r.uid, n: r.n, cd: r.cd })), at: PAL.at, err: PAL.err, bootErr: PAL.bootErr, booting: !!PAL.booting, loading: !!PAL.loading,
        msg: PAL.msg, said: PAL.said, open: PAL.open, shown: shownOverlay === 'pal', made: !!PAL.dom, btn: !!$('pg-pal-btn'), dot: !!$('pg-pal-new') && !$('pg-pal-new').hidden,
        myBtn: !!dom.myPal, myShown: !!dom.myPal && !dom.myPal.hidden, myDot: !!$('pg-pal-new2') && !$('pg-pal-new2').hidden, palFrom: PAL.from || '',
        badgeDot: !!dom.troNew && !dom.troNew.hidden, debounce: !!PAL.t, writing: !!PAL.wr, gen: PAL.gen, ask: PAL.ask, mute: sget(palMuteKey()) || '',
        view: !D() ? '' : !D().guest.hidden ? 'guest' : !D().form.hidden ? 'main' : 'wait',
        line: D() && !D().line.hidden ? D().line.textContent : '', gline: D() && !D().guest.hidden ? D().gl.textContent : '', note: D() && !D().note.hidden ? D().note.textContent : '',
        list: D() && !D().list.hidden ? Array.from(D().list.children).map((li) => li.textContent) : [], reqRows: D() && !D().rqBox.hidden ? Array.from(D().rq.children).map((li) => li.textContent) : [] }),
      card: () => palCard(), text: () => PAL_TEXT, texts: () => Object.assign({}, PAL_TX), stageTx: palStTx, rank: () => palRank(),
      open() { palOpen(); return api.state(); }, close() { palClose(); return api.state(); },
      add: (c) => palAdd(c).then(() => api.state()),
      accept: (uid) => palAccept(PAL.reqs.find((q) => q.uid === uid)).then(() => api.state()),
      decline(uid) { palDecline(PAL.reqs.find((q) => q.uid === uid)); return api.state(); },
      cut: (uid) => palCut(uid).then(() => api.state()),
      ask(uid) { PAL.ask = uid; palRender(); return api.state(); },
      load: (force) => palLoadIf(!!force).then(() => api.state()),
      boot: () => palBoot().then(() => api.state()),
      kick() { palKick(); return api.state(); }, write: () => palWrite().then(() => api.state()),
      // (tests) the cooldown's clock as if the last request were long ago
      unwait() { PAL.rqAt = 0; return api.state(); },
      // 친구 초대: the listener, my live invites, the banner; 초대 / 참여 / 나중에 as the buttons do them
      iv: () => ({ on: !!IV.un, uid: IV.uid, list: IV.list.map((v) => Object.assign({}, v)), shown: !!IV.dom && !IV.dom.el.hidden, text: IV.dom && !IV.dom.el.hidden ? IV.dom.tx.textContent : '',
        cur: IV.cur ? IV.cur.from : '', demo: !!IV.demo, said: IV.said, busy: IV.busy, why: ivWhy(), out: IV.out.map((o) => Object.assign({}, o)), roomBtn: !!dom.roomIv && !dom.roomIv.hidden, from: PAL.from || '' }),
      invite: (uid) => ivInvite(uid).then(() => api.iv()),
      ivJoin() { ivJoin(); return api.iv(); }, ivLater() { ivLater(); return api.iv(); },
      ivUnwait() { IV.sentAt = 0; return api.iv(); },
      openFromRoom() { palOpen('room'); return api.state(); },
    };
    return api;
  }

  // ------------------------------------------------------------------ attract-mode autopilot
  function autopilot() {
    const p = G.p, a = G.ap || (G.ap = { dir: 1, stuck: 0, lastX: p.x, jumpT: 0 });
    const inp = { left: false, right: false, jump: false, shoot: false, jumpP: false, shootP: false };
    let target = null, pop = false;
    for (const b of G.bubbles) if (b.kind === 'trapped' && b.state === 'float') { target = b; pop = true; break; }
    if (!target) {
      let best = 1e9;
      for (const e of G.enemies) if (e.state === 'active') { const d = Math.abs(e.x - p.x) + Math.abs(e.y - p.y) * 2; if (d < best) { best = d; target = e; } }
    }
    if (target) {
      const dx = target.x - p.x, dy = target.y - p.y;
      if (pop) { if (Math.abs(dx) > 3) a.dir = sign(dx); if (dy < -6 && Math.abs(dx) < 20 && p.onGround) inp.jumpP = inp.jump = true; }
      else {
        if (Math.abs(dy) < 10) { a.dir = Math.abs(dx) < 34 ? -sign(dx) || a.dir : sign(dx); if (Math.abs(dx) < 100 && sign(dx) === p.facing && p.shootCd === 0) inp.shootP = inp.shoot = true; }
        else if (Math.abs(dx) > 8) a.dir = sign(dx);
        if (dy < -14 && p.onGround && G.frame % 30 === 0) inp.jumpP = inp.jump = true;
      }
    }
    if (Math.abs(p.x - a.lastX) < 0.1 && p.onGround) a.stuck++; else a.stuck = 0;
    a.lastX = p.x;
    if (a.stuck > 20) { a.dir = -a.dir || 1; a.stuck = 0; inp.jumpP = inp.jump = true; }
    if (a.dir > 0) inp.right = true; else inp.left = true;
    return inp;
  }

  // ------------------------------------------------------------------ input
  // keyboard + touch drive this screen's own player (G.localSlot); PG.debug.press() can drive any slot
  const ACTIONS = ['left', 'right', 'jump', 'shoot', 'down'];
  const keys = { left: false, right: false, jump: false, shoot: false, down: false };
  const touchIn = { left: false, right: false, jump: false, shoot: false, down: false };
  // the left thumb's floating joystick (#pg-stick-zone, page.html): a touch anywhere in the zone puts the ring under the
  // thumb; the knob follows the thumb up to the ring's edge (further, the ring slides after it, so a turn-around is never
  // more than one radius away); its sideways lean drives left / right with a dead zone and hysteresis (on past 0.3 of
  // the radius, off under 0.2: a thumb resting near the middle never flickers). Pushing up does NOT jump: a walking thumb
  // drifts up and down, and every drift would be a jump (or a 꾹 glide / 두 번 move); 점프 is the right thumb's own
  // button. Pulled clearly DOWN it is 내려가기 (↓): on past 0.6 of the radius and within ~27° of straight down (down
  // >= 2 x sideways), off under 0.45 or once more sideways than down - a walking thumb, even one sagging low, never
  // drops; left / right keep working while it is on. One finger owns the stick (another finger in the zone is
  // ignored); 점프 / 거품 are other elements with their own pointers, so both thumbs work at once
  const STICK = { id: null, ox: 0, oy: 0, zl: 0, zt: 0, R: 50, dx: 0, dy: 0, nx: 0, ny: 0, dir: 0, dn: false };
  const STICK_ON = 0.3, STICK_OFF = 0.2, STICK_DN_ON = 0.6, STICK_DN_OFF = 0.45;
  function stickDir(nx, dir) {
    if (dir && dir * nx >= STICK_OFF) return dir;
    return nx >= STICK_ON ? 1 : nx <= -STICK_ON ? -1 : 0;
  }
  function stickDown(nx, ny, on) {
    if (on) return ny >= STICK_DN_OFF && ny >= Math.abs(nx);
    return ny >= STICK_DN_ON && ny >= 2 * Math.abs(nx);
  }
  function stickApply() {
    touchIn.left = STICK.dir < 0; touchIn.right = STICK.dir > 0; touchIn.down = STICK.dn;
    if (dom.stick) { dom.stick.classList.toggle('is-l', STICK.dir < 0); dom.stick.classList.toggle('is-r', STICK.dir > 0); dom.stick.classList.toggle('is-d', STICK.dn); }
  }
  function stickMove(cx, cy) {
    let dx = cx - STICK.zl - STICK.ox, dy = cy - STICK.zt - STICK.oy;
    const R = STICK.R, d = Math.hypot(dx, dy);
    if (d > R) { const k = (d - R) / d; STICK.ox += dx * k; STICK.oy += dy * k; dx -= dx * k; dy -= dy * k; }
    STICK.dx = dx; STICK.dy = dy; STICK.nx = dx / R; STICK.ny = dy / R;
    STICK.dir = stickDir(STICK.nx, STICK.dir); STICK.dn = stickDown(STICK.nx, STICK.ny, STICK.dn);
    stickApply();
    if (dom.stick) { const b = dom.stick.style; b.left = (STICK.ox - R).toFixed(1) + 'px'; b.top = (STICK.oy - R).toFixed(1) + 'px'; b.bottom = 'auto'; }
    if (dom.stickKnob) dom.stickKnob.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
  }
  // (a lifted / cancelled thumb, blur, a hidden page, the rotate screen: the stick lets go and goes back to rest)
  function stickReset() {
    STICK.id = null; STICK.dir = 0; STICK.nx = 0; STICK.ny = 0; STICK.dx = 0; STICK.dy = 0; STICK.dn = false;
    touchIn.left = false; touchIn.right = false; touchIn.down = false;
    if (dom.stickZone) dom.stickZone.classList.remove('is-on');
    if (dom.stick) { dom.stick.classList.remove('is-l', 'is-r', 'is-d'); const b = dom.stick.style; b.left = ''; b.top = ''; b.bottom = ''; }
    if (dom.stickKnob) dom.stickKnob.style.transform = '';
  }
  const dbgIns = [0, 1, 2, 3].map(() => ({ left: false, right: false, jump: false, shoot: false, down: false }));
  const latch = { jump: false, shoot: false };
  const prevIns = [0, 1, 2, 3].map(() => ({ jump: false, shoot: false }));
  function readInputs() {
    const out = [];
    for (let s = 0; s < MAX_PLAYERS; s++) {
      const d = dbgIns[s], mine = s === G.localSlot && !G.menuOpen, i = {};
      for (const k of ACTIONS) i[k] = !!(d[k] || (mine && (keys[k] || touchIn[k])));
      i.jumpP = (i.jump && !prevIns[s].jump) || (mine && latch.jump);
      i.shootP = (i.shoot && !prevIns[s].shoot) || (mine && latch.shoot);
      prevIns[s] = { jump: i.jump, shoot: i.shoot };
      out.push(i);
    }
    latch.jump = latch.shoot = false;
    return out;
  }

  // ------------------------------------------------------------------ fixed update
  // (tests: PG.debug.mp.tap(fn) - fn() before each world frame, with the players where this screen draws them)
  let netTap = null;
  function update() {
    if (netTap) { const sw = G.online && G.role === 'host' ? hostDisplayIn() : null; try { netTap(); } catch (e) { /* the driver's */ } finally { if (sw) hostDisplayOut(sw); } }
    const ins = readInputs();
    // online guest: no world simulation here, only our own animal + the host's world drawn from its snapshots
    if (G.online && G.role === 'guest') { guestUpdate(ins); updateWords(); updateWisps(); return; }
    if (G.mode === 'paused') return;
    if (G.online) hostInputs(ins);
    G.frame++;
    if (G.shake > 0) { G.shake *= 0.86; if (G.shake < 0.3) G.shake = 0; }
    switch (G.mode) {
      case 'title': updateWorld([autopilot()]); break;
      case 'playing': updateWorld(ins); break;
      case 'dying': updateDying(); break;
      case 'transition': updateTransition(); break;
      case 'countdown': updateCountdown(); break;
      case 'podium': updatePodium(); break;
      default: updateFx(); break;
    }
    if (G.bannerQ.length && (!G.banner || G.frame >= G.banner.end) && (G.mode === 'playing' || G.mode === 'dying')) {
      const q = G.bannerQ.shift(); showBanner(q.main, q.sub, q.dur, q.cls);
    }
    updateWords();
    updateWisps();
    if (NET.sess) netFrame();
  }

  // ------------------------------------------------------------------ rendering
  let canvas = null, ctx = null;
  function gapCols(map, row) { const g = []; for (let c = 2; c < COLS - 2; c++) if (map[row][c] === '.') g.push(c); return g; }
  function buildRoundCanvas(L) {
    const c = mk(W, PF_H), x = c.getContext('2d'), th = themeOf(L), map = L.map;
    x.imageSmoothingEnabled = false;
    x.fillStyle = th.bg; x.fillRect(0, 0, W, PF_H);
    for (let ty = 0; ty < PF_H; ty += 16) {
      for (let tx = 0; tx < W; tx += 16) {
        x.globalAlpha = 0.6; x.fillStyle = th.bgTile; x.fillRect(tx + 1, ty + 1, 15, 15);
        x.globalAlpha = 0.06; x.fillStyle = '#ffffff'; x.fillRect(tx + 1, ty + 1, 15, 1); x.fillRect(tx + 1, ty + 2, 1, 14);
      }
    }
    x.globalAlpha = 0.7; x.fillStyle = th.grout;
    for (let tx = 0; tx < W; tx += 16) x.fillRect(tx, 0, 1, PF_H);
    for (let ty = 0; ty < PF_H; ty += 16) x.fillRect(0, ty, W, 1);
    x.globalAlpha = 1;
    const g = x.createLinearGradient(0, 0, 0, PF_H);
    g.addColorStop(0, 'rgba(255,255,255,0.07)'); g.addColorStop(0.35, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
    x.fillStyle = g; x.fillRect(0, 0, W, PF_H);
    // pool interiors: a deeper shade behind the (translucent) water drawn over the actors each frame
    for (let r = 1; r < ROWS - 1; r++) for (let c2 = 2; c2 < COLS - 2; c2++) {
      const ch = map[r][c2]; if (!isLiquid(ch)) continue;
      x.fillStyle = 'rgba(0,10,20,0.3)'; x.fillRect(c2 * TS, r * TS, TS, TS);
    }
    const tf = frameOf(th.tile, 0);
    for (let r = 0; r < ROWS; r++) for (let c2 = 0; c2 < COLS; c2++) {
      if (map[r][c2] !== '#') continue;
      if (tf) x.drawImage(tf.c, c2 * TS, r * TS, TS, TS);
      else { x.fillStyle = '#7fd6c2'; x.fillRect(c2 * TS, r * TS, TS, TS); }
    }
    for (let r = 0; r < ROWS - 1; r++) for (let c2 = 2; c2 < COLS - 2; c2++) {
      if (map[r][c2] === '#' && map[r + 1][c2] === '.') {
        x.fillStyle = 'rgba(0,0,0,0.42)'; x.fillRect(c2 * TS, (r + 1) * TS, TS, 1);
        x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(c2 * TS + 1, (r + 1) * TS + 1, TS, 1);
      }
    }
    x.fillStyle = 'rgba(0,0,0,0.28)';
    for (let r = 1; r < ROWS - 1; r++) { if (map[r][2] === '.') x.fillRect(WALL_L, r * TS, 1, TS); if (map[r][COLS - 3] === '.') x.fillRect(WALL_R - 1, r * TS, 1, TS); }
    // the wrap gaps: a drain grate (배수구) in the floor, a shower pipe mouth in the ceiling
    const gf = gapCols(map, ROWS - 1), gc = gapCols(map, 0);
    const df = frameOf('drain', 0);
    if (gf.length) {
      const x0 = gf[0] * TS, x1 = (gf[gf.length - 1] + 1) * TS, y0 = (ROWS - 1) * TS;
      x.fillStyle = '#0c1416'; x.fillRect(x0, y0, x1 - x0, TS);
      for (const cc of gf) if (df) x.drawImage(df.c, cc * TS, y0, TS, TS);
      x.fillStyle = 'rgba(200,215,220,0.55)'; x.fillRect(x0 - 1, y0, 1, TS); x.fillRect(x1, y0, 1, TS);
    }
    if (gc.length) {
      const x0 = gc[0] * TS, x1 = (gc[gc.length - 1] + 1) * TS;
      x.fillStyle = '#121c1f'; x.fillRect(x0, 0, x1 - x0, TS);
      const sf = frameOf('shower', 0);
      if (sf) {
        x.save(); x.beginPath(); x.rect(x0, 0, x1 - x0, TS); x.clip();
        const n = Math.ceil((x1 - x0) / sf.w), sx = Math.round((x0 + x1) / 2 - (n * sf.w) / 2);
        for (let k = 0; k < n; k++) x.drawImage(sf.c, sx + k * sf.w, TS - sf.h);
        x.restore();
      }
      // metal flanges where the pipe meets the ceiling tiles
      x.fillStyle = '#b8c4ca'; x.fillRect(x0 - 2, 0, 2, TS); x.fillRect(x1, 0, 2, TS);
      x.fillStyle = '#6a767c'; x.fillRect(x0 - 2, TS - 1, 2, 1); x.fillRect(x1, TS - 1, 2, 1);
    }
    return c;
  }
  // ---- the sliding bath doors (canvas-drawn, built once): wooden frame, frosted-glass grid, a small ♨ mark
  let doorArt = null;
  const ONSEN_MARK = [
    '..#...#...#..',
    '.#...#...#...',
    '..#...#...#..',
    '...#...#...#.',
    '..#...#...#..',
    '.............',
    '#...........#',
    '#...........#',
    '.#.........#.',
    '..#########..',
  ];
  function buildDoors() {
    const w = W / 2, h = PF_H, c = mk(w, h), x = c.getContext('2d');
    let s = 0x2545f491;
    const r = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1000) / 1000; };
    x.fillStyle = '#4a2e1a'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#8a5a34'; x.fillRect(2, 2, w - 4, h - 4);
    for (let yy = 3; yy < h - 3; yy += 3) { x.fillStyle = r() < 0.5 ? 'rgba(60,30,10,0.18)' : 'rgba(255,220,170,0.08)'; x.fillRect(3, yy, w - 6, 1); }
    // frosted panes in a 3 x 6 grid
    const ix = 9, iy = 9, iw = w - 18, ih = h - 30, cols = 3, rows = 6, bar = 3;
    const pw = (iw - (cols - 1) * bar) / cols, ph = (ih - (rows - 1) * bar) / rows;
    for (let rr2 = 0; rr2 < rows; rr2++) for (let cc = 0; cc < cols; cc++) {
      const px = Math.round(ix + cc * (pw + bar)), py = Math.round(iy + rr2 * (ph + bar)), pww = Math.round(pw), phh = Math.round(ph);
      x.fillStyle = '#5c3a20'; x.fillRect(px - 1, py - 1, pww + 2, phh + 2);
      const gr = x.createLinearGradient(0, py, 0, py + phh);
      gr.addColorStop(0, '#e4f2f3'); gr.addColorStop(1, '#bcd8dc');
      x.fillStyle = gr; x.fillRect(px, py, pww, phh);
      for (let k = 0; k < (pww * phh) / 7; k++) { x.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.55)' : 'rgba(120,160,168,0.22)'; x.fillRect(px + ((r() * pww) | 0), py + ((r() * phh) | 0), 1, 1); }
      x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(px, py, pww, 1);
    }
    // kick plate
    x.fillStyle = '#6e4626'; x.fillRect(4, h - 19, w - 8, 15);
    x.fillStyle = 'rgba(255,220,170,0.15)'; x.fillRect(4, h - 19, w - 8, 1);
    // ♨ mark on the middle pane of the second row
    const mx = Math.round(ix + (pw + bar) + pw / 2 - ONSEN_MARK[0].length / 2), my = Math.round(iy + (ph + bar) + ph / 2 - ONSEN_MARK.length / 2);
    x.fillStyle = '#d9343f';
    ONSEN_MARK.forEach((row, ry) => { for (let k = 0; k < row.length; k++) if (row[k] === '#') x.fillRect(mx + k, my + ry, 1, 1); });
    // finger pull at the meeting edge
    x.fillStyle = '#2e1a0c'; x.fillRect(w - 8, Math.round(h / 2) - 9, 4, 18);
    x.fillStyle = '#c99a62'; x.fillRect(w - 8, Math.round(h / 2) - 9, 4, 1);
    // mirrored right panel (pull on its left edge)
    const m = mk(w, h), mx2 = m.getContext('2d'); mx2.translate(w, 0); mx2.scale(-1, 1); mx2.drawImage(c, 0, 0);
    doorArt = { l: c, r: m };
  }
  function drawDoors(d) {
    if (d <= 0) return;
    if (!doorArt) buildDoors();
    const off = Math.round((W / 2) * d);
    ctx.drawImage(doorArt.l, off - W / 2, PF_TOP);
    ctx.drawImage(doorArt.r, W - off, PF_TOP);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(off, PF_TOP, 2, PF_H); ctx.fillRect(W - off - 2, PF_TOP, 2, PF_H);
  }
  function drawRaw(name, i, x, y, flip) {
    const f = frameOf(name, i); if (!f) return;
    ctx.drawImage(flip ? f.m : f.c, Math.round(x), Math.round(y));
  }
  // drawRaw as the twin of seat `slot` (the HUD's life_<animal> icons; slot 0 / no twin: drawRaw)
  function drawRawTwin(name, slot, x, y) {
    const f = twinFrame(frameOf(name, 0), name, slot); if (!f) return;
    ctx.drawImage(f.c, Math.round(x), Math.round(y));
  }
  // o: alpha, scale, sq (squash), white (flash), outline (slot colour: the ink-ringed ring), twin (the seat whose twin
  // colour the body takes), look (a worn set: the 24x24 composite, shop.md 6.2 - never with scale), tint + tintA
  // (slot-tinted copy). The frame goes through the joint order of distinction §2.12: frameOf -> twinFrame -> lookFrame
  // -> tintOf -> ringOf of that final frame
  function drawEnt(name, i, x, y, flip, o) {
    let f = frameOf(name, i); if (!f) return;
    o = o || {};
    if (o.twin !== undefined) f = twinFrame(f, name, o.twin);
    if (o.look) f = lookFrame(f, name, i, o.look);   // (the items, never recoloured)
    if (o.tint) f = tintOf(f, o.tint, o.tintA || 0.35);
    const dx = Math.round(x + (16 - f.w) / 2), dy = Math.round(y + (16 - f.h));
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    let X = dx, Y = dy, w = f.w, h = f.h, sized = false;
    if (o.scale) { w = Math.round(f.w * o.scale); h = Math.round(f.h * o.scale); X = Math.round(x + 8 - w / 2); Y = Math.round(y + 8 - h / 2); sized = true; }
    else if (o.sq) { w = Math.round(f.w * (1 + o.sq)); h = Math.round(f.h * (1 - o.sq)); X = Math.round(x + 8 - w / 2); Y = Math.round(y + 16 - h); sized = true; }
    if (o.outline) { const kx = w / f.w, ky = h / f.h; ctx.drawImage(ringOf(f, flip, o.outline), X - 2 * kx, Y - 2 * ky, w + 4 * kx, h + 4 * ky); }
    if (sized) ctx.drawImage(flip ? f.m : f.c, X, Y, w, h);
    else ctx.drawImage(flip ? f.m : f.c, dx, dy);
    if (o.white) { ctx.globalAlpha = o.white; ctx.drawImage(flip ? f.whm : f.wh, dx, dy); }
    ctx.globalAlpha = 1;
  }
  function wrapDraw(y, fn) { fn(y); if (y + 16 > PF_BOT) fn(y - PF_H); else if (y < PF_TOP) fn(y + PF_H); }
  // a frame centred on (x + 8, y + 8) at sx x sy of its size (the v4 kit bubbles: the capy's big one, the penguin's
  // stretched icicle, the otter's droplets, the frog's jelly); o: tint + tintA (the film), alpha, white
  function drawCentred(name, i, x, y, sx, sy, o) {
    let f = frameOf(name, i); if (!f) return;
    if (o.tint) f = tintOf(f, o.tint, o.tintA);
    const w = Math.max(1, Math.round(f.w * sx)), h = Math.max(1, Math.round(f.h * sy));
    const X = Math.round(x + 8 - w / 2), Y = Math.round(y + 8 - h / 2);
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    ctx.drawImage(f.c, X, Y, w, h);
    if (o.white) { ctx.globalAlpha = o.white; ctx.drawImage(f.wh, X, Y, w, h); }
    ctx.globalAlpha = 1;
  }
  // a frame turned q quarter turns about its centre (the spec's lying / spinning pose fallbacks), feet line kept
  function drawTurned(name, i, x, y, flip, q, o) {
    let f = frameOf(name, i); if (!f) return;
    if (o.twin !== undefined) f = twinFrame(f, name, o.twin);
    ctx.save(); ctx.translate(Math.round(x + 8), Math.round(y + 16 - f.h / 2)); ctx.rotate(q * Math.PI / 2);
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    if (o.outline) ctx.drawImage(ringOf(f, flip, o.outline), -f.w / 2 - 2, -f.h / 2 - 2);
    ctx.drawImage(flip ? f.m : f.c, -f.w / 2, -f.h / 2);
    if (o.white) { ctx.globalAlpha = o.white; ctx.drawImage(flip ? f.whm : f.wh, -f.w / 2, -f.h / 2); }
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // ---- v4 looks (char-kits §2.6 and the "Look" parts of §3-§8). Cosmetic only: fxr, G.parts (trails while < 300),
  // G.kfx; reducedMotion() culls trails, afterimages and rings (glyph, film, sizes and poses stay). 능력 끄기: no bubble
  // has an animal look (bubbleChar) and no body sets its move bits, so every frame is drawn exactly as before v4.
  // Bubbles: the 5x5 glyph and the pop palette [hueA, hueB, white] (multiplayer: [slot colour, hueA, hueB]) + its
  // particle count / speed / life / gravity; the film hue is CHARS[c].hue
  const KIT_LOOK = {
    duck: { icon: 'icon_duck', pop: ['#ffe36b', '#fff3a8', '#ffffff'], n: 8, sp: 1.5, life: 14, g: 0 },
    capy: { icon: 'icon_capy', pop: ['#ffd6e0', '#ffffff', '#ffa98a'], n: 12, sp: 1.0, life: 18, g: 0 },
    otter: { icon: 'icon_otter', pop: ['#5fe0c8', '#bff7ee', '#ffffff'], n: 8, sp: 1.5, life: 14, g: 0.12 },
    penguin: { icon: 'icon_penguin', pop: ICE_COLS, n: 8, sp: 1.6, life: 14, g: 0.1 },
    cat: { icon: 'icon_cat', pop: ['#ff8fb1', '#c9a8ff', '#ffffff'], n: 6, sp: 1.5, life: 14, g: 0.04 },
    frog: { icon: 'icon_frog', pop: ['#c8f08a', '#6cc644', '#ffffff'], n: 8, sp: 1.5, life: 14, g: 0 },
  };
  // the move poses (each has a fallback in moveLook); the frog has none (a lily pad under its chained hops)
  const POSE = { duck: 'duck_glide', capy: 'capy_slam', otter: 'otter_dash', penguin: 'penguin_slide', cat: 'cat_flip' };
  const hasSpr = (n) => !!(SPR[n] && SPR[n].length);
  const trailRoom = () => G.parts.length < 300;
  // does this engine run that player's body (its sq is real) - or only draw it from reports (a viewer)?
  const simHere = (p) => !G.online || (G.role === 'host' ? p.local !== false : p.slot === G.localSlot && NET.ctl === 'local');
  // short-lived rings / ellipses / lily pads / sparkle crosses, drawn from their age (G.frame - f0) so any render rate
  // shows them right; `low` ones lie on the floor under the animals. {k: 'ring' | 'cross', x, y, r0, r1 (radius over
  // dur f), ry (a fixed half height) or flat (height / width), col, fill}
  function kfx(o) { if (reducedMotion() || G.kfx.length > 48) return; o.f0 = G.frame; G.kfx.push(o); }
  function drawKfx(low) {
    if (!G.kfx.length) return;
    const F = G.frame;
    if (!low) G.kfx = G.kfx.filter((o) => F - o.f0 <= o.dur);
    ctx.lineWidth = 1;
    for (const o of G.kfx) {
      if (!o.low !== !low || F < o.f0) continue;
      const t = clamp((F - o.f0) / o.dur, 0, 1), fade = 1 - t;
      if (o.k === 'cross') {
        ctx.globalAlpha = fade; ctx.fillStyle = '#ffffff';
        const X = Math.round(o.x), Y = Math.round(o.y); ctx.fillRect(X - 1, Y, 3, 1); ctx.fillRect(X, Y - 1, 1, 3);
        continue;
      }
      if (o.k === 'heart') {
        // (shop.md 6.7, e5: a 5x4 pixel heart rising 10 px over its dur, fading; o.y = its bottom row at the start)
        ctx.globalAlpha = fade; ctx.fillStyle = o.col;
        const X = Math.round(o.x) - 2, Y = Math.round(o.y - 10 * t) - 3;
        ctx.fillRect(X + 1, Y, 1, 1); ctx.fillRect(X + 3, Y, 1, 1); ctx.fillRect(X, Y + 1, 5, 1); ctx.fillRect(X + 1, Y + 2, 3, 1); ctx.fillRect(X + 2, Y + 3, 1, 1);
        continue;
      }
      const rx = lerp(o.r0, o.r1, t), ry = o.ry || rx * (o.flat || 1);
      ctx.beginPath(); ctx.ellipse(o.x, o.y, rx, ry, 0, 0, Math.PI * 2);
      if (o.fill) { ctx.globalAlpha = 0.8 * fade; ctx.fillStyle = o.fill; ctx.fill(); }
      ctx.globalAlpha = 0.9 * fade; ctx.strokeStyle = o.col; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // a player's move as this screen draws it: the pose and the effects come from its body bits A / B (its own engine
  // sets them in updatePlayer; every other screen takes them from that player's body stream or the snapshot) and from
  // their edges, at the spot it is drawn (char-kits §2.4, §9.1). Returns the pose {name, fi, sq?, q? (quarter turns),
  // dy?, after? (afterimages), lines? (slam speed lines)} or null. p.fx is this screen's own memory (never sent)
  function moveLook(p, c) {
    const fx = p.fx || (p.fx = { a: false, b: false, aAt: 0, bAt: 0, f: -1, gl: 0, sq: 0, gx: 0, gy: -99, hist: [] });
    const F = G.frame, nf = fx.f !== F, A = !!p.mvA, B = !!p.mvB, calm = reducedMotion();
    const x = p.x, y = p.y, d = p.facing < 0 ? -1 : 1, sim = simHere(p);
    if (nf) {
      const dt = fx.f < 0 ? 1 : clamp(F - fx.f, 1, 60);
      fx.sq *= Math.pow(0.78, dt); if (Math.abs(fx.sq) < 0.02) fx.sq = 0;
      if (p.onGround) { fx.gl = 0; fx.gx = x + 8; fx.gy = y + 16; } else if (A && c === 'duck') fx.gl += dt;
      fx.hist.push([x, y, F]); if (fx.hist.length > 8) fx.hist.shift();
    }
    const upA = A && !fx.a, upB = B && !fx.b;
    if (upA) fx.aAt = F;
    if (upB) fx.bAt = F;
    fx.a = A; fx.b = B; fx.f = F;
    const sq = (v) => { if (!sim) fx.sq = v; }; // (a viewer's squash; the owner's engine has the body's own)
    if (c === 'duck') {
      // 둥실 활공: wings up / down every 6 f (every 3 f in the meter's last 15 f), 2 white puffs under it every 10 f
      if (!A) return null;
      const k = KIT.duck.glide, max = G.gameMode === 'battle' ? k.maxB : k.max, gT = sim ? p.glideT : fx.gl;
      const ph = ((gT / (max - gT <= 15 ? 3 : 6)) | 0) & 1;
      if (nf && !calm && (F - fx.aAt) % 10 === 0) for (const s of [-1, 1]) if (trailRoom()) G.parts.push({ x: x + 8 + s * 3, y: y + 15, vx: s * 0.12, vy: 0.15, life: 10, max: 10, c: '#ffffff', sz: 1, g: -0.02 });
      return hasSpr(POSE.duck) ? { name: POSE.duck, fi: ph } : { name: c + '_jump', fi: 0, sq: ph ? 0.08 : -0.08 };
    }
    if (c === 'capy') {
      // 털썩 엉덩방아: curled in the wind-up and the slam (speed lines once it drops); landing (B rises): a hot-water
      // ring 16 -> 72 px wide, 14 droplets flung sideways, a squash (its own screen also shook, in slamLand)
      if (upA) sq(-0.15);
      if (upB) {
        kfx({ k: 'ring', low: true, x: x + 8, y: y + 16, r0: 8, r1: 36, ry: 3, dur: 12, col: '#ffd6e0' });
        for (let i = 0; i < 14 && G.parts.length < 360; i++) {
          const s = i & 1 ? 1 : -1;
          G.parts.push({ x: x + 8 + s * 3, y: y + 14, vx: s * (0.6 + fxr()), vy: -0.8 - fxr() * 0.8, life: 16 + ((fxr() * 6) | 0), max: 22, c: HOT_COLS[i % 3], sz: 1, g: 0.12 });
        }
        sq(0.32);
      }
      if (!A) return null;
      return { name: hasSpr(POSE.capy) ? POSE.capy : c + '_fall', fi: 0, lines: !calm && p.vy > 1 };
    }
    if (c === 'otter') {
      // 휙 대시: stretched flat, 3 afterimages, 2 drops a frame flicked off behind
      if (!A) return null;
      if (nf && !calm) for (let i = 0; i < 2 && trailRoom(); i++) G.parts.push({ x: x + 8 - d * 6, y: y + 6 + fxr() * 7, vx: -d * (0.2 + fxr() * 0.4), vy: -0.3 - fxr() * 0.3, life: 10, max: 10, c: '#8fe3ff', sz: 1, g: 0.08 });
      return hasSpr(POSE.otter) ? { name: POSE.otter, fi: 0, after: !calm } : { name: c + '_jump', fi: 0, sq: 0.18, after: !calm };
    }
    if (c === 'penguin') {
      // 쭉 배미끄럼: lying on its belly through the dive (A) and the slide (B), drawn 3 px lower (the art's belly line
      // meets the floor); skid dust when the slide starts, ice sparkles behind every 3 f while it slides
      if (upB) for (let i = 0; i < 6 && G.parts.length < 360; i++) G.parts.push({ x: x + 8 - d * (2 + i), y: y + 15, vx: -d * (0.3 + fxr() * 0.8), vy: -0.3 - fxr() * 0.6, life: 14, max: 14, c: i & 1 ? '#ffffff' : '#e8f4f0', sz: i < 2 ? 2 : 1, g: 0.06 });
      if (B && nf && !calm && (F - fx.bAt) % 3 === 0 && trailRoom()) G.parts.push({ x: x + 8 - d * (7 + fxr() * 3), y: y + 13 + fxr() * 3, vx: -d * 0.15, vy: -0.15, life: 12, max: 12, c: ((F / 3) | 0) & 1 ? '#ffffff' : '#bff0ff', sz: 1, g: 0 });
      if (!A && !B) return null;
      return hasSpr(POSE.penguin) ? { name: POSE.penguin, fi: 0, dy: 3 } : { name: c + '_fall', fi: 0, q: d, dy: 3 };
    }
    if (c === 'cat') {
      // 냥냥 2단 점프: a lilac ring puffs at its feet and paw dust falls (A rises), curled into a ball for the 10 f
      if (upA) {
        kfx({ k: 'ring', x: x + 8, y: y + 15, r0: 3, r1: 9, dur: 8, col: '#c9a8ff' });
        for (let i = 0; i < 4 && G.parts.length < 360; i++) G.parts.push({ x: x + 5 + i * 2, y: y + 16, vx: (i - 1.5) * 0.3, vy: 0.3 + fxr() * 0.3, life: 10, max: 10, c: '#ffffff', sz: 1, g: 0 });
        sq(-0.3);
      }
      if (!A) return null;
      return hasSpr(POSE.cat) ? { name: POSE.cat, fi: 0 } : { name: c + '_jump', fi: 0, q: ((((F - fx.aAt) / 3) | 0) % 4) * d };
    }
    if (c === 'frog' && upA) {
      // 깨굴 3단 뛰기: a lily pad where a chained hop took off (bigger on level 2, with a splash of green)
      const near = Math.abs(fx.gy - (y + 16)) < 14, gx = near ? fx.gx : x + 8, gy = near ? fx.gy : y + 18;
      kfx({ k: 'ring', low: true, x: gx, y: gy, r0: B ? 6 : 4.5, r1: B ? 8 : 6, flat: 0.35, dur: 10, col: '#6cc644', fill: '#c8f08a' });
      if (B) for (let i = 0; i < 4 && G.parts.length < 360; i++) G.parts.push({ x: gx + (i - 1.5) * 3, y: gy - 1, vx: (i - 1.5) * 0.5, vy: -0.8 - fxr() * 0.6, life: 14, max: 14, c: i & 1 ? '#6cc644' : '#c8f08a', sz: 1, g: 0.12 });
    }
    return null;
  }
  // the otter's dash: the spots this screen drew it at 2 / 4 / 6 frames back (since the dash began), fading - a pale
  // water-tinted copy, so the trail reads on the dark tiles
  function drawAfterimages(p, name, fi, flip, bob) {
    const fx = p.fx; if (!fx) return;
    let last = null;
    for (const [k, a] of [[6, 0.1], [4, 0.2], [2, 0.3]]) {
      let e = null;
      for (const h of fx.hist) if (h[2] <= G.frame - k && h[2] >= fx.aAt - 1) e = h;
      if (!e || e === last || Math.abs(e[0] - p.x) + Math.abs(e[1] - p.y) < 2) continue;
      last = e;
      drawEnt(name, fi, e[0], e[1] + bob, flip, { alpha: a, tint: '#bff7ee', tintA: 0.7, twin: p.twin ? p.slot : undefined, look: lookOn(p.look) ? p.look : undefined }); // (the trail wears the hat)
    }
  }
  // ---- 효과 (shop.md 6.7): the worn effect's particles, called by drawPlayer right after moveLook. Everything comes
  // from this screen's own memory of p (p.lfx, never sent) and the state it draws (onGround, vx, vy, score), so every
  // viewer shows everyone's effect. Cosmetic only: fxr, G.parts while < 200 (multiplayer, the podium) / 260 (alone),
  // the kfx heart (kfx caps itself); nothing at all under reduced motion. Edges (a landing, a take-off, a score jump)
  // count only across a short gap (<= 4 frames: a screen that skipped drawing p - trapped, a ghost - starts over).
  // Per player at most: e4 one per 14 f, e6 one per 6 f, e1 one per 24 f, e2 4 a landing, e3 3 a take-off, e5 2 hearts,
  // e7 2 ducklings (drawn, not particles), e8 4 wisps
  // A particle's velocity is damped x0.94 a frame (updateFx): g = v x 0.06 / 0.94 holds a steady rise of v px/f
  const FX_KEEP = 0.06 / 0.94, FX_RAIN = ['R', 'O', 'Y', 't', 'b', 'v'];
  function lookFx(p, c) {
    const F = G.frame, m = p.lfx || (p.lfx = { f: -1, g: true, vy: 0, sc: p.score | 0, still: 0, at: -1e9, k: 0 });
    if (m.f === F) return;
    const dt = m.f < 0 ? 99 : F - m.f, g0 = m.g, vy0 = m.vy, sc0 = m.sc, edge = dt > 0 && dt <= 4;
    m.f = F; m.g = !!p.onGround; m.vy = +p.vy || 0; m.sc = p.score | 0;
    const e = lookOn(p.look) ? p.look[4] : '0';
    if (e !== '7' || p.dead) m.dk = null;          // (e7's ducklings: a death puts them back behind the heel at the respawn)
    if (e === '0' || p.dead || reducedMotion()) { m.still = 0; m.dk = null; return; }
    const walk = !!p.onGround && Math.abs(p.vx) > 0.15, d = p.facing < 0 ? -1 : 1;
    m.still = p.onGround && !walk ? m.still + clamp(dt, 1, 60) : 0;
    const room = () => G.parts.length < (multi() || G.mode === 'podium' ? 200 : 260);
    const put = (q) => { if (room()) G.parts.push(Object.assign({ vx: 0, vy: 0, g: 0, sz: 1, lf: e }, q)); }; // (lf: whose effect - the tests count them)
    if (e === '7') duckStep(p, m, dt);     // 아기 오리 졸졸: two ducklings following (gacha.md 4.3) - drawn, no particles
    else if (e === '8') {                  // 뜨끈뜨끈 온천 기운 (gacha.md 4.3): always - a wisp every 6 f from the flanks in turn,
      if (F - m.at < 6) return;            // 2 px for 12 f then 1 px, a 1 px sway every 6 f, rising ~8 px to beside the head
      m.at = F;                            // (never above headTop), pink / cream in turn - never white (white above a head is "me")
      const side = m.k++ & 1;
      put({ x: p.x + (side ? 14 : 1), y: p.y + 13 - (m.k % 3) * 2, vx: side ? 0.12 : -0.12, vy: -0.35, g: -0.35 * FX_KEEP, life: 24, max: 24, fd: 10, sz: 1, big: 12, sw: 6,
        c: (m.k >> 1) & 1 ? '#ff8fb1' : '#f3e2b4' });
    } else if (e === '1') {                     // 김 모락모락: standing still >= 30 f, a 2 px puff from the head every 24 f, rising 0.3 px/f
      if (m.still < 30 || F - m.at < 24) return;
      m.at = F;
      const A = anchorsOf(c + '_idle', 0), hx = A && A.H ? A.H[0] : 8, hy = A && A.H ? A.H[1] : 2;
      put({ x: p.x + (d > 0 ? hx : 15 - hx), y: headTop(p) + hy - 4, vy: -0.3, g: -0.3 * FX_KEEP, life: 24, max: 24, c: '#ffffff', sz: 2 });
    } else if (e === '2') {                // 착지 물방울: landing after vy > 1.5 - 4 droplets flicked sideways, 12 f
      if (!edge || g0 || !p.onGround || vy0 <= 1.5) return;
      for (let i = 0; i < 4; i++) { const s = i & 1 ? 1 : -1; put({ x: p.x + 8 + s * (2 + (i >> 1) * 2), y: p.y + 14, vx: s * (0.7 + fxr() * 0.5), vy: -0.5 - fxr() * 0.4, g: 0.12, life: 12, max: 12, c: i < 2 ? '#ffffff' : '#c8f4ff' }); }
    } else if (e === '3') {                // 점프 반짝이: a take-off with vy < -1 - 3 one-pixel sparkles drifting down, 16 f
      if (!edge || !g0 || p.onGround || !(p.vy < -1)) return;
      for (let i = 0; i < 3; i++) put({ x: p.x + 5 + i * 3, y: p.y + 14 + (i & 1), vx: (i - 1) * 0.15, vy: 0.25, g: 0.25 * FX_KEEP, life: 16, max: 16, c: i & 1 ? '#d9c8ff' : '#ffc9dc' });
    } else if (e === '4') {                // 걸을 때 비누방울: walking - every 14 f a 2 px bubble behind the feet, rising 0.25 px/f, 30 f
      if (!walk || F - m.at < 14) return;
      m.at = F;
      put({ x: p.x + 7 - d * 6, y: p.y + 12, vy: -0.25, g: -0.25 * FX_KEEP, life: 30, max: 30, c: (m.k++ & 1) ? '#aef3ff' : '#ffffff', sz: 2 });
    } else if (e === '5') {                // 하트 뿅뿅: my score jumped >= 500 in a frame (a KO, a big combo) - 2 hearts rise from the head
      if (!edge || (p.score | 0) - sc0 < 500) return;
      const y = headTop(p) - 2;
      kfx({ k: 'heart', x: p.x + 5, y, dur: 20, col: '#ff8fb1' }); kfx({ k: 'heart', x: p.x + 11, y: y - 3, dur: 20, col: '#ff8fb1' });
    } else if (e === '6') {                // 무지개 발자국: walking - every 6 f a still dot at the heel, the next of R O Y t b v, fading over 24 f
      if (!walk || F - m.at < 6) return;
      m.at = F;
      const pal = PG.PALETTE || {}, col = pal[FX_RAIN[m.k++ % FX_RAIN.length]];
      put({ x: p.x + 8 - 6 * d, y: p.y + 15, life: 24, max: 24, fd: 24, c: typeof col === 'string' ? col : '#ffffff' });
    }
  }

  // e7 (gacha.md 4.3): two ducklings easing after the wearer - the first toward 7 px behind the heel (x + 2 facing right,
  // x + 13 facing left: its near edge 1 px clear of the ground marker's 14 columns), the second 7 px behind the first - at
  // most 1.2 px a frame, standing on the last feet row (y + 15 their bottom row); hidden while the wearer is more than
  // 8 px off that row (a real jump, a fall to another floor) and back behind the heel at the next landing; a teleport
  // (> 24 px in a frame), a respawn or a gap in drawing puts them back at once. This screen's memory (p.lfx.dk), never sent
  const DUCK_GAP = 7, DUCK_V = 1.2;
  function duckStep(p, m, dt) {
    const d = p.facing < 0 ? -1 : 1, t1 = d > 0 ? p.x - 5 : p.x + 16, k = m.dk;
    const home = () => { m.dk = { a: [{ x: t1, f: d, mv: 0 }, { x: t1 - DUCK_GAP * d, f: d, mv: 0 }], y: Math.round(p.y) + 15, hid: !p.onGround, px: p.x, py: p.y }; };
    if (!k || dt > 4 || Math.abs(p.x - k.px) + Math.abs(p.y - k.py) > 24) { home(); return; }
    k.px = p.x; k.py = p.y;
    if (p.onGround) { if (k.hid) { home(); return; } k.y = Math.round(p.y) + 15; }
    else if (Math.abs(p.y + 15 - k.y) > 8) k.hid = true;
    if (k.hid) return;
    let lead = t1;
    for (const q of k.a) {
      const gap = lead - q.x, s = Math.abs(gap) < 0.1 ? gap : clamp(gap * 0.25, -DUCK_V, DUCK_V);
      q.x += s;
      // (they waddle while they move - and while the wearer walks: the hub's stand-in walks on the spot)
      q.mv = Math.abs(s) > 0.05 || (p.onGround && Math.abs(p.vx) > 0.15) ? 1 : 0;
      q.f = Math.abs(s) > 0.05 ? (s > 0 ? 1 : -1) : d;
      lead = q.x - DUCK_GAP * d;
    }
  }
  // the low pass (after the floor, before every body; hubDraw before its animal): fx_duck, mirrored by its facing, frame
  // 1 and a 1 px bob on alternate 6 f while it moves
  function drawDucklings(p) {
    const m = p && p.lfx, k = m && m.dk;
    if (!k || k.hid || p.out || p.dead || p.koT > 0 || p.trap || p.ghost || G.frame - m.f > 2 || !lookOn(p.look) || p.look[4] !== '7' || reducedMotion()) return;
    for (const q of k.a) { const w = q.mv && ((G.frame / 6) | 0) & 1; drawRaw('fx_duck', w ? 1 : 0, Math.round(q.x), k.y - 3 - (w ? 1 : 0), q.f < 0); }
  }
  // ---- the ground marker (발판 표시, distinction §2.4): in multiplayer a pixel ellipse in the slot colour under each
  // animal - where everyone is and where they will land, readable through overlaps, the respawn blink and any tile.
  // c = slot colour, # = rim (SLOT_INK; mine white, online), baked once per slot x rim. L standing (rows surf-3..surf+1,
  // the widest on the animal's bottom row), M low air, S high air (rows surf-1..surf+1), R afloat: two ripples at the
  // waterline beside the body, its middle 16 columns clear (an ellipse over a floating animal would cut it in half)
  const MARK_ROWS = {
    L: ['...########...', '.##cccccccc##.', '#cccccccccccc#', '.##cccccccc##.', '...########...'],
    M: ['.########.', '#cccccccc#', '.########.'],
    S: ['.####.', '#cccc#', '.####.'],
    R: ['.###................###.', '#ccc................ccc#', '.###................###.'],
  };
  const markArts = new Map();
  function markArt(slot, me) {
    const id = slot * 2 + (me ? 1 : 0);
    let a = markArts.get(id); if (a) return a;
    a = {};
    for (const k in MARK_ROWS) { const c = mk(MARK_ROWS[k][0].length, MARK_ROWS[k].length); pixelRows(c.getContext('2d'), MARK_ROWS[k], { c: SLOT_COLS[slot] || '#ffffff', '#': me ? '#ffffff' : SLOT_INK }); a[k] = c; }
    markArts.set(id, a);
    return a;
  }
  // where p's marker goes: {k: 'L' | 'M' | 'S' | 'R', x, y (top-left), a (alpha), w (drawn after the water)} or null.
  // Geometric only (the nearer of the platform top under the feet span and the first water surface below), so a guest
  // draws everyone's from their spots alone. Hidden while out / KO'd / trapped / a ghost / dying - never by the blink
  function markerOf(p) {
    if (!p || p.out || p.koT > 0 || p.trap || p.ghost || p.dead) return null;
    const x = p.x, y = p.y, cx = Math.round(x + 8);
    const wi = waterIdx(x + 8, y + 15);
    if (wi >= 0) return { k: 'R', x: cx - 12, y: surfY(wi) - 1, a: 1, w: true };
    let surf = landTile(x + 3, x + 13, y + 16, y + 56), w = false;
    for (let k = 0; k <= 5; k++) {
      const i = waterIdx(x + 8, y + 16 + 8 * k); if (i < 0) continue;
      const s = surfY(i); if (surf === null || s < surf) { surf = s; w = true; }
      break;
    }
    if (surf === null) return null;
    const d = surf - (y + 16);
    if (d <= 1) return { k: 'L', x: cx - 7, y: surf - 3, a: 1, w };
    if (d <= 16) return { k: 'M', x: cx - 5, y: surf - 1, a: 0.85, w };
    if (d <= 40) return { k: 'S', x: cx - 3, y: surf - 1, a: 0.6, w };
    return null;
  }
  const marksOn = () => multi() && G.mode !== 'podium' && G.mode !== 'transition' && !(G.mode === 'paused' && G.pausedFrom === 'transition');
  // water = false: the floor decals (under snacks, enemies, the kits' floor rings and the bodies); true: the ripples and
  // any marker on a water surface (after the water overlay, which would drown them)
  // (the floor pass works the markers out for this render, the water pass reuses them)
  let markList = [];
  function drawMarkers(water) {
    if (!water) markList = marksOn() ? G.players.map((p) => [p, markerOf(p)]) : [];
    for (const [p, m] of markList) {
      if (!m || m.w !== water) continue;
      ctx.globalAlpha = m.a; ctx.drawImage(markArt(p.slot, isMe(p))[m.k], m.x, m.y);
    }
    ctx.globalAlpha = 1;
  }
  // ---- "me" (distinction §2.7, online only): three white-and-slot rings pulse round my animal for 90 f (one every
  // 30 f, r 9 -> 16, alpha 0.9 -> 0; reduced motion: one still ring for 60 f) at the countdown, after my battle KO
  // respawn and after my co-op revive; my tag grows x1.3 for 120 f (syncTags). Triggers in updateFx (meSpotTick): the
  // countdown's first frame, and my animal going from not drawn (KO, ghost, out) to drawn - the same on host and guest
  const SPOT_F = 90, SPOT_CALM_F = 60, SPOT_HI_F = 120;
  function meSpotTick() {
    if (G.spotF === G.frame) return;
    G.spotF = G.frame;
    const me = G.online && multi() ? myPlayer() : null;
    if (!me) { G.spotAt = -1e9; G.spotHid = false; G.spotMode = G.mode; return; }
    const hid = me.koT > 0 || !!me.ghost || !!me.out;
    if ((G.mode === 'countdown' && G.spotMode !== 'countdown') || (G.spotHid && !hid)) G.spotAt = G.frame;
    G.spotHid = hid; G.spotMode = G.mode;
  }
  const spotAge = () => G.frame - (G.spotAt === undefined ? -1e9 : G.spotAt);
  function drawMeSpot() {
    if (!G.online || !multi() || G.mode === 'podium') return;
    const me = myPlayer(), t = spotAge(), calm = reducedMotion();
    if (!me || !alive(me) || me.trap || t < 0 || t >= (calm ? SPOT_CALM_F : SPOT_F)) return;
    const k = calm ? 0 : (t % 30) / 30, r = calm ? 12 : 9 + 7 * k, cx = me.x + 8, cy = me.y + 8;
    ctx.lineWidth = 1; ctx.globalAlpha = calm ? 0.9 : 0.9 * (1 - k);
    ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = me.color; ctx.beginPath(); ctx.arc(cx, cy, r - 1, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // every player's animal (in multiplayer with the ink-ringed outline in its slot colour, a twin in its seat's ramp);
  // trapped players are drawn with their bubble, ghosts after the water
  function drawPlayer(p) {
    p = p || G.p; if (!p || p.out || p.koT > 0 || p.trap || p.ghost) return;
    const dieT = G.gameMode === 'solo' ? G.dieT : p.dieT;
    const c = isChar(p.char) ? p.char : 'duck';
    // (v4: its move's pose and effects - looked at before the blink below, so no edge goes unseen; then its worn 효과)
    const lk = !p.dead && G.mode !== 'podium' ? moveLook(p, c) : null;
    lookFx(p, c);
    if (p.invuln > 0 && !p.dead && !(p.stunT > 0) && ((G.frame >> 2) & 1) === 0) return; // (a stunned animal flashes instead)
    let name = c + '_idle', fi = (G.frame / 30) | 0;
    if (p.dead) { name = c + '_die'; fi = (dieT / 6) | 0; }
    else if (lk) { name = lk.name; fi = lk.fi; }
    else if (p.shootAnim > 0) { name = c + '_shoot'; fi = 0; }
    else if (!p.onGround) { name = p.vy < 0 ? c + '_jump' : c + '_fall'; fi = 0; }
    else if (Math.abs(p.vx) > 0.15) { name = c + '_walk'; fi = (p.walkT / 5) | 0; }
    const flip = p.facing < 0;
    let sq = p.sq;
    if (p.fx && p.fx.sq && !simHere(p)) sq = p.fx.sq;
    if (lk && lk.sq !== undefined) sq = lk.sq;
    const o = { sq };
    if (multi()) o.outline = p.color;
    if (p.twin) o.twin = p.slot; // (a later copy of an animal: its body in this seat's ramp, distinction §2.5)
    if (lookOn(p.look)) o.look = p.look; // (worn items: the composite - frames without anchors, the die tumble too, draw bare)
    if (p.stunT > 0 && ((G.frame >> 2) & 1)) o.white = 0.45;
    if (p.dead && dieT < 10) o.white = (dieT >> 1) & 1 ? 0.9 : 0;
    // floating on the water: a gentle bob
    const bob = p.water && !p.dead && G.mode !== 'transition' ? Math.round(Math.sin(G.frame * 0.09) * 1.1) : 0;
    if (lk && lk.after) drawAfterimages(p, name, fi, flip, bob);
    if (lk && lk.lines) {
      // the slam's two speed lines above it
      ctx.globalAlpha = 0.85; ctx.fillStyle = '#ffffff';
      const ht = headTop(p); // (above a worn hat)
      ctx.fillRect(Math.round(p.x + 4), Math.round(ht - 7), 1, 6); ctx.fillRect(Math.round(p.x + 11), Math.round(ht - 9), 1, 6);
      ctx.globalAlpha = 1;
    }
    const dy = lk && lk.dy ? lk.dy : 0;
    wrapDraw(p.y + bob + dy, (y) => (lk && lk.q ? drawTurned(name, fi, p.x, y, flip, lk.q, o) : drawEnt(name, fi, p.x, y, flip, o)));
    if (p.dead && dieT > 8) {
      for (let i = 0; i < 3; i++) {
        const a = dieT * 0.18 + i * (Math.PI * 2 / 3);
        const sx = Math.round(p.x + 8 + Math.cos(a) * 7), sy = Math.round(p.y + 1 + Math.sin(a) * 2.5);
        ctx.fillStyle = i === 1 ? '#ffffff' : '#ffe36b';
        ctx.fillRect(sx, sy - 1, 1, 3); ctx.fillRect(sx - 1, sy, 3, 1);
      }
    }
    if (p.stunT > 0) drawStars(p.x + 8, headTop(p) + 1, 7, 3, G.frame);
    if (p.shield > 0 && !p.dead) {
      // the capybara's hot-water shield: a soap-bubble ring (blinks out at the end)
      if (p.shield > 40 || ((G.frame >> 2) & 1)) {
        const r = 10.5 + Math.sin(G.frame * 0.15) * 0.6;
        ctx.globalAlpha = 0.18; ctx.fillStyle = '#c8f4ff'; ctx.beginPath(); ctx.arc(p.x + 8, p.y + 8 + bob, r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.85; ctx.strokeStyle = '#c8f4ff'; ctx.lineWidth = 1; ctx.stroke();
        ctx.globalAlpha = 1; ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(p.x + 2), Math.round(p.y + bob), 2, 2);
      }
    }
  }
  // co-op ghost bubble: pale, floating; a ring in the slot colour shows the time left to be revived
  function drawGhost(p) {
    const g = p.ghost; if (!g) return;
    const left = GHOST_FRAMES - g.t, blink = left < 120 && ((G.frame >> 2) & 1);
    drawEnt(p.char + '_ghost', (G.frame / 20) | 0, p.x, p.y, p.facing < 0, { alpha: blink ? 0.4 : 0.85 });
    // (distinction §2.9: 2 px at r 10, so the seat colour reads round the pale ghost)
    ctx.globalAlpha = 0.9; ctx.strokeStyle = p.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x + 8, p.y + 8, 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(left / GHOST_FRAMES, 0, 1)); ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 1;
  }
  // a small pointer in the slot colour under each name tag (the nick itself is a DOM label), mine white (online); it
  // stays over the animal however the tag was moved (clamped at a wall, lifted)
  function drawTagArrows() {
    if (!tagsOn()) return;
    for (const p of G.players) {
      if (p.out || p.koT > 0) continue;
      const f = frameOf(SPR_TAG, 0); if (!f) continue;
      const tf = tintOf(f, isMe(p) ? '#ffffff' : p.color, 1), lift = G.mode === 'podium' ? 9 : 0;
      ctx.drawImage(tf.c, Math.round(p.x + 8 - f.w / 2), Math.round(headTop(p) - f.h - 2 - lift));
    }
  }
  const tagsOn = () => multi() && (G.mode === 'playing' || G.mode === 'transition' || G.mode === 'countdown' || G.mode === 'paused' || G.mode === 'podium');
  function drawEnemy(e) {
    if (e.state === 'trapped' || e.state === 'frozen') return;
    if (e.state === 'dead') {
      const f = frameOf(e.type + '_dead', 0); if (!f) return;
      wrapDraw(e.y, (y) => {
        ctx.save(); ctx.translate(Math.round(e.x + 8), Math.round(y + 8)); ctx.rotate((((e.deadT / 5) | 0) % 4) * Math.PI / 2);
        ctx.drawImage(e.vx < 0 ? f.m : f.c, -Math.round(f.w / 2), -Math.round(f.h / 2)); ctx.restore();
      });
      return;
    }
    const charging = e.type === 'sponge' && (e.chargeT > 0 || e.windT > 0);
    const ang = e.angry || charging;
    const soaked = e.soakT > 0 && e.state === 'active';
    const rate = e.type === 'fly' ? (ang ? 2 : 4) : (ang ? 5 : 9) + (soaked ? 5 : 0);
    let fi = (e.t / rate) | 0;
    if (e.type === 'mold' && e.onGround && e.state === 'active') fi = e.hopT < 8 ? 1 : 0;
    let x = e.x;
    if (e.windT > 0) x += (G.frame & 2) ? 1 : -1;
    const o = {};
    if (e.state === 'descend') o.alpha = 0.55 + 0.3 * Math.sin(e.t * 0.5);
    else if (e.grace > 0 && ((G.frame >> 2) & 1)) o.alpha = 0.45; // just spat out by a boss: harmless for a moment
    const name = e.type + (soaked ? '_soaked' : ang ? '_angry' : '_walk');
    wrapDraw(e.y, (y) => drawEnt(name, fi, x, y, e.dir < 0, o));
  }
  // whose animal blew a bubble, for its look: the host's own bubbles and my predicted copies carry k (set when blown);
  // a guest's view rows go owner slot -> that player's animal. 능력 끄기, no owner (stamps, steam, a player who left)
  // or anything but a plain empty bubble (a prison is plain): null = today's look
  function charOfSlot(slot) { const o = slot >= 0 ? G.players.find((q) => q.slot === slot) : null; return o && isChar(o.char) ? o.char : null; }
  function bubbleChar(b) {
    if (G.perksOff || !(b.owner >= 0) || b.kind !== 'empty') return null;
    if (b.k > 0) return CHAR_IDS[b.k - 1] || null;
    return b.k === undefined && G.online && G.role === 'guest' ? charOfSlot(b.owner) : null;
  }
  // an animal's bubble popping: its palette ([slot colour, hueA, hueB] in multiplayer) and its extra - the duck's ring,
  // the capy's foam, the penguin's two sparkle crosses, the frog's dark egg dot dropping; an otter droplet's own burst
  // is 3 drops
  function kitPop(ch, cx, cy, owner, drop) {
    const L = KIT_LOOK[ch], cols = multi() && owner >= 0 ? [SLOT_COLS[owner] || '#ffffff', L.pop[0], L.pop[1]] : L.pop;
    burst(cx, cy, drop ? 3 : L.n, cols, L.sp, L.life, L.g);
    if (drop) return;
    if (ch === 'duck') kfx({ k: 'ring', x: cx, y: cy, r0: 4, r1: 12, dur: 8, col: '#fff3a8' });
    else if (ch === 'capy') foamPuff(cx, cy, 3, 12, 2);
    else if (ch === 'penguin') { kfx({ k: 'cross', x: cx - 5, y: cy - 4, dur: 8 }); kfx({ k: 'cross', x: cx + 5, y: cy + 3, dur: 8 }); }
    else if (ch === 'frog' && G.parts.length < 360) G.parts.push({ x: cx - 1, y: cy - 1, vx: 0, vy: 0.3, life: 20, max: 20, c: '#1d4a14', sz: 2, g: 0.15 });
  }
  // an animal's own bubble (char-kits §2.6): the film in its hue, a 1 px ring in the owner's slot colour (multiplayer),
  // the 5x5 glyph at the centre 1 px low, and its shape / trail - the duck's echo arcs (+ a ring where it turns), the
  // capy's big bubble steaming, the otter's drips and small teardrop droplets, the penguin's stretched icicle and its
  // contrail, the cat's yarn thread (a rolling yarn only), the frog's jelly egg and its halo while it waits. The motion
  // side comes from the spots it is drawn at (a guest's view rows too); the glyph keeps the side it flew while it floats
  // a bubble's drawn scale [x, y]: the kit look (drawKitBubble) or the plain one (1, big 1.25) - the battle's rival test
  // (rivalTouch) reads the same numbers, so what touches on screen is what catches
  function bubbleScale(b, ch) {
    if (!ch) return b.big ? [1.25, 1.25] : [1, 1];
    let s = b.big ? 1.25 : 1;
    if (ch === 'capy') s = b.big ? 1.5 : 1.25; else if (ch === 'frog') s *= 0.9;
    if (b.drop) s = b.big ? 0.9 : 0.65;
    return ch === 'penguin' && b.state === 'shot' ? [s * 1.15, s * 0.87] : [s, s];
  }
  function drawKitBubble(b, ch) {
    const L = KIT_LOOK[ch], F = G.frame, calm = reducedMotion();
    const shot = b.state === 'shot', pop = b.state === 'pop', drop = !!b.drop, yarn = b.ty ? b.ty === 'yarn' : !!b.yarn;
    const hold = ch === 'frog' && shot && (b.ty === 'egg' ? b.ph === 1 : b.age > KIT.frog.shot.go);
    const nf = b._lf !== F;
    if (nf) {
      const was = b._md;
      if (b._lf !== undefined && Math.abs(b.x - b._lx) > 0.05) b._md = b.x > b._lx ? 1 : -1;
      else if (!b._md) b._md = b.dir || sign(b.vx) || 1;
      if (shot) b._gd = b._md;
      if (ch === 'duck' && shot && was && was !== b._md) kfx({ k: 'ring', x: b.x + 8, y: b.y + 8, r0: 8, r1: 14, dur: 8, col: '#fff3a8' });
      b._lx = b.x; b._lf = F;
    }
    const md = b._md || 1, gd = b._gd || md;
    let [sx, sy] = bubbleScale(b, ch);
    if (b.squish > 0) { const q = 0.18 * (b.squish / 8); sx *= 1 + q; sy *= 1 - q; }
    let name, fi, alpha;
    if (pop) { name = 'bubble_pop'; fi = b.popT < 5 ? 0 : 1; }
    else { name = shot || b.age < 12 ? 'bubble_new' : 'bubble'; fi = (b.age / 9) | 0; if (b.age > emptyLife() && ((F >> 2) & 1)) alpha = 0.35; }
    const a0 = alpha === undefined ? 1 : alpha, cx = b.x + 8, cy = b.y + 8, rx = 8 * sx, ry = 8 * sy;
    // trails behind it while it flies (under the bubble)
    if (shot && !calm) {
      if (ch === 'penguin') {
        for (const [k, col, a] of [[2, '#ffffff', 0.8], [7, '#bff0ff', 0.5], [12, '#7fd0ee', 0.3]]) {
          ctx.globalAlpha = a * a0; ctx.fillStyle = col; ctx.fillRect(Math.round(cx - md * (rx + k)) - 1, Math.round(cy) - 1, 2, 2);
        }
      } else if (ch === 'cat' && yarn) {
        ctx.globalAlpha = a0; ctx.fillStyle = '#ff8fb1';
        for (let i = 0; i < 10; i++) ctx.fillRect(Math.round(cx - md * (rx - 1 + i)), Math.round(cy + 3 + 2 * Math.sin(i * 0.8 - b.age * 0.5)), 1, 1);
      } else if (ch === 'otter' && !drop && nf && b.age % 3 === 0 && trailRoom()) {
        G.parts.push({ x: cx + (fxr() - 0.5) * 6, y: cy + 5, vx: 0, vy: 0.2, life: 12, max: 12, c: '#8fe3ff', sz: 1, g: 0.1 });
      }
      ctx.globalAlpha = 1;
    }
    drawCentred(name, fi, b.x, b.y, sx, sy, { tint: CHARS[ch].hue, tintA: 0.3, alpha });
    if (pop) return;
    if (multi()) ownerRing(b, cx, cy, sx, sy, a0);
    ctx.globalAlpha = a0;
    if (!drop) {
      const icon = frameOf(L.icon, ch === 'cat' ? Math.floor(b.x / 8) : 0); // (the yarn turns over every 8 px it rolls)
      if (icon) ctx.drawImage(gd < 0 ? icon.m : icon.c, Math.round(cx) - 2, Math.round(cy) - 1);
      else if (ch === 'frog') { ctx.fillStyle = '#1d4a14'; ctx.fillRect(Math.round(cx) - 1, Math.round(cy), 3, 3); }
    }
    if (ch === 'duck' && shot && !calm) {
      // 메아리: two sound arcs on the side it comes from
      const c0 = md > 0 ? Math.PI : 0;
      ctx.strokeStyle = '#ffe36b'; ctx.lineWidth = 1;
      for (const [r, a] of [[10, 0.5], [13, 0.3]]) { ctx.globalAlpha = a * a0; ctx.beginPath(); ctx.arc(cx, cy, r, c0 - 0.61, c0 + 0.61); ctx.stroke(); }
    } else if (ch === 'capy' && !calm) {
      // steam off the hot bubble: two dots rising 0-6 px over its top (from its age: no particles)
      for (const k of [0, 6]) {
        const rise = ((b.age + k) % 12) / 2;
        ctx.globalAlpha = 0.6 * (1 - rise / 6) * a0; ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.round(cx + (k ? 1 : -4)), Math.round(cy - ry - 2 - rise), 2, 2);
      }
    } else if (ch === 'otter' && drop) {
      ctx.fillStyle = '#bff7ee'; ctx.fillRect(Math.round(md > 0 ? cx - rx - 2 : cx + rx), Math.round(cy) - 1, 2, 1); // (its teardrop tail)
    } else if (hold) {
      // the egg waits: a halo pulsing over 30 f
      ctx.globalAlpha = (calm ? 0.35 : 0.35 + 0.1 * Math.sin(b.age * Math.PI / 15)) * a0; ctx.strokeStyle = '#c8f08a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // the owner's ring on a bubble (distinction §2.9; the kit films' hues sit right on the slot colours, so this ring is
  // the owner cue): opaque, 2 px at r 9 for a battle shot in flight (the one that can trap you), else 1 px at r 8.5
  function ownerRing(b, cx, cy, sx, sy, a0) {
    const fly = G.gameMode === 'battle' && b.state === 'shot', r = fly ? 9 : 8.5;
    ctx.globalAlpha = a0; ctx.strokeStyle = SLOT_COLS[b.owner] || '#ffffff'; ctx.lineWidth = fly ? 2 : 1;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * sx, r * sy, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1;
  }
  function drawBubble(b) {
    const kc = bubbleChar(b);
    if (kc) { drawKitBubble(b, kc); return; }
    let name, fi = 0, dx = 0, white = 0, alpha, scale = 0, tint = null, tintA = 0.35, ring = null;
    if (b.state === 'pop') { name = 'bubble_pop'; fi = b.popT < 5 ? 0 : 1; }
    else if (b.kind === 'trapped' && b.enemy) {
      name = b.enemy.type + (b.soaked ? '_trapped_soaked' : '_trapped'); fi = (b.age / 14) | 0;
      const left = b.trapMax - b.trapT;
      if (left < FLASH) { dx = Math.round(Math.sin(G.frame * 0.9) * 1.4); if ((G.frame >> 2) & 1) white = 0.55; }
    } else if (b.kind === 'player' && b.victim) {
      // battle: an opponent curled up in a bubble tinted with the trapper's colour (shakes as it breaks free)
      const v = b.victim, t = v.trap;
      name = v.char + '_trapped'; fi = (b.age / 14) | 0;
      tint = SLOT_COLS[b.owner] || null; tintA = 0.3; ring = tint; // (+ a 2 px ring in the trapper's colour, distinction §2.9)
      if (t && PTRAP_FRAMES - t.prog < 60) { dx = Math.round(Math.sin(G.frame * 0.9) * 1.4); if ((G.frame >> 2) & 1) white = 0.45; }
    } else if (b.kind === 'stamp') { name = 'stamp_bubble'; fi = (b.age / 12) | 0; }
    else if (b.kind === 'steam') { name = 'steam_bubble'; fi = (b.age / 12) | 0; }
    else {
      name = b.state === 'shot' || b.age < 12 ? 'bubble_new' : 'bubble'; fi = (b.age / 9) | 0; if (b.big) scale = 1.25;
      if (b.owner >= 0 && multi()) tint = SLOT_COLS[b.owner]; // whose bubble it is
    }
    if (b.kind !== 'trapped' && b.kind !== 'player' && b.state !== 'pop') {
      const life = b.kind === 'empty' ? emptyLife() : SPECIAL_LIFE; // (the blink: a guest reads the host's age against the same rule)
      if (b.age > life && ((G.frame >> 2) & 1)) alpha = 0.35;
    }
    const o = { white, alpha };
    if (tint) { o.tint = tint; o.tintA = tintA; }
    if (b.squish > 0) o.sq = 0.18 * (b.squish / 8);
    else if (scale) o.scale = scale;
    drawEnt(name, fi, b.x + dx, b.y, false, o);
    if (ring) {
      ctx.globalAlpha = 1; ctx.strokeStyle = ring; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x + dx + 8, b.y + 8, 9, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineWidth = 1;
    } else if (tint && b.state !== 'pop') {
      // a plain owned bubble (능력 끄기 / no kit look): the owner's ring on top of the tint, as on kit bubbles (drawEnt
      // squashes about the feet line, so the squished ring's centre moves down with it)
      const k = o.scale || 1, sx = o.sq ? 1 + o.sq : k, sy = o.sq ? 1 - o.sq : k;
      ownerRing(b, b.x + 8, o.sq ? b.y + 16 - 8 * sy : b.y + 8, sx, sy, alpha === undefined ? 1 : alpha);
      ctx.globalAlpha = 1;
    }
  }
  function drawItems() {
    for (const it of G.items) {
      if (ITEM_LIFE - it.age < FLASH && ((G.frame >> 2) & 1)) continue;
      const bob = it.age < 10 ? -Math.round(Math.sin((it.age / 10) * Math.PI) * 3) : it.floating ? Math.round(Math.sin((G.frame + it.x) * 0.08)) : 0;
      wrapDraw(it.y, (y) => drawEnt('item_' + it.type, 0, it.x, y + bob, false));
    }
  }
  function drawPickup() {
    const k = G.pickup; if (!k) return;
    if (k.land > PICKUP_LIFE - FLASH && ((G.frame >> 2) & 1)) return;
    const bob = k.onGround ? Math.round(Math.sin(G.frame * 0.12) * 1.2) - 1 : 0;
    wrapDraw(k.y, (y) => drawEnt('pw_' + k.type, 0, k.x, y + bob, false));
    if ((G.frame >> 3) % 3 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(k.x + 13), Math.round(k.y + 1 + bob), 1, 3); ctx.fillRect(Math.round(k.x + 12), Math.round(k.y + 2 + bob), 3, 1); }
  }
  function drawWater() {
    if (!waterCells.length) return;
    const fr = (G.frame / 14) | 0;
    for (const w of waterCells) {
      const f = frameOf((w.k === 1 ? 'water_hot' : 'water_cold') + (w.top ? '_top' : ''), w.top ? fr + w.c : 0);
      if (!f) continue;
      ctx.globalAlpha = w.top ? 0.82 : 0.6;
      ctx.drawImage(f.c, w.c * TS, PF_TOP + w.r * TS, TS, TS);
    }
    ctx.globalAlpha = 1;
  }
  function drawIce() {
    for (const ice of G.ice) {
      if (ice.dead) continue;
      const left = ICE_LIFE - ice.t;
      const flash = left < ICE_FLASH && ((G.frame >> 2) & 1) ? 0.55 : 0;
      if (ice.enemy) {
        // back of the block, the frozen enemy, then a glassy front so the prisoner stays readable
        drawEnt('ice_block', 0, ice.x, ice.y, false, { alpha: 0.55 });
        drawEnt(ice.enemy.type + '_frozen', 0, ice.x, ice.y, ice.enemy.dir < 0);
        drawEnt('ice_block', 0, ice.x, ice.y, false, { alpha: 0.3, white: flash });
      } else drawEnt('ice_block', 0, ice.x, ice.y, false, { alpha: 0.95, white: flash });
    }
  }
  function drawDrops() {
    for (const d of G.drops) {
      if (d.dead) continue;
      if (d.state === 'form') {
        const k = d.t / DROP_FORM, pulse = ((G.frame >> 2) & 1) === 1;
        // warning shimmer: a pulsing hot glow around the bead and heat ripples down the column it will fall
        const cx = d.x + 4, cy = d.y + 3, rad = 5 + 4 * k + (pulse ? 2 : 0);
        const gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        gl.addColorStop(0, 'rgba(255,110,80,0.8)'); gl.addColorStop(0.5, 'rgba(255,140,110,0.35)'); gl.addColorStop(1, 'rgba(255,140,110,0)');
        ctx.fillStyle = gl; ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
        ctx.globalAlpha = pulse ? 1 : 0.7;
        ctx.fillStyle = '#ff5a3c'; ctx.fillRect(d.x - 3, d.y, 14, 1);
        for (let i = 0; i < 5; i++) {
          const sy = d.y + 7 + ((G.frame * 0.6 + i * 5) % 24);
          ctx.globalAlpha = (pulse ? 0.95 : 0.65) * (1 - (sy - d.y - 7) / 28);
          ctx.fillStyle = i & 1 ? '#ffffff' : '#ffc0b0';
          ctx.fillRect(d.x + 1 + ((i + (G.frame >> 3)) % 3) * 2 + ((G.frame >> 2) & 1), Math.round(sy), 1, 4);
        }
        ctx.globalAlpha = 1;
        const f = frameOf('scald_drop', 0);
        if (f) {
          const s = 0.65 + 0.35 * k, w = Math.max(2, Math.round(f.w * s)), h = Math.max(2, Math.round(f.h * s));
          const jx = d.t > DROP_FORM - 12 ? (G.frame & 1 ? 1 : -1) : 0; // trembles just before it lets go
          ctx.drawImage(f.c, Math.round(d.x + 4 - w / 2) + jx, Math.round(d.y), w, h);
          if (pulse) { ctx.drawImage(f.wh, Math.round(d.x + 4 - w / 2) + jx, Math.round(d.y), w, h); }
        }
      } else {
        ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffb0a0'; ctx.fillRect(Math.round(d.x + 3), Math.round(d.y - 5), 2, 5); ctx.globalAlpha = 1;
        drawRaw('scald_drop', 1, d.x, d.y);
      }
    }
  }

  // ---- bosses
  // lather spots (비누칠) that pile up on the boss as its soap gauge fills
  // (positions for a right-facing boss: along the back, the bottom and the top, never over the face)
  const LATHER = [[5, 15], [8, 24], [4, 27], [12, 29], [11, 19], [8, 10], [17, 27], [23, 29], [28, 26], [14, 5], [21, 4], [27, 7], [5, 7], [30, 19]];
  const rageCache = new Map();
  function bossFrame(name, fi, phase) {
    const f = frameOf(name, fi);
    if (!f || phase < 2) return f;
    const n = SPR[name].length, key = name + '|' + ((((fi | 0) % n) + n) % n) + '|' + phase;
    let r = rageCache.get(key);
    if (!r) { r = tintFrame(f, '#ff2a2a', phase >= 3 ? 0.3 : 0.16); rageCache.set(key, r); }
    return r;
  }
  function bossSprite(b) {
    const base = 'boss_' + b.def.spr + '_', k = b.def.spr;
    if (b.state === 'stun' || b.state === 'down' || b.state === 'defeat') return [base + 'hurt', 0];
    if (b.state === 'fight') {
      if (k === 'grime' && (b.act === 'air' || (b.act === 'crouch' && b.actT < 8))) return [base + 'jump', 0];
      if (k === 'mold' && b.act === 'charge') return [base + 'shoot', 0];
      if (k === 'sponge' && b.act === 'dizzy') return [base + 'hurt', 0];
      if (k === 'sponge' && (b.act === 'wind' || b.act === 'charge')) return [base + 'charge', (G.frame >> 2) & 1];
      if (k === 'towel' && (b.act === 'swoopWind' || b.act === 'swoop' || b.act === 'cast')) return [base + 'swoop', 0];
    }
    return [base + 'idle', (G.frame / 20) | 0];
  }
  // bouncing red "!" over an attack that is about to happen
  function drawAlert(x, y) {
    const by = Math.round(y - Math.abs(Math.sin(G.frame * 0.25)) * 3);
    text('!', x + 1, by, (G.frame >> 2) & 1 ? '#ff4a4a' : '#ffe36b', { align: 'center', scale: 2, outline: '#2a0f1c' });
  }
  function drawStars(cx, cy, rx, n, t) {
    for (let i = 0; i < n; i++) {
      const a = t * 0.15 + i * (Math.PI * 2 / n);
      const sx = Math.round(cx + Math.cos(a) * rx), sy = Math.round(cy + Math.sin(a) * rx * 0.35);
      ctx.fillStyle = i & 1 ? '#ffffff' : '#ffe36b';
      ctx.fillRect(sx, sy - 1, 1, 3); ctx.fillRect(sx - 1, sy, 3, 1);
    }
  }
  // where an airborne ground boss will come down (the same rules as bossPhys; a hop into a wall slides down it)
  function bossLanding(b) {
    let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
    for (let k = 1; k < 160; k++) {
      x += vx;
      if (x < WALL_L) { x = WALL_L; vx = 0; } else if (x > WALL_R - 32) { x = WALL_R - 32; vx = 0; }
      const vy0 = vy; vy = Math.min(5, vy + BOSS_G); const f0 = y + 32; y += (vy0 + vy) / 2;
      if (vy >= 0) { const t = landTile(x + 3, x + 29, f0, y + 32, b.dropRow); if (t !== null) return { x, feet: t, k }; }
      if (y < CEIL_Y) { y = CEIL_Y; if (vy < 0) vy = 0; }
      if (y + 32 > PF_BOT) y -= PF_H;
    }
    return null;
  }
  // the boss's shadow sits where it is going to land (so a hop can be read and dodged), darker and wider
  // as it comes down
  function drawBossShadow(b) {
    let x = b.x, t, k;
    if (b.state === 'intro') { t = landTile(b.x + 3, b.x + 29, b.y + 32, PF_BOT - 1); k = Math.max(0, BOSS_LAND - b.t); }
    else { const l = bossLanding(b); if (!l) return; x = l.x; t = l.feet; k = l.k; }
    if (t === null || t === undefined) return;
    const near = clamp(1 - k / 40, 0, 1), w = 12 + 18 * near;
    ctx.globalAlpha = 0.2 + 0.32 * near;
    ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.ellipse(x + 16, t - 1, w / 2, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    // a red rim while it is still high: "it is coming down here"
    if (b.state !== 'intro' && k > 6 && ((G.frame >> 2) & 1)) {
      ctx.globalAlpha = 0.55; ctx.strokeStyle = '#ff6a5a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x + 16, t - 1.5, w / 2 + 1, 3, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawBoss() {
    const b = G.boss; if (!b) return;
    const fly = b.def.fly;
    if (!fly && ((b.state === 'intro' && b.t >= 20 && b.t < BOSS_LAND) || ((b.state === 'fight' || b.state === 'down') && !b.onGround))) drawBossShadow(b);
    if (b.state === 'intro' && b.t < BOSS_DROP0) {
      if (fly && b.t >= 20 && ((G.frame >> 2) & 1)) { ctx.fillStyle = '#ffffff'; for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(b.sx + 6 + i * 6 + Math.sin(G.frame * 0.3 + i) * 2), Math.round(b.sy + 8 + ((G.frame + i * 7) % 16)), 1, 2); }
      return;
    }
    if (b.state === 'defeat' && b.t >= DEFEAT_BOOM) return;
    const sp = bossSprite(b);
    const f = b.state === 'fight' || b.state === 'down' ? bossFrame(sp[0], sp[1], b.phase) : frameOf(sp[0], sp[1]);
    if (!f) return;
    let x = b.x, y = b.y;
    const jitter = b.state === 'defeat' || (b.state === 'stun' && b.stunT < STUN_WARN) || (b.state === 'down' && b.t > DOWN_FRAMES - 30) ||
      (b.state === 'fight' && (b.act === 'wind' || b.act === 'swoopWind' || b.act === 'crouch' || b.act === 'squat' || (b.act === 'charge' && fly)));
    if (jitter) x += (G.frame & 2) ? 1 : -1;
    if (fly && b.state === 'fight' && b.act !== 'swoop') y += Math.round(Math.sin(G.frame * 0.1 + b.bob));
    const flip = b.face < 0;
    let w = 32, h = 32;
    if (b.sq) { w = Math.round(32 * (1 + b.sq)); h = Math.round(32 * (1 - b.sq)); }
    const dx = Math.round(x + 16 - w / 2), dy = Math.round(y + 32 - h);
    let alpha = 1;
    if (b.state === 'intro') alpha = clamp(0.25 + (b.t - BOSS_DROP0) / (BOSS_LAND - BOSS_DROP0), 0.25, 1);
    else if (b.state === 'down' && ((G.frame >> (b.t > DOWN_FRAMES - 30 ? 1 : 3)) & 1)) alpha = 0.55; // knocked down: blinking, harmless (faster just before it gets up)
    ctx.globalAlpha = alpha;
    ctx.drawImage(flip ? f.m : f.c, dx, dy, w, h);
    if (b.hitFlash > 0) { ctx.globalAlpha = 0.65; ctx.drawImage(flip ? f.whm : f.wh, dx, dy, w, h); }
    ctx.globalAlpha = 1;
    // lather piling up with the soap gauge
    const nl = b.state === 'stun' ? LATHER.length : clamp(Math.round((b.soap / Math.max(1, b.soapMax)) * LATHER.length), 0, LATHER.length);
    for (let i = 0; i < nl; i++) {
      const lx = dx + Math.round((flip ? 32 - LATHER[i][0] : LATHER[i][0]) * w / 32), ly = dy + Math.round(LATHER[i][1] * h / 32) + (((G.frame >> 4) + i) & 1);
      ctx.fillStyle = '#8fd0e0'; ctx.fillRect(lx - 1, ly + 1, 4, 1);
      ctx.fillStyle = '#f2fdff'; ctx.fillRect(lx - 1, ly - 1, 4, 2); ctx.fillRect(lx, ly - 2, 2, 1);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(lx, ly - 1, 1, 1);
    }
    if (b.state === 'down' || (b.state === 'fight' && b.act === 'dizzy')) drawStars(b.x + 16, b.y + 2, 11, 3, b.t);
    if (b.state === 'fight') {
      if (b.act === 'wind' || b.act === 'swoopWind' || b.act === 'cast') drawAlert(b.x + 16, b.y - 13);
      if (b.act === 'crouch') drawAlert(b.x + 16, b.y - 11);
      if (b.act === 'charge' && fly) {
        // the queen's mouth glows while the spores build up
        const k = 1 - b.actT / 36, cx = b.x + 16 + b.face * 8, cy = b.y + 22, r = 2 + k * 4;
        const gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, r + 3);
        gl.addColorStop(0, 'rgba(214,255,154,0.95)'); gl.addColorStop(0.6, 'rgba(180,140,255,0.5)'); gl.addColorStop(1, 'rgba(180,140,255,0)');
        ctx.fillStyle = gl; ctx.fillRect(cx - r - 3, cy - r - 3, (r + 3) * 2, (r + 3) * 2);
        drawAlert(b.x + 16, b.y - 13);
      }
      if (b.act === 'swoopWind') {
        // target mark on the spot it will dive at, and a dotted line to it
        const tx = Math.round(b.tx), ty = Math.round(b.ty), on = (G.frame >> 2) & 1;
        ctx.fillStyle = on ? '#ff4a4a' : '#ffe36b';
        const r = 7 + (b.actT >> 3);
        ctx.fillRect(tx - r, ty, 4, 1); ctx.fillRect(tx + r - 3, ty, 4, 1); ctx.fillRect(tx, ty - r, 1, 4); ctx.fillRect(tx, ty + r - 3, 1, 4);
        ctx.strokeStyle = on ? 'rgba(255,74,74,0.9)' : 'rgba(255,227,107,0.9)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(tx + 0.5, ty + 0.5, r - 2, 0, Math.PI * 2); ctx.stroke();
        const sx = b.x + 16, sy = b.y + 16, n = 10;
        ctx.globalAlpha = 0.6;
        for (let i = 1; i < n; i++) if ((i + (G.frame >> 2)) % 2 === 0) ctx.fillRect(Math.round(lerp(sx, tx, i / n)), Math.round(lerp(sy, ty, i / n)), 2, 2);
        ctx.globalAlpha = 1;
      }
    }
    // stunned: sealed inside the giant bubble (flashes and wobbles just before it breaks out)
    if (b.state === 'stun' && b.giant) {
      const g = b.giant, warn = b.stunT < STUN_WARN;
      const s = warn ? 1 + Math.sin(G.frame * 0.6) * 0.05 : 1 + Math.sin(b.t * 0.08) * 0.02;
      const gw = Math.round(40 * s), gx = Math.round(g.x + 20 - gw / 2), gy = Math.round(g.y + 20 - gw / 2);
      ctx.globalAlpha = 0.16; ctx.fillStyle = '#c8f4ff';
      ctx.beginPath(); ctx.arc(g.x + 20, g.y + 20, 18 * s, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      const gf = frameOf('giant_bubble', (b.t / 10) | 0);
      if (gf) {
        ctx.drawImage(gf.c, gx, gy, gw, gw);
        if (warn && ((G.frame >> 2) & 1)) { ctx.globalAlpha = 0.7; ctx.drawImage(gf.wh, gx, gy, gw, gw); ctx.globalAlpha = 1; }
      }
      // a little arrow: touch it!
      if (!warn || ((G.frame >> 3) & 1)) {
        const ay = Math.round(g.y + 44 + Math.abs(Math.sin(G.frame * 0.15)) * 3);
        ctx.fillStyle = '#ffe36b';
        for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(g.x + 20) - i, ay + 3 - i, 1 + i * 2, 1);
      }
    }
  }
  function drawHazards() {
    for (const h of G.hazards) {
      if (h.dead) continue;
      if (h.kind === 'wave') {
        const f = frameOf('shockwave', h.t >> 2);
        if (f) { const hh = h.t < 9 ? Math.max(2, Math.round(8 * h.t / 9)) : 8; ctx.drawImage(h.vx < 0 ? f.m : f.c, 0, 8 - hh, 16, hh, Math.round(h.x), Math.round(h.y - hh), 16, hh); }
      }
      else if (h.kind === 'spore') {
        if (h.state === 'fly') drawRaw('spore', h.t >> 3, h.x, h.y);
        else {
          // a landed spore swells and flashes faster as it is about to hatch; a ring shows the time left
          const k = h.hatch / SPORE_HATCH, cx = h.x + 4, cy = h.y + 4;
          ctx.strokeStyle = k > 0.66 ? '#ff7a6b' : '#d6ff9a'; ctx.lineWidth = 1;
          ctx.globalAlpha = 0.85;
          ctx.beginPath(); ctx.arc(cx, cy, 6.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - k)); ctx.stroke();
          ctx.globalAlpha = 1;
          const f = frameOf('spore', h.hatch >> (k > 0.66 ? 2 : 4));
          if (f) {
            const s = 1 + 0.35 * k + (k > 0.66 && ((G.frame >> 1) & 1) ? 0.12 : 0), sw = Math.round(8 * s);
            ctx.drawImage(f.c, Math.round(cx - sw / 2), Math.round(h.y + 8 - sw), sw, sw);
            if (k > 0.66 && ((G.frame >> 2) & 1)) { ctx.globalAlpha = 0.5; ctx.drawImage(f.wh, Math.round(cx - sw / 2), Math.round(h.y + 8 - sw), sw, sw); ctx.globalAlpha = 1; }
          }
        }
      } else if (h.kind === 'mitt') {
        ctx.globalAlpha = 0.3; ctx.fillStyle = '#9ff0b0'; ctx.fillRect(Math.round(h.x + 6), Math.round(h.y - 6), 4, 6); ctx.globalAlpha = 1;
        drawRaw('mini_mitt', h.t >> 3, h.x, h.y, false);
      } else if (h.kind === 'sweep') drawSweep(h);
    }
  }
  function drawSweep(h) {
    const y0 = h.sy - 12;
    if (h.state === 'warn') {
      // warning band along the row, chevrons pointing the way the lash will come, "!" at its wall
      const on = (G.frame >> 2) & 1;
      ctx.globalAlpha = on ? 0.32 : 0.18; ctx.fillStyle = '#ff4a4a'; ctx.fillRect(WALL_L, y0, WALL_R - WALL_L, 11);
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#ff6a5a';
      const off = (G.frame >> 1) % 8;
      for (let x = WALL_L; x < WALL_R; x += 8) { const xx = h.dir > 0 ? x + off : x + 7 - off; ctx.fillRect(xx, y0, 4, 1); ctx.fillRect(xx, y0 + 10, 4, 1); }
      ctx.fillStyle = '#ffe36b';
      for (let k = 0; k < 3; k++) {
        const cx = h.dir > 0 ? WALL_L + 18 + k * 7 : WALL_R - 18 - k * 7, cy = y0 + 5;
        for (let i = 0; i < 3; i++) { ctx.fillRect(cx - h.dir * i, cy - i, 1, 1); ctx.fillRect(cx - h.dir * i, cy + i, 1, 1); }
      }
      ctx.globalAlpha = 1;
      drawAlert(h.dir > 0 ? WALL_L + 7 : WALL_R - 7, y0 - 14);
      return;
    }
    // the towel lash: a scrubby green band with a frayed tip and red-gold trim, speed streaks behind it
    const x = Math.round(h.x), d = h.dir;
    ctx.globalAlpha = 0.45; ctx.fillStyle = '#ffffff';
    for (let i = 1; i <= 3; i++) ctx.fillRect(d > 0 ? x - i * 9 : x + 24 + i * 9 - 6, y0 + 2 + i * 2, 6, 1);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#1b7a3a'; ctx.fillRect(x, y0 + 1, 24, 9);
    ctx.fillStyle = '#3cc464'; ctx.fillRect(x + 1, y0 + 2, 22, 6);
    ctx.fillStyle = '#7fe08f';
    for (let i = 0; i < 22; i += 3) ctx.fillRect(x + 1 + i + ((h.t >> 1) & 1), y0 + 3 + (i % 2) * 2, 1, 1);
    ctx.fillStyle = '#c8202a'; ctx.fillRect(x, y0 + 9, 24, 2);
    ctx.fillStyle = '#ffd23f'; for (let i = 0; i < 24; i += 4) ctx.fillRect(x + i, y0 + 10, 2, 1);
    const tip = d > 0 ? x + 24 : x - 3;
    ctx.fillStyle = '#3cc464'; for (let i = 0; i < 4; i++) ctx.fillRect(tip, y0 + 2 + i * 2, 3, 1);
  }
  function drawFoam() {
    for (const f of G.foam) {
      const a = clamp(f.life / 18, 0, 1);
      ctx.globalAlpha = a * 0.9; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = a * 0.6; ctx.fillStyle = '#bfe6f0';
      ctx.fillRect(Math.round(f.x - f.r * 0.2), Math.round(f.y + f.r * 0.5), Math.max(1, Math.round(f.r * 0.8)), 1);
    }
    ctx.globalAlpha = 1;
  }
  // boss HP (3 segments) on the left of the ceiling row, soap (비누칠) gauge on the right; both clear the
  // showerhead opening in the middle
  function drawBossBar() {
    const b = G.boss;
    if (!b || (b.state === 'intro' && b.t < BOSS_LAND) || (b.state === 'defeat' && b.t > DEFEAT_BOOM + 40)) return;
    const y = PF_TOP;
    const fill = b.state === 'intro' ? clamp((b.t - BOSS_LAND) / 30, 0, 1) : 1;
    ctx.fillStyle = 'rgba(6,20,24,0.85)'; ctx.fillRect(18, y, 92, 8); ctx.fillRect(146, y, 92, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(18, y, 92, 1); ctx.fillRect(146, y, 92, 1);
    text('HP', 21, y + 1, '#ff9eb8');
    for (let i = 0; i < BOSS_HP; i++) {
      const sx = 34 + i * 25, on = i < b.hp && i < Math.ceil(fill * BOSS_HP);
      const lost = !on && b.state === 'down' && i === b.hp && ((G.frame >> 2) & 1);
      ctx.fillStyle = on ? '#ff5a7a' : lost ? '#ffffff' : '#3a1420'; ctx.fillRect(sx, y + 2, 23, 4);
      if (on) { ctx.fillStyle = '#ffb0c0'; ctx.fillRect(sx, y + 2, 23, 1); ctx.fillStyle = '#b02848'; ctx.fillRect(sx, y + 5, 23, 1); }
    }
    // soap bar icon
    ctx.fillStyle = '#ffd6ec'; ctx.fillRect(149, y + 2, 8, 5); ctx.fillStyle = '#ff9ec4'; ctx.fillRect(149, y + 6, 8, 1);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(150, y + 3, 2, 1); ctx.fillRect(156, y + 1, 2, 2); ctx.fillRect(158, y, 1, 1);
    const gx = 162, gw = 73;
    ctx.fillStyle = '#12303a'; ctx.fillRect(gx, y + 2, gw, 4);
    if (b.state === 'stun') {
      // sealed: the gauge shows the time left to burst the giant bubble
      const k = clamp(b.stunT / STUN_FRAMES, 0, 1), on = b.stunT < STUN_WARN && ((G.frame >> 2) & 1);
      ctx.fillStyle = on ? '#ffffff' : '#ffe36b'; ctx.fillRect(gx, y + 2, Math.max(1, Math.round(gw * k)), 4);
    } else {
      const k = clamp(b.soap / b.soapMax, 0, 1);
      ctx.fillStyle = '#9fe6ff'; ctx.fillRect(gx, y + 2, Math.round(gw * k), 4);
      ctx.fillStyle = '#e6fbff'; ctx.fillRect(gx, y + 2, Math.round(gw * k), 1);
      ctx.fillStyle = 'rgba(6,20,24,0.9)';
      for (let i = 1; i < b.soapMax; i++) ctx.fillRect(gx + Math.round((gw * i) / b.soapMax), y + 2, 1, 4);
      if (b.type === 'megaSponge' && b.state === 'fight' && b.act === 'dizzy' && ((G.frame >> 3) & 1)) text('x2', gx + gw - 11, y + 1, '#ffe36b', { outline: '#2a0f1c' });
    }
  }
  function drawHUD() {
    ctx.fillStyle = '#0a1a1d'; ctx.fillRect(0, 0, W, PF_TOP);
    ctx.fillStyle = '#16363a'; ctx.fillRect(0, PF_TOP - 1, W, 1);
    if (G.gameMode === 'battle') { drawHUDBattle(); return; }
    if (G.gameMode === 'coop') { drawHUDCoop(); return; }
    const lv = Math.max(0, G.lives);
    const shown = Math.min(lv, 5);
    const lifeBlink = G.ticketFlash > 0 && ((G.ticketFlash >> 3) & 1);
    const lifeName = G.p && G.p.char !== 'duck' ? 'life_' + G.p.char : 'life';
    for (let i = 0; i < shown; i++) if (!(lifeBlink && i === shown - 1)) drawRaw(lifeName, 0, 4 + i * 9, 0);
    if (lv > 5) text('x' + lv, 4 + 5 * 9 + 1, 1, '#ffd447');
    text(String(G.score), 4, 9, '#fbf0d9');
    // active power-up: icon + shrinking timer bar
    if (G.power) {
      const k = clamp(G.power.t / POWER_FRAMES, 0, 1), blink = G.power.t < 120 && ((G.frame >> 3) & 1);
      if (!blink) drawRaw('pw_' + G.power.type, 0, 56, 0);
      ctx.fillStyle = '#16363a'; ctx.fillRect(74, 6, 28, 4);
      ctx.fillStyle = k < 0.25 ? '#ff7a6b' : '#7fdcc8'; ctx.fillRect(74, 6, Math.max(1, Math.round(28 * k)), 4);
    }
    text('HI', 128, 1, '#f6a6bd', { align: 'center' });
    text(String(G.hiscore), 128, 9, G.newHi && !G.attract ? '#ffe36b' : '#ffd447', { align: 'center' });
    const hurryBlink = G.hurry && ((G.frame >> 4) & 1);
    text('ROUND', 213, 1, hurryBlink ? '#ff7a6b' : '#7fdcc8', { align: 'right' });
    if (G.boss) text((G.loop > 0 ? (G.loop + 1) + '-' : '') + 'BOSS', 213, 9, '#ff8a7a', { align: 'right' });
    else text((G.loop > 0 ? (G.loop + 1) + '-' : '') + (G.round + 1), 213, 9, '#fbf0d9', { align: 'right' });
    // 목욕 도장 카드: stamp icon + n/10
    const flash = G.stampFlash > 0 && ((G.stampFlash >> 2) & 1);
    drawRaw(G.stamps > 0 || G.ticketFlash > 0 ? 'stamp' : 'stamp_empty', 0, 219, 4);
    text(G.stamps + '/' + STAMPS_FULL, 253, 5, flash ? '#ffffff' : G.ticketFlash > 0 ? '#ffe36b' : '#ff9a9a', { align: 'right' });
  }
  // ---- v3 HUDs. Co-op: team lives / team score / round / stamps, then a panel per player (animal + score).
  //      Battle: the match timer in the centre, two player panels each side (animal, score, KOs, a crown on the leader).
  function drawHeart(x, y, col) {
    const rows = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
    ctx.fillStyle = col;
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') ctx.fillRect(x + i, y + j, 1, 1); });
  }
  function drawHUDCoop() {
    const lifeBlink = G.ticketFlash > 0 && ((G.ticketFlash >> 3) & 1);
    if (!lifeBlink) drawHeart(4, 1, '#ff8fb1');
    text('x' + Math.max(0, G.lives), 13, 1, G.lives > 0 ? '#ffd447' : '#ff7a6b');
    text(String(G.score), 128, 1, G.newHi ? '#ffe36b' : '#fbf0d9', { align: 'center' });
    const hurryBlink = G.hurry && ((G.frame >> 4) & 1), lp = G.loop > 0 ? (G.loop + 1) + '-' : '';
    text(G.boss ? lp + 'BOSS' : 'R' + lp + (G.round + 1), 210, 1, G.boss ? '#ff8a7a' : hurryBlink ? '#ff7a6b' : '#7fdcc8', { align: 'right' });
    const flash = G.stampFlash > 0 && ((G.stampFlash >> 2) & 1);
    drawRaw(G.stamps > 0 || G.ticketFlash > 0 ? 'stamp' : 'stamp_empty', 0, 216, 0);
    text(G.stamps + '/' + STAMPS_FULL, 253, 1, flash ? '#ffffff' : G.ticketFlash > 0 ? '#ffe36b' : '#ff9a9a', { align: 'right' });
    // (distinction §2.8: a panel per SEAT, never per array index - a player who leaves leaves an empty seat and nobody's
    // panel moves: x0 = 2 + slot * 63, 61 wide; a faint slot wash, the number box (mine white, online), the animal in
    // its twin colour, the score, the power dot, my white underline)
    for (const p of G.players) {
      const x = 2 + clamp(p.slot | 0, 0, MAX_PLAYERS - 1) * 63, down = !alive(p), me = isMe(p);
      hudPanel(x, 8, 61, 8, p, me);
      if (down) ctx.globalAlpha = (G.frame >> 4) & 1 ? 0.25 : 0.45;
      drawRawTwin('life_' + p.char, p.twin ? p.slot : 0, x + 8, 8);
      ctx.globalAlpha = 1;
      text(String(p.score), x + 17, 9, down ? '#7a8e8c' : p.color);
      if (p.power && !(p.power.t < 120 && ((G.frame >> 3) & 1))) { ctx.fillStyle = '#ff8fb1'; ctx.fillRect(x + 54, 10, 3, 3); ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 54, 10, 1, 1); }
    }
  }
  // a seat's HUD panel: the slot wash (alpha 0.16), my white underline on the bottom row, the number box (slot colour;
  // mine white) with the seat number in the HUD's ink
  const isMe = (p) => G.online && !!p && p.slot === G.localSlot;
  const hudArts = new Map(); // (baked once per seat x size x me: one drawImage a frame)
  function hudPanel(x, y, w, h, p, me) {
    const s = clamp(p.slot | 0, 0, MAX_PLAYERS - 1), id = s + '|' + w + '|' + h + '|' + (me ? 1 : 0);
    let c = hudArts.get(id);
    if (!c) {
      c = mk(w, h); const hx = c.getContext('2d'), col = SLOT_COLS[s];
      hx.globalAlpha = 0.16; hx.fillStyle = col; hx.fillRect(0, 0, w, h); hx.globalAlpha = 1;
      if (me) { hx.fillStyle = '#ffffff'; hx.fillRect(0, h - 1, w, 1); }
      hx.fillStyle = me ? '#ffffff' : col; hx.fillRect(0, 0, 7, Math.min(h, 9));
      hx.drawImage(fontAtlas('#0a1a1d'), FONT_IDX[String(s + 1)] * 6, 0, 5, 7, 1, 1, 5, 7);
      hudArts.set(id, c);
    }
    ctx.drawImage(c, x, y);
  }
  function drawHUDBattle() {
    const bt = G.battle, left = bt ? bt.left : 0;
    const secs = Math.ceil(left / 60), m = Math.floor(secs / 60), s = secs % 60;
    const warn = secs <= 10 && ((G.frame >> 3) & 1);
    text(m + ':' + (s < 10 ? '0' : '') + s, 128, 1, warn ? '#ff7a6b' : '#fbf0d9', { align: 'center', scale: 2, shadow: '#16363a' });
    // (distinction §2.8: by seat - x0 = [1, 53, 153, 205][slot], 50 wide, the timer stays in 105-151)
    const X = [1, 53, 153, 205];
    let lead = 0; for (const p of G.players) lead = Math.max(lead, p.score);
    for (const p of G.players) {
      const x = X[p.slot]; if (x === undefined) continue;
      hudPanel(x, 0, 50, 16, p, isMe(p));
      const dim = p.koT > 0 || !!p.trap;
      if (dim) ctx.globalAlpha = 0.45;
      drawRawTwin('life_' + p.char, p.twin ? p.slot : 0, x + 8, 0);
      ctx.globalAlpha = 1;
      if (lead > 0 && p.score === lead) drawRaw(SPR_CROWN, 0, x + 8, 8);
      text(String(p.score), x + 17, 1, p.color);
      text('KO ' + p.kos, x + 17, 9, '#9fb8b4');
      drawMagHud(p, x);
    }
  }
  // AMMO on a seat's panel: a column of pips at its right edge (x+47, bottom up; 2x3 each, 2x2 for a magazine of 4),
  // lit = a blow left (mine / every local seat white-ish, a rival in its slot colour), dark = spent; while short the
  // dark ones fill from the bottom as the quiet refill runs (amT / rl); white for 10 frames when it fills (amFx)
  function drawMagHud(p, x) {
    const m = magOf(p); if (!m) return;
    const n = m[0], left = p.amN === undefined ? n : clamp(p.amN, 0, n), ph = n >= 4 ? 2 : 3;
    const fx = p.amFx !== undefined && G.frame - p.amFx >= 0 && G.frame - p.amFx < 10;
    const lit = fx ? '#ffffff' : !G.online || isMe(p) ? '#e8fbff' : p.color;
    let fill = left < n ? Math.floor((n - left) * ph * clamp((p.amT | 0) / m[1], 0, 1)) : 0;
    for (let k = 0; k < n; k++) {
      const y = 15 - (k + 1) * (ph + 1);
      if (k < left) { ctx.fillStyle = lit; ctx.fillRect(x + 47, y, 2, ph); continue; }
      ctx.fillStyle = 'rgba(10,26,29,0.8)'; ctx.fillRect(x + 47, y, 2, ph);
      const fr = Math.min(ph, fill); fill -= fr;
      if (fr > 0) { ctx.globalAlpha = 0.55; ctx.fillStyle = p.color; ctx.fillRect(x + 47, y + ph - fr, 2, fr); ctx.globalAlpha = 1; }
    }
  }
  // AMMO under my own animal (online: me; on one screen: every local player) while its magazine is short: n pips (2x2),
  // lit white; empty: the refill runs along them in my colour; a white flash when it fills
  function drawMagFeet() {
    if (G.gameMode !== 'battle' || G.mode !== 'playing') return;
    for (const p of G.players) {
      if (G.online ? !isMe(p) : !p.local) continue;
      const m = magOf(p); if (!m || p.amN === undefined || p.out || p.koT > 0 || p.trap || p.dead) continue;
      const n = m[0], fx = p.amFx !== undefined && G.frame - p.amFx >= 0 && G.frame - p.amFx < 12;
      if (p.amN >= n && !fx) continue;
      const w = n * 3 - 1, x0 = Math.round(p.x + 8 - w / 2), y0 = Math.round(p.y + 18);
      ctx.fillStyle = 'rgba(6,20,24,0.72)'; ctx.fillRect(x0 - 1, y0 - 1, w + 2, 4);
      for (let k = 0; k < n; k++) { ctx.fillStyle = fx || k < p.amN ? '#ffffff' : '#35585a'; ctx.fillRect(x0 + k * 3, y0, 2, 2); }
      if (p.amN === 0 && !fx) { ctx.fillStyle = p.color; ctx.fillRect(x0, y0, Math.max(1, Math.round(w * clamp((p.amT | 0) / m[1], 0, 1))), 2); }
    }
  }
  // the podium: a stand for 1st / 2nd / 3rd (4th on the low step), crowns, ranks and scores; the animals dance
  const MEDALS = ['#ffd447', '#e6ecf5', '#e8a46a'];
  function drawPodium() {
    const pd = G.podium; if (!pd) return;
    ctx.fillStyle = 'rgba(6,20,24,0.62)'; ctx.fillRect(0, PF_TOP, W, PF_H);
    // spotlight on the winner
    const gl = ctx.createRadialGradient(128, 100, 4, 128, 100, 70);
    gl.addColorStop(0, 'rgba(255,240,180,0.22)'); gl.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = gl; ctx.fillRect(40, 30, 176, 150);
    const FLOOR = 176;
    ctx.fillStyle = '#123236'; ctx.fillRect(WALL_L, FLOOR, WALL_R - WALL_L, 2);
    pd.order.forEach((slot, i) => {
      const sp = PODIUM[i] || PODIUM[3], top = sp[1], x0 = sp[0] - 16;
      const col = MEDALS[i] || '#7fdcc8';
      ctx.fillStyle = '#0c2629'; ctx.fillRect(x0 - 1, top - 1, 34, FLOOR - top + 1);
      ctx.fillStyle = i < 3 ? '#2f7f78' : '#24504c'; ctx.fillRect(x0, top, 32, FLOOR - top);
      ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x0, top, 32, 1);
      ctx.fillStyle = col; ctx.fillRect(x0, top + 1, 32, 2);
      text(String(i + 1), sp[0], top + 5, col, { align: 'center', scale: 2, outline: '#0c2629' });
      const p = G.players.find((q) => q.slot === slot);
      // (an online ranked battle: the 2nd line flips from the score to the trophy change - the HUD keeps the scores)
      // (my block: from T1 it alternates with my 비누 코인 line - coinPodLine)
      if (p && !coinPodLine(slot, sp[0], top + 21) && !troPodLine(slot, sp[0], top + 21)) text(String(p.score), sp[0], top + 21, '#fbf0d9', { align: 'center' });
    });
    for (let k = pd.order.length - 1; k >= 0; k--) {
      const p = G.players.find((q) => q.slot === pd.order[k]); if (!p) continue;
      drawPlayer(p);
      if (k < 3) {
        const f = frameOf(SPR_CROWN, 0);
        // (over a worn hat: 1 px above its top row, as over a bare head - the crown's own outline reaches its row 6, so
        // headTop - 7 would sit on the hat's top row; lookReach is the same idle-0 measure headTop's lift comes from)
        if (f) { const cf = k === 0 ? f : tintOf(f, MEDALS[k], 0.75); ctx.drawImage(cf.c, Math.round(p.x + 4), Math.round(p.y - 7 - Math.max(0, lookReach(p.char, p.look) + 1))); }
      }
    }
    troPodCups();
    drawTagArrows();
    for (const q of G.parts) partDraw(ctx, q);
    ctx.globalAlpha = 1;
  }
  function updateWisps() {
    if (reducedMotion()) { G.wisps.length = 0; return; }
    if (G.wisps.length < 7 && fxr() < 0.02) G.wisps.push({ x: 20 + fxr() * 216, y: PF_BOT + 10, r: 10 + fxr() * 14, vy: -0.15 - fxr() * 0.15, ph: fxr() * 6, life: 0 });
    for (const w of G.wisps) { w.y += w.vy; w.life++; w.x += Math.sin((w.life + w.ph * 50) * 0.01) * 0.12; }
    G.wisps = G.wisps.filter((w) => w.y > PF_TOP - 30);
  }
  function drawWisps() {
    for (const w of G.wisps) {
      const a = Math.min(1, w.life / 120) * 0.08;
      const gr = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, w.r);
      gr.addColorStop(0, 'rgba(255,255,255,' + a.toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(w.x - w.r, w.y - w.r, w.r * 2, w.r * 2);
    }
  }
  // an online host draws the other players where their (interpolated) body states put them; the world itself
  // keeps using their latest reported spot
  function render() {
    if (!ctx) return;
    const sw = G.online && G.role === 'host' ? hostDisplayIn() : null;
    try { renderScene(); } finally { if (sw) hostDisplayOut(sw); }
  }
  function renderScene() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    let sx = 0, sy = 0;
    if (G.shake > 0 && G.mode !== 'paused') { sx = Math.round((fxr() * 2 - 1) * G.shake); sy = Math.round((fxr() * 2 - 1) * G.shake * 0.6); }
    ctx.fillStyle = '#071417'; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, PF_TOP, W, PF_H); ctx.clip();
    ctx.translate(sx, sy);
    const inTrans = G.mode === 'transition' || (G.mode === 'paused' && G.pausedFrom === 'transition');
    if (roundCanvas) ctx.drawImage(roundCanvas, 0, PF_TOP);
    drawWisps();
    if (G.mode === 'podium') { drawPodium(); ctx.restore(); drawHUD(); syncDOM(); return; }
    drawMarkers(false); // (multiplayer ground markers: floor decals under everything below)
    if (!inTrans) {
      drawItems();
      drawPickup();
      drawBoss();
      for (const e of G.enemies) drawEnemy(e);
    }
    drawKfx(true); // (v4 rings lying on the floor: the capy's slam splash, the frog's lily pads)
    for (const p of G.players) drawDucklings(p);   // (v4 뽑기 e7: under every animal)
    for (let k = G.players.length - 1; k >= 0; k--) drawPlayer(G.players[k]);
    drawWater();
    drawMarkers(true); // (the ripples beside floating animals, markers on a water surface)
    drawIce();
    for (const b of G.bubbles) drawBubble(b);
    for (const p of G.players) if (p.ghost) drawGhost(p);
    drawHazards();
    drawDrops();
    for (const bo of G.bolts) drawEnt('steam_bolt', (bo.t / 4) | 0, bo.x, bo.y, bo.dir < 0);
    for (const q of G.parts) partDraw(ctx, q); // (fd: frames it fades over - 8 unless set, e6's footprints 24; e8's big / sw)
    ctx.globalAlpha = 1;
    drawKfx(false);
    if (G.foam.length) drawFoam();
    for (const q of G.pops) {
      if (q.t > 52 && (q.t & 2)) continue;
      if (q.icon) {
        const f = frameOf(q.icon, 0);
        if (f) ctx.drawImage(f.c, Math.round(q.x - f.w * 2 + 2), Math.round(q.y), f.w * 2, f.h * 2);
        text(q.txt, q.x + 5, q.y + 4, q.color, { outline: '#2a0f1c' });
        continue;
      }
      if (q.combo) text(q.combo, q.x, q.y - 9, '#ffffff', { align: 'center', outline: '#2a0f1c' });
      text(q.txt, q.x, q.y, q.color, { align: 'center', scale: q.scale, outline: '#2a0f1c' });
    }
    if (!inTrans) { drawMeSpot(); drawMagFeet(); drawTagArrows(); }
    if (inTrans && G.trans) drawDoors(G.trans.door);
    ctx.restore();
    drawHUD();
    if (G.boss && !inTrans) drawBossBar();
    syncDOM();
  }

  // ------------------------------------------------------------------ DOM / UI
  const dom = {};
  let touchMode = false, shownOverlay = undefined, shownBannerId = 0, unlocked = false;
  // Game over / ending cards ignore the in-game action keys (jump/shoot, incl. Space on a focused button)
  // for about a second (fixed updates keep running on those screens), so a player still mashing X or Z
  // does not throw the result screen away. Enter and clicks/taps on the buttons act immediately.
  const MENU_LOCK_FRAMES = 60;
  let menuLockFrame = -1;
  function menuLocked() {
    return (shownOverlay === 'over' || shownOverlay === 'ending' || shownOverlay === 'podium') && G.frame < menuLockFrame;
  }
  const $ = (id) => document.getElementById(id);
  // the 10-slot 목욕 도장 카드 on the pause and game-over cards
  function updateStampCards() {
    let cards = [];
    try { cards = document.querySelectorAll('[data-stampcard]'); } catch (e) { cards = []; }
    for (const card of cards) {
      const slots = card.querySelectorAll('[data-slot]');
      slots.forEach((s, i) => { s.classList.toggle('on', i < G.stamps); });
      const cnt = card.querySelector('[data-stampcount]');
      if (cnt) cnt.textContent = G.stamps + '/' + STAMPS_FULL;
      card.setAttribute('aria-label', '목욕 도장 카드: 도장 ' + G.stamps + '개 / ' + STAMPS_FULL + '개');
    }
  }
  function showOverlay(name) {
    const prev = shownOverlay;
    shownOverlay = name;
    const locking = name === 'over' || name === 'ending' || name === 'podium';
    if (locking) { menuLockFrame = G.frame + MENU_LOCK_FRAMES; clearKeys(); }
    for (const k of OVERLAYS) if (dom[k]) dom[k].hidden = k !== name;
    // (an online panel opened from elsewhere starts at its top - 로비로 after a match must not land mid-settings - and
    // a re-render while it is open keeps its scroll)
    if (prev !== name && (name === 'friends' || name === 'room' || name === 'hub') && dom[name]) dom[name].scrollTop = 0;
    if (prev === 'rec' && name !== 'rec') clRecShut();    // (cloud trophies: a message kept for 내 기록 is over)
    if (prev === 'hub' && name !== 'hub') hubShut();      // (v4 shop: nothing armed, no message left over)
    if (prev === 'pal' && name !== 'pal') PAL.open = false;   // (친구 순위: the panel is closed)
    if (IV.cur || IV.list.length || IV.demo) ivShow();       // (친구 초대: the banner is for the menus only)
    if (name === 'title' && dom.titleHi) dom.titleHi.textContent = G.hiscore.toLocaleString('ko-KR');
    if (name === 'title') { syncPicker(); troStale(); syncTroBadge(); syncShopBtn(); }
    if (name === 'title' || name === 'over' || name === 'ending') palKick();   // (친구 순위: the card follows the nick, look, animal, league, bests)
    if (name === 'rec') fillRec();
    if (name === 'login') lgUI();
    if (name === 'pause' || name === 'over') updateStampCards();
    // an online guest's co-op result counts toward its own best too (the host saves its own; guests never run gameOver)
    if ((name === 'over' || name === 'ending') && G.online && G.role === 'guest' && G.gameMode === 'coop' && G.score > G.hiscore) {
      G.hiscore = G.score; G.newHi = true; sset('ppogeul-hiscore', G.hiscore);
    }
    if (name === 'over' || name === 'ending') fillTeam(name);
    // (v4 trophies: the 목욕 보너스 of this run, paid once however often the card shows; the podium's tag / note / gate)
    if (name === 'over' || name === 'ending') { troCard(name, troBonus(name === 'ending')); coinCard(name); }
    if (name === 'podium') { fillPodium(); troPodiumUI(); }
    if (name === 'over') {
      if (dom.overScore) dom.overScore.textContent = G.score.toLocaleString('ko-KR');
      if (dom.overHi) dom.overHi.textContent = G.hiscore.toLocaleString('ko-KR');
      if (dom.overRound) dom.overRound.textContent = (G.loop > 0 ? (G.loop + 1) + '회차 ' : '') + (G.round + 1) + '번째 탕 · ' + (LV ? LV.name : '');
      if (dom.overNew) dom.overNew.hidden = !(G.newHi && G.score > 0);
    }
    if (name === 'ending') {
      if (dom.endScore) dom.endScore.textContent = G.score.toLocaleString('ko-KR');
      if (dom.endNext) dom.endNext.textContent = (G.loop + 2) + '회차 도전';
      if (dom.endSub) dom.endSub.textContent = G.gameMode === 'coop' ? '다 함께 목욕탕을 뽀득뽀득 닦았어요' : CHARS[G.p ? G.p.char : 'duck'].name + ' 덕분에 목욕탕이 뽀득뽀득해졌어요';
    }
    if (dom.pauseBtn) dom.pauseBtn.disabled = !(name === null || name === 'pause');
    // the online panels cover the whole stage (touch pads hidden); result cards / menu get the online buttons
    if (dom.app) dom.app.classList.toggle('pg-panel-open', name === 'friends' || name === 'room' || name === 'hub' || name === 'pal');
    netCardLabels(name);
    if (name && dom[name]) {
      const b = dom[name].querySelector('[data-primary]');
      // result screens: focus the primary button only once the action-key lock is over
      const delay = locking ? Math.round(MENU_LOCK_FRAMES * STEP_MS) + 60 : 40;
      if (b && !touchMode && !G.manual) setTimeout(() => { try { if (!dom[name].hidden && shownOverlay === name) b.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, delay);
    }
  }
  function syncDOM() {
    syncJumpSub(); // (a game started / my animal or the setting changed: the touch JUMP's move line follows)
    if (!dom.banner) return;
    const bn = G.banner;
    const live = bn && G.frame < bn.end && !G.attract && (G.mode === 'playing' || G.mode === 'transition' || G.mode === 'dying' || G.mode === 'countdown');
    if (live) {
      if (shownBannerId !== bn.id) {
        shownBannerId = bn.id;
        dom.bannerMain.textContent = bn.main; dom.bannerSub.textContent = bn.sub; dom.bannerSub.hidden = !bn.sub;
        dom.banner.className = 'pg-banner ' + bn.cls;
        void dom.banner.offsetWidth;
        dom.banner.classList.add('show');
        dom.banner.hidden = false;
      }
    } else if (shownBannerId !== 0) {
      shownBannerId = 0; dom.banner.hidden = true; dom.banner.classList.remove('show');
    }
    syncTags();
    syncWords();
  }
  // ---- v3 DOM: the animal picker (title), co-op results, the podium card, name tags and word pops
  const OVERLAYS = ['title', 'pause', 'over', 'ending', 'podium', 'friends', 'room', 'rec', 'hub', 'login', 'pal'];
  // (lk: a worn set - a portrait_ bust wears its 머리 / 얼굴 / 목 (lookPortrait, shop.md 6.8); tw: the seat whose twin
  // colour the bust takes, distinction §2.10 - recoloured first, then the items are drawn on it)
  function portraitCanvas(c, name, size, lk, tw) {
    const cv = document.createElement('canvas'); cv.width = size; cv.height = size;
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
    const f = name === 'portrait_' && lookOn(lk) ? lookPortrait(c, lk, tw) : tw > 0 ? twinFrame(frameOf(name + c, 0), name + c, tw) : frameOf(name + c, 0);
    if (f) x.drawImage(f.c, 0, 0, f.w, f.h, 0, 0, size, size);
    return cv;
  }
  function buildPicker() {
    if (!dom.pick) return;
    dom.pick.textContent = '';
    dom.pick._lk = myLooks(); // (each bust wears its own animal's set: looks-per-animal.md 3)
    for (const c of CHAR_IDS) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pg-pick-btn'; b.setAttribute('role', 'radio'); b.dataset.char = c;
      b.setAttribute('aria-label', CHARS[c].name + ' (' + CHARS[c].animal + '): ' + CHARS[c].tag);
      const cv = portraitCanvas(c, 'portrait_', 32, myLook(c)); cv.className = 'pg-pick-art'; cv.setAttribute('aria-hidden', 'true');
      const nm = document.createElement('span'); nm.className = 'pg-pick-name'; nm.textContent = CHARS[c].name;
      b.appendChild(cv); b.appendChild(nm);
      listen(b, 'click', (e) => { e.preventDefault(); firstGesture(); pickChar(c); });
      dom.pick.appendChild(b);
    }
    syncPicker();
  }
  // the six busts of a picker (the title's, the room's), each in its own animal's worn set: redrawn only when one changed
  // (bought / worn here or in another tab; the cache key is all six sets)
  function pickArt(box) {
    const ls = myLooks(); if (!box || box._lk === ls) return;
    box._lk = ls;
    for (const cv of box.querySelectorAll('canvas.pg-pick-art')) {
      const c = cv.parentNode && cv.parentNode.dataset ? cv.parentNode.dataset.char : '', x = cv.getContext('2d'), f = isChar(c) ? lookPortrait(c, aniLook(ls, c), 0) : null;
      x.clearRect(0, 0, cv.width, cv.height); if (f) { x.imageSmoothingEnabled = false; x.drawImage(f.c, 0, 0, f.w, f.h, 0, 0, cv.width, cv.height); }
    }
  }
  function syncPicker() {
    if (!dom.pick) return;
    pickArt(dom.pick); pickArt(dom.roomPick);
    for (const b of dom.pick.querySelectorAll('[data-char]')) {
      const on = b.dataset.char === G.sel;
      b.setAttribute('aria-checked', on ? 'true' : 'false'); b.classList.toggle('on', on); b.tabIndex = on ? 0 : -1;
    }
    // the picked animal's kit card (char-kits §12.2): name · animal, role chip, badge, tag, the 4 pip rows in its hue,
    // 특기 and 거품 lines; the whole card in its aria-label (phones hide the tag / how / bubble lines). 능력 끄기 greys it
    // with every bar at 3
    const d = CHARS[G.sel] || CHARS.duck, off = !!G.perksOff;
    if (dom.kit) {
      dom.kit.style.setProperty('--hue', d.hue); dom.kit.classList.toggle('off', off);
      dom.kit.setAttribute('aria-label', d.name + ' (' + d.animal + '): ' + d.tag + '. 특기 ' + d.move.name + ': ' + d.move.how + '. 거품 ' + d.bub.name + ': ' + d.bub.desc + (off ? '. ' + OFF_LINE : ''));
    }
    setTxt(dom.pickName, d.name); setTxt(dom.pickAnimal, d.animal); setTxt(dom.pickRole, d.role); setTxt(dom.pickBadge, d.badge);
    setTxt(dom.pickPerk, d.tag); setTxt(dom.pickMove, d.move.name); setTxt(dom.pickMoveHow, d.move.how); setTxt(dom.pickBub, d.bub.name); setTxt(dom.pickBubDesc, d.bub.desc);
    statPips(dom.pickStats, off ? STATS_OFF : d.stats);
    syncJumpSub();
  }
  const setTxt = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };
  // 속도 / 점프 / 사거리 / 연사: 5 pips each (role img, "속도 5점 중 3점"), rebuilt only when the values change
  function statPips(box, vals) {
    if (!box) return;
    const key = vals.join();
    if (box._key === key && box.children.length) return;
    box._key = key; box.textContent = '';
    STAT_NAMES.forEach((nm, i) => {
      const s = h('span', 'pg-stat'); s.setAttribute('role', 'img'); s.setAttribute('aria-label', nm + ' 5점 중 ' + vals[i] + '점');
      s.appendChild(h('b', '', nm));
      for (let j = 0; j < 5; j++) s.appendChild(h('i', j < vals[i] ? 'on' : ''));
      box.appendChild(s);
    });
  }
  // the touch JUMP button's second line: my animal's move ("꾹: 활공", "두 번: 쿵"); hidden with 능력 끄기 (in a game:
  // my animal and the game's setting; on the title / in the room: the pick and the room's setting)
  function syncJumpSub() {
    const el = dom.tJumpSub; if (!el) return;
    const me = G.mode !== 'title' ? myPlayer() || G.p : null;
    const c = me && isChar(me.char) ? me.char : G.sel;
    const off = me ? !!G.perksOff : NET.screen === 'room' && NET.mode === 'battle' && NET.opts.perks === false;
    const txt = (CHARS[c] || CHARS.duck).move.touch;
    if (el.textContent !== txt) el.textContent = txt;
    if (el.hidden !== off) el.hidden = off;
  }
  function pickChar(c) {
    if (!isChar(c)) return false;
    G.sel = c; sset('ppogeul-char', c);
    if (G.mode === 'title' && G.p) { G.p.char = c; G.p.look = myLook(c); } // the attract demo shows the pick (in its set)
    syncPicker();
    // keyboard users on the picker: focus follows the pick (roving tabindex)
    try { if (dom.pick && dom.pick.contains(document.activeElement)) { const b = dom.pick.querySelector('[data-char="' + c + '"]'); if (b) b.focus({ preventScroll: true }); } } catch (e) { /* ignore */ }
    return true;
  }
  const onPickerInput = (e) => !!(e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
  // 친구와 하기: the online lobby panel (see the ONLINE section)
  function openFriends() {
    firstGesture();
    netOpenFriends();
  }
  // 로비로 (podium / results): leave the online game for the lobby; offline back to the title
  // online host with friends in the game: the first tap arms the button (its label says what a second tap does)
  // (v4 trophies: also whenever this tab holds trophies for a ranked match - a guest too; the label says what it costs)
  function confirmTwice(id, armedTxt, fn) {
    const el = $(id);
    const others = (G.online && G.role === 'host' && NET.sess && NET.roster.length > 1) || (G.online && troOpenHere());
    if (!el || !others) { fn(); return; }
    const t = performance.now();
    if (el._armed && t - el._armed < 2500) { el._armed = 0; clearTimeout(el._armT); if (el._txt) el.textContent = el._txt; fn(); return; }
    el._armed = t; el._txt = el.textContent; el.textContent = armedTxt;
    clearTimeout(el._armT);
    el._armT = setTimeout(() => { el._armed = 0; if (el.textContent === armedTxt) el.textContent = el._txt; }, 2500);
  }
  function toLobby() {
    if (NET.sess) { netLeave(''); return; }
    toTitle();
  }
  // co-op result table (game over / ending): each player's score, kills, revives, and the MVP crown
  function mvpOf() {
    let best = null;
    // (ties: the one who revived more partners, then more kills)
    for (const p of G.players) if (!best || p.score > best.score || (p.score === best.score && (p.revives > best.revives || (p.revives === best.revives && p.kills > best.kills)))) best = p;
    return best;
  }
  function fillTeam(name) {
    const box = name === 'over' ? dom.overTeam : dom.endTeam, card = dom[name];
    const coop = G.gameMode === 'coop';
    if (card) card.classList.toggle('pg-coop', coop);
    if (!box) return;
    box.hidden = !coop; box.textContent = '';
    if (!coop) return;
    const mvp = mvpOf();
    for (const p of G.players) {
      const row = document.createElement('div'); row.className = 'pg-team-row'; row.style.setProperty('--slot', p.color);
      const ic = portraitCanvas(p.char, 'life_', 16, null, p.twin ? p.slot : 0); ic.className = 'pg-team-ic'; ic.setAttribute('aria-hidden', 'true');
      // (the seat number chip inside the nick cell, styled as on the name tags: the grid keeps its 5 columns)
      const nm = document.createElement('span'); nm.className = 'pg-team-nick'; nm.textContent = nameOf(p);
      const no = document.createElement('i'); no.className = 'pg-tag-n'; no.textContent = slotNum(p); nm.prepend(no);
      const sc = document.createElement('b'); sc.textContent = p.score.toLocaleString('ko-KR');
      const st = document.createElement('span'); st.className = 'pg-team-st'; st.textContent = '때 ' + p.kills + ' · 구조 ' + p.revives;
      row.append(ic, nm, sc, st);
      const m = document.createElement('i');
      if (p === mvp && G.players.length > 1) { m.className = 'pg-mvp'; m.textContent = 'MVP'; m.prepend(portraitCanvas('', SPR_CROWN, 8)); }
      row.appendChild(m);
      box.appendChild(row);
    }
  }
  function fillPodium() {
    if (!dom.podiumSum || !G.podium) return;
    // (an online battle: what it did to my trophies, or that it was practice)
    const P = G.online ? troPodNow() : null, mine = P && P.rows.get(G.localSlot);
    const tro = !P ? '' : P.kind === 'prac' ? ', 연습 경기라 트로피는 그대로예요' : mine && P.now !== null ? ', 내 트로피 ' + troSigned(mine.net) + '개' + (P.free ? ' (안 걸고 참여)' : '') + (P.bonus > 0 ? ', 오늘 트로피 보너스 +' + P.bonus + '개' : '') + ', 지금 ' + P.now + '개' : '';
    dom.podiumSum.textContent = G.podium.order.map((slot, i) => {
      const p = G.players.find((q) => q.slot === slot);
      return p ? (i + 1) + '위 ' + nameOf(p) + ' (' + CHARS[p.char].name + ') ' + p.score.toLocaleString('ko-KR') + '점' : '';
    }).join(', ') + tro + coinPodSr();
  }
  // name tags: the nick in the slot colour over every animal (DOM, so Korean nicks stay crisp)
  let screenScale = 1; // (css px per canvas px, set by fit)
  const tagEls = [], tipEls = []; // (by seat: a player leaving never shifts the others' tags)
  // Name tags v2 (distinction §2.6): a pill in the slot colour holding the seat number chip and the nick ("나" in a
  // white chip with a white ring on mine, online - white means "me" only: a trapped player's ring takes the TRAPPER's
  // colour). Placed me first, then by seat, at headTop(p) - 5 (podium: 9 higher), never into the HUD strip and never
  // past the walls; anyone but me shows the full pill only when it clears every placed tag by >= 1 px and has done so
  // for 20 frames (no flicker as animals walk past each other), otherwise just the number chip (is-cmp); a chip that
  // still collides is lifted above the hit (<= 3 passes) unless that would rise into the HUD (then the overlap stays).
  // Plus a hint chip where an animal needs one: my own trapped animal "연타!" (battle), my own ghost "친구가 닿으면
  // 살아나요", a partner's ghost "구해 줘!" (co-op) - the rules said right where they matter.
  // (review 2026-10-18) The animals are obstacles too: a full pill lying on another animal by more than TAG_ROWS rows
  // (on MY animal by any row) is a misfit like a tag overlap, and every spot comes from tagSpot: where it belongs, else
  // lifted over what it lies on, else beside it (left / right) - so a chip the HUD clamp will not lift steps aside
  // instead of covering my tag, and nobody's tag lies on my animal. Mine paints on top (.pg-tag.is-me z-index). On the
  // podium (a static screen) a tag is never compact while a full spot exists, and its chip reads "1P".."4P" there, so a
  // seat number is never read as the place digit on the block under it
  const TAG_FIT = 20, TAG_ROWS = 3;
  // the seat whose bubble holds p (the host: its trap's bubble; a guest: the trap's bubble id in the P row -> that
  // view row's owner), -1 when unknown or the trapper has left
  function trapperOf(p) {
    const t = p && p.trap; if (!t) return -1;
    let b = t.b || null;
    if (!b && t.bid) b = G.bubbles.find((q) => q.id === t.bid) || null;
    if (!b) b = G.bubbles.find((q) => q.kind === 'player' && q.victim === p) || null;
    const o = b ? b.owner : -1;
    return o >= 0 && o < MAX_PLAYERS && G.players.some((q) => q.slot === o) ? o : -1;
  }
  const tagHi = (p) => isMe(p) && spotAge() >= 0 && spotAge() < SPOT_HI_F; // (the big 나 after a spotlight trigger)
  function syncTags() {
    if (!dom.tags) return;
    const on = multi() && (G.mode === 'playing' || G.mode === 'countdown' || G.mode === 'podium' || (G.mode === 'paused' && G.pausedFrom !== 'transition'));
    const me = G.online ? myPlayer() : null, self = G.players.find((q) => q.slot === G.localSlot) || null; // (self: the hint chips, offline too)
    const k = screenScale || 1;
    const order = G.players.slice(0, MAX_PLAYERS).sort((a, b) => (b === me) - (a === me) || a.slot - b.slot);
    const here = new Set(order.map((p) => p.slot)), pod = G.mode === 'podium';
    for (let s = 0; s < MAX_PLAYERS; s++) if (!here.has(s)) { if (tagEls[s] && !tagEls[s].hidden) tagEls[s].hidden = true; if (tipEls[s] && !tipEls[s].hidden) tipEls[s].hidden = true; }
    // what a tag must not lie on: every shown animal's body (x - 1 .. x + 17 from its head top; mine weighs 6, another
    // 1 and only past TAG_ROWS rows) and the tags placed so far (3; g = the air a tag box wants round them, < 0 = slack)
    const obs = on ? order.filter((p) => !p.out && !p.koT).map((p) => ({ slot: p.slot, k: p === me ? 6 : 1, rows: p === me ? 0 : TAG_ROWS, tag: false, l: p.x - 1, r: p.x + 17, t: headTop(p), b: p.y + 16 })) : [];
    const lie = (b, o, g) => { const q = o.tag ? g : 0, w = Math.min(b.r, o.r + q) - Math.max(b.l, o.l - q), v = Math.min(b.b, o.b + q) - Math.max(b.t, o.t - q); return w > 0 && v > o.rows ? (w * v + 1) * o.k : 0; };
    const cost = (b, g, own) => { let c = 0; for (const o of obs) if (o.slot !== own) c += lie(b, o, g); return c; };
    const at = (cx, y, w, h) => { y = Math.max(y, PF_TOP + 1 + h); cx = clamp(cx, w / 2 + 1, W - w / 2 - 1); return { cx, y, l: cx - w / 2, r: cx + w / 2, t: y - h, b: y, w, h }; };
    // the cheapest spot for a w x h box anchored at (cx0, y0): there if it lies on nothing; else lifted over what it lies on
    // (<= 3 times, never into the HUD strip) or set beside each thing it lies on (left / right, inside the walls); the
    // least covered wins, then the nearest (a lift counts 1.5x: beside its own head reads better than high above)
    function tagSpot(w, h, cx0, y0, g, own) {
      const b0 = at(cx0, y0, w, h), c0 = cost(b0, g, own); if (!c0) return b0;
      const cands = [], air = (o) => (o.tag ? Math.max(g, 0) : 0) + 0.5;
      for (let b = b0, k = 0; k < 3; k++) {
        const o = obs.find((q) => q.slot !== own && lie(b, q, g)); if (!o) break;
        const y = o.t - air(o); if (y < PF_TOP + 1 + h) break;
        cands.push(b = at(cx0, y, w, h));
      }
      for (const o of obs) if (o.slot !== own && lie(b0, o, g)) cands.push(at(o.l - air(o) - w / 2, y0, w, h), at(o.r + air(o) + w / 2, y0, w, h));
      let best = b0, bs = c0 * 1e3;
      for (const c of cands) { const s = cost(c, g, own) * 1e3 + Math.abs(c.cx - b0.cx) + 1.5 * Math.abs(c.y - b0.y); if (s < bs) { bs = s; best = c; } }
      return best;
    }
    for (const p of order) {
      const s = clamp(p.slot | 0, 0, MAX_PLAYERS - 1);
      let el = tagEls[s], tip = tipEls[s];
      const show = on && !p.out && !p.koT;
      if (!show) { if (el && !el.hidden) el.hidden = true; if (tip && !tip.hidden) tip.hidden = true; if (el) el._fitAt = null; continue; }
      if (!el) {
        el = tagEls[s] = document.createElement('span'); el.className = 'pg-tag';
        el._n = document.createElement('i'); el._n.className = 'pg-tag-n';
        el._t = document.createElement('span'); el._t.className = 'pg-tag-t';
        el.append(el._n, el._t); dom.tags.appendChild(el);
      }
      // (only the two inner elements are written: the tag's own textContent - "2뽀숑" - still contains the nick)
      const mine = p === me, hi = mine && tagHi(p), txt = nameOf(p), num = mine ? '나' : slotNum(p) + (pod ? 'P' : '');
      if (el._t.textContent !== txt) el._t.textContent = txt;
      if (el._n.textContent !== num) el._n.textContent = num;
      if (el._col !== p.color) { el._col = p.color; el.style.setProperty('--slot', p.color); }
      const tr = trapperOf(p), ring = tr >= 0 ? SLOT_COLS[tr] : '';
      if (el._ring !== ring) { el._ring = ring; if (ring) el.style.setProperty('--ring', ring); else el.style.removeProperty('--ring'); }
      if (el.hidden) el.hidden = false;
      const st = p.ghost ? 'ghost' : p.trap ? 'trap' : p.stunT > 0 ? 'stun' : '';
      const base = 'pg-tag' + (mine ? ' is-me' : '') + (hi ? ' is-hi' : '');
      // sizes of both modes, measured only when the text, the size class or the screen scale changed
      const key = txt + '|' + num + '|' + base + '|' + k;
      if (el._mk !== key) {
        el._mk = key;
        el.className = base; el._wF = el.offsetWidth / k; el._hF = el.offsetHeight / k;
        el.className = base + ' is-cmp'; el._wC = el.offsetWidth / k; el._hC = el.offsetHeight / k;
      }
      const lift = pod ? 9 : 0, px = p.x + 8, anchor = headTop(p) - 5 - lift;
      let box, cmp = false;
      if (el._rid !== G.rid) { el._rid = G.rid; el._fitAt = null; } // (a new round / arena: everyone starts compact)
      if (mine) box = tagSpot(el._wF, el._hF, px, anchor, -0.5, p.slot); // (always full, placed first: only animals in the way)
      else if (pod && !cost(box = tagSpot(el._wF, el._hF, px, anchor, 1, p.slot), 1, p.slot)) el._fitAt = G.frame - TAG_FIT; // (podium: full wherever it fits)
      else {
        // full only where it belongs, clear of every tag by >= 1 px and of every animal, for TAG_FIT frames running
        if (cost(at(px, anchor, el._wF, el._hF), 1, p.slot)) el._fitAt = null;
        else if (el._fitAt === null || el._fitAt === undefined || el._fitAt > G.frame) el._fitAt = G.frame;
        cmp = pod || el._fitAt === null || G.frame - el._fitAt < TAG_FIT;
        box = cmp ? tagSpot(el._wC, el._hC, px, anchor, -0.5, p.slot) : at(px, anchor, el._wF, el._hF);
      }
      obs.push(Object.assign({ slot: -1, k: 3, rows: 0, tag: true }, box)); el._box = box;
      const cls = base + (st ? ' is-' + st : '') + (cmp ? ' is-cmp' : '');
      if (el.className !== cls) el.className = cls;
      const l = (box.cx / W * 100).toFixed(2) + '%', t = (box.y / H * 100).toFixed(2) + '%';
      if (el._l !== l) { el._l = l; el.style.left = l; }
      if (el._tp !== t) { el._tp = t; el.style.top = t; }
      // the hint chip, on top of the tag at its final spot
      const own = p.local && (G.online ? mine : true);
      let say = '', mash = false;
      if (G.mode === 'playing' || G.mode === 'paused') {
        if (p.trap && own && G.gameMode === 'battle') { say = '연타!'; mash = true; }
        else if (p.ghost && own) say = '친구가 닿으면 살아나요';
        else if (p.ghost && !own && self && alive(self)) say = '구해 줘!';
      }
      if (!say) { if (tip && !tip.hidden) tip.hidden = true; continue; }
      if (!tip) { tip = tipEls[s] = document.createElement('span'); tip.className = 'pg-tip'; dom.tags.appendChild(tip); }
      if (tip.textContent !== say) tip.textContent = say;
      const tc = 'pg-tip' + (mash && !reducedMotion() ? ' is-mash' : '');
      if (tip.className !== tc) tip.className = tc;
      if (tip._col !== p.color) { tip._col = p.color; tip.style.setProperty('--slot', p.color); }
      const tt = ((box.y - box.h - 1.5) / H * 100).toFixed(2) + '%';
      if (tip._l !== l) { tip._l = l; tip.style.left = l; }
      if (tip._t !== tt) { tip._t = tt; tip.style.top = tt; }
      if (tip.hidden) tip.hidden = false;
    }
  }
  const wordEls = new Map();
  function syncWords() {
    if (!dom.words) return;
    const live = new Set();
    for (const w of G.words) {
      live.add(w.id);
      let el = wordEls.get(w.id);
      if (!el) { el = document.createElement('span'); el.className = 'pg-word'; el.textContent = w.txt; el.style.setProperty('--slot', w.col); dom.words.appendChild(el); wordEls.set(w.id, el); }
      el.style.left = (w.x / W * 100).toFixed(2) + '%'; el.style.top = (w.y / H * 100).toFixed(2) + '%';
      el.style.opacity = w.t > 40 ? String(Math.max(0, (56 - w.t) / 16)) : '1';
    }
    for (const [id, el] of wordEls) if (!live.has(id)) { el.remove(); wordEls.delete(id); }
  }
  function firstGesture() {
    if (unlocked) return;
    Snd.unlock();
    unlocked = true;
    Snd.cur = undefined; Snd.music(G.mode === 'paused' ? null : G.music);
  }
  function startGame() { firstGesture(); Snd.unlock(); newGame(0); Snd.sfx('start'); }
  function pauseGame() {
    if (G.mode !== 'playing' && G.mode !== 'dying' && G.mode !== 'transition' && G.mode !== 'countdown') return;
    if (G.online) {
      // an online game keeps running for everyone: the menu opens on this screen only
      if (G.menuOpen) return;
      G.menuOpen = true; clearKeys(); showOverlay('pause'); return;
    }
    G.pausedFrom = G.mode; G.mode = 'paused';
    Snd.music(null); Snd.call('sfx', 'pause');
    clearKeys();
    showOverlay('pause');
  }
  function resumeGame() {
    if (G.menuOpen) { G.menuOpen = false; showOverlay(null); return; }
    if (G.mode !== 'paused') return;
    G.mode = G.pausedFrom || 'playing'; G.pausedFrom = null;
    if (G.music !== 'clear' && G.music !== 'gameover') Snd.music(G.music); else Snd.cur = G.music;
    showOverlay(null);
  }
  function togglePause() { if (G.mode === 'paused' || G.menuOpen) resumeGame(); else pauseGame(); }
  function updateMuteUI() {
    if (!dom.soundBtn) return;
    const m = Snd.muted();
    dom.soundBtn.setAttribute('aria-pressed', m ? 'true' : 'false');
    dom.soundBtn.setAttribute('aria-label', m ? '소리 켜기' : '소리 끄기');
    dom.soundBtn.title = m ? '소리 켜기 (M)' : '소리 끄기 (M)';
    dom.soundBtn.classList.toggle('is-muted', m);
  }
  function toggleMute() { firstGesture(); Snd.setMuted(!Snd.muted()); updateMuteUI(); }
  function clearKeys() { for (const k in keys) keys[k] = false; for (const k in touchIn) touchIn[k] = false; STICK.dir = 0; STICK.dn = false; if (dom.stick) dom.stick.classList.remove('is-l', 'is-r', 'is-d'); }
  function primaryAction() {
    if (shownOverlay === 'hub' || shownOverlay === 'login' || shownOverlay === 'pal') return;   // (the 상점 / 마이페이지 / the login screen / 친구 순위: nothing starts a game behind it)
    if (shownOverlay === 'rec') { closeRec(); return; } // (내 기록 over the title: never a solo start)
    if (G.menuOpen) { resumeGame(); return; }
    // online: only the host picks what comes next (guests wait on the result screens)
    if (G.online && G.role === 'guest') return;
    if (G.mode === 'title') startGame();
    else if (G.mode === 'gameover') { firstGesture(); retry(); }
    else if (G.mode === 'ending') netAgain(continueLoop);
    else if (G.mode === 'paused') resumeGame();
    else if (G.mode === 'podium') { if (!troCanRematch()) return; firstGesture(); netAgain(rematch); }
  }
  // 다시 하기: the same game again (co-op keeps its team; online: a new game for everyone in the room)
  function retry() {
    if (G.gameMode === 'coop') netAgain(() => newCoop(G.players.map((p) => ({ slot: p.slot, char: p.char, nick: p.nick, local: p.local, id: p.id, look: p.look })), 0, G.online ? true : undefined));
    else newGame(0);
  }

  // (↓ / S: 내려가기 - drop through the platform underfoot; nothing in the menus)
  const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', KeyZ: 'jump', KeyX: 'shoot', Space: 'shoot', KeyJ: 'shoot', ArrowDown: 'down', KeyS: 'down' };
  const KEYFALLBACK = { arrowleft: 'ArrowLeft', arrowright: 'ArrowRight', arrowup: 'ArrowUp', arrowdown: 'ArrowDown', a: 'KeyA', d: 'KeyD', w: 'KeyW', s: 'KeyS', z: 'KeyZ', x: 'KeyX', j: 'KeyJ', ' ': 'Space', p: 'KeyP', m: 'KeyM', escape: 'Escape', enter: 'Enter' };
  function codeOf(e) { if (e.code && e.code !== 'Unidentified') return e.code; return KEYFALLBACK[String(e.key || '').toLowerCase()] || ''; }
  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const code = codeOf(e);
    const onButton = e.target && e.target.tagName === 'BUTTON';
    firstGesture();
    // typing a nickname / room code: no game keys at all (M would mute, P would pause...)
    if (onPickerInput(e)) { if (code === 'Escape' && shownOverlay === 'friends') { e.preventDefault(); netFriendsBack(); } else if (code === 'Escape' && shownOverlay === 'hub') { e.preventDefault(); closeHub(); } else if (code === 'Escape' && shownOverlay === 'pal') { e.preventDefault(); palClose(); } return; }
    // the online panels are plain forms: buttons and inputs work as usual; Escape goes back
    if (shownOverlay === 'friends' || shownOverlay === 'room') {
      if (code === 'Escape' && shownOverlay === 'friends') { e.preventDefault(); netFriendsBack(); }
      else if (code === 'KeyM' && !e.repeat) toggleMute();
      return;
    }
    // 친구 순위: a plain form too - Escape goes back to 내 기록, M mutes; no game key does anything behind it
    if (shownOverlay === 'pal') {
      if (code === 'Escape') { e.preventDefault(); if (!e.repeat) palClose(); }
      else if (code === 'KeyM' && !e.repeat) toggleMute();
      return;
    }
    // the 상점 / 마이페이지 hub: a plain form too - Escape closes it, M mutes, the arrows move in its tabs and grids, Enter /
    // Space press the focused button (the browser's own); no game key does anything (Z / X never buy, ←/→ never pick)
    if (shownOverlay === 'hub') {
      // (a held Enter / Space repeats the browser's own press of the focused button: 사기's two deliberate taps, a cell's
      // wear, must not come from one held key - review 2026-10-18)
      if (e.repeat && onButton && (code === 'Enter' || code === 'NumpadEnter' || code === 'Space')) { e.preventDefault(); return; }
      // (the 뽑기's show first: Escape skips it - ignored for its first 24 f - and never closes the hub meanwhile)
      if (code === 'Escape') { e.preventDefault(); if (!e.repeat) { if (HUB.draw.anim) drawSkip(); else closeHub(); } }
      else if (code === 'KeyM' && !e.repeat) toggleMute();
      else if (hubArrow(e, code)) e.preventDefault();
      return;
    }
    // the login screen: its two buttons (Enter / Space press the focused one, the arrows move between them); no game key
    // does anything behind it, M mutes
    if (shownOverlay === 'login') {
      if (onButton && (code === 'Enter' || code === 'NumpadEnter' || code === 'Space')) { if (e.repeat) e.preventDefault(); return; }
      if (code === 'KeyM') { if (!e.repeat) toggleMute(); return; }
      if (lgArrow(code) || KEYMAP[code] || code === 'Enter' || code === 'NumpadEnter' || code === 'Escape' || code === 'KeyP') e.preventDefault();
      return;
    }
    // 내 기록 over the title: Escape / Enter / jump / shoot close it (never a solo start, a pause or an animal pick)
    if (shownOverlay === 'rec') {
      const a = KEYMAP[code];
      // (cloud trophies: Enter / Space on the focused sign-in button press it - they do not close the card)
      if (onButton && e.target !== dom.recClose && (code === 'Enter' || code === 'NumpadEnter' || code === 'Space')) { if (e.repeat) e.preventDefault(); return; }
      if (code === 'Escape' || code === 'Enter' || code === 'NumpadEnter' || a === 'jump' || a === 'shoot') { e.preventDefault(); if (!e.repeat) closeRec(); }
      else if (code === 'KeyM' && !e.repeat) toggleMute();
      else if (a || code === 'KeyP' || code === 'ArrowDown') e.preventDefault();
      return;
    }
    if (code === 'KeyM') { if (!e.repeat) toggleMute(); return; }
    if (code === 'KeyP' || code === 'Escape') { e.preventDefault(); if (!e.repeat) togglePause(); return; }
    const act = KEYMAP[code];
    const inMenu = G.mode === 'title' || G.mode === 'gameover' || G.mode === 'ending' || G.mode === 'paused' || G.mode === 'podium' || G.menuOpen;
    if (inMenu) {
      // title: left / right pick the animal
      if (G.mode === 'title' && shownOverlay === 'title' && (act === 'left' || act === 'right') && !onPickerInput(e)) {
        e.preventDefault(); if (!e.repeat) pickChar(CHAR_IDS[(CHAR_IDS.indexOf(G.sel) + (act === 'left' ? -1 : 1) + CHAR_IDS.length) % CHAR_IDS.length]);
        return;
      }
      const enter = code === 'Enter' || code === 'NumpadEnter';
      if (onButton && (enter || code === 'Space')) {
        // a held key (auto-repeat) or Space during the result-screen lock must not press the focused button
        if (e.repeat || (code === 'Space' && menuLocked())) e.preventDefault();
        return; // otherwise let the focused button act
      }
      if (enter || act === 'jump' || act === 'shoot') {
        if (code === 'ArrowUp' || code === 'KeyW') return;
        e.preventDefault();
        if (e.repeat) return;
        if (!enter && menuLocked()) return; // still mashing from play: keep the result screen up
        primaryAction();
      }
      return;
    }
    if (act) {
      e.preventDefault();
      if (!keys[act] && (act === 'jump' || act === 'shoot')) latch[act] = true;
      keys[act] = true;
    }
  }
  function onKeyUp(e) {
    const code = codeOf(e);
    if (code === 'Space' && menuLocked() && e.target && e.target.tagName === 'BUTTON') e.preventDefault();
    const act = KEYMAP[code];
    if (act) { keys[act] = false; if (G.mode === 'playing' || G.mode === 'dying' || G.mode === 'transition') e.preventDefault(); }
  }
  function setTouchMode(on) {
    if (touchMode === on) return;
    touchMode = on;
    if (dom.app) dom.app.classList.toggle('pg-touch-on', on);
    syncJumpSub();
    fit();
    if (on) orientLock();
  }
  function bindTouch() {
    const holds = [['pg-t-jump', 'jump'], ['pg-t-shoot', 'shoot']];
    for (const [id, act] of holds) {
      const el = $(id); if (!el) continue;
      const ids = new Set();
      const sync = () => { const on = ids.size > 0; if (on && !touchIn[act]) latch[act] = true; touchIn[act] = on; el.classList.toggle('on', on); };
      listen(el, 'pointerdown', (e) => {
        e.preventDefault(); firstGesture(); if (e.pointerType === 'touch') setTouchMode(true);
        try { el.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
        ids.add(e.pointerId); sync();
      });
      const up = (e) => { ids.delete(e.pointerId); sync(); };
      listen(el, 'pointerup', up); listen(el, 'pointercancel', up); listen(el, 'lostpointercapture', up);
      listen(el, 'contextmenu', (e) => e.preventDefault());
    }
    const zone = $('pg-stick-zone');
    if (zone) {
      listen(zone, 'pointerdown', (e) => {
        e.preventDefault(); firstGesture(); if (e.pointerType === 'touch') setTouchMode(true);
        if (STICK.id !== null) return;
        STICK.id = e.pointerId;
        try { zone.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
        const zr = zone.getBoundingClientRect();
        STICK.zl = zr.left; STICK.zt = zr.top; STICK.R = (dom.stick && dom.stick.offsetWidth / 2) || 50;
        STICK.ox = e.clientX - zr.left; STICK.oy = e.clientY - zr.top; STICK.dir = 0;
        zone.classList.add('is-on');
        stickMove(e.clientX, e.clientY);
      });
      // (on the window: the captured pointer's events bubble here, and a thumb that slid off the zone still steers)
      listen(window, 'pointermove', (e) => { if (STICK.id !== null && e.pointerId === STICK.id) stickMove(e.clientX, e.clientY); }, { passive: true });
      const up = (e) => { if (STICK.id !== null && e.pointerId === STICK.id) stickReset(); };
      listen(window, 'pointerup', up); listen(window, 'pointercancel', up); listen(zone, 'lostpointercapture', up);
      listen(zone, 'contextmenu', (e) => e.preventDefault());
    }
    listen(window, 'pointerdown', (e) => { if (e.pointerType === 'touch') setTouchMode(true); }, { passive: true });
    listen(window, 'touchstart', () => setTouchMode(true), { passive: true });
  }
  // the notch / home-indicator insets in px (a hidden probe padded with env(safe-area-inset-*))
  function safeInsets() {
    let el = dom.sai;
    if (!el) {
      el = dom.sai = document.createElement('div'); el.setAttribute('aria-hidden', 'true');
      el.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
      document.body.appendChild(el);
    }
    const cs = getComputedStyle(el), n = (v) => parseFloat(v) || 0;
    return { t: n(cs.paddingTop), r: n(cs.paddingRight), b: n(cs.paddingBottom), l: n(cs.paddingLeft) };
  }
  let landForce = null; // (PG.debug.forceLand: a test that sizes the stage as an upright phone inside a wide window)
  function fit() {
    if (!dom.stage || !dom.screen) return;
    // touch + a viewport wider than tall: the landscape layout (page.html .pg-land) - the screen takes the whole height,
    // with an empty column on each side for the thumbs (never over the play field) and any fraction of a scale
    // (image-rendering: pixelated keeps the pixels crisp). Everything else (desktop, upright phones and tablets) as before
    const touch = touchMode || !!(dom.app && dom.app.classList.contains('pg-touch-on'));
    const vw = window.innerWidth || 0, vh = window.innerHeight || 0, land = landForce !== null ? landForce : !!(touch && vw > vh);
    if (dom.app) dom.app.classList.toggle('pg-land', land);
    rotSync(touch, vw, vh);
    const open = !!(dom.app && dom.app.classList.contains('pg-panel-open')), cols = land && !open;
    const r = dom.stage.getBoundingClientRect();
    let pad = 0;
    if (dom.frame) { const cs = getComputedStyle(dom.frame); pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.borderLeftWidth) || 0); }
    let aw = Math.max(64, r.width - pad * 2 - 2);
    const ah = Math.max(56, r.height - pad * 2 - 2), ins = cols ? safeInsets() : null, edge = cols ? Math.max(ins.l, ins.r) : 0;
    // (each thumb column at least 22% of the height: 104 px on a 360 px phone, 169 px on a 768 px tablet)
    if (cols) aw = Math.max(64, Math.min(aw, vw - 2 * (edge + clamp(Math.round(vh * 0.22), 104, 180)) - pad * 2 - 2));
    let s = Math.min(aw / W, ah / H);
    if (s >= 2 && !land) s = Math.floor(s);
    s = Math.max(0.25, s);
    dom.screen.style.width = Math.floor(W * s) + 'px';
    dom.screen.style.height = Math.floor(H * s) + 'px';
    screenScale = Math.floor(W * s) / W;
    if (dom.app) {
      const st = dom.app.style;
      if (cols) {
        // the columns' width (viewport edge to the mirror frame), the 점프 button's size and the stick's radius from what
        // is left of a column after the insets: narrow -> 거품 stacked over 점프, wide -> side by side, 거품 a little higher
        const side = Math.max(0, Math.floor((vw - Math.floor(W * s) - pad * 2 - 4) / 2)), u = side - edge - 12, col = u < 2 * 58 + 18;
        st.setProperty('--pg-side', side + 'px');
        st.setProperty('--pg-tb', (col ? clamp(u - 12, 54, 72) : clamp(Math.floor((u - 18) / 2), 58, 80)) + 'px');
        st.setProperty('--pg-sr', clamp(Math.round(u * 0.36), 40, 62) + 'px');
        dom.app.classList.toggle('pg-land-col', col);
      } else if (st.getPropertyValue('--pg-side')) {
        for (const k of ['--pg-side', '--pg-tb', '--pg-sr']) st.removeProperty(k);
        dom.app.classList.remove('pg-land-col');
      }
    }
    // phones: never below ~12.5 px so overlay text stays readable at 1.2-1.3x canvas scale
    dom.screen.style.setProperty('--fs', clamp(s * 6, touchMode ? 12.5 : 11, 22).toFixed(2) + 'px');
    shopBtnFit();          // (v4 shop: the 상점 button's label only where it fits)
    hubTopFit();           // (the hub's tab row and coin chip on one line where they fit)
  }
  function setupDOM() {
    try {
      const fl = $('pg-fontcss');
      if (fl && fl.media !== 'all') { const on = () => { fl.media = 'all'; }; if (fl.sheet) on(); else listen(fl, 'load', on); }
    } catch (e) { /* ignore */ }
    dom.app = $('pg-app'); dom.stage = $('pg-stage'); dom.frame = $('pg-frame'); dom.screen = $('pg-screen');
    canvas = $('pg-canvas');
    if (!canvas) { canvas = mk(W, H); canvas.id = 'pg-canvas'; (dom.screen || document.body).appendChild(canvas); }
    canvas.width = W; canvas.height = H;
    try { canvas.setAttribute('aria-label', GAME_NAME + ' 게임 화면'); } catch (e) { /* ignore */ }
    ctx = canvas.getContext('2d');
    dom.title = $('pg-title'); dom.pause = $('pg-pause'); dom.over = $('pg-over'); dom.ending = $('pg-ending');
    dom.banner = $('pg-banner'); dom.bannerMain = $('pg-banner-main'); dom.bannerSub = $('pg-banner-sub');
    dom.titleHi = $('pg-title-hi'); dom.overScore = $('pg-over-score'); dom.overHi = $('pg-over-hi'); dom.overRound = $('pg-over-round'); dom.overNew = $('pg-over-new');
    dom.endScore = $('pg-end-score'); dom.endNext = $('pg-end-next');
    dom.soundBtn = $('pg-sound'); dom.pauseBtn = $('pg-pausebtn'); dom.stickZone = $('pg-stick-zone'); dom.stick = $('pg-stick'); dom.stickKnob = $('pg-stick-knob');
    dom.podium = $('pg-podium'); dom.friends = $('pg-friends'); dom.podiumSum = $('pg-podium-sum');
    dom.overTeam = $('pg-over-team'); dom.endTeam = $('pg-end-team'); dom.endSub = $('pg-end-sub');
    dom.pick = $('pg-pick'); dom.pickName = $('pg-pick-name'); dom.pickPerk = $('pg-pick-perk');
    dom.kit = $('pg-kit'); dom.pickAnimal = $('pg-pick-animal'); dom.pickRole = $('pg-pick-role'); dom.pickBadge = $('pg-pick-badge'); dom.pickStats = $('pg-pick-stats');
    dom.pickMove = $('pg-pick-move'); dom.pickMoveHow = $('pg-pick-movehow'); dom.pickBub = $('pg-pick-bub'); dom.pickBubDesc = $('pg-pick-bubdesc');
    dom.tJumpSub = $('pg-t-jump-sub');
    // (v4 trophies: the title badge, 내 기록, the friends panel's chip)
    dom.rec = $('pg-rec'); dom.tro = $('pg-tro'); dom.troN = $('pg-tro-n'); dom.troName = $('pg-tro-name'); dom.troLg = $('pg-tro-lg'); dom.troNew = $('pg-tro-new');
    dom.myTro = $('pg-mytro');
    // (cloud trophies: the badge's mark, 내 기록's status line and sign-in button - hidden unless the cloud is on)
    dom.troCloud = $('pg-tro-cloud'); dom.cloud = $('pg-cloud'); dom.cloudTx = $('pg-cloud-tx'); dom.cloudBtn = $('pg-cloud-btn'); dom.recClose = $('pg-rec-close');
    dom.recCard = dom.rec ? dom.rec.querySelector('.pg-rec-card') : null;
    const layer = (id) => { let el = $(id); if (!el && dom.screen) { el = document.createElement('div'); el.id = id; el.setAttribute('aria-hidden', 'true'); dom.screen.insertBefore(el, dom.banner || null); } return el; };
    dom.tags = layer('pg-tags'); dom.words = layer('pg-words');
    // warm the Korean web-font slices for round names too (banners / game-over card show them later)
    try { const fw = document.querySelector('#pg-fontwarm .pg-fw-sign'); if (fw) fw.textContent += ' ' + GAME_NAME + ' ' + LEVELS.map((l) => l.name).join(' ') + ' ' + BOSS_TEXT; } catch (e) { /* ignore */ }
    try { const fb = document.querySelector('#pg-fontwarm .pg-fw-body'); if (fb) fb.textContent += ' ' + BOSS_TEXT + ' ' + V3_TEXT + ' ' + TRO_TEXT + ' ' + SHOP_TEXT + ' ' + GACHA_TEXT; } catch (e) { /* ignore */ }
    try { const fs2 = document.querySelector('#pg-fontwarm .pg-fw-sign'); if (fs2) fs2.textContent += ' ' + V3_TEXT + ' ' + TRO_TEXT + ' ' + SHOP_TEXT + ' ' + GACHA_TEXT; } catch (e) { /* ignore */ }
    paintCups(document); paintCoins(document);
    const click = (id, fn) => { const el = $(id); if (el) listen(el, 'click', (e) => { e.preventDefault(); fn(); if (el.closest('#pg-head')) el.blur(); }); };
    click('pg-start', startGame);
    click('pg-friends-btn', openFriends);
    click('pg-rec-close', closeRec);
    click('pg-cloud-btn', () => { if (dom.cloudBtn.getAttribute('aria-disabled') !== 'true') clClick(); });
    // (한 판 더 after a staked result waits for every guest's new count and for everyone to still cover the stake)
    click('pg-podium-again', () => { if (!troCanRematch()) return; firstGesture(); netAgain(rematch); });
    click('pg-podium-room', netToRoom);
    // an online host: these end the game for everyone - a second tap within 2.5 s confirms (no window.confirm)
    click('pg-podium-lobby', () => confirmTwice('pg-podium-lobby', '한 번 더 누르면 방이 닫혀요', toLobby));
    buildPicker();
    click('pg-resume', resumeGame);
    // (online: "처음으로" becomes 방으로 for the host - everyone back to the room - and 나가기 for a guest)
    const homeOrRoom = () => { if (!G.online) toTitle(); else if (G.role === 'host') netToRoom(); else netLeave(''); };
    click('pg-pause-home', () => confirmTwice('pg-pause-home', troLeaveLabel(!(G.online && G.role === 'guest')), homeOrRoom));
    click('pg-retry', () => { firstGesture(); retry(); });
    click('pg-over-home', homeOrRoom);
    click('pg-end-next', () => netAgain(continueLoop));
    click('pg-end-home', homeOrRoom);
    netSetupDOM(click);
    hubSetupDOM(click); // (v4 shop: the title's 상점 button, the badge -> 마이페이지, the hub, the room's 꾸미기)
    pwaSetupDOM(click); // (the standalone deploy's install pill / iOS hint / fullscreen toggle; nothing in the artifact)
    clSetupDOM();       // (cloud trophies: the warm-up text; nothing without the cloud)
    lgSetupDOM(click);  // (the login screen: the deploy with the cloud / a PR preview only)
    palSetupDOM();      // (친구 순위: 내 기록's button - the deploy with the cloud / a PR preview only)
    click('pg-sound', toggleMute);
    click('pg-pausebtn', togglePause);
    listen(window, 'keydown', onKeyDown);
    listen(window, 'keyup', onKeyUp);
    listen(window, 'blur', () => { stickReset(); clearKeys(); });
    // (trophies: hidden / shown / resumed / on- and offline mark "away" for 30 s; a guest that goes hidden tells the host
    // "if I am gone at the end, I left on purpose" (gg) and takes it back when visible; closing the tab forfeits)
    listen(document, 'visibilitychange', () => { TRO.awayAt = Date.now(); troGg(document.hidden ? 1 : 0); if (document.hidden) { stickReset(); clearKeys(); saveHi(); clFlush(); if (!G.manual) pauseGame(); } else clBack(); });
    listen(window, 'pagehide', () => { saveHi(); troSessionEnd('left'); clFlush(); });
    // (pageshow: only a page coming back from the back-forward cache - the first load is not a return)
    listen(window, 'pageshow', (e) => { if (e && e.persisted) TRO.awayAt = Date.now(); });
    for (const [tg, ev] of [[document, 'resume'], [window, 'online'], [window, 'offline']]) listen(tg, ev, () => { TRO.awayAt = Date.now(); });
    // (cloud trophies: back online -> a pending sign-in link / SDK load / write goes now; offline -> the mark says so)
    listen(window, 'online', clOnline); listen(window, 'offline', () => { if (CLOUD.on) { clUI(); clBadge(); } });
    listen(window, 'focus', clBack);   // (cloud trophies: back from the Google window - the popup's watch shortens)
    // another tab of this browser changed the store: the badge / room / 내 기록 follow
    listen(window, 'storage', (e) => { if (e.key === TRO.key) { TRO.s = troRead(); troSync(); hubLost(); drawLost(); clStore(); } });
    listen(window, 'pointerdown', () => firstGesture(), { passive: true });
    bindTouch();
    if (mq('(pointer: coarse)') && !mq('(pointer: fine)')) setTouchMode(true);
    rotSetup();
    listen(window, 'resize', fit);
    listen(window, 'orientationchange', () => { fit(); setTimeout(fit, 300); });
    if (window.visualViewport) listen(window.visualViewport, 'resize', fit);
    listen(document, 'fullscreenchange', orientLock);
    noZoomSetup();
    if (typeof ResizeObserver === 'function' && dom.stage) { try { const ro = new ResizeObserver(fit); ro.observe(dom.stage); LISTENERS.push([{ removeEventListener() { ro.disconnect(); } }, 'resize', null, null]); } catch (e) { /* ignore */ } }
    fit();
    updateMuteUI();
  }

  // ------------------------------------------------------------------ phones: no zoom, landscape
  // no double-tap zoom and no pinch anywhere in the game (page.html's touch-action does most of it; iOS needs this):
  // Safari's pinch gestures are cancelled, and so is a quick second tap on the game's own surfaces (the canvas, the cards'
  // text, the frame, the background, the touch controls) - never on a button, an input or a panel, which keep their taps,
  // typing and scrolling (their touch-action: manipulation already stops the zoom there)
  const TAP_OK = 'button, a, input, select, textarea, label, [contenteditable], [role="button"], [role="tab"], [role="radio"], [tabindex], .pg-panel';
  function noZoomSetup() {
    const no = (e) => { if (e.cancelable !== false) e.preventDefault(); };
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) listen(document, t, no, { passive: false });
    let last = 0;
    listen(document, 'touchend', (e) => {
      const now = Date.now(), quick = now - last < 350; last = now;
      const t = e.target;
      if (!quick || !e.cancelable || (t && t.closest && t.closest(TAP_OK))) return;
      e.preventDefault();
    }, { passive: false });
  }
  // the deploy (.pg-sa: the hosted page, the PR preview, itch) on a phone held upright: "가로로 돌려 주세요" over
  // everything, the touch controls let go and a game pauses (an online one opens its menu). Phone-sized = the screen's
  // short side under 600 px (an iPad keeps its upright layout). Made here: the artifact never has it (inside the Claude
  // app the page may not turn with the phone - its upright layout stays playable). An installed Android app is locked
  // to landscape by the manifest (and orientLock); iPhone ignores both, so this screen is what turns it there
  const ROT_TEXT = '가로로 돌려 주세요 휴대폰을 눕히면 게임 화면이 커져요';
  const ROT_SVG = '<svg class="pg-rot-ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<g class="pg-rot-a"><rect x="8" y="3" width="8" height="18" fill="#fbf0d9"/><rect x="9" y="5" width="6" height="13" fill="#1d5953"/>' +
    '<rect x="11" y="4" width="2" height="1" fill="#071619"/><rect x="11" y="19" width="2" height="1" fill="#071619"/>' +
    '<rect x="16" y="2" width="3" height="1" fill="#f6a6bd"/><rect x="19" y="3" width="1" height="1" fill="#f6a6bd"/><rect x="20" y="4" width="1" height="5" fill="#f6a6bd"/>' +
    '<rect x="18" y="6" width="1" height="1" fill="#f6a6bd"/><rect x="19" y="7" width="1" height="1" fill="#f6a6bd"/><rect x="21" y="7" width="1" height="1" fill="#f6a6bd"/><rect x="22" y="6" width="1" height="1" fill="#f6a6bd"/></g>' +
    '<g class="pg-rot-b"><rect x="3" y="8" width="18" height="8" fill="#fbf0d9"/><rect x="5" y="9" width="13" height="6" fill="#1d5953"/>' +
    '<rect x="4" y="11" width="1" height="2" fill="#071619"/><rect x="19" y="11" width="1" height="2" fill="#071619"/>' +
    '<rect x="7" y="12" width="2" height="2" fill="#ffd447"/><rect x="9" y="12" width="1" height="1" fill="#e89a17"/>' +
    '<rect x="13" y="10" width="2" height="1" fill="#7fdcc8"/><rect x="12" y="11" width="1" height="2" fill="#7fdcc8"/><rect x="15" y="11" width="1" height="2" fill="#7fdcc8"/><rect x="13" y="13" width="2" height="1" fill="#7fdcc8"/></g></svg>';
  function rotSetup() {
    if (!document.documentElement.classList.contains('pg-sa') || dom.rotate) return;
    const el = document.createElement('div');
    el.id = 'pg-rotate'; el.className = 'pg-rotate'; el.hidden = true;
    el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'pg-rot-t');
    el.innerHTML = ROT_SVG + '<p id="pg-rot-t" class="pg-rot-t"><em>가로로</em> 돌려 주세요</p><p class="pg-rot-s">휴대폰을 눕히면 게임 화면이 커져요</p>';
    listen(el, 'contextmenu', (e) => e.preventDefault());
    document.body.appendChild(el);
    dom.rotate = el;
    try { for (const q of ['.pg-fw-body', '.pg-fw-sign']) { const fw = document.querySelector('#pg-fontwarm ' + q); if (fw) fw.textContent += ' ' + ROT_TEXT; } } catch (e) { /* ignore */ }
  }
  function rotSync(touch, vw, vh) {
    const el = dom.rotate;
    if (!el) return;
    let sw = vw, sh = vh;
    try { if (screen && screen.width > 0) { sw = screen.width; sh = screen.height; } } catch (e) { /* ignore */ }
    const on = !!(touch && vh > vw && Math.min(sw, sh) < 600 && Math.min(vw, vh) < 600);
    if (el.hidden === !on) return;
    el.hidden = !on;
    if (on) { stickReset(); clearKeys(); pauseGame(); }
  }
  // the deploy on a touch device, installed or in fullscreen (where browsers allow it - Android Chrome): ask for the
  // landscape lock. Refused elsewhere (a tab, iPhone, desktop): ignored, the rotate screen does the asking
  function orientLock() {
    try {
      if (!touchMode || !document.documentElement.classList.contains('pg-sa')) return;
      const o = screen.orientation;
      if (!o || typeof o.lock !== 'function' || !(fsDoc() || pwaIsApp())) return;
      const pr = o.lock('landscape');
      if (pr && typeof pr.catch === 'function') pr.catch(() => { /* refused: not allowed here */ });
    } catch (e) { /* not available */ }
  }

  // ------------------------------------------------------------------ v4 app install + fullscreen (STANDALONE deploy only)
  // build.js gives only deploy/index.html a manifest link (and its service worker, registered from that page's head);
  // the Claude artifact has none, so PWA.on stays false there: no listeners, no buttons, nothing added to the warm-up.
  //   - Android / desktop Chrome: beforeinstallprompt is kept (Chrome's own mini-infobar stays away) and the title's
  //     최고 점수 line shows a small "앱으로 설치" pill; a tap opens the browser's install dialog (a prompt works once)
  //   - iOS has no prompt API (Safari, and Chrome / Edge since 16.4, add apps from the share sheet): the same line shows
  //     "공유 → 홈 화면에 추가" - not in in-app browsers (KakaoTalk, NAVER, Instagram, Facebook, LINE...) that cannot
  //   - none of it once the game runs as an app (display-mode standalone / fullscreen, iOS navigator.standalone), after
  //     appinstalled, or inside a frame (itch.io's iframe: the browser would install itch, not the game)
  //   - the header's fullscreen toggle wherever the Fullscreen API works (not iPhone Safari), unless the page already is
  //     a fullscreen app; the layout follows through the resize / ResizeObserver that fit() listens to
  //   - an installed app asks the browser to keep its storage (trophies, best score) out of eviction: Chrome and Safari
  //     answer from their own heuristics without a prompt (Firefox would prompt: skipped there)
  const PWA_TEXT = '앱으로 설치 공유 → 홈 화면에 추가 전체 화면 끝내기';
  // in-app browsers (KakaoTalk, NAVER, Daum, Instagram, Facebook, LINE, Android WebViews): no add-to-home-screen there
  // (and Google refuses sign-in inside them) - the one test every part of the game uses
  const IN_APP_UA = /KAKAOTALK|NAVER\(inapp|DaumApps|Instagram|FBAN|FBAV|Line\/|; wv\)/i;
  const PWA = { on: false, prompt: null, ios: false, inApp: false, framed: false, installed: false, persist: null };
  const fsDoc = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const fsCan = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  // running as an installed app? (a browser tab in API fullscreen also matches display-mode: fullscreen - not an app)
  const pwaIsApp = () => navigator.standalone === true || mq('(display-mode: standalone)') || mq('(display-mode: minimal-ui)') ||
    (mq('(display-mode: fullscreen)') && !fsDoc());
  (function pwaInit() {
    try { PWA.on = !!document.querySelector('link[rel="manifest"]'); } catch (e) { PWA.on = false; }
    if (!PWA.on) return;
    const ua = String(navigator.userAgent || '');
    PWA.ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints | 0) > 1);
    PWA.inApp = IN_APP_UA.test(ua);
    try { PWA.framed = window.top !== window.self; } catch (e) { PWA.framed = true; }
    listen(window, 'beforeinstallprompt', (e) => { try { e.preventDefault(); } catch (er) { /* ignore */ } PWA.prompt = e; pwaSync(); });
    listen(window, 'appinstalled', () => { PWA.prompt = null; PWA.installed = true; pwaSync(); });
    for (const q of ['(display-mode: standalone)', '(display-mode: fullscreen)']) { try { listen(window.matchMedia(q), 'change', pwaSync); } catch (e) { /* old Safari: addListener only */ } }
    listen(document, 'fullscreenchange', pwaSync); listen(document, 'webkitfullscreenchange', pwaSync);
    try {
      const st = navigator.storage;
      if (pwaIsApp() && !/Firefox\//.test(ua) && st && typeof st.persist === 'function') {
        st.persisted().then((on) => (on ? true : st.persist())).then((on) => { PWA.persist = !!on; }, () => { PWA.persist = false; });
      }
    } catch (e) { /* ignore */ }
  })();
  // the three elements (made here, so the artifact's page never has them): the pill and the hint after the trophy badge on
  // the title's 최고 점수 line, the fullscreen toggle before the sound button. (Static markup only - nothing from outside)
  const PWA_SVG = (vb, sw, d, cls) => `<svg${cls ? ' class="' + cls + '"' : ''} viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  function pwaEl(tag, attrs, html) {
    const el = document.createElement(tag);
    for (const k of Object.keys(attrs)) el.setAttribute(k, attrs[k]);
    el.innerHTML = html; el.hidden = true;
    return el;
  }
  function pwaSetupDOM(click) {
    if (!PWA.on) return;
    const best = dom.title ? dom.title.querySelector('.pg-best') : null, snd = $('pg-sound');
    if (best && !$('pg-install')) {
      best.appendChild(pwaEl('button', { id: 'pg-install', class: 'pg-inst', type: 'button' }, PWA_SVG('0 0 16 16', 1.8, 'M8 2v8M4.5 6.8 8 10.3l3.5-3.5M3 13.5h10') + '<span>앱으로 설치</span>'));
      best.appendChild(pwaEl('span', { id: 'pg-ioshint', class: 'pg-inst pg-inst-ios' }, PWA_SVG('0 0 16 16', 1.6, 'M8 1.8v8.4M5.2 4.4 8 1.6l2.8 2.8M5.5 6.6H4v7.6h8V6.6h-1.5') + '<span>공유 → 홈 화면에 추가</span>'));
    }
    if (snd && snd.parentNode && !$('pg-fs')) {
      snd.parentNode.insertBefore(pwaEl('button', { id: 'pg-fs', class: 'pg-icon', type: 'button', 'aria-pressed': 'false', 'aria-label': '전체 화면', title: '전체 화면' },
        PWA_SVG('0 0 24 24', 2.2, 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5', 'pg-on') + PWA_SVG('0 0 24 24', 2.2, 'M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5', 'pg-off')), snd);
    }
    dom.install = $('pg-install'); dom.iosHint = $('pg-ioshint'); dom.fsBtn = $('pg-fs');
    dom.titleCard = dom.title ? dom.title.querySelector('.pg-title-card') : null;
    try { const fb = document.querySelector('#pg-fontwarm .pg-fw-body'); if (fb) fb.textContent += ' ' + PWA_TEXT; } catch (e) { /* ignore */ }
    click('pg-install', pwaInstall);
    click('pg-fs', toggleFullscreen);
    pwaSync();
  }
  function pwaSync() {
    if (!PWA.on) return;
    const app = pwaIsApp(), off = app || PWA.framed || PWA.installed;
    if (dom.install) dom.install.hidden = off || !PWA.prompt;
    if (dom.iosHint) dom.iosHint.hidden = off || !PWA.ios || PWA.inApp || !!PWA.prompt;
    // (short screens: the card makes room for the pill's own line - page.html's .pg-has-inst)
    if (dom.titleCard) dom.titleCard.classList.toggle('pg-has-inst', !!((dom.install && !dom.install.hidden) || (dom.iosHint && !dom.iosHint.hidden)));
    if (dom.fsBtn) {
      const on = !!fsDoc();
      dom.fsBtn.hidden = !fsCan() || (!on && mq('(display-mode: fullscreen)'));
      dom.fsBtn.classList.toggle('is-on', on);
      dom.fsBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      const t = on ? '전체 화면 끝내기' : '전체 화면';
      dom.fsBtn.setAttribute('aria-label', t); dom.fsBtn.title = t;
    }
  }
  function pwaInstall() {
    const p = PWA.prompt;
    if (!p) return;
    PWA.prompt = null; pwaSync(); // (a prompt works once; Chrome fires a fresh beforeinstallprompt when it may ask again)
    if (!touchMode) { try { $('pg-start').focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    try {
      Promise.resolve(p.prompt()).then(() => p.userChoice).then((c) => { if (c && c.outcome === 'accepted') { PWA.installed = true; pwaSync(); } }, () => { /* ignore */ });
    } catch (e) { /* ignore */ }
  }
  function toggleFullscreen() {
    const de = document.documentElement;
    try {
      const p = fsDoc() ? (document.exitFullscreen || document.webkitExitFullscreen).call(document)
        : (de.requestFullscreen || de.webkitRequestFullscreen).call(de, { navigationUI: 'hide' });
      if (p && typeof p.catch === 'function') p.catch(() => { /* refused (no gesture, a frame without allowfullscreen) */ });
    } catch (e) { /* not available here */ }
  }

  // ------------------------------------------------------------------ main loop
  let lastT = 0, acc = 0;
  function loop(now) {
    if (stopped) return;
    requestAnimationFrame(loop);
    if (!lastT) lastT = now;
    let dt = now - lastT; lastT = now;
    if (dt > 1000) TRO.awayAt = Date.now(); // (the loop stalled: hidden, suspended, a frozen phone - away, for trophies)
    if (dt > 250) dt = 250; if (dt < 0) dt = 0;
    if (!G.manual) {
      acc += dt; let n = 0;
      while (acc >= STEP_MS && n < 8) { update(); acc -= STEP_MS; n++; }
      if (n >= 8) acc = 0;
    }
    render();
    if (shownOverlay === 'hub') hubTick(); // (v4 shop: the hub's preview animates on its own)
  }

  // ------------------------------------------------------------------ v3 ONLINE: 친구와 하기, the room, netcode
  // Everything goes through PG.Net (net.js); this engine never touches a transport.
  // Transport: 'room' when the Claude artifact runtime resolves it, else 'peer' (standalone deploy with PeerJS), else
  // 'bc' (tabs of one browser, tests). ?net=bc&lat=..&jit=..&drop=.. (test pages only) forces it.
  // Model (host-authoritative):
  //  - The HOST runs the whole world at 60 Hz (enemies, bubbles, items, bosses, hazards, scoring, lives, round flow)
  //    and every 3rd frame sends a compact snapshot with setState (< 3.6 KB, short keys, integer arrays): see snapOf.
  //  - Each GUEST simulates only its own animal (movement, water, perks: updatePlayer) and sends its body ~30 Hz;
  //    discrete actions are reliable messages: shot / die (co-op) / hit (battle) / mash / rv (revive touch) and, in the
  //    room, hi / nk / pk / rd. The host blows a guest's bubble at the reported spot; pops, pickups, revives and battle
  //    traps use each player's latest reported spot (with some slack, see `slack`).
  //  - Guests draw the world SNAP_DELAY ticks behind the newest snapshot, interpolated, other players from their own
  //    body streams (interpolated), and replay sfx / pop-ups / word pops / shakes from the snapshot events (deduped by
  //    id) when their render clock reaches them; banners ride in the snapshot as state.
  //  - The control epoch `ep` (bumped by the host on spawn, fall, trap, release, KO, revive, podium) decides who moves
  //    an animal: the host ignores body states / actions from an older epoch, and a guest takes its animal back only
  //    when a newer epoch says it is free (from the spot the host put it).
  //  - Co-op: a guest decides its own falls against its interpolated view and reports them; battle: the host decides
  //    trapping and pops, a guest reports enemy hits (stun). The host judges a GUEST being caught against what that
  //    guest saw: guests send their render tick `rt` with their body, the host keeps each capture shot's path
  //    (shotNote) and tests the bubble as it was at that tick (lagTrapCheck) - a dodge on the victim's screen counts.
  //  - Interpolation buffers adapt: the playout delay grows with the measured jitter / gaps (p90), the clock offset
  //    resyncs after a sender stall, a far-future tick is ignored (bufPush).
  //  - A guest the host's room / world no longer lists (dropped while its link was away) leaves with 연결이 끊겼어요.
  // (v4: the character kits - different body physics, the 'qk' message, body bits A / B: a v3 page is refused)
  const NET_V = 4;
  const SNAP_EVERY = 3, BODY_EVERY = 2, SNAP_DELAY = 8, PEER_DELAY = 6, SNAP_LIMIT = 3400, EV_KEEP = 45, EV_MAX = 28;
  // a player's own movement sounds are played by that player's engine only (v4: the moves and the kit shoot sounds;
  // 'quake' and 'pop' are echoed)
  const NO_ECHO = { jump: 1, shoot: 1, bounce: 1, splash: 1, pause: 1, start: 1,
    flap: 1, slam: 1, dash: 1, slide: 1, djump: 1, hop: 1, b_echo: 1, b_onsen: 1, b_splash: 1, b_icicle: 1, b_yarn: 1, b_egg: 1, dry: 1, reload: 1 };
  const PH_CODE = { playing: 'p', countdown: 'c', transition: 't', gameover: 'o', ending: 'e', podium: 'd', dying: 'p', paused: 'p', title: 'p' };
  const PH_NAME = { p: 'playing', c: 'countdown', t: 'transition', o: 'gameover', e: 'ending', d: 'podium' };
  const MUSICS = [null, 'main', 'hurry', 'boss', 'final', 'clear', 'victory', 'battle', 'podium', 'gameover', 'ending', 'title', 'lobby'];
  const E_STATES = ['descend', 'active', 'trapped', 'frozen', 'dead'];
  const U_KINDS = ['empty', 'trapped', 'player', 'stamp', 'steam'];
  const U_STATES = ['float', 'shot', 'pop'];
  const H_KINDS = ['wave', 'spore', 'mitt', 'sweep'];
  const B_STATES = ['intro', 'fight', 'stun', 'down', 'defeat'];
  const B_ACTS = ['idle', 'rest', 'crouch', 'air', 'float', 'charge', 'walk', 'wind', 'dizzy', 'squat', 'hop', 'hover', 'swoopWind', 'swoop', 'recover', 'rain', 'cast'];
  const NET_TEXT = {
    connecting: '연결 중…', unstable: '연결이 불안정해요', not_found: '방을 찾을 수 없어요', full: '방이 꽉 찼어요',
    playing: '이미 게임이 시작됐어요', lost: '연결이 끊겼어요', timeout: '연결이 끊겼어요',
    // (a join that never opened its connection: the two devices could not reach each other - no relay server worked)
    joinFail: '친구 기기와 연결하지 못했어요 · 같은 와이파이에서 해 보거나 잠시 뒤 다시 해 주세요', host_left: '방장이 나갔어요',
    unavailable: '온라인에 연결할 수 없어요', roomOff: '온라인은 Claude에 로그인하고 이 게임에 초대받은 친구끼리만 할 수 있어요',
    local: '지금은 이 브라우저의 다른 탭끼리만 함께 할 수 있어요', loadingPeer: '연결 도구를 불러오는 중…', peer: '방 코드를 친구에게 알려 주면 인터넷으로 함께 해요',
    room: '방을 만들거나, 열린 방을 눌러 바로 참여해요', badCode: '방 코드 4자리를 확인해 주세요', noNet: '이 브라우저에서는 온라인을 쓸 수 없어요',
    peerOff: '온라인 연결 도구를 불러오지 못했어요. 인터넷을 확인하고 새로고침해 주세요',
    // a page whose online only reaches this browser's tabs (design/distinction.md 4.3): the friends panel's block card
    // ('room': the artifact's public link / a dead room; 'peer': the deploy page without PeerJS) and the answers to 참여 /
    // 방 만들기 there ("친구와 하기", never "같이 하기": that is the co-op mode's name)
    offHead: '이 링크로는 친구와 하기를 쓸 수 없어요', offHow: '게임을 보내 준 친구에게 Claude 이메일 초대를 부탁해요 · 초대 메일 속 링크로 열면 돼요',
    offSolo: '혼자 하기는 지금 바로 할 수 있어요', joinOff: '이 링크로는 친구와 하기를 쓸 수 없어요 · 방장에게 이메일 초대를 부탁해요',
    hostOff: '이 링크로는 방을 만들 수 없어요 · 게임을 보내 준 사람에게 이메일 초대를 부탁해요', peerHead: '온라인 연결 도구를 불러오지 못했어요',
    peerHow: '인터넷을 확인하고 새로고침해 주세요', joinOffPeer: '온라인 연결 도구가 없어요 · 새로고침해 주세요', hostOffPeer: '온라인 연결 도구가 없어요 · 새로고침해 주세요',
    reload: '새로고침',
  };
  const MODE_DESC = { coop: '2~4명이 힘을 합쳐 모든 탕을 청소해요', battle: '거품으로 친구를 가두고 터뜨려 점수를 겨뤄요' };
  const NICK_BAD = new RegExp('[' + [[0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff], [0xfff9, 0xfffb]]
    .map((r) => String.fromCharCode(r[0]) + '-' + String.fromCharCode(r[1])).join('') + ']', 'g');
  function cleanNick(s) { return typeof s === 'string' ? Array.from(s.replace(NICK_BAD, '').trim()).slice(0, 12).join('') : ''; }
  // untrusted numbers: finite, clamped (integers where asked)
  function nInt(v, lo, hi, d) { v = Number(v); if (!Number.isFinite(v)) return d; v = Math.round(v); return v < lo ? lo : v > hi ? hi : v; }
  function nNum(v, lo, hi, d) { v = Number(v); if (!Number.isFinite(v)) return d; return v < lo ? lo : v > hi ? hi : v; }
  const nStr = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
  const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
  function utf8Len(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? (i++, 4) : 3; }
    return n;
  }
  const netText = (code) => (PG.Net && PG.Net.TEXT && PG.Net.TEXT[code]) || NET_TEXT[code] || NET_TEXT.lost;
  function errText(e) {
    const c = e && e.code;
    if (c === 'full' && e.reason === 'playing') return netText('playing');
    if (c === 'timeout') return netText('joinFail');   // ("연결이 끊겼어요" read as a dropped game; it never connected)
    return netText(c === 'not_found' || c === 'full' || c === 'timeout' || c === 'unavailable' ? c : 'unavailable');
  }
  const nowTicks = () => { const p = window.performance; return (p && p.now ? p.now() : Date.now()) * 0.06; };

  const NET = {
    tr: null, trForced: false, trInfo: null, trP: null, trDone: false,
    sess: null, role: null, code: '', selfId: null, hostId: null, screen: null, unsubs: [],
    mode: 'coop', opts: { arena: -1, time: 3, perks: true, monsters: true, intrusion: true, bet: 0 },
    roster: [], slots: new Map(), gid: 0, ph: 'room', hostPh: 'room', ready: false, nick: '', busy: false, err: '', status: '',
    // (v4 trophies: ms the host session's series id - match id = ms + '.' + gid; q 0 = 트로피 경기, 1 / 2 = 연습 경기)
    ms: '', q: 1,
    // (안 걸고 참여, guest: the host has the rule - it sent R.f; kept for the session, game-phase R leaves it out)
    hz: false,
    lobby: null, lobbyUn: null, games: [],
    // host
    remote: new Map(), evs: [], evId: 0, rec: false, who: -1, roomDirty: true, roomAt: -1e9, R: null,
    snapN: 0, snapBytes: 0, snapMax: 0, snapTrim: 0, snapFail: 0, trace: null,
    // guest
    buf: null, evQ: [], evSeen: 0, others: new Map(), ctl: 'remote', shotN: 0, pred: [], bounces: [], nyang: 0, drops: 0, rvSent: {},
    dropSeen: 0, // (내려가기 dust shown for another screen's player: a guest's through dp, the host's through event 'd')
    viewIdx: -1, viewArena: false, bnId: 0, view: null, jumpHeld: false, mash: [], rt: 0, starve: 0, sidSeen: new Map(), viewFrames: 0, starveFrames: 0,
  };

  // ---- interpolation buffers: entries {k (sender tick), d}.
  // Clock offset `off` (sender tick - my tick) follows the FASTEST recent arrival: the max over the last ~1 s of
  // arrivals, drifting down slowly toward it. A sender that stalls (its loop dropped time) makes every later arrival
  // look late: once the whole window is late, or my render clock has run past the newest entry for ~0.5 s (starved),
  // the offset resyncs to the newest arrivals instead of decaying for half a minute.
  // Playout delay = max(base, adaptive): p90 of how late arrivals are vs the fastest (jitter) + p90 of the tick gap
  // between arrivals (send interval, drops) + 1, grown quickly (1 tick per arrival), shrunk slowly; at most 24 ticks.
  // A far-future tick (corrupt / hostile) is ignored; a sender clock that jumped far back resyncs the buffer.
  const BUF_WIN = 60, BUF_STATS = 120, BUF_MAXD = 24;
  function mkBuf() { return { list: [], off: null, last: -1, hist: [], adapt: 0, starveAt: 0 }; }
  function p90(a) { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * 0.9))]; }
  function bufPush(B, k, d) {
    const t = nowTicks();
    if (B.off !== null && k > t + B.off + 600) return false;            // far future: never let one row freeze the stream
    if (!(k > B.last)) {
      if (!(B.last >= 0 && k < B.last - 600)) return false;              // stale (jitter) or replayed
      B.list = []; B.last = -1; B.off = null; B.hist = []; B.starveAt = 0; // the sender's clock is far back now: resync
    }
    const gap = B.last >= 0 ? k - B.last : 0;
    B.last = k; B.list.push({ k, d });
    if (B.list.length > 64) B.list.shift();
    const s = k - t;
    B.hist.push({ t, s, gap });
    while (B.hist.length > 2 && B.hist[0].t < t - BUF_STATS) B.hist.shift();
    let mx = -Infinity, mxNew = -Infinity;
    for (const h of B.hist) { if (h.t >= t - BUF_WIN && h.s > mx) mx = h.s; if (h.t >= t - 20 && h.s > mxNew) mxNew = h.s; }
    if (B.off === null || s > B.off) B.off = s;
    else if (B.starveAt && t - B.starveAt > 30) { B.off = Math.min(B.off, mxNew); B.starveAt = 0; }
    else if (mx < B.off - 4) B.off = mx;                                  // the whole last second is late: resync
    else B.off = Math.max(mx, B.off - 0.05);
    // adaptive delay from the last ~2 s of arrivals
    if (B.hist.length >= 4) {
      const lates = [], gaps = [];
      for (const h of B.hist) { lates.push(Math.max(0, B.off - h.s)); if (h.gap > 0) gaps.push(Math.min(h.gap, 30)); }
      const want = Math.min(BUF_MAXD, p90(lates) + p90(gaps) + 1);
      B.adapt = want > B.adapt ? Math.min(want, B.adapt + 1) : Math.max(want, B.adapt - 0.03);
    }
    return true;
  }
  const bufDelay = (B, base) => Math.max(base, B.adapt || 0);
  const bufTick = (B, base) => (B.off === null ? null : nowTicks() + B.off - bufDelay(B, base));
  function bufSample(B, rt) {
    const L = B.list; if (!L.length || rt === null) return null;
    while (L.length > 3 && L[1].k < rt - 90) L.shift();
    if (rt > L[L.length - 1].k + 0.5) { if (!B.starveAt) B.starveAt = nowTicks(); } else B.starveAt = 0;
    if (rt <= L[0].k) return { a: L[0], b: null, t: 0 };
    for (let i = L.length - 1; i >= 0; i--) {
      if (L[i].k <= rt) { const b = L[i + 1] || null; return { a: L[i], b, t: b ? clamp((rt - L[i].k) / (b.k - L[i].k), 0, 1) : 0 }; }
    }
    return { a: L[0], b: null, t: 0 };
  }
  // interpolate a coordinate (no tweening across a wrap through the drain or a respawn)
  function lp(a, b, t, lo, hi) {
    a = nNum(a, lo, hi, 0);
    if (b === undefined || b === null || !t) return a;
    b = nNum(b, lo, hi, a);
    return Math.abs(b - a) > 40 ? a : a + (b - a) * t;
  }
  const lx = (a, b, t) => lp(a, b, t, -40, W + 40), ly = (a, b, t) => lp(a, b, t, -60, H + 60);

  // ================================================================== transport, session, lobby
  function netTransport() {
    if (NET.tr) return Promise.resolve(NET.tr);
    if (NET.trP) return NET.trP;
    NET.trP = (async () => {
      const Net = PG.Net;
      if (!Net) return null;
      let q = null; try { q = Net.fromQuery(); } catch (e) { q = null; }
      if (q && q.transport) { NET.trForced = true; NET.tr = q.transport; return NET.tr; }
      // the standalone page loads PeerJS deferred: while it is still on its way (DOMContentLoaded not yet fired),
      // wait for it instead of deciding on 'bc' (the panel says 연결 도구를 불러오는 중…)
      if (peerTag() && typeof window.Peer !== 'function' && !domReady) await new Promise((res) => { domWaiters.push(res); setTimeout(res, 20000); });
      let t = null; try { t = await Net.transports(); } catch (e) { t = null; }
      NET.trInfo = t;
      NET.tr = t && t.room ? 'room' : t && t.peer ? 'peer' : t && t.bc ? 'bc' : null;
      return NET.tr;
    })().then((tr) => { NET.trDone = true; return tr; }, () => { NET.trDone = true; return null; });
    return NET.trP;
  }
  const peerTag = () => !!document.querySelector('script[src*="peerjs"]');
  // DOMContentLoaded: every deferred script (PeerJS on the standalone page) has run or failed by then
  let domReady = document.readyState === 'complete';
  const domWaiters = [];
  if (!domReady) listen(document, 'DOMContentLoaded', () => { domReady = true; for (const f of domWaiters.splice(0)) f(); if (dom.friends && NET.screen === 'friends') renderFriends(); });
  // the room capability turned out unusable (not_granted / revoked): fall back to what else this page has
  function netRoomDead() {
    if (NET.tr !== 'room' || NET.trForced) return;
    if (NET.lobby && !NET.sess) netLobbyClose();
    NET.tr = null; NET.trP = null; NET.trDone = false;
    if (NET.screen === 'friends') { renderFriends(); netTransport().then(() => renderFriends()); }
  }
  function netNick() {
    if (NET.nick) return NET.nick;
    let n = cleanNick(sget('ppogeul-nick') || '');
    if (!n) { n = '손님' + String(10 + Math.floor(Math.random() * 90)); sset('ppogeul-nick', n); NET.nickDefault = true; }
    NET.nick = n;
    return n;
  }
  function netSetNick(s) {
    const n = cleanNick(s);
    if (!n) return NET.nick;
    NET.nick = n; NET.nickDefault = false; NET.nickProfile = false; sset('ppogeul-nick', n);
    clNickSet(n);                                // (cloud trophies: the account's nick follows)
    if (NET.sess) {
      if (NET.role === 'host') { const me = NET.roster.find((r) => r.id === NET.selfId); if (me) me.nick = n; NET.roomDirty = true; renderRoom(); }
      else NET.sess.send(NET.hostId, { t: 'nk', n });
    }
    netAdvertise();
    return n;
  }
  const uiSfx = (n, o) => { if (unlocked) Snd.call('sfx', n, o); };   // (o: the variant - the 뽑기's sounds, gacha.md 9)
  // online here means only the other tabs of this browser (no room capability, no PeerJS; tests force bc on purpose)
  const localOnly = () => NET.tr === 'bc' && !NET.trForced;
  // ... and why (design/distinction.md 4.2): 'peer' = the deploy page whose PeerJS did not load, 'room' = the artifact
  // without its room (a public-link viewer, signed out, not_granted / revoked); '' = online works (forced bc included)
  const roomOffKind = () => (localOnly() ? (peerTag() ? 'peer' : 'room') : '');
  const OFF_ERRS = ['joinOff', 'hostOff', 'joinOffPeer', 'hostOffPeer'];
  // the true answer to 참여 / 방 만들기 on such a page: at once (no bc wait), on the error line, the card pulsing
  function netOffAnswer(join) {
    const peer = roomOffKind() === 'peer';
    NET.busy = false; setChip('');
    NET.err = NET_TEXT[join ? (peer ? 'joinOffPeer' : 'joinOff') : (peer ? 'hostOffPeer' : 'hostOff')];
    renderFriends(); netNoteFlash();
    return NET.err;
  }
  // the card pulses twice (CSS; none under reduced motion) and scrolls into view: on a 390 px phone it is above the
  // fold once the code box is focused. #pg-friends-err is role="alert", so the sentence itself is announced
  function netNoteFlash() {
    const el = dom.netNote; if (!el || el.hidden) return;
    el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash');
    clearTimeout(NET.flashT); NET.flashT = setTimeout(() => el.classList.remove('is-flash'), 700);
    try { el.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ }
  }
  function setChip(kind) {
    NET.chip = kind;
    const el = dom.netChip; if (!el) return;
    const txt = kind === 'wait' ? netText('connecting') : kind === 'bad' ? netText('unstable') : '';
    el.hidden = !txt; el.textContent = txt;
    el.className = 'pg-chip' + (kind === 'wait' ? ' is-wait' : kind === 'bad' ? ' is-bad' : '');
    const head = el.parentElement; if (head) head.classList.toggle('pg-has-chip', !!txt);
  }
  function netOpenFriends(msg) {
    NET.screen = 'friends';
    if (msg !== undefined) NET.err = msg;
    // the standalone page loads PeerJS deferred: if 친구와 하기 was opened before it arrived, look again now
    if (NET.trDone && NET.tr === 'bc' && !NET.trForced && !NET.sess && typeof window.Peer === 'function') { NET.tr = null; NET.trP = null; NET.trDone = false; }
    // ... and a room capability that failed for good since (revoked mid-game, not_granted) is not offered again
    if (NET.trDone && NET.tr === 'room' && !NET.trForced && !NET.sess && PG.Net && PG.Net.roomDead && PG.Net.roomDead()) { NET.tr = null; NET.trP = null; NET.trDone = false; }
    netNick();
    showOverlay('friends');
    setMusic('lobby');
    renderFriends();
    // ... and should it arrive while this panel is open (a slow network), switch to it then and there
    if (peerTag() && typeof window.Peer !== 'function' && !NET.peerWatch) {
      NET.peerWatch = setInterval(() => {
        if (typeof window.Peer !== 'function' && NET.screen === 'friends') return;
        clearInterval(NET.peerWatch); NET.peerWatch = null;
        if (typeof window.Peer === 'function' && NET.screen === 'friends' && !NET.sess && NET.trDone && NET.tr === 'bc' && !NET.trForced) {
          NET.tr = null; NET.trP = null; NET.trDone = false;
          renderFriends(); netTransport().then(() => renderFriends());
        }
      }, 400);
    }
    // (a guest on the deploy: the sign-in card, no open rooms; the SDK warmed so the tap opens Google's window at once)
    if (netGated()) clWarm();
    netTransport().then(() => { renderFriends(); if (!netGated()) netLobbyOpen(); });
    // the signed-in viewer's name as the default nickname (artifact 'user' capability), once
    if (NET.nickDefault && PG.Net && typeof PG.Net.profileName === 'function' && !NET.profAsked) {
      NET.profAsked = true;
      // (only a prefill: it is kept on this device and shown to others only once the player hosts or joins - or types)
      PG.Net.profileName().then((n) => { n = cleanNick(n); if (n && NET.nickDefault) { NET.nick = n; NET.nickDefault = false; NET.nickProfile = true; renderFriends(); } }, () => {});
    }
  }
  function netFriendsBack() {
    netLobbyClose();
    NET.screen = null; NET.err = '';
    showOverlay('title');
    setMusic('title');
  }
  // the lobby (room transport only): open games of other pages; my own ad while I host
  async function netLobbyOpen() {
    if (NET.tr !== 'room' || NET.lobby || !PG.Net) return;
    let lb = null; try { lb = await PG.Net.lobby('room'); } catch (e) { lb = null; }
    if (!lb) return;
    NET.lobby = lb;
    NET.lobbyUn = lb.onChange((games) => { NET.games = Array.isArray(games) ? games.slice(0, 12) : []; renderGames(); });
    NET.lobbyDeadUn = typeof lb.onDead === 'function' ? lb.onDead(() => netRoomDead()) : null;
    netAdvertise();
    renderFriends();
  }
  function netLobbyClose() {
    if (!NET.lobby || NET.sess) return; // (a host keeps its ad up)
    try { if (NET.lobbyUn) NET.lobbyUn(); } catch (e) { /* ignore */ }
    try { if (NET.lobbyDeadUn) NET.lobbyDeadUn(); } catch (e) { /* ignore */ }
    try { NET.lobby.close(); } catch (e) { /* ignore */ }
    NET.lobby = null; NET.lobbyUn = null; NET.lobbyDeadUn = null; NET.games = [];
  }
  function netAdvertise() {
    const lb = NET.lobby; if (!lb) return;
    // my nick rides in the lobby only while I host a game (that is where it is shown: the open-games list)
    const hosting = !!(NET.sess && NET.role === 'host');
    const info = { nick: hosting ? NET.nick : '', char: G.sel };
    if (hosting) Object.assign(info, { code: NET.code, mode: NET.mode, n: NET.roster.length, max: MAX_PLAYERS, open: NET.ph === 'room' && NET.roster.length < MAX_PLAYERS });
    else info.code = null;
    try { lb.advertise(info); } catch (e) { /* ignore */ }
  }

  // a standalone deploy may set window.PG_PEER_OPTIONS (TURN servers, its own PeerServer): handed to PG.Net when it
  // is a plain object
  function peerOpts(o) {
    let po = null; try { po = window.PG_PEER_OPTIONS; } catch (e) { po = null; }
    if (po && typeof po === 'object' && Object.getPrototypeOf(po) === Object.prototype) o.peerOptions = po;
    return o;
  }
  async function netHost(net) {
    if (NET.busy || NET.sess) return null;
    if (netGated()) { renderFriends(); return null; }     // (a guest on the deploy: the sign-in card instead)
    NET.busy = true; NET.err = ''; setChip('wait'); renderFriends();
    let s = null, tr = null;
    try {
      tr = await netTransport();
      if (!tr) throw Object.assign(new Error('x'), { code: 'unavailable' });
      // (only this browser's tabs - a public link, PeerJS missing: never a room nobody can enter. 방 만들기 is disabled
      // then; this answers a tap made while detection was still pending, and the test API)
      if (roomOffKind()) { netOffAnswer(false); return null; }
      const o = peerOpts({ transport: tr });
      if (net) o.net = net;
      s = await PG.Net.host(o);
    } catch (e) { NET.err = errText(e); }
    // (the room died under the attempt: the same true answer, and the card - not 온라인에 연결할 수 없어요)
    if (!s && tr === 'room' && PG.Net.roomDead && PG.Net.roomDead()) { netRoomDead(); await netTransport(); netOffAnswer(false); return null; }
    NET.busy = false; setChip('');
    if (s && NET.nickProfile) { NET.nickProfile = false; sset('ppogeul-nick', NET.nick); }
    if (s) netAttach(s, 'host'); else renderFriends();
    return s ? s.code : null;
  }
  async function netJoin(code, net) {
    code = String(code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!/^[a-z0-9]{4}$/.test(code)) { NET.err = NET_TEXT.badCode; renderFriends(); return { ok: false, code: 'bad_code' }; }
    if (NET.busy || NET.sess) return { ok: false, code: 'busy' };
    if (netGated()) { renderFriends(); return { ok: false, code: 'login' }; }
    NET.busy = true; NET.err = ''; setChip('wait'); renderFriends();
    let s = null, err = null, tr = null;
    try {
      tr = await netTransport();
      if (!tr) throw Object.assign(new Error('x'), { code: 'unavailable' });
      // (only this browser's tabs: the host's room cannot be reached from here - say why at once, with no bc search
      // that would end in a false 방을 찾을 수 없어요; also when 참여 was tapped while detection was pending)
      if (roomOffKind()) return { ok: false, code: 'room_off', text: netOffAnswer(true) };
      const o = peerOpts({ transport: tr, code });
      if (net) o.net = net;
      s = await PG.Net.join(o);
    } catch (e) { err = e; NET.err = errText(e); }
    // (the room died under the attempt - not_granted on the join's presence: that, not 연결이 끊겼어요 / 방을 찾을 수
    // 없어요; detection runs again (-> this browser's tabs) and the card is up by the time this answers)
    if (!s && tr === 'room' && PG.Net.roomDead && PG.Net.roomDead()) { netRoomDead(); await netTransport(); return { ok: false, code: 'room_off', text: netOffAnswer(true) }; }
    NET.busy = false; setChip('');
    if (s && NET.nickProfile) { NET.nickProfile = false; sset('ppogeul-nick', NET.nick); }
    if (s) { netAttach(s, 'guest'); return { ok: true, code }; }
    renderFriends();
    return { ok: false, code: (err && err.code) || 'unavailable', reason: err && err.reason, text: NET.err };
  }
  function netAttach(s, role) {
    netUnsub();
    netNick();
    Object.assign(NET, { sess: s, role, code: s.code, selfId: s.selfId, err: '', gid: 0, ph: 'room', hostPh: 'room', ready: false, status: '',
      remote: new Map(), others: new Map(), buf: mkBuf(), evQ: [], evs: [], rec: false, ctl: 'remote', pred: [], bounces: [], rvSent: {}, outR: 0, outP: 0, predLife: 0 });
    let peers = [];
    try { peers = s.peers(); } catch (e) { peers = []; }
    NET.slots = new Map(peers.map((p) => [p.id, p.slot]));
    const h = peers.find((p) => p.host);
    NET.hostId = role === 'host' ? s.selfId : h ? h.id : null;
    NET.roster = role === 'host' ? [{ id: s.selfId, slot: 0, nick: NET.nick, char: G.sel, ready: true, cup: -1, d: '' }] : [];
    // (trophies: the host's series id; a guest is practice until the host's R says otherwise; ready again for any stake)
    NET.ms = role === 'host' ? troRand(6) : ''; NET.q = role === 'host' ? 0 : 1; NET.hz = false; TRO.agreed = -1; TRO.free = false; TRO.match = null; TRO.lastRes = null; TRO.pod = null;
    if (role === 'host') troLowerStake();
    NET.unsubs = [
      s.onPeers((list) => netPeers(list)),
      s.onState((from, st) => netStateIn(from, st)),
      s.onMessage((from, m) => netMsgIn(from, m)),
      s.onStatus((k, d) => netStatusIn(k, d)),
    ];
    // (cu: my trophy count, d: my device as this room sees it - the host's same-device check; lk: my worn set, shop.md 7.1;
    // z: this page has 안 걸고 참여 - short of a stake, it plays without it, and says what it put in: 'st')
    if (role === 'guest') { CO.eqSent = myLook(G.sel); s.send(NET.hostId, { t: 'hi', n: NET.nick, c: G.sel, cu: TRO.s ? TRO.s.t : -1, d: troDevHash(s.code), lk: CO.eqSent, z: 1 }); }
    NET.roomDirty = true;
    netAdvertise();
    NET.screen = 'room';
    showOverlay('room');
    setMusic('lobby');
    uiSfx('join');
    renderRoom();
  }
  function netUnsub() { for (const u of NET.unsubs) { try { u(); } catch (e) { /* ignore */ } } NET.unsubs = []; }
  // end the session quietly (no UI): leave, forget the room, stop the online game flags. why (trophies held, troSessionEnd):
  // 'left' (나가기, 로비로, 처음으로: forfeit), 'lost' (refund unless I was away), 'host_left' / 'reload' (refund)
  function netClose(why = 'left') {
    const s = NET.sess;
    if (s && NET.role === 'host') ivClosed();     // (친구 초대: the invites into this room go with it)
    troSessionEnd(why); // (first, while NET.sess is still set: a guest's 'gg' goes out before leave())
    // (a guest's NET.opts mirrored the host's room: its stake is never carried into a room this player hosts later)
    if (NET.role === 'guest') NET.opts.bet = 0;
    netUnsub();
    NET.sess = null; NET.role = null; NET.rec = false; NET.roster = []; NET.screen = null; NET.code = '';
    NET.remote = new Map(); NET.others = new Map(); NET.pred = []; NET.evQ = []; NET.buf = null;
    if (s) { try { s.leave(); } catch (e) { /* ignore */ } }
    if (G.online) { G.online = false; G.role = 'host'; G.menuOpen = false; G.localSlot = 0; }
    setChip('');
    netAdvertise();
  }
  // leave the game / room for the lobby panel, with an optional message (방장이 나갔어요, 연결이 끊겼어요, ...)
  function netLeave(msg, why) {
    netClose(why || 'left');
    idleWorld();
    netOpenFriends(msg || '');
  }
  // the world behind the panels: the title's attract demo (no game running)
  function idleWorld() {
    G.gameMode = 'solo'; G.online = false; G.role = 'host'; G.perksOff = false; G.battle = null; G.podium = null; G.words = []; G.menuOpen = false;
    G.localSlot = 0; TRO.run = null; TRO.pod = null; CO.run = null; CO.pod = null;
    setupPlayers([{ char: G.sel, look: myLook(G.sel) }]);
    G.attract = true; G.score = 0; G.lives = SOLO_LIVES; G.stamps = 0; G.loop = 0; G.banner = null; G.bannerQ = []; G.stampT = 0; G.power = null;
    startRound(0);
    G.mode = 'title';
  }
  function netStatusIn(kind, detail) {
    if (!NET.sess) return;
    if (kind === 'closed') { if (detail !== 'left') netLeave(netText(detail === 'host_left' ? 'host_left' : 'lost'), detail === 'host_left' ? 'host_left' : 'lost'); return; }
    NET.status = kind === 'error' ? 'unstable' : '';
    setChip(kind === 'error' ? 'bad' : '');
  }
  function netPeers(list) {
    if (!NET.sess || !Array.isArray(list)) return;
    NET.slots = new Map(list.map((p) => [p.id, p.slot]));
    if (NET.role === 'host') {
      const ids = new Set(list.map((p) => p.id));
      for (const r of NET.roster.slice()) {
        if (ids.has(r.id)) continue;
        NET.roster = NET.roster.filter((q) => q !== r);
        NET.remote.delete(r.id);
        uiSfx('leave');
        if (NET.screen === 'game') hostDropPlayer(r);
      }
      for (const p of list) {
        if (NET.roster.some((r) => r.id === p.id)) continue;
        NET.roster.push({ id: p.id, slot: p.slot, nick: '손님', char: 'duck', ready: false, cup: -1, d: '' }); // (cup -1: not reported yet)
        uiSfx('join');
      }
      NET.roster.sort((a, b) => a.slot - b.slot);
      NET.roomDirty = true;
      netAdvertise();
      if (shownOverlay === 'podium') troPodiumUI(); // (a friend left at the podium: the 한 판 더 gate looks again)
    } else {
      for (const id of Array.from(NET.others.keys())) if (!NET.slots.has(id)) NET.others.delete(id);
    }
    renderRoom();
  }
  // a guest left mid-game: its animal goes away (co-op: no team life lost); a battle needs two players
  function hostDropPlayer(r) {
    const pl = G.players.find((p) => p.id === r.id);
    if (pl) removePlayer(pl.slot);
    if (G.gameMode === 'battle' && G.players.length < 2 && G.mode !== 'podium') endBattle();
  }

  // ================================================================== room screen (host side)
  // (trophies: everyone, the host included, can cover the stake)
  const canStart = () => NET.role === 'host' && NET.roster.length >= 2 && NET.roster.every((r) => r.id === NET.selfId || r.ready) && NET.roster.every(canAfford);
  // R: o[4] the stake; ms (ranked: the series id) or q (practice: why); each seat's trophy count in the room phase only
  // (the game snapshots stay lean; the podium gate uses the host's own r.cup); o[5] 몬스터 출현 (0 = off; appended
  // after the stake so an older guest just ignores it - NET_V stays 4). v4 shop (7.1): a room-phase seat that wears
  // something carries its worn set at index 5 (an older guest ignores it); game-phase seats carry none - looks are
  // frozen at match start, so the snapshots lose no byte to them
  function roomInfo() {
    const room = NET.screen !== 'game', q = room ? troPractice() : NET.q;
    const R = { gid: NET.gid, ph: NET.ph, m: NET.mode === 'battle' ? 'b' : 'c',
      o: [NET.opts.arena, NET.opts.time, NET.opts.perks ? 1 : 0, NET.opts.intrusion ? 1 : 0, stakeNow(), NET.opts.monsters === false ? 0 : 1],
      p: NET.roster.map((r) => {
        const e = [r.slot, r.nick, r.char, r.ready ? 1 : 0];
        if (room) { e.push(r.id === NET.selfId ? (TRO.s ? TRO.s.t : -1) : r.cup); const lk = r.id === NET.selfId ? myLook(r.char) : r.lk || LOOK0; if (lk !== LOOK0) e.push(lk); }
        return e;
      }) };
    // (안 걸고 참여, room phase only: the seats that play the stake without putting it in - shown on every seat card; its
    // presence tells a guest this host has the rule. An older guest ignores it)
    if (room) R.f = NET.roster.filter(troSeatFree).map((r) => r.slot);
    if (q === 0) R.ms = NET.ms; else R.q = q;
    return R;
  }
  function netSetOpts(o) {
    if (NET.sess && NET.role !== 'host') return;
    o = o || {};
    const s0 = stakeNow();
    if ('arena' in o) NET.opts.arena = nInt(o.arena, -1, Math.max(0, ARENAS.length - 1), -1);
    if ('time' in o) NET.opts.time = [2, 3, 5].includes(+o.time) ? +o.time : 3;
    if ('perks' in o) NET.opts.perks = !!o.perks;
    if ('monsters' in o) NET.opts.monsters = o.monsters !== false;
    if ('intrusion' in o) NET.opts.intrusion = !!o.intrusion;
    if ('mode' in o && (!NET.sess || NET.screen === 'room')) NET.mode = o.mode === 'battle' ? 'battle' : 'coop';
    // 트로피 걸기: one of STAKES the host can cover, set in the room (or before hosting) - never mid-game
    if ('bet' in o && (!NET.sess || NET.screen === 'room')) { const b = nInt(o.bet, 0, 99, -1); if (STAKES.includes(b) && (b === 0 || (TRO.s && b <= TRO.s.t))) NET.opts.bet = b; }
    // (consent: ready means ready for that stake - any change of it un-readies every guest; they are told in guestRoom)
    if (stakeNow() !== s0) for (const r of NET.roster) if (r.id !== NET.selfId) r.ready = false;
    NET.roomDirty = true;
    netAdvertise();
    renderFriends(); renderRoom();
  }
  // a guest: ready = ready for the stake shown now (rd carries it and my count; the host re-checks both). Short of it, a
  // guest readies without it where the host has 안 걸고 참여 (NET.hz) - and stays without it for this ready, even if its
  // count rises before 시작! (TRO.free; rd: f, and z = this page has the rule); with an older host it cannot ready
  function netReady(on) {
    if (!NET.sess || NET.role !== 'guest' || NET.screen !== 'room') return false;
    const want = on === undefined ? !NET.ready : !!on;
    if (want && !canAfford({ id: NET.selfId })) { renderRoom(); return false; }
    NET.ready = want;
    TRO.agreed = NET.ready ? stakeNow() : -1;
    TRO.free = NET.ready && stakeNow() > 0 && NET.hz && !troCovers({ id: NET.selfId });
    NET.sess.send(NET.hostId, { t: 'rd', on: NET.ready ? 1 : 0, b: stakeNow(), cu: TRO.s ? TRO.s.t : -1, z: 1, f: TRO.free ? 1 : 0 });
    uiSfx('ready');
    renderRoom();
    return NET.ready;
  }
  function netPick(c) {
    if (!isChar(c)) return false;
    pickChar(c);
    if (NET.sess && NET.screen === 'room') {
      if (NET.role === 'host') { const me = NET.roster.find((r) => r.id === NET.selfId); if (me) me.char = c; NET.roomDirty = true; }
      // (the new animal's set rides with the pick - a host with per-animal sets takes both at once; an older host ignores
      // lk, so the 'eq' that lookSend still sends 300 ms later brings it up to date)
      else { NET.sess.send(NET.hostId, { t: 'pk', c, lk: myLook(c) }); lookSend(); }
    }
    netAdvertise();
    renderRoom(); renderFriends();
    return true;
  }
  // 시작: everyone in the room plays (late joiners are refused from here on: the session is locked)
  function netStart(force) {
    if (!NET.sess || NET.role !== 'host' || NET.screen !== 'room') return false;
    if (!force && !canStart()) return false;
    try { NET.sess.lock(true); } catch (e) { /* ignore */ }
    NET.ph = 'game';
    netAdvertise();
    // (looks: mine from my store, a guest's from its roster entry - shop.md 6.5, 7.1; frozen for the match)
    const list = NET.roster.slice().sort((a, b) => a.slot - b.slot)
      .map((r) => ({ slot: r.slot, char: r.char, nick: r.nick, local: r.id === NET.selfId, id: r.id, look: r.id === NET.selfId ? myLook(r.char) : r.lk }));
    netAgain(() => {
      if (NET.mode === 'battle') newBattle(list, Object.assign({}, NET.opts, { countdown: true }));
      else newCoop(list, 0, true);
    }, true);
    return true;
  }
  // (re)start an online game: a new game id, so every guest rebuilds its view from the first snapshot
  function netAgain(fn, starting) {
    if (!G.online && !starting) { fn(); return; }
    if (G.online && G.role !== 'host') return;
    NET.gid++;
    NET.screen = 'game'; NET.roomDirty = true;
    NET.remote = new Map(); NET.evs = [];
    G.manual = false;
    fn();
    // (trophies: ranked or practice is frozen for this game; its hold comes at "시작!" - troHostGo)
    NET.q = troPractice(); TRO.match = null; TRO.lastRes = null; TRO.pod = null;
    G.online = true; G.role = 'host'; G.localSlot = 0; G.menuOpen = false;
    for (const p of G.players) p.local = p.id === NET.selfId || !p.id;
    NET.rec = true;
    showOverlay(null);
    netSnapshot(true);
  }
  // 방으로: the host brings everyone back to the room screen (guests must get ready again)
  function netToRoom() {
    if (!NET.sess) { toTitle(); return; }
    if (NET.role !== 'host') { netLeave(''); return; }
    // (trophies: stopping a match past 시작! costs the host its hold - its confirm said so; the guests wait, then are
    // refunded. Then a stake the host can no longer cover is lowered)
    if (G.mode !== 'podium') { const mid = NET.ms + '.' + NET.gid; if (TRO.s && TRO.s.esc.some((e) => e.m === mid && e.tab === TRO.tab && e.st === 'open')) troClose(mid, 'forfeit', 'abort'); }
    TRO.match = null; TRO.lastRes = null;
    troLowerStake();
    NET.ph = 'room'; NET.rec = false; NET.screen = 'room';
    for (const r of NET.roster) if (r.id !== NET.selfId) r.ready = false;
    try { NET.sess.lock(false); } catch (e) { /* ignore */ }
    NET.roomDirty = true;
    idleWorld();
    showOverlay('room');
    setMusic('lobby');
    netAdvertise();
    renderRoom();
    netFrame();
  }

  // ================================================================== incoming
  function netStateIn(from, st) {
    if (!NET.sess || !st || typeof st !== 'object' || st.v !== NET_V) return;
    if (NET.role === 'host') hostBodyIn(from, st);
    else if (from === NET.hostId) guestHostIn(st);
    else guestPeerIn(from, st);
  }
  // a body state (guest -> everyone): validated and clamped here, used by the host world and by other guests' views
  function parseBody(st) {
    if (!st || typeof st !== 'object') return null;
    const k = nInt(st.k, 0, 1e12, -1); if (k < 0) return null;
    const bb = Array.isArray(st.bb) ? st.bb.slice(0, 6).map((v) => nInt(v, 0, 1e12, 0)).filter((v) => v > 0) : [];
    return { k, gid: nInt(st.gid, 0, 1e9, 0), ep: nInt(st.ep, -1, 1e9, -1),
      x: nNum(st.x, WALL_L - 4, WALL_R - 12, 120), y: nNum(st.y, PF_TOP - 24, PF_BOT, 100),
      vx: nNum(st.vx, -6, 6, 0), vy: nNum(st.vy, -8, 8, 0), f: st.f < 0 ? -1 : 1, fl: nInt(st.fl, 0, 1023, 0), sh: nInt(st.sh, 0, 600, 0), bb,
      ny: nInt(st.ny, 0, 1e9, 0), rt: nInt(st.rt, 0, 1e12, 0), lc: st.lc === 1 ? 1 : 0, // (lc: it claims its own catches)
      dp: nInt(st.dp, 0, 1e9, 0) }; // (dp: its 내려가기 count - only a rise shows, as dust; an older guest never sends it: 0)
  }
  function hostBodyIn(from, st) {
    const r = NET.roster.find((q) => q.id === from); if (!r || from === NET.selfId) return;
    const s = parseBody(st); if (!s || s.gid !== NET.gid) return;
    let rem = NET.remote.get(from);
    if (!rem) { rem = { st: null, buf: mkBuf(), shots: [], mash: [], ny: s.ny, dp: s.dp, rv: 0 }; NET.remote.set(from, rem); }
    if (!bufPush(rem.buf, s.k, s)) return;
    rem.st = s;
    // (bit A also stamps mvAAt as it ARRIVES: hostInputs applies only the latest state each frame, so after a stall the
    // states of a whole wind-up + slam can land in one frame together with the first recovery one - hostQuake must still
    // see that A was there)
    if ((s.fl & 256) && !G.perksOff) { const pl = G.players.find((p) => p.id === from); if (pl && s.ep === pl.ep) pl.mvAAt = G.frame; }
    if (s.ny > rem.ny) {
      rem.ny = s.ny;
      const pl = G.players.find((p) => p.id === from);
      if (pl && G.mode === 'playing') { const rec = NET.rec; NET.rec = false; wordPop(pl.x + 8, pl.y - 2, '냥!', pl.color); NET.rec = rec; }
    }
    // (its 내려가기: dust here where that state has it - its position moved it already; the other guests see it from
    // the peer stream. One puff per state at most, only a living body in play)
    if (s.dp > rem.dp) {
      rem.dp = s.dp;
      const pl = G.players.find((p) => p.id === from);
      if (pl && s.ep === pl.ep && free(pl) && G.mode === 'playing') { dropDust(s.x + 8, PF_TOP + Math.floor((s.y + 16 - PF_TOP) / TS) * TS); NET.dropSeen = (NET.dropSeen | 0) + 1; }
    }
  }
  function guestPeerIn(from, st) {
    const s = parseBody(st); if (!s || s.gid !== NET.gid || !NET.slots.has(from)) return;
    let o = NET.others.get(from);
    if (!o) { o = { buf: mkBuf(), ny: s.ny, dp: s.dp }; NET.others.set(from, o); }
    bufPush(o.buf, s.k, s);
  }
  function guestHostIn(st) {
    if (st.R && typeof st.R === 'object') guestRoom(st.R);
    if (!NET.sess) return;
    const g = st.g;
    if (!g || typeof g !== 'object' || NET.hostPh !== 'game') return;
    const id = nInt(g.id, 0, 1e9, 0);
    if (!id) return;
    if (id !== NET.gid || NET.screen !== 'game') { if (id < NET.gid || !guestBegin(g, id)) return; }
    const k = nInt(g.k, 0, 1e12, -1);
    if (k < 0 || !bufPush(NET.buf, k, g)) return;
    // (trophies, on this network event - a hidden tab too: a ranked battle's first 'p' is "시작!" for me, its podium
    // without a result for me starts the 15 s wait)
    if (g.m === 'b' && NET.q === 0 && NET.ms) { if (g.ph === 'p') troGuestGo(id); else if (g.ph === 'd') troWait(NET.ms + '.' + id); }
    // (비누 코인, on the same event: co-op - the 탕 indexes the team passed; battle - its first 'p' is my 시작!, every 'p'
    // carries the clock, its first 'd' is my podium)
    if (g.m !== 'b') coinGuestIdx(nInt(g.lp, 0, 99, 0) * LEVELS.length + nInt(g.r, 0, 99, 0), g);
    else if (g.ph === 'p') {
      if (CO.goId !== id) { CO.goId = id; const sl = new Set(); for (const r of Array.isArray(g.P) ? g.P.slice(0, MAX_PLAYERS) : []) if (Array.isArray(r)) { const s = nInt(r[0], -1, MAX_PLAYERS - 1, -1); if (s >= 0) sl.add(s); } coinGo(sl.size || G.players.length); }
      CO.tl = nInt(g.tl, 0, 1e7, 0);
    }
    else if (g.ph === 'd') coinGuestPod(g);
    // sound / pop-up / word / shake events ride along for ~0.75 s: queue the new ones (ids only grow)
    if (Array.isArray(g.V)) {
      for (const ev of g.V) {
        if (!Array.isArray(ev) || ev.length < 4) continue;
        const eid = nInt(ev[0], 0, 1e12, 0);
        if (eid <= NET.evSeen) continue;
        NET.evSeen = eid;
        NET.evQ.push(ev);
      }
      if (NET.evQ.length > 96) NET.evQ.splice(0, NET.evQ.length - 96);
    }
  }
  function guestRoom(R) {
    const roster = [];
    for (const e of Array.isArray(R.p) ? R.p.slice(0, MAX_PLAYERS) : []) {
      if (!Array.isArray(e)) continue;
      const slot = nInt(e[0], -1, MAX_PLAYERS - 1, -1);
      if (slot < 0 || roster.some((q) => q.slot === slot)) continue;
      let id = null; for (const [pid, s] of NET.slots) if (s === slot) id = pid;
      // (cup: that seat's trophy count, room phase only; -1 = unknown, shown as "?". lk: its worn set, room phase only -
      // index 5 when it wears something; a game-phase seat (4 long) keeps the room's look, as it keeps the count)
      const lk = e.length > 5 ? lookParse(e[5]) : e.length > 4 ? LOOK0 : ((NET.roster.find((x) => x.slot === slot) || {}).lk || LOOK0);
      roster.push({ slot, id, nick: cleanNick(e[1]) || '손님', char: isChar(e[2]) ? e[2] : 'duck', ready: !!e[3], cup: e.length > 4 ? nInt(e[4], -1, TRO_MAX, -1) : -1, lk });
    }
    roster.sort((a, b) => a.slot - b.slot);
    // still in the host's game? (net.js tells a dropped guest; this is the safety net: ~2.5 s out -> 연결이 끊겼어요)
    const mine = NET.slots.get(NET.selfId);
    if (notInGame('outR', mine === undefined || !roster.some((q) => q.slot === mine))) return;
    if (NET.screen === 'room' && NET.roster.length && roster.length !== NET.roster.length) uiSfx(roster.length > NET.roster.length ? 'join' : 'leave');
    // (in the game phase R carries no counts: keep the room's last ones for the seats)
    if (!roster.some((q) => q.cup >= 0)) for (const q of roster) { const o = NET.roster.find((x) => x.slot === q.slot); if (o) q.cup = o.cup; }
    // (안 걸고 참여: R.f, room phase only - the seats that play without the stake; it says the host has the rule, NET.hz.
    // The game phase keeps the room's marks. Junk entries simply match no seat)
    if (Array.isArray(R.f)) { NET.hz = true; const f = new Set(R.f.slice(0, MAX_PLAYERS).map((x) => nInt(x, -1, MAX_PLAYERS - 1, -1))); for (const q of roster) q.f = f.has(q.slot); }
    else for (const q of roster) { const o = NET.roster.find((x) => x.slot === q.slot); q.f = !!(o && o.f); }
    NET.roster = roster;
    NET.mode = R.m === 'b' ? 'battle' : 'coop';
    // (o[5] 몬스터 출현: only an explicit 0 is off - missing (an older host), junk or 1 all mean on, as an older host plays)
    if (Array.isArray(R.o)) NET.opts = { arena: nInt(R.o[0], -1, 9, -1), time: [2, 3, 5].includes(R.o[1]) ? R.o[1] : 3, perks: R.o[2] !== 0, monsters: R.o[5] !== 0, intrusion: R.o[3] !== 0, bet: STAKES.includes(R.o[4]) ? R.o[4] : 0 };
    // ranked (a valid series id) or practice (anything else: an old page fails safe)
    NET.q = typeof R.ms === 'string' && ID6_RE.test(R.ms) ? 0 : nInt(R.q, 1, 2, 1);
    NET.ms = NET.q === 0 ? R.ms : '';
    // consent: ready was for the stake I agreed to; the host changed it -> not ready any more, and told so for 4 s
    if (NET.screen === 'room' && NET.ready && stakeNow() !== TRO.agreed) {
      NET.ready = false; TRO.agreed = -1; TRO.free = false;
      troMsgSet('걸기가 바뀌었어요: ' + troStakeTxt(stakeNow()) + ' · 다시 준비해 주세요');
    }
    const was = NET.hostPh;
    NET.hostPh = R.ph === 'game' ? 'game' : 'room';
    if (NET.hostPh === 'room' && (NET.screen === 'game' || was === 'game')) guestToRoom();
    renderRoom();
  }
  // a guest the host's room / world no longer lists for ~2.5 s leaves with 연결이 끊겼어요 (true = it left)
  function notInGame(key, out) {
    if (!out) { NET[key] = 0; return false; }
    const t = nowTicks();
    if (!NET[key]) { NET[key] = t; return false; }
    if (t - NET[key] < 150) return false;
    netLeave(netText('lost'), 'lost');
    return true;
  }
  // the animal my room seat plays (the host's word: my roster entry), else my pick
  function seatChar() {
    if (NET.sess && NET.roster.length) {
      const me = NET.role === 'host' ? NET.roster.find((r) => r.id === NET.selfId) : NET.roster.find((r) => r.slot === NET.slots.get(NET.selfId));
      if (me && isChar(me.char)) return me.char;
    }
    return G.sel;
  }
  function guestToRoom() {
    if (NET.screen === 'room' && !G.online) return;
    // (trophies: a match that ended without a result for me waits 15 s for it, then is refunded; ready again for a stake)
    if (TRO.s) for (const e of TRO.s.esc.slice()) if (e.tab === TRO.tab && e.st === 'open') troWait(e.m);
    TRO.agreed = -1; TRO.free = false;
    NET.screen = 'room'; NET.ready = false; NET.buf = mkBuf(); NET.evQ = []; NET.pred = [];
    idleWorld();
    showOverlay('room');
    setMusic('lobby');
    renderRoom();
    // (looks-per-animal.md 5.1: a pick that raced 시작 was never taken by the host - say it again, with its set, so seat,
    // animal and set agree again)
    if (NET.sess && NET.role === 'guest' && isChar(G.sel) && G.sel !== seatChar()) NET.sess.send(NET.hostId, { t: 'pk', c: G.sel, lk: myLook(G.sel) });
    lookSend();                     // (v4 shop: a worn set changed during the match - another tab's purchase - goes now)
  }
  function netMsgIn(from, m) {
    if (!NET.sess || !m || typeof m !== 'object' || typeof m.t !== 'string') return;
    // (guests take everything from the host's state - but for the trophy result, a reliable message from the host)
    if (NET.role !== 'host') { if (m.t === 'tro' && from === NET.hostId) troResultIn(m); return; }
    const r = NET.roster.find((q) => q.id === from); if (!r) return;
    const pl = NET.screen === 'game' ? G.players.find((p) => p.id === from) : null;
    switch (m.t) {
      // (trophies: cu = the guest's count - display, the stake gates, 견습; d = its device in this room - same-device check)
      // (lk: its worn set - self-reported cosmetics: only catalog ids survive lookParse, ownership cannot be checked; shop.md 7.1)
      // (z: the page has 안 걸고 참여 - an older one sends none and must cover a stake to ready, as before)
      case 'hi': r.nick = cleanNick(m.n) || r.nick; if (isChar(m.c) && NET.screen === 'room') r.char = m.c;
        r.cup = nInt(m.cu, -1, TRO_MAX, -1); r.d = typeof m.d === 'string' && ID6_RE.test(m.d) ? m.d : ''; r.lk = lookParse(m.lk); r.z = m.z === 1; break;
      case 'nk': r.nick = cleanNick(m.n) || r.nick; if (pl) pl.nick = r.nick; break;
      // (lk: the new animal's set - a junk one is bare (lookParse); absent: unchanged, an older guest's one set fits every animal)
      case 'pk': if (isChar(m.c) && NET.screen === 'room') { r.char = m.c; if ('lk' in m) r.lk = lookParse(m.lk); } break;
      // (a worn set changed in the room - the hub opened from it; in the game phase looks are frozen: ignored)
      case 'eq': if (NET.screen !== 'room') return; r.lk = lookParse(m.lk); break;
      // ready only for the stake shown now (b: the stake the guest saw), and only if it can cover it - or plays without it
      // (안 걸고 참여: z, a page with the rule; f, it readied without the stake)
      case 'rd': if (NET.screen === 'room') { r.cup = nInt(m.cu, -1, TRO_MAX, r.cup); r.z = m.z === 1;
        r.ready = !!m.on && nInt(m.b, 0, 99, 0) === stakeNow() && canAfford(r); r.free = r.ready && r.z && m.f === 1; } break;
      // a guest's count after a result / a hold closed (m: for that match - the 한 판 더 gate)
      case 'cup': r.cup = nInt(m.cu, -1, TRO_MAX, r.cup); if (typeof m.m === 'string' && MID_RE.test(m.m)) r.cupM = m.m;
        if (NET.screen === 'room' && !canAfford(r)) r.ready = false;
        if (shownOverlay === 'podium') troPodiumUI();
        break;
      // "if I am gone at the end, I left on purpose" (only a non-finisher's counts: its stake goes to the winner)
      case 'gg': { const M = TRO.match; if (M && m.m === M.mid) { if (m.on) M.gg.add(r.slot); else M.gg.delete(r.slot); } return; }
      // (안 걸고 참여) what the guest put in at its 시작! (s: the stake, or 0 - it played without it): only a stake put in
      // goes into the pot. Its own stake only, either way (its row then tells it whether to pay)
      case 'st': { const M = TRO.match; if (M && m.m === M.mid && M.slots.includes(r.slot)) M.st[r.slot] = M.s > 0 && m.s === M.s ? 1 : 0; return; }
      case 'shot': if (pl) hostShot(pl, m); return;
      case 'tp': if (pl) hostClaim(pl, m); return; // (v4 battle: a guest's own catch to check; an older host ignores it)
      case 'die': if (pl) hostDie(pl, m); return;
      case 'hit': if (pl) hostHit(pl, m); return;
      case 'mash': if (pl) hostMash(pl); return;
      case 'rv': if (pl) hostRevive(pl, m); return;
      case 'qk': if (pl) hostQuake(pl, m); return;
      default: return;
    }
    NET.roomDirty = true;
    netAdvertise();
    renderRoom();
  }

  // ================================================================== host: the world with remote players in it
  // before each world frame: remote animals take their latest reported spot (if it is theirs to move)
  function hostInputs(ins) {
    for (const pl of G.players) {
      if (pl.local) continue;
      const rem = NET.remote.get(pl.id), st = rem && rem.st;
      let inp = NO_INPUT;
      if (st && st.ep === pl.ep && free(pl) && G.mode === 'playing') {
        pl.x = st.x; pl.y = st.y; pl.vx = st.vx; pl.vy = st.vy; pl.facing = st.f;
        pl.onGround = !!(st.fl & 1); pl.water = st.fl & 2 ? 1 : st.fl & 4 ? 2 : 0;
        if (st.fl & 8) pl.shootAnim = Math.max(pl.shootAnim, 2);
        // a fresh hot-water shield (a rising sh) counts only for a capy with perks on, reported in hot water, at most
        // 180 f, at most once per shield + cooldown (minus a little jitter); anything else is a shield already gone
        if (st.sh > (pl.shieldWas | 0)) {
          if (pl.char === 'capy' && !G.perksOff && (st.fl & 2) && st.sh <= CAPY_SHIELD && G.frame - (pl.shAt ?? -1e9) >= CAPY_SHIELD + CAPY_SHIELD_CD - 12) { pl.shAt = G.frame; pl.shieldGone = false; }
          else pl.shieldGone = true;
        }
        pl.shieldWas = st.sh;
        pl.shield = pl.shieldGone ? 0 : st.sh;
        pl.walkT += Math.abs(st.vx);
        pl.bb = st.bb;
        // (what it reports riding is ridden here too, wherever the host's copy of the bubble is now: capEmpties)
        if (pl.bb && pl.bb.length) for (const b of G.bubbles) if (pl.bb.indexOf(b.id) >= 0) b.rideF = G.frame;
        // body bits A / B (its move's pose; never with 능력 끄기); mvAAt: when A was last seen (hostQuake)
        pl.mvA = !G.perksOff && !!(st.fl & 256); pl.mvB = !G.perksOff && !!(st.fl & 512);
        if (pl.mvA) pl.mvAAt = G.frame;
        // (a slamming capy holding JUMP is not bouncing: it pops what it lands on, as on its own screen)
        if ((st.fl & 16) && !(pl.char === 'capy' && pl.mvA)) inp = { left: false, right: false, jump: true, shoot: false, jumpP: false, shootP: false };
      } else { pl.bb = null; pl.mvA = false; pl.mvB = false; }
      ins[pl.slot] = inp;
    }
  }
  function hostShot(pl, m) {
    if (G.mode !== 'playing' || !free(pl) || pl.stunT > 0 || nInt(m.ep, -1, 1e9, -1) !== pl.ep) return;
    const rem = NET.remote.get(pl.id); if (!rem) return;
    const t = G.frame;
    rem.shots = rem.shots.filter((f) => t - f < 24);
    if (rem.shots.length >= 3) return; // (a frog fires every 10 frames: 3 in 24 is plenty)
    if (!ammoTake(pl, AMMO_SLACK)) { NET.amNo = (NET.amNo | 0) + 1; return; } // (AMMO: nothing left - its copy gives up)
    rem.shots.push(t);
    let x = nNum(m.x, WALL_L - 4, WALL_R - 12, pl.x), y = nNum(m.y, PF_TOP - 16, PF_BOT, pl.y);
    if (Math.abs(x - pl.x) > 32 || Math.abs(y - pl.y) > 32) { x = pl.x; y = pl.y; }
    const sx = pl.x, sy = pl.y;
    pl.x = x; pl.y = y; pl.facing = m.f < 0 ? -1 : 1;
    // (a:1 - the guest's cat was airborne: the base bubble; the host's onGround for it may be a frame stale. Only a kit
    // with an air shot reads it)
    const b = fire(pl, m.a === 1);
    pl.x = sx; pl.y = sy;
    if (b) b.sid = nInt(m.n, 0, 1e9, 0);
  }
  function hostDie(pl, m) {
    if (G.gameMode !== 'coop' || G.mode !== 'playing' || nInt(m.ep, -1, 1e9, -1) !== pl.ep || !alive(pl) || pl.trap) return;
    const x = nNum(m.x, WALL_L - 4, WALL_R - 12, pl.x), y = nNum(m.y, PF_TOP - 16, PF_BOT, pl.y);
    if (Math.abs(x - pl.x) < 48 && Math.abs(y - pl.y) < 48) { pl.x = x; pl.y = y; }
    NET.who = pl.slot; coopDie(pl); NET.who = -1;
  }
  function hostHit(pl, m) {
    if (G.gameMode !== 'battle' || G.mode !== 'playing' || nInt(m.ep, -1, 1e9, -1) !== pl.ep || !free(pl) || pl.stunT > 0) return;
    NET.who = pl.slot; stunPlayer(pl); NET.who = -1;
  }
  function hostMash(pl) {
    if (!pl.trap || G.mode !== 'playing') return;
    const rem = NET.remote.get(pl.id), t = G.frame;
    if (rem) { rem.mash = rem.mash.filter((f) => t - f < 60); if (rem.mash.length >= 20) return; rem.mash.push(t); }
    mashTrap(pl);
  }
  // a guest's capy landed a slam (털썩): the quake, if the host's own picture of that capy agrees - a capy with perks on,
  // free, not stunned, this epoch, near where the host has it, slamming (bit A) within the last 30 f, not again within 40 f
  function hostQuake(pl, m) {
    if (G.mode !== 'playing' || pl.char !== 'capy' || G.perksOff || !free(pl) || pl.stunT > 0 || nInt(m.ep, -1, 1e9, -1) !== pl.ep) return false;
    const x = nNum(m.x, WALL_L - 4, WALL_R - 12, NaN), y = nNum(m.y, PF_TOP - 24, PF_BOT, NaN);
    // (the host-known body = the latest state received from it: hostInputs copies that onto pl only at the next frame,
    // and after a stall the states of the whole slam arrive together just before this qk - pl is still at the apex)
    const rem = NET.remote.get(pl.id), st = rem && rem.st && rem.st.ep === pl.ep ? rem.st : null;
    if (!(Math.abs(x - (st ? st.x : pl.x)) <= 24 && Math.abs(y - (st ? st.y : pl.y)) <= 24)) return false;
    if (!(G.frame - pl.mvAAt <= 30) || G.frame - (pl.qkAt ?? -1e9) < KIT.capy.slam.rate) return false;
    pl.qkAt = G.frame;
    NET.who = pl.slot; quake(pl, x, y); NET.who = -1;
    return true;
  }
  // a guest touched a ghost in its view: revive it if the host's ghost is still that one and close enough
  function hostRevive(pl, m) {
    if (G.gameMode !== 'coop' || G.mode !== 'playing' || !canTouch(pl)) return;
    const g = G.players.find((q) => q.slot === nInt(m.s, -1, 3, -1));
    if (!g || g === pl || !g.ghost || g.ep !== nInt(m.e, -1, 1e9, -1)) return;
    if (Math.abs(g.x - pl.x) > 30 || Math.abs(g.y - pl.y) > 30) return;
    revive(g, pl);
  }
  // display: other players drawn from their interpolated body streams (the world keeps their latest spot)
  function hostDisplayIn() {
    const saved = [];
    for (const pl of G.players) {
      if (pl.local || !free(pl) || G.mode !== 'playing') continue;
      const rem = NET.remote.get(pl.id); if (!rem) continue;
      const s = bufSample(rem.buf, bufTick(rem.buf, PEER_DELAY)); if (!s) continue;
      const a = s.a.d, b = s.b && s.b.d.ep === a.ep ? s.b.d : null;
      if (a.ep !== pl.ep) continue;
      saved.push([pl, pl.x, pl.y, pl.vx, pl.vy, pl.onGround, pl.facing, pl.water, pl.mvA, pl.mvB]);
      pl.x = lx(a.x, b && b.x, s.t); pl.y = ly(a.y, b && b.y, s.t); pl.vx = a.vx; pl.vy = a.vy;
      pl.onGround = !!(a.fl & 1); pl.facing = a.f; pl.water = a.fl & 2 ? 1 : a.fl & 4 ? 2 : 0;
      pl.mvA = !G.perksOff && !!(a.fl & 256); pl.mvB = !G.perksOff && !!(a.fl & 512);
    }
    return saved;
  }
  function hostDisplayOut(saved) {
    for (const [pl, x, y, vx, vy, g, f, w, ma, mb] of saved) { pl.x = x; pl.y = y; pl.vx = vx; pl.vy = vy; pl.onGround = g; pl.facing = f; pl.water = w; pl.mvA = ma; pl.mvB = mb; }
  }

  // ---- events (sfx / pop-ups / word pops / shakes) for the guests: [id, tick, who, type, ...]
  function netEv(type, a, b, c, d, e, f) {
    const ev = [++NET.evId, G.frame, NET.who, type];
    if (type === 's') ev.push(a, b);
    else if (type === 'p') ev.push(a, b, c, d, e, f);
    else if (type === 'i') ev.push(a, b, c);
    else if (type === 'w') ev.push(a, b, c, d);
    else if (type === 'k') ev.push(a);
    else if (type === 'd') ev.push(a, b); // (a host-side 내려가기's dust: x, platform top y - an older guest skips the type)
    NET.evs.push(ev);
    if (NET.evs.length > 80) NET.evs.splice(0, NET.evs.length - 80);
  }

  // ---- the snapshot: compact arrays (positions as integers, players to 0.1 px)
  function snapPlayers() {
    return G.players.map((p) => {
      let fl = 0;
      if (p.onGround) fl |= 1;
      if (p.water === 1) fl |= 2; else if (p.water === 2) fl |= 4;
      if (p.dead) fl |= 8;
      if (p.out) fl |= 16;
      if (p.shootAnim > 0) fl |= 32;
      if (free(p)) fl |= 64;
      if (p.mvA) fl |= 128;   // (v4 move pose bits: see updatePlayer / hostInputs)
      if (p.mvB) fl |= 256;
      return [p.slot, p.ep | 0, r1(p.x), r1(p.y), Math.round(p.vx * 10), Math.round(p.vy * 10), p.facing < 0 ? -1 : 1, fl,
        p.score | 0, p.kills | 0, p.revives | 0, p.kos | 0, p.koed | 0, p.invuln | 0, p.stunT | 0, p.shield | 0,
        p.power ? POWER_TYPES.indexOf(p.power.type) : -1, p.power ? p.power.t | 0 : 0,
        p.ghost ? p.ghost.t | 0 : -1, p.trap ? Math.round(p.trap.prog) : -1, p.trap && p.trap.b ? p.trap.b.id : 0, p.koT | 0, p.dieT | 0, p.rank | 0].concat(ammoRow(p));
    });
  }
  const R0 = Math.round;
  function snapEnemies() {
    return G.enemies.map((e) => {
      let fl = 0;
      if (e.angry) fl |= 1;
      if (e.soakT > 0) fl |= 2;
      if (e.chargeT > 0) fl |= 4;
      if (e.windT > 0) fl |= 8;
      if (e.grace > 0) fl |= 16;
      if (e.onGround) fl |= 32;
      if (e.type === 'mold' && e.hopT < 8) fl |= 64;
      return [e.id, ENEMY_TYPES.indexOf(e.type), E_STATES.indexOf(e.state), R0(e.x), R0(e.y), e.dir < 0 ? -1 : 1, fl, e.state === 'dead' ? e.deadT | 0 : 0];
    });
  }
  function snapBubbles(cap) {
    let list = G.bubbles.filter((b) => !b.dead);
    if (cap && list.length > cap) {
      // too many: keep everything that is not a plain floating empty bubble, then the newest empties
      const keep = list.filter((b) => !(b.kind === 'empty' && b.state === 'float'));
      const emp = list.filter((b) => b.kind === 'empty' && b.state === 'float').slice(-Math.max(0, cap - keep.length));
      list = keep.concat(emp);
    }
    return list.map((b) => {
      let fl = 0, ex = -1;
      if (b.soaked) fl |= 1;
      if (b.kind === 'trapped') { if (b.trapMax - b.trapT < FLASH) fl |= 2; ex = b.enemy ? ENEMY_TYPES.indexOf(b.enemy.type) : 0; }
      else if (b.kind === 'player') ex = b.victim ? b.victim.slot : -1;
      if (b.big) fl |= 4;
      if (b.squish > 0) fl |= 8;
      if (b.drop) fl |= 16;          // (v4: an otter's droplet)
      if (b.ty === 'yarn') fl |= 32; // (v4: the cat's rolling yarn)
      const row = [b.id, U_KINDS.indexOf(b.kind), U_STATES.indexOf(b.state), R0(b.x), R0(b.y), b.owner, ex, fl, b.state === 'pop' ? b.popT : Math.min(b.age, 1999)];
      if (b.sid && b.age < 120) row.push(b.sid);
      return row;
    });
  }
  function snapHazards(cap) {
    const list = cap ? G.hazards.slice(0, cap) : G.hazards;
    return list.filter((h) => !h.dead).map((h) => {
      const k = H_KINDS.indexOf(h.kind);
      let a = 0, b = 0, y = h.y;
      if (h.kind === 'wave') a = h.vx < 0 ? -1 : 1;
      else if (h.kind === 'spore') { a = h.state === 'land' ? 1 : 0; b = h.hatch | 0; }
      else if (h.kind === 'sweep') { a = h.state === 'go' ? 1 : 0; b = h.dir; y = h.sy; }
      return [h.id | 0, k, R0(h.x), R0(y), Math.min(h.t, 9999), a, b];
    });
  }
  function snapBoss() {
    const b = G.boss; if (!b) return 0;
    return [BOSS_TYPES.indexOf(b.type), B_STATES.indexOf(b.state), r1(b.x), r1(b.y), R0(b.vx * 100), R0(b.vy * 100), b.face < 0 ? -1 : 1,
      b.hp, b.soap, b.soapMax, b.phase, Math.max(0, B_ACTS.indexOf(b.act)), b.actT | 0, Math.min(b.t, 99999), (b.onGround ? 1 : 0) | (b.intruder ? 2 : 0),
      R0(b.sq * 100), b.hitFlash | 0, b.giant ? R0(b.giant.x) : -999, b.giant ? R0(b.giant.y) : -999, b.stunT | 0, R0(b.tx || 0), R0(b.ty || 0),
      b.dropRow === undefined ? -1 : b.dropRow, R0(b.sx), R0(b.sy)];
  }
  function snapOf(level) {
    const g = { k: G.frame, id: NET.gid, m: G.gameMode === 'battle' ? 'b' : 'c', ph: PH_CODE[G.mode] || 'p',
      r: G.gameMode === 'battle' ? G.arena | 0 : G.round, lp: G.loop, L: G.lives, S: G.score, st: G.stamps };
    if (G.hurry) g.hu = 1;
    // the floating-empty life this world runs (EMPTY_RULE): a guest blinks the bubbles at it, not at its own rule (an
    // older host sends none - it runs EMPTY_LIFE, which is what a guest then takes)
    const el = emptyRule()[0]; if (el !== EMPTY_LIFE) g.el = el;
    if (G.gameMode === 'battle') { g.lc = 1; if (!AMMO_OFF) g.am = 1; } // (battle: send me your catches - see hostClaim; no g.sc any more: see SHOT_CAP; am: AMMO)
    if (G.stampFlash > 0) g.sf = G.stampFlash;
    if (G.ticketFlash > 0) g.tf = G.ticketFlash;
    const mu = MUSICS.indexOf(G.music); if (mu > 0) g.mu = mu;
    if (G.battle) g.tl = G.battle.left;
    if (G.mode === 'transition') g.tr = [G.transT, G.trans ? G.trans.next : 0];
    if (G.mode === 'podium' && G.podium) { g.pd = G.podium.order.slice(); g.pt = G.podium.t; if (G.gameMode === 'battle') g.te = G.podium.te | 0; }
    const bn = G.banner;
    if (bn && G.frame < bn.end) g.bn = [bn.id, bn.main, bn.sub, bn.end - G.frame, bn.cls];
    g.P = snapPlayers();
    g.E = snapEnemies();
    g.U = snapBubbles(level >= 2 ? 18 : 0);
    if (G.items.length) g.I = G.items.slice(0, level >= 2 ? 8 : 24).map((it) => [it.id | 0, ITEM_TYPES.indexOf(it.type), R0(it.x), R0(it.y), (it.floating ? 1 : 0) | (it.onGround ? 2 : 0), Math.min(it.age, 999)]);
    const k = G.pickup;
    if (k) g.K = [POWER_TYPES.indexOf(k.type), R0(k.x), R0(k.y), k.onGround ? 1 : 0, k.land | 0, Math.min(k.age, 9999)];
    if (G.boss) g.B = snapBoss();
    if (G.hazards.length) g.H = snapHazards(level >= 2 ? 20 : 0);
    if (G.drops.length) g.D = G.drops.filter((d) => !d.dead).map((d) => [d.id | 0, R0(d.x), R0(d.y), d.state === 'fall' ? 1 : 0, Math.min(d.t, 999)]);
    if (G.ice.length) g.C = G.ice.filter((i) => !i.dead).map((i) => [i.id | 0, i.col, i.rs, Math.min(i.t, 999), i.enemy ? ENEMY_TYPES.indexOf(i.enemy.type) : -1, i.enemy && i.enemy.dir < 0 ? -1 : 1]);
    if (G.bolts.length && level < 1) g.O = G.bolts.map((o) => [o.id | 0, R0(o.x), R0(o.y), o.dir, o.t]);
    const since = G.frame - EV_KEEP;
    let evs = NET.evs.filter((e) => e[1] >= since);
    evs = evs.slice(-(level >= 1 ? 10 : EV_MAX));
    if (level >= 3) evs = evs.filter((e) => e[3] === 's').slice(-6);
    if (evs.length) g.V = evs;
    return g;
  }
  // every 3rd frame (and right at a start): R (the room) + g (the world). Over the byte budget, cosmetic things go
  // first (bolts, older events), then long lists get capped.
  function netSnapshot(force) {
    if (!NET.sess || NET.role !== 'host' || NET.screen !== 'game' || !G.online) return;
    if (!force && G.frame % SNAP_EVERY) return;
    if (NET.roomDirty || !NET.R) { NET.R = roomInfo(); NET.roomDirty = false; }
    let st = null, json = '', bytes = 0;
    for (let level = 0; level <= 3; level++) {
      st = { v: NET_V, R: NET.R, g: snapOf(level) };
      json = JSON.stringify(st);
      bytes = utf8Len(json);
      if (bytes <= SNAP_LIMIT) break;
      NET.snapTrim++;
    }
    NET.snapN++; NET.snapBytes = bytes; if (bytes > NET.snapMax) NET.snapMax = bytes;
    if (!NET.sess.setState(st)) NET.snapFail++;
  }
  function netFrame() {
    if (!NET.sess) return;
    if (NET.role === 'host') {
      if (NET.screen === 'game' && G.online) {
        netSnapshot(false);
        if (NET.trace) {
          NET.trace.push({ k: G.frame, E: G.enemies.map((e) => [e.id, e.x, e.y, e.state]), U: G.bubbles.map((b) => [b.id, b.x, b.y, b.kind, b.state, b.sid | 0, b.age, b.owner]), P: G.players.map((p) => [p.slot, p.x, p.y]) });
          if (NET.trace.length > 600) NET.trace.shift();
        }
      } else if (NET.roomDirty || G.frame - NET.roomAt >= 30) {
        NET.roomDirty = false; NET.roomAt = G.frame; NET.R = roomInfo();
        NET.sess.setState({ v: NET_V, R: NET.R });
      }
    }
  }

  // ================================================================== guest: the view of the host's world
  function newView() { return { E: new Map(), U: new Map(), I: new Map(), H: new Map(), D: new Map(), C: new Map(), O: new Map(), iceKey: '' }; }
  function myPlayer() { return G.players.find((p) => p.slot === G.localSlot) || null; }
  function guestBegin(g, id) {
    const mine = NET.slots.get(NET.selfId);
    if (mine === undefined || !NET.roster.length) return false;
    NET.gid = id; NET.screen = 'game'; NET.buf = mkBuf(); NET.evQ = []; NET.view = newView(); NET.pred = []; NET.bounces = [];
    NET.rvSent = {}; NET.ctl = 'remote'; NET.viewIdx = -1; NET.bnId = 0; NET.mash = []; NET.sidSeen = new Map();
    const list = NET.roster.map((r) => ({ slot: r.slot, char: r.char, nick: r.nick, local: r.slot === mine, id: r.id, look: r.lk })); // (the room's looks: shop.md 6.5)
    G.opts = { arena: NET.opts.arena, time: NET.opts.time, perks: NET.opts.perks, monsters: NET.opts.monsters !== false, intrusion: NET.opts.intrusion };
    G.manual = false;
    resetGame(g.m === 'b' ? 'battle' : 'coop', list);
    G.online = true; G.role = 'guest'; G.localSlot = mine; G.menuOpen = false;
    for (const p of G.players) { p.ep = -1; p.local = p.slot === mine; }
    G.banner = null; G.pops = []; G.parts = []; G.kfx = []; G.words = []; G.foam = [];
    G.mode = PH_NAME[g.ph] || 'playing';
    loadView(nInt(g.r, 0, 99, 0), g.m === 'b');
    // (trophies: a hold of mine for an earlier match waits for its late result, then is refunded; co-op starts a
    // 목욕 보너스 run at this snapshot's round)
    if (TRO.s) for (const e of TRO.s.esc.slice()) if (e.tab === TRO.tab && e.st === 'open' && e.m !== NET.ms + '.' + id) troWait(e.m);
    TRO.pod = null;
    TRO.run = g.m === 'b' ? null : { at: nInt(g.lp, 0, 99, 0) * LEVELS.length + nInt(g.r, 0, 99, 0), got: 0 };
    coinRunStart(); CO.gi = -1; CO.goId = -1; CO.tl = 0; // (비누 코인: this game's run - its first index comes with this snapshot)
    showOverlay(null);
    return true;
  }
  function loadView(idx, arena) {
    if (!LEVELS.length) loadLevels();
    const list = arena ? ARENAS : LEVELS;
    idx = clamp(idx | 0, 0, list.length - 1);
    LV = list[idx]; MAP = LV.map; G.rid++;
    buildWater(MAP);
    roundCanvas = buildRoundCanvas(LV);
    G.gather = { x: LV.gather.col * TS + 4, y: PF_TOP + LV.gather.row * TS + 4 };
    if (arena) { G.arena = idx; G.round = 0; } else G.round = idx;
    NET.viewIdx = idx; NET.viewArena = !!arena;
    NET.view = newView();
    G.enemies = []; G.bubbles = []; G.items = []; G.bolts = []; G.drops = []; G.ice = []; G.hazards = []; G.pickup = null; G.boss = null;
    ICE_TOP.fill(0);
  }
  function guestUpdate(ins) {
    G.frame++;
    if (G.shake > 0) { G.shake *= 0.86; if (G.shake < 0.3) G.shake = 0; }
    if (NET.screen === 'game' && NET.buf && NET.sess) {
      if (G.frame % 30 === 0 || !NET.predLife) {
        let rtt = null; try { rtt = NET.sess.stats().rttMs; } catch (e) { rtt = null; }
        NET.predLife = 50 + Math.round((rtt || 0) * 0.06) + Math.round(bufDelay(NET.buf, SNAP_DELAY)) + 10;
        NET.claimWait = NET.predLife - 50 + 6; // (a claimed catch: the round trip + my view's delay, then the host said no)
      }
      const rt = bufTick(NET.buf, SNAP_DELAY);
      const s = bufSample(NET.buf, rt);
      if (s) {
        NET.rt = rt;
        NET.starve = s.b ? 0 : NET.starve + 1;
        NET.viewFrames++; if (!s.b) NET.starveFrames++;
        applyView(s, rt);
        if (!NET.sess) return;
        runEvents(rt);
      }
      guestSelf(ins);
      updatePredicted();
      if (G.mode === 'podium') updatePodium(); else updateFx();
      if (G.mode === 'playing') updateWaterFx();
      guestSend(ins);
    } else updateFx();
  }
  function doorAt(T) {
    if (T <= DOOR_CLOSE) return easeIO(clamp(T / DOOR_CLOSE, 0, 1));
    if (T <= DOOR_CLOSE + DOOR_HOLD) return 1;
    return 1 - easeIO(clamp((T - DOOR_CLOSE - DOOR_HOLD) / DOOR_OPEN, 0, 1));
  }
  // one entity list, keyed by id (row[0]): fresh view objects for new ids, removals reported to `gone`
  function syncList(key, rows, rows1, t, minLen, upd, gone) {
    const m = NET.view[key], out = [], seen = new Set();
    if (Array.isArray(rows)) {
      let idx1 = null;
      if (Array.isArray(rows1) && t > 0) { idx1 = new Map(); for (const r of rows1) if (Array.isArray(r)) idx1.set(r[0], r); }
      for (const r of rows) {
        if (!Array.isArray(r) || r.length < minLen) continue;
        const id = nInt(r[0], 0, 1e12, -1);
        if (id < 0 || seen.has(id)) continue;
        seen.add(id);
        let o = m.get(id); const fresh = !o;
        if (!o) { o = { id }; m.set(id, o); }
        if (upd(o, r, idx1 ? idx1.get(id) : null, fresh) !== false) out.push(o);
      }
    }
    for (const [id, o] of m) if (!seen.has(id)) { m.delete(id); if (gone) gone(o); }
    return out;
  }
  function applyView(s, rt) {
    const g = s.a.d, g1 = s.b ? s.b.d : null, t = s.t, el = Math.max(0, rt - s.a.k);
    const arena = g.m === 'b';
    const idx = nInt(g.r, 0, 99, 0);
    if (idx !== NET.viewIdx || arena !== NET.viewArena) loadView(idx, arena);
    const ph = PH_NAME[g.ph] || 'playing';
    G.loop = nInt(g.lp, 0, 99, 0); G.lives = nInt(g.L, 0, 99, 0); G.score = nInt(g.S, 0, 1e10, 0); G.stamps = nInt(g.st, 0, 99, 0);
    G.hurry = !!g.hu; G.stampFlash = nInt(g.sf, 0, 300, 0); G.ticketFlash = nInt(g.tf, 0, 300, 0);
    NET.el = nInt(g.el, 60, 2000, EMPTY_LIFE); // (the host's floating-empty life: emptyLife, the blink)
    NET.hostLc = g.lc === 1; NET.hostAm = g.am === 1; NET.shotCap = nInt(g.sc, 0, 9, 0); // (no lc: an older host - no claims; g.sc: only an older host's in-flight cap)
    G.battle = arena ? { left: Math.max(0, nInt(g.tl, 0, 1e7, 0) - (ph === 'playing' ? el : 0)), total: 0, intruded: true, enemyT: 1e9, powerT: 1e9 } : null;
    const mu = MUSICS[nInt(g.mu, 0, MUSICS.length - 1, 0)];
    if (mu !== G.music && !(mu === null && G.music === undefined)) setMusic(mu);
    G.trans = ph === 'transition' && Array.isArray(g.tr) ? { door: doorAt(nInt(g.tr[0], 0, 999, 0) + el), next: nInt(g.tr[1], 0, 99, 0), swapped: true } : null;
    guestBanner(g.bn, el);
    guestPlayers(g.P, g1 && g1.P, t, el);
    if (!NET.sess) return; // (left: no longer in the host's game)
    viewLists(g, g1, t, el);
    G.podium = ph === 'podium' && Array.isArray(g.pd) ? { order: g.pd.slice(0, 4).map((v) => nInt(v, 0, 3, 0)), t: nInt(g.pt, 0, 1e6, 0) + el } : null;
    if (ph !== G.mode) guestPhase(ph);
  }
  function guestPhase(ph) {
    const prev = G.mode;
    G.mode = ph;
    const results = (m) => m === 'gameover' || m === 'ending' || m === 'podium';
    if (ph === 'gameover') showOverlay('over');
    else if (ph === 'ending') showOverlay('ending');
    else if (ph === 'podium') showOverlay('podium');
    else if (results(prev) || shownOverlay === 'over' || shownOverlay === 'ending' || shownOverlay === 'podium') showOverlay(G.menuOpen ? 'pause' : null);
    if (ph !== 'playing') { const me = myPlayer(); if (me && NET.ctl === 'local') { me.vx = 0; me.shootAnim = 0; } }
  }
  function guestBanner(bn, el) {
    if (Array.isArray(bn) && bn.length >= 5) {
      const id = nInt(bn[0], 0, 1e12, 0), left = nInt(bn[3], 0, 3600, 0) - el;
      if (id && id !== NET.bnId) {
        NET.bnId = id;
        const main = nStr(bn[1], 40), cls = nStr(bn[4], 24).replace(/[^a-z ]/g, '');
        // (the countdown's "3" names MY animal's move, not the host's)
        const sub = cls === 'count' && main === '3' ? countSub() : nStr(bn[2], 90);
        if (left > 0) G.banner = { main, sub, end: G.frame + left, cls, id: 'h' + id };
      }
    } else if (NET.bnId && G.banner && String(G.banner.id).charAt(0) === 'h') { G.banner.end = Math.min(G.banner.end, G.frame); NET.bnId = 0; }
  }
  // players: stats always from the host; positions from the host's snapshot, from that player's own body stream
  // (another guest, free to move) or, for my own animal, from my own physics while it is mine to move
  function guestPlayers(P, P1, t, el) {
    if (!Array.isArray(P)) return;
    const idx1 = new Map(), present = new Set();
    if (Array.isArray(P1) && t > 0) for (const r of P1) if (Array.isArray(r)) idx1.set(r[0], r);
    for (const r of P) {
      if (!Array.isArray(r) || r.length < 24) continue;
      const slot = nInt(r[0], -1, 3, -1);
      const p = G.players.find((q) => q.slot === slot); if (!p) continue;
      present.add(slot);
      const r1v = idx1.get(slot);
      const ep = nInt(r[1], 0, 1e9, 0), fl = nInt(r[7], 0, 1023, 0);
      p.score = nInt(r[8], 0, 1e10, 0); p.kills = nInt(r[9], 0, 1e6, 0); p.revives = nInt(r[10], 0, 1e6, 0);
      p.kos = nInt(r[11], 0, 1e6, 0); p.koed = nInt(r[12], 0, 1e6, 0); p.rank = nInt(r[23], 0, 4, 0);
      const pw = nInt(r[16], -1, POWER_TYPES.length - 1, -1);
      p.power = pw >= 0 ? { type: POWER_TYPES[pw], t: Math.max(1, nInt(r[17], 0, 1e5, 0) - el) } : null;
      const mine = slot === G.localSlot;
      // (AMMO: a rival's magazine for its HUD seat - an older host's row has none: -1; mine is my own count)
      if (!mine) { const an = nInt(r[24], -1, 9, -1); p.amN = an >= 0 ? an : undefined; p.amT = nInt(r[25], 0, 9999, 0); }
      if (mine) {
        if (ep !== p.ep) takeOver(p, r, ep, fl);
        if (NET.ctl === 'local') continue;
      }
      p.ep = ep;
      p.dead = !!(fl & 8); p.out = !!(fl & 16);
      p.koT = nInt(r[21], 0, 9999, 0); p.dieT = nInt(r[22], 0, 9999, 0) + (p.dead && !p.ghost ? el : 0);
      const gt = nInt(r[18], -1, 99999, -1);
      p.ghost = gt >= 0 ? { t: gt + el, x0: p.x } : null;
      const tp = nInt(r[19], -1, 99999, -1);
      p.trap = tp >= 0 ? { prog: tp, b: null, bid: nInt(r[20], 0, 1e12, 0) } : null;
      p.stunT = nInt(r[14], 0, 9999, 0); p.invuln = nInt(r[13], 0, 9999, 0); p.shield = nInt(r[15], 0, 9999, 0);
      p.onGround = !!(fl & 1); p.water = fl & 2 ? 1 : fl & 4 ? 2 : 0; p.shootAnim = fl & 32 ? 2 : 0;
      p.facing = r[6] < 0 ? -1 : 1;
      const st = !mine && (fl & 64) ? peerStream(p) : null;
      p.shownW = st ? 1 : 0; p.shownK = st ? st.a.k + (st.b ? (st.b.k - st.a.k) * st.t : 0) : NET.rt; // (guestClaim names it)
      if (st) {
        const a = st.a, b = st.b;
        p.x = lx(a.x, b && b.x, st.t); p.y = ly(a.y, b && b.y, st.t); p.vx = a.vx; p.vy = a.vy; p.facing = a.f;
        p.onGround = !!(a.fl & 1); p.water = a.fl & 2 ? 1 : a.fl & 4 ? 2 : 0; p.shootAnim = a.fl & 8 ? 2 : 0;
        p.invuln = a.fl & 128 ? 9 : 0; p.stunT = a.fl & 64 ? 9 : 0; p.shield = a.sh;
        p.mvA = !G.perksOff && !!(a.fl & 256); p.mvB = !G.perksOff && !!(a.fl & 512);
        const o = NET.others.get(st.id);
        if (o && a.ny > o.ny) { o.ny = a.ny; wordPop(p.x + 8, p.y - 2, '냥!', p.color); }
        if (o && a.dp > o.dp) { o.dp = a.dp; dropDust(p.x + 8, PF_TOP + Math.floor((p.y + 16 - PF_TOP) / TS) * TS); NET.dropSeen = (NET.dropSeen | 0) + 1; }
      } else {
        p.x = lx(r[2], r1v && r1v[2], t); p.y = ly(r[3], r1v && r1v[3], t);
        p.vx = nNum(r[4], -99, 99, 0) / 10; p.vy = nNum(r[5], -99, 99, 0) / 10;
        p.mvA = !G.perksOff && !!(fl & 128); p.mvB = !G.perksOff && !!(fl & 256);
      }
      p.walkT += Math.abs(p.vx);
    }
    if (notInGame('outP', !present.has(G.localSlot))) return;
    // a player who left the game is gone from the host's world: gone here too (never my own animal)
    if (present.size && G.players.some((p) => !present.has(p.slot) && p.slot !== G.localSlot)) G.players = G.players.filter((p) => present.has(p.slot) || p.slot === G.localSlot);
  }
  function peerStream(p) {
    let id = null;
    for (const [pid, s] of NET.slots) if (s === p.slot) id = pid;
    if (!id || id === NET.hostId) return null;
    const o = NET.others.get(id); if (!o) return null;
    const s = bufSample(o.buf, bufTick(o.buf, PEER_DELAY)); if (!s) return null;
    const a = s.a.d; if (a.ep !== p.ep || a.gid !== NET.gid) return null;
    return { id, a, b: s.b && s.b.d.ep === a.ep ? s.b.d : null, t: s.t };
  }
  // the host changed my animal's control epoch: free again -> my physics takes it from where the host put it
  function takeOver(p, r, ep, fl) {
    p.ep = ep;
    if (!(fl & 64)) { NET.ctl = 'remote'; return; }
    Object.assign(p, { x: nNum(r[2], WALL_L - 4, WALL_R - 12, p.x), y: nNum(r[3], PF_TOP - 24, PF_BOT, p.y), vx: nNum(r[4], -99, 99, 0) / 10, vy: nNum(r[5], -99, 99, 0) / 10,
      facing: r[6] < 0 ? -1 : 1, onGround: !!(fl & 1), water: fl & 2 ? 1 : fl & 4 ? 2 : 0, dead: false, ghost: null, trap: null, koT: 0, out: false, dieT: 0,
      invuln: nInt(r[13], 0, 9999, 0), stunT: 0, shield: nInt(r[15], 0, 9999, 0), coyote: 0, jumpBuf: 0, shootBuf: 0, sq: 0, waterSkip: 0, splashY: undefined }, MV_BODY);
    p.hotIn = p.water === 1;
    NET.ctl = 'local';
  }
  function viewLists(g, g1, t, el) {
    const pickOwner = (o) => (o >= 0 && multi() ? [SLOT_COLS[o] || '#ffffff', '#ffffff', '#c8f4ff'] : BUBBLE_COLS);
    G.enemies = syncList('E', g.E, g1 && g1.E, t, 8, (o, r, q, fresh) => {
      const st = E_STATES[nInt(r[2], 0, 4, 1)];
      if (!fresh && st === 'dead' && o.state !== 'dead') burst(o.x + 8, o.y + 8, 10, STAR_COLS, 2, 16);
      o.type = ENEMY_TYPES[nInt(r[1], 0, 3, 0)]; o.state = st;
      o.x = lx(r[3], q && q[3], t); o.y = ly(r[4], q && q[4], t);
      o.dir = r[5] < 0 ? -1 : 1; o.vx = o.dir;
      const f = nInt(r[6], 0, 255, 0);
      o.angry = !!(f & 1); o.soakT = f & 2 ? 1 : 0; o.chargeT = f & 4 ? 1 : 0; o.windT = f & 8 ? 1 : 0; o.grace = f & 16 ? 1 : 0;
      o.onGround = !!(f & 32); o.hopT = f & 64 ? 0 : 99; o.deadT = nInt(r[7], 0, 9999, 0) + (st === 'dead' ? el : 0);
      o.t = (o.t | 0) + 1; o.gone = false; o.minion = false;
    });
    const live = new Set();
    for (const pb of NET.pred) if (pb.match) live.add(pb.sid);
    const view = syncList('U', g.U, g1 && g1.U, t, 9, (o, r, q, fresh) => {
      const kind = U_KINDS[nInt(r[1], 0, U_KINDS.length - 1, 0)], st = U_STATES[nInt(r[2], 0, 2, 0)];
      const owner = nInt(r[5], -1, 3, -1), f = nInt(r[7], 0, 255, 0);
      // (my own otter droplets: my prediction flew them and burst them at age 13 - the host's copies, flying or
      // bursting, are never shown here as well)
      const myDrop = !!(f & 16) && owner === G.localSlot && kind === 'empty' && st !== 'float';
      if (st === 'pop' && o.state !== 'pop') {
        const kc = kind === 'empty' && !G.perksOff ? charOfSlot(owner) : null; // (v4: the animal's own pop, as the host's popBubble)
        if (myDrop) { /* (mine burst in my prediction) */ } else if (kc) kitPop(kc, lx(r[3]) + 8, ly(r[4]) + 8, owner, !!(f & 16));
        else burst(lx(r[3]) + 8, ly(r[4]) + 8, kind === 'empty' ? 7 : 10, pickOwner(owner), 1.5, 14);
      } else if (!fresh && kind !== o.kind && (kind === 'trapped' || kind === 'player')) burst(o.x + 8, o.y + 8, 8, BUBBLE_COLS, 1.1, 12);
      o.kind = kind; o.state = st; o.owner = owner;
      o.x = lx(r[3], q && q[3], t); o.y = ly(r[4], q && q[4], t);
      const ex = nInt(r[6], -1, 9, -1);
      o.soaked = !!(f & 1); o.big = !!(f & 4); o.squish = f & 8 ? 6 : 0;
      o.drop = !!(f & 16); o.yarn = !!(f & 32); // (v4 bubble bits: the look comes from owner -> animal, state, age and these)
      if (st === 'pop') { o.popT = nInt(r[8], 0, 99, 0) + el; o.age = 30; } else { o.age = nInt(r[8], 0, 9999, 0) + el; o.popT = 0; }
      o.enemy = kind === 'trapped' ? { type: ENEMY_TYPES[clamp(ex, 0, 3)] } : null;
      o.trapMax = 1000; o.trapT = f & 2 ? 999 : 0;
      o.victim = kind === 'player' ? G.players.find((p) => p.slot === ex) || null : null;
      o.sid = r.length > 9 && owner === G.localSlot ? nInt(r[9], 0, 1e9, 0) : 0;
      o.dead = false; o.bounceCd = 0; o.grace = 0; o.chain = null;
      if (o.sid) NET.sidSeen.set(o.sid, o);
      // my own bubble while my prediction of it is still flying: the prediction is drawn instead
      return !(myDrop || (o.sid && live.has(o.sid) && st === 'shot' && kind === 'empty'));
    });
    G.bubbles = view.concat(NET.pred);
    G.items = syncList('I', g.I, g1 && g1.I, t, 6, (o, r, q) => {
      o.type = ITEM_TYPES[nInt(r[1], 0, ITEM_TYPES.length - 1, 0)]; o.x = lx(r[2], q && q[2], t); o.y = ly(r[3], q && q[3], t);
      const f = nInt(r[4], 0, 7, 0); o.floating = !!(f & 1); o.onGround = !!(f & 2); o.age = nInt(r[5], 0, 9999, 0) + el;
    }, (o) => { if (o.age < ITEM_LIFE - 2) burst(o.x + 8, o.y + 8, 8, STAR_COLS, 1.4, 14); });
    const K = g.K;
    if (Array.isArray(K) && K.length >= 6) {
      const q = g1 && Array.isArray(g1.K) ? g1.K : null;
      G.pickup = { type: POWER_TYPES[nInt(K[0], 0, POWER_TYPES.length - 1, 0)], x: lx(K[1], q && q[1], t), y: ly(K[2], q && q[2], t), onGround: !!K[3], land: nInt(K[4], 0, 99999, 0), age: nInt(K[5], 0, 99999, 0) };
    } else {
      if (G.pickup) burst(G.pickup.x + 8, G.pickup.y + 8, 12, STAR_COLS, 1.6, 16);
      G.pickup = null;
    }
    G.hazards = syncList('H', g.H, g1 && g1.H, t, 7, (o, r, q) => {
      const kind = H_KINDS[nInt(r[1], 0, 3, 0)];
      o.kind = kind; o.x = lx(r[2], q && q[2], t); o.t = nInt(r[4], 0, 99999, 0) + el; o.dead = false;
      const a = nInt(r[5], -1, 1, 0), b = nInt(r[6], -1, 99999, 0);
      if (kind === 'sweep') { o.sy = nNum(r[3], 0, H + 40, 100); o.y = o.sy; o.state = a ? 'go' : 'warn'; o.dir = b < 0 ? -1 : 1; }
      else { o.y = ly(r[3], q && q[3], t); }
      if (kind === 'wave') o.vx = a < 0 ? -1 : 1;
      if (kind === 'spore') { o.state = a ? 'land' : 'fly'; o.hatch = b + (a ? el : 0); }
    });
    G.drops = syncList('D', g.D, g1 && g1.D, t, 5, (o, r, q) => {
      o.x = nNum(r[1], 0, W, 0); o.y = ly(r[2], q && q[2], t); o.state = r[3] ? 'fall' : 'form'; o.t = nInt(r[4], 0, 9999, 0) + el; o.dead = false;
    }, (o) => { if (o.state === 'fall') { for (let i = 0; i < 6 && G.parts.length < 380; i++) G.parts.push({ x: o.x + 4, y: o.y + 7, vx: (i - 3) * 0.38, vy: -0.5 - fxr(), life: 14, max: 14, c: SCALD_COLS[i % 3], sz: 1, g: 0.09 }); } });
    G.ice = syncList('C', g.C, null, 0, 6, (o, r, q, fresh) => {
      o.col = nInt(r[1], 2, COLS - 4, 2); o.rs = nInt(r[2], 1, ROWS - 1, 1); o.x = o.col * TS; o.y = PF_TOP + (o.rs - 1) * TS;
      o.t = nInt(r[3], 0, 9999, 0) + el; o.dead = false;
      const et = nInt(r[4], -1, 3, -1); o.enemy = et >= 0 ? { type: ENEMY_TYPES[et], dir: r[5] < 0 ? -1 : 1 } : null;
      if (fresh) burst(o.x + 8, o.y + 8, 10, ICE_COLS, 1.3, 14);
    }, (o) => burst(o.x + 8, o.y + 10, 10, ICE_COLS, 1.1, 16));
    const iceKey = G.ice.map((i) => i.id).join(',');
    if (iceKey !== NET.view.iceKey) { NET.view.iceKey = iceKey; rebuildIceTop(); }
    G.bolts = syncList('O', g.O, g1 && g1.O, t, 5, (o, r, q) => {
      o.x = lx(r[1], q && q[1], t); o.y = ly(r[2], q && q[2], t); o.dir = r[3] < 0 ? -1 : 1; o.t = nInt(r[4], 0, 9999, 0) + el; o.dead = false;
    });
    viewBoss(g.B, g1 && g1.B, t, el);
  }
  function viewBoss(B, B1, t, el) {
    if (!Array.isArray(B) || B.length < 25) { G.boss = null; return; }
    const type = BOSS_TYPES[nInt(B[0], 0, BOSS_TYPES.length - 1, 0)], def = BOSS_DEF[type];
    const q = Array.isArray(B1) && B1.length >= 25 && B1[0] === B[0] ? B1 : null;
    const prev = G.boss && G.boss.type === type ? G.boss : null;
    const b = prev || { type, def, num: def.num, name: def.name, bob: 0, cycle: 0, side: 1 };
    const st = B_STATES[nInt(B[1], 0, 4, 1)];
    const hp = nInt(B[7], 0, 9, 0), bt = nInt(B[13], 0, 1e6, 0) + el;
    b.x = lp(B[2], q && q[2], t, -40, W + 40); b.y = lp(B[3], q && q[3], t, -80, H + 40);
    b.vx = nNum(B[4], -900, 900, 0) / 100; b.vy = nNum(B[5], -900, 900, 0) / 100; b.face = B[6] < 0 ? -1 : 1;
    b.soapMax = nInt(B[9], 1, 99, 1); b.soap = Math.min(nInt(B[8], 0, 99, 0), b.soapMax); b.phase = nInt(B[10], 1, 3, 1);
    b.act = B_ACTS[nInt(B[11], 0, B_ACTS.length - 1, 0)]; b.actT = nInt(B[12], 0, 9999, 0);
    const fl = nInt(B[14], 0, 7, 0); b.onGround = !!(fl & 1); b.intruder = !!(fl & 2);
    b.sq = nNum(B[15], -100, 100, 0) / 100; b.hitFlash = nInt(B[16], 0, 99, 0);
    const gx = nNum(B[17], -999, 999, -999), gy = nNum(B[18], -999, 999, -999);
    b.giant = gx > -999 ? { x: lp(gx, q && q[17] > -999 ? q[17] : null, t, -60, W + 60), y: lp(gy, q && q[18] > -999 ? q[18] : null, t, -60, H + 60), vy: 0 } : null;
    b.stunT = nInt(B[19], 0, 9999, 0); b.tx = nNum(B[20], -99, 999, 0); b.ty = nNum(B[21], -99, 999, 0);
    b.dropRow = nInt(B[22], -1, ROWS, -1); b.sx = nNum(B[23], -99, 999, 0); b.sy = nNum(B[24], -99, 999, 0);
    if (prev) {
      // the effects the host's engine makes with particles
      const cx = b.x + 16, cy = b.y + 16;
      if (hp < prev.hp) { foamPuff(cx, cy, 22, 34, 6); burst(cx, cy, 30, BUBBLE_COLS, 2.6, 26); }
      else if (st === 'stun' && prev.state !== 'stun') { foamPuff(cx, cy, 12, 30, 4); burst(cx, cy, 16, BUBBLE_COLS, 1.8, 18); }
      if (st === 'defeat' && prev.t < DEFEAT_BOOM && bt >= DEFEAT_BOOM) { foamPuff(cx, cy, 34, 46, 8); burst(cx, cy, 36, BUBBLE_COLS, 3, 30); burst(cx, cy, 16, STAR_COLS, 2.2, 24); }
      if (b.soap > prev.soap && st === 'fight') foamPuff(cx, cy, 3, 14, 2.5);
    }
    b.state = st; b.hp = hp; b.t = bt;
    G.boss = b;
  }
  // replay the host's events once my render clock reaches them (my own sounds I already made myself)
  function runEvents(rt) {
    while (NET.evQ.length) {
      const ev = NET.evQ[0], k = nInt(ev[1], 0, 1e12, 0);
      if (k > rt) break;
      NET.evQ.shift();
      if (k < rt - 120) continue; // (stale: a long stall)
      const who = nInt(ev[2], -1, 3, -1), type = ev[3];
      if (type === 's') {
        if (who >= 0 && who === G.localSlot) continue;
        const name = nStr(ev[4], 24);
        if (!/^[a-z_]+$/.test(name)) continue;
        const a = ev[5], o = a === 'o' ? { open: true } : nInt(a, 0, 99, 0) > 0 ? { n: nInt(a, 0, 99, 0) } : undefined;
        Snd.sfx(name, o);
      } else if (type === 'p') {
        G.pops.push({ x: nNum(ev[4], 0, W, 0), y: nNum(ev[5], 0, H, 0), txt: nStr(String(ev[6]), 12), scale: nInt(ev[7], 1, 3, 1), color: safeCol(ev[8]), combo: nStr(ev[9], 6), t: 0 });
      } else if (type === 'i') {
        G.pops.push({ x: nNum(ev[4], 0, W, 0), y: nNum(ev[5], 0, H, 0), txt: nStr(String(ev[6]), 6), icon: 'stamp', scale: 1, color: '#ffd6d6', combo: '', t: 0 });
      } else if (type === 'w') {
        wordPop(nNum(ev[4], 0, W, 0), nNum(ev[5], 0, H, 0), nStr(ev[6], 16), safeCol(ev[7]));
      } else if (type === 'k') shake(nNum(ev[4], 0, 10, 0));
      else if (type === 'd') { dropDust(nNum(ev[4], 0, W, 0), nNum(ev[5], PF_TOP, PF_BOT, PF_TOP)); NET.dropSeen = (NET.dropSeen | 0) + 1; }
    }
  }
  const safeCol = (c) => (typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c) ? c : '#ffffff');

  // ---- my own animal (prediction) and what it does
  function guestSelf(ins) {
    const me = myPlayer(); if (!me) return;
    if (G.mode === 'playing') ammoTick(me); // (AMMO: my own count, as the host keeps it)
    const inp = ins[G.localSlot] || NO_INPUT;
    NET.jumpHeld = !!inp.jump;
    if (NET.ctl !== 'local') {
      // trapped in a battle bubble: every jump / shoot press is a mash for the host
      if (me.trap && G.mode === 'playing' && (inp.jumpP || inp.shootP)) {
        const t = G.frame;
        NET.mash = NET.mash.filter((f) => t - f < 60);
        if (NET.mash.length < 18) { NET.mash.push(t); NET.sess.send(NET.hostId, { t: 'mash', ep: me.ep }); }
      }
      return;
    }
    if (G.mode !== 'playing') return; // (countdown, doors, results: stand still)
    if (me.dead) {
      // fallen: waiting for the host to make us a ghost bubble (a new epoch). Should the host have dropped the
      // report (e.g. it arrived during the doors), say it once more, then get up again rather than hang
      me.dieT++;
      if (me.dieT === 150) NET.sess.send(NET.hostId, { t: 'die', ep: me.ep, x: r1(me.x), y: r1(me.y) });
      if (me.dieT > 420) { me.dead = false; me.dieT = 0; me.invuln = INVULN; }
      return;
    }
    if (me.stunT > 0) { me.stunT--; updatePlayer(me, NO_INPUT); } else updatePlayer(me, inp);
    guestBounce(me, inp);
    if (G.gameMode === 'coop') guestReviveTouch(me);
    if (G.invincible || me.invuln > 0 || me.stunT > 0 || !hitTest(me)) return;
    if (me.shield > 0) { useShield(me); return; }
    if (G.gameMode === 'coop') {
      // our own fall, decided against what we see; the host turns it into a ghost bubble
      NET.sess.send(NET.hostId, { t: 'die', ep: me.ep, x: r1(me.x), y: r1(me.y) });
      me.dead = true; me.dieT = 0; me.vx = 0; me.vy = 0; me.shootAnim = 0;
      burst(me.x + 8, me.y + 8, 12, STAR_COLS, 1.8, 20); shake(3); Snd.sfx('die');
    } else {
      // battle: an enemy hit stuns for 1 s (the host takes the 100 points)
      NET.sess.send(NET.hostId, { t: 'hit', ep: me.ep });
      me.stunT = STUN_FRAMES_P; me.invuln = STUN_FRAMES_P + STUN_INV; me.vy = Math.min(me.vy, -1.8); me.onGround = false; me.shootAnim = 0;
      endMove(me); me.hop = 0; // (as stunPlayer on the host: a slamming capy just falls)
      burst(me.x + 8, me.y + 6, 8, STAR_COLS, 1.4, 16); Snd.sfx('escape');
    }
  }
  // bubbles in my view are the host's: I only bounce on them (the host pops what I touch, but not what I bounced on)
  function guestBounce(p, inp) {
    if (!(p.vy > 0) || !inp.jump || p.mv === 'slam') return; // (a slamming capy pops, never bounces)
    for (const b of G.bubbles) {
      if (b.pred || b.state !== 'float' || b.kind === 'player') continue;
      if (!circBox(b.x + 8, b.y + 8, 7.5, p.x + 2, p.y + 2, 12, 14) || p.y + 16 > b.y + 8 + 3) continue;
      p.vy = BOUNCE_V; p.onGround = false; p.coyote = 0; p.jumpBuf = 0; p.sq = -0.2; bounceRefresh(p);
      NET.bounces.push({ id: b.id, until: G.frame + 24 });
      Snd.sfx('bounce');
      break;
    }
  }
  function guestReviveTouch(me) {
    for (const g of G.players) {
      if (g === me || !g.ghost) continue;
      if (!circBox(g.x + 8, g.y + 8, GHOST_REACH + 1, me.x + 2, me.y + 2, 12, 14)) continue;
      if (NET.rvSent[g.slot] === g.ep) continue;
      NET.rvSent[g.slot] = g.ep;
      NET.sess.send(NET.hostId, { t: 'rv', s: g.slot, e: g.ep });
    }
  }
  // my shot: the host blows the real bubble(s) at my spot; meanwhile my own copies fly at once - the same newShot /
  // stepShot as the host's (an otter's 3: only the centre carries the sid the host's row comes back with)
  function guestFire(p, air) {
    if (!NET.sess) return;
    if (G.gameMode === 'battle') p.invuln = 0; // (as on the host: blowing a bubble ends my blink)
    const n = ++NET.shotN, specs = newShot(p, air);
    const m = { t: 'shot', n, x: r1(p.x), y: r1(p.y), f: p.facing < 0 ? -1 : 1, ep: p.ep };
    if (air && kitOf(p).airShot) m.a = 1; // (my cat is airborne: the host blows the base bubble, as I do)
    NET.sess.send(NET.hostId, m);
    if (specs[0].ty === 'egg') eggCap(NET.pred, p.slot, specs[0].cap);
    specs.forEach((s, i) => {
      const pb = shotFrom({ id: 'p' + n + (i ? '.' + i : ''), pred: true, sid: i ? 0 : n, vn: n, vi: i, kind: 'empty', age: 0, life: 0, popT: 0, owner: p.slot,
        squish: 0, soaked: false, match: !i, seen: false }, s);
      pb.path = [pb.x, pb.y]; // (where my copy was at each age: the reconcile looks up the age the host row shows)
      NET.pred.push(pb);
      if (pb.state === 'float') guestClaim(pb); // (blown into a wall: the host checks it at once too)
    });
    p.shootAnim = 10;
    shootSfx(p);
  }
  function updatePredicted() {
    if (!NET.pred.length) return;
    // (a copy whose host row I have seen lives until that row leaves its shot phase - <= SHOT_MAX f plus the delay my
    // view runs behind with; one never seen gives up after predLife)
    const keep = [], seenLife = SHOT_MAX + (NET.predLife || 50);
    for (const pb of NET.pred) {
      pb.age++; pb.life++;
      if (pb.state === 'pop') { if (++pb.popT < 10) keep.push(pb); continue; } // (my burst droplet)
      if (pb.claim) {
        // my catch as my screen saw it: the bubble rides on that rival until the host's prison shows up there - or, the
        // host refused it, its own bubble takes over (the host row of this shot is drawn again)
        const q = G.players.find((o) => o.slot === pb.claim.s);
        if (!q || q.trap || G.frame > pb.claim.until) continue;
        pb.x = clamp(q.x, WALL_L, WALL_R - 16); pb.y = clamp(q.y - 1, CEIL_Y, PF_BOT - 16); pb.squish = 4;
        keep.push(pb); continue;
      }
      const v = pb.sid ? NET.sidSeen.get(pb.sid) : null;
      if (v && NET.view && NET.view.U.get(v.id) === v) {
        pb.seen = true;
        if (v.state !== 'shot' || v.kind !== 'empty') continue; // the host's bubble takes over from here
        // reconcile: my copy left the host's path (a yarn on an ice block that melted here first, ...) by more than
        // 6 px at the age the host row shows -> the host row takes over
        const a = Math.round(v.age), q = pb.path;
        if (a >= 0 && 2 * a + 1 < q.length && (Math.abs(q[2 * a] - v.x) > 6 || Math.abs(q[2 * a + 1] - v.y) > 6)) { NET.predSplit = (NET.predSplit | 0) + 1; continue; }
      } else if (pb.seen) continue;                          // (it popped / left the snapshot)
      // (unseen: the host's copy is late beyond the measured round trip + my playout delay -> give up on it)
      if (pb.life > (pb.seen ? seenLife : NET.predLife || 50)) { NET.predGiveUp = (NET.predGiveUp | 0) + 1; burst(pb.x + 8, pb.y + 8, 5, BUBBLE_COLS, 1, 10); continue; }
      if (pb.state === 'shot') {
        const ev = stepShot(pb);
        if (ev && ev !== 'wall') shotSfx(ev);
        guestClaim(pb);
        if (pb.state === 'shot' && --pb.shotT <= 0) {
          if (pb.drop) { // my droplet bursts at the end, as the host's does (whose rows I do not show)
            pb.state = 'pop'; pb.popT = 0; pb.vx = 0; pb.vy = 0;
            const kc = bubbleChar(pb);
            if (kc) kitPop(kc, pb.x + 8, pb.y + 8, pb.owner, true);
            else burst(pb.x + 8, pb.y + 8, 7, multi() ? [SLOT_COLS[pb.owner] || '#ffffff', '#ffffff', '#c8f4ff'] : BUBBLE_COLS, 1.5, 14);
          } else pb.state = 'float';
        }
      }
      if (pb.path.length < 2 * (SHOT_MAX + 4)) pb.path.push(pb.x, pb.y);
      keep.push(pb);
    }
    NET.pred = keep;
    if (NET.sidSeen.size > 64) { const ks = Array.from(NET.sidSeen.keys()); for (const k of ks.slice(0, ks.length - 32)) NET.sidSeen.delete(k); }
  }
  // battle: my own capture-phase bubble touches a rival where MY screen draws it (rivalTouch, as the host's own test)
  // -> I tell the host (t 'tp', checked in hostClaim) and show the catch at once (the gulp; the bubble rides on the
  // rival, updatePredicted). Only with a host that checks claims (g.lc); one claim per bubble
  function guestClaim(pb) {
    if (!NET.hostLc || !NET.sess || pb.claim || G.gameMode !== 'battle' || (pb.drop && pb.age > KIT.otter.shot.drop.rivalAge)) return;
    const sc = bubbleScale(pb, bubbleChar(pb));
    for (const q of G.players) {
      if (q.slot === G.localSlot || !free(q) || q.invuln > 0 || !(q.shownK >= 0)) continue;
      if (!rivalTouch(sc, pb.x, pb.y, q.x, q.y, 0)) continue;
      NET.sess.send(NET.hostId, { t: 'tp', n: pb.vn, i: pb.vi, a: pb.age, s: q.slot, e: q.ep, x: r1(q.x), y: r1(q.y), k: r1(q.shownK), w: q.shownW });
      pb.claim = { s: q.slot, until: G.frame + (NET.claimWait || 40) };
      NET.claimsSent = (NET.claimsSent | 0) + 1;
      if (q.shield > 0) { pb.claim.until = G.frame; return; } // (an onsen shield bursts it on the host: no catch to show)
      burst(pb.x + 8, pb.y + 8, 10, [SLOT_COLS[pb.owner] || '#ffffff', '#ffffff', '#c8f4ff'], 1.3, 14);
      Snd.sfx('trap_player');
      return;
    }
  }
  function guestSend() {
    if (!NET.sess || G.frame % BODY_EVERY) return;
    const me = myPlayer(); if (!me) return;
    let fl = 0;
    if (me.onGround) fl |= 1;
    if (me.water === 1) fl |= 2; else if (me.water === 2) fl |= 4;
    if (me.shootAnim > 0) fl |= 8;
    if (NET.jumpHeld) fl |= 16;
    if (me.dead) fl |= 32;
    if (me.stunT > 0) fl |= 64;
    if (me.invuln > 0) fl |= 128;
    if (me.mvA) fl |= 256;  // (v4: my move's pose bits A / B)
    if (me.mvB) fl |= 512;
    NET.bounces = NET.bounces.filter((b) => b.until > G.frame);
    // rt: the host tick my view of the world shows right now (battle traps are judged against what I saw)
    NET.sess.setState({ v: NET_V, k: G.frame, gid: NET.gid, ep: me.ep, x: r1(me.x), y: r1(me.y), vx: r2(me.vx), vy: r2(me.vy), f: me.facing < 0 ? -1 : 1,
      fl, sh: me.shield | 0, bb: NET.bounces.map((b) => b.id).slice(-6), ny: NET.nyang, rt: Math.max(0, Math.round(NET.rt || 0)), lc: 1, dp: NET.drops | 0 });
  }

  // ================================================================== DOM: the friends panel and the room
  function h(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; }
  function netSetupDOM(click) {
    dom.netChip = $('pg-net-chip'); dom.room = $('pg-room'); dom.nick = $('pg-nick'); dom.code = $('pg-code');
    dom.netNote = $('pg-net-note'); dom.friendsErr = $('pg-friends-err'); dom.gamesBox = $('pg-games-box'); dom.games = $('pg-games'); dom.gamesEmpty = $('pg-games-empty');
    dom.hostBtn = $('pg-host'); dom.joinBtn = $('pg-join'); dom.modeDesc = $('pg-mode-desc'); dom.hostOpts = $('pg-host-opts');
    dom.roomCode = $('pg-room-code'); dom.roomMode = $('pg-room-mode'); dom.roomPlayers = $('pg-room-players'); dom.roomPick = $('pg-room-pick');
    dom.roomOptBox = $('pg-room-optbox'); dom.roomOpts = $('pg-room-opts'); dom.roomMsg = $('pg-room-msg'); dom.readyBtn = $('pg-ready'); dom.goBtn = $('pg-go');
    dom.copyBtn = $('pg-copy'); dom.myArt = $('pg-mychar-art'); dom.myName = $('pg-mychar-name'); dom.roomPName = $('pg-room-pname'); dom.roomPPerk = $('pg-room-pperk');
    dom.roomKit = $('pg-room-kit'); dom.roomRole = $('pg-room-role'); dom.roomStats = $('pg-room-stats');
    dom.pauseSub = $('pg-pause-sub'); dom.podiumRoom = $('pg-podium-room'); dom.roomSum = $('pg-room-sum');
    dom.roomHint = $('pg-room-hint'); dom.roomRules = $('pg-room-rules');
    // a shared invite link (?join=CODE on the standalone page): 친구와 하기 opens with the code filled in
    let jc = null; try { jc = new URLSearchParams(location.search).get('join'); } catch (e) { jc = null; }
    if (jc && /^[a-z0-9]{4}$/i.test(jc) && dom.code) { dom.code.value = jc.toUpperCase(); NET.joinLink = true; }
    click('pg-friends-back', netFriendsBack);
    click('pg-host', () => { firstGesture(); netHost(); });
    click('pg-go', () => { firstGesture(); netStart(false); });
    click('pg-ready', () => { firstGesture(); netReady(); });
    click('pg-room-leave', () => netLeave(''));
    click('pg-copy', copyCode);
    const form = $('pg-join-form');
    if (form) listen(form, 'submit', (e) => { e.preventDefault(); firstGesture(); netJoin(dom.code ? dom.code.value : ''); });
    if (dom.code) listen(dom.code, 'input', () => { const v = dom.code.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase(); if (v !== dom.code.value) dom.code.value = v; });
    if (dom.nick) {
      listen(dom.nick, 'change', () => { dom.nick.value = netSetNick(dom.nick.value); });
      listen(dom.nick, 'blur', () => { dom.nick.value = netSetNick(dom.nick.value) || NET.nick; });
    }
    for (const b of document.querySelectorAll('[data-modes] [data-mode]')) listen(b, 'click', (e) => { e.preventDefault(); netSetOpts({ mode: b.dataset.mode }); });
    for (const box of [dom.hostOpts, dom.roomOpts]) if (box) buildOpts(box);
    // the room's animal re-pick: the same six portraits as the title
    if (dom.roomPick) {
      dom.roomPick._lk = myLooks(); // (each bust in its own animal's set, like the title's: pickArt)
      for (const c of CHAR_IDS) {
        const b = h('button', 'pg-pick-btn'); b.type = 'button'; b.dataset.char = c; b.setAttribute('role', 'radio');
        b.setAttribute('aria-label', CHARS[c].name + ' (' + CHARS[c].animal + '): ' + CHARS[c].tag);
        const cv = portraitCanvas(c, 'portrait_', 32, myLook(c)); cv.className = 'pg-pick-art'; cv.setAttribute('aria-hidden', 'true');
        b.append(cv, h('span', 'pg-pick-name', CHARS[c].name));
        listen(b, 'click', (e) => { e.preventDefault(); netPick(c); });
        dom.roomPick.appendChild(b);
      }
    }
  }
  function buildOpts(box) {
    box.textContent = '';
    const id = box.id || 'o';
    box.append(h('span', '', '경기장'));
    const sel = h('select'); sel.dataset.opt = 'arena'; sel.setAttribute('aria-label', '경기장');
    const o0 = h('option', '', '랜덤'); o0.value = '-1'; sel.appendChild(o0);
    ARENAS.forEach((A, i) => { const o = h('option', '', A.name); o.value = String(i); sel.appendChild(o); });
    listen(sel, 'change', () => netSetOpts({ arena: +sel.value }));
    box.appendChild(sel);
    box.append(h('span', '', '시간'));
    const seg = h('div', 'pg-seg'); seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', '경기 시간');
    for (const m of [2, 3, 5]) {
      const b = h('button', '', m + '분'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.time = String(m);
      listen(b, 'click', (e) => { e.preventDefault(); netSetOpts({ time: m }); });
      seg.appendChild(b);
    }
    box.appendChild(seg);
    const chk = (key, label, sub) => {
      box.append(h('span', '', label));
      const l = h('label', 'pg-check'); const c = h('input'); c.type = 'checkbox'; c.dataset.opt = key; c.id = id + '-' + key;
      // (능력 끄기 is the one negative switch: checked = perks off; the others are checked = on)
      listen(c, 'change', () => netSetOpts({ [key]: key === 'perks' ? !c.checked : c.checked }));
      l.append(c, h('span', '', sub));
      box.appendChild(l);
    };
    chk('perks', '능력 끄기', '동물 능력 없이 겨뤄요');
    chk('monsters', '몬스터 출현', '경기 내내 때 몬스터가 나와요');
    chk('intrusion', '보스 난입', '1분 30초 남으면 보스가 와요');
    // 트로피 걸기 (v4 trophies): 안 걸기 / 5 / 10 / 20 / 50 - everyone puts it in, 1st takes it all
    box.append(h('span', '', '트로피 걸기'));
    const bets = h('div', 'pg-seg pg-bets'); bets.setAttribute('role', 'radiogroup'); bets.setAttribute('aria-label', '트로피 걸기');
    for (const s of STAKES) {
      const b = h('button'); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.bet = String(s);
      b.setAttribute('aria-label', s ? '트로피 ' + s + '개씩 걸기' : '트로피 안 걸기');
      if (s) { const cv = mk(8, 8); cv.className = 'pg-ic pg-cup'; cv.setAttribute('aria-hidden', 'true'); troIcon(cv, SPR_CUP); b.append(cv, document.createTextNode(String(s))); }
      else b.textContent = '안 걸기';
      listen(b, 'click', (e) => { e.preventDefault(); if (b.disabled) return; netSetOpts({ bet: s }); uiSfx('stake'); });
      bets.appendChild(b);
    }
    box.appendChild(bets);
  }
  function syncOpts(box, editable) {
    if (!box) return;
    const o = NET.opts;
    for (const el of box.querySelectorAll('select, input, button')) el.disabled = !editable;
    const sel = box.querySelector('select'); if (sel) sel.value = String(o.arena);
    for (const b of box.querySelectorAll('[data-time]')) b.setAttribute('aria-checked', +b.dataset.time === o.time ? 'true' : 'false');
    const p = box.querySelector('[data-opt="perks"]'); if (p) p.checked = !o.perks;
    const mo = box.querySelector('[data-opt="monsters"]'); if (mo) mo.checked = o.monsters !== false;
    const n = box.querySelector('[data-opt="intrusion"]'); if (n) n.checked = !!o.intrusion;
    // (a stake above my own count: off, with the reason as its title)
    for (const b of box.querySelectorAll('[data-bet]')) {
      const s = +b.dataset.bet, short = s > 0 && !(TRO.s && TRO.s.t >= s);
      b.setAttribute('aria-checked', s === (o.bet | 0) ? 'true' : 'false');
      b.disabled = !editable || short; b.classList.toggle('is-short', short);
      if (short) b.title = '내 트로피가 모자라요'; else b.removeAttribute('title');
    }
  }
  function drawArt(cv, c, prefix) {
    if (!cv) return;
    const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.clearRect(0, 0, cv.width, cv.height);
    const f = frameOf(prefix + c, 0); if (f) x.drawImage(f.c, 0, 0, f.w, f.h, 0, 0, cv.width, cv.height);
  }
  // ---- 손님은 온라인 불가 (design/friends.md "As built (invites)"): on the deploy with the cloud, online play - 방 만들기,
  // 코드로 참여, the open rooms, an invite link - is for a signed-in Google account only. A guest (or signed out) gets
  // a card with Google로 계속하기 (the usual sign-in) instead: trophy stakes must belong to real accounts. 혼자 하기
  // stays open; the artifact and a PR preview (no cloud) are as they were. An invite link opened as a guest goes on to
  // its room once signed in
  const NG_TX = { head: '온라인 같이 하기·배틀은 Google 로그인하고 할 수 있어요', solo: '혼자 하기는 로그인 없이도 바로 할 수 있어요' };
  const netGated = () => CLOUD.on && CLOUD.st !== 'in';
  function ngBuild() {
    if (!CLOUD.on || dom.netGate || !dom.friends) return;
    const card = dom.friends.querySelector('.pg-pcard'), hd = $('pg-friends-h'); if (!card) return;
    const g = h('div', 'pg-note pg-net-gate'); g.id = 'pg-net-gate'; g.hidden = true; g.setAttribute('role', 'note');
    const head = h('b', 'pg-note-h', NG_TX.head); head.id = 'pg-net-gate-h';
    const btns = h('div', 'pg-login-btns'), go = h('button', 'pg-btn pg-login-go'); go.type = 'button'; go.id = 'pg-net-gate-go';
    const gl = h('span', 'pg-login-g'); gl.setAttribute('aria-hidden', 'true'); gl.innerHTML = GOOGLE_G;
    const goTx = h('span', 'pg-login-gotx', LG_TX.go); go.append(gl, goTx); go.setAttribute('aria-describedby', 'pg-net-gate-h pg-net-gate-st');
    btns.appendChild(go);
    const st = h('p', 'pg-login-st'); st.id = 'pg-net-gate-st'; st.setAttribute('aria-live', 'polite');
    g.append(head, btns, st, h('p', 'pg-net-gate-solo', NG_TX.solo));
    card.insertBefore(g, hd ? hd.nextSibling : card.firstChild);
    listen(go, 'click', (e) => { e.preventDefault(); firstGesture(); if (go.getAttribute('aria-disabled') === 'true' || !netGated()) return; clClick(); ngPaint(); });
    Object.assign(dom, { netGate: g, netGateGo: go, netGateTx: goTx, netGateSt: st });
    try { for (const q of ['.pg-fw-body', '.pg-fw-sign']) { const fw = document.querySelector('#pg-fontwarm ' + q); if (fw && fw.textContent.indexOf(NG_TX.solo) < 0) fw.textContent += ' ' + NG_TX.head + ' ' + NG_TX.solo; } } catch (e) { /* ignore */ }
  }
  // the card's button and line follow the sign-in as the login screen's do
  function ngPaint() {
    if (!dom.netGate || dom.netGate.hidden) return;
    const st = CLOUD.st, M = CLOUD.msg, go = dom.netGateGo;
    let lbl = LG_TX.go, busy = false, hide = false, line = '';
    if (st === 'frame' || st === 'inapp') { lbl = CL_BTN[st]; hide = !clOutsideUrl(); }
    else if (st === 'auth' && CLOUD.pop) lbl = CL_BTN.again;
    else if (st === 'load' || st === 'auth' || st === 'link') { lbl = CL_BTN[st]; busy = true; }
    else if (st === 'relog') lbl = CL_BTN.relog;
    else if (st === 'nostore') hide = true;
    if (M) line = M.txt; else if (st !== 'out') line = CL_TX[clLine()[0]] || '';
    setTxt(dom.netGateTx, lbl); setTxt(dom.netGateSt, line);
    if (go.hidden !== hide) go.hidden = hide;
    go.setAttribute('aria-disabled', busy ? 'true' : 'false');
    if (busy) go.setAttribute('aria-busy', 'true'); else go.removeAttribute('aria-busy');
  }
  // clUI: 친구와 하기 follows the sign-in - signed in now: the panel itself, and an invite link goes on to its room
  function ngUI() {
    if (!dom.netGate || NET.screen !== 'friends' || shownOverlay !== 'friends') return;
    const was = !dom.netGate.hidden;
    renderFriends();
    if (!was || netGated()) return;
    netTransport().then(() => {
      if (NET.screen !== 'friends' || shownOverlay !== 'friends' || netGated()) return;
      renderFriends(); netLobbyOpen();
      const c = dom.code ? dom.code.value : '';
      if (NET.joinGated && /^[A-Za-z0-9]{4}$/.test(c) && !NET.sess && !NET.busy) { NET.joinGated = false; netJoin(c); }
    });
  }
  function renderFriends() {
    if (!dom.friends) return;
    if (CLOUD.on) {
      ngBuild();
      const gated = netGated();
      if (dom.friends.classList.contains('is-gated') !== gated) dom.friends.classList.toggle('is-gated', gated);
      if (dom.netGate) { if (dom.netGate.hidden === gated) dom.netGate.hidden = !gated; if (gated) ngPaint(); }
      if (gated && NET.joinLink && NET.screen === 'friends') NET.joinGated = true;
    }
    const tr = NET.tr;
    if (dom.nick && document.activeElement !== dom.nick) dom.nick.value = NET.nick || netNick();
    drawArt(dom.myArt, G.sel, 'life_');
    if (dom.myName) dom.myName.textContent = CHARS[G.sel].name;
    for (const b of document.querySelectorAll('[data-modes] [data-mode]')) b.setAttribute('aria-checked', b.dataset.mode === NET.mode ? 'true' : 'false');
    if (dom.modeDesc) dom.modeDesc.textContent = MODE_DESC[NET.mode];
    if (dom.hostOpts) { dom.hostOpts.hidden = NET.mode !== 'battle'; syncOpts(dom.hostOpts, true); }
    // where online goes: explain when the artifact's room is not there
    let note = '';
    // (the standalone page ships PeerJS: when it did not load, say that instead of the Claude-only explanation)
    const why = document.querySelector('script[src*="peerjs"]') ? NET_TEXT.peerOff : NET_TEXT.roomOff;
    const peerLoading = !NET.trDone && peerTag() && typeof window.Peer !== 'function' && !domReady;
    // only this browser's tabs (design/distinction.md 4.2): a block card instead of the note - heading, why, what to do
    // ('room': ask for a Claude email invite; 'peer': 새로고침), 방 만들기 off, 참여 on (it answers the true reason)
    const offK = NET.trDone ? roomOffKind() : '';
    // card: [heading, lines, foot, 새로고침?]; no transport at all (no BroadcastChannel either) keeps its old words in
    // the same block style, both buttons off
    let card = null;
    if (!NET.trDone) note = peerLoading ? NET_TEXT.loadingPeer : '';
    else if (!tr) card = [why, [NET_TEXT.noNet], NET_TEXT.offSolo, false];
    else if (offK === 'peer') card = [NET_TEXT.peerHead, [NET_TEXT.peerHow], '', true];
    else if (offK) card = [NET_TEXT.offHead, [NET_TEXT.roomOff, NET_TEXT.offHow], NET_TEXT.offSolo, false];
    else if (tr === 'peer') note = NET_TEXT.peer;
    else if (tr === 'room') note = NET_TEXT.room;
    // (an off answer from before is stale once online works here: PeerJS arrived late and the panel switched)
    if (NET.trDone && tr && !offK && OFF_ERRS.some((k) => NET.err === NET_TEXT[k])) NET.err = '';
    if (dom.netNote) {
      const el = dom.netNote, key = card ? JSON.stringify(card) : note;
      el.hidden = !card && !note; el.classList.toggle('is-block', !!card);
      // (rebuilt only when it changes: the 새로고침 button keeps its focus, a running flash is not cut)
      if (el._key !== key) {
        el._key = key; el.textContent = '';
        if (card) {
          el.appendChild(h('b', 'pg-note-h', card[0]));
          for (const line of card[1]) el.appendChild(h('span', '', line));
          if (card[2]) el.appendChild(h('span', 'pg-note-foot', card[2]));
          if (card[3]) {
            const b = h('button', 'pg-btn pg-small pg-note-btn', NET_TEXT.reload); b.type = 'button';
            listen(b, 'click', () => { try { location.reload(); } catch (e) { /* ignore */ } });
            el.appendChild(b);
          }
        } else el.textContent = note;
      }
    }
    const off = NET.busy || (NET.trDone && !NET.tr) || peerLoading;
    if (dom.hostBtn) {
      dom.hostBtn.disabled = !!off || !!offK; dom.hostBtn.textContent = NET.busy ? NET_TEXT.connecting : (NET.mode === 'battle' ? '배틀 방 만들기' : '같이 하기 방 만들기');
      if (card) dom.hostBtn.setAttribute('aria-describedby', 'pg-net-note'); else dom.hostBtn.removeAttribute('aria-describedby');
    }
    if (dom.joinBtn) dom.joinBtn.disabled = !!off;
    // (trophies: my count beside my animal; what my last hold ended as, joined to the error line for 10 s)
    syncMyTro();
    if (dom.friendsErr) dom.friendsErr.textContent = [NET.err, troLastText()].filter(Boolean).join(' · ');
    if (dom.gamesBox) dom.gamesBox.hidden = !(tr === 'room' && NET.lobby);
    renderGames();
  }
  function renderGames() {
    if (!dom.games) return;
    dom.games.textContent = '';
    for (const gm of NET.games) {
      const li = h('li'), b = h('button', 'pg-game'); b.type = 'button';
      b.append(h('b', '', cleanNick(gm.hostNick) + '님의 방'), h('span', '', (gm.mode === 'battle' ? '배틀' : '같이 하기') + ' · ' + nInt(gm.n, 1, 4, 1) + '/' + nInt(gm.max, 2, 4, 4)));
      b.setAttribute('aria-label', cleanNick(gm.hostNick) + '님의 ' + (gm.mode === 'battle' ? '배틀' : '같이 하기') + ' 방에 참여');
      listen(b, 'click', (e) => { e.preventDefault(); firstGesture(); netJoin(gm.code); });
      li.appendChild(b); dom.games.appendChild(li);
    }
    if (dom.gamesEmpty) dom.gamesEmpty.hidden = NET.games.length > 0;
  }
  function renderRoom() {
    if (!dom.room || NET.screen !== 'room' && NET.screen !== 'game') return;
    const host = NET.role === 'host';
    if (dom.roomCode) dom.roomCode.textContent = (NET.code || '----').toUpperCase();
    if (dom.roomMode) { dom.roomMode.textContent = NET.mode === 'battle' ? '배틀' : '같이 하기'; dom.roomMode.classList.toggle('is-battle', NET.mode === 'battle'); }
    // (trophies: the stake badge, the 연습 경기 badge; a seat's count is mine for real, a friend's as reported)
    const stake = stakeNow(), q = host ? troPractice() : NET.q, cupOf = (r) => (r.id === NET.selfId ? (TRO.s ? TRO.s.t : -1) : r.cup);
    const betB = $('pg-room-bet'); if (betB) { betB.hidden = !stake; setTxt($('pg-room-bet-n'), stake + '개씩'); }
    const pracB = $('pg-room-prac'); if (pracB) pracB.hidden = !q;
    // player cards (4 seats)
    if (dom.roomPlayers) {
      // (distinction §2.10: the seat number chip, and a seat whose animal a lower seat already has shows its twin colour)
      const twinAt = (r) => NET.roster.some((o) => o.slot < r.slot && o.char === r.char);
      // (v4 shop 9.6: each card's bust wears that seat's 머리 / 얼굴 / 목 - mine from my store, a friend's as reported, S4)
      const lkOf = (r) => (r.id === NET.selfId ? myLook(r.char) : lookParse(r.lk));   // (mine: the card's animal's set)
      const key = JSON.stringify([NET.roster.map((r) => [r.slot, r.nick, r.char, r.ready, cupOf(r), twinAt(r), lkOf(r), troSeatFree(r)]), NET.selfId, NET.slots.get(NET.selfId), stake, q]);
      if (dom.roomPlayers._key !== key) {
        dom.roomPlayers._key = key;
        dom.roomPlayers.textContent = '';
        const mySlot = host ? 0 : NET.slots.get(NET.selfId);
        for (let s = 0; s < MAX_PLAYERS; s++) {
          const r = NET.roster.find((q) => q.slot === s);
          const li = h('li', 'pg-pc' + (r ? '' : ' is-empty') + (r && s === mySlot ? ' is-me' : ''));
          if (!r) { li.textContent = '빈 자리'; dom.roomPlayers.appendChild(li); continue; }
          li.style.setProperty('--slot', SLOT_COLS[s]);
          const cv = portraitCanvas(r.char, 'portrait_', 32, lkOf(r), twinAt(r) ? s : 0); cv.setAttribute('aria-hidden', 'true');
          // (안 걸고 참여: a seat that plays the stake without putting it in gets a small mark under its count; 트로피 부족 is
          // left for a guest that can do neither - an older page, or an older host's room)
          const t = cupOf(r), free = troSeatFree(r), short = s !== 0 && !canAfford(r);
          const tag = s === 0 ? h('span', 'pg-pc-tag is-host', '방장') : short ? h('span', 'pg-pc-tag is-short', '트로피 부족') : r.ready ? h('span', 'pg-pc-tag is-ready', '준비 완료') : h('span', 'pg-pc-tag', '기다리는 중');
          if (s !== 0 && r.ready && !short) { const ck = portraitCanvas('', SPR_READY, 8); ck.setAttribute('aria-hidden', 'true'); tag.prepend(ck); }
          const tro = h('span', 'pg-pc-tro'); tro.appendChild(troChip(t));
          li.append(cv, h('b', 'pg-pc-nick', r.nick), h('span', 'pg-pc-char', CHARS[r.char].name), tro);
          if (free) li.appendChild(h('span', 'pg-pc-free', '안 걸고 참여'));
          li.appendChild(tag);
          if (s === mySlot) li.appendChild(h('span', 'pg-pc-me', '나'));
          li.appendChild(h('i', 'pg-pc-n', (s + 1) + 'P'));
          li.setAttribute('aria-label', (s + 1) + '번 ' + SLOT_NAMES[s] + ': ' + r.nick + ', ' + CHARS[r.char].name + ', ' +
            (t >= 0 ? '트로피 ' + t + '개, ' + LEAGUES[leagueOf(t)].name : '트로피 모름') + (free ? ', 안 걸고 참여' : '') + ', ' + (s === 0 ? '방장' : short ? '트로피 부족' : r.ready ? '준비 완료' : '기다리는 중'));
          dom.roomPlayers.appendChild(li);
        }
      }
    }
    if (dom.roomPick) {
      for (const b of dom.roomPick.querySelectorAll('[data-char]')) { const on = b.dataset.char === G.sel; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }
    }
    // my pick's compact kit card (char-kits §12.3): name, role chip, the pips, the 특기 name; 능력 끄기 (a battle room
    // with the setting off) greys it, every bar 3/3/3/3, one line "능력 꺼짐 · 모두 같은 기본 능력이에요"
    const rc = CHARS[G.sel] || CHARS.duck, roff = NET.mode === 'battle' && NET.opts.perks === false;
    // (AMMO: a battle room says my pick's magazine - 능력 끄기: the base one, everyone's)
    const rmag = NET.mode === 'battle' ? magTx(((roff ? KIT_BASE : KIT[G.sel]) || KIT_BASE).mag) : '';
    if (dom.roomKit) {
      dom.roomKit.style.setProperty('--hue', rc.hue); dom.roomKit.classList.toggle('off', roff);
      dom.roomKit.setAttribute('aria-label', rc.name + ' (' + rc.animal + ', ' + rc.role + '): ' + (roff ? OFF_LINE : '특기 ' + rc.move.name + ': ' + rc.move.how) + (rmag ? '. 배틀 ' + rmag : ''));
    }
    const rmEl = $('pg-room-mag'); if (rmEl) { rmEl.hidden = !rmag; if (rmag) setTxt($('pg-room-pmag'), rmag); }
    setTxt(dom.roomPName, rc.name); setTxt(dom.roomRole, rc.role); setTxt(dom.roomPPerk, roff ? OFF_LINE : rc.move.name);
    statPips(dom.roomStats, roff ? STATS_OFF : rc.stats);
    // (distinction §2.10: my pick duplicates a lower seat's animal -> the colour I will play in; it names the colour,
    // not the animal, so no particle has to follow a name)
    const tw = $('pg-room-twin');
    if (tw) {
      const ms = host ? 0 : NET.slots.get(NET.selfId), twin = ms > 0 && ms < MAX_PLAYERS && NET.roster.some((o) => o.slot < ms && o.char === G.sel);
      const line = twin ? '같은 동물이 있어서 ' + SLOT_NAMES[ms] + '색으로 나와요' : '';
      setTxt(tw, line); tw.hidden = !twin;
      if (twin) tw.style.setProperty('--twin', SLOT_COLS[ms]);
    }
    syncJumpSub();
    // game settings: the host edits them; a guest reads one line
    for (const b of dom.room.querySelectorAll('[data-mode]')) { b.setAttribute('aria-checked', b.dataset.mode === NET.mode ? 'true' : 'false'); b.disabled = !host; }
    const seg = dom.room.querySelector('[data-modes]'); if (seg) seg.hidden = !host;
    if (dom.roomOpts) dom.roomOpts.hidden = !host || NET.mode !== 'battle';
    syncOpts(dom.roomOpts, host);
    if (dom.roomSum) {
      dom.roomSum.hidden = host;
      const o = NET.opts, A = ARENAS[o.arena];
      // (몬스터 없음 only when off: the default line stays as it was)
      const parts = NET.mode === 'battle' ? [(A ? A.name : '랜덤 경기장'), o.time + '분', o.perks ? '능력 있음' : '능력 없음'].concat(o.monsters === false ? ['몬스터 없음'] : [],
        [o.intrusion ? '보스 난입' : '보스 없음', '트로피 ' + troStakeTxt(stake)]) : ['첫 번째 탕부터 끝까지 청소'];
      if (q) parts.push('연습 경기');
      const key = NET.mode + parts.join();
      if (dom.roomSum._key !== key) {
        dom.roomSum._key = key; dom.roomSum.textContent = (NET.mode === 'battle' ? '배틀' : '같이 하기') + ' ';
        // (each item its own nowrap <i>: a narrow phone wraps between items, never inside one - 몬스터 / 없음; the text is
        // the same '· a · b' line as before)
        const sp = h('span', '', '· ');
        parts.forEach((p, i) => { if (i) sp.append(' · '); sp.appendChild(h('i', '', p)); });
        dom.roomSum.appendChild(sp);
      }
    }
    // how a friend gets in: what to share depends on how this page goes online
    if (dom.roomHint) {
      const C = (NET.code || '').toUpperCase();
      let hint = '';
      if (NET.roster.length < MAX_PLAYERS) {
        if (NET.tr === 'room') hint = '친구가 이 게임을 열면 ‘열린 방’에 이 방이 보여요 (Claude 로그인·초대 필요)';
        else if (NET.tr === 'peer') hint = '친구에게 이 게임 링크와 방 코드 ' + C + '를 보내 주세요 (코드 복사에 링크도 담겨요)';
        else hint = localOnly() ? '이 브라우저의 다른 탭에서만 들어올 수 있어요' : '다른 탭의 친구와 하기에서 방 코드 ' + C + '로 참여해요';
      }
      if (dom.roomHint.textContent !== hint) dom.roomHint.textContent = hint;
      dom.roomHint.hidden = !hint;
    }
    // the mode's own verbs, for first-timers (revive a partner / mash out / KO)
    if (dom.roomRules) {
      // (trophies first: what each place gets - or why nothing changes; co-op: the 목욕 보너스)
      const tro = q === 1 ? ['연습 경기예요: 이 브라우저의 탭끼리는 트로피가 바뀌지 않아요'] : q === 2 ? ['연습 경기예요: 같은 기기에서 들어온 친구가 있어요']
        : NET.mode === 'battle' ? [troRulesLine(), troFreeLine(), '끝까지 한 판마다 오늘 트로피 보너스 +' + TRO_PLAY + ' (하루 ' + DAY_CAP + '개까지)', '견습 리그는 등수로 잃지 않아요 · 판 중간에 나가면 꼴찌로 쳐요'].filter(Boolean) : ['끝까지 갈수록 모두 트로피를 받아요 (잃지 않아요)'];
      const rules = tro.concat([coinRule(q)], NET.mode === 'battle'
        ? (NET.opts.monsters === false ? ['몬스터 없이 친구끼리만 겨뤄요'] : []).concat([AMMO_RULE, '갇히면 점프·거품 연타로 빨리 빠져나와요', '갇힌 친구를 터뜨리면 뽀득 KO +500'])
        : ['쓰러진 친구는 거품이 돼요. 거품에 닿으면 바로 살아나요', '목숨은 다 함께 써요']);
      const key = rules.join('|');
      if (dom.roomRules._key !== key) { dom.roomRules._key = key; dom.roomRules.textContent = ''; for (const r of rules) dom.roomRules.appendChild(h('li', '', r)); }
    }
    const n = NET.roster.length, allReady = NET.roster.every((r) => r.slot === 0 || r.ready);
    const meShort = !canAfford({ id: NET.selfId }), meFree = troSeatFree({ id: NET.selfId }), friendShort = host && NET.roster.some((r) => r.id !== NET.selfId && !canAfford(r));
    let msg;
    if (host) msg = n < 2 ? '친구에게 방 코드를 알려 주세요' : allReady ? '모두 준비됐어요! 시작해요' : '모두 준비하면 시작할 수 있어요';
    else msg = NET.ready ? '방장이 시작하길 기다려요' : '준비를 누르고 방장을 기다려요';
    // (trophies: someone cannot cover the stake; my last hold just ended (<= 10 s ago: said for 4 s); the stake changed)
    if (host && meShort) msg = '내 트로피가 모자라요 · 걸기를 낮춰 주세요';
    else if (friendShort) msg = '트로피가 모자란 친구가 있어요 · 걸기를 낮춰 주세요';
    else if (!host && meShort && !NET.ready) msg = '트로피가 모자라요 · 방장에게 걸기를 낮춰 달라고 해요';
    else if (!host && !NET.ready && meFree) msg = '트로피가 모자라요 · 안 걸고 같이 해요';
    const lt = troLastText();
    if (lt && TRO.last && !TRO.last.shown && NET.screen === 'room') { TRO.last.shown = true; troMsgSet(lt); }
    if (TRO.msg && performance.now() < TRO.msg.until) msg = TRO.msg.txt;
    if (NET.copyFail) msg = '복사가 안 됐어요 · 코드를 직접 알려 주세요';
    if (dom.roomMsg && dom.roomMsg.textContent !== msg) dom.roomMsg.textContent = msg;
    if (dom.readyBtn) {
      dom.readyBtn.hidden = host;
      dom.readyBtn.textContent = NET.ready ? '준비 취소' : meShort ? '트로피 부족' : meFree ? '안 걸고 준비' : '준비';
      dom.readyBtn.disabled = !NET.ready && meShort;
      dom.readyBtn.setAttribute('aria-pressed', NET.ready ? 'true' : 'false');
      dom.readyBtn.classList.toggle('is-on', NET.ready);
    }
    if (dom.goBtn) { dom.goBtn.hidden = !host; dom.goBtn.disabled = !canStart(); }
    // (친구 초대: the room's button - a host in its room phase, signed in or on a preview; 친구 순위 over the room follows)
    if (dom.roomIv) { const on = host && NET.ph === 'room' && (palOn() || palDemoOn()); if (dom.roomIv.hidden === on) dom.roomIv.hidden = !on; }
    if (PAL.open) palRender();
  }
  // 코드 복사: an invite (the code, plus this page's link with ?join= on the standalone deploy); phones get the share sheet
  function inviteText() {
    let t = GAME_NAME + ' 같이 해요! 방 코드 ' + (NET.code || '').toUpperCase();
    if (NET.tr === 'peer') {
      try { const u = new URL(location.href); u.search = ''; u.hash = ''; u.searchParams.set('join', NET.code); t += ' ' + u.toString(); } catch (e) { /* ignore */ }
    }
    return t;
  }
  function copyCode() {
    const code = (NET.code || '').toUpperCase(); if (!code) return;
    const text = inviteText();
    const done = (ok, label) => {
      NET.copyFail = !ok;
      if (dom.copyBtn) dom.copyBtn.textContent = ok ? label || '복사했어요!' : '코드 복사';
      if (!ok) {
        // nothing copied: say so, and select the big code so it can be copied by hand
        try { const r = document.createRange(); r.selectNodeContents(dom.roomCode); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); } catch (e) { /* ignore */ }
      }
      renderRoom();
      clearTimeout(NET.copyT);
      NET.copyT = setTimeout(() => { if (dom.copyBtn) dom.copyBtn.textContent = '코드 복사'; if (NET.copyFail) { NET.copyFail = false; renderRoom(); } }, ok ? 1600 : 4000);
    };
    const fallback = () => {
      let ok = false;
      try {
        const ta = h('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-999px;top:0;opacity:0';
        document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove();
      } catch (e) { ok = false; }
      done(ok);
    };
    const clip = () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => done(true), fallback);
        else fallback();
      } catch (e) { fallback(); }
    };
    if (touchMode && navigator.share) {
      try {
        navigator.share({ text }).then(() => done(true, '보냈어요!'), (e) => { if (!(e && e.name === 'AbortError')) clip(); });
        return;
      } catch (e) { /* fall through to the clipboard */ }
    }
    clip();
  }
  // result cards / menu, online: the host decides (다시 하기 / 한 판 더 / 방으로), a guest waits or leaves (나가기)
  function netCardLabels(name) {
    const on = !!(G.online && NET.sess), host = on && NET.role === 'host';
    for (const w of document.querySelectorAll('[data-net-wait]')) w.hidden = !(on && !host);
    const set = (id, txt, hide) => { const e = $(id); if (!e) return; e.textContent = txt; e.hidden = !!hide; };
    if (name === 'over') { set('pg-retry', '다시 하기', on && !host); set('pg-over-home', on ? (host ? '방으로' : '나가기') : '처음으로'); }
    if (name === 'ending') { set('pg-end-next', (G.loop + 2) + '회차 도전', on && !host); set('pg-end-home', on ? (host ? '방으로' : '나가기') : '처음으로'); }
    if (name === 'pause') {
      set('pg-pause-home', on ? (host ? '방으로' : '나가기') : '처음으로');
      // online the match goes on while this menu is open: say so, not "resting"; a battle has no stamp card
      const ph = $('pg-pause-h'); if (ph) ph.textContent = on ? '메뉴' : '잠깐 쉬는 중';
      if (dom.pauseSub) dom.pauseSub.textContent = on ? '게임은 계속 진행돼요! 내 동물도 그대로 있어요' : '따끈한 물에 몸 좀 녹이고 가요';
      if (dom.pause) dom.pause.classList.toggle('pg-battle', G.gameMode === 'battle');
    }
    if (name === 'podium') { set('pg-podium-again', '한 판 더', on && !host); if (dom.podiumRoom) dom.podiumRoom.hidden = !host; }
  }

  // ================================================================== test / debug view of the online layer
  function netBrief() {
    return { screen: NET.screen, role: NET.role, code: NET.code, transport: NET.tr, gid: NET.gid, ctl: NET.ctl, mySlot: G.localSlot,
      snapMax: NET.snapMax, snapBytes: NET.snapBytes, renderTick: Math.round(NET.rt || 0) };
  }
  function netState() {
    const s = NET.sess;
    let stats = null; try { stats = s ? s.stats() : null; } catch (e) { stats = null; }
    return {
      screen: NET.screen, role: NET.role, code: NET.code, transport: NET.tr, forced: NET.trForced, gid: NET.gid, ph: NET.role === 'host' ? NET.ph : NET.hostPh,
      mode: NET.mode, opts: Object.assign({}, NET.opts), nick: NET.nick, ready: NET.ready, canStart: canStart(), error: NET.err, status: NET.status,
      chip: dom.netChip && !dom.netChip.hidden ? dom.netChip.textContent : '', overlay: shownOverlay,
      gated: netGated(), gate: !!dom.netGate && !dom.netGate.hidden, // (손님은 온라인 불가: the deploy's sign-in card)
      roster: NET.roster.map((r) => ({ slot: r.slot, nick: r.nick, char: r.char, ready: !!r.ready || r.slot === 0, host: r.slot === 0, me: r.id === NET.selfId || (NET.role !== 'host' && r.slot === NET.slots.get(NET.selfId)),
        cup: r.id === NET.selfId ? (TRO.s ? TRO.s.t : -1) : r.cup, d: r.d || '', cupM: r.cupM || '', // (v4 trophies: counts as known here)
        z: !!r.z, free: troSeatFree(r), // (안 걸고 참여: a guest page with the rule, as the host knows it; the seat plays without the stake)
        lk: NET.role === 'host' && r.id === NET.selfId ? myLook(r.char) : r.lk || LOOK0 })), // (v4 shop: worn sets as known here - a guest's own as the host's R says)
      tro: { q: NET.role === 'host' && NET.screen !== 'game' ? troPractice() : NET.q, ms: NET.ms, bet: NET.opts.bet | 0, stake: stakeNow(), R: NET.role === 'host' && NET.R ? JSON.parse(JSON.stringify(NET.R)) : null },
      selfId: NET.selfId, mySlot: NET.role === 'host' ? 0 : NET.slots.get(NET.selfId), ctl: NET.ctl,
      stats, snap: { count: NET.snapN, bytes: NET.snapBytes, max: NET.snapMax, trims: NET.snapTrim, refused: NET.snapFail },
      claims: { sent: NET.claimsSent | 0, refused: NET.claimNo | 0, why: Object.assign({}, NET.claimWhy || {}) },
      drops: { sent: NET.drops | 0, seen: NET.dropSeen | 0 }, // (내려가기: my own as a guest; others' shown as dust here)
      renderTick: NET.rt, newestTick: NET.buf ? NET.buf.last : -1, viewFrames: NET.viewFrames, starvedFrames: NET.starveFrames, evQ: NET.evQ.length, pred: NET.pred.length, games: NET.games.slice(),
      predSplit: NET.predSplit | 0, predGiveUp: NET.predGiveUp | 0, // (v4: predictions handed to the host row by the 6 px rule / given up)
    };
  }
  function netDebugApi() {
    return {
      // host(opts): {mode:'coop'|'battle', arena, time, perks, monsters, intrusion, bet, nick, char, net} -> Promise<code|null>
      async host(opts) {
        opts = opts || {};
        G.manual = false; clearDbg();
        if (opts.nick) netSetNick(opts.nick);
        if (opts.char) pickChar(opts.char);
        if (NET.screen !== 'friends') netOpenFriends('');
        netSetOpts(Object.assign({ mode: opts.mode || 'coop' }, opts));
        return netHost(opts.net);
      },
      // join(code, opts): {nick, char, net} -> Promise<{ok, code, reason?, text?}>
      async join(code, opts) {
        opts = opts || {};
        G.manual = false; clearDbg();
        if (opts.nick) netSetNick(opts.nick);
        if (opts.char) pickChar(opts.char);
        if (NET.screen !== 'friends') netOpenFriends('');
        return netJoin(code, opts.net);
      },
      ready: (b) => netReady(b === undefined ? true : b),
      start: (force) => netStart(!!force),
      pickChar: (id) => netPick(id),
      setNick: (s) => netSetNick(s),
      setOpts: (o) => netSetOpts(o),
      // a crafted R through the guest's reader (backward / hostile R tests) -> the options it read. Everything it sets
      // is put back afterwards, so it is harmless on any page (no session, a host); a guest's next R wins anyway
      guestRoom(R) {
        const keep = {}; for (const k of ['roster', 'mode', 'opts', 'q', 'ms', 'hostPh', 'ready', 'outR']) keep[k] = NET[k];
        let o = null;
        try { guestRoom(R && typeof R === 'object' ? R : {}); o = Object.assign({}, NET.opts); } finally { Object.assign(NET, keep); renderRoom(); }
        return o;
      },
      session: () => NET.sess,
      tap: (fn) => { netTap = typeof fn === 'function' ? fn : null; },
      // (tests) the engine's battle catch test: bubble b (as drawn) on a rival drawn at px, py
      touches: (b, px, py) => rivalTouch(bubbleScale(b, bubbleChar(b)), b.x, b.y, px, py, 0),
      state: netState,
      seat: () => seatChar(),                 // (looks-per-animal.md 10: the animal my room seat plays)
      leave: () => netLeave(''),
      toRoom: () => netToRoom(),
      openFriends: () => netOpenFriends(''),
      again: () => { if (G.gameMode === 'battle') netAgain(rematch); else retry(); },
      // the world as this page shows it, with ids (a guest: its interpolated view of the host's world)
      view() {
        return {
          frame: G.frame, phase: G.mode, renderTick: NET.rt, round: G.round, arena: G.arena,
          enemies: G.enemies.map((e) => ({ id: e.id, type: e.type, state: e.state, x: e.x, y: e.y })),
          bubbles: G.bubbles.map((b) => ({ id: b.id, kind: b.kind, state: b.state, x: b.x, y: b.y, owner: b.owner, pred: !!b.pred, victim: b.victim ? b.victim.slot : -1 })),
          items: G.items.map((it) => ({ id: it.id, type: it.type, x: it.x, y: it.y })),
          boss: G.boss ? { type: G.boss.type, state: G.boss.state, hp: G.boss.hp, soap: G.boss.soap, soapMax: G.boss.soapMax, x: G.boss.x, y: G.boss.y, giant: G.boss.giant ? { x: G.boss.giant.x, y: G.boss.giant.y } : null } : null,
          players: G.players.map((p) => ({ slot: p.slot, ep: p.ep, x: p.x, y: p.y, local: !!p.local, dead: !!p.dead, ghost: !!p.ghost, trapped: !!p.trap, ko: p.koT > 0, out: !!p.out, stunned: p.stunT > 0, score: p.score, kills: p.kills, revives: p.revives, kos: p.kos, invuln: p.invuln | 0 })),
          lives: G.lives, score: G.score, timeLeft: G.battle ? G.battle.left : null, podium: G.podium ? G.podium.order.slice() : null,
          banner: G.banner && G.frame < G.banner.end ? G.banner.main : null,
        };
      },
      // host only: the actual world per tick (to compare a guest's interpolated view against)
      trace(on) { NET.trace = on ? [] : null; },
      traceAt(k) { if (!NET.trace) return null; let best = null; for (const e of NET.trace) if (!best || Math.abs(e.k - k) < Math.abs(best.k - k)) best = e; return best; },
    };
  }

  // ------------------------------------------------------------------ debug / test API
  function playerState(p) {
    return { slot: p.slot, char: p.char, nick: p.nick, color: p.color, local: !!p.local, x: p.x, y: p.y, vx: p.vx, vy: p.vy, facing: p.facing,
      onGround: !!p.onGround, water: p.water | 0, dead: !!p.dead || !!p.out || p.koT > 0, ghost: !!p.ghost, trapped: !!p.trap, stunned: p.stunT > 0,
      ko: p.koT > 0, out: !!p.out, invuln: p.invuln | 0, shield: p.shield | 0, score: p.score, kills: p.kills, revives: p.revives, kos: p.kos, koed: p.koed,
      power: p.power ? p.power.type : null, rank: p.rank || 0, ghostLeft: p.ghost ? GHOST_FRAMES - p.ghost.t : 0, trapProg: p.trap ? p.trap.prog : 0,
      // (v4 kit moves)
      mv: p.mv || '', mvT: p.mvT | 0, hop: p.hop | 0, glideT: p.glideT | 0, airT: p.airT | 0, mvUsed: !!p.mvUsed, mvCd: p.mvCd | 0, mvA: !!p.mvA, mvB: !!p.mvB,
      carry: !!p.carry, landT: p.landT | 0, shootCd: p.shootCd | 0, autoCd: p.autoCd | 0 };
  }
  // mode = the game mode ('solo' | 'coop' | 'battle'); phase = the screen the engine is on ('title', 'playing', 'dying',
  // 'transition', 'countdown', 'paused', 'gameover', 'ending', 'podium')
  function getState() {
    const p = G.p || {};
    const bt = G.gameMode === 'battle' && G.battle;
    return {
      mode: G.gameMode, phase: G.mode, role: G.role, online: !!G.online,
      timeLeft: bt ? Math.round(bt.left / 60 * 100) / 100 : null,
      players: G.players.map(playerState), teamLives: G.gameMode === 'coop' ? G.lives : null,
      arena: bt ? G.arena : null, podium: G.podium ? G.podium.order.slice() : null,
      round: G.round, loop: G.loop, score: G.score, hiscore: G.hiscore, lives: G.lives, stamps: G.stamps, frame: G.frame,
      player: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: !!p.onGround, dead: !!p.dead, facing: p.facing, water: p.water | 0 },
      enemies: G.enemies.map((e) => ({ type: e.type, state: e.state, x: e.x, y: e.y, angry: !!e.angry, soaked: e.soakT > 0 })),
      bubbles: G.bubbles.map((b) => ({ kind: b.kind, state: b.state, x: b.x, y: b.y })),
      net: G.online || NET.sess ? netBrief() : null,
      items: G.items.length, hurry: !!G.hurry, scald: !!G.scald,
      boss: G.boss ? { type: G.boss.type, hp: G.boss.hp, soap: G.boss.soap, soapMax: G.boss.soapMax, state: G.boss.state, x: G.boss.x, y: G.boss.y, phase: G.boss.phase } : null,
      power: G.power ? { type: G.power.type, framesLeft: G.power.t } : null,
      pickup: G.pickup ? G.pickup.type : null,
      water: waterCells.length, ice: G.ice.length, drops: G.drops.length,
    };
  }
  function clearDbg() { for (const d of dbgIns) for (const k in d) d[k] = false; }
  const toList = (chars) => (Array.isArray(chars) && chars.length ? chars : ['duck', 'cat']).slice(0, MAX_PLAYERS)
    .map((c, k) => (typeof c === 'object' && c ? Object.assign({ local: true }, c) : { char: c, nick: 'P' + (k + 1), local: true }));
  // another player joins the current game in its free slot (solo becomes co-op: one more team life)
  function addLocalPlayer(char, nick, local) {
    if (G.players.length >= MAX_PLAYERS || G.attract) return -1;
    let slot = 0; while (G.players.some((q) => q.slot === slot)) slot++;
    const pl = makePlayer(spawnOf(slot), { slot, char, nick: typeof nick === 'string' ? nick : 'P' + (slot + 1), local: local !== false });
    // (a twin when anyone in the game already has this animal - the others' colours are frozen for the match)
    pl.twin = G.players.some((q) => q.char === pl.char);
    G.players.push(pl); G.players.sort((a, b) => a.slot - b.slot);
    if (G.gameMode === 'solo') G.gameMode = 'coop';
    if (G.gameMode === 'coop') {
      G.lives += 1;
      const b = G.boss; if (b && !b.intruder) b.soapMax = Math.round(b.def.soap * soapScale());
    }
    if (G.mode === 'podium') G.podium.order.push(slot);
    return slot;
  }
  // a player leaves: its animal goes away (co-op: the team keeps its lives)
  function removePlayer(slot) {
    const p = G.players.find((q) => q.slot === slot); if (!p) return false;
    if (p.trap) releasePlayer(p);
    for (const b of G.bubbles) if (b.owner === slot) b.owner = -1;
    G.players = G.players.filter((q) => q !== p);
    if (G.podium) G.podium.order = G.podium.order.filter((s) => s !== slot);
    if (!G.players.length) setupPlayers([{ char: G.sel }]);
    return true;
  }
  PG.debug = {
    getState,
    // a solo game (the duck unless another animal is named)
    start(roundIndex, char) { G.manual = true; clearDbg(); newGame(roundIndex | 0, [{ char: isChar(char) ? char : 'duck' }]); render(); return getState(); },
    step(n) { G.manual = true; n = n === undefined ? 1 : n | 0; for (let i = 0; i < n; i++) update(); render(); return getState(); },
    // hold / release an action for a player slot (0 = player 1)
    press(action, down, slot) { const d = dbgIns[clamp(slot | 0, 0, MAX_PLAYERS - 1)]; if (action in d) d[action] = !!down; },
    // several players in this one engine (all local)
    local: {
      addPlayer(char, nick) { return addLocalPlayer(char, nick); },
      removePlayer(slot) { return removePlayer(slot); },
      coop(chars, round, opts) { G.manual = true; clearDbg(); newCoop(toList(chars), round | 0, !!(opts && opts.countdown)); render(); return getState(); },
      battle(chars, opts) { G.manual = true; clearDbg(); newBattle(toList(chars), Object.assign({ countdown: false }, opts || {})); render(); return getState(); },
      players: () => G.players,
    },
    setChar(c) { const ok = pickChar(c); if (ok && G.p && G.mode !== 'title') G.p.char = c; return ok; },
    setPerks(on) { G.perksOff = !on; syncPicker(); },
    // the v4 kit of an animal as the engine runs it with perks on (bots read the numbers from here); any other id: KIT_BASE
    kit(c) { return isChar(c) ? KIT[c] : KIT_BASE; },
    // the next n frames of a capture-phase bubble's path (bots): [{x, y, r, rP, age, drop}] from stepShot on a copy, up to
    // the end of its shot phase (a floating / bursting / popped bubble, or one without a path - a guest's view row: [])
    shotPath(b, n) {
      const out = [];
      if (!b || b.state !== 'shot' || !b.ty || b.dead) return out;
      const c = Object.assign({}, b); n = clamp(n | 0, 0, SHOT_MAX + 4);
      for (let i = 0; i < n; i++) {
        c.age++; stepShot(c);
        out.push({ x: c.x, y: c.y, r: c.r, rP: c.rP, age: c.age, drop: !!c.drop });
        if (c.state !== 'shot' || --c.shotT <= 0) break;
      }
      return out;
    },
    intrude(type) { return intrude(type); },
    setTimeLeft(sec) { if (G.battle) G.battle.left = Math.max(0, Math.round(sec * 60)); },
    endBattle() { if (G.gameMode === 'battle' && G.mode !== 'podium') endBattle(); return getState(); },
    // co-op / battle helpers: knock a player down, trap one in another's bubble, mash for one
    hitPlayer(slot) { const p = G.players.find((q) => q.slot === slot); if (!p || !alive(p)) return false; if (G.gameMode === 'coop') coopDie(p); else if (G.gameMode === 'battle') stunPlayer(p); else die(); return true; },
    trapPlayer(slot, bySlot) {
      const v = G.players.find((q) => q.slot === slot); if (!v || !free(v) || G.gameMode !== 'battle') return false;
      const b = makeBubble('empty', clamp(v.x, WALL_L, WALL_R - 16), clamp(v.y, CEIL_Y, PF_BOT - 16), bySlot | 0);
      G.bubbles.push(b); trapPlayer(v, b); return true;
    },
    mash(slot) { mashTrap(G.players.find((q) => q.slot === slot)); },
    rematch() { rematch(); return getState(); },
    trapAll() {
      for (const e of G.enemies) {
        if (e.state !== 'active' && e.state !== 'descend') continue;
        if (e.state === 'descend') { e.state = 'active'; e.y = e.spawnY; }
        const b = makeBubble('empty', clamp(e.x, WALL_L, WALL_R - 16), clamp(e.y, CEIL_Y, PF_BOT - 16));
        G.bubbles.push(b); trap(e, b);
      }
    },
    // popAll also bursts a boss's giant bubble; killAll also defeats the boss
    popAll() { const chain = { n: 0, kills: 0 }; for (const b of G.bubbles.slice()) popBubble(b, chain, 'player'); if (G.boss && G.boss.state === 'stun') burstBoss(G.boss); },
    killAll() { for (const e of G.enemies) if (e.state !== 'dead') killEnemy(e, 1); if (G.boss) defeatBoss(G.boss); },
    setInvincible(v) { G.invincible = !!v; },
    gotoRound(i) { if (G.mode === 'title' || G.mode === 'gameover' || G.mode === 'ending' || G.mode === 'paused') { G.attract = false; showOverlay(null); } G.mode = 'playing'; PAL.run = false; startRound(i | 0); },
    seed(n) { rng = mulberry32((n | 0) >>> 0); fxr = mulberry32(((n | 0) ^ 0x9e3779b9) >>> 0); },
    // boss helpers (no-ops returning null outside boss rounds). A boss still in its intro enters the fight
    // first; one that is knocked down gets up first.
    soapBoss(n) {
      const b = bossReady(); if (!b) return null;
      n = n === undefined ? 1 : n | 0;
      for (let i = 0; i < n && b.state === 'fight'; i++) bossSoap(1, b.x + 16, b.y + 16);
      return getState().boss;
    },
    stunBoss() { const b = bossReady(); if (!b) return null; if (b.state === 'fight') sealBoss(b); return getState().boss; },
    damageBoss() {
      const b = bossReady(); if (!b) return null;
      if (b.state === 'fight') sealBoss(b);
      if (b.state === 'stun') burstBoss(b);
      return getState().boss;
    },
    killBoss() { if (!G.boss) return null; defeatBoss(G.boss); return getState().boss; },
    givePower(type) { return applyPower(type); },
    giveStamps(n) { addStamps(n === undefined ? 1 : n); return G.stamps; },
    spawnDrop(col) { return spawnDrop(col === undefined ? ri(2, COLS - 3) : col); },
    // internals for headless tests
    G, levels: () => LEVELS,
    spawnBubble(kind, x, y) { const b = makeBubble(kind || 'empty', x, y); G.bubbles.push(b); return b; },
    // the floating-empty rule this screen runs now (EMPTY_RULE): life (the blink starts after it), blink, cap per player
    // and for all (0: none), a capped bubble's blink; life is the one the blink uses here (a guest: its host's, g.el)
    emptyRule() { const R = emptyRule(); return { life: emptyLife(), flash: R[1], cap: R[2], all: R[3], capBlink: CAP_BLINK }; },
    // AMMO: a player's magazine now ({ left, t, n, rl, cap } or null: none here), a kit's numbers; off(true): no
    // magazine on this page at all (the older tests of the cap alone - a host then sends no g.am)
    ammo: { of(slot) { const p = slot === undefined ? G.p : G.players.find((q) => q.slot === slot); const m = p && magOf(p); return m ? { left: p.amN === undefined ? m[0] : p.amN, t: p.amN === undefined ? m[1] : p.amT, n: m[0], rl: m[1], cap: capOf(p) } : null; },
      kit: (c) => (KIT[c] || KIT_BASE).mag.slice(), base: () => KIT_BASE.mag.slice(), slack: AMMO_SLACK, off(on) { AMMO_OFF = !!on; }, dry: () => G.ammoDry | 0, refused: () => NET.amNo | 0,
      set(c, n, rl) { const k = c === 'base' ? KIT_BASE : KIT[c]; if (k) k.mag = [clamp(n | 0, 1, 9), clamp(rl | 0, 1, 9999)]; } }, // (set: balance runs only)
    spawnFromGap, spawnPickup,
    waterAt(x, y) { const i = waterIdx(x, y); return i < 0 ? null : { kind: WATER[i] === 1 ? 'hot' : 'cold', surfaceY: surfY(i) }; },
    setPlayer(x, y, slot) { const p = slot ? G.players.find((q) => q.slot === slot) : G.p; if (!p) return; p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.onGround = false; },
    arenas: () => ARENAS, chars: () => CHAR_IDS.map((id) => Object.assign({ id }, CHARS[id])), slotColors: () => SLOT_COLS.slice(),
    frames: (name) => (SPR[name] || []).map((f) => [f.w, f.h]),
    // drop one of the optional v4 sprites (a move pose / a bubble glyph) as if the art lacked it: its fallback shows
    hideSprite(name) { if (!(name in OPT_SPR) || !SPR[name]) return false; delete SPR[name]; return true; },
    // the animal whose look a bubble is drawn with on this screen (null: today's plain look) - see bubbleChar
    bubbleLook(b) { return b ? bubbleChar(b) : null; },
    // telling players apart (design/distinction.md §2.13), [] in solo: per player its seat number, twin flag, ground
    // marker ('L' | 'M' | 'S' | 'R' | '' and its spot) and name tag as last placed (canvas px: l t r b cx; null = hidden)
    looks() {
      if (!multi()) return [];
      return G.players.map((p) => {
        const m = marksOn() ? markerOf(p) : null, el = tagEls[p.slot], b = el && !el.hidden ? el._box : null;
        return { slot: p.slot, num: slotNum(p), twin: !!p.twin, marker: m ? m.k : '', mark: m ? { x: m.x, y: m.y, a: m.a, water: m.w } : null,
          tag: b ? { text: el.textContent, cmp: el.classList.contains('is-cmp'), me: el.classList.contains('is-me'), hi: el.classList.contains('is-hi'),
            l: b.l, t: b.t, r: b.r, b: b.b, cx: b.cx, ring: el._ring || '' } : null };
      });
    },
    // the "me" spotlight: frames since its last trigger (huge when none) and whether it is drawn now
    spot: () => ({ age: spotAge(), on: G.online && multi() && spotAge() >= 0 && spotAge() < (reducedMotion() ? SPOT_CALM_F : SPOT_F) }),
    // (tests) the pixels of a body pose / life_ / portrait_ frame as the twin of seat `slot` (slot 0: as drawn naturally)
    twinPixels(name, i, slot) { const f = twinFrame(frameOf(name, i), name, slot | 0); return f ? f.c.getContext('2d').getImageData(0, 0, f.w, f.h) : null; },
    pause: pauseGame, resume: resumeGame, toTitle,
    // online (PG.Net): drive the 친구와 하기 / room flow of this page like a player would
    mp: netDebugApi(),
    // v4 trophies (design/trophies.md §14)
    tro: troDebugApi(),
    // v4 shop (design/shop.md 15): the coins, the store's shop fields, the economy's pure parts
    shop: shopDebugApi(),
    // v4 cloud trophies (design/cloud-trophies.md 11): the state, a fake SDK for tests, the pure parts
    cloud: clDebugApi(),
    // the login screen (design/cloud-trophies.md "As built (login screen)")
    login: lgDebugApi(),
    pal: palDebugApi(),
    // v4 뽑기 (design/gacha.md 12): the pure draw, the odds, a test generator, the pace simulation
    draw: drawDebugApi(),
    // the standalone deploy's install UI: its state; set = { ios, inApp, framed, installed } to stage a platform
    // (only where PWA.on: the artifact keeps every field false and shows nothing whatever is set)
    // the joystick and the phone layout (src/tests/touch.js)
    stick() {
      const a = dom.app ? dom.app.classList : null, st = dom.app ? dom.app.style : null;
      return { id: STICK.id, dir: STICK.dir, nx: +STICK.nx.toFixed(3), ny: +STICK.ny.toFixed(3), dn: STICK.dn, dx: +STICK.dx.toFixed(1), dy: +STICK.dy.toFixed(1), R: STICK.R, on: Object.assign({}, touchIn),
        land: !!(a && a.contains('pg-land')), col: !!(a && a.contains('pg-land-col')), side: st ? st.getPropertyValue('--pg-side') : '', tb: st ? st.getPropertyValue('--pg-tb') : '',
        sr: st ? st.getPropertyValue('--pg-sr') : '', rotate: dom.rotate ? !dom.rotate.hidden : null, scale: +screenScale.toFixed(3), mode: G.mode };
    },
    stickReset() { stickReset(); },
    forceLand(v) { landForce = v === null || v === undefined ? null : !!v; fit(); },
    pwa(set) {
      if (PWA.on && set && typeof set === 'object') { for (const k of ['ios', 'inApp', 'framed', 'installed']) if (k in set) PWA[k] = !!set[k]; pwaSync(); }
      const vis = (el) => !!(el && !el.hidden);
      return { on: PWA.on, prompt: !!PWA.prompt, ios: PWA.ios, inApp: PWA.inApp, framed: PWA.framed, installed: PWA.installed, app: PWA.on && pwaIsApp(),
        persist: PWA.persist, install: vis(dom.install), iosHint: vis(dom.iosHint), fsBtn: vis(dom.fsBtn), fullscreen: !!fsDoc() };
    },
  };
  function troDebugApi() {
    const podOut = (P) => (P ? { mid: P.mid, kind: P.kind, n: P.n, s: P.s, net: P.net, now: P.now, promo: P.promo, bonus: P.bonus | 0, free: !!P.free, t0: P.t0, flipAt: P.flipAt, landed: P.landed,
      cups: P.fl ? P.fl.length : 0, to: P.fl ? Array.from(new Set(P.fl.map((f) => f.to))) : [], rows: Array.from(P.rows || [], ([slot, r]) => ({ slot, place: r.place, net: r.net, share: r.share | 0, free: !!r.free })) } : null);
    const api = {
      state() {
        const S = TRO.s || troFresh(), M = TRO.match;
        return { t: S.t, best: S.best, lg: leagueOf(S.t), bl: S.bl, w: S.w, g: S.g, ko: S.ko, day: S.day, de: S.de, seen: S.seen, esc: S.esc.map((e) => Object.assign({}, e)),
          dev: S.dev, mem: TRO.mem, ro: TRO.ro, key: TRO.key, tab: TRO.tab, q: NET.q, ms: NET.ms, agreed: TRO.agreed, free: TRO.free, hz: NET.hz,
          match: M ? { mid: M.mid, s: M.s, n: M.n, p: Object.assign({}, M.p), st: Object.assign({}, M.st), slots: M.slots.slice(), gg: Array.from(M.gg) } : null,
          lastRes: TRO.lastRes ? Object.assign({}, TRO.lastRes) : null, pod: podOut(TRO.pod), run: TRO.run ? Object.assign({}, TRO.run) : null,
          last: TRO.last ? Object.assign({}, TRO.last) : null, live: Array.from(TRO.live.keys()), waits: Array.from(TRO.waits.keys()) };
      },
      // merge into the store (clamped by troParse; a bad dev keeps the current one) and save
      set(o) {
        troMut((S) => { const m = troParse(JSON.stringify(Object.assign({}, S, o || {}, { v: TRO_V }))); if (m && m !== 'newer') Object.assign(S, m); });
        return api.state();
      },
      reset() { troMut((S) => { Object.assign(S, troFresh()); delete S.cs; }); return api.state(); },
      // key 'ppogeul-trophy-' + name, then troLoad() (same-origin iframes share localStorage)
      ns(name) {
        TRO.key = TRO_KEY + '-' + String(name || '').replace(/[^0-9A-Za-z_-]/g, '').slice(0, 24);
        TRO.seen = new Set(); TRO.live = new Map(); for (const id of TRO.waits.values()) clearTimeout(id); TRO.waits = new Map();
        TRO.match = null; TRO.lastRes = null; TRO.last = null; TRO.pod = null; TRO.agreed = -1; TRO.free = false;
        troLoad(); troSync(); clReboot();
        return api.state();
      },
      // (rank matches over 'bc': tests only, never from the URL; the host's own room view follows at once - troPractice
      // changed, and no guest message may come to redraw it)
      allowBc(on) { TRO.allowBc = !!on; NET.roomDirty = true; renderRoom(); },
      fast(on) { TRO.fast = !!on; },                               // (skip the minimum match time in troApply)
      today(n) { TRO.day = n === null || n === undefined ? null : nInt(n, 19700101, 99991231, null); return troToday(); },
      table: (n, s, fin, gl, gz) => troTable(n, s, fin, gl | 0, gz | 0),
      apply(m) { troResultIn(m || {}); return api.state(); },       // a 'tro' as if from the host (replay / hostile tests)
      end(why) { troSessionEnd(why || 'left'); return api.state(); },
      away(on) { TRO.awayAt = on === false ? 0 : Date.now(); },    // (false: not away - tests that start right after load)
      wait: (mid) => troWait(mid), stale: () => troStale(),
      // every pending 'wait' refund now, and troStale() as if 15 min had passed
      expire() { for (const [mid, id] of Array.from(TRO.waits)) { clearTimeout(id); troWaitEnd(mid); } troStale(Date.now() + TRO_STALE_MS + 1000); return api.state(); },
      // (unit tests) the pieces themselves: a hold, a close, a result, the 목욕 보너스 / its run, the podium data
      hold: (mid, s, n, min, nos) => troEscrow(mid, s, n, min | 0, nos | 0),
      close: (mid, how, why) => troClose(mid, how, why || 'test'),
      result: (mid, rows, slot, host, real) => troApply(mid, rows, slot, !!host, !!real),
      bonus: (ended) => troBonus(!!ended),
      run: () => (TRO.run ? Object.assign({}, TRO.run) : null),
      leagues: () => LEAGUES.map((l) => Object.assign({}, l)), stakes: () => STAKES.slice(), base: () => JSON.parse(JSON.stringify(BASE)),
      devHash: (code) => troDevHash(code), practice: () => troPractice(), canRematch: () => troCanRematch(),
      text: () => TRO_TEXT,
      openRec, closeRec,
    };
    return api;
  }

  function shopDebugApi() {
    const runOut = (R) => (R ? { done: Array.from(R.done), shots: R.shots, all: R.all, got: R.got, bonus: R.bonus, half: R.half, first: R.first, t0: R.t0, end: R.end, rv0: R.rv0 } : null);
    const api = {
      state() {
        const S = TRO.s || troFresh();
        return { co: coinBal(S), ce: S.ce, sp: S.sp, own: S.own.slice(), eq: aniLook(S.eq, G.sel), eqs: S.eq, lh: S.lh, look: myLook(G.sel), cd: S.cd, cde: S.cde, bd: S.bd, bs: S.bs, sh: S.sh, cv: S.cv,
          run: runOut(CO.run), pod: CO.pod ? Object.assign({}, CO.pod) : null, shots: CO.bshots, n: CO.n, gi: CO.gi, ok: coinOk(), prac: coinPrac(), ro: TRO.ro, mem: TRO.mem,
          lift: lookLift(G.sel, myLook(G.sel)), bare: LOOK.bare,   // (lift: my set on my picked animal)
          eqSent: CO.eqSent, looks: G.players.map((p) => ({ slot: p.slot, look: p.look || LOOK0 })),   // (S4: what this guest last told its host; the players' frozen sets)
          newDot: !!(dom.shopNew && !dom.shopNew.hidden), hub: api.hub() };
      },
      // (S3a / S3b, the hub) open it (tab 'shop' | 'my', from 'title' | 'room'), close it (closeHub), and what it shows:
      // the tab, where it came from, the 상점's slot / selected item / its button (kind and label) / armed, 마이페이지's slot,
      // the message, the coin chip, the preview (animal, look, particles alive)
      open(tab, from) { openHub(tab, from); return api.hub(); },
      close() { closeHub(); return api.hub(); },
      hub() {
        const b = dom.shopBuy, p = HUB.pp;
        return { shown: shownOverlay === 'hub', tab: HUB.tab, from: HUB.from, slot: HUB.slot, sel: HUB.sel, mySlot: HUB.mySlot, btn: b ? b.textContent : '', kind: b ? b.dataset.k || '' : '',
          armed: hubArmed(HUB.sel), msg: dom.hubMsg ? dom.hubMsg.textContent : '', co: dom.hubCo ? dom.hubCo.textContent : '', recFrom: HUB.recFrom, sawShop: HUB.sawShop, ani: hubAni(), snug: !!(dom.hubTop && dom.hubTop.classList.contains('is-snug')),
          view: { char: p ? p.char : '', look: p ? p.look : '', y: p ? p.y : 0, parts: HUB.parts.length, kfx: HUB.kfx.length, f: HUB.f } };
      },
      tick: (n) => { for (let i = 0; i < (n | 0); i++) hubTick(); return api.hub(); },
      // (looks-per-animal.md 10) the hub's animal set by hand / a preview half-tap (-1 the previous, +1 the next)
      ani(c) { if (isChar(c)) { HUB.ani = c; HUB.drawn = ''; if (shownOverlay === 'hub') hubFill(); } return api.hub(); },
      cycle(d) { hubCycle(d < 0 ? -1 : 1); return api.hub(); },   // (tests: preview frames by hand)
      // (tests: the hub's once-a-page-load things as on a new page load - the 상점 button's hop)
      pageLoad() { HUB.nudged = false; return api.hub(); },
      subj: (c) => aniSubj(c), topFit() { hubTopFit(); return api.hub(); },   // (looks-per-animal.md 8 / 4.0)
      give: (n, day) => coinGive(n, !!day),                         // the real path: soft cap, day bonus
      // merge into the store (clamped by troParse) and save
      set(o) { troMut((S) => { const m = troParse(JSON.stringify(Object.assign({}, S, o || {}, { v: TRO_V }))); if (m && m !== 'newer') Object.assign(S, m); }); return api.state(); },
      buy: (id, c) => shopBuy(id, c), wear: (slot, id, c) => lookSet(slot, id || null, c),   // (c: the animal, default my pick)
      battle: (n, fin, me, leftF, timeF, shots, kos) => coinBattle(n, fin, me, leftF, timeF, shots, kos),
      clear: (idx, ended) => coinClear(idx | 0, !!ended), end: () => coinEnd(),
      run: () => runOut(CO.run), runStart: () => { coinRunStart(); return runOut(CO.run); },
      shot: () => coinShot(myPlayer() || G.p),                       // (one blow of my animal, as fire's hook counts it)
      // (staged podium coin line: this screen's podium as if its battle paid `give`, `bonus` of it the day bonus)
      pod(give, bonus, prac) { CO.pod = { gid: coinGid(), give: give | 0, bonus: bonus | 0, prac: !!prac, rang: false }; if (shownOverlay === 'podium') fillPodium(); return Object.assign({}, CO.pod, { t1: coinT1() }); },
      allowBc(on) { CO.allowBc = !!on; NET.roomDirty = true; renderRoom(); },   // (coins over 'bc': tests only, like tro.allowBc)
      look: (c) => myLook(c), looks: () => myLooks(), parse: (s) => lookParse(s), parses: (s) => looksParse(s),
      // (S2, items in play) every animal drawn without items on this screen (comparison shots); the resolved anchors of a
      // frame; a composite (animal c, anim 'idle' | 'walk' | ..., frame fi, worn set lk) as a data URL plus its size, or
      // null when it draws bare; lookLift; headTop of a player; a portrait with items; a player's worn set (tests only:
      // looks are frozen at match start)
      bare(on) { LOOK.bare = !!on; liftCache.clear(); return LOOK.bare; },
      anchors: (name, fi) => { const A = anchorsOf(name, fi); return A ? JSON.parse(JSON.stringify(A)) : null; },
      frame(c, anim, fi, lk, tw) {
        const name = c + '_' + anim; let f = frameOf(name, fi); if (!f) return null;
        if (tw > 0) f = twinFrame(f, name, tw);
        const L = lookFrame(f, name, fi, lookParse(lk)); return L === f ? null : { url: L.c.toDataURL(), w: L.w, h: L.h };
      },
      pixels(c, anim, fi, lk, tw) { const name = c + '_' + anim; let f = frameOf(name, fi); if (!f) return null; if (tw > 0) f = twinFrame(f, name, tw); const L = lookFrame(f, name, fi, lookParse(lk)), s = mk(L.w, L.h), x = s.getContext('2d'); x.drawImage(L.c, 0, 0); return { w: L.w, h: L.h, d: Array.from(x.getImageData(0, 0, L.w, L.h).data) }; },
      portrait(c, lk, tw) { const f = lookPortrait(c, lookParse(lk), tw | 0); if (!f) return null; const s = mk(f.w, f.h), x = s.getContext('2d'); x.drawImage(f.c, 0, 0); return { w: f.w, h: f.h, d: Array.from(x.getImageData(0, 0, f.w, f.h).data) }; },
      item(id, part) { const it = itemFrame(id, part); if (!it) return null; const s = mk(it.w, it.h), x = s.getContext('2d'); x.drawImage(it.c, 0, 0); return { w: it.w, h: it.h, px: it.px, py: it.py, d: Array.from(x.getImageData(0, 0, it.w, it.h).data) }; },
      lift: (c, lk) => lookLift(c, lookParse(lk)), reach: (c, lk) => lookReach(c, lookParse(lk)),
      headTop: (slot) => { const p = G.players.find((q) => q.slot === (slot | 0)); return p ? headTop(p) : null; },
      dress(slot, lk) { const p = G.players.find((q) => q.slot === (slot | 0)); if (!p) return null; p.look = lookParse(lk); p.lfx = null; return p.look; },
      items: () => ITEMS.map((it) => Object.assign({}, it)), text: () => SHOP_TEXT, coin: () => Object.assign({}, COIN, { place: JSON.parse(JSON.stringify(COIN.place)), day: COIN.day.slice() }),
      dayAdd: (d, k) => troDayAdd(d, k),
      // (tests, gacha.md 13.2: an item retired from the 상점 by hand - nothing buys it; the draw's lists are built at load)
      retire(id, on) { if (isItemId(id)) { if (on) ITEM[id].retired = 1; else delete ITEM[id].retired; } return isItemId(id) && !!ITEM[id].retired; },
    };
    return api;
  }

  // ------------------------------------------------------------------ boot
  let booted = false;
  function boot(data) {
    if (booted) return; booted = true;
    data = data || {};
    try { if (typeof PG._stopEngine === 'function') PG._stopEngine(); } catch (e) { /* ignore */ }
    PG._stopEngine = stopEngine;
    bakeSprites();
    loadLevels();
    const sc = sget('ppogeul-char'); if (isChar(sc)) G.sel = sc;
    const stored = parseInt(sget('ppogeul-hiscore') || '0', 10) || 0;
    G.hiscore = Math.max(stored, (data && +data.hiscore) || 0);
    TRO.tab = troRand(6); troLoad(); // (trophies: this page load's tab id, then the store - the gift on a first visit)
    setupDOM();
    toTitle();
    clBoot(); // (cloud trophies: a linked browser listens again, a sign-in redirect comes back; nothing without the cloud)
    if (!NET.joinLink) lgBoot(); // (the login screen before the title: not linked, never played as a guest - deploy / preview only)
    if (NET.joinLink) netOpenFriends(''); // (an invite link: straight to 친구와 하기, code filled in)
    render();
    requestAnimationFrame(loop);
  }
  try { window.claude?.hot?.snapshot?.(() => ({ hiscore: G.hiscore })); } catch (e) { /* ignore */ }
  window.claude?.hot?.ready ? window.claude.hot.ready(boot) : boot(window.claude?.hot?.data ?? {});
})();
