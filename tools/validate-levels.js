#!/usr/bin/env node
/* Validates bogeul/src/levels.js (PG.LEVELS + PG.ARENAS) against the shared level spec (v3) and prints
 * an ASCII preview of every round and battle arena. Exit code 1 when anything breaks a hard rule.
 *
 *   node tools/validate-levels.js             full report (maps + problems + arena fairness tables)
 *   node tools/validate-levels.js --quiet     problems + summary only (fairness tables still printed)
 *   node tools/validate-levels.js --round 7   a single entry (1-based index into PG.LEVELS)
 *   node tools/validate-levels.js --arena 2   a single battle arena (1-based index into PG.ARENAS)
 *   node tools/validate-levels.js --party 1   a single party arena (1-based index into PG.PARTY_ARENAS)
 *   node tools/validate-levels.js --file x.js validate another file instead of src/levels.js
 *
 * Layout (v2): 24 entries — normal rounds 1-5, BOSS, 6-10, BOSS, 11-15, BOSS, 16-20, FINAL BOSS
 * (boss entries at indices 5, 11, 17, 23: kingGrime, moldQueen, megaSponge, towelKing).
 *
 * Map cells: '#' block, '.' empty, '~' hot water (온탕), '=' cold water (냉탕). Water is liquid
 * (non-solid). Water rules:
 *   - resting: every water cell has water or a block directly below it;
 *   - flat surface: a pool's (4-connected water component's) top row is its surface — every water
 *     cell with no water above it sits on that row, and no block sits directly on top of water;
 *   - one kind per pool (and hot never touches cold, even diagonally);
 *   - pools stay clear of the wrap gaps: never on the ceiling/floor rows, no water in the gap columns
 *     or the column next to them within 3 rows of the drain / showerhead, and no COLD water anywhere
 *     in that lane (drain bubbles rise straight up it and would freeze);
 *   - (warning) a cold surface wants 2 open rows above it, since ice blocks are 2x2 cells;
 *   - pools stay away from every player spawn (no water within 3 cells of a spawn's two cells);
 *   - (warning) a water cell with open air beside it is an unwalled pool edge.
 *
 * Reachability model (conservative version of the engine physics: jump apex ~4.75 tiles,
 * walk 1.25 px/f, full air control, one-way interior platforms, floor/ceiling wrap gap, the rubber
 * duck floats on water with ~5 px submerged and can jump from the surface):
 *   - a "surface" is a horizontal run of blocks on one row with at least one open cell above it, or a
 *     run of water-surface cells (the floating duck can stand on any water surface);
 *   - from a surface you can walk along it, walk off either end (falling straight down, with one
 *     column of air-control drift; falling into water stops at the surface; falling through the floor
 *     gap re-enters from the ceiling gap; walking off a block into water on the same row floats you on
 *     it, but you cannot step from the water sideways onto a block on the same row — hop instead),
 *     jump UP onto any surface whose top is 1..4 rows higher (1..3 from a water surface, since the duck
 *     sits 5 px low: the engine clears 4 rows from water by only ~1 px, so 3 is the safe design limit)
 *     and which has a standable cell within 4 columns of your span with no water in that column on the
 *     way up, or hop ACROSS/DOWN to a surface at the same height or lower within 4 columns when the
 *     landing column is clear (no blocks, no water) on the way down.
 *   src/tests/levels-engine.js replays the water routes this model relies on in the real engine.
 * Travel-time model (v3, for fairness): the same moves on a per-cell graph, each costed in frames with
 * the engine's constants (walk 6.4 f/tile, ×1.25 in water; jumps and falls integrated with GRAV 0.22,
 * JUMP_V -4.1, MAX_FALL 3.5, air time and horizontal travel overlap). Running off an edge is simulated frame
 * by frame (still holding the direction for 0-4 columns, then straight down, wrapping through the drain), so
 * drop-down routes are not undercounted. Dijkstra over it gives the time from a spawn to any standable cell;
 * tables print it in seconds.
 * Boss entries: `boss` + `bossSpawn {col,row}` = top-left cell of the 4x4-cell body. The body cells must
 * be empty air; kingGrime / megaSponge must stand on blocks (all 4 cells under the body are '#').
 *
 * v3 — online co-op and battle:
 *   players  every PG.LEVELS entry has `players: [{col,row} x4]` (P1..P4). P1 equals `player`. Each spawn
 *            follows the P1 rules (an open dry cell on a block with 2 tiles of dry footing, no water within
 *            3 cells, no boss body within 6 tiles, no enemy start within 6 tiles of P1 / 4 tiles of P2-P4 —
 *            the team shares P1's corner and most rounds keep an enemy shelf 5-6 tiles above it), spawns do not overlap (same or adjacent row ->
 *            at least 2 columns apart), P2-P4 stay near P1 (within 12 tiles) and every spawn can walk/jump
 *            to every other spawn and back (co-op ghosts respawn at their own spawn).
 *   PG.ARENAS 4 battle arenas { name, theme, map, players: [4 spawns], enemySpawns: [6 x {col,row}], gather,
 *            water? } — names 대중탕 한판 / 냉온탕 대결 / 사우나 계단 / 때밀이 링. `water: true` exactly when the map
 *            has pools. Same map, water and surface rules as the rounds, plus:
 *              - the wrap gap is exactly 3 columns (the 보스 난입 intruder may be a 4-column ground boss);
 *              - cols 12-17, rows 2-6 are open air: the intruder's 4x4 body enters with its top-left at col 12
 *                (intrude()) or col 14 (makeBoss default), row 2 for walkers / row 3 for fliers, and a walker
 *                drops from there;
 *              - player spawns as above, spread out (at least 8 tiles apart, Chebyshev), mutually reachable, and
 *                no two on the same row within capture-shot range (11 tiles);
 *              - enemy spawns stand on dry blocks (2 tiles of footing) on reachable surfaces, do not overlap,
 *                stay out of the intruder box and keep > 6 tiles from every player spawn;
 *              - fairness (travel-time model): each spawn's time to the arena centre, its mean round trip to
 *                the three rivals, its nearest rival and its exposure (time for the nearest enemy spawn to
 *                reach it, moving like an enemy: gravity-bound - walks and drops, climbs only by rare short hops
 *                straight up; see enemyCost) must agree across the four spawns within the FAIR_* tolerances below.
 *                (The engine-side check of the same thing: src/tests/arena-gate.js, real enemies vs idle players.)
 *
 * Map legend in the preview: '#' block, '~' hot water, '=' cold water, 'x' standable block the duck can
 * never reach, '?' water surface the duck can never reach, '@' gather point, 'P' player spawn (P1) and
 * '2'/'3'/'4' the other co-op spawns, enemies G/M/F/S (upper case faces right, lower case faces left), boss
 * body K/Q/Z/T (kingGrime, moldQueen, megaSponge, towelKing). Arenas: '1'-'4' player spawns, 'E' enemy
 * spawns, ':' the intruder boss box, '+' the centre cell(s) used for the fairness times.
 *
 * 파티 (design/party.md 5.4) - PG.PARTY_ARENAS { key, name, theme, closed: true, map, players: [4], gather, rise? | goals?, sides?, ball? }:
 * the same cell, shape and spawn rules as the battle arenas, except: a closed ceiling and floor are required (rows 0
 * and 25 all '#', no wrap gap) and the intruder box / enemy spawn / spread / fairness rules do not apply; the map is
 * mirror symmetric exactly (col c <-> 31 - c, no gap exception) and dry (the rising water is a layer, not tile water);
 * the four spawns are standable and mutually reachable (the BFS has no wrap edge here) and every surface is reachable
 * from them. 물 (key 'water', rise): every tier is reachable from the floor, and for every rise step the tiers it drowns
 * (a tier is out once its top is more than WATER_SLACK = 3 px under the surface) are exactly the k + 1 lowest, with one
 * more dry tier above (each step drowns one tier, the top shelves stay dry to the end); the floor is dry at y0; the steps
 * do not overlap and end before the game's 75 s. 축구 (key 'ball', goals / sides / ball): each goal mouth (rows r0-r1,
 * cols c0-c1) is open air on the floor under a solid bar (row r0 - 1), the left one at the left wall, the right one its
 * mirror, and line is the mouth's inner edge; the sides are two standable kickoff spots per team, mirrored; the ball's
 * kickoff spot is open air for the whole 22 px ball. Its crossbars are out of a normal jump's reach on purpose (a cat's
 * 2단 점프 keeps goal on one): an unreachable crossbar is a note (the 'x' in the preview), not an error or a warning.
 * 무대 목욕탕 (key 'stage'): a plain box, every STAGE_X spot standable. 살금살금 복도 (key 'sneak', sneak: { start, it,
 * line }, design/party-games.md 6.6): start and it standable on the floor, start left of it, the line at least 120 px
 * past the start's body and short of the 술래's; nothing solid on rows 21-24 between them but stools 1-2 tiles high
 * with 3 rows of air over them.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROWS = 26;
const COLS = 32;
const IN_L = 2; // first interior column
const IN_R = 29; // last interior column
const MAX_UP = 4; // rows a jump can climb from a block surface
const MAX_UP_WATER = 3; // rows a jump can climb from a water surface (the duck floats ~5 px low)
const REACH = 4; // columns of horizontal travel credited to a jump
const SAFE_DIST = 6; // no enemy / boss body within this many tiles (Chebyshev) of the P1 spawn (and of battle spawns)
const SAFE_DIST_COOP = 4; // co-op spawns P2-P4: no enemy start within this many tiles (they share P1's corner)
const POOL_SPAWN_DIST = 3; // no water within this many tiles (Chebyshev) of a player spawn's cells
const TYPES = ['grime', 'mold', 'fly', 'sponge'];
const GROUND = new Set(['grime', 'mold', 'sponge']);
const LETTER = { grime: 'G', mold: 'M', fly: 'F', sponge: 'S' };
const N_ENTRIES = 24;
const BOSS_AT = { 5: 'kingGrime', 11: 'moldQueen', 17: 'megaSponge', 23: 'towelKing' };
const BOSS_TYPES = ['kingGrime', 'moldQueen', 'megaSponge', 'towelKing'];
const BOSS_LETTER = { kingGrime: 'K', moldQueen: 'Q', megaSponge: 'Z', towelKing: 'T' };
const GROUND_BOSS = new Set(['kingGrime', 'megaSponge']);
const BOSS_POOL = { moldQueen: '~', megaSponge: '=' }; // arenas that must contain a pool of this kind
const MIN_POOL_ROUNDS = 6; // normal rounds that must contain water
// v3
const N_PLAYERS = 4;
const NEAR = 12; // co-op spawns P2-P4 within this many tiles (Chebyshev) of P1
const ARENA_NAMES = ['대중탕 한판', '냉온탕 대결', '사우나 계단', '때밀이 링'];
const ARENA_GAP = 3; // battle arenas: wrap gap width (a 4-column ground boss may intrude)
// the 보스 난입 intruder's 4x4 body enters with its top-left at col 12 (game.js intrude()) or col 14 (makeBoss's
// default), row 2 for walkers / row 3 for fliers: keep the union of those boxes open
const INTRUDER = { c0: 12, c1: 17, r0: 2, r1: 6 };
const ARENA_SPREAD = 8; // battle spawns at least this many tiles apart (Chebyshev)
const SHOT_RANGE = 11; // capture shots fly 3.5 px/f x 22 f = 77 px (~10 tiles): rival spawns on the same row stay farther apart
const N_ENEMY_SPAWNS = 6;
const CENTRE = { x: 15.5, y: 12.5 }; // arena centre, in feet-cell coordinates
// fairness tolerances: (max - min) / mean across the four spawns; spreads under FAIR_ABS seconds always pass.
// The centre is the reachable standable cell(s) closest to CENTRE (plus any within half a tile of that distance).
const FAIR_CENTRE = 0.25;
const FAIR_RIVAL = 0.2;
const FAIR_NEAREST = 0.3;
// (exposure is a coarse static proxy - nearest enemy spawn only, no dwell time - so its tolerance is wider; the
// engine gate src/tests/arena-gate.js measures the real pressure: stuns per spawn within 2x, first stun >= 4 s)
const FAIR_ENEMY = 0.5;
// enemy exposure model (see enemyCost): grime walks at 0.6 px/f vs the duck's 1.25; an up-hop waits ~4 s on average
const ENEMY_SLOW = 1.25 / 0.6;
const ENEMY_UP_COST = 240;
const FAIR_ABS = 0.3;
// engine physics (src/game.js)
const TS = 8;
const GRAV = 0.22;
const MAX_FALL = 3.5;
const WALK = 1.25;
const JUMP_V = -4.1;
const WATER_SLOW = 0.8;
const FLOAT_SUB = 5;

const argv = process.argv.slice(2);
const QUIET = argv.includes('--quiet');
const ri = argv.indexOf('--round');
const ai = argv.indexOf('--arena');
const pi = argv.indexOf('--party');
const ONLY = ri >= 0 ? parseInt(argv[ri + 1], 10) : 0;
const ONLY_ARENA = ai >= 0 ? parseInt(argv[ai + 1], 10) : 0;
const ONLY_PARTY = pi >= 0 ? parseInt(argv[pi + 1], 10) : 0;
const fi = argv.indexOf('--file'); // alternate levels file (used to self-test the validator)

// ── load src/levels.js in a fake browser global ────────────────────────────
const file = fi >= 0 ? path.resolve(argv[fi + 1]) : path.join(__dirname, '..', 'src', 'levels.js');
const code = fs.readFileSync(file, 'utf8');
const fatal = (m) => { console.log(`FATAL: ${m}`); process.exit(1); };
if (/<\/script/i.test(code)) fatal('levels.js contains a literal closing script tag (it would end the page\'s inline script)');
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
try {
  vm.runInContext(code, ctx, { filename: 'levels.js' });
} catch (e) {
  fatal(`levels.js threw while loading: ${e && e.stack}`);
}
const LEVELS = ctx.PG && ctx.PG.LEVELS;
if (!Array.isArray(LEVELS)) fatal('PG.LEVELS is not an array');
const ARENAS = ctx.PG && ctx.PG.ARENAS;
const PARTY_ARENAS = ctx.PG && ctx.PG.PARTY_ARENAS;
const PARTY_KEYS = ['water', 'ball', 'stage', 'sneak'];   // (파티: 물 차는 대욕장, 거품 축구장, 무대 목욕탕, 살금살금 복도)
const PARTY_NAMES = ['물 차는 대욕장', '거품 축구장', '무대 목욕탕', '살금살금 복도'];
const STAGE_X = { 2: [100, 156], 3: [72, 128, 184], 4: [44, 100, 156, 212] };   // (game.js STAGE_X: world: false feet centres by players)
const BALL_R = 11; // (game.js BALL.r: the 축구 ball's radius, px)
const WATER_SLACK = 3, WATER_SECS = 60, CEIL_Y = 24; // (game.js MINI.water / WATER_SLACK; the ceiling's underside)

const isWaterCh = (ch) => ch === '~' || ch === '=';
const isCell = (p) => !!p && typeof p === 'object' && Number.isInteger(p.col) && Number.isInteger(p.row);
const cheb = (a, b) => Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));

// frames until the feet come back down through dyPx below the take-off height (negative = higher),
// integrating like the engine's physBody; Infinity when the arc never gets there
const airMemo = new Map();
function airTime(dyPx, v0) {
  const key = `${dyPx}|${v0}`;
  if (airMemo.has(key)) return airMemo.get(key);
  let vy = v0;
  let y = 0;
  let out = Infinity;
  let apex = 0;
  for (let t = 1; t < 600; t++) {
    const vy0 = vy;
    vy = Math.min(MAX_FALL, vy + GRAV);
    y += (vy0 + vy) / 2;
    apex = Math.min(apex, y);
    if (vy >= 0 && y >= dyPx) { out = apex <= dyPx ? t : Infinity; break; }
  }
  airMemo.set(key, out);
  return out;
}

// ── per-map analysis (kind: 'level' | 'arena') ─────────────────────────────
function analyse(L, idx, kind) {
  const E = [];
  const W = [];
  const err = (m) => E.push(m);
  const warn = (m) => W.push(m);
  const res = { E, W, N: [], lines: [], info: '', water: { hot: 0, cold: 0, pools: 0 }, fair: null };
  const party = kind === 'party';
  const arena = kind === 'arena';
  const spawns4 = arena || party;   // (both list players: [4 spawns], P1 first)

  if (!L || typeof L !== 'object') { err(`${arena ? 'arena' : 'round'} is not an object`); return res; }
  const isBoss = !arena && !party && L.boss !== undefined;
  if (typeof L.name !== 'string' || !L.name.trim()) err('name missing');
  if (!Number.isInteger(L.theme) || L.theme < 0 || L.theme > 4) err('theme must be an integer 0..4');
  const known = party ? new Set(['key', 'name', 'theme', 'closed', 'map', 'players', 'gather', 'rise', 'goals', 'sides', 'ball', 'sneak'])
    : arena ? new Set(['name', 'theme', 'map', 'players', 'enemySpawns', 'gather', 'water'])
      : new Set(['name', 'theme', 'map', 'player', 'players', 'enemies', 'gather', 'special', 'boss', 'bossSpawn']);
  for (const k of Object.keys(L)) if (!known.has(k)) warn(`unknown field "${k}"`);
  if (party) {
    if (L.closed !== true) err('party arenas must say closed: true (no wrap gap)');
    if (typeof L.key !== 'string' || !L.key) err('key missing');
  }
  if (!arena && !party) {
    if (L.special !== undefined && L.special !== 'steam') err("special must be 'steam' or absent");
    if (isBoss && L.special !== undefined) err('boss rounds cannot have a special');
    if (!isBoss && L.bossSpawn !== undefined) err('bossSpawn without boss');
  }

  const map = L.map;
  if (!Array.isArray(map) || map.length !== ROWS) {
    err(`map must have ${ROWS} rows (has ${map && map.length})`);
    return res;
  }
  let shapeOk = true;
  map.forEach((row, r) => {
    if (typeof row !== 'string') { err(`row ${r} is not a string`); shapeOk = false; return; }
    if (row.length !== COLS) { err(`row ${r} has ${row.length} chars (needs ${COLS}): "${row}"`); shapeOk = false; }
    if (/[^#.~=]/.test(row)) { err(`row ${r} has characters other than '#', '.', '~' and '='`); shapeOk = false; }
  });
  if (!shapeOk) return res;

  const inMap = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
  const at = (r, c) => (inMap(r, c) ? map[r][c] : '#');
  const B = (r, c) => inMap(r, c) && map[r][c] === '#';
  const Wt = (r, c) => inMap(r, c) && isWaterCh(map[r][c]);
  const O = (r, c) => inMap(r, c) && map[r][c] === '.';

  // side walls
  for (let r = 0; r < ROWS; r++) {
    for (const c of [0, 1, 30, 31]) if (!B(r, c)) err(`side wall missing at row ${r}, col ${c}`);
  }

  // ceiling / floor wrap gap
  for (const r of [0, ROWS - 1]) {
    for (let c = 0; c < COLS; c++) if (Wt(r, c)) err(`water on the ${r ? 'floor' : 'ceiling'} row at col ${c}`);
  }
  const openCols = (r) => {
    const cols = [];
    for (let c = IN_L; c <= IN_R; c++) if (!B(r, c)) cols.push(c);
    return cols;
  };
  const g0 = openCols(0);
  const gap = party ? [] : openCols(ROWS - 1);
  if (party) {
    if (g0.length || openCols(ROWS - 1).length) err(`a party arena is closed: the ceiling and floor rows are all blocks (open: [${g0}] / [${openCols(ROWS - 1)}])`);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (map[r][c] !== map[r][COLS - 1 - c]) { err(`not mirror symmetric: (${c},${r}) '${map[r][c]}' vs (${COLS - 1 - c},${r}) '${map[r][COLS - 1 - c]}'`); r = ROWS; break; }
  } else {
    if (g0.join() !== gap.join()) err(`ceiling gap [${g0}] differs from floor gap [${gap}]`);
    if (gap.length < 2 || gap.length > 6) err(`wrap gap must be 2-6 columns wide (is ${gap.length})`);
  }
  if (arena && gap.length !== ARENA_GAP) err(`battle arenas need a ${ARENA_GAP}-column wrap gap (is ${gap.length}): the intruder boss may be a 4-column walker`);
  for (let i = 1; i < gap.length; i++) {
    if (gap[i] !== gap[i - 1] + 1) { err('wrap gap columns must be consecutive'); break; }
  }
  const gapSet = new Set(gap);

  // every wrap column must have something to land on, or falling things loop forever
  for (const c of gap) {
    let hit = false;
    for (let r = 1; r < ROWS - 1; r++) if (B(r, c) || Wt(r, c)) { hit = true; break; }
    if (!hit) err(`nothing to land on below ceiling-gap column ${c} (falling things would loop forever)`);
  }

  // ── player spawns: P1 (`player`, rounds) and `players` (rounds: P1..P4 co-op, arenas: battle) ──
  const P = spawns4 ? (Array.isArray(L.players) ? L.players[0] : null) : L.player;
  const spawnOk = isCell(P);
  const pc = spawnOk ? P.col : -99;
  const pr = spawnOk ? P.row : -99;
  const PL = Array.isArray(L.players) ? L.players : [];
  const plOk = PL.length === N_PLAYERS && PL.every(isCell);
  if (!Array.isArray(L.players)) err(`players missing (needs ${N_PLAYERS} spawns {col,row}, P1 first)`);
  else if (PL.length !== N_PLAYERS) err(`players must list exactly ${N_PLAYERS} spawns (has ${PL.length})`);
  else PL.forEach((s, i) => { if (!isCell(s)) err(`players[${i}] is not an integer {col,row}`); });
  if (!spawns4 && plOk && spawnOk && (PL[0].col !== pc || PL[0].row !== pr)) {
    err(`players[0] (${PL[0].col},${PL[0].row}) must equal player (${pc},${pr})`);
  }
  // every spawn the water / enemy distance rules apply to
  const spawns = plOk ? PL.slice() : spawnOk ? [P] : [];

  // ── water ──
  const poolId = Array.from({ length: ROWS }, () => new Array(COLS).fill(-1));
  const pools = [];
  const lane = new Set();
  if (gap.length) for (let c = gap[0] - 1; c <= gap[gap.length - 1] + 1; c++) lane.add(c);
  for (let r = 1; r < ROWS - 1; r++) {
    for (let c = IN_L; c <= IN_R; c++) {
      if (!Wt(r, c) || poolId[r][c] >= 0) continue;
      const id = pools.length;
      const cells = [];
      const q = [[r, c]];
      poolId[r][c] = id;
      while (q.length) {
        const [y, x] = q.pop();
        cells.push([y, x]);
        for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const yy = y + dy;
          const xx = x + dx;
          if (Wt(yy, xx) && poolId[yy][xx] < 0) { poolId[yy][xx] = id; q.push([yy, xx]); }
        }
      }
      pools.push({ id, cells });
    }
  }
  for (const pool of pools) {
    const kinds = new Set(pool.cells.map(([y, x]) => map[y][x]));
    const top = Math.min(...pool.cells.map(([y]) => y));
    const xs = pool.cells.map(([, x]) => x);
    const tag = `pool at row ${top} cols ${Math.min(...xs)}-${Math.max(...xs)}`;
    if (kinds.size > 1) err(`${tag} mixes hot and cold water`);
    const kind0 = map[pool.cells[0][0]][pool.cells[0][1]];
    if (kind0 === '~') res.water.hot += pool.cells.length; else res.water.cold += pool.cells.length;
    res.water.pools++;
    let notFlat = 0;
    let open = 0;
    let coldLow = 0;
    const nearSpawn = new Set();
    for (const [y, x] of pool.cells) {
      if (!(Wt(y + 1, x) || B(y + 1, x))) err(`${tag}: water at (${x},${y}) does not rest on water or a block`);
      if (B(y - 1, x)) err(`${tag}: water at (${x},${y}) is covered by a block (a pool's top row is its surface)`);
      if (!Wt(y - 1, x) && y !== top) notFlat++;
      if (O(y, x - 1) || O(y, x + 1)) open++;
      if (lane.has(x) && (y <= 3 || y >= ROWS - 4)) err(`${tag}: water at (${x},${y}) touches the wrap gap (cols ${gap[0] - 1}-${gap[gap.length - 1] + 1}, rows 1-3 / 22-24)`);
      else if (lane.has(x) && map[y][x] === '=') err(`${tag}: cold water at (${x},${y}) is in the drain lane (cols ${gap[0] - 1}-${gap[gap.length - 1] + 1}); drain bubbles rising through it would freeze`);
      if (map[y][x] === '=' && !Wt(y - 1, x) && !(O(y - 1, x) && O(y - 2, x))) coldLow++;
      spawns.forEach((s, i) => {
        if (nearSpawn.has(i)) return;
        if (Math.max(Math.min(Math.abs(x - s.col), Math.abs(x - s.col - 1)), Math.abs(y - s.row)) <= POOL_SPAWN_DIST) {
          nearSpawn.add(i);
          err(`${tag}: water at (${x},${y}) is within ${POOL_SPAWN_DIST} tiles of the ${spawns.length > 1 ? `P${i + 1} ` : 'player '}spawn`);
        }
      });
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ch = at(y + dy, x + dx);
          if (isWaterCh(ch) && ch !== map[y][x]) err(`${tag}: hot and cold water touch at (${x},${y})`);
        }
      }
    }
    if (notFlat) err(`${tag}: surface is not flat (${notFlat} cells below the top row have no water above)`);
    if (open) warn(`${tag}: ${open} water cell(s) have open air beside them (unwalled edge)`);
    if (coldLow) warn(`${tag}: ${coldLow} cold surface cell(s) lack 2 open rows above (ice blocks are 2 cells tall)`);
  }
  if (party && pools.length) err('party arenas are dry (the rising water is a layer of the minigame, not tile water)');
  if (arena) {
    if (L.water !== undefined && typeof L.water !== 'boolean') err('water must be true or absent');
    if (pools.length && L.water !== true) err('the map has pools: set water: true');
    if (!pools.length && L.water) err('water: true but the map has no pools');
  }

  // ── surfaces: runs of blocks or of water-surface cells ──
  const runs = [];
  const runAt = Array.from({ length: ROWS }, () => new Array(COLS).fill(-1));
  for (let r = 1; r < ROWS; r++) {
    let c = IN_L;
    while (c <= IN_R) {
      const ch = map[r][c];
      if (ch === '.') { c++; continue; }
      const water = isWaterCh(ch);
      const a = c;
      while (c <= IN_R && (water ? Wt(r, c) : B(r, c))) c++;
      const b = c - 1;
      const stand = [];
      for (let x = a; x <= b; x++) if (O(r - 1, x)) stand.push(x);
      if (stand.length) {
        const id = runs.length;
        runs.push({ id, r, a, b, stand, water });
        for (let x = a; x <= b; x++) runAt[r][x] = id;
      }
    }
  }
  for (const R of runs) {
    if (R.r < 3 && R.r < ROWS - 1) warn(`surface on row ${R.r} (cols ${R.a}-${R.b}) is too close to the ceiling to stand on`);
  }

  // falling down column c, starting level with row `from` (map[from][c] is open): { id, drop (rows) }
  const fallInfo = (c, from) => {
    for (let q = from; q < ROWS; q++) if (!O(q, c)) return runAt[q][c] >= 0 ? { id: runAt[q][c], drop: q - from } : null;
    if (!gapSet.has(c)) return null;
    for (let q = 1; q < ROWS - 1; q++) if (!O(q, c)) return runAt[q][c] >= 0 ? { id: runAt[q][c], drop: q + ROWS - from } : null;
    return null;
  };
  const fall = (c, from) => { const f = fallInfo(c, from); return f ? f.id : null; };
  const noWater = (x, r0, r1) => {
    for (let q = r0; q <= r1; q++) if (Wt(q, x)) return false;
    return true;
  };

  const neighbours = (S) => {
    const out = new Set();
    // jump up through one-way platforms (into a pool from below too)
    const up = S.water ? MAX_UP_WATER : MAX_UP;
    for (const T of runs) {
      if (T.r >= S.r || T.r < S.r - up || T.r < 3) continue;
      if (T.stand.some((x) => x >= S.a - REACH && x <= S.b + REACH && (T.water || noWater(x, T.r, S.r - 1)))) out.add(T.id);
    }
    // walk off either end, with one column of drift outward
    for (const side of [-1, 1]) {
      const e = side < 0 ? S.a - 1 : S.b + 1;
      if (e < IN_L || e > IN_R) continue;
      for (const x of [e, e + side]) {
        if (x < IN_L || x > IN_R) continue;
        if (!O(S.r, x)) {
          // block -> water on the same row: walk in and float. water -> block: can't step up onto it.
          if (!(S.water && B(S.r, x)) && runAt[S.r][x] >= 0) out.add(runAt[S.r][x]);
          break;
        }
        const t = fall(x, S.r);
        if (t !== null) out.add(t);
      }
    }
    // hop across to the same height, or down, when the landing column is clear
    for (const T of runs) {
      if (T.id === S.id || T.r < S.r) continue;
      for (const x of T.stand) {
        if (x >= S.a && x <= S.b) continue;
        if (x < S.a - REACH || x > S.b + REACH) continue;
        let clear = true;
        for (let q = Math.max(1, S.r - 1); q < T.r; q++) if (!O(q, x)) { clear = false; break; }
        if (clear) { out.add(T.id); break; }
      }
    }
    out.delete(S.id);
    return out;
  };
  const adj = runs.map(neighbours);
  const bfs = (from) => {
    const seen = new Set([from]);
    const q = [from];
    while (q.length) {
      const id = q.shift();
      for (const n of adj[id]) if (!seen.has(n)) { seen.add(n); q.push(n); }
    }
    return seen;
  };

  // ── travel-time model: the same moves per standable cell, costed in frames ──
  const nodes = [];
  const nodeAt = new Map(); // surface row * COLS + col -> node index
  for (const R of runs) for (const x of R.stand) { nodeAt.set(R.r * COLS + x, nodes.length); nodes.push({ x, r: R.r, run: R }); }
  const tileT = (water) => TS / (WALK * (water ? WATER_SLOW : 1)); // frames per tile walked
  const airT = TS / WALK; // frames per tile of horizontal air travel
  const nearestStand = (R, x) => R.stand.reduce((m, s) => (Math.abs(s - x) < Math.abs(m - x) ? s : m), R.stand[0]);
  // stepping off column e (feet level with the top of row r0) and drifting k columns toward `side` at walking
  // speed while falling (engine integration, wrapping through the floor gap): where and when the duck lands
  const runOff = (e, side, k, r0) => {
    let px = 0;
    let vy = 0;
    let feet = r0 * TS;
    for (let t = 1; t < 400; t++) {
      px = Math.min(k * TS, px + WALK);
      const c = e + side * Math.round(px / TS); // column under the duck's centre
      const vy0 = vy;
      vy = Math.min(MAX_FALL, vy + GRAV);
      const f0 = feet;
      feet += (vy0 + vy) / 2;
      for (let q = Math.floor(f0 / TS) + 1; q * TS <= feet && q < ROWS; q++) {
        if (nodeAt.has(q * COLS + c)) return { r: q, c, t };
      }
      if (feet >= ROWS * TS) {
        if (!gapSet.has(c)) return null;
        feet -= ROWS * TS; // out of the drain, in from the showerhead
      }
    }
    return null;
  };
  let edges = null;
  const buildEdges = () => nodes.map((n) => {
    const out = [];
    const S = n.run;
    const x = n.x;
    const wt = tileT(S.water);
    const lift = S.water ? FLOAT_SUB : 0; // the floating duck takes off 5 px low
    const add = (T, xx, t, up) => {
      let k = nodeAt.get(T.r * COLS + xx);
      if (k === undefined) k = nodeAt.get(T.r * COLS + nearestStand(T, xx));
      if (k !== undefined && Number.isFinite(t)) out.push([k, t, up || 0, Math.abs(xx - x)]);
    };
    const i = S.stand.indexOf(x);
    if (i > 0) add(S, S.stand[i - 1], (x - S.stand[i - 1]) * wt);
    if (i < S.stand.length - 1) add(S, S.stand[i + 1], (S.stand[i + 1] - x) * wt);
    for (const side of [-1, 1]) {
      const e = side < 0 ? S.a - 1 : S.b + 1;
      if (e < IN_L || e > IN_R) continue;
      const walkT = Math.abs(e - x) * wt;
      if (!O(S.r, e)) {
        if (!(S.water && B(S.r, e)) && runAt[S.r][e] >= 0) add(runs[runAt[S.r][e]], e, walkT);
        continue;
      }
      // run off the edge, still holding the direction for 0..REACH columns, then straight down
      for (let k = 0; k <= REACH; k++) {
        if (e + side * k < IN_L || e + side * k > IN_R) break;
        const land = runOff(e, side, k, S.r);
        if (land) add(runs[runAt[land.r][land.c]], land.c, walkT + land.t);
      }
    }
    const up = S.water ? MAX_UP_WATER : MAX_UP;
    for (const T of runs) {
      if (T.id === S.id) continue;
      if (T.r < S.r) {
        if (T.r < S.r - up || T.r < 3) continue;
        for (const xx of T.stand) {
          if (Math.abs(xx - x) > REACH || !(T.water || noWater(xx, T.r, S.r - 1))) continue;
          add(T, xx, Math.max(airTime(-(S.r - T.r) * TS + lift, JUMP_V), Math.abs(xx - x) * airT), S.r - T.r);
        }
      } else {
        for (const xx of T.stand) {
          if ((xx >= S.a && xx <= S.b) || Math.abs(xx - x) > REACH) continue;
          let clear = true;
          for (let q = Math.max(1, S.r - 1); q < T.r; q++) if (!O(q, xx)) { clear = false; break; }
          if (clear) add(T, xx, Math.max(airTime((T.r - S.r) * TS + lift, JUMP_V), Math.abs(xx - x) * airT));
        }
      }
    }
    return out;
  });
  // frames from the spawn cell {col,row} to every node (Infinity = unreachable). cost(t, up, dx) prices an edge
  // (default: the duck's own time); an enemy prices climbs very differently (enemyCost)
  const travel = (s, cost) => {
    if (!edges) edges = buildEdges();
    const dist = new Array(nodes.length).fill(Infinity);
    const k0 = nodeAt.get((s.row + 1) * COLS + s.col);
    if (k0 === undefined) return dist;
    dist[k0] = 0;
    const done = new Uint8Array(nodes.length);
    for (;;) {
      let u = -1;
      for (let k = 0; k < nodes.length; k++) if (!done[k] && dist[k] < Infinity && (u < 0 || dist[k] < dist[u])) u = k;
      if (u < 0) break;
      done[u] = 1;
      for (const [v, t, up, dx] of edges[u]) {
        const c = cost ? cost(t, up, dx) : t;
        if (dist[u] + c < dist[v]) dist[v] = dist[u] + c;
      }
    }
    return dist;
  };
  // the grime family is gravity-bound: it walks (slower than the duck) and drops freely, but only hops UP onto a
  // platform 2-4 rows right above it (its centre column), now and then while its target is higher - so a climb costs
  // ENEMY_UP_COST frames on top of the jump, and anything the duck reaches with a long or sideways jump it never does
  const enemyCost = (t, up, dx) => (up > 0 ? (up >= 2 && up <= MAX_UP && dx <= 1 ? t * ENEMY_SLOW + ENEMY_UP_COST : Infinity) : t * ENEMY_SLOW);
  const nodeOf = (s) => nodeAt.get((s.row + 1) * COLS + s.col);
  const sec = (f) => (Number.isFinite(f) ? (f / 60).toFixed(2) : '  ∞ ');

  // is {col,row} a valid dry spawn standing on blocks? returns the surface id or -1 (and reports)
  const standCheck = (s, tag, strictTop) => {
    if (s.col < IN_L || s.col > IN_R - 1 || s.row < 1 || s.row > ROWS - 2) { err(`${tag} (${s.col},${s.row}) outside the playfield`); return -1; }
    if (!O(s.row, s.col) || !B(s.row + 1, s.col)) { err(`${tag} (${s.col},${s.row}) must be an open (dry) cell on top of a block`); return -1; }
    if (!O(s.row, s.col + 1) || !B(s.row + 1, s.col + 1)) err(`${tag} (${s.col},${s.row}) needs 2 tiles of dry footing (col ${s.col + 1} too)`);
    if (strictTop && (B(s.row - 1, s.col) || B(s.row - 1, s.col + 1))) warn(`${tag} (${s.col},${s.row}) has a block inside the sprite's upper half`);
    if (s.row + 1 < 3) err(`${tag} (${s.col},${s.row}): platform too close to the ceiling`);
    const id = runAt[s.row + 1][s.col];
    if (id < 0) err(`${tag} (${s.col},${s.row}) is not on a standable surface`);
    return id;
  };

  // P1 + reachability from it
  let reach = new Set();
  let start = -1;
  if (!spawnOk) {
    err(spawns4 ? 'players[0] missing' : 'player spawn missing or not integer {col,row}');
  } else {
    const id = standCheck(P, spawns4 ? 'P1 spawn' : 'player spawn', true);
    if (id >= 0) {
      start = id;
      reach = bfs(start);
      const stuck = [...reach].filter((rid) => !bfs(rid).has(start));
      for (const rid of stuck) {
        const R = runs[rid];
        warn(`from ${R.water ? 'the water at ' : ''}row ${R.r} cols ${R.a}-${R.b} the duck cannot get back to the spawn surface`);
      }
    }
  }

  // P2..P4 (rounds: co-op, near P1) / all four (arenas: battle, spread out)
  const spawnRun = [];
  if (plOk) {
    PL.forEach((s, i) => {
      if (i === 0) { spawnRun[0] = start; return; }
      spawnRun[i] = standCheck(s, `P${i + 1} spawn`, true);
    });
    for (let i = 0; i < N_PLAYERS; i++) {
      for (let j = 0; j < i; j++) {
        const a = PL[i];
        const b = PL[j];
        if (Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) < 2) err(`P${i + 1} spawn (${a.col},${a.row}) overlaps P${j + 1} (${b.col},${b.row}) (needs 2+ columns apart)`);
        if (arena && cheb(a, b) < ARENA_SPREAD) err(`P${i + 1} and P${j + 1} spawns are only ${cheb(a, b)} tiles apart (battle spawns need ${ARENA_SPREAD}+)`);
        if (arena && Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= SHOT_RANGE) err(`P${i + 1} and P${j + 1} spawns face each other within bubble range (${Math.abs(a.col - b.col)} tiles on the same row; needs > ${SHOT_RANGE})`);
      }
      if (!spawns4 && i > 0 && spawnOk && cheb(PL[i], P) > NEAR) err(`P${i + 1} spawn (${PL[i].col},${PL[i].row}) is ${cheb(PL[i], P)} tiles from P1 (co-op spawns stay within ${NEAR})`);
    }
    // every spawn can get to every other spawn and back
    if (spawnRun.every((id) => id >= 0)) {
      const sets = spawnRun.map((id) => bfs(id));
      for (let i = 0; i < N_PLAYERS; i++) {
        for (let j = 0; j < N_PLAYERS; j++) {
          if (i !== j && !sets[i].has(spawnRun[j])) err(`P${j + 1} spawn cannot be reached from P${i + 1}`);
        }
      }
    }
  }

  // unreachable surfaces
  let lostCells = 0;
  for (const R of runs) {
    if (reach.has(R.id)) continue;
    lostCells += R.stand.length;
    const m = `${R.water ? 'water surface' : 'surface'} row ${R.r} cols ${R.a}-${R.b} (${R.stand.length} standable) is unreachable from the spawn`;
    // (축구: a crossbar is out of a normal jump's reach on purpose - only a cat's 2단 점프 keeps goal on it)
    const bar = party && L.key === 'ball' && Array.isArray(L.goals) && L.goals.some((q) => q && R.r === q.r0 - 1 && R.b >= q.c0 && R.a <= q.c1);
    if (bar) res.N.push(`the crossbar (${m.replace(' is unreachable from the spawn', '')}) is out of a normal jump's reach: a cat's 2단 점프 keeps goal on it`);
    else if (R.stand.length >= 3) err(m);
    else warn(m);
  }

  // enemies (rounds)
  const counts = {};
  const en = L.enemies;
  if (!arena && !party) {
    if (!Array.isArray(en)) err('enemies must be an array');
    else {
      if (isBoss) {
        if (en.length > 4) err(`boss rounds take at most 4 placed enemies (has ${en.length}); the engine spawns minions`);
      } else if (en.length < 3 || en.length > 8) err(`needs 3-8 enemies (has ${en.length})`);
      en.forEach((e, i) => {
        const tag = `enemy #${i} ${e && e.type} (${e && e.col},${e && e.row})`;
        if (!e || !TYPES.includes(e.type)) { err(`enemy #${i} has unknown type "${e && e.type}"`); return; }
        counts[e.type] = (counts[e.type] || 0) + 1;
        if (e.dir !== 1 && e.dir !== -1) err(`${tag}: dir must be 1 or -1`);
        if (!Number.isInteger(e.col) || !Number.isInteger(e.row)) { err(`${tag}: col/row must be integers`); return; }
        if (e.col < IN_L || e.col > IN_R - 1 || e.row < 1 || e.row > ROWS - 2) { err(`${tag}: outside the playfield`); return; }
        if (Wt(e.row, e.col) || Wt(e.row, e.col + 1)) err(`${tag}: starts in water`);
        if (GROUND.has(e.type)) {
          if (B(e.row, e.col) || !B(e.row + 1, e.col)) err(`${tag}: ground enemy must stand on a block`);
          else {
            if (B(e.row, e.col + 1) || !B(e.row + 1, e.col + 1)) err(`${tag}: needs 2 tiles of footing (col ${e.col + 1} too)`);
            const host = runAt[e.row + 1][e.col];
            if (host < 0) err(`${tag}: host surface is covered`);
            else if (!reach.has(host)) err(`${tag}: its platform is unreachable for the duck`);
            if (e.row + 1 < 3) err(`${tag}: platform too close to the ceiling`);
          }
        } else if (B(e.row, e.col) || B(e.row, e.col + 1)) err(`${tag}: flies must start in open air`);
        spawns.forEach((s, si) => {
          const d = cheb(e, s);
          const need = si ? SAFE_DIST_COOP : SAFE_DIST;
          if (d <= need) err(`${tag}: only ${d} tiles from the ${si ? `P${si + 1}` : 'player'} spawn (needs > ${need})`);
        });
        for (let j = 0; j < i; j++) {
          const o = en[j];
          if (o && o.row === e.row && Math.abs(o.col - e.col) < 2) warn(`${tag} overlaps enemy #${j}`);
        }
      });
    }
  }

  // enemy spawns (arenas)
  const ES = Array.isArray(L.enemySpawns) ? L.enemySpawns : [];
  const esRun = [];
  if (arena) {
    if (!Array.isArray(L.enemySpawns)) err(`enemySpawns missing (needs ${N_ENEMY_SPAWNS} {col,row})`);
    else if (ES.length !== N_ENEMY_SPAWNS) err(`enemySpawns must list exactly ${N_ENEMY_SPAWNS} cells (has ${ES.length})`);
    ES.forEach((e, i) => {
      const tag = `enemySpawns[${i}]`;
      if (!isCell(e)) { err(`${tag} is not an integer {col,row}`); esRun[i] = -1; return; }
      const id = standCheck(e, tag, false);
      esRun[i] = id;
      if (id >= 0 && !reach.has(id)) err(`${tag} (${e.col},${e.row}): its platform is unreachable for the players`);
      if (e.col + 1 >= INTRUDER.c0 && e.col <= INTRUDER.c1 && e.row >= INTRUDER.r0 && e.row <= INTRUDER.r1 + 1) err(`${tag} (${e.col},${e.row}) is inside the intruder boss box`);
      spawns.forEach((s, si) => {
        const d = cheb(e, s);
        if (d <= SAFE_DIST) err(`${tag} (${e.col},${e.row}) is only ${d} tiles from the P${si + 1} spawn (needs > ${SAFE_DIST})`);
      });
      for (let j = 0; j < i; j++) {
        const o = ES[j];
        if (isCell(o) && Math.abs(o.row - e.row) <= 1 && Math.abs(o.col - e.col) < 2) err(`${tag} (${e.col},${e.row}) overlaps enemySpawns[${j}]`);
      }
    });
    // the 보스 난입 intruder enters at the engine's default boss spawn
    for (let r = INTRUDER.r0; r <= INTRUDER.r1; r++) {
      for (let c = INTRUDER.c0; c <= INTRUDER.c1; c++) if (!O(r, c)) err(`intruder boss box (cols ${INTRUDER.c0}-${INTRUDER.c1}, rows ${INTRUDER.r0}-${INTRUDER.r1}) must be open air: (${c},${r}) is '${map[r][c]}'`);
    }
    spawns.forEach((s, si) => {
      const dx = Math.max(0, INTRUDER.c0 - (s.col + 1), s.col - INTRUDER.c1);
      const dy = Math.max(0, INTRUDER.r0 - s.row, s.row - (INTRUDER.r1 + 1));
      if (Math.max(dx, dy) <= 2) err(`P${si + 1} spawn (${s.col},${s.row}) is right next to the intruder boss box`);
    });
  }

  // boss (rounds)
  const BS = L.bossSpawn;
  let bossOk = false;
  if (isBoss) {
    if (!BOSS_TYPES.includes(L.boss)) err(`unknown boss "${L.boss}" (expected ${BOSS_TYPES.join(' / ')})`);
    if (!BS || !Number.isInteger(BS.col) || !Number.isInteger(BS.row)) err('boss round needs an integer bossSpawn {col,row}');
    else if (BS.col < IN_L || BS.col + 3 > IN_R || BS.row < 1 || BS.row + 3 > ROWS - 2) err(`bossSpawn (${BS.col},${BS.row}): the 4x4 body leaves the playfield`);
    else {
      bossOk = true;
      for (let r = BS.row; r < BS.row + 4; r++) {
        for (let c = BS.col; c < BS.col + 4; c++) if (!O(r, c)) err(`bossSpawn (${BS.col},${BS.row}): body cell (${c},${r}) is not empty air`);
      }
      if (GROUND_BOSS.has(L.boss)) {
        for (let c = BS.col; c < BS.col + 4; c++) if (!B(BS.row + 4, c)) err(`bossSpawn (${BS.col},${BS.row}): ${L.boss} must stand on blocks (cell (${c},${BS.row + 4}) is not '#')`);
      } else if (BS.row > 8) warn(`${L.boss} starts low (row ${BS.row}); it is a flier`);
      spawns.forEach((s, si) => {
        const dx = Math.max(0, BS.col - (s.col + 1), s.col - (BS.col + 3));
        const dy = Math.max(0, BS.row - s.row, s.row - (BS.row + 3));
        if (Math.max(dx, dy) <= SAFE_DIST) err(`bossSpawn (${BS.col},${BS.row}) is only ${Math.max(dx, dy)} tiles from the ${si ? `P${si + 1}` : 'player'} spawn (needs > ${SAFE_DIST})`);
      });
    }
    const need = BOSS_POOL[L.boss];
    if (need && !pools.some((pl) => map[pl.cells[0][0]][pl.cells[0][1]] === need)) {
      err(`${L.boss} arena needs a ${need === '~' ? 'hot (~)' : 'cold (=)'} pool`);
    }
  }

  // gather point
  const G = L.gather;
  if (!G || !Number.isInteger(G.col) || !Number.isInteger(G.row)) err('gather point missing');
  else if (G.col < IN_L || G.col > IN_R || G.row < 1 || G.row > ROWS - 2) err(`gather (${G.col},${G.row}) outside the playfield`);
  else {
    if (B(G.row, G.col)) err(`gather (${G.col},${G.row}) is inside a block`);
    if (Wt(G.row, G.col)) err(`gather (${G.col},${G.row}) is in water`);
    if (G.row > (arena ? 14 : 6)) warn(`gather row ${G.row} is low (usually 2-4${arena ? ', or the middle of an arena' : ''})`);
    let solid = 0;
    for (let r = G.row - 1; r <= G.row + 1; r++) for (let c = G.col - 2; c <= G.col + 2; c++) if (B(r, c)) solid++;
    if (solid > 3) warn(`gather point is crowded by ${solid} blocks`);
    let wet = false;
    for (let r = G.row; r <= Math.min(ROWS - 2, G.row + 2); r++) for (let c = G.col - 1; c <= G.col + 1; c++) if (Wt(r, c)) wet = true;
    if (wet) err(`gather (${G.col},${G.row}) sits right above water (clusters would touch the surface)`);
    // battle: a player who walks into the floor drain falls in through the showerhead, straight down the drop
    // columns (gap +-2): the gather (bubbles, trapped rivals) must sit under a lid there, deep enough (4+ rows) that
    // someone standing on the lid does not touch the cluster - no free pops / KOs without aiming
    if (arena && gap.length && G.col >= gap[0] - 2 && G.col <= gap[gap.length - 1] + 2) {
      let lid = -1;
      for (let r = 1; r < ROWS - 1 && lid < 0; r++) if (B(r, G.col)) lid = r;
      if (lid < 0 || G.row < lid) err(`gather (${G.col},${G.row}) is in the drain-drop column with nothing above it: a drop through the floor drain lands in the cluster`);
      else if (G.row - lid < 4) err(`gather (${G.col},${G.row}) is only ${G.row - lid} rows under the lid at row ${lid} (needs 4+: the cluster would touch a player standing on it)`);
    }
  }

  // density
  let blocks = 0;
  for (let r = 1; r < ROWS - 1; r++) for (let c = IN_L; c <= IN_R; c++) if (B(r, c)) blocks++;
  const density = blocks / ((ROWS - 2) * (IN_R - IN_L + 1));
  if (density > 0.3) warn(`very dense map (${Math.round(density * 100)}% blocks)`);

  // ── travel times: co-op spawns (info), battle fairness (rules) ──
  const centreNodes = [];
  if (plOk && !party && spawnRun.every((id) => id >= 0)) {
    const T = PL.map((s) => travel(s));
    const tAt = (i, s) => { const k = nodeOf(s); return k === undefined ? Infinity : T[i][k]; };
    if (!arena) {
      res.coop = PL.slice(1).map((s, i) => `P${i + 2} ${sec(tAt(0, s))}s/${sec(tAt(i + 1, P))}s`).join(' · ');
    } else {
      // centre: the reachable standable cells closest to the middle of the arena (feet cell = surface row - 1)
      const dc = (n) => Math.hypot(n.x - CENTRE.x, n.r - 1 - CENTRE.y);
      let best = Infinity;
      nodes.forEach((n) => { if (reach.has(n.run.id)) best = Math.min(best, dc(n)); });
      nodes.forEach((n, k) => { if (reach.has(n.run.id) && dc(n) <= best + 0.51) centreNodes.push(k); });
      const rows = PL.map((s, i) => {
        const toC = Math.min(...centreNodes.map((k) => T[i][k]));
        const rt = PL.map((o, j) => (i === j ? null : (tAt(i, o) + tAt(j, s)) / 2)).filter((v) => v !== null);
        const rival = rt.reduce((a, b) => a + b, 0) / rt.length;
        const nearest = Math.min(...rt);
        return { toC, rival, nearest, enemy: Infinity };
      });
      const ET = ES.map((e, i) => (esRun[i] >= 0 ? travel(e, enemyCost) : null));
      PL.forEach((s, i) => {
        const k = nodeOf(s);
        for (const d of ET) if (d && k !== undefined) rows[i].enemy = Math.min(rows[i].enemy, d[k]);
      });
      const spread = (key, tol, label) => {
        const v = rows.map((r) => r[key]);
        if (v.some((x) => !Number.isFinite(x))) { err(`fairness: ${label} is unreachable for some spawn`); return '∞'; }
        const mean = v.reduce((a, b) => a + b, 0) / v.length;
        const d = Math.max(...v) - Math.min(...v);
        const pct = mean > 0 ? d / mean : 0;
        if (d / 60 > FAIR_ABS && pct > tol) err(`fairness: ${label} differs by ${(d / 60).toFixed(2)} s (${Math.round(pct * 100)}% of the mean; limit ${Math.round(tol * 100)}%)`);
        return `${Math.round(pct * 100)}%`;
      };
      res.fair = {
        rows,
        spreads: {
          toC: spread('toC', FAIR_CENTRE, 'time to the centre'),
          rival: spread('rival', FAIR_RIVAL, 'mean round trip to the rivals'),
          nearest: spread('nearest', FAIR_NEAREST, 'round trip to the nearest rival'),
          enemy: spread('enemy', FAIR_ENEMY, 'exposure (nearest enemy spawn -> spawn)'),
        },
      };
    }
  }

  // preview
  const grid = map.map((row) => row.split('').map((ch) => (ch === '.' ? ' ' : ch)));
  for (const R of runs) if (!reach.has(R.id)) for (const x of R.stand) grid[R.r][x] = R.water ? '?' : 'x';
  const put = (r, c, ch) => { if (grid[r] && grid[r][c] !== undefined) grid[r][c] = ch; };
  if (arena) {
    for (let r = INTRUDER.r0; r <= INTRUDER.r1; r++) for (let c = INTRUDER.c0; c <= INTRUDER.c1; c++) if (grid[r][c] === ' ') grid[r][c] = ':';
    for (const k of centreNodes) put(nodes[k].r - 1, nodes[k].x, '+');
  }
  if (bossOk) {
    for (let r = BS.row; r < BS.row + 4; r++) for (let c = BS.col; c < BS.col + 4; c++) grid[r][c] = BOSS_LETTER[L.boss] || 'B';
  }
  if (G) put(G.row, G.col, '@');
  if (Array.isArray(en)) {
    for (const e of en) {
      if (!e) continue;
      const ch = LETTER[e.type] || '?';
      put(e.row, e.col, e.dir === -1 ? ch.toLowerCase() : ch);
    }
  }
  for (const e of ES) if (isCell(e)) put(e.row, e.col, 'E');
  PL.forEach((s, i) => { if (isCell(s)) put(s.row, s.col, i === 0 && !spawns4 ? 'P' : String(i + 1)); });
  if (!spawns4 && spawnOk) put(pr, pc, 'P');
  // 물 (5.4): each rise step drowns exactly the next tier, one dry tier above; dry at y0; steps apart, before 75 s
  if (party && L.key === 'water') {
    const R = L.rise, top = (r) => 16 + r * TS;
    const tiers = [...new Set(runs.filter((q) => !q.water).map((q) => q.r))].sort((a, b) => b - a);   // (the floor first)
    if (!R || typeof R !== 'object' || !Array.isArray(R.steps) || !R.steps.length) err('the water arena needs rise: { y0, warn, steps: [[from s, to s, level y] ...] }');
    else {
      const out = (level) => tiers.filter((r) => top(r) > level + WATER_SLACK).length;
      if (!(Number.isFinite(R.y0) && out(R.y0) === 0)) err(`rise.y0 ${R.y0} must leave the floor dry (its top ${top(tiers[0])} within ${WATER_SLACK} px)`);
      if (!(Number.isFinite(R.warn) && R.warn >= 0 && R.warn <= 10)) err('rise.warn must be 0..10 s');
      let last = -1;
      R.steps.forEach((q, k) => {
        if (!Array.isArray(q) || q.length !== 3 || !q.every(Number.isFinite)) { err(`rise.steps[${k}] must be [from s, to s, level y]`); return; }
        if (!(q[1] > q[0]) || q[0] < last) err(`rise.steps[${k}] [${q}] overlaps the step before or runs backwards`);
        if (q[1] >= WATER_SECS) err(`rise.steps[${k}] ends at ${q[1]} s, not before the game's ${WATER_SECS} s`);
        last = q[1];
        const n = out(q[2]);
        if (n !== k + 1) err(`rise.steps[${k}] (level ${q[2]}) drowns ${n} tier(s), not exactly the ${k + 1} lowest`);
        else if (k + 1 >= tiers.length) err(`rise.steps[${k}] (level ${q[2]}) leaves no dry tier above`);
      });
      res.rise = R.steps.map((q, k) => `${q[0]}-${q[1]} s -> ${q[2]} (row ${tiers[k]} under, row ${tiers[k + 1]} dry)`).join(' · ');
      // 물 v2 (design/party-polish.md 4.1.1 / 10.4): each surge peak drowns exactly the tier above its level and no higher,
      // overlapping no step; the flood after the last step, ending before secs - 1, its level at most CEIL_Y + 16 -
      // WATER_SLACK - 1 (an animal with its head on the ceiling has its feet under it: everybody goes out); soaps inside
      // the game and before the flood; the revive spots standable on the top shelves and mirrored
      const steps = R.steps.filter((q) => Array.isArray(q) && q.length === 3 && q.every(Number.isFinite)), lastEnd = steps.length ? steps[steps.length - 1][1] : 0;
      const levelAt = (t) => { let y = R.y0; for (const q of steps) { if (t <= q[0]) break; if (t < q[1]) return null; y = q[2]; } return y; };
      (Array.isArray(R.surges) ? R.surges : []).forEach((q, k) => {
        if (!Array.isArray(q) || q.length !== 3 || !q.every(Number.isFinite) || !(q[1] > 0)) { err(`rise.surges[${k}] must be [at s, length s, peak y]`); return; }
        const a = levelAt(q[0]), b = levelAt(q[0] + q[1]);
        if (a === null || b === null || a !== b || steps.some((st) => q[0] < st[1] && q[0] + q[1] > st[0])) { err(`rise.surges[${k}] [${q}] overlaps a step`); return; }
        if (out(q[2]) !== out(a) + 1) err(`rise.surges[${k}] (peak ${q[2]} over level ${a}) drowns ${out(q[2]) - out(a)} more tier(s), not exactly the one above`);
        if (q[0] + q[1] >= WATER_SECS) err(`rise.surges[${k}] runs past the game's ${WATER_SECS} s`);
      });
      const F = R.flood, maxL = CEIL_Y + 16 - WATER_SLACK - 1;
      if (F !== undefined && F !== null) {
        if (!Array.isArray(F) || F.length !== 3 || !F.every(Number.isFinite) || !(F[1] > F[0])) err('rise.flood must be [from s, to s, level y]');
        else {
          if (F[0] < lastEnd) err(`rise.flood starts at ${F[0]} s, before the last step ends (${lastEnd} s)`);
          if (F[1] > WATER_SECS - 1) err(`rise.flood ends at ${F[1]} s, after the game's ${WATER_SECS} - 1 s (the last one out needs its second)`);
          if (F[2] > maxL) err(`rise.flood level ${F[2]} leaves a dry spot (at most ${maxL}: feet under it with the head on the ceiling)`);
          if ((R.surges || []).some((q) => Array.isArray(q) && q[0] + q[1] > F[0])) err('a surge runs into the flood');
        }
      }
      (Array.isArray(R.soaps) ? R.soaps : []).forEach((v, k) => { if (!Number.isFinite(v) || v <= 0 || v >= WATER_SECS || (Array.isArray(F) && v >= F[0])) err(`rise.soaps[${k}] ${v} must be inside the game and before the flood`); });
      const RV = Array.isArray(R.revive) ? R.revive : [], topRow = tiers[tiers.length - 1];
      if (RV.length) {
        RV.forEach((q, k) => { if (!q || !Number.isInteger(q.col) || !Number.isInteger(q.row) || q.row + 1 !== topRow || L.map[q.row][q.col] !== '.' || L.map[q.row + 1][q.col] === '.') err(`rise.revive[${k}] must be a spot standing on a top shelf (row ${topRow - 1})`); });
        if (RV.length !== 2 || !RV[0] || !RV[1] || RV[1].row !== RV[0].row || RV[1].col !== COLS - 1 - RV[0].col) err('rise.revive must be two mirrored spots');
      }
      if (Array.isArray(R.surges) && R.surges.length) res.rise += ' · surges ' + R.surges.map((q) => `${q[0]} s +${q[1]} -> ${q[2]}`).join(', ');
      if (Array.isArray(F)) res.rise += ` · flood ${F[0]}-${F[1]} s -> ${F[2]}`;
    }
  }
  // 축구 (5.4): each goal mouth open air on the floor under a solid bar (the left one at the left wall, the right one
  // its mirror), line its inner edge; two standable, mirrored kickoff spots per team; the ball's spot open air
  if (party && L.key === 'ball') {
    const Gs = L.goals, int = Number.isInteger;
    if (!Array.isArray(Gs) || Gs.length !== 2 || !Gs.every((q) => q && ['c0', 'c1', 'r0', 'r1', 'line'].every((k) => int(q[k])))) err('the ball arena needs goals: [left, right] { c0, c1, r0, r1, line } (integers)');
    else {
      Gs.forEach((q, k) => {
        const tag = `goals[${k}] (cols ${q.c0}-${q.c1}, rows ${q.r0}-${q.r1})`;
        if (!(q.c0 >= IN_L && q.c1 <= IN_R && q.c0 <= q.c1 && q.r0 >= 2 && q.r1 <= ROWS - 2 && q.r0 <= q.r1)) { err(`${tag} is outside the field or empty`); return; }
        for (let r = q.r0; r <= q.r1; r++) for (let c = q.c0; c <= q.c1; c++) if (!O(r, c)) err(`${tag}: the mouth is not open air at (${c},${r})`);
        for (let c = q.c0; c <= q.c1; c++) { if (!B(q.r0 - 1, c)) err(`${tag}: no crossbar over the mouth at (${c},${q.r0 - 1})`); if (!B(q.r1 + 1, c)) err(`${tag}: the mouth is not on the floor at (${c},${q.r1 + 1})`); }
        if ((q.r1 - q.r0 + 1) * TS < 2 * BALL_R + 2) err(`${tag}: the mouth is ${(q.r1 - q.r0 + 1) * TS} px tall - the ${2 * BALL_R} px ball does not fit under the bar`);
        const line = k ? q.c0 * TS : (q.c1 + 1) * TS;
        if (q.line !== line) err(`${tag}: line ${q.line} must be the mouth's inner edge (${line})`);
      });
      const [a, b] = Gs;
      if (a.c0 !== IN_L) err(`goals[0] must open at the left wall (c0 ${IN_L}, has ${a.c0})`);
      if (b.c0 !== COLS - 1 - a.c1 || b.c1 !== COLS - 1 - a.c0 || b.r0 !== a.r0 || b.r1 !== a.r1 || b.line !== COLS * TS - a.line) err('goals[1] must mirror goals[0]');
    }
    const S = L.sides;
    if (!Array.isArray(S) || S.length !== 2 || !S.every((t) => Array.isArray(t) && t.length === 2 && t.every(isCell))) err('the ball arena needs sides: [[left x2], [right x2]] {col,row}');
    else {
      S.forEach((t, k) => t.forEach((s, j) => standCheck(s, `sides[${k}][${j}]`, true)));
      S[0].forEach((s, j) => { const m = S[1][j]; if (m.row !== s.row || m.col !== COLS - 1 - s.col) err(`sides[1][${j}] (${m.col},${m.row}) must mirror sides[0][${j}] (${s.col},${s.row}) -> (${COLS - 1 - s.col},${s.row})`); });
      S.forEach((t, k) => t.forEach((s, j) => { if ((k ? s.col < 16 : s.col > 15)) err(`sides[${k}][${j}] (${s.col},${s.row}) is on the other team's half`); }));
    }
    const Bl = L.ball;
    if (!Bl || !Number.isFinite(Bl.x) || !Number.isFinite(Bl.y)) err('the ball arena needs ball: {x, y} (px)');
    else {
      if (Bl.x - BALL_R < TS * IN_L || Bl.x + BALL_R > TS * (IN_R + 1) || Bl.y - BALL_R < 16 + TS || Bl.y + BALL_R > 16 + (ROWS - 1) * TS) err(`ball (${Bl.x},${Bl.y}) is not inside the field`);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (!B(r, c)) continue;
        const nx = Math.max(c * TS, Math.min(Bl.x, c * TS + TS)), ny = Math.max(16 + r * TS, Math.min(Bl.y, 16 + r * TS + TS));
        if (Math.hypot(Bl.x - nx, Bl.y - ny) < BALL_R) { err(`ball (${Bl.x},${Bl.y}) overlaps the block at (${c},${r})`); r = ROWS; break; }
      }
    }
    if (Array.isArray(Gs) && Gs.length === 2) res.ball = Gs.map((q, k) => `${k ? 'right' : 'left'} goal cols ${q.c0}-${q.c1} rows ${q.r0}-${q.r1} line ${q.line}`).join(' · ') + (Bl ? ` · kickoff (${Bl.x}, ${Bl.y})` : '');
  }
  // 무대 목욕탕 (design/party-games.md 3.1): a plain box - nothing solid between rows 1 and 24 (a world: false game draws
  // its own scene over it), and every STAGE_X spot (2 / 3 / 4 players: the feet centres in px) standable on the floor
  if (party && L.key === 'stage') {
    for (let r = 1; r <= ROWS - 2; r++) for (let c = IN_L; c <= IN_R; c++) if (!O(r, c)) { err(`the stage is a plain box: (${c},${r}) is not open air`); r = ROWS; break; }
    const spots = [];
    for (const n of Object.keys(STAGE_X)) for (const cx of STAGE_X[n]) {
      spots.push(cx);
      if (cx - 8 < TS * IN_L || cx + 8 > TS * (IN_R + 1)) { err(`STAGE_X[${n}] spot ${cx}: the 16 px body is not inside the walls`); continue; }
      for (let c = Math.floor((cx - 8) / TS); c <= Math.floor((cx + 7) / TS); c++) {
        if (!O(ROWS - 2, c) || !O(ROWS - 3, c)) err(`STAGE_X[${n}] spot ${cx}: no room for the body at col ${c}`);
        if (!B(ROWS - 1, c)) err(`STAGE_X[${n}] spot ${cx}: no floor under col ${c}`);
      }
    }
    res.stage = `spots ${Object.keys(STAGE_X).map((n) => `${n}: ${STAGE_X[n].join('/')}`).join(' · ')}`;
  }
  // 살금살금 복도 (design/party-games.md 6.6): the runners' start and the 술래's spot standable on the floor, start left of
  // it, the touch line between them at least 120 px past the start's body; nothing solid on rows 21-24 between them but
  // the stools - each one 1-2 tiles high with 3 rows of air over it (a normal jump clears it)
  if (party && L.key === 'sneak') {
    const S = L.sneak;
    if (!S || typeof S !== 'object' || !isCell(S.start) || !isCell(S.it) || !Number.isFinite(S.line)) err('the sneak arena needs sneak: { start: {col,row}, it: {col,row}, line (px) }');
    else {
      standCheck(S.start, 'sneak.start', true); standCheck(S.it, 'sneak.it', true);
      const sx = S.start.col * TS - 4, ix = S.it.col * TS - 4;
      if (S.start.row !== ROWS - 2 || S.it.row !== ROWS - 2) err(`sneak.start / sneak.it stand on the floor (row ${ROWS - 2})`);
      if (!(S.start.col < S.it.col)) err('sneak.start must be left of sneak.it');
      if (!(S.line - (sx + 16) >= 120)) err(`sneak.line ${S.line} is less than 120 px past the start's body (its right edge ${sx + 16})`);
      if (!(S.line <= ix)) err(`sneak.line ${S.line} must not pass the 술래's body (x ${ix})`);
      // the stools: runs of solid cells standing on the floor between them
      const lo = S.start.col + 2, hi = S.it.col - 1, stools = [];
      for (let c = lo; c <= hi; c++) {
        let h = 0; while (h < 4 && B(ROWS - 2 - h, c)) h++;
        for (let r = 21; r <= ROWS - 2 - h; r++) if (!O(r, c)) err(`sneak: (${c},${r}) between the start and the 술래 must be open air (only stools stand on the floor)`);
        if (!h) continue;
        if (h > 2) err(`sneak: the stool at col ${c} is ${h} tiles high (at most 2: a normal jump clears it)`);
        for (let r = ROWS - 2 - h; r > ROWS - 2 - h - 3; r--) if (!O(r, c)) err(`sneak: the stool at col ${c} needs 3 rows of air over it (row ${r})`);
        const last = stools[stools.length - 1];
        if (last && last.c1 === c - 1) last.c1 = c; else stools.push({ c0: c, c1: c, h });
      }
      if (!stools.length) warn('sneak: no stool to hop between the start and the 술래');
      res.sneak = `start (${S.start.col},${S.start.row}) x ${sx} · 술래 (${S.it.col},${S.it.row}) x ${ix} · line ${S.line} (${S.line - sx - 16} px to walk) · stools ${stools.map((q) => `cols ${q.c0}-${q.c1} (${q.h} high)`).join(', ') || 'none'}`;
    }
  }
  const tens = '    ' + Array.from({ length: COLS }, (_, c) => (c >= 10 ? String(Math.floor(c / 10)) : ' ')).join('');
  const ones = '    ' + Array.from({ length: COLS }, (_, c) => String(c % 10)).join('');
  res.lines = [tens, ones, ...grid.map((row, r) => `${String(r).padStart(2)}  ${row.join('')}`)];
  res.counts = counts;
  const wtxt = res.water.pools ? ` · water ${res.water.hot ? `hot ${res.water.hot}` : ''}${res.water.hot && res.water.cold ? ' ' : ''}${res.water.cold ? `cold ${res.water.cold}` : ''} (${res.water.pools} pool${res.water.pools > 1 ? 's' : ''})` : '';
  res.info = `${party ? 'closed' : `gap ${gap[0]}-${gap[gap.length - 1]}`} · ${runs.length} surfaces, ${reach.size} reachable` +
    `${lostCells ? `, ${lostCells} unreachable cells` : ''}${wtxt} · density ${Math.round(density * 100)}%`;
  return res;
}

// ── run: rounds ────────────────────────────────────────────────────────────
let errors = 0;
let warnings = 0;
const globalE = [];
const globalW = [];
if (LEVELS.length !== N_ENTRIES) globalE.push(`needs exactly ${N_ENTRIES} entries (20 rounds + 4 bosses), has ${LEVELS.length}`);
LEVELS.forEach((L, i) => {
  const want = BOSS_AT[i];
  const has = L && L.boss;
  if (want && has !== want) globalE.push(`entry ${i + 1} (index ${i}) must be the ${want} boss round (has ${has ? `boss "${has}"` : 'no boss'})`);
  if (!want && has) globalE.push(`entry ${i + 1} (index ${i}) is a boss round ("${has}") but bosses belong at indices ${Object.keys(BOSS_AT).join(', ')}`);
});
const normal = LEVELS.filter((L) => L && !L.boss);
if (normal.length !== 20) globalE.push(`needs 20 normal rounds (has ${normal.length})`);
const themes = new Set(LEVELS.map((L) => L && L.theme));
for (let t = 0; t < 5; t++) if (!themes.has(t)) globalE.push(`theme ${t} is never used`);
LEVELS.forEach((L, i) => {
  const nx = LEVELS[(i + 1) % LEVELS.length];
  if (L && nx && L.theme === nx.theme) globalW.push(`entries ${i + 1} and ${((i + 1) % LEVELS.length) + 1} share theme ${L.theme}`);
});
const names = LEVELS.map((L) => L && L.name);
names.forEach((n, i) => { if (names.indexOf(n) !== i) globalW.push(`duplicate round name "${n}"`); });
const steam = LEVELS.map((L, i) => (L && L.special === 'steam' ? i + 1 : 0)).filter(Boolean);
if (steam.length < 3) globalW.push(`only ${steam.length} steam rounds`);

const wet = [];
let hotRounds = 0;
let coldRounds = 0;
const showLevels = !ONLY_ARENA && !ONLY_PARTY;
LEVELS.forEach((L, i) => {
  const res = analyse(L, i, 'level');
  if (L && !L.boss && res.water.pools) {
    wet.push(i + 1);
    if (res.water.hot) hotRounds++;
    if (res.water.cold) coldRounds++;
  }
  // normal-round number (1..20) of this entry, for the early-round rules
  const nn = LEVELS.slice(0, i + 1).filter((q) => q && !q.boss).length;
  if (L && !L.boss && nn <= 3) {
    if (Array.isArray(L.enemies) && L.enemies.some((e) => e.type !== 'grime')) res.W.push('rounds 1-3 should be grime only');
    if (L.special) res.W.push('no specials in rounds 1-3');
  }
  if (!showLevels || (ONLY && ONLY !== i + 1)) return; // (still analysed above: the global water count needs every round)
  errors += res.E.length;
  warnings += res.W.length;
  const cnt = Object.entries(res.counts || {}).map(([k, v]) => `${k}×${v}`).join(' ');
  const label = L && L.boss ? `BOSS ${L.boss}` : `Round ${String(nn).padStart(2)}`;
  const head = `#${String(i + 1).padStart(2)} ${label} 「${L && L.name}」 theme ${L && L.theme}${L && L.special ? ` [${L.special}]` : ''}` +
    `${cnt ? ` · ${cnt}` : ''} · ${res.info}`;
  if (!QUIET || res.E.length || res.W.length) {
    console.log('\n' + head);
    if (!QUIET) {
      for (const l of res.lines) console.log(l);
      if (res.coop) console.log(`    co-op spawns (P1 -> Pn / Pn -> P1): ${res.coop}`);
    }
    for (const m of res.E) console.log(`  ERROR: ${m}`);
    for (const m of res.W) console.log(`  warn:  ${m}`);
  }
});
if (wet.length < MIN_POOL_ROUNDS) globalE.push(`only ${wet.length} normal rounds have water (needs at least ${MIN_POOL_ROUNDS})`);
if (!hotRounds) globalW.push('no normal round has hot water');
if (!coldRounds) globalW.push('no normal round has cold water');

// ── run: battle arenas ─────────────────────────────────────────────────────
const showArenas = (!ONLY || ONLY_ARENA) && !ONLY_PARTY;
if (!Array.isArray(ARENAS)) globalE.push('PG.ARENAS is not an array');
else {
  if (ARENAS.length !== ARENA_NAMES.length) globalE.push(`PG.ARENAS needs exactly ${ARENA_NAMES.length} arenas (has ${ARENAS.length})`);
  const an = ARENAS.map((A) => A && A.name);
  ARENA_NAMES.forEach((n, i) => { if (an[i] !== n) globalE.push(`arena ${i + 1} must be 「${n}」 (has 「${an[i]}」)`); });
  if (showArenas) {
    ARENAS.forEach((A, i) => {
      if (ONLY_ARENA && ONLY_ARENA !== i + 1) return;
      const res = analyse(A, i, 'arena');
      errors += res.E.length;
      warnings += res.W.length;
      console.log(`\n#A${i + 1} ARENA 「${A && A.name}」 theme ${A && A.theme}${A && A.water ? ' [water]' : ''} · ${res.info}`);
      if (!QUIET) for (const l of res.lines) console.log(l);
      if (res.fair) {
        console.log('    spawn        to centre   rivals (mean RT)   nearest rival RT   enemy reach');
        res.fair.rows.forEach((r, k) => {
          const s = A.players[k];
          const f = (v) => (Number.isFinite(v) ? `${(v / 60).toFixed(2)} s` : '∞').padStart(8);
          console.log(`    P${k + 1} (${String(s.col).padStart(2)},${String(s.row).padStart(2)})   ${f(r.toC)}    ${f(r.rival)}           ${f(r.nearest)}          ${f(r.enemy)}`);
        });
        const S = res.fair.spreads;
        console.log(`    spread       ${S.toC.padStart(8)}    ${S.rival.padStart(8)}           ${S.nearest.padStart(8)}          ${S.enemy.padStart(8)}` +
          `   (limits ${Math.round(FAIR_CENTRE * 100)}% / ${Math.round(FAIR_RIVAL * 100)}% / ${Math.round(FAIR_NEAREST * 100)}% / ${Math.round(FAIR_ENEMY * 100)}%)`);
      }
      for (const m of res.E) console.log(`  ERROR: ${m}`);
      for (const m of res.W) console.log(`  warn:  ${m}`);
    });
  }
}

// ── run: party arenas (파티) ──────────────────────────────────────────────────
const showParty = (!ONLY && !ONLY_ARENA) || ONLY_PARTY;
if (!Array.isArray(PARTY_ARENAS)) globalE.push('PG.PARTY_ARENAS is not an array');
else {
  if (PARTY_ARENAS.length !== PARTY_KEYS.length) globalE.push(`PG.PARTY_ARENAS needs exactly ${PARTY_KEYS.length} arena(s) (has ${PARTY_ARENAS.length})`);
  PARTY_KEYS.forEach((k, i) => { const A = PARTY_ARENAS[i]; if (!A || A.key !== k || A.name !== PARTY_NAMES[i]) globalE.push(`party arena ${i + 1} must be 「${PARTY_NAMES[i]}」 key '${k}' (has ${A ? `「${A.name}」 '${A.key}'` : 'none'})`); });
  if (showParty) {
    PARTY_ARENAS.forEach((A, i) => {
      if (ONLY_PARTY && ONLY_PARTY !== i + 1) return;
      const res = analyse(A, i, 'party');
      errors += res.E.length;
      warnings += res.W.length;
      console.log(`\n#P${i + 1} PARTY 「${A && A.name}」 key ${A && A.key} theme ${A && A.theme} · ${res.info}`);
      if (!QUIET) for (const l of res.lines) console.log(l);
      if (res.rise) console.log('    rise: ' + res.rise);
      if (res.ball) console.log('    goals: ' + res.ball);
      if (res.stage) console.log('    stage: ' + res.stage);
      if (res.sneak) console.log('    sneak: ' + res.sneak);
      for (const m of res.N) console.log(`  note:  ${m}`);
      for (const m of res.E) console.log(`  ERROR: ${m}`);
      for (const m of res.W) console.log(`  warn:  ${m}`);
    });
  }
}

console.log('');
for (const m of globalE) console.log(`ERROR: ${m}`);
for (const m of globalW) console.log(`warn:  ${m}`);
errors += globalE.length;
warnings += globalW.length;
console.log(`entries: ${LEVELS.length} · bosses at ${LEVELS.map((L, i) => (L && L.boss ? i + 1 : 0)).filter(Boolean).join(', ') || 'none'}` +
  ` · steam: ${steam.join(', ') || 'none'} · water: ${wet.join(', ') || 'none'} (hot ${hotRounds}, cold ${coldRounds})` +
  ` · themes used: ${[...themes].sort().join(',')}` +
  ` · arenas: ${Array.isArray(ARENAS) ? ARENAS.map((A) => A && A.name).join(' / ') : 'none'}` +
  ` · party: ${Array.isArray(PARTY_ARENAS) ? PARTY_ARENAS.map((A) => A && A.name).join(' / ') : 'none'}`);
console.log(errors ? `FAILED: ${errors} error(s), ${warnings} warning(s)` : `ALL OK (${warnings} warning(s))`);
process.exit(errors ? 1 : 0);
