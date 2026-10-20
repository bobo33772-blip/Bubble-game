// The 상점 catalog and its cross-file contracts, static (design/shop.md 16.4; run-all job check-shop).
// Usage: node bogeul/tools/check-shop.js [--write]
//   - ITEMS (game.js top constants): 50 entries - 40 sold or the starter, 10 draw-only (design/gacha.md 13.3) -, ids unique and /^[hfnbe][1-9a-z]$/, by slot then by price, prices in
//     their rarity band (보통 60-90, 고급 150-220, 희귀 380-480, 전설 950-1200), the sum 10,450, 13 / 15 / 8 / 3 by rarity,
//     exactly one league item for each league 1-6, the starter n1 the only 처음 선물 (price 0), a 등 item's at B / W
//     (the tubes b2 b3 at W, as tools/anchors.js TUBES), every other slot without one; SLOT_INFO's verbs; COIN's tables
//   - the art (src/sprites.js): every worn item has its it_<id> frames (face / tube: 2) with PG.ITEM_SIZE and an
//     PG.ITEM_PIVOT inside them, every effect its ic_e<n> icon, the coin / shop / lock / slot_<s> icons; every animal
//     has PG.ANCHORS for every anchored sprite name (anchors.js anchoredNames) and frame
//   - SHOP_TEXT holds every catalog name / desc, the rarity names and every SLOT_INFO word (the font warm-up)
//   - the 뽑기 (gacha.md 2, 3.2, 13.3): the 10 draw-only items (dr 1, price 0, lg 0, 고급 2 / 희귀 5 / 전설 3, after their
//     slot's sold items), DRAW (price, ten, pity, refunds below the price), DRAW_POOL (43 ids, the weights add up to
//     10,000, the tier table), DRAW_IDS (grow-only, contains the pool), SHOP_TEXT + GACHA_TEXT hold every 뽑기 string and
//     neither holds the retired v1 title's syllables
//   - firebase/firestore.rules: its GENERATED block (itemIds / priceOf / leagueNeed, pass S5; poolIds / drawPrice /
//     drawMax, gacha.md 7.4) equals the catalog and DRAW, and never drops an id the file holds now (grow-only: a slot
//     holding it could never be written again); skipped while the rules have no such block. --write regenerates the
//     block in place (never adds one). The rules match CL_V (gacha.md 7.7: at v 4 slotShape3, poolIds, d.v == 4 and
//     CL_FIELDS with 'dn')
// Prints "OK: check-shop ..." (exit 0) or the failures (exit 1).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const AX = require('./anchors.js');

const ROOT = path.join(__dirname, '..');
const game = fs.readFileSync(path.join(ROOT, 'src', 'game.js'), 'utf8');
const fails = [];
const bad = (s) => fails.push(s);
const notes = [];

// ---------------------------------------------------------------- the constants block of game.js, run on its own
// (gacha.md 13.3: the slice runs to the end of GACHA_TEXT, the block's last constant)
const a = game.indexOf('  const COIN_MAX = '), b0 = game.indexOf('  const GACHA_TEXT = ', a);
const b = b0 < 0 ? -1 : game.indexOf("';\n", b0);
let K = null;
if (a < 0 || b < 0) bad('game.js: the shop constants block (COIN_MAX .. GACHA_TEXT) not found');
else {
  try { K = vm.runInNewContext(game.slice(a, b + 2) + '\n({ COIN_MAX, LOOK0, LOOK_SLOTS, COIN, RARITY, SLOT_INFO, ITEMS, ITEM, STARTER, SHOP_TEXT, DRAW, drawW, DRAW_IDS, DRAW_POOL, DRAW_ONLY, GACHA_TEXT, VB_ROBE })', {}); }
  catch (e) { bad('game.js: the shop constants do not run on their own: ' + e.message); }
}
if (K) {
  const { RARITY, SLOT_INFO, COIN } = K, ALL = K.ITEMS;
  // (the 40 sold items and the starter keep every check below; the draw-only ones have their own, after them)
  const ITEMS = ALL.filter((it) => !it.dr), DR = ALL.filter((it) => it.dr);
  if (ALL.length !== 50) bad(`ITEMS: ${ALL.length} entries (50: 40 + 10 draw-only)`);
  if (ITEMS.length !== 40) bad(`ITEMS: ${ITEMS.length} sold items and the starter (40)`);
  const ids = new Set();
  const BAND = [[60, 90], [150, 220], [380, 480], [950, 1200]], COUNT = [13, 15, 8, 3], cnt = [0, 0, 0, 0], lgs = {};
  let sum = 0, prev = null;
  for (const it of ITEMS) {
    if (!/^[hfnbe][1-9a-z]$/.test(it.id)) bad(`ITEMS: bad id ${it.id}`);
    if (ids.has(it.id)) bad(`ITEMS: ${it.id} twice`); ids.add(it.id);
    if (typeof it.name !== 'string' || !it.name || typeof it.desc !== 'string' || !it.desc) bad(`ITEMS: ${it.id} without a name / desc`);
    if (it.slot !== it.id[0]) bad(`ITEMS: ${it.id} slot ${it.slot}`);
    if (it.rar === -1) { if (it.id !== K.STARTER || it.price !== 0) bad(`ITEMS: ${it.id} is a 처음 선물 but not the starter at price 0`); }
    else if (!(it.rar >= 0 && it.rar < 4) || it.price < BAND[it.rar][0] || it.price > BAND[it.rar][1]) bad(`ITEMS: ${it.id} price ${it.price} outside its ${RARITY[it.rar] ? RARITY[it.rar].name : '?'} band`);
    else cnt[it.rar]++;
    sum += it.price;
    if (!(it.lg >= 0 && it.lg <= 6 && Number.isInteger(it.lg))) bad(`ITEMS: ${it.id} league ${it.lg}`);
    if (it.lg) { if (lgs[it.lg]) bad(`ITEMS: two items for league ${it.lg} (${lgs[it.lg]}, ${it.id})`); lgs[it.lg] = it.id; }
    if (it.slot === 'b' ? !(it.at === 'B' || it.at === 'W') || (it.at === 'W') !== !!AX.TUBES[it.id] : 'at' in it) bad(`ITEMS: ${it.id} at ${it.at}`);
  }
  // the order (the 상점's): by slot; within a slot the sold items by price, then the draw-only items
  for (const it of ALL) {
    if (prev && ('hfnbe'.indexOf(prev.slot) > 'hfnbe'.indexOf(it.slot) || (prev.slot === it.slot && (prev.dr ? !it.dr : !it.dr && prev.price > it.price)))) bad(`ITEMS: ${it.id} out of order (by slot, then price, then the draw-only items) after ${prev.id}`);
    prev = it;
  }
  if (sum !== 10450) bad(`ITEMS: the prices add up to ${sum} (10,450)`);
  if (cnt.join() !== COUNT.join()) bad(`ITEMS: ${cnt.join(' / ')} by rarity (13 / 15 / 8 / 3)`);
  for (let l = 1; l <= 6; l++) if (!lgs[l]) bad(`ITEMS: no item for league ${l}`);
  if (ITEMS.filter((it) => it.rar === -1).length !== 1) bad('ITEMS: one 처음 선물 only');
  // the starter, the slot verbs (a hat is 쓰다), the rarity colours
  if (!K.ITEM[K.STARTER] || K.ITEM[K.STARTER].slot !== 'n') bad('STARTER is not a 목 item');
  // (review 2026-10-18: + the taken-off message; 등's default is a backpack's 메다, a cape / tube / wings carry their own vb)
  const verbs = { h: ['쓰기', '벗기', '썼어요', '벗었어요'], f: ['하기', '빼기', '했어요', '뺐어요'], n: ['하기', '빼기', '했어요', '뺐어요'], b: ['메기', '벗기', '멨어요', '벗었어요'], e: ['켜기', '끄기', '켰어요', '껐어요'] };
  for (const s of K.LOOK_SLOTS) { const v = SLOT_INFO[s]; if (!v || [v.on, v.off, v.done, v.offDone].join() !== verbs[s].join()) bad(`SLOT_INFO.${s} verbs ${v && [v.on, v.off, v.done, v.offDone]}`); }
  const OWN_VB = { b1: '두르기', b7: '두르기', b2: '끼기', b3: '끼기', b6: '달기', b9: '입기' };
  for (const it of ALL) {
    if (!('vb' in it)) { if (OWN_VB[it.id]) bad(`ITEMS: ${it.id} lacks its own verbs (${OWN_VB[it.id]})`); continue; }
    if (it.slot !== 'b' || !Array.isArray(it.vb) || it.vb.length !== 4 || it.vb.some((w) => typeof w !== 'string' || !w) || !/기$/.test(it.vb[0]) || !/기$/.test(it.vb[1])) bad(`ITEMS: ${it.id} vb ${JSON.stringify(it.vb)}`);
    else if (OWN_VB[it.id] !== it.vb[0]) bad(`ITEMS: ${it.id} wears with ${it.vb[0]} (${OWN_VB[it.id] || 'the slot default'})`);
  }
  if (K.LOOK_SLOTS.join('') !== 'hfnbe' || K.LOOK0 !== '00000') bad('LOOK_SLOTS / LOOK0');
  // COIN (3.1): the 4-player battle table, 1v1, the day bonus, the soft cap
  const bat = (min, place) => COIN.bBase + COIN.bMin * min + COIN.place[4][place];
  const T4 = { 2: [18, 14, 12, 10], 3: [22, 18, 16, 14], 5: [30, 26, 24, 22] };
  for (const m of [2, 3, 5]) { const row = [0, 1, 2, 3].map((p) => bat(m, p)); if (row.join() !== T4[m].join()) bad(`COIN: ${m}분 4-player battle ${row.join(' / ')} (${T4[m].join(' / ')})`); }
  if (COIN.place[2].join() !== '6,0' || COIN.place[3].join() !== '8,4,0') bad('COIN.place 1v1 / 3 players');
  if (COIN.day.join() !== '20,25,30,35,40' || COIN.soft !== 400 || COIN.koMax !== 6 || COIN.reviveMax !== 3) bad('COIN: day bonus / soft cap / caps');
  // SHOP_TEXT (12): every catalog string and every slot word
  const T = K.SHOP_TEXT;
  for (const it of ALL) for (const s of [it.name, it.desc]) if (T.indexOf(s) < 0) bad(`SHOP_TEXT lacks "${s}"`);
  for (const r of RARITY) if (T.indexOf(r.name) < 0) bad(`SHOP_TEXT lacks ${r.name}`);
  for (const s of K.LOOK_SLOTS) for (const w of [SLOT_INFO[s].name, SLOT_INFO[s].on, SLOT_INFO[s].off, SLOT_INFO[s].done, SLOT_INFO[s].offDone]) if (T.indexOf(w) < 0) bad(`SHOP_TEXT lacks ${w}`);
  for (const it of ALL) for (const w of Array.isArray(it.vb) ? it.vb : []) if ((T + K.GACHA_TEXT).indexOf(w) < 0) bad(`SHOP_TEXT / GACHA_TEXT lack ${it.id}'s ${w}`);
  // (looks-per-animal.md 8: the per-animal lines and the subject endings - the animals' names are in V3_TEXT)
  for (const w of ['동물마다 따로 꾸며요', '이제 동물마다 따로 꾸며요!', '가', '이가']) if (T.indexOf(w) < 0) bad(`SHOP_TEXT lacks "${w}"`);
  notes.push(`catalog 40 items, ${sum.toLocaleString('en')} coins, ${cnt.join('/')} by rarity, leagues ${Object.keys(lgs).map((l) => l + ':' + lgs[l]).join(' ')}`);

  // ---------------------------------------------------------------- the 뽑기 (gacha.md 2, 3.2, 3.5, 10, 13.3 G1)
  const DR_IDS = 'hd he f8 f9 n9 na b8 b9 e7 e8', dcnt = [0, 0, 0, 0];
  if (DR.map((it) => it.id).join(' ') !== DR_IDS) bad(`ITEMS: the draw-only items are ${DR.map((it) => it.id).join(' ')} (${DR_IDS})`);
  for (const it of DR) {
    if (it.dr !== 1 || it.price !== 0 || it.lg !== 0 || !(it.rar >= 1 && it.rar <= 3)) bad(`ITEMS: draw-only ${it.id} needs dr 1, price 0, lg 0, rar 1-3`);
    else dcnt[it.rar]++;
  }
  if (dcnt.join() !== '0,2,5,3') bad(`ITEMS: draw-only ${dcnt.slice(1).join(' / ')} by rarity (고급 2 / 희귀 5 / 전설 3)`);
  if (K.ITEM.b9 && K.ITEM.b9.vb !== K.VB_ROBE) bad('ITEMS: b9 wears with VB_ROBE');
  if (K.ITEM.b8 && 'vb' in K.ITEM.b8) bad('ITEMS: b8 uses the 등 slot default verbs');
  const D = K.DRAW, wOf = (id) => K.drawW(K.ITEM[id]);
  if (!D || D.price !== 200 || D.ten !== 10 || D.pity !== 10 || D.refund.join() !== '30,60,100,150' || D.refund.some((r) => r >= D.price) || D.wd[0] !== 0 || D.rare !== 2) bad('DRAW: price 200, ten 10, pity 10, refunds 30 / 60 / 100 / 150 below the price, no 보통 draw-only weight, rare from 희귀');
  const POOL = K.DRAW_POOL, IDS = K.DRAW_IDS, isLgSt = (id) => K.ITEM[id].lg > 0 || K.ITEM[id].rar < 0;
  if (POOL.length !== 43 || new Set(POOL).size !== 43) bad(`DRAW_POOL: ${POOL.length} ids (43)`);
  if (POOL.some(isLgSt) || IDS.some(isLgSt)) bad('DRAW_POOL / DRAW_IDS: a league item or the starter');
  if (POOL.some((id) => !IDS.includes(id))) bad('DRAW_IDS lacks a DRAW_POOL id (grow-only: every id that is or was drawable)');
  if (DR.some((it) => !POOL.includes(it.id))) bad('DRAW_POOL lacks a draw-only item');
  const tier = [0, 0, 0, 0]; let wsum = 0;
  for (const id of POOL) { const w = wOf(id); wsum += w; tier[K.ITEM[id].rar] += w; if (w !== (K.ITEM[id].dr ? D.wd : D.wr)[K.ITEM[id].rar]) bad(`DRAW: ${id} weighs ${w}`); }
  if (wsum !== 10000) bad(`DRAW_POOL: the weights add up to ${wsum} (10,000)`);
  if (tier.join() !== '4500,3400,1700,400') bad(`DRAW_POOL: tiers ${tier.join(' / ')} (4,500 / 3,400 / 1,700 / 400, gacha.md 3.2)`);
  for (const it of ALL) if ((it.lg || it.rar < 0) && K.drawW(it) !== 0) bad(`drawW: ${it.id} (league / starter) is drawn`);
  if (K.drawW(Object.assign({}, K.ITEM.h1, { retired: 1 })) !== 0) bad('drawW: a retired item is still drawn');
  // the texts (10): every 뽑기 string the UI shows (6) in SHOP_TEXT + GACHA_TEXT; never the retired v1 title's syllables
  const TT = T + ' ' + K.GACHA_TEXT, OLD = String.fromCharCode(0xbf40, 0xae00);
  const GSTR = ['1회 뽑기', '10회 뽑기', '코인', '희귀 이상 1개 확정', '개 더 모아요', '다 모았어요!', '두근두근…', '모두 이미 있어요', '뽑기 결과',
    '뽑기 전용 아이템', '뽑기 전용 확정!', '뽑기 확률', '뽑기로 가기', '뽑기에서만 나와요', '새 아이템!', '새 아이템', '이미 있어요', '지금',
    '지난 뽑기 결과예요', '한 번 더 누르면 뽑아요', '확률 보기', '확률 닫기', '희귀 이상 확정', '비누 캡슐 뽑기', '등급', '합계', '가지고 있어요',
    '건너뛰기', '확인', '뽑기 전용 아이템을 다 모았어요!', '남은 아이템은 상점에서 사요', '첫 뽑기는 뽑기 전용 아이템 확정!', '회 안에 뽑기 전용 아이템 확정',
    '다음 뽑기에 뽑기 전용 아이템 확정!', '뽑기가 저장되지 않았어요', '코인은 그대로예요', '이 브라우저에서는 저장되지 않아요', '비누 코인은 게임을 해야만 모여요',
    '아이템별 확률', '보통 뽑기', '희귀 이상 뽑기', '확정 뽑기', '상점 아이템', '리그 아이템과 처음 선물은 나오지 않아요', '뽑기 전용 아이템은 상점에서 팔지 않아요'];
  for (const w of GSTR) if (TT.indexOf(w) < 0) bad(`SHOP_TEXT / GACHA_TEXT lack "${w}"`);
  if (T.indexOf(OLD) >= 0 || K.GACHA_TEXT.indexOf(OLD) >= 0) bad('SHOP_TEXT / GACHA_TEXT hold the retired v1 title (final-e2e2)');
  notes.push(`뽑기: ${DR.length} draw-only items (${dcnt.slice(1).join('/')}), pool ${POOL.length} ids weighing ${wsum.toLocaleString('en')} (${tier.join(' / ')}), ${IDS.length} drawable ids`);

  // ---------------------------------------------------------------- the art
  const PG = AX.load().PG, S = PG.SPRITES || {}, SZ = PG.ITEM_SIZE || {}, PV = PG.ITEM_PIVOT || {};
  let frames = 0;
  // (gacha.md 13.3: a draw-only item's missing art is an error since G3 shows them - GA1 landed it)
  for (const it of ALL) {
    const bad = fails.push.bind(fails);
    if (it.slot === 'e') {
      const n = 'ic_' + it.id, f = S[n];
      if (!f || !f.length || !SZ[n] || SZ[n].join() !== '8,8') bad(`art: ${n} (8x8) missing`); else frames += f.length;
      continue;
    }
    const n = 'it_' + it.id, f = S[n], want = it.slot === 'f' || (it.slot === 'b' && it.at === 'W') ? 2 : 1;
    if (!f || f.length !== want) { bad(`art: ${n} has ${f ? f.length : 0} frames (${want})`); continue; }
    const sz = SZ[n];
    if (!sz) { bad(`art: PG.ITEM_SIZE.${n} missing`); continue; }
    f.forEach((fr, i) => { if (!Array.isArray(fr) || fr.length !== sz[1] || fr.some((r) => r.length !== sz[0])) bad(`art: ${n}[${i}] is not ${sz[0]}x${sz[1]}`); });
    const pv = PV[it.id], pvs = !pv ? [] : Array.isArray(pv[0]) ? pv : [pv];
    if (!pvs.length) bad(`art: PG.ITEM_PIVOT.${it.id} missing`);
    for (const p of pvs) if (!(p[0] >= 0 && p[0] < sz[0] && p[1] >= 0 && p[1] < sz[1])) bad(`art: ${it.id} pivot ${p} outside ${sz}`);
    frames += f.length;
  }
  for (const n of ['coin', 'shop', 'lock', 'slot_h', 'slot_f', 'slot_n', 'slot_b', 'slot_e']) if (!S[n] || !S[n].length || !SZ[n] || SZ[n].join() !== '8,8') bad(`art: ${n} (8x8) missing`);
  if (S.coin && S.coin.length !== 2) bad('art: coin has ' + S.coin.length + ' frames (2)');
  // (gacha.md 13.3: the 상점's capsule icon and e7's duckling (G3), the machine, its crank, the capsules (G4) - errors)
  for (const [n, w, h, k] of [['ic_cap', 8, 8, 1], ['fx_duck', 5, 4, 2], ['gacha', 20, 28, 1], ['gacha_h', 7, 7, 4], ['cap', 6, 6, 4], ['cap_t', 6, 3, 4], ['cap_b', 6, 3, 1]])
    if (!S[n] || S[n].length !== k || !SZ[n] || SZ[n].join() !== w + ',' + h) bad(`art: ${n} (${w}x${h}, ${k} frames) missing`);
  let anch = 0;
  for (const c of AX.CHARS) {
    if (!PG.ANCHORS || !PG.ANCHORS[c]) { bad(`anchors: ${c} has none`); continue; }
    for (const name of AX.anchoredNames(c)) {
      const n = (S[name] || []).length; if (!n) continue;           // (a move pose the art lacks: nothing to anchor)
      for (let i = 0; i < n; i++) { if (!AX.anchorsOf(PG.ANCHORS, name, i)) bad(`anchors: ${name}[${i}] none`); else anch++; }
    }
  }
  notes.push(`art ${frames} item frames + 8 icons, anchors for ${anch} frames`);
}

// ---------------------------------------------------------------- the release gate (shop.md 19 S5, review 2026-10-18)
// a store never goes into a cloud document that cannot hold it (looks-per-animal.md 0.1): store v 2 (coins) needs
// cloud v >= 2 - a v1 page keeps no coin fields, so coins earned while signed in would be lost at sign-out; v 3 (a worn
// set per animal) needs >= 3 - a v 2 document takes one set of 5 characters; v 4 (the 뽑기) needs >= 4; v 5 (the trophy
// balance, design/trophies.md: no new field - a v 4 page would clamp de to 20, so it reads 'newer') needs >= 4. And a new
// ownable catalog id is a new store version (an older page of the same version would drop the id it does not know and
// write the store back): the catalog's size is pinned per TRO_V
{
  const tv = /\bTRO_V = (\d+)/.exec(game), cv = /\bCL_V = (\d+)/.exec(game);
  const GATE = { 2: 2, 3: 3, 4: 4, 5: 4 }, WHY = { 2: 'coins (shop.md 8)', 3: 'a set per animal: a v 2 document takes one set of 5 characters', 4: 'the 뽑기 (gacha.md 7)', 5: 'the trophy balance: no new field' };
  const OWNABLE = { 2: 40, 3: 40, 4: 50, 5: 50 };
  if (!tv || !cv) bad('game.js: TRO_V / CL_V not found');
  else {
    const t = +tv[1], c = +cv[1], need = GATE[t] || (t > 5 ? t : 0);
    if (c < need) bad(`release gate: the store is v ${t} (${WHY[t] || 'newer'}) but the cloud document v ${c} - the cloud must be v ${need}`);
    else notes.push(`release gate: store v ${t}, cloud document v ${c}`);
    // (gacha.md 0.1: the draw-only ids count from store v 4 - in G1 they exist hidden and unobtainable)
    const own = K ? K.ITEMS.filter((it) => !it.dr || t >= 4).length : 0;
    if (K && OWNABLE[t] !== undefined && own !== OWNABLE[t]) bad(`catalog: ${own} ownable ids under store v ${t} (${OWNABLE[t]}) - a new ownable id needs a new store and cloud version`);
  }
}

// ---------------------------------------------------------------- firestore.rules' generated block (S5)
const RULES = path.join(ROOT, 'firebase', 'firestore.rules');
const G0 = '// GENERATED by tools/check-shop.js', G1 = '// END GENERATED';
// (gacha.md 7.4: itemIds / priceOf from price > 0 - draw-only ids are excluded by their price 0, retired ones kept -,
// poolIds from DRAW_IDS - not DRAW_POOL: retiring an item never takes it out of the rules -, the two numbers from DRAW)
function genBlock(ITEMS, IDS, D) {
  const paid = ITEMS.filter((it) => it.price > 0);
  const wrap = (parts, lead) => { const out = []; let line = ''; for (const p of parts) { if ((line + p).length > 110) { out.push(line.trimEnd()); line = lead; } line += p + ' '; } out.push(line.trimEnd()); return out.join('\n'); };
  return [
    '    // price = a new id; a new draw price = a new counter); an id never leaves these lists (a slot holding it could never',
    '    // be written again)',
    '    function itemIds() { return [' + wrap(paid.map((it) => `'${it.id}',`), '      ').replace(/,$/, '') + ']; }',
    '    function priceOf(id) { return {' + wrap(paid.map((it) => `'${it.id}': ${it.price},`), '      ').replace(/,$/, '') + '}[id]; }',
    '    function leagueNeed(id) { return {' + ITEMS.filter((it) => it.lg).map((it) => `'${it.id}': ${it.lg}`).join(', ') + '}.get(id, 0); }',
    '    function poolIds() { return [' + wrap(IDS.map((id) => `'${id}',`), '      ').replace(/,$/, '') + ']; }',
    `    function drawPrice() { return ${D.price}; }`,
    `    function drawMax() { return ${D.ten}; }`,
  ].join('\n');
}
// the ids a list function of a rules text holds ([] when it has none)
const listOf = (txt, fn) => { const m = new RegExp('function ' + fn + '\\(\\) \\{ return \\[([^\\]]*)\\]').exec(txt); return m ? (m[1].match(/'([0-9a-z]+)'/g) || []).map((q) => q.slice(1, -1)) : []; };
if (K && fs.existsSync(RULES)) {
  const r = fs.readFileSync(RULES, 'utf8'), i0 = r.indexOf(G0), i1 = r.indexOf(G1);
  if (i0 < 0 || i1 < i0) notes.push('rules: no GENERATED block yet (pass S5) - skipped');
  else {
    const head = r.indexOf('\n', i0) + 1, body = r.slice(head, r.lastIndexOf('\n', i1) + 1), want = genBlock(K.ITEMS, K.DRAW_IDS, K.DRAW) + '\n';
    // (gacha.md 7.4: grow-only - a published id never leaves the rules, with or without --write)
    const drop = ['itemIds', 'poolIds'].flatMap((fn) => listOf(body, fn).filter((id) => !listOf(want, fn).includes(id)).map((id) => fn + ' ' + id));
    if (drop.length) bad('rules: a published id never leaves the rules - the new block drops ' + drop.join(', '));
    else if (process.argv.includes('--write')) { if (body !== want) { fs.writeFileSync(RULES, r.slice(0, head) + want + r.slice(r.lastIndexOf('\n', i1) + 1)); notes.push('rules: GENERATED block rewritten'); } else notes.push('rules: GENERATED block already current'); }
    else if (body !== want) bad('rules: the GENERATED block differs from ITEMS (node tools/check-shop.js --write)');
    else notes.push('rules: GENERATED block matches the catalog');
  }
} else if (K) notes.push('rules: no firebase/firestore.rules - skipped');
// (gacha.md 7.7 / looks-per-animal.md 6.7 item 5, compat review #12: the rules file speaks the cloud version game.js
// writes - the header's `v: <CL_V>`, createOk and metaOk take d.v == CL_V, slotOk and sumOk route it; from v 4
// slotShape3, poolIds and CL_FIELDS with 'dn'). Returns the missing parts ([] = in step)
function rulesVsCl(r, c, cf) {
  const miss = [];
  const fn = (name) => { const i = r.indexOf('function ' + name + '('); if (i < 0) return ''; const j = r.indexOf('\n    function ', i + 1); return r.slice(i, j < 0 ? r.length : j); };
  const hv = /^\/\/\s+v: (\d+),/m.exec(r);
  if (!hv || +hv[1] !== c) miss.push(`the header's v: ${c} (it says ${hv ? hv[1] : 'nothing'})`);
  for (const f of ['createOk', 'metaOk']) if (!new RegExp('d\\.v == ' + c + '\\b').test(fn(f))) miss.push(f + ' d.v == ' + c);
  if (!new RegExp('d\\.v == ' + c + '\\b').test(fn('slotOk'))) miss.push('slotOk routing v ' + c);
  if (!new RegExp('\\bv == ' + c + '\\b').test(fn('sumOk'))) miss.push('sumOk routing v ' + c);
  if (c >= 4) {
    if (!/function slotShape3\(/.test(r)) miss.push('slotShape3');
    if (!/function poolIds\(/.test(r)) miss.push('poolIds');
    if (!cf || !/'dn'/.test(cf[1])) miss.push("CL_FIELDS 'dn' (game.js)");
  }
  return miss;
}
{
  const cv = /\bCL_V = (\d+)/.exec(game), cf = /const CL_FIELDS = \[([^\]]*)\]/.exec(game);
  if (cv && +cv[1] >= 2 && fs.existsSync(RULES)) {
    const r = fs.readFileSync(RULES, 'utf8'), c = +cv[1], miss = rulesVsCl(r, c, cf);
    if (miss.length) bad('rules vs CL_V ' + c + ': missing ' + miss.join(', '));
    else notes.push('rules: speak document v ' + c);
    // (the check itself: a copy whose header names another version, or whose createOk lost the version, must fail)
    const wrongHead = r.replace(/^(\/\/\s+v: )\d+,/m, (m, a) => a + (c + 1) + ',');
    const wrongCreate = r.replace(fn0(r, 'createOk'), (x) => x.split('d.v == ' + c).join('d.v == ' + (c + 9)));
    if (!rulesVsCl(wrongHead, c, cf).length) bad('rules vs CL_V self-test: a rules file with a wrong header passed');
    else if (!rulesVsCl(wrongCreate, c, cf).length) bad('rules vs CL_V self-test: a rules file whose createOk lacks d.v == ' + c + ' passed');
    else notes.push('rules vs CL_V self-test: a wrong header / createOk fails, the real file passes');
  }
}
function fn0(r, name) { const i = r.indexOf('function ' + name + '('); const j = r.indexOf('\n    function ', i + 1); return i < 0 ? '\u0000' : r.slice(i, j < 0 ? r.length : j); }

for (const n of notes) console.log(n);
if (fails.length) { for (const f of fails) console.log('FAIL ' + f); console.log(`CHECK-SHOP FAIL (${fails.length})`); process.exit(1); }
console.log('OK: check-shop - catalog, art, anchors and texts agree');
