// Runs EVERY headless driver in src/tests (and the screenshot scenes) and prints one summary.
// Usage: node bogeul/tools/run-all.js [name-filter ...] [--exact] [--jobs=4] [--no-build] [--list]
//   - builds first (node build.js, PG_RELAY_URL=none unless set) unless --no-build
//   - starts tools/serve.js on :8765 (PG_HTTP_PORT=<port> for another) for the multi-iframe drivers, or reuses one that
//     is already running there - only when it serves this build (another worktree's server would test another build)
//   - virtual-time drivers and the node checks (runner 'node': a tools/*.js script) run in parallel (--jobs), real-time
//     ones (rt / cdp) run one at a time afterwards
//   - a job passes when its pass test matches AND the page logged no console error / warning and no uncaught exception
//   - every job's full output goes to C:/Temp/bogeul/runall/<job>.log
// Exit code 0 when every job passed.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const { T } = require('./env');
const LOGS = `${T}/runall`;
const PORT = +process.env.PG_HTTP_PORT || 8765;
const HTTP = `http://localhost:${PORT}/`;
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const JOBS = Math.max(1, parseInt(opt('jobs', '4'), 10) || 4);
const filters = args.filter((a) => !a.startsWith('--'));

// pass tests: a regex that must match the output, or a function(out) -> true | 'reason'
const doneZero = (tag) => (out) => {
  const m = out.match(new RegExp(tag + ' DONE pass=(\\d+) fail=(\\d+)'));
  if (!m) return `no "${tag} DONE" line`;
  return +m[2] === 0 && +m[1] > 0 ? true : `${tag} DONE pass=${m[1]} fail=${m[2]}`;
};
const summaryZero = (tag) => (out) => {
  const m = out.match(new RegExp(tag + ' SUMMARY (\\d+) passed, (\\d+) failed([^\\n]*)'));
  if (!m) return `no "${tag} SUMMARY" line`;
  return +m[2] === 0 && !/pending/.test(m[3]) ? true : m[0];
};
const has = (re) => (out) => (re.test(out) ? true : `no ${re}`);
const NOTCH = { 844: { PG_CDP_INSETS: '{"left":47,"right":47,"bottom":21}' }, 932: { PG_CDP_INSETS: '{"left":59,"right":59,"bottom":21}' } };
const touchShot = (out) => { const bad = out.match(/TOUCH FAIL.*/); return bad ? bad[0].slice(0, 200) : /TOUCH SHOT READY (?!error)/.test(out) ? true : 'no TOUCH SHOT READY'; };
const shotOk = (out) => { const bad = out.match(/MPNET FAIL.*|SHOT error.*/); return bad ? bad[0].slice(0, 160) : /SHOT READY/.test(out) ? true : 'no SHOT READY'; };

// [name, page, budget, pass, extra]  extra: {w, h, shot, runner:'cdp'|'node', done, rt, mobile, serial, env: {more env vars}}
const V = (name, page, budget, pass, extra) => Object.assign({ name, page, budget: String(budget), pass, w: 900, h: 760 }, extra || {});
const LIST = [
  // ---- v1 / v2 engine drivers (virtual time)
  V('smoke', 'test-smoke.html', 30000, doneZero('TESTS')),
  V('campaign', 'test-campaign.html', 30000, doneZero('CAMP')),
  V('final-e2e', 'test-final-e2e.html', 60000, doneZero('E2E')),
  V('final-e2e2', 'test-final-e2e2.html', 120000, doneZero('E2E2')),
  V('fixes', 'test-fixes.html', 30000, doneZero('FIX')),
  V('integration', 'test-integration.html', 60000, doneZero('INT')),
  V('levels-engine', 'test-levels-engine.html', 40000, summaryZero('LEVELTEST')),
  V('v2-core', 'test-v2-core.html', 60000, doneZero('V2')),
  V('v2-boss', 'test-v2-boss.html', 200000, doneZero('BOSS')),
  V('review-correctness', 'test-review-correctness.html', 60000, doneZero('RV')),
  // ---- v3 drivers (virtual time)
  V('mp-local', 'test-mp-local.html', 120000, doneZero('MP')),
  V('v3-levels', 'test-v3-levels.html', 60000, summaryZero('V3LEVELS')),
  // battle arenas in the engine: enemy pressure per spawn (16 seeds x 60 s idle), first stun, the drain drop
  V('v3-fixes', 'test-v3-fixes.html', 60000, doneZero('FIXES')),
  V('arena-gate', 'test-arena-gate.html#' + encodeURIComponent(JSON.stringify({ seeds: 16 })), 120000, doneZero('AGATE')),
  // 몬스터 출현 (design/distinction.md §3): off = no arena enemies and no intruder minions, KO / power-ups / podium as
  // before, the default unchanged, an older host's R (no o[5]) reads on; online over bc below (monsters-net)
  V('monsters', 'test-monsters.html', 120000, doneZero('MON')),
  // telling players apart (design/distinction.md §2, passes D3 / D4): solo pixel-identical to the pre-D3 baseline, twin
  // colours, the ink-ringed outline, ground markers, HUD panels by seat, bubble rings, name tags v2 (local); "me" online
  // over bc below (distinction-net). Its screenshots to LOOK at (C:/Temp/bogeul/dist-*.png): a 4-duck battle on each
  // arena, co-op with a ghost, a floating animal in 냉온탕 대결, the podium, the tags of 4 animals side by side
  V('distinction', 'test-distinction.html', 120000, doneZero('DIST')),
  // ... and its tag group on a phone (review 2026-10-18: my tag on top, no tag lying on another animal, the podium chips)
  V('distinction-phone', 'test-distinction.html?phone=1', 60000, doneZero('DIST'), { w: 390, h: 844, runner: 'cdp', mobile: true, done: 'DIST DONE' }),
  ...[[390, 844], [900, 760]].flatMap(([w, h]) => [0, 1, 2, 3].map((a) => ['battle' + a, 'battle&arena=' + a]).concat([['coop', 'coop&round=1&chars=duck,cat,duck,frog'],
    ['float', 'float&chars=duck,duck,cat,otter'], ['podium', 'podium'], ['tags', 'tags&chars=duck,cat,frog,otter']])
    .map(([k, q]) => V(`dist-${k}-${w}`, `test-distinction.html?shot=${q}`, w < 400 ? 20000 : 8000, has(/DIST SHOT READY/),
      w < 400 ? { shot: `dist-${k}-${w}.png`, w, h, runner: 'cdp', mobile: true, done: 'DIST SHOT READY' } : { shot: `dist-${k}-${w}.png`, w, h }))),
  ...['solo', 'battle', 'coop', 'podium'].map((s) => V('v3-sprites-' + s, `test-v3-sprites.html?scene=${s}`, 9000, has(/V3-SPRITES PASS/), { shot: `runall-v3s-${s}.png` })),
  // ---- level-design / measurement reviews (pass = finished without errors)
  V('review-bot16', 'test-review-bot16.html#1-6', 60000, has(/B16 DONE/)),
  V('review-cheese', 'test-review-cheese.html', 60000, has(/CH DONE/)),
  V('review-covered', 'test-review-covered.html', 60000, has(/COVERED DONE/)),
  V('review-dropin', 'test-review-dropin.html', 60000, has(/DI DONE/)),
  V('review-firsthit', 'test-review-firsthit.html', 60000, has(/FH DONE/)),
  V('review-float', 'test-review-float.html', 60000, has(/FL DONE/)),
  V('review-gameplay', 'test-review-gameplay.html', 60000, has(/RV [^\n]*DONE|\bDONE\b/), { shot: 'runall-rv-gameplay.png' }),
  V('review-gap', 'test-review-gap.html', 60000, has(/GAP DONE/)),
  V('review-gather', 'test-review-gather.html', 60000, has(/GA DONE/)),
  V('review-killers', 'test-review-killers.html', 60000, has(/KL DONE/)),
  V('review-sunk-shot', 'test-review-sunk-shot.html', 8000, has(/SUNK DONE/), { shot: 'runall-rv-sunk.png' }),
  V('review-levels-a0', 'test-review-levels.html#a0', 8000, has(/RV DONE/), { shot: 'runall-rv-a0.png', w: 1040, h: 940 }),
  V('review-levels-b5', 'test-review-levels.html#b5', 20000, has(/RV DONE/), { shot: 'runall-rv-b5.png', w: 1040, h: 940 }),
  ...['title', 'play', 'trapped', 'pause', 'over', 'ending', 'touch-play'].map((s) => V('review-' + s, `test-review.html#${s}`, 8000, has(/\bDONE\b/), { shot: `runall-review-${s}.png` })),
  // ---- screenshot scenes (pass = the scene logged its line without errors)
  V('shot-play', 'test-shot-play.html', 6000, has(/SHOT state/), { shot: 'runall-shot-play.png' }),
  V('shot-trapped', 'test-shot-trapped.html', 6000, has(/SHOT trapped/), { shot: 'runall-shot-trapped.png' }),
  V('shot-phone', 'test-shot-phone.html#touch-play', 6000, has(/PHONE touch-play/), { shot: 'runall-shot-phone.png', w: 390, h: 844 }),
  ...['transition', 'over', 'ending', 'pause', 'hurry', 'steam', 'touch'].map((s) => V('shots-' + s, `test-shots.html#${s}`, 8000, has(/SHOT /), { shot: `runall-shots-${s}.png` })),
  ...['water', 'cold', 'door', 'pause', 'over', 'scald', 'clear', 'ticket'].map((s) => V('shots-v2-' + s, `test-shots-v2.html#${s}`, 8000, has(/SHOTS-V2 READY/), { shot: `runall-v2-${s}.png` })),
  ...['1-mid', '2-stun', '3-hop', '4-p3'].map((s) => V('shots-boss-' + s, `test-shots-boss.html#${s}`, 8000, has(/SHOT READY/), { shot: `runall-boss${s}.png` })),
  ...['play', 'over'].map((s) => V('final-e2e-' + s, `test-final-e2e.html#${s}`, 8000, has(/E2E SHOT READY/), { shot: `runall-e2e-${s}.png` })),
  ...['water', 'boss', 'ending'].map((s) => V('final-e2e2-' + s, `test-final-e2e2.html#${s}`, 12000, has(/E2E2 SHOT READY/), { shot: `runall-e2e2-${s}.png` })),
  ...['title', 'coop', 'battle', 'podium', 'over'].map((s) => V('mp-local-' + s, `test-mp-local.html#${s}`, 10000, has(/MP SHOT READY/), { shot: `runall-mpl-${s}.png` })),
  V('sprites-items', 'test-sprites-items.html', 6000, has(/ITEMS mode/), { shot: 'runall-sprites-items.png' }),
  // ---- v4 trophies (design/trophies.md §15): the rules / store / UI fit offline in virtual time; online over bc below
  V('trophies', 'test-trophies.html', 120000, doneZero('TROPHY'), { shot: 'runall-trophies.png' }),
  // ---- 파티 (design/party.md §13): the rules, the two games, the flow, the coins, the card fit - offline, virtual time
  // (the engine stepped frame by frame); its card on a landscape phone (the size it meets there: rotSync covers an upright one)
  V('party', 'test-party.html', 120000, doneZero('PARTY'), { shot: 'runall-party.png' }),
  V('party-fit-568', 'test-party.html#fit&touch=1', 30000, doneZero('PARTY'), { w: 568, h: 320, runner: 'cdp', mobile: true, done: 'PARTY DONE' }),
  // ---- v4 shop (design/shop.md 16): 비누 코인 (the battle economy, runs through real clears, the day bonus and soft cap,
  // the pace), the store v2 (the v1 migration, clamps, read-modify-write, buy / wear), the card rows and their fit, the
  // podium's coin line; then (S2) the items in play. check-shop: the catalog against the art, anchors and texts. Its
  // screenshots to LOOK at (C:/Temp/bogeul/shop-*.png): the 목욕 끝 card with both rows at 1x and on a 320 px phone,
  // the ending card, the podium's coin line
  V('shop', 'test-shop.html', 180000, doneZero('SHOP')),
  V('check-shop', 'check-shop.js', 0, has(/^OK: check-shop/m), { runner: 'node' }),
  // ---- v4 뽑기 (design/gacha.md 13.1): the catalog, the pure draw, the odds, the statistics, the pace (G1); the store, the
  // commit before the animation, refunds, two tabs (G2) - offline, in virtual time
  V('gacha', 'test-gacha.html', 240000, doneZero('GACHA')),
  // (G3) the 뽑기 tab's fit on real phone viewports (no vertical scroll at 320 / 360 / 390 resting and with ten results,
  // three tabs + the chip on one row; 844x390 scrolls, the draw buttons in view); shots to LOOK at
  // (C:/Temp/bogeul/gacha-hub-*.png, gacha-play-*.png: e7 / e8 wearers on 대중탕 한판 (대리석) and 사우나 계단)
  ...[[320, 568], [360, 740], [390, 844], [844, 390]].map(([w, h]) => V(`gacha-fit-${w}`, 'test-gacha.html#hubfit&touch=1', 60000, doneZero('GACHA'), { w, h, runner: 'cdp', mobile: true, done: 'GACHA DONE' })),
  ...[['first', 320], ['armed', 320], ['poor', 390], ['odds', 390], ['res1-new', 320], ['res1-dup', 390], ['res10', 320], ['res10', 390], ['res10', 844], ['done', 390], ['shopcell', 320], ['e7', 390],
    // (G4) the show frozen at t = 70 (the capsule wobbling at the centre), 150 (ten: half the cells open), 88 (the 전설's rays)
    ['anim', 390], ['anim10', 390], ['pop', 844]].map(([s, w]) =>
    V(`gacha-hub-${s}-${w}`, `test-gacha.html#shot=hub&st=${s}&touch=1`, 20000, has(/GACHA SHOT READY/), { shot: `gacha-hub-${s}-${w}.png`, w, h: { 320: 568, 390: 844, 844: 390 }[w], runner: 'cdp', mobile: true, done: 'GACHA SHOT READY' })),
  V('gacha-hub-1x', 'test-gacha.html#shot=hub&st=rest&s=1', 12000, has(/GACHA SHOT READY/), { shot: 'gacha-hub-1x.png', w: 560, h: 400 }),
  ...[0, 2].map((a) => V(`gacha-play-${a}`, `test-gacha.html#shot=play&arena=${a}`, 12000, has(/GACHA SHOT READY/), { shot: `gacha-play-${a}.png` })),
  V('shop-over-1x', 'test-shop.html#shot=over&s=1', 12000, has(/SHOP SHOT READY/), { shot: 'shop-over-1x.png', w: 560, h: 400 }),
  V('shop-over-320', 'test-shop.html#shot=over', 20000, has(/SHOP SHOT READY/), { shot: 'shop-over-320.png', w: 320, h: 568, runner: 'cdp', mobile: true, done: 'SHOP SHOT READY' }),
  V('shop-ending', 'test-shop.html#shot=ending&s=2', 12000, has(/SHOP SHOT READY/), { shot: 'shop-ending.png' }),
  V('shop-podium', 'test-shop.html#shot=podium&s=2', 12000, has(/SHOP SHOT READY/), { shot: 'shop-podium.png' }),
  // (S2, items in play) a 4-player battle with all four wearing hats - two ducks, so 2P is a twin - next to the same
  // battle drawn bare, on a 390 px phone too; the podium with hats (crowns above them); the game's own composites
  V('shop-play-900', 'test-shop.html#shot=play', 12000, has(/SHOP SHOT READY/), { shot: 'shop-play-900.png' }),
  V('shop-play-bare-900', 'test-shop.html#shot=play&bare=1', 12000, has(/SHOP SHOT READY/), { shot: 'shop-play-bare-900.png' }),
  V('shop-play-390', 'test-shop.html#shot=play&arena=2', 20000, has(/SHOP SHOT READY/), { shot: 'shop-play-390.png', w: 390, h: 844, runner: 'cdp', mobile: true, done: 'SHOP SHOT READY' }),
  V('shop-podhat', 'test-shop.html#shot=podhat', 12000, has(/SHOP SHOT READY/), { shot: 'shop-podhat.png' }),
  ...[0, 1].map((k) => V('shop-sheet-' + k, 'test-shop.html#shot=sheet&part=' + k, 12000, has(/SHOP SHOT READY/), { shot: 'shop-sheet-' + k + '.png', w: 860, h: 570 })),
  // (S3a / S3b, the hub) its fit on real phone viewports (the title row on one line and no scroll; the hub never sideways,
  // no vertical scroll at 320 / 360 / 390, the action button beside the preview at 844x390, where it scrolls); the room's
  // 꾸미기 over http (a lone host on bc). Screenshots to LOOK at (C:/Temp/bogeul/shop-title-*.png, shop-hub-*.png,
  // shop-room-*.png): the title row at 1x / 2x / phones, every 상점 state, 마이페이지 (the starter note, a full
  // inventory, an empty slot), landscape, a 1x window, the room's cards in my set
  ...[[320, 568, 'all'], [360, 740, 'all'], [390, 844, 'all'], [844, 390, 'none']].map(([w, h, ns]) => V(`shop-fit-${w}`, `test-shop.html#hubfit&touch=1&ns=${ns}`, 60000, doneZero('SHOP'), { w, h, runner: 'cdp', mobile: true, done: 'SHOP DONE' })),
  V('shop-room', HTTP + 'test-shop.html?net=bc#room', 'rt90000', doneZero('SHOP'), { done: 'SHOP DONE' }),
  V('shop-title-1x', 'test-shop.html#shot=title&s=1', 12000, has(/SHOP SHOT READY/), { shot: 'shop-title-1x.png', w: 560, h: 400 }),
  V('shop-title-2x', 'test-shop.html#shot=title&s=2', 12000, has(/SHOP SHOT READY/), { shot: 'shop-title-2x.png' }),
  ...[[320, 568], [390, 844], [844, 390]].map(([w, h]) => V(`shop-title-${w}`, 'test-shop.html#shot=title&touch=1', 20000, has(/SHOP SHOT READY/), { shot: `shop-title-${w}.png`, w, h, runner: 'cdp', mobile: true, done: 'SHOP SHOT READY' })),
  ...[['first', 320], ['armed', 320], ['poor', 390], ['locked', 390], ['legend', 900], ['bought', 900], ['e6', 844], ['starter', 320], ['full', 320], ['empty', 390], ['my', 844], ['full', 900],
    // (looks-per-animal.md L3: 마이페이지 on 냥냥 with the row of six, the migrated store's note, its longest 상점 line)
    ['ani', 320], ['ani', 844], ['hint', 390], ['hintbuy', 320]].map(([st, w]) => {
    const h = { 320: 568, 390: 844, 844: 390, 900: 760 }[w], phone = w < 900;
    return V(`shop-hub-${st}-${w}`, `test-shop.html#shot=hub&st=${st}${phone ? '&touch=1' : ''}&tick=90`, phone ? 20000 : 12000, has(/SHOP SHOT READY/),
      phone ? { shot: `shop-hub-${st}-${w}.png`, w, h, runner: 'cdp', mobile: true, done: 'SHOP SHOT READY' }
        // (bought: shot at READY, real time - a virtual-time budget runs past the message's 4 s, looks-per-animal.md L3)
        : st === 'bought' ? { shot: `shop-hub-${st}-${w}.png`, w, h, runner: 'cdp', done: 'SHOP SHOT READY' } : { shot: `shop-hub-${st}-${w}.png`, w, h });
  }),
  V('shop-hub-1x', 'test-shop.html#shot=hub&st=buy&s=1', 12000, has(/SHOP SHOT READY/), { shot: 'shop-hub-1x.png', w: 560, h: 400 }),
  ...[[390, 844], [900, 760]].map(([w, h]) => V(`shop-room-${w}`, HTTP + 'test-shop.html?net=bc#shot=room&st=my&close=1', 'rt60000', has(/SHOP SHOT READY/), { done: 'SHOP SHOT READY', shot: `shop-room-${w}.png`, w, h })),
  // ---- v4 character kits (design/char-kits.md §14): every move and bubble in one engine (§14.1); the looks staged for
  // screenshots (moves, bubbles, two battles, 능력 끄기 pixel-identical, the fallbacks without the optional sprites, the
  // first-round hint, the countdown line; calm = prefers-reduced-motion); the kit cards (§12: each animal, 능력 끄기, the
  // longest texts, a phone, the room's card); online parity over bc below
  V('kits', 'test-kits.html', 120000, doneZero('KITS')),
  // floating empty bubbles by mode (the user, 2026-10-19: multiplayer screens get cluttered): solo exactly 720 + 120 and
  // no cap; co-op 330 + 90, 7 per player, 14 in all; battle 210 + 90, 3 / 12 (a battle player has 3 out in all: the 4th blow pops the oldest); a capped bubble blinks 30 frames then the
  // plain self-pop (no score, no chain), a ridden one (bounced on in the last 90 frames) is skipped; the cap / life pops,
  // kit bubbles, the blink; online over bc below (clutter-net). Measurements: review-mpbal.js exp=clutter (not a job)
  V('clutter', 'test-clutter.html', 60000, doneZero('CLUTTER')),
  ...['moves', 'bubbles', 'battle', 'battle2', 'off', 'fallback', 'hint', 'count'].map((s) => V('kits-scenes-' + s, `test-kits-scenes.html?scene=${s}`, 9000, doneZero('KS'), { shot: `runall-kits-${s}.png` })),
  ...['moves', 'bubbles'].map((s) => V('kits-scenes-' + s + '-calm', `test-kits-scenes.html?scene=${s}&calm=1`, 9000, doneZero('KS'), { shot: `runall-kits-${s}-calm.png` })),
  V('kits-scenes-count-off', 'test-kits-scenes.html?scene=count&off=1', 9000, doneZero('KS'), { shot: 'runall-kits-count-off.png' }),
  ...['duck', 'capy', 'otter', 'penguin', 'cat', 'frog', 'off,capy', 'long,penguin'].map((s) => V('ui-kit-' + s.replace(',', '-'), 'test-ui-kit-preview.html#' + s, 3000, doneZero('KIT'), { shot: `runall-kit-${s.replace(',', '-')}.png` })),
  // the node checks (pass = their OK line and exit code 0): no kit lowers the levels' validated jump / walk (§14.1
  // levels), the sfx recipes, the sprite art, the cross-file names (v4 poses / glyphs / kit sounds), PG.Net + the v4 wire
  V('validate-levels', 'validate-levels.js', 0, has(/ALL OK \(0 warning/), { runner: 'node' }),
  V('audio-node', 'audio-node-test.js', 0, has(/\b\d+ passed, 0 failed/), { runner: 'node' }),
  V('check-sprites', 'check-sprites.js', 0, has(/^OK: \d+ required sprites/m), { runner: 'node' }),
  V('check-integration', 'check-integration.js', 0, has(/INTEGRATION OK/), { runner: 'node' }),
  V('net-node', 'net-node-test.js', 0, has(/NET NODE OK/), { runner: 'node' }),
  // the two shipped pages' contracts (artifact / standalone) + the standalone page playing solo without PeerJS
  V('check-pages', 'check-pages.js', 0, has(/^PAGES OK: \d+ passed, 0 failed/m), { runner: 'node' }),
  // the WebSocket relay (design/relay.md 11.1): cloudflare/'s RoomCore (seats, routing, caps, the lazy time rules, the
  // host re-seat, a woken object), the Worker's gate (paths, origins per space, the limiter, 4503), the Durable Object with
  // a fake ctx, the shipped wrangler.toml, tools/ws-relay.js over real sockets, build.js's relay URL on a copy of the sources
  V('relay-node', 'relay-node-test.js', 0, has(/RELAY-NODE OK: \d+ passed, 0 failed/), { runner: 'node' }),
  V('sprites-scene', 'test-sprites-scene.html', 6000, has(/SCENE mode/), { shot: 'runall-sprites-scene.png' }),
  // ---- real time (one at a time)
  V('realinput', 'test-realinput.html', 40000, doneZero('REAL'), { runner: 'cdp', done: 'REAL DONE' }),
  V('net-bc', HTTP + 'test-net-bc.html', 'rt90000', doneZero('NETBC'), { done: 'NETBC DONE' }),
  V('mp-net', HTTP + 'test-mp-net.html', 'rt900000', doneZero('MPNET'), { done: 'MPNET DONE', w: 1200, h: 900 }),
  // the review fixes online: lag-compensated battle traps, host-stall recovery, a jittery 250 ms link, a dropped guest is told
  V('mp-fixes', HTTP + 'test-mp-fixes.html', 'rt600000', doneZero('MPFIX'), { done: 'MPFIX DONE', w: 1200, h: 900 }),
  // battle catches as the SHOOTER saw them at ~120 ms one way (guest -> host / guest -> guest claims, host -> guest on its
  // interpolated stream; a clear miss stays a miss; an older guest page judged as before) + the 3-out cap online (3 in
  // all on the host, each press past 3 pops the oldest, never a dry). Measurements: test-battle-acc.html (not a job)
  V('battle-net', HTTP + 'test-battle-net.html', 'rt300000', doneZero('BNET'), { done: 'BNET DONE', w: 1200, h: 900 }),
  // platform contracts (pages generated by genPlatformPages below): the ARTIFACT page through a fake window.claude
  // room/user runtime that follows room.d.ts (presence rules, budgets, blips, flaps, not_granted, revoke), and the
  // DEPLOY page through a fake PeerJS (the deferred script arriving late, codes, host leaving)
  V('room-platform', HTTP + 'rrp-main.html', 'rt600000', doneZero('RRP'), { done: 'RRP DONE', w: 1200, h: 900 }),
  V('peer-deploy', HTTP + 'rrp-peer-main.html', 'rt300000', doneZero('RPD'), { done: 'RPD DONE', w: 1200, h: 900 }),
  // ... and its screenshots to LOOK at (C:/Temp/bogeul/off-friends-*.png, design/distinction.md 4.4 test 7): a
  // public-link viewer's 친구와 하기 panel (the block card, 방 만들기 off), before and after a 참여 tap with a code
  ...[[390, 844], [900, 760]].flatMap(([w, h]) => [['', 'off'], ['-tap', 'off-tap']].map(([sfx, s]) =>
    V(`off-friends${sfx}-${w}`, HTTP + 'rrp-main.html?shot=' + s, 'rt60000', shotOk, { done: 'SHOT READY', shot: `off-friends${sfx}-${w}.png`, w, h }))),
  // v4 trophies online: stakes + consent, holds at 시작!, results, the 한 판 더 gate, leavers / cut links / host aborts,
  // walkovers, 연습 경기 (bc without allowBc, one device), co-op 목욕 보너스 (3 bc frames, real time)
  V('trophies-net', HTTP + 'test-trophies-net.html', 'rt480000', doneZero('TROPHYNET'), { done: 'TROPHYNET DONE', w: 1200, h: 900 }),
  // 파티 online (design/party.md §13.2; 4 bc frames): the old-page gate, the cards on every screen, the water clock, the
  // crown's authority, the podium and the coins, leavers, 파티 한 번 더
  V('party-net', HTTP + 'test-party-net.html', 'rt420000', doneZero('PARTYNET'), { done: 'PARTYNET DONE', w: 1200, h: 900 }),
  // v4 shop online (design/shop.md 16.2, pass S4; 3 bc frames): hi.lk / 'eq' / R index 5 in the room only, forged sets,
  // an old-page guest; in game the room's sets frozen and drawn on every page, game-phase R seats 4 long in every
  // snapshot; battle coins = the host-side coinBattle on every page (the guest's clock), a countdown leaver, co-op 탕 /
  // ending / revives (2회차 pays none again), practice pays nothing
  V('shop-net', HTTP + 'test-shop-net.html', 'rt300000', doneZero('SHOPNET'), { done: 'SHOPNET DONE', w: 1200, h: 900 }),
  // 몬스터 출현 online through the DOM (2 bc frames): the room switch, R.o[5], the guest's summary / rules / disabled box,
  // no enemies in either world, snapMax; ticked again: the default line and enemies back
  V('monsters-net', HTTP + 'test-monsters-net.html', 'rt240000', doneZero('MONNET'), { done: 'MONNET DONE', w: 1200, h: 900 }),
  // telling players apart online (design/distinction.md §2.14 test 8; 3 bc frames): the room's seat chips, twin portrait
  // and kit-card line; in game the same twins / markers on every page, "나" (chip, white ring, HUD box), the trapper-colour
  // ring read from the trap's bubble id, the spotlight and the big 나 after a KO + respawn
  V('distinction-net', HTTP + 'test-distinction-net.html', 'rt240000', doneZero('DISTNET'), { done: 'DISTNET DONE', w: 1200, h: 900 }),
  // v4 kits online (char-kits §14.2): host-local vs guest body traces for every move, body bits through the peer stream
  // and the P row, the capy slam / quake / qk refusals / shield validation, every bubble's prediction against the host
  // at lat 80 / jit 30, the owner's droplets, snapshot sizes (4 frogs / otters / ducks, a mixed 4P battle with the boss),
  // a guest's stun mid-move, a v3 state refused, 능력 끄기 (4 phases of fresh frames)
  V('kits-net', HTTP + 'test-kits-net.html', 'rt700000', doneZero('KITSNET'), { done: 'KITSNET DONE', w: 1200, h: 900 }),
  // the kit looks as the other screens draw them (bubble animal per owner, the duck's glide bit, the capy's landing edge)
  // + a contact sheet of each screen; ?off=1: 능력 끄기 (every look plain)
  V('kits-online', HTTP + 'test-kits-online.html', 'rt90000', doneZero('KO'), { done: 'KO DONE', shot: 'runall-kits-online.png', w: 1200, h: 800 }),
  V('kits-online-off', HTTP + 'test-kits-online.html?off=1', 'rt90000', doneZero('KO'), { done: 'KO DONE', shot: 'runall-kits-online-off.png', w: 1200, h: 800 }),
  // floating empties online (2 bc frames): a guest runs its host's rule (blinks at the life the host sends, g.el), sees
  // the host's cap blinks + pops (the same bubbles), a bounce it reports marks the host's bubble ridden, and
  // the blink for ~90 frames before a bubble's own pop (co-op and battle)
  V('clutter-net', HTTP + 'test-clutter-net.html', 'rt240000', doneZero('CLUTTERNET'), { done: 'CLUTTERNET DONE', w: 1200, h: 500 }),
  // the room's compact kit card (a hosted battle room on bc, 능력 끄기 on) and a real phone viewport of the title card
  V('ui-kit-room-off', 'test-ui-kit-preview.html?net=bc#room,off', 20000, doneZero('KIT'), { done: 'KIT DONE', runner: 'cdp', shot: 'runall-kit-room-off.png' }),
  V('ui-kit-phone', 'test-ui-kit-preview.html#touch,frog', 20000, doneZero('KIT'), { done: 'KIT DONE', runner: 'cdp', mobile: true, shot: 'runall-kit-phone.png', w: 390, h: 844 }),
  // phone (360x640): the room's sticky ready / start / leave row is opaque; the header keeps its buttons with the chip on
  V('ux-roomrow', HTTP + 'test-ux-roomrow.html?net=bc', 'rt30000', doneZero('ROOMROW'), { done: 'ROOMROW DONE', shot: 'runall-ux-roomrow.png', w: 360, h: 640 }),
  // (파티's 3-button mode segment and 판 수 row on the narrowest phone too)
  V('ux-roomrow-320', HTTP + 'test-ux-roomrow.html?net=bc', 'rt30000', doneZero('ROOMROW'), { done: 'ROOMROW DONE', shot: 'runall-ux-roomrow-320.png', w: 320, h: 568 }),
  // ---- the standalone deploy as an installable app (tools/pwa-check.js: its own server on :8766 and its own Chrome):
  // manifest / icons / installability, the service worker (precache by build, offline start with fonts + PeerJS from
  // the cache, the 3.5 s slow-network fallback, background updates that never reload a game, a stale page refused), the
  // install pill / iOS hint / fullscreen toggle (none of it in the artifact or a frame), the itch zip, phone layouts
  // (390x844 / 360x780 / 844x390 with notch insets, a 1x window) -> C:/Temp/bogeul/pwa-*.png. Serial: it times a timeout
  V('pwa', 'pwa-check.js', 0, doneZero('PWA'), { runner: 'node', serial: true }),
  // ---- phones and tablets on their side (src/tests/touch.js: the artifact page, mobile emulation with touch): the
  // joystick (dead zone + hysteresis, drag right -> walks right, release -> stops, 점프 / 거품 with the stick held,
  // cancel / blur / lost capture let go) and no double-tap zoom; the landscape layout at every common size (the screen
  // fills the height, the thumb columns beside it, the header buttons in the right one) -> C:/Temp/bogeul/touch-*.png
  // to LOOK at; the room and the login screen on a phone on its side
  // (iPhone-like notch / home-indicator insets on 844x390 and 932x430: tools/cdp-run.js PG_CDP_INSETS)
  V('touch-input', 'test-touch.html#input', 30000, doneZero('TOUCH'), { w: 844, h: 390, runner: 'cdp', mobile: true, done: 'TOUCH DONE' }),
  ...[[640, 360], [740, 360], [844, 390], [915, 412], [932, 430], [1024, 768], [1180, 820]].flatMap(([w, h]) => ['play', 'title'].map((sc) =>
    V(`touch-${sc}-${w}`, `test-touch.html#shot=${sc}`, 20000, touchShot, { shot: `touch-${sc}-${w}x${h}.png`, w, h, runner: 'cdp', mobile: true, done: 'TOUCH SHOT READY', env: NOTCH[w] }))),
  ...[['hub', 640, 360], ['hub', 844, 390], ['hub', 1024, 768], ['over', 640, 360], ['over', 932, 430], ['rec', 640, 360], ['rec', 844, 390]].map(([sc, w, h]) =>
    V(`touch-${sc}-${w}`, `test-touch.html#shot=${sc}`, 20000, touchShot, { shot: `touch-${sc}-${w}x${h}.png`, w, h, runner: 'cdp', mobile: true, done: 'TOUCH SHOT READY' })),
  V('touch-room-844', HTTP + 'test-shop.html?net=bc#shot=room&st=my&close=1', 60000, has(/SHOP SHOT READY/), { done: 'SHOP SHOT READY', shot: 'touch-room-844x390.png', w: 844, h: 390, runner: 'cdp', mobile: true }),
  ...[[640, 360], [844, 390]].map(([w, h]) => V(`touch-login-${w}`, HTTP + 'test-cloud.html?shot=login', 60000, (out) => (/CLOUD SHOT error/.test(out) ? 'shot error' : /CLOUD SHOT READY/.test(out) ? true : 'no CLOUD SHOT READY'),
    { done: 'CLOUD SHOT READY', shot: `touch-login-${w}x${h}.png`, w, h, runner: 'cdp', mobile: true })),
  // ---- cloud trophies (design/cloud-trophies.md 13): Google sign-in + Firestore on the deploy with a cloud config, against
  // a fake SDK with a JS port of the security rules (the deploy-cloud fixture in frames of the artifact-skeleton page):
  // inert on the artifact, the design's sync simulation, first upload / cloud wins / sign-out, pushes / holds / a staked
  // result, two devices, offline, a tab dying mid-write, two tabs, folding, every failure message (a frame / shared host /
  // the itch page never signs in), relog (another account parks the copy), a Google window left open, a first upload's
  // lost answer, holds racing a store swap, the UI fit at 1x / 2x / phones, fonts, the deploy without a config. check-cloud: the builds (dist free of Firebase, the deploy
  // with / without firebase.config.json, the lenient config reader, a copy built with a config: its dist byte-for-byte
  // the real one). (tools/cloud-sdk-probe.js and check-cloud --net need the internet: manual)
  V('cloud', HTTP + 'test-cloud.html', 'rt300000', doneZero('CLOUD'), { done: 'CLOUD DONE' }),
  V('check-cloud', 'check-cloud.js', 0, has(/CHECK-CLOUD OK: \d+ passed, 0 failed/), { runner: 'node' }),
  // ... and its screenshots to LOOK at (C:/Temp/bogeul/cloud-*.png): 내 기록 signed out / signed in / with a 2-line message /
  // in a frame that cannot sign in, the title badge with its mark (saved / waiting), at 900x760 and on a 390x844 phone
  ...['rec-out', 'rec-in', 'rec-msg', 'rec-frame', 'title-in', 'title-wait'].flatMap((s) => [[900, 760], [390, 844]].map(([w, h]) =>
    V(`cloud-${s}-${w}`, HTTP + 'test-cloud.html?shot=' + s, 'rt60000', (out) => (/CLOUD SHOT error/.test(out) ? 'shot error' : /CLOUD SHOT READY/.test(out) ? true : 'no CLOUD SHOT READY'), { done: 'CLOUD SHOT READY', shot: `cloud-${s}-${w}.png`, w, h }))),
  // (v4 shop 9.4) 마이페이지 signed out on the deploy with the cloud: the note's second line is the sign-in pitch
  ...[[900, 760], [390, 844]].map(([w, h]) => V(`cloud-my-out-${w}`, HTTP + 'test-cloud.html?shot=my-out', 'rt60000', (out) => (/CLOUD SHOT error/.test(out) ? 'shot error' : /CLOUD SHOT READY/.test(out) ? true : 'no CLOUD SHOT READY'), { done: 'CLOUD SHOT READY', shot: `cloud-my-out-${w}.png`, w, h })),
  // the login screen before the title (design/cloud-trophies.md "As built (login screen)"): phones upright / on their side,
  // the 1x desktop screen (256x224) and a PR preview's look (C:/Temp/bogeul/cloud-login-*.png; the shot checks the fit)
  ...[[320, 568], [390, 844], [844, 390]].map(([w, h]) => V(`cloud-login-${w}`, HTTP + 'test-cloud.html?shot=login', 'rt60000', (out) => (/CLOUD SHOT error/.test(out) ? 'shot error' : /CLOUD SHOT READY/.test(out) ? true : 'no CLOUD SHOT READY'), { done: 'CLOUD SHOT READY', shot: `cloud-login-${w}.png`, w, h })),
  V('cloud-login-1x', HTTP + 'test-cloud.html?shot=login-1x', 'rt60000', (out) => (/CLOUD SHOT error/.test(out) ? 'shot error' : /CLOUD SHOT READY/.test(out) ? true : 'no CLOUD SHOT READY'), { done: 'CLOUD SHOT READY', shot: 'cloud-login-1x.png' }),
  V('cloud-login-pv-390', HTTP + 'test-cloud.html?shot=login-pv', 'rt60000', (out) => (/CLOUD SHOT error/.test(out) ? 'shot error' : /CLOUD SHOT READY/.test(out) ? true : 'no CLOUD SHOT READY'), { done: 'CLOUD SHOT READY', shot: 'cloud-login-pv-390.png', w: 390, h: 844 }),
  V('cloud-title-in-1x', HTTP + 'test-cloud.html?shot=title-in-1x', 'rt60000', (out) => (/CLOUD SHOT READY/.test(out) && !/CLOUD SHOT error/.test(out) ? true : 'no shot'), { done: 'CLOUD SHOT READY', shot: 'cloud-title-in-1x.png' }),
  // 친구 순위 (design/friends.md 6, group 19c): the panel signed in (12 friends, 2 requests) on phones on their side, a
  // portrait tablet and the 1x screen; signed out; the PR preview's demo; 내 기록 with its button and dot
  // (C:/Temp/bogeul/pal-*.png to LOOK at; each shot checks the fit and says "CLOUD SHOT error pal fit" when it fails)
  ...[['in', 640, 360], ['in', 844, 390], ['in', 932, 430], ['in', 768, 1024], ['guest', 640, 360], ['demo', 844, 390], ['demo', 768, 1024], ['rec', 640, 360], ['rec', 932, 430], ['my', 640, 360], ['my', 844, 390]]
    .map(([sc, w, h]) => V(`pal-${sc}-${w}`, HTTP + 'test-cloud.html?shot=pal-' + sc, 'rt60000', (out) => (/CLOUD SHOT error/.test(out) ? 'shot error' : /CLOUD SHOT READY/.test(out) ? true : 'no CLOUD SHOT READY'), { done: 'CLOUD SHOT READY', shot: `pal-${sc}-${w}.png`, w, h })),
  V('pal-my-1x', HTTP + 'test-cloud.html?shot=pal-my-1x', 'rt60000', (out) => (/CLOUD SHOT error/.test(out) ? 'shot error' : /CLOUD SHOT READY/.test(out) ? true : 'no CLOUD SHOT READY'), { done: 'CLOUD SHOT READY', shot: 'pal-my-1x.png' }),
  V('pal-in-1x', HTTP + 'test-cloud.html?shot=pal-in-1x', 'rt60000', (out) => (/CLOUD SHOT error/.test(out) ? 'shot error' : /CLOUD SHOT READY/.test(out) ? true : 'no CLOUD SHOT READY'), { done: 'CLOUD SHOT READY', shot: 'pal-in-1x.png' }),
  // 친구 초대 (design/friends.md "As built (invites)"): the invite banner over the title, 친구와 하기's sign-in card for a guest
  ...[['iv', 844, 390], ['gate', 844, 390], ['iv-1x', 900, 760], ['gate-1x', 900, 760]].map(([sc, w, h]) => V(`pal-${sc}${/1x/.test(sc) ? '' : '-' + w}`, HTTP + 'test-cloud.html?shot=pal-' + sc, 'rt60000', (out) => (/CLOUD SHOT error/.test(out) ? 'shot error' : /CLOUD SHOT READY/.test(out) ? true : 'no CLOUD SHOT READY'), { done: 'CLOUD SHOT READY', shot: `pal-${sc}${/1x/.test(sc) ? '' : '-' + w}.png`, w, h })),
  // ---- v3 screenshots to LOOK at (C:/Temp/bogeul/v3-*.png): the title + picker on desktop and a real phone viewport,
  // and the online scenes of test-mp-net.html (?shot=..., the chosen player's frame fills the window)
  V('v3-title-1280', 'test-review.html#title', 8000, has(/\bDONE\b/), { shot: 'v3-title-1280.png', w: 1280, h: 800 }),
  V('v3-title-390', 'test-review.html#touch-title', 20000, has(/\bDONE\b/), { shot: 'v3-title-390.png', w: 390, h: 844, runner: 'cdp', done: '^DONE', mobile: true }),
  ...['friends', 'friendsnote', 'room4', 'room4g', 'coop', 'boss', 'battle', 'podium'].map((s) => V('v3-' + s, HTTP + 'test-mp-net.html?shot=' + s, 'rt90000', shotOk, { done: 'SHOT READY', shot: 'v3-' + s + '.png', w: 1000, h: 760 })),
  ...['friends', 'room4', 'battle', 'podium'].map((s) => V('v3-' + s + '-390', HTTP + 'test-mp-net.html?shot=' + s, 'rt90000', shotOk, { done: 'SHOT READY', shot: 'v3-' + s + '-390.png', w: 390, h: 844 })),
];

function isRealtime(j) { return j.runner === 'cdp' || /^rt/.test(j.budget) || !!j.serial; }

// The platform-contract pages (after node build.js):
//   rrp-frame.html      the artifact page in a viewer-like skeleton whose <head> defines a fake window.claude
//                       (only `use`; a Proxy reports any other member read) talking to window.parent.__RRP
//   rrp-main.html       src/tests/review-room-platform.js (the fake room/user runtime + the driver)
//   rrp-peer-frame.html the deploy page with its PeerJS tag made inert and window.Peer taken from window.parent.__FP
//                       (?late=manual: defined only when the driver says so - the deferred script arriving late)
//   rrp-peer-main.html  src/tests/review-peer-deploy.js
function genPlatformPages() {
  const RESET = ':root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}';
  const SC = '<' + 'script', SE = '</' + 'script>';
  const art = fs.readFileSync(path.join(ROOT, 'dist', 'ppogeul-bath.html'), 'utf8');
  const boot = '(function(){var P=null;try{P=window.parent!==window?window.parent.__RRP:null;}catch(e){P=null;}' +
    'var cfg={};try{new URLSearchParams(location.search).forEach(function(v,k){cfg[k]=v;});}catch(e){cfg={};}' +
    'var page=P?P.attach(window,cfg):null;' +
    'var base=Object.freeze({use:function(n){return page?page.use(n):Promise.resolve(null);}});' +
    "window.claude=new Proxy(base,{get:function(t,k){if(typeof k==='string'&&k!=='use'&&page)page.prop(k);return t[k];}});})();";
  fs.writeFileSync(`${T}/rrp-frame.html`, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${RESET}</style>${SC}>${boot}${SE}</head><body>\n${art}\n</body></html>`);
  const drv = fs.readFileSync(path.join(ROOT, 'src', 'tests', 'review-room-platform.js'), 'utf8');
  fs.writeFileSync(`${T}/rrp-main.html`, `<!doctype html><html><head><meta charset="utf-8"><title>rrp</title><style>body{margin:0;background:#061518}</style></head><body>${SC}>\n${drv}\n${SE}</body></html>`);
  // (without the cloud config: this page plays online as a guest, which the deploy with the cloud does not allow -
  // design/friends.md "As built (invites)"; the cloud's own online gate is tested in src/tests/cloud.js)
  // (nor the relay client a build with a relay URL inlines: these rooms run through the fake PeerJS, never a Worker)
  const dep = fs.readFileSync(path.join(ROOT, 'deploy', 'index.html'), 'utf8').replace(/<script>window\.PG_CLOUD=[\s\S]*?<\/script>\n?/, '').replace(/<script id="pg-relay">[\s\S]*?<\/script>\n?/, '');
  const tag = dep.match(/<script defer src="(https:\/\/[^"]*peerjs[^"]*)"[^>]*><\/script>/);
  if (!tag) throw new Error('no PeerJS tag in deploy/index.html');
  // (the deploy's login screen stays away: this browser chose to play as a guest - design/cloud-trophies.md "As built (login screen)")
  const fake = `${SC} type="application/x-inert" src="${tag[1]}">${SE}${SC}>try{localStorage.setItem('ppogeul-login','1');}catch(e){}(function(){var P=null;try{P=window.parent!==window?window.parent.__FP:null;}catch(e){}if(!P)return;var late=new URLSearchParams(location.search).get('late');function def(){window.Peer=P.Peer(window);}if(late==='manual')window.__rpdDefinePeer=def;else def();})();${SE}`;
  fs.writeFileSync(`${T}/rrp-peer-frame.html`, dep.replace(tag[0], () => fake));
  const pdrv = fs.readFileSync(path.join(ROOT, 'src', 'tests', 'review-peer-deploy.js'), 'utf8');
  fs.writeFileSync(`${T}/rrp-peer-main.html`, `<!doctype html><html><head><meta charset="utf-8"><title>rpd</title></head><body style="margin:0;background:#061518">${SC}>\n${pdrv}\n${SE}</body></html>`);
}

function runJob(j) {
  return new Promise((resolve) => {
    const tool = j.runner === 'cdp' ? 'cdp-run.js' : 'run-chrome.js';
    let a = [path.join(__dirname, tool), j.page, j.shot || '-', String(j.w), String(j.h), j.budget];
    if (j.done) a.push(j.done);
    if (j.runner === 'cdp' && j.mobile) a.push('1');
    if (j.runner === 'node') a = [path.join(__dirname, j.page)]; // (a node check in tools/: no browser)
    const t0 = Date.now();
    const ch = spawn(process.execPath, a, { cwd: ROOT, env: j.env ? Object.assign({}, process.env, j.env) : process.env });
    let out = '';
    ch.stdout.on('data', (d) => { out += d; });
    ch.stderr.on('data', (d) => { out += d; });
    const kill = setTimeout(() => { out += '\nRUN-ALL: killed after 20 min'; ch.kill(); }, 20 * 60 * 1000);
    ch.on('close', (code) => {
      clearTimeout(kill);
      fs.writeFileSync(`${LOGS}/${j.name}.log`, out);
      // console.error / console.warn: the CDP runners print the level; virtual-time test pages echo them through
      // build.js's console hook as "CONSOLE-ERROR ..." / "CONSOLE-WARN ..." log lines
      const errs = out.split(/\r?\n/).filter((l) => /^CONSOLE (error|warn|warning|log-error)\b|^CONSOLE \w+: CONSOLE-(ERROR|WARN)|^PAGE-ERROR/.test(l));
      let verdict = j.pass(out);
      if (verdict === true && errs.length) verdict = `${errs.length} console error(s): ${errs[0].slice(0, 160)}`;
      if (verdict === true && /run-chrome: no \/|cdp: timeout|chrome did not start/.test(out)) verdict = 'timed out';
      if (verdict === true && j.shot && !/screenshot: /.test(out)) verdict = 'no screenshot';
      if (verdict === true && j.runner === 'node' && code !== 0) verdict = 'exit code ' + code;
      resolve({ name: j.name, ok: verdict === true, why: verdict === true ? '' : verdict, secs: ((Date.now() - t0) / 1000).toFixed(0) });
    });
  });
}

function portOpen() {
  // (open and serving this T: its preview.html is ours; another build there -> stop, it would test the wrong page)
  let mine = ''; try { mine = fs.readFileSync(`${T}/preview.html`, 'utf8'); } catch (e) { /* not built */ }
  return new Promise((r) => { const q = http.get(HTTP + 'preview.html', (res) => { let b = ''; res.setEncoding('utf8'); res.on('data', (d) => { b += d; });
    res.on('end', () => { if (res.statusCode === 200 && b !== mine) { console.log(`RUN-ALL: :${PORT} serves another build - set PG_HTTP_PORT to a free port`); process.exit(2); } r(res.statusCode === 200); }); }); q.on('error', () => r(false)); q.setTimeout(1500, () => { q.destroy(); r(false); }); });
}

(async () => {
  let list = LIST;
  // (--exact: only the jobs named exactly - CI's subset, .github/workflows/pr.yml)
  const exact = args.includes('--exact');
  if (filters.length) list = list.filter((j) => filters.some((f) => j.name === f || (!exact && (j.name.startsWith(f + '-') || j.name.includes(f)))));
  if (exact && list.length !== new Set(filters).size) { console.log('RUN-ALL: unknown job(s): ' + filters.filter((f) => !LIST.some((j) => j.name === f)).join(', ')); process.exit(1); }
  if (args.includes('--list')) { for (const j of list) console.log(j.name.padEnd(22) + j.page); return; }
  if (!args.includes('--no-build')) {
    // (no relay in the tested build unless PG_RELAY_URL says otherwise: the tests use their own fixture, deploy-relay/)
    const b = spawnSync(process.execPath, [path.join(ROOT, 'build.js')], { encoding: 'utf8', env: Object.assign({}, process.env, process.env.PG_RELAY_URL === undefined ? { PG_RELAY_URL: 'none' } : {}) });
    process.stdout.write(b.stdout + b.stderr);
    if (b.status !== 0) { console.log('BUILD FAILED'); process.exit(1); }
  }
  fs.mkdirSync(LOGS, { recursive: true });
  if (list.some((j) => /\/rrp-/.test(j.page))) genPlatformPages();
  let srv = null;
  if (list.some((j) => j.page.startsWith('http')) && !(await portOpen())) srv = require('./serve').start(PORT, T, { quiet: true });
  const results = [];
  const queue = list.filter((j) => !isRealtime(j));
  const report = (r) => { results.push(r); console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name.padEnd(22)} ${String(r.secs).padStart(4)} s ${r.why}`); };
  await Promise.all(Array.from({ length: JOBS }, async () => { while (queue.length) report(await runJob(queue.shift())); }));
  for (const j of list.filter(isRealtime)) report(await runJob(j));
  if (srv) srv.close();
  const bad = results.filter((r) => !r.ok);
  console.log(`\nRUN-ALL ${bad.length ? 'FAIL' : 'OK'}: ${results.length - bad.length}/${results.length} jobs passed${bad.length ? ' — failed: ' + bad.map((r) => r.name).join(', ') : ''} (logs in ${LOGS})`);
  process.exit(bad.length ? 1 : 0);
})();
