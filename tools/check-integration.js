// Cross-file interface check: loads sprites.js, levels.js, audio.js and net.js in a vm and verifies that every
// name the engine (game.js) references exists with the right shape: every sprite (literal, per-animal and UI
// names, at the size the engine bakes them), every sfx / music track (including the online UI sounds and the
// guests' music table), every PG.Net / Lobby / Session method the engine calls (on live sessions: a 'bc' host +
// guest over an in-process BroadcastChannel and a lobby over a minimal fake room), and PG.ARENAS / players data.
// Usage: node bogeul/tools/check-integration.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(src, f), 'utf8');

const win = { PG: {}, localStorage: { getItem: () => null, setItem() {} }, addEventListener() {}, document: { addEventListener() {}, hidden: false } };
win.window = win;
const ctx = vm.createContext(Object.assign(win, { console, setInterval, clearInterval, setTimeout, clearTimeout }));
for (const f of ['sprites.js', 'levels.js', 'audio.js']) vm.runInContext(read(f), ctx, { filename: f });
const PG = win.PG;
const game = read('game.js');
let fails = 0;
const bad = (m) => { fails++; console.log('FAIL ' + m); };

// ---- sprites the engine requires (mirrors REQUIRED in game.js plus every literal sprite name it draws)
const ENEMY = ['grime', 'mold', 'fly', 'sponge'];
const ITEMS = (game.match(/const ITEM_TYPES = \[([^\]]*)\]/) || [])[1].match(/'([a-z_]+)'/g).map((s) => s.slice(1, -1));
const need = {
  duck_idle: 2, duck_walk: 4, duck_jump: 1, duck_fall: 1, duck_shoot: 1, duck_die: 4,
  bubble_new: 2, bubble: 3, bubble_pop: 2, steam_bubble: 2, steam_bolt: 2, life: 1,
};
// v2 sprites (spec section 5): frame counts, and sizes [w, h] for everything that is not 16x16
const V2 = {
  boss_grime_idle: 2, boss_grime_jump: 1, boss_grime_hurt: 1, boss_mold_idle: 2, boss_mold_shoot: 1, boss_mold_hurt: 1,
  boss_sponge_idle: 2, boss_sponge_charge: 2, boss_sponge_hurt: 1, boss_towel_idle: 2, boss_towel_swoop: 1, boss_towel_hurt: 1,
  giant_bubble: 2, spore: 2, shockwave: 2, scald_drop: 2, mini_mitt: 2, stamp_bubble: 2, stamp: 1, stamp_empty: 1,
  pw_shampoo: 1, pw_slippers: 1, pw_bathbomb: 1, grime_soaked: 2, mold_soaked: 2, sponge_soaked: 2,
  water_hot_top: 2, water_hot: 1, water_cold_top: 2, water_cold: 1, ice_block: 1, drain: 1, shower: 1,
};
Object.assign(need, V2);
const SIZE = { giant_bubble: [40, 40], spore: [8, 8], shockwave: [16, 8], scald_drop: [8, 8], stamp: [8, 8], stamp_empty: [8, 8],
  water_hot_top: [8, 8], water_hot: [8, 8], water_cold_top: [8, 8], water_cold: [8, 8], drain: [8, 8], shower: [16, 8], life: [8, 8],
  crown: [8, 8], ready: [8, 8], tag_arrow: [5, 3], trophy: [8, 8] };
// v4 trophies (design/trophies.md §9): the cup (2 frames) and the 7 league icons, all 8x8
for (let i = 0; i < 7; i++) SIZE['lg_' + i] = [8, 8];
// v4 shop (design/shop.md 10): the 비누 코인 (2 frames), the 상점 basket and the league lock, all 8x8
Object.assign(SIZE, { coin: [8, 8], shop: [8, 8], lock: [8, 8] });
// v4 뽑기 (design/gacha.md 8): the machine 20x28, its crank 7x7 (4), the capsules 6x6 (4) / halves 6x3, e7's duckling 5x4 (2)
Object.assign(SIZE, { gacha: [20, 28], gacha_h: [7, 7], cap: [6, 6], cap_t: [6, 3], cap_b: [6, 3], fx_duck: [5, 4] });
// 파티 물 차오르기 (design/party-polish.md 8.1): the 오리 튜브 ring, 16x8 (2)
SIZE.duck_ring = [16, 8];
const sizeOf = (n) => SIZE[n] || (/^boss_|^portrait_/.test(n) ? [32, 32] : /^tile_|^life_/.test(n) ? [8, 8] : [16, 16]);
ENEMY.forEach((t) => { need[t + '_walk'] = 2; need[t + '_angry'] = 2; need[t + '_trapped'] = 2; need[t + '_dead'] = 1; });
ITEMS.forEach((t) => { need['item_' + t] = 1; });
for (let i = 0; i < 5; i++) need['tile_' + i] = 1;
// v3 (spec B): six animals x (body animations + battle bubble + co-op ghost + life icon + portrait) and the UI marks.
// The animal ids and body animations come from game.js itself, so the engine and this list cannot drift apart.
const evalLit = (re, what) => { const m = game.match(re); if (!m) { bad(`game.js: ${what} not found`); return null; } try { return vm.runInNewContext('(' + m[1] + ')'); } catch (e) { bad(`game.js: ${what} unreadable`); return null; } };
const CHAR_IDS = evalLit(/const CHAR_IDS = (\[[^\]]*\])/, 'CHAR_IDS') || [];
const CHAR_ANIMS = evalLit(/const CHAR_ANIMS = (\{[^}]*\})/, 'CHAR_ANIMS') || {};
const SPEC_CHARS = ['duck', 'capy', 'otter', 'penguin', 'cat', 'frog'];
if (CHAR_IDS.join() !== SPEC_CHARS.join()) bad(`game.js CHAR_IDS ${CHAR_IDS.join()} (spec ${SPEC_CHARS.join()})`);
const SPEC_ANIMS = { idle: 2, walk: 4, jump: 1, fall: 1, shoot: 1, die: 4 };
if (JSON.stringify(CHAR_ANIMS) !== JSON.stringify(SPEC_ANIMS)) bad(`game.js CHAR_ANIMS ${JSON.stringify(CHAR_ANIMS)} (spec ${JSON.stringify(SPEC_ANIMS)})`);
const charSuffix = Object.assign({}, SPEC_ANIMS, { trapped: 2, ghost: 2 });
for (const c of SPEC_CHARS) {
  for (const [a, k] of Object.entries(charSuffix)) need[`${c}_${a}`] = k;
  need['life_' + c] = 1; need['portrait_' + c] = 1;
}
need.crown = 1; need.tag_arrow = 1; need.ready = 1;
need.trophy = 2; for (let i = 0; i < 7; i++) need['lg_' + i] = 1;
Object.assign(need, { coin: 2, shop: 1, lock: 1 });
Object.assign(need, { gacha: 1, gacha_h: 4, cap: 4, cap_t: 4, cap_b: 1, fx_duck: 2 });
need.duck_ring = 2;
// names the engine builds from an animal id: "<char> + '_x'" suffixes and "'x_' + <char>" / prefix-argument forms
const builtSuffix = new Set([...game.matchAll(/\b(?:c|char|\w+\.char)\s*\+\s*'(_[a-z_]+)'/g)].map((m) => m[1]));
const builtPrefix = new Set([...game.matchAll(/'([a-z]+_)'\s*\+\s*(?:c\b|\w+\.char\b|\w+\.sel\b)/g), ...game.matchAll(/(?:portraitCanvas|drawArt)\([^,()]+,\s*(?:[^,()]+,\s*)?'([a-z]+_)'/g)].map((m) => m[1]));
for (const c of SPEC_CHARS) {
  for (const s of builtSuffix) if (!((c + s) in need)) need[c + s] = 1;
  for (const p of builtPrefix) if (!((p + c) in need)) need[p + c] = 1;
}
// UI sprites the engine reaches through constants (const SPR_X = 'name')
const sprConst = new Set([...game.matchAll(/\bSPR_[A-Z]+ = '([a-z_]+)'/g)].map((m) => m[1]));
for (const n of sprConst) if (!(n in need)) need[n] = 1;
// the engine bakes every frame at sizeOf(name) from game.js: it must agree with this checker's sizes
const engineSize = evalLit(/const SPR_SIZE = (\{[\s\S]*?\});/, 'SPR_SIZE') || {};
if (game.includes("LEAGUES.forEach((l, i) => { REQUIRED[LG_PRE + i] = 1; SPR_SIZE[LG_PRE + i] = [8, 8]; });") && game.includes("LG_PRE = 'lg_'")) for (let i = 0; i < 7; i++) engineSize['lg_' + i] = [8, 8];
else bad('game.js: the league icons (lg_0..lg_6) are not baked at 8x8');
// (game.js sizeOf: the 뽑기's machine / crank / capsules and fx_duck take their size from the art, PG.ITEM_SIZE - so the
// engine bakes them at exactly this checker's SIZE)
const ARTSIZED = /^(fx_)|^(gacha|gacha_h|cap|cap_t|cap_b)$/;
// (game.js sizeOf names duck_ring outright: 16x8)
const RING = /if \(name === 'duck_ring'\) return \[16, 8\];/.test(game);
const engineSizeOf = (n) => (/^boss_|^portrait_/.test(n) ? [32, 32] : /^tile_|^life_/.test(n) ? [8, 8] : ARTSIZED.test(n) && SIZE[n] ? SIZE[n] : n === 'duck_ring' && RING ? [16, 8] : engineSize[n] || [16, 16]);
// literal names drawn by the engine
const lits = new Set();
for (const m of game.matchAll(/(?:drawEnt|drawRaw|frameOf)\(\s*'([a-z_]+)'\s*,/g)) lits.add(m[1]);
for (const n of lits) if (!(n in need)) need[n] = 1;
for (const n of Object.keys(need)) if (engineSizeOf(n).join() !== sizeOf(n).join()) bad(`engine bakes ${n} at ${engineSizeOf(n).join('x')}, spec ${sizeOf(n).join('x')}`);
const S = PG.SPRITES || {};
for (const [n, k] of Object.entries(need)) {
  const fr = S[n];
  if (!Array.isArray(fr)) { bad(`sprite ${n} missing`); continue; }
  if (fr.length !== k) bad(`sprite ${n} has ${fr.length} frames, spec ${k}`);
  const [ww, wh] = sizeOf(n);
  fr.forEach((f, i) => {
    if (!Array.isArray(f) || f.length !== wh || f.some((r) => typeof r !== 'string' || r.length !== ww)) bad(`sprite ${n}[${i}] is not ${ww}x${wh}`);
    else for (const r of f) for (const ch of r) if (ch !== '.' && !(ch in PG.PALETTE)) { bad(`sprite ${n}[${i}] uses unknown colour '${ch}'`); return; }
  });
}
console.log(`sprites: checked ${Object.keys(need).length} names (engine literals: ${[...lits].join(', ')}; per-animal ${[...builtPrefix].map((p) => p + '*').concat([...builtSuffix].map((s) => '*' + s)).join(', ')}; constants ${[...sprConst].join(', ')})`);

// ---- themes and levels
const TH = PG.THEMES || [];
if (TH.length !== 5) bad(`THEMES has ${TH.length} entries`);
TH.forEach((t, i) => { if (!S[t.tile]) bad(`theme ${i} tile ${t.tile} missing`); for (const k of ['bg', 'bgTile', 'grout']) if (!/^#[0-9a-f]{6}$/i.test(t[k] || '')) bad(`theme ${i}.${k} invalid`); });
const L = PG.LEVELS || [];
// v2: 20 rounds + 4 boss arenas at indices 5/11/17/23 (tools/validate-levels.js checks the layouts themselves)
const BOSS_AT = { 5: 'kingGrime', 11: 'moldQueen', 17: 'megaSponge', 23: 'towelKing' };
if (L.length !== 24) bad(`PG.LEVELS has ${L.length} entries (expected 24)`);
L.forEach((lv, i) => {
  if (!(lv.theme >= 0 && lv.theme < TH.length)) bad(`level ${i + 1} theme ${lv.theme}`);
  for (const k of ['name', 'map', 'player', 'enemies', 'gather']) if (lv[k] === undefined) bad(`level ${i + 1} missing ${k}`);
  if (lv.special !== undefined && lv.special !== 'steam') bad(`level ${i + 1} special ${lv.special}`);
  if ((lv.boss || null) !== (BOSS_AT[i] || null)) bad(`level ${i + 1} boss ${lv.boss} (expected ${BOSS_AT[i] || 'none'})`);
  if (lv.boss && !(lv.bossSpawn && Number.isInteger(lv.bossSpawn.col) && Number.isInteger(lv.bossSpawn.row))) bad(`level ${i + 1} bossSpawn missing`);
  if ((lv.map || []).some((row) => /[^#.~=]/.test(row))) bad(`level ${i + 1} map has cells other than # . ~ =`);
  for (const e of lv.enemies || []) {
    if (!ENEMY.includes(e.type)) bad(`level ${i + 1} enemy type ${e.type}`);
    if (e.dir !== 1 && e.dir !== -1) bad(`level ${i + 1} enemy dir ${e.dir}`);
  }
});
// v3 (spec C): co-op spawns on every entry, the four battle arenas (tools/validate-levels.js checks the geometry)
const spot = (p) => p && Number.isInteger(p.col) && Number.isInteger(p.row);
L.forEach((lv, i) => {
  if (!Array.isArray(lv.players) || lv.players.length !== 4 || !lv.players.every(spot)) bad(`level ${i + 1} players must be 4 {col,row}`);
  else if (lv.player && (lv.players[0].col !== lv.player.col || lv.players[0].row !== lv.player.row)) bad(`level ${i + 1} players[0] is not the v2 player spawn`);
});
const AR = PG.ARENAS || [];
const ARENA_NAMES = ['대중탕 한판', '냉온탕 대결', '사우나 계단', '때밀이 링'];
if (AR.map((a) => a.name).join() !== ARENA_NAMES.join()) bad(`PG.ARENAS names ${AR.map((a) => a.name).join()} (spec ${ARENA_NAMES.join()})`);
AR.forEach((a, i) => {
  if (!(a.theme >= 0 && a.theme < TH.length)) bad(`arena ${i + 1} theme ${a.theme}`);
  if (!Array.isArray(a.map) || a.map.length !== (L[0] && L[0].map.length) || a.map.some((r) => typeof r !== 'string' || r.length !== L[0].map[0].length || /[^#.~=]/.test(r))) bad(`arena ${i + 1} map shape / cells`);
  if (!Array.isArray(a.players) || a.players.length !== 4 || !a.players.every(spot)) bad(`arena ${i + 1} players must be 4 {col,row}`);
  if (!Array.isArray(a.enemySpawns) || a.enemySpawns.length !== 6 || !a.enemySpawns.every(spot)) bad(`arena ${i + 1} enemySpawns must be 6 {col,row}`);
  if (!spot(a.gather)) bad(`arena ${i + 1} gather`);
});
console.log(`levels: ${L.length} rounds, themes ${[...new Set(L.map((l) => l.theme))].sort().join(',')}; arenas: ${AR.map((a) => a.name).join(' / ')}`);

// ---- audio names the engine uses
const A = PG.Audio || {};
for (const fn of ['unlock', 'sfx', 'music', 'setMuted', 'isMuted']) if (typeof A[fn] !== 'function') bad(`PG.Audio.${fn} missing`);
const sfxNames = A._sfxNames || [];
// v1 sfx still used in v2 ('letter' / 'extend' belonged to the removed letter bubbles) + the v2 additions
const specSfx = ['jump', 'shoot', 'capture', 'pop', 'chain', 'kill', 'item', 'die', 'hurry', 'clear', 'bounce', 'steam', 'start', 'gameover', 'escape', 'pause',
  'boss_hit', 'boss_stun', 'boss_damage', 'boss_roar', 'shockwave', 'spore', 'scald_warn', 'scald_splash', 'splash', 'freeze', 'melt', 'stamp', 'ticket', 'powerup', 'door'];
for (const n of specSfx) if (!sfxNames.includes(n)) bad(`audio sfx ${n} missing`);
// v3 additions (spec D)
for (const n of ['join', 'leave', 'ready', 'countdown', 'go', 'trap_player', 'revive', 'ghost', 'ko', 'win']) if (!sfxNames.includes(n)) bad(`audio sfx ${n} missing`);
// every string literal inside an sfx call: Snd.sfx(...), Snd.call('sfx', ...), uiSfx(...) (online UI sounds),
// including the ones picked by a condition (uiSfx(a > b ? 'join' : 'leave'))
// (a literal compared with === / !== inside the call is a condition, not a name)
const argLits = (re) => { const out = new Set(); for (const m of game.matchAll(re)) for (const q of m[1].matchAll(/(?<![=!]==\s*)'([a-z_]+)'(?!\s*[=!]==)/g)) out.add(q[1]); return out; };
const usedSfx = argLits(/(?:\bSnd\.sfx|\buiSfx|\bSnd\.call)\(((?:[^()]|\([^()]*\))*)\)/g);
usedSfx.delete('sfx'); usedSfx.delete('music'); usedSfx.delete('setMuted');
for (const n of usedSfx) if (!sfxNames.includes(n)) bad(`engine sfx '${n}' not in audio.js`);
// setMusic(...) / Snd.music(...) literals, the per-boss tracks picked through BOSS_DEF (music: 'boss' / 'final'), and
// the guests' music table (MUSICS: snapshot index -> track) that replays the host's music
const usedTracks = argLits(/(?:\bsetMusic|\bSnd\.music)\(((?:[^()]|\([^()]*\))*)\)/g);
for (const m of game.matchAll(/\bmusic: '([a-z_]+)'/g)) usedTracks.add(m[1]);
if (/'hurry'\)/.test(game)) usedTracks.add('hurry');
const MUSICS = evalLit(/const MUSICS = (\[[^\]]*\])/, 'MUSICS (guest music table)') || [];
for (const t of MUSICS) if (t !== null) usedTracks.add(t);
for (const t of usedTracks) if (!MUSICS.includes(t)) bad(`music '${t}' is used by the engine but missing from MUSICS (guests could not replay it)`);
const songs = Object.keys(A._songs || {});
for (const t of usedTracks) if (!songs.includes(t)) bad(`engine music '${t}' not in audio.js`);
for (const t of ['lobby', 'battle', 'podium']) if (!songs.includes(t)) bad(`audio music ${t} missing`);
console.log(`audio: engine sfx [${[...usedSfx].join(', ')}], tracks [${[...usedTracks].join(', ')}]`);

// ---- v4 character kits (design/char-kits.md §10, §11, §2.5): the optional move poses / bubble glyphs, the kit sounds
// (several are reached through tables - SHOOT_SFX - not literals), what stays local, and the shot-phase ceiling
const SPEC_OPT = { duck_glide: 2, capy_slam: 1, otter_dash: 1, penguin_slide: 1, cat_flip: 1, icon_duck: 1, icon_capy: 1, icon_otter: 1, icon_penguin: 1, icon_cat: 2, icon_frog: 1 };
const OPT = evalLit(/const OPT_SPR = (\{[\s\S]*?\});/, 'OPT_SPR (the optional v4 sprites)') || {};
if (JSON.stringify(OPT) !== JSON.stringify(SPEC_OPT)) bad(`game.js OPT_SPR ${JSON.stringify(OPT)} (spec §11: ${JSON.stringify(SPEC_OPT)})`);
const optSrc = game.replace(/const OPT_SPR = \{[\s\S]*?\};/, '');
for (const [n, k] of Object.entries(SPEC_OPT)) {
  const fr = S[n], [ww, wh] = /^icon_/.test(n) ? [5, 5] : [16, 16];
  if (!Array.isArray(fr)) { bad(`v4 sprite ${n} missing (its fallback would show)`); continue; }
  if (fr.length !== k) bad(`v4 sprite ${n} has ${fr.length} frames, spec ${k}`);
  fr.forEach((f, i) => {
    if (!Array.isArray(f) || f.length !== wh || f.some((r) => typeof r !== 'string' || r.length !== ww)) bad(`v4 sprite ${n}[${i}] is not ${ww}x${wh}`);
    else for (const r of f) for (const ch of r) if (ch !== '.' && !(ch in PG.PALETTE)) { bad(`v4 sprite ${n}[${i}] uses unknown colour '${ch}'`); return; }
  });
  if (!new RegExp(`'${n}'`).test(optSrc)) bad(`game.js never draws the v4 sprite '${n}' (only lists it in OPT_SPR)`);
}
if (/\bsizeOf\(name\)[\s\S]{0,200}\/\^icon_\/\.test\(name\)\) return \[5, 5\]/.test(game) === false) bad('game.js sizeOf does not bake icon_* at 5x5');
const SPEC_V4_SFX = ['flap', 'slam', 'quake', 'dash', 'slide', 'djump', 'hop', 'b_echo', 'b_onsen', 'b_splash', 'b_icicle', 'b_yarn', 'b_egg'];
for (const n of SPEC_V4_SFX) if (!sfxNames.includes(n)) bad(`audio sfx ${n} missing (char-kits §10)`);
const SHOOT = evalLit(/const SHOOT_SFX = (\{[^}]*\})/, 'SHOOT_SFX') || {};
if (Object.keys(SHOOT).join() !== CHAR_IDS.join()) bad(`SHOOT_SFX animals ${Object.keys(SHOOT).join()} (expected ${CHAR_IDS.join()})`);
if (Object.values(SHOOT).join() !== 'b_echo,b_onsen,b_splash,b_icicle,b_yarn,b_egg') bad(`SHOOT_SFX sounds ${Object.values(SHOOT).join()}`);
for (const n of Object.values(SHOOT)) if (!sfxNames.includes(n)) bad(`SHOOT_SFX '${n}' not in audio.js`);
const NOE = evalLit(/const NO_ECHO = (\{[\s\S]*?\});/, 'NO_ECHO') || {};
for (const n of ['jump', 'shoot', 'bounce', 'splash', 'pause', 'start'].concat(SPEC_V4_SFX.filter((x) => x !== 'quake'))) if (!NOE[n]) bad(`NO_ECHO lacks '${n}' (a local sound would play twice online)`);
for (const n of ['quake', 'pop']) if (NOE[n]) bad(`NO_ECHO has '${n}': it must be echoed to the guests (char-kits §2.7)`);
// every kit's shot phase fits the guest's prediction / sid window (SHOT_MAX), shampoo included
const KITS = evalLit(/const KIT = (\{[\s\S]*?\n {2}\});/, 'KIT') || {};
const SHOT_MAX = +((game.match(/const SHOT_MAX = (\d+);/) || [])[1] || 0);
if (Object.keys(KITS).join() !== CHAR_IDS.join()) bad(`KIT animals ${Object.keys(KITS).join()}`);
const phases = {};
for (const [c, k] of Object.entries(KITS)) {
  const s = k.shot || {}, sh = Object.assign({}, s, s.sh || {});
  for (const [tag, o] of [['', s], ['+sh', sh]]) {
    const f = o.ty === 'egg' ? (o.go || 0) + Math.max(o.hold || 0, o.holdB || 0) : o.f || 0;
    phases[c + tag] = f;
    if (!(f > 0) || f > SHOT_MAX) bad(`KIT.${c}${tag} shot phase ${f} f (SHOT_MAX ${SHOT_MAX})`);
  }
  if (!(k.walk >= 0.92)) bad(`KIT.${c}.walk x${k.walk}: below the validated x0.92 (levels.js header)`);
}
console.log(`v4 kits: optional sprites ${Object.keys(SPEC_OPT).length}, sfx ${SPEC_V4_SFX.length} (+ pop n 1..6), shot phases ${JSON.stringify(phases)} <= ${SHOT_MAX}`);

// ---- debug API shape (static check against game.js source)
for (const fn of ['getState', 'start', 'step', 'press', 'trapAll', 'popAll', 'killAll', 'setInvincible', 'gotoRound', 'seed']) {
  if (!new RegExp(`\\b${fn}\\b[(,]`).test(game)) bad(`PG.debug.${fn} not found in game.js`);
}
// v3 (spec I): PG.debug.mp and the getState() additions
const mpSrc = (game.match(/function netDebugApi\(\) \{([\s\S]*?)\n {2}\}/) || [])[1] || '';
if (!mpSrc) bad('game.js: netDebugApi (PG.debug.mp) not found');
for (const fn of ['host', 'join', 'ready', 'start', 'pickChar', 'setNick', 'session', 'state']) {
  if (!new RegExp(`\\n\\s+(?:async\\s+)?${fn}(?:\\(|:)`).test(mpSrc)) bad(`PG.debug.mp.${fn} not found`);
}
if (!/\bmp: netDebugApi\(\)/.test(game)) bad('PG.debug.mp is not wired to netDebugApi()');
const gsSrc = (game.match(/function getState\(\) \{([\s\S]*?)\n {2}\}/) || [])[1] || '';
for (const k of ['players', 'mode', 'role', 'timeLeft']) if (!new RegExp(`\\b${k}:`).test(gsSrc)) bad(`getState() has no ${k}`);
const psSrc = (game.match(/function playerState\([^)]*\) \{([\s\S]*?)\n {2}\}/) || [])[1] || '';
for (const k of ['slot', 'char', 'nick', 'x', 'y', 'dead', 'ghost', 'trapped', 'score']) if (!new RegExp(`\\b${k}\\b`).test(psSrc)) bad(`getState().players[] has no ${k}`);
for (const f of ['sprites.js', 'levels.js', 'audio.js', 'net.js', 'game.js']) {
  const code = read(f);
  if (/<\/script/i.test(code)) bad(`${f} contains </script`);
  if (!/^\s*(\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*window\.PG = window\.PG \|\| \{\};/.test(code)) bad(`${f} does not start with window.PG = window.PG || {};`);
}
// ---- v2 rename + removed v1 systems (static scan of every shipped source file and the built page)
const NAME = '뽀득뽀득 목욕탕'; // the working title (GAME_NAME)
// old v1 title, and names that must never appear (kept encoded so this file does not contain them either)
const OLD = [String.fromCharCode(0xbf40, 0xae00), String.fromCharCode(0xbcf4, 0xae00, 0xbcf4, 0xae00), ...['elbbob elbbub', 'elbbobelbbub', 'otiat'].map((w) => w.split('').reverse().join(''))];
const scan = { 'page.html': read('page.html') };
for (const f of ['sprites.js', 'levels.js', 'audio.js', 'net.js', 'game.js']) scan[f] = read(f);
for (const f of fs.readdirSync(path.join(src, 'tests')).filter((n) => n.endsWith('.js'))) scan['tests/' + f] = read('tests/' + f);
const toolsDir = path.join(__dirname);
for (const f of fs.readdirSync(toolsDir).filter((n) => n.endsWith('.js'))) scan['tools/' + f] = fs.readFileSync(path.join(toolsDir, f), 'utf8');
const distFile = path.join(__dirname, '..', 'dist', 'ppogeul-bath.html');
if (fs.existsSync(distFile)) scan['dist/ppogeul-bath.html'] = fs.readFileSync(distFile, 'utf8');
const deployFile = path.join(__dirname, '..', 'deploy', 'index.html');
if (fs.existsSync(deployFile)) scan['deploy/index.html'] = fs.readFileSync(deployFile, 'utf8');
for (const f of fs.readdirSync(path.join(__dirname, '..')).filter((n) => n.endsWith('.js'))) scan[f] = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
for (const [f, text] of Object.entries(scan)) {
  const low = text.toLowerCase();
  for (const w of OLD) if (low.includes(w)) bad(`${f} mentions a forbidden / old name (${w.length} chars at ${low.indexOf(w)})`);
}
const nameInGame = game.split(NAME).length - 1;
if (nameInGame !== 1 || !game.includes(`const GAME_NAME = '${NAME}'`)) bad(`game.js must hold the title once, in const GAME_NAME (found ${nameInGame})`);
const pg = scan['page.html'];
if (!pg.startsWith(`<title>${NAME}</title>`)) bad('page.html must start with <title> + the title');
if (!new RegExp(`class="pg-brand"[^\\n]*${NAME}`).test(pg)) bad('page.html header brand must carry the title literally');
if (!new RegExp(`class="pg-logo"[^\\n]*${NAME}`).test(pg)) bad('page.html title-card logo must carry the title literally');
// removed v1 systems: letter bubbles, the invincible towel chaser, the bubble-riding scroll transition
if (/\bletter_(mok|yok|tang)\b|kind === 'letter'|Snd\.sfx\('letter'|\bG\.letters\b/.test(game)) bad('game.js still has letter-bubble code');
if (/\bG\.towel\b|\btowelChaser\b|drawEnt\('towel'/.test(game)) bad('game.js still has the towel chaser');
if (/\bscrollT\b|\bp\.ride\b|G\.scroll\b/.test(game)) bad('game.js still has the scroll transition');
if (S.towel) bad('sprites.js still defines the v1 towel chaser sprite');
console.log(`rename/leftovers: scanned ${Object.keys(scan).length} files`);


// ---- PG.Net (spec E): every PG.Net / Lobby / Session member the engine uses exists, checked on LIVE objects:
// net.js runs in its own vm with an in-process BroadcastChannel (host + guest sessions on 'bc') and a minimal fake of
// the artifact runtime (window.claude.use('room' | 'user')) for the lobby and the profile name.
async function checkNet() {
  // what the engine calls (static scan of game.js)
  const netUsed = new Set([...game.matchAll(/\b(?:PG\.Net|Net)\.([A-Za-z_]+)/g)].map((m) => m[1]));
  const sessUsed = new Set([...game.matchAll(/\bNET\.sess\.([A-Za-z_]+)/g)].map((m) => m[1]));
  for (const fn of ['netAttach', 'netClose', 'netState']) {
    const body = (game.match(new RegExp(`function ${fn}\\([^)]*\\) \\{([\\s\\S]*?)\\n {2}\\}`)) || [])[1];
    if (!body) { bad(`game.js: function ${fn} not found`); continue; }
    for (const m of body.matchAll(/\bs\.([A-Za-z_]+)\(/g)) sessUsed.add(m[1]);
  }
  // (a bare lb, never a member .lb: the 앱인토스 bridge's leaderboard is AIT.br.lb)
  const lobbyUsed = new Set([...game.matchAll(/(?<![\w$.])(?:NET\.lobby|lb)\.([A-Za-z_]+)\(/g)].map((m) => m[1]));
  if (!sessUsed.size || !lobbyUsed.size || !netUsed.size) bad('game.js: could not find the engine\'s PG.Net calls');

  // a page: net.js in its own context
  const chans = new Map();
  class BC {
    constructor(name) { this.name = String(name); this.onmessage = null; this.closed = false; if (!chans.has(this.name)) chans.set(this.name, new Set()); chans.get(this.name).add(this); }
    postMessage(data) {
      if (this.closed) throw new Error('InvalidStateError');
      const copy = structuredClone(data);
      for (const o of chans.get(this.name)) if (o !== this) setTimeout(() => { if (!o.closed && typeof o.onmessage === 'function') o.onmessage({ data: structuredClone(copy) }); }, 1);
    }
    close() { this.closed = true; chans.get(this.name).delete(this); }
  }
  function fakeRoom() {
    let pres = {}; const fns = new Set();
    const me = () => Object.freeze({ peer: 'p-me', by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze(Object.assign({}, pres)), updatedAt: Date.now() });
    const ns = {
      presence(patch) { for (const [k, v] of Object.entries(patch || {})) { if (v === null) delete pres[k]; else pres[k] = v; } if (JSON.stringify(pres).length > 4096) return Promise.reject({ code: 'invalid_argument' }); setTimeout(() => { for (const f of fns) f({ peers: [me()], joined: [], left: [], updated: [me()] }); }, 1); return Promise.resolve(); },
      peers: () => Object.freeze([me()]),
      onPeers(fn) { fns.add(fn); setTimeout(() => fns.has(fn) && fn({ peers: [me()], joined: [me()], left: [], updated: [] }), 1); return () => fns.delete(fn); },
      join: () => Promise.reject({ code: 'not_permitted', message: 'not in this check' }),
      connected: () => true,
      onConnection(fn) { setTimeout(() => fn(true), 1); return () => {}; },
      emit: () => Promise.reject({ code: 'not_permitted', message: 'topics are not opened' }),
      on: () => () => {},
    };
    return ns;
  }
  const warnings = [];
  function page(withRuntime) {
    const w = { PG: {}, BroadcastChannel: BC, location: { search: '' }, addEventListener() {}, removeEventListener() {},
      performance: { now: () => performance.now() }, crypto: globalThis.crypto,
      console: { log() {}, warn: (...a) => warnings.push(a.join(' ')), error: (...a) => warnings.push(a.join(' ')) },
      setTimeout, clearTimeout, setInterval, clearInterval };
    if (withRuntime) {
      const room = fakeRoom();
      w.claude = { use: async (n) => (n === 'room' ? room : n === 'user' ? { me: async () => ({ id: null, name: '토끼', avatarUrl: '', color: '#888', email: null, isOwner: false, canEdit: false }) } : null) };
    }
    w.window = w;
    vm.runInContext(read('net.js'), vm.createContext(w), { filename: 'net.js' });
    return w.PG.Net;
  }
  const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + ' timed out')), ms))]);
  const A = page(false), B = page(false), R = page(true);
  if (!A) { bad('net.js did not define PG.Net'); return; }
  for (const k of ['transports', 'lobby', 'host', 'join']) if (typeof A[k] !== 'function') bad(`PG.Net.${k} is not a function (spec E)`);
  for (const k of netUsed) if (!(k in A)) bad(`engine uses PG.Net.${k}, net.js has no such member`);
  for (const k of ['not_found', 'full', 'lost', 'host_left', 'unstable', 'connecting', 'roomOff']) if (typeof (A.TEXT || {})[k] !== 'string') bad(`PG.Net.TEXT.${k} missing`);
  try {
    const t = await A.transports();
    if (!t || t.bc !== true || t.room !== false || t.peer !== false) bad(`transports() without the runtime = ${JSON.stringify(t)} (expected room false, peer false, bc true)`);
    if ((await A.lobby('bc')) !== null) bad('lobby(\'bc\') must resolve null');
    const tr = await R.transports();
    if (!tr || tr.room !== true) bad(`transports() with a room runtime = ${JSON.stringify(tr)}`);
    if (typeof R.profileName === 'function' && (await R.profileName()) !== '토끼') bad('profileName() does not read user.me().name');
    // lobby (room)
    const lb = await R.lobby('room');
    if (!lb) bad('lobby(\'room\') resolved null with a room runtime');
    else {
      for (const k of ['games', 'onChange', 'advertise', 'close']) if (typeof lb[k] !== 'function') bad(`Lobby.${k} is not a function (spec E)`);
      for (const k of lobbyUsed) if (typeof lb[k] !== 'function') bad(`engine calls Lobby.${k}(), net.js has no such method`);
      const un = lb.onChange(() => {});
      if (typeof un !== 'function') bad('Lobby.onChange must return an unsubscribe function');
      lb.advertise({ nick: '토끼', char: 'duck', code: 'ab12', mode: 'coop', n: 1, max: 4, open: true });
      if (!Array.isArray(lb.games())) bad('Lobby.games() must return an array');
      un(); lb.close();
    }
    // a 'bc' host and guest
    const h = await withTimeout(A.host({ transport: 'bc', net: { latency: 0, jitter: 0, drop: 0 } }), 5000, 'host()');
    for (const k of ['role', 'code', 'selfId']) if (h[k] === undefined) bad(`Session.${k} missing`);
    if (h.role !== 'host' || !/^[a-z0-9]{4}$/.test(h.code)) bad(`host session role/code ${h.role}/${h.code}`);
    const g = await withTimeout(B.join({ transport: 'bc', code: h.code, net: { latency: 0, jitter: 0, drop: 0 } }), 5000, 'join()');
    if (g.role !== 'guest' || g.code !== h.code) bad(`guest session role/code ${g.role}/${g.code}`);
    const SPEC_SESSION = ['peers', 'onPeers', 'setState', 'onState', 'send', 'onMessage', 'stats', 'onStatus', 'leave'];
    for (const s of [h, g]) {
      for (const k of SPEC_SESSION) if (typeof s[k] !== 'function') bad(`Session.${k} is not a function (spec E, ${s.role})`);
      for (const k of sessUsed) if (typeof s[k] !== 'function') bad(`engine calls Session.${k}(), the ${s.role} session has no such method`);
    }
    const got = { state: null, msg: null };
    const uns = [h.onState((from, o) => { got.state = [from, o]; }), h.onMessage((from, m) => { got.msg = [from, m]; }), g.onPeers(() => {}), g.onStatus(() => {})];
    if (!uns.every((u) => typeof u === 'function')) bad('Session.on* must return unsubscribe functions');
    if (g.setState({ v: 3, x: 1 }) !== true) bad('setState(small) must return true');
    if (g.setState({ big: 'x'.repeat(3700) }) !== false) bad('setState(> 3600 bytes) must return false');
    g.setState({ v: 3, x: 2 });
    g.send(h.selfId, { t: 'hi', n: 'x' });
    const t0 = Date.now();
    while ((!got.state || !got.msg) && Date.now() - t0 < 3000) await new Promise((r) => setTimeout(r, 10));
    if (!got.msg || got.msg[0] !== g.selfId || !got.msg[1] || got.msg[1].t !== 'hi') bad(`send() did not reach the host: ${JSON.stringify(got.msg)}`);
    if (!got.state || got.state[0] !== g.selfId || got.state[1].x !== 2) bad(`setState() did not reach the host: ${JSON.stringify(got.state)}`);
    const pl = h.peers();
    if (!Array.isArray(pl) || pl.length !== 2 || !pl.every((p) => typeof p.id === 'string' && typeof p.isMe === 'boolean' && Number.isInteger(p.slot))) bad(`peers() = ${JSON.stringify(pl)}`);
    const st = g.stats();
    if (!st || typeof st.connected !== 'boolean' || !('rttMs' in st)) bad(`stats() = ${JSON.stringify(st)}`);
    uns.forEach((u) => u());
    g.leave(); h.leave();
  } catch (e) {
    bad('PG.Net live check threw: ' + (e && (e.code || e.message)));
  }
  for (const N of [A, B, R]) { try { N._dispose && N._dispose(); } catch (e) { /* ignore */ } }
  if (warnings.length) bad('net.js warned: ' + warnings.slice(0, 3).join(' | '));
  console.log(`net: engine uses PG.Net [${[...netUsed].join(', ')}], Session [${[...sessUsed].join(', ')}], Lobby [${[...lobbyUsed].join(', ')}]`);
}

checkNet().then(() => {
  console.log(fails ? `INTEGRATION FAIL (${fails})` : 'INTEGRATION OK');
  process.exit(fails ? 1 : 0);
}, (e) => { console.log('INTEGRATION FAIL (checker crashed: ' + (e && e.stack) + ')'); process.exit(1); });
