// Writes two headless-Chrome test pages for src/audio.js into C:/Temp/bogeul:
//   audio-test.html     real AudioContext: exercises the whole PG.Audio API, logs "AUDIO-TEST ..." lines
//   audio-offline.html  renders tracks/sfx through OfflineAudioContext (driving the real scheduler)
//                       and logs level stats ("AUDIO-RENDER ...")
// Usage: node bogeul/tools/audio-chrome-test.js
//        node bogeul/tools/run-chrome.js audio-test.html - 400 300 8000
//        node bogeul/tools/run-chrome.js audio-offline.html - 400 300 200000
// The offline page also checks boss/final/lobby/battle loudness against main, the final, battle and
// lobby loop points, every sfx's level/length/brightness (incl. the v3 online set: join leave ready
// countdown go trap_player revive ghost ko win), a 3-2-1-go countdown, the podium fanfare's ending,
// and busy boss-fight / 4-player battle mixes for clipping.
// v4 character kits: every kit sound and variant (pop n=1..6 per animal, slide 1..3, hop 1..2, b_echo /
// b_yarn / b_egg 0..1, flap slam quake dash djump b_onsen b_splash b_icicle) is rendered on its own: audible,
// short, never louder than the loudest v1-v3 effect, quake the heaviest; then 4 otters, a frog on autofire,
// and a 4-animal battle are mixed over the battle tune and checked for clipping.
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'audio.js'), 'utf8');
if (/<\/script/i.test(SRC)) throw new Error('audio.js contains a script close tag');
// v4 kit names and every distinct v4 sound as [name, n] (null = no opts), as in tools/audio-node-test.js
const SFX_V4 = ['flap', 'slam', 'quake', 'dash', 'slide', 'djump', 'hop', 'b_echo', 'b_onsen', 'b_splash', 'b_icicle', 'b_yarn', 'b_egg'];
const V4_SOUNDS = [['pop', 1], ['pop', 2], ['pop', 3], ['pop', 4], ['pop', 5], ['pop', 6],
  ['flap', null], ['slam', null], ['quake', null], ['dash', null], ['slide', 1], ['slide', 2], ['slide', 3], ['djump', null],
  ['hop', 1], ['hop', 2], ['b_echo', 0], ['b_echo', 1], ['b_onsen', null], ['b_splash', null], ['b_icicle', null],
  ['b_yarn', 0], ['b_yarn', 1], ['b_egg', 0], ['b_egg', 1]];
const { T } = require('./env');
fs.mkdirSync(T, { recursive: true });

const head = `<!doctype html><html><head><meta charset="utf-8"><title>audio test</title></head><body><pre id="out">running</pre>
<script>
window.addEventListener('error', function (e) { console.error('PAGE-ERROR Uncaught ' + e.message + ' @' + e.lineno); });
window.addEventListener('unhandledrejection', function (e) { console.error('PAGE-ERROR Uncaught (in promise) ' + (e.reason && e.reason.message || e.reason)); });
</script>`;

// ------------------------------------------------------------------ real-time API page
const live = `${head}
<script>
${SRC}
</script>
<script>
(function () {
  var A = PG.Audio, fails = 0, V4_SOUNDS = ${JSON.stringify(V4_SOUNDS)};
  function log(s) { console.log('AUDIO-TEST ' + s); }
  function fail(s) { fails++; console.error('AUDIO-TEST FAIL ' + s); }
  try {
    var names = A._sfxNames;
    names.forEach(function (n) { A.sfx(n, { n: 2 }); });
    A.music('title');
    var st = A._state();
    if (st.ctxState !== null || st.unlocked) fail('audio active before unlock');
    log('pre-unlock ' + JSON.stringify(st));
    A.unlock();
    st = A._state();
    log('after unlock ' + JSON.stringify(st));
    if (!st.unlocked || st.track !== 'title') fail('unlock did not start pending title');
    var steps = [];
    names.forEach(function (n, i) { steps.push(function () { A.sfx(n, { n: i + 1 }); }); });
    steps.push(function () { A.music('main'); });
    V4_SOUNDS.forEach(function (s) { steps.push(function () { A.sfx(s[0], s[1] === null ? undefined : { n: s[1] }); }); });
    for (var k = 1; k <= 6; k++) (function (k) { steps.push(function () { A.sfx('pop'); A.sfx('chain', { n: k }); }); })(k);
    steps.push(function () { A.music('hurry'); A.sfx('hurry'); });
    steps.push(function () { A.setMuted(true); if (!A.isMuted()) fail('mute'); });
    steps.push(function () { A.setMuted(false); if (A.isMuted()) fail('unmute'); });
    steps.push(function () { A.music('clear'); });
    steps.push(function () { A.music('gameover'); });
    steps.push(function () { A.music('ending'); A.music('ending'); });
    steps.push(function () { A.sfx('door'); A.music('boss'); A.sfx('boss_roar'); if (A._state().track !== 'boss') fail('boss did not start'); });
    for (var h = 0; h < 6; h++) (function (h) { steps.push(function () { A.sfx('boss_hit', { n: h }); A.sfx('shockwave'); }); })(h);
    steps.push(function () { A.sfx('boss_stun'); A.sfx('door', { open: true }); });
    steps.push(function () { A.sfx('boss_damage'); A.music('final'); if (A._state().track !== 'final') fail('final did not start'); });
    steps.push(function () { A.sfx('scald_warn'); A.sfx('scald_splash'); A.sfx('splash'); A.sfx('freeze'); });
    steps.push(function () { A.music('victory'); A.sfx('ticket'); A.sfx('stamp'); if (A._state().track !== 'victory') fail('victory did not start'); });
    // v3 online flow: lobby -> join/ready -> 3-2-1-go -> battle -> traps/KOs/ghosts -> win -> podium -> lobby
    steps.push(function () { A.music('lobby'); A.sfx('join'); if (A._state().track !== 'lobby') fail('lobby did not start'); });
    steps.push(function () { A.sfx('join'); A.sfx('ready'); });
    steps.push(function () { A.sfx('leave'); A.sfx('ready'); });
    for (var c = 0; c < 3; c++) steps.push(function () { A.sfx('countdown'); });
    steps.push(function () { A.sfx('go'); A.music('battle'); if (A._state().track !== 'battle') fail('battle did not start'); });
    steps.push(function () { A.sfx('trap_player'); A.sfx('shoot'); });
    steps.push(function () { A.sfx('ko'); A.sfx('pop'); });
    steps.push(function () { A.sfx('ghost'); });
    steps.push(function () { A.sfx('revive'); });
    steps.push(function () { A.sfx('win'); A.music('podium'); if (A._state().track !== 'podium') fail('podium did not start'); });
    steps.push(function () { A.music('lobby'); if (A._state().track !== 'lobby') fail('lobby did not come back'); });
    steps.push(function () { A.music('main'); A.music(null); });
    steps.push(function () {
      var s = A._state();
      log('final ' + JSON.stringify(s));
      if (s.ctxState !== 'running') fail('context not running: ' + s.ctxState);
      if (s.track !== null) fail('music(null) left a track');
      var stored = null; try { stored = localStorage.getItem('ppogeul-muted'); } catch (e) {}
      log('stored mute=' + stored);
      log(fails ? 'RESULT FAIL (' + fails + ')' : 'RESULT OK');
      document.getElementById('out').textContent = fails ? 'FAIL' : 'OK';
    });
    var i = 0;
    (function next() { try { steps[i++](); } catch (e) { fail('step ' + (i - 1) + ' threw ' + e.message); } if (i < steps.length) setTimeout(next, 70); })();
  } catch (e) { fail(e && e.stack || e); }
})();
</script></body></html>`;
fs.writeFileSync(path.join(T, 'audio-test.html'), live);

// ------------------------------------------------------------------ offline render page
const offline = `${head}
<script>
var SRC = ${JSON.stringify(SRC).replace(/<\//g, '<\\/')};
var realSetInterval = window.setInterval, realSetTimeout = window.setTimeout, renderDone = false;
// Headless virtual time races ahead while the main thread idles (audio-thread rendering does not
// count as pending work). Keep it busy with short fixed-cost spins until rendering finishes.
(function keepAlive() {
  if (renderDone) return;
  var x = 0; for (var i = 0; i < 3e6; i++) x += i & 7;
  realSetTimeout(keepAlive, x < 0 ? 0 : 5);
})();
async function render(label, seconds, setup) {
  var sr = 22050;
  var oc = new OfflineAudioContext(1, Math.ceil(sr * seconds), sr);
  var cb = null;
  window.AudioContext = function () { return oc; };
  window.setInterval = function (f) { cb = f; return 1; };
  window.clearInterval = function () { cb = null; };
  (0, eval)(SRC);
  var A = PG.Audio;
  A.unlock();
  var acts = setup(A).sort(function (a, b) { return a[0] - b[0]; });
  var q = 128 / sr, seen = {};
  for (var t = 0.025; t < seconds - 0.03; t += 0.025) {
    var k = Math.round(t / q); if (seen[k]) continue; seen[k] = 1;
    (function (tt) {
      oc.suspend(tt).then(function () {
        while (acts.length && acts[0][0] <= tt) acts.shift()[1]();
        if (cb) cb();
        oc.resume();
      });
    })(k * q);
  }
  var buf = await oc.startRendering();
  var d = buf.getChannelData(0), win = Math.floor(sr / 2), wins = [], peak = 0, sum = 0, clip = 0, jump = 0;
  for (var w = 0; w < d.length; w += win) {
    var s2 = 0, p = 0;
    for (var i = w; i < Math.min(d.length, w + win); i++) { var x = d[i]; s2 += x * x; var ax = x < 0 ? -x : x; if (ax > p) p = ax; if (ax >= 0.99) clip++; if (i && Math.abs(x - d[i - 1]) > 0.25) jump++; }
    wins.push({ rms: Math.sqrt(s2 / win), peak: p }); sum += s2; if (p > peak) peak = p;
  }
  var rms = Math.sqrt(sum / d.length);
  var line = label + ': peak=' + peak.toFixed(3) + ' rms=' + rms.toFixed(4) + ' clip=' + clip + ' jumps=' + jump +
    (wins.length <= 40 ? ' win-rms=[' + wins.map(function (x) { return x.rms.toFixed(3); }).join(' ') + ']' : '');
  console.log('AUDIO-RENDER ' + line);
  return { peak: peak, rms: rms, wins: wins, clip: clip, data: d, sr: sr };
}
// level stats of one slice [t0, t1) of a render: peak, rms while sounding, audible length,
// and a zero-crossing brightness estimate (Hz) — used to compare sound effects with each other
function slice(r, t0, t1) {
  var d = r.data, a = Math.floor(t0 * r.sr), b = Math.min(d.length, Math.floor(t1 * r.sr));
  var peak = 0, s2 = 0, n = 0, last = a, zc = 0;
  for (var i = a; i < b; i++) {
    var x = d[i], ax = x < 0 ? -x : x;
    if (ax > peak) peak = ax;
    if (ax > 0.002) { last = i; s2 += x * x; n++; }
    if (i > a && (x >= 0) !== (d[i - 1] >= 0) && ax > 0.002) zc++;
  }
  return { peak: peak, rms: n ? Math.sqrt(s2 / n) : 0, len: (last - a) / r.sr, zcr: n ? zc / 2 / (n / r.sr) : 0 };
}
(async function () {
  var fails = 0;
  function fail(s) { fails++; console.error('AUDIO-RENDER FAIL ' + s); }
  try {
    var r, loud = {};
    for (var name of ['main', 'title', 'hurry', 'boss', 'final', 'lobby', 'battle']) {
      r = await render(name, 8, function (A) { return [[0, function () { A.music(name); }]]; });
      loud[name] = r.rms;
      if (r.rms < 0.01) fail(name + ' too quiet');
      if (r.peak > 0.9 || r.clip) fail(name + ' too loud');
      if (r.wins.slice(1).some(function (w) { return w.rms < 0.004; })) fail(name + ' has a silent gap');
    }
    ['boss', 'final', 'lobby', 'battle'].forEach(function (n) {
      var k = loud[n] / loud.main;
      console.log('AUDIO-RENDER ' + n + ' loudness vs main x' + k.toFixed(2));
      if (k < 0.6 || k > 1.6) fail(n + ' loudness out of balance with main (x' + k.toFixed(2) + ')');
    });
    // the waiting-room tune sits under the match tune
    if (!(loud.lobby < loud.battle)) fail('lobby should be calmer than battle');
    // battle and lobby keep going across their loop points without a gap
    for (var lname of ['battle', 'lobby']) {
      var lsecs = PG.Audio._songs[lname].len * 60 / PG.Audio._songs[lname].bpm / 4;
      r = await render(lname + '-loop', lsecs + 3, function (A) { return [[0, function () { A.music(lname); }]]; });
      if (r.wins.slice(1).some(function (w) { return w.rms < 0.004; })) fail(lname + ' has a silent gap across its loop point');
      if (r.peak > 0.9 || r.clip) fail(lname + ' loop too loud');
    }
    // with every part at volume 0 a song must render true silence: any non-zero sample is a click
    // leaking through an envelope gain before its first automation event (one per drum hit before the fix)
    for (var zname of ['victory', 'boss', 'lobby', 'podium']) {
      r = await render(zname + '-at-zero-volume', 3, function (A) {
        var inst = A._songs[zname].inst;
        Object.keys(inst).forEach(function (k) { if (inst[k]) inst[k].v = 0; });
        return [[0, function () { A.music(zname); }]];
      });
      if (r.peak > 1e-4) fail(zname + ' at zero volume still clicks (peak ' + r.peak.toFixed(4) + ')');
    }
    // final: the intro plays once, then the loop keeps going without a gap
    r = await render('final-loop', 30, function (A) { return [[0, function () { A.music('final'); }]]; });
    if (r.wins.slice(1).some(function (w) { return w.rms < 0.004; })) fail('final has a silent gap across its loop point');
    var jingles = { clear: [4.5, 3.6], gameover: [7, 6.2], ending: [17.5, 16.6], victory: [5, 4.0], podium: [8, 7.0] };
    for (var j in jingles) {
      r = await render(j, jingles[j][0], function (A) { return [[0, function () { A.music(j); }]]; });
      if (r.rms < 0.005) fail(j + ' too quiet');
      if (r.peak > 0.9 || r.clip) fail(j + ' too loud');
      var tail = r.wins.slice(Math.ceil(jingles[j][1] * 2));
      if (!tail.length || tail.some(function (w) { return w.peak > 0.003; })) fail(j + ' does not end in silence');
    }
    var names = PG.Audio._sfxNames, GAP = 2.2;
    var V2 = ['boss_hit', 'boss_stun', 'boss_damage', 'boss_roar', 'shockwave', 'spore', 'scald_warn', 'scald_splash',
      'splash', 'freeze', 'melt', 'stamp', 'ticket', 'powerup', 'door'];
    var V3 = ['join', 'leave', 'ready', 'countdown', 'go', 'trap_player', 'revive', 'ghost', 'ko', 'win'];
    var V4 = ${JSON.stringify(SFX_V4)}, V4_SOUNDS = ${JSON.stringify(V4_SOUNDS)};
    V2.concat(V3, V4).forEach(function (n) { if (names.indexOf(n) < 0) fail('missing sfx ' + n); });
    r = await render('sfx', names.length * GAP + 0.6, function (A) {
      return names.map(function (n, i) { return [0.1 + i * GAP, function () { A.sfx(n, n === 'pop' ? undefined : { n: 3 }); }]; });
    });
    var v1peak = 0, oldPeak = 0, stats = {};
    names.forEach(function (n, i) {
      var w = slice(r, 0.1 + i * GAP, 0.1 + (i + 1) * GAP);
      stats[n] = w;
      console.log('AUDIO-RENDER   sfx ' + n + ' peak=' + w.peak.toFixed(3) + ' rms=' + w.rms.toFixed(4) +
        ' len=' + w.len.toFixed(2) + 's bright=' + Math.round(w.zcr) + 'Hz');
      if (w.peak < 0.01) fail('sfx ' + n + ' silent');
      if (w.len > GAP - 0.15) fail('sfx ' + n + ' rings too long (' + w.len.toFixed(2) + ' s)');
      if (V2.indexOf(n) < 0 && V3.indexOf(n) < 0 && V4.indexOf(n) < 0) v1peak = Math.max(v1peak, w.peak);
      if (V4.indexOf(n) < 0) oldPeak = Math.max(oldPeak, w.peak);
    });
    // new effects sit in the same loudness range as the v1 set (none blasts over the mix)
    names.forEach(function (n) { if (stats[n].peak > Math.max(0.3, v1peak * 1.5)) fail('sfx ' + n + ' much louder than the v1 effects (' + stats[n].peak.toFixed(3) + ' vs ' + v1peak.toFixed(3) + ')'); });
    if (r.peak > 0.9 || r.clip) fail('sfx too loud');
    // character checks: heavy hits are dark, sparkles are bright, the roar is long and low
    var bright = function (n) { return stats[n] ? stats[n].zcr : 0; };
    if (!(bright('boss_roar') < bright('boss_hit'))) fail('boss_roar should be darker than boss_hit');
    if (!(bright('shockwave') < bright('spore'))) fail('shockwave should be darker than spore');
    if (!(bright('powerup') > bright('stamp'))) fail('powerup should be brighter than stamp');
    if (!(stats.boss_roar.len > 0.8 && stats.boss_stun.len > 0.8 && stats.ticket.len > 1.2)) fail('long effects too short');
    if (!(stats.scald_warn.len < 0.35 && stats.boss_hit.len < 0.4)) fail('short effects too long');
    // v3: the beep is short and the go signal is brighter and longer; ghosts linger, ready is snappy
    if (!(stats.countdown.len < 0.3)) fail('countdown beep too long (' + stats.countdown.len.toFixed(2) + ' s)');
    if (!(stats.go.len > stats.countdown.len * 1.8)) fail('go should ring clearly longer than a countdown beep');
    if (!(bright('go') > bright('countdown'))) fail('go should be brighter than countdown');
    if (!(stats.ghost.len > 0.7 && stats.revive.len > 0.7)) fail('ghost/revive too short');
    if (!(stats.ready.len < 0.35)) fail('ready ding too long');
    if (!(bright('ghost') < bright('ready'))) fail('ghost should be darker than ready');
    // ---- v4 character kits: each kit sound / variant alone, then the busy kit mixes
    var G4 = 0.8, v4 = {};
    r = await render('sfx-v4', V4_SOUNDS.length * G4 + 0.6, function (A) {
      return V4_SOUNDS.map(function (s, i) { return [0.1 + i * G4, function () { A.sfx(s[0], s[1] === null ? undefined : { n: s[1] }); }]; });
    });
    V4_SOUNDS.forEach(function (s, i) {
      var id = s[0] + (s[1] === null ? '' : s[1]), w = slice(r, 0.1 + i * G4, 0.1 + (i + 1) * G4);
      v4[id] = w;
      console.log('AUDIO-RENDER   v4 ' + id + ' peak=' + w.peak.toFixed(3) + ' rms=' + w.rms.toFixed(4) +
        ' len=' + w.len.toFixed(2) + 's bright=' + Math.round(w.zcr) + 'Hz');
      if (w.peak < 0.01) fail('v4 ' + id + ' silent');
      if (w.len > 0.6) fail('v4 ' + id + ' rings too long (' + w.len.toFixed(2) + ' s)');
      // none louder than the loudest effect that was already there
      if (w.peak > oldPeak) fail('v4 ' + id + ' louder than every v1-v3 effect (' + w.peak.toFixed(3) + ' vs ' + oldPeak.toFixed(3) + ')');
    });
    if (r.peak > 0.9 || r.clip) fail('v4 sfx too loud');
    var vk = Object.keys(v4), qk = v4.quake, plainPop = stats.pop;
    // quake is the heaviest: the most energy and the darkest of the kit sounds
    var energy = function (w) { return w.rms * w.rms * w.len; };
    vk.forEach(function (id) {
      if (id === 'quake') return;
      if (!(energy(v4[id]) < energy(qk))) fail('quake should be the heaviest kit sound (' + id + ' carries more energy)');
      if (!(v4[id].zcr > qk.zcr)) fail('quake should be the darkest kit sound (' + id + ' ' + Math.round(v4[id].zcr) + ' Hz)');
    });
    if (!(qk.peak <= stats.shockwave.peak * 1.05)) fail('quake should not hit harder than the boss shockwave');
    console.log('AUDIO-RENDER v4 quake peak ' + qk.peak.toFixed(3) + ' vs shockwave ' + stats.shockwave.peak.toFixed(3) + ', loudest v1-v3 ' + oldPeak.toFixed(3));
    // each animal's pop replaces the plain pop at about its level; the glide flap is soft (it repeats)
    for (var pn = 1; pn <= 6; pn++) {
      var pw = v4['pop' + pn];
      if (pw.peak > plainPop.peak * 1.3 || pw.peak < plainPop.peak * 0.4) fail('pop n=' + pn + ' level off the plain pop (' + pw.peak.toFixed(3) + ' vs ' + plainPop.peak.toFixed(3) + ')');
    }
    if (!(v4.flap.peak < plainPop.peak * 0.6)) fail('glide flap too loud for a sound that repeats every 12 f');
    if (!(v4.b_yarn1.peak < v4.b_yarn0.peak / 2 && v4.b_egg1.peak < v4.b_egg0.peak / 2)) fail('yarn tick / egg settle should be tiny next to the shot');
    // character: icicle bright, onsen dark; penguin pop brighter than the capy's; the croak climbs; the slide swish lasts
    var b4 = function (id) { return v4[id].zcr; };
    if (!(b4('b_icicle') > b4('b_onsen') * 3)) fail('b_icicle should be much brighter than b_onsen');
    if (!(b4('pop4') > b4('pop2') * 3)) fail('penguin pop should be much brighter than the capy pop');
    if (!(b4('hop2') > b4('hop1'))) fail('hop level 2 should croak higher than level 1');
    if (!(v4.slide2.len > v4.slide1.len && v4.slide2.len > v4.slide3.len)) fail('belly slide swish should outlast the dive and the bonk');
    // 4 otters on one screen: volleys on consecutive frames every 0.4 s, dashes, their pops, over the battle tune
    r = await render('kits-4-otters', 6, function (A) {
      var a = [[0, function () { A.music('battle'); }]];
      for (var v = 0; v < 12; v++) for (var p = 0; p < 4; p++) (function (v, p) {
        a.push([0.4 + v * 0.4 + p / 60, function () { A.sfx('b_splash'); if (v % 3 === p % 3) A.sfx('dash'); }]);
        a.push([0.55 + v * 0.4 + p / 60, function () { A.sfx('pop', { n: 3 }); if (p === 1) A.sfx('chain', { n: 1 + (v % 4) }); }]);
      })(v, p);
      return a;
    });
    if (r.peak > 0.95 || r.clip) fail('4-otter mix clips');
    // a frog on autofire (a shot every 14 f, eggs settling, egg pops, chained hops) beside a capy quaking twice
    r = await render('kits-frog-autofire', 6, function (A) {
      var a = [[0, function () { A.music('battle'); }]];
      for (var k = 0; k < 22; k++) (function (k) {
        a.push([0.3 + k * 14 / 60, function () { A.sfx('b_egg'); if (k % 2) A.sfx('hop', { n: k % 4 > 1 ? 2 : 1 }); }]);
        a.push([0.9 + k * 14 / 60, function () { A.sfx('b_egg', { n: 1 }); if (k % 3 === 0) A.sfx('pop', { n: 6 }); }]);
      })(k);
      a.push([2.0, function () { A.sfx('slam'); }], [2.3, function () { A.sfx('quake'); A.sfx('pop', { n: 2 }); }]);
      a.push([4.0, function () { A.sfx('slam'); }], [4.3, function () { A.sfx('quake'); A.sfx('shockwave'); }]);
      return a;
    });
    if (r.peak > 0.95 || r.clip) fail('frog autofire mix clips');
    // a 4-animal battle: gliding duck, slamming capy, sliding penguin, double-jumping cat, all shooting and popping
    r = await render('kits-battle', 7, function (A) {
      var a = [[0, function () { A.music('battle'); }]];
      for (var f = 0; f < 30; f++) a.push([0.3 + f * 0.2, function () { A.sfx('flap'); }]);
      for (var s = 0; s < 16; s++) (function (s) {
        a.push([0.35 + s * 0.4, function () { A.sfx('b_echo'); A.sfx('b_icicle'); A.sfx('b_yarn'); A.sfx('b_onsen'); }]);
        a.push([0.6 + s * 0.4, function () { A.sfx('b_echo', { n: 1 }); A.sfx('b_yarn', { n: 1 }); A.sfx('pop', { n: 1 + (s % 6) }); }]);
        if (s % 4 === 1) a.push([0.7 + s * 0.4, function () { A.sfx('djump'); A.sfx('slide', { n: 1 }); A.sfx('trap_player'); }]);
        if (s % 4 === 2) a.push([0.7 + s * 0.4, function () { A.sfx('slide', { n: 2 }); A.sfx('slam'); }]);
        if (s % 4 === 3) a.push([0.7 + s * 0.4, function () { A.sfx('slide', { n: 3 }); A.sfx('quake'); A.sfx('ko'); A.sfx('chain', { n: 2 }); }]);
      })(s);
      a.push([6.0, function () { A.sfx('win'); A.music('podium'); }]);
      return a;
    });
    if (r.peak > 0.95 || r.clip) fail('4-animal battle mix clips');
    // the three beeps and the go signal survive a busy battle mix one second apart, without clipping
    r = await render('countdown-321-go', 5, function (A) {
      return [[0, function () { A.music('lobby'); }], [0.5, function () { A.music(null); A.sfx('countdown'); }],
        [1.5, function () { A.sfx('countdown'); }], [2.5, function () { A.sfx('countdown'); }],
        [3.5, function () { A.sfx('go'); A.music('battle'); }]];
    });
    [0.5, 1.5, 2.5].forEach(function (t0, i) {
      var w = slice(r, t0, t0 + 0.4);
      if (w.peak < 0.05) fail('countdown beep ' + (3 - i) + ' missing (peak ' + w.peak.toFixed(3) + ')');
    });
    if (slice(r, 3.5, 3.9).peak < 0.05) fail('go signal missing');
    if (r.peak > 0.95 || r.clip) fail('countdown mix clips');
    // a busy 4-player battle: battle tune, traps, KOs, ghosts, revives, the boss drop-in, the win sting
    r = await render('battle-stress', 7, function (A) {
      var a = [[0, function () { A.music('battle'); }]];
      for (var b = 0; b < 24; b++) (function (b) {
        a.push([0.4 + b * 0.2, function () {
          A.sfx('shoot');
          if (b % 3 === 0) A.sfx('trap_player');
          if (b % 4 === 1) { A.sfx('ko'); A.sfx('pop'); A.sfx('chain', { n: 1 + (b % 5) }); }
          if (b % 6 === 2) A.sfx('ghost');
          if (b % 6 === 5) A.sfx('revive');
        }]);
      })(b);
      a.push([2.0, function () { A.sfx('boss_roar'); A.sfx('shockwave'); }], [3.2, function () { A.sfx('boss_stun'); }]);
      a.push([4.0, function () { A.sfx('boss_damage'); A.sfx('powerup'); }]);
      a.push([5.4, function () { A.sfx('win'); A.music('podium'); }]);
      return a;
    });
    if (r.peak > 0.95 || r.clip) fail('battle mix clips');
    r = await render('stress', 6, function (A) {
      var a = [[0, function () { A.music('hurry'); }], [1.0, function () { A.sfx('steam'); }], [1.2, function () { A.sfx('extend'); }]];
      for (var c = 1; c <= 16; c++) (function (c) {
        a.push([1.5 + c * 0.05, function () { A.sfx('pop'); A.sfx('chain', { n: c }); A.sfx('kill'); }]);
      })(c);
      return a;
    });
    if (r.peak > 0.95 || r.clip) fail('stress mix clips');
    // a busy boss fight: final tune, roar, landings, soap slaps, the knock-out, the ticket fanfare, scald drops
    r = await render('boss-stress', 7, function (A) {
      var a = [[0, function () { A.music('final'); }], [0.6, function () { A.sfx('boss_roar'); }]];
      for (var h = 0; h < 14; h++) (function (h) { a.push([1.0 + h * 0.12, function () { A.sfx('boss_hit', { n: h }); A.sfx('scald_warn'); }]); })(h);
      a.push([1.4, function () { A.sfx('shockwave'); A.sfx('spore'); }], [2.8, function () { A.sfx('boss_stun'); }]);
      a.push([3.6, function () { A.sfx('boss_damage'); A.sfx('shockwave'); A.sfx('scald_splash'); }]);
      a.push([4.0, function () { A.sfx('stamp'); A.sfx('ticket'); A.sfx('powerup'); }]);
      a.push([4.3, function () { A.music('victory'); A.sfx('freeze'); A.sfx('splash'); A.sfx('door'); }]);
      return a;
    });
    if (r.peak > 0.95 || r.clip) fail('boss fight mix clips');
    r = await render('switch+stop', 6, function (A) {
      return [[0, function () { A.music('main'); }], [1.5, function () { A.music('hurry'); }],
        [2.5, function () { A.music('title'); }], [3.5, function () { A.music(null); }]];
    });
    if (r.wins.slice(10).some(function (w) { return w.peak > 0.003; })) fail('music(null) did not silence');
    r = await render('mute', 4, function (A) {
      return [[0, function () { A.music('main'); }], [1.0, function () { A.setMuted(true); }], [2.5, function () { A.setMuted(false); }]];
    });
    if (r.wins[3].peak > 0.003 || r.wins[4].peak > 0.003) fail('mute not silent');
    if (r.wins[6].rms < 0.005) fail('unmute did not resume');
    PG.Audio.setMuted(false);
  } catch (e) { fail(e && e.stack || e); }
  console.log('AUDIO-RENDER RESULT ' + (fails ? 'FAIL (' + fails + ')' : 'OK'));
  renderDone = true;
  document.getElementById('out').textContent = fails ? 'FAIL' : 'OK';
})();
</script></body></html>`;
fs.writeFileSync(path.join(T, 'audio-offline.html'), offline);
console.log('wrote ' + T + '/audio-test.html and ' + T + '/audio-offline.html');
