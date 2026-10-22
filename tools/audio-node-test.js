// Headless unit test for src/audio.js using a strict fake AudioContext.
// Usage: node bogeul/tools/audio-node-test.js
// The fake records (instead of throwing) every invalid Web Audio call, because audio.js
// swallows exceptions by design; the test then asserts that list is empty.
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'audio.js'), 'utf8');
const SFX_V1 = ['jump', 'shoot', 'capture', 'pop', 'chain', 'kill', 'item', 'extend', 'die', 'hurry',
  'clear', 'bounce', 'steam', 'start', 'gameover', 'escape', 'pause'];
const SFX_V2 = ['boss_hit', 'boss_stun', 'boss_damage', 'boss_roar', 'shockwave', 'spore', 'scald_warn', 'scald_splash',
  'splash', 'freeze', 'melt', 'stamp', 'ticket', 'powerup', 'door'];
const SFX_V3 = ['join', 'leave', 'ready', 'countdown', 'go', 'trap_player', 'revive', 'ghost', 'ko', 'win'];
// v4 character kits (design/char-kits.md §10): moves + per-animal shots; 'pop' gains o.n = 1..6
const SFX_V4 = ['flap', 'slam', 'quake', 'dash', 'slide', 'djump', 'hop', 'b_echo', 'b_onsen', 'b_splash', 'b_icicle', 'b_yarn', 'b_egg'];
// v4 trophies (design/trophies.md §10): the engine plays them locally through troSfx (never echoed)
const SFX_V5 = ['stake', 'tro_fly', 'tro_up', 'tro_down', 'promote'];
// v4 shop (design/shop.md §11): coins popping, the armed 사기, a purchase, wearing / taking off (local, never echoed)
const SFX_V6 = ['coin', 'arm', 'buy', 'equip'];
// v4 뽑기 (design/gacha.md §9): the crank, a capsule landing, a capsule opening, the fanfare (local, never echoed)
const SFX_V7 = ['gacha_roll', 'gacha_drop', 'gacha_pop', 'gacha_win'];
const SFX_V8 = ['dry']; // (battle: a press over the shot cap)
const SFX_NAMES = SFX_V1.concat(SFX_V2, SFX_V3, SFX_V4, SFX_V5, SFX_V6, SFX_V7, SFX_V8);
const V5_SOUNDS = [['stake', null], ['tro_fly', 0], ['tro_fly', 1], ['tro_fly', 2], ['tro_fly', 3], ['tro_fly', 4], ['tro_fly', 5], ['tro_up', null], ['tro_down', null], ['promote', null]];
// every distinct v4 sound as [name, n]: n-variants per the spec, pop n 1..6 per animal (null = no opts)
const V4_SOUNDS = [['pop', 1], ['pop', 2], ['pop', 3], ['pop', 4], ['pop', 5], ['pop', 6],
  ['flap', null], ['slam', null], ['quake', null], ['dash', null], ['slide', 1], ['slide', 2], ['slide', 3], ['djump', null],
  ['hop', 1], ['hop', 2], ['b_echo', 0], ['b_echo', 1], ['b_onsen', null], ['b_splash', null], ['b_icicle', null],
  ['b_yarn', 0], ['b_yarn', 1], ['b_egg', 0], ['b_egg', 1]];
// sounds the engine plays only on the player's own screen (they belong in game.js NO_ECHO)
const V4_LOCAL = SFX_V4.filter((n) => n !== 'quake');
const BACKUP = path.join(__dirname, '..', 'src-v3-backup', 'audio.js');
const TRACKS_V2 = ['title', 'main', 'hurry', 'clear', 'gameover', 'ending', 'boss', 'final', 'victory'];
const TRACKS_V3 = ['lobby', 'battle', 'podium'];
const TRACKS = TRACKS_V2.concat(TRACKS_V3);
const LOOPS = ['title', 'main', 'hurry', 'boss', 'final', 'lobby', 'battle'];
const JINGLES = ['clear', 'gameover', 'ending', 'victory', 'podium'];

let failures = 0, passes = 0;
function ok(cond, msg) {
  if (cond) passes++;
  else { failures++; console.log('FAIL: ' + msg); }
}

function makeEnv(opts = {}) {
  const errors = [];
  const stats = { ctxCount: 0, nodes: 0, osc: 0, intervals: 0, closed: 0, suspended: 0, resumed: 0, maxAhead: 0, late: 0 };
  const err = (m) => { if (errors.length < 50) errors.push(m); };
  const fin = (x) => typeof x === 'number' && Number.isFinite(x);
  const env = { errors, stats, ctx: null };

  class Param {
    constructor(v, name) { this.value = v; this.name = name; this.events = []; }
    _chk(kind, v, t) {
      if (!fin(v)) err(`${this.name}.${kind} value ${v}`);
      if (!fin(t) || t < 0) err(`${this.name}.${kind} time ${t}`);
      this.events.push([kind, v, t]);
    }
    setValueAtTime(v, t) { this._chk('set', v, t); return this; }
    linearRampToValueAtTime(v, t) { this._chk('lin', v, t); return this; }
    exponentialRampToValueAtTime(v, t) { this._chk('exp', v, t); if (!(v > 0)) err(`${this.name}.exp target ${v}`); return this; }
    setTargetAtTime(v, t, tc) { this._chk('target', v, t); if (!fin(tc) || tc < 0) err(`${this.name}.target tc ${tc}`); return this; }
    cancelScheduledValues(t) { if (!fin(t) || t < 0) err('cancel time ' + t); this.events = this.events.filter((e) => e[2] < t); return this; }
  }
  class Node {
    constructor(ctx, kind) { this.context = ctx; this.kind = kind; this.outs = []; stats.nodes++; ctx._nodes.push(this); }
    connect(d) {
      if (!(d instanceof Node) && !(d instanceof Param)) err(this.kind + ' connect to non-node');
      if (d instanceof Node && d.context !== this.context) err('cross-context connect');
      this.outs.push(d);
      return d;
    }
    disconnect() { this.outs = []; }
  }
  class Scheduled extends Node {
    constructor(ctx, kind) { super(ctx, kind); this.startT = null; this.stopT = null; this.onended = null; }
    start(t = 0, off = 0) {
      if (this.startT !== null) err(this.kind + ' started twice');
      if (!fin(t) || t < 0) err(this.kind + ' start ' + t);
      if (!fin(off) || off < 0) err(this.kind + ' offset ' + off);
      const now = this.context.currentTime;
      if (t !== 0 && t < now - 1e-9) stats.late++;
      stats.maxAhead = Math.max(stats.maxAhead, t - now);
      this.startT = t;
    }
    stop(t = 0) {
      if (this.startT === null) err(this.kind + ' stop before start');
      if (this.stopT !== null) err(this.kind + ' stopped twice');
      if (!fin(t) || t < 0) err(this.kind + ' stop ' + t);
      if (t < this.startT) err(this.kind + ' stop time before start time');
      this.stopT = t;
    }
  }
  const OSC_TYPES = ['sine', 'square', 'sawtooth', 'triangle'];
  class Osc extends Scheduled {
    constructor(ctx) {
      super(ctx, 'osc');
      this.frequency = new Param(440, 'osc.freq'); this.detune = new Param(0, 'osc.detune');
      this._type = 'sine'; this.wave = null; stats.osc++;
    }
    set type(v) { if (!OSC_TYPES.includes(v)) err('bad osc type ' + v); this._type = v; }
    get type() { return this._type; }
    setPeriodicWave(w) { if (!w || !w._pw) err('bad periodic wave'); this.wave = w; this._type = 'custom'; }
  }
  const FILTERS = ['lowpass', 'highpass', 'bandpass', 'lowshelf', 'highshelf', 'peaking', 'notch', 'allpass'];
  class FakeAC {
    constructor() {
      if (opts.ctorThrows) throw new Error('AudioContext blocked');
      stats.ctxCount++;
      this.currentTime = 0; this.sampleRate = 48000; this.state = 'suspended';
      this._nodes = [];
      this.destination = new Node(this, 'dest');
      env.ctx = this;
    }
    resume() { stats.resumed++; if (this.state !== 'closed') this.state = 'running'; return Promise.resolve(); }
    suspend() { stats.suspended++; if (this.state !== 'closed') this.state = 'suspended'; return Promise.resolve(); }
    close() { stats.closed++; this.state = 'closed'; return Promise.resolve(); }
    _live() { if (this.state === 'closed') err('node created on closed context'); }
    createGain() { this._live(); const n = new Node(this, 'gain'); n.gain = new Param(1, 'gain'); return n; }
    createOscillator() { this._live(); if (opts.oscThrows) throw new Error('osc fail'); return new Osc(this); }
    createBiquadFilter() {
      this._live();
      const n = new Node(this, 'biquad');
      n.frequency = new Param(350, 'bq.freq'); n.Q = new Param(1, 'bq.Q'); n.gain = new Param(0, 'bq.gain');
      let ty = 'lowpass';
      Object.defineProperty(n, 'type', { get: () => ty, set: (v) => { if (!FILTERS.includes(v)) err('bad filter ' + v); ty = v; } });
      return n;
    }
    createBuffer(ch, len, sr) {
      if (!(len >= 1) || !Number.isInteger(len)) err('bad buffer length ' + len);
      if (!(sr >= 3000)) err('bad buffer rate ' + sr);
      const d = new Float32Array(len);
      return { numberOfChannels: ch, length: len, sampleRate: sr, getChannelData: () => d };
    }
    createBufferSource() {
      this._live();
      const n = new Scheduled(this, 'bufsrc');
      n.buffer = null; n.loop = false; n.playbackRate = new Param(1, 'rate');
      return n;
    }
    createDynamicsCompressor() {
      this._live();
      const n = new Node(this, 'compressor');
      for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new Param(0, k);
      return n;
    }
    createPeriodicWave(re, im) {
      if (re.length !== im.length || re.length < 2) err('periodic wave arrays');
      for (let i = 0; i < re.length; i++) if (!fin(re[i]) || !fin(im[i])) err('periodic wave NaN');
      return { _pw: true };
    }
  }
  if (opts.noPeriodicWave) FakeAC.prototype.createPeriodicWave = undefined;

  const intervals = new Map();
  let nextId = 1;
  const storage = new Map(Object.entries(opts.storage || {}));
  const docListeners = {};
  const document = {
    hidden: false,
    addEventListener(t, f) { (docListeners[t] = docListeners[t] || []).push(f); },
    removeEventListener(t, f) { docListeners[t] = (docListeners[t] || []).filter((x) => x !== f); },
  };
  const sandbox = {
    console,
    setInterval: (f, ms) => { stats.intervals++; if (!(ms > 0 && ms <= 50)) err('interval ms ' + ms); const id = nextId++; intervals.set(id, f); return id; },
    clearInterval: (id) => { intervals.delete(id); },
    setTimeout: () => 0,
    clearTimeout: () => {},
    document,
  };
  if (opts.storageThrows) Object.defineProperty(sandbox, 'localStorage', { get() { throw new Error('SecurityError'); } });
  else sandbox.localStorage = { getItem: (k) => (storage.has(k) ? storage.get(k) : null), setItem: (k, v) => storage.set(k, String(v)) };
  if (!opts.noAudio) sandbox.AudioContext = FakeAC;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  if (opts.seed != null) {
    // deterministic Math.random (mulberry32) so two builds of audio.js can be compared node for node
    let s = opts.seed >>> 0;
    vm.runInContext('Math', sandbox).random = () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 15), z | 1);
      z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
      return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    };
  }
  const src = opts.src || SRC;
  vm.runInContext(src, sandbox, { filename: 'audio.js' });

  Object.assign(env, {
    sandbox, intervals, storage, document, docListeners,
    A: sandbox.PG.Audio,
    reload() { vm.runInContext(src, sandbox, { filename: 'audio.js' }); env.A = sandbox.PG.Audio; },
    // advance fake audio time, firing the scheduler like a 25 ms setInterval would
    advance(sec, onStep) {
      const steps = Math.round(sec / 0.025);
      for (let i = 0; i < steps; i++) {
        if (env.ctx && env.ctx.state === 'running') env.ctx.currentTime += 0.025;
        for (const f of [...intervals.values()]) f();
        if (onStep) onStep();
      }
    },
    fire(type) { for (const f of docListeners[type] || []) f({ type }); },
  });
  return env;
}

function noThrow(fn, label) {
  try { fn(); ok(true, label); } catch (e) { ok(false, label + ' threw ' + e.message); }
}

// play one effect after `gap` s of quiet and describe what it built:
//   srcs  sounding sources (oscillators with pitch automation, noise buffers)
//   span  seconds until the last node stops          fp   short recipe print (first sources' kind / wave / filter / pitch)
//   sig   every node's kind, type, param automation and start/stop, relative to now (a node-for-node identity)
//   lvl   loudness proxy: the summed envelope peaks of the gains that feed the bus (not the vibrato depth gains)
//   f0    [kind:type, first pitch, last pitch] per sounding source
function grab(E, name, o, gap) {
  E.advance(gap == null ? 2.5 : gap);
  const b = E.ctx._nodes.length, now = E.ctx.currentTime;
  E.A.sfx(name, o);
  const made = E.ctx._nodes.slice(b);
  const srcs = made.filter((x) => (x.kind === 'osc' && x.frequency.events.length) || x.kind === 'bufsrc');
  const stops = made.filter((x) => x.stopT != null).map((x) => x.stopT);
  const span = stops.length ? Math.max(...stops) - now : 0;
  const rel = (t) => (t == null ? null : +(t - now).toFixed(5));
  const sig = JSON.stringify(made.map((x) => [x.kind, x.type || '', x.loop || false,
    ...['frequency', 'gain', 'Q'].map((k) => (x[k] ? [x[k].value, x[k].events.map((e) => [e[0], +(+e[1]).toFixed(5), rel(e[2])])] : 0)),
    rel(x.startT), rel(x.stopT), x.outs.length]));
  const fev = (x) => (x.kind === 'osc' ? x.frequency.events : x.outs[0].frequency.events);
  const fp = srcs.slice(0, 4).map((x) => (x.kind === 'osc' ? 'o:' + x.type + ':' + Math.round(fev(x)[0][1] / 5) * 5 :
    'n:' + x.outs[0].type + ':' + Math.round(fev(x)[0][1]))).join(',') + '#' + srcs.length;
  const lvl = made.filter((x) => x.kind === 'gain' && x.gain.events.length && x.gain.events[0][0] === 'set' && x.outs.some((d) => d.kind))
    .reduce((s, g) => s + Math.max(...g.gain.events.map((e) => e[1])), 0);
  const f0 = srcs.map((x) => [x.kind === 'osc' ? 'o:' + x.type : 'n:' + x.outs[0].type, fev(x)[0][1], fev(x)[fev(x).length - 1][1]]);
  return { made, srcs, span, sig, fp, lvl, f0, nodes: made.length };
}
const optsOf = (n) => (n === null ? undefined : { n });
const label = (name, n) => name + (n === null ? '' : '(n=' + n + ')');

// ---------------------------------------------------------------- A. API + nothing before unlock
{
  const E = makeEnv();
  const A = E.A;
  for (const k of ['unlock', 'sfx', 'music', 'setMuted', 'isMuted']) ok(typeof A[k] === 'function', 'API has ' + k);
  ok(A.isMuted() === false, 'default not muted');
  noThrow(() => {
    for (const n of SFX_NAMES) A.sfx(n, { n: 3 });
    A.sfx(); A.sfx('nope'); A.sfx('chain'); A.sfx('chain', { n: -5 }); A.sfx('chain', { n: 1e9 }); A.sfx('toString');
    for (const t of TRACKS) A.music(t);
    A.music('bogus'); A.music(undefined); A.music(null); A.music('constructor');
    A.music('main');
  }, 'pre-unlock calls');
  ok(E.stats.ctxCount === 0, 'no AudioContext before unlock (got ' + E.stats.ctxCount + ')');
  ok(E.stats.nodes === 0, 'no nodes before unlock');
  ok(E.stats.intervals === 0, 'no scheduler interval before unlock');
  ok(A._state().track === null && A._state().pending === 'main', 'pending track remembered, nothing playing');
  ok(JSON.stringify(A._sfxNames.slice().sort()) === JSON.stringify(SFX_NAMES.slice().sort()), 'sfx set matches spec exactly');
  ok(A._sfxNames.indexOf('letter') < 0, 'v1 letter sfx removed');
  ok(JSON.stringify(Object.keys(A._songs).sort()) === JSON.stringify(TRACKS.slice().sort()), 'track set matches spec exactly');
  for (const t of ['boss', 'final', 'lobby', 'battle']) {
    A.music(t);
    ok(A._state().pending === t, t + ' is remembered before unlock (looping track)');
  }
  for (const t of ['victory', 'podium']) {
    A.music(t);
    ok(A._state().pending === null, 'one-shot ' + t + ' is not queued before unlock');
  }
  A.music('main');

  // ------------------------------------------------------------ B. unlock
  A.unlock();
  ok(E.stats.ctxCount === 1, 'unlock creates one context');
  ok(E.ctx.state === 'running', 'context resumed');
  ok(A._state().track === 'main' && A._state().timer, 'pending main starts on unlock');
  A.unlock(); A.unlock();
  ok(E.stats.ctxCount === 1, 'unlock is idempotent');
  const comp = E.ctx._nodes.find((n) => n.kind === 'compressor');
  ok(!!comp && comp.threshold.value < 0 && comp.ratio.value > 1, 'limiter configured');
  const master = E.ctx._nodes.find((n) => n.kind === 'gain' && n.outs.includes(E.ctx.destination));
  ok(!!master && master.gain.value > 0 && master.gain.value <= 0.6, 'modest master gain ' + (master && master.gain.value));

  // ------------------------------------------------------------ C. main music runs + loops
  let wrapped = false, prev = 0;
  const osc0 = E.stats.osc;
  E.advance(30, () => { const p = A._state().pos; if (p < prev) wrapped = true; prev = p; });
  ok(E.stats.osc - osc0 > 500, 'main schedules plenty of notes (' + (E.stats.osc - osc0) + ')');
  ok(wrapped && A._state().track === 'main', 'main loops cleanly');
  ok(E.stats.late === 0, 'no notes scheduled in the past (' + E.stats.late + ')');
  ok(E.stats.maxAhead <= 0.2, 'lookahead bounded (max ' + E.stats.maxAhead.toFixed(3) + ' s)');

  // ------------------------------------------------------------ D. every sfx makes sound
  for (let i = 0; i < SFX_NAMES.length; i++) {
    const n0 = E.stats.nodes;
    A.sfx(SFX_NAMES[i], { n: i + 1 });
    ok(E.stats.nodes > n0, 'sfx ' + SFX_NAMES[i] + ' creates nodes');
    E.advance(0.1);
  }
  E.advance(2);
  {
    // envelope gains must start at an intrinsic value of 0 (a fresh GainNode is 1, and a source's first
    // sub-sample frame can render before setValueAtTime(0, t) applies -> one full-scale sample leaks)
    const env = E.ctx._nodes.filter((n) => n.kind === 'gain' && n.gain.events.length && n.gain.events[0][0] === 'set' && n.gain.events[0][1] === 0);
    const leaky = env.filter((n) => n.gain.value !== 0);
    ok(env.length > 200 && leaky.length === 0, `envelope gains start silent (${leaky.length} of ${env.length} default to non-zero)`);
  }
  {
    // each effect: sane length, and a distinct recipe (first sources' kind / wave / filter / start pitch)
    const prints = new Map(), spans = [];
    for (const name of SFX_NAMES) {
      E.advance(2.5); // let earlier effects ring out (voice cap)
      const before = E.ctx._nodes.length, now = E.ctx.currentTime;
      A.sfx(name, { n: 3 });
      const made = E.ctx._nodes.slice(before);
      // sound sources only (LFOs set frequency.value and have no automation events)
      const srcs = made.filter((x) => (x.kind === 'osc' && x.frequency.events.length) || x.kind === 'bufsrc');
      const span = Math.max(...made.filter((x) => x.stopT != null).map((x) => x.stopT)) - now;
      spans.push(name + '=' + span.toFixed(2));
      ok(span > 0.04 && span < 2.2, `sfx ${name} lasts ${span.toFixed(2)} s`);
      ok(made.every((x) => x.startT == null || x.startT >= now), 'sfx ' + name + ' starts nothing in the past');
      const fp = srcs.slice(0, 4).map((x) => {
        if (x.kind === 'osc') return 'o:' + x.type + ':' + Math.round(x.frequency.events[0][1] / 5) * 5;
        const f = x.outs[0];
        return 'n:' + f.type + ':' + Math.round(f.frequency.events[0][1]);
      }).join(',') + '#' + srcs.length;
      if (prints.has(fp)) ok(false, `sfx ${name} sounds like ${prints.get(fp)} (${fp})`);
      prints.set(fp, name);
    }
    ok(prints.size === SFX_NAMES.length, 'every sfx has its own recipe (' + prints.size + '/' + SFX_NAMES.length + ')');
    console.log('sfx spans (s): ' + spans.join(' '));
  }
  {
    // options are optional and garbage-tolerant
    E.advance(2.5);
    noThrow(() => {
      for (const o of [undefined, null, {}, { n: NaN }, { n: -4 }, { n: 1e9 }, { n: '7' }, { open: 'yes' }]) {
        A.sfx('boss_hit', o); A.sfx('door', o); E.advance(0.05);
      }
    }, 'v2 sfx with odd opts');
    E.advance(2.5);
    const count = (o) => { E.advance(1.5); const b = E.stats.nodes; A.sfx('door', o); return E.stats.nodes - b; };
    const shut = count(), open = count({ open: true });
    ok(shut > 0 && open > 0 && shut !== open, `door shut/open differ (${shut} vs ${open} nodes)`);
    const hitPitch = (n) => {
      E.advance(1.5);
      const b = E.ctx._nodes.length;
      A.sfx('boss_hit', { n });
      return E.ctx._nodes.slice(b).filter((x) => x.kind === 'osc' && x.type === 'triangle')[0].frequency.events[0][1];
    };
    const h0 = hitPitch(0), h8 = hitPitch(8), h99 = hitPitch(99);
    ok(h0 < h8 && h8 <= h99 && h99 / h0 < 1.5, `boss_hit squish climbs with soap and is capped (${h0.toFixed(0)} ${h8.toFixed(0)} ${h99.toFixed(0)})`);
  }
  {
    // v3 online effects: odd opts are harmless, and each one has the shape its name promises
    E.advance(2.5);
    noThrow(() => {
      for (const o of [undefined, null, {}, { n: NaN }, { n: -4 }, { n: 1e9 }, { open: 'yes' }, 'x', 7]) {
        for (const n of SFX_V3) A.sfx(n, o);
        E.advance(2.5);
      }
    }, 'v3 sfx with odd opts');
    // recipe of one effect: [{kind, type, f0, fEnd, startT, stopT}] for sounding sources, and the overall span
    const recipe = (name, o) => {
      E.advance(2.5);
      const b = E.ctx._nodes.length, now = E.ctx.currentTime;
      A.sfx(name, o);
      const made = E.ctx._nodes.slice(b);
      const src = made.filter((x) => (x.kind === 'osc' && x.frequency.events.length) || x.kind === 'bufsrc').map((x) => {
        const ev = x.kind === 'osc' ? x.frequency.events : x.outs[0].frequency.events;
        return { kind: x.kind, type: x.kind === 'osc' ? x.type : x.outs[0].type, f0: ev[0][1], fEnd: ev[ev.length - 1][1], startT: x.startT - now, stopT: x.stopT - now };
      });
      const span = Math.max(...made.filter((x) => x.stopT != null).map((x) => x.stopT)) - now;
      return { src, span, nodes: made.length };
    };
    const tri = (r) => r.src.filter((s) => s.kind === 'osc' && s.type === 'triangle');
    // countdown: one short beep, identical every time it is called (3, 2, 1)
    const c1 = recipe('countdown'), c2 = recipe('countdown'), c3 = recipe('countdown', { n: 1 });
    const sig = (r) => JSON.stringify(r.src.map((s) => [s.kind, s.type, Math.round(s.f0), Math.round(s.stopT * 1000)]));
    ok(sig(c1) === sig(c2) && sig(c2) === sig(c3), 'countdown beep is identical on every call');
    ok(c1.span < 0.3, `countdown is one short beep (${c1.span.toFixed(2)} s)`);
    // go: an octave above the countdown beep and clearly longer
    const g = recipe('go');
    ok(Math.abs(g.src[0].f0 / c1.src[0].f0 - 2) < 0.01, `go starts an octave above the countdown (${g.src[0].f0} vs ${c1.src[0].f0})`);
    ok(g.span > c1.span * 2, `go rings longer than a countdown beep (${g.span.toFixed(2)} vs ${c1.span.toFixed(2)} s)`);
    // three countdown beeps one second apart, then go: none is swallowed by de-duplication
    {
      E.advance(2.5);
      const counts = [];
      for (let i = 0; i < 3; i++) { const b = E.stats.nodes; A.sfx('countdown'); counts.push(E.stats.nodes - b); E.advance(1); }
      const b = E.stats.nodes; A.sfx('go'); counts.push(E.stats.nodes - b);
      ok(counts.every((c) => c > 0) && counts[0] === counts[1] && counts[1] === counts[2], '3-2-1-go all audible (' + counts.join(',') + ' nodes)');
    }
    // join climbs, leave falls (the same hello played the other way round)
    const jn = tri(recipe('join')), lv = tri(recipe('leave'));
    ok(jn.length >= 3 && jn.every((s, i) => i === 0 || s.f0 > jn[i - 1].f0), 'join hello climbs (' + jn.map((s) => Math.round(s.f0)).join(' ') + ')');
    ok(lv.length >= 3 && lv.every((s, i) => i === 0 || s.f0 < lv[i - 1].f0), 'leave goodbye falls (' + lv.map((s) => Math.round(s.f0)).join(' ') + ')');
    ok(Math.round(jn[0].f0) === Math.round(lv[lv.length - 1].f0) && Math.round(jn[jn.length - 1].f0) === Math.round(lv[0].f0), 'leave mirrors join');
    // ghost drifts down, revive climbs up, trap_player gulps upward and wobbles
    const gh = recipe('ghost'), rv = recipe('revive'), tp = recipe('trap_player'), k = recipe('ko'), w = recipe('win'), rd = recipe('ready');
    const ghVoice = gh.src.find((s) => s.kind === 'osc');
    ok(ghVoice && ghVoice.fEnd < ghVoice.f0 * 0.7 && gh.span > 0.7, `ghost drifts down and lingers (${Math.round(ghVoice.f0)} -> ${Math.round(ghVoice.fEnd)} Hz, ${gh.span.toFixed(2)} s)`);
    const run = tri(rv);
    ok(run.length >= 6 && run.every((s, i) => i === 0 || s.f0 > run[i - 1].f0), 'revive harp run climbs');
    ok(tp.src.some((s) => s.type === 'triangle' && s.fEnd > s.f0 * 2) && tp.span > 0.4, 'trap_player has a big rising gulp');
    ok(k.nodes > recipe('pop').nodes * 2 && k.span > 0.5, `ko is a bigger moment than a plain pop (${k.nodes} nodes, ${k.span.toFixed(2)} s)`);
    ok(w.span > 0.7 && w.span < 1.6 && rd.span < 0.4, `win is a short sting, ready is a quick ding (${w.span.toFixed(2)} / ${rd.span.toFixed(2)} s)`);
  }
  // a big chain: each pop ~3 frames apart, with pop + chain + kill sounds per enemy (like the engine)
  for (let n = 1; n <= 20; n++) {
    const n0 = E.stats.nodes;
    A.sfx('pop'); A.sfx('chain', { n }); A.sfx('kill');
    ok(E.stats.nodes > n0, 'chain n=' + n + ' audible during a long chain');
    E.advance(0.05);
  }
  E.advance(1.2);
  {
    // spam: 200 distinct effects in one instant must stay bounded by the voice cap
    const n0 = E.stats.nodes;
    for (let i = 0; i < 200; i++) A.sfx('chain', { n: i + 1 });
    const per = (E.stats.nodes - n0);
    ok(per > 0 && per < 28 * 12, 'voice cap bounds spam (' + per + ' nodes)');
    E.advance(1.5);
  }
  {
    const n0 = E.stats.nodes; A.sfx('pop'); const n1 = E.stats.nodes; A.sfx('pop');
    ok(n1 > n0 && E.stats.nodes === n1, 'same sfx in the same instant is de-duplicated');
  }
  {
    // chain freq rises with n
    const freqOf = (n) => {
      E.advance(1.2);
      const before = E.ctx._nodes.length;
      A.sfx('chain', { n });
      const osc = E.ctx._nodes.slice(before).filter((x) => x.kind === 'osc');
      return osc[1].frequency.events[0][1];
    };
    const f1 = freqOf(1), f3 = freqOf(3), f8 = freqOf(8);
    ok(f1 < f3 && f3 < f8, `chain pitch rises (${f1.toFixed(0)} < ${f3.toFixed(0)} < ${f8.toFixed(0)})`);
  }
  E.advance(1.5);

  // ------------------------------------------------------------ E. glitch-free switching
  const musicBus = E.ctx._nodes.find((n) => n.kind === 'gain' && n.gain.value === 0.5 && n.outs.includes(comp));
  ok(!!musicBus, 'music bus found');
  const trackGains = () => E.ctx._nodes.filter((n) => n.kind === 'gain' && n.outs.includes(musicBus));
  const oldGain = trackGains().slice(-1)[0];
  const inbound = (g) => E.ctx._nodes.filter((n) => n.outs.includes(g)).length;
  const tSwitch = E.ctx.currentTime;
  A.music('hurry');
  ok(A._state().track === 'hurry', 'switched to hurry');
  const fade = oldGain.gain.events.find((e) => e[0] === 'lin' && e[1] === 0);
  ok(!!fade && fade[2] > tSwitch && fade[2] <= tSwitch + 0.15, 'old track fades out quickly');
  const inOld = inbound(oldGain);
  E.advance(2);
  ok(inbound(oldGain) === inOld, 'no new notes routed to the old track after a switch');
  const newGain = trackGains().slice(-1)[0];
  ok(newGain !== oldGain && inbound(newGain) > 20, 'new track plays into its own gain');
  const posBefore = A._state().pos;
  A.music('hurry');
  ok(A._state().pos === posBefore && trackGains().slice(-1)[0] === newGain, 're-requesting the same track does not restart it');
  ok(E.stats.late === 0, 'still no late notes after switching');
  // rapid switching
  noThrow(() => { for (let i = 0; i < 20; i++) A.music(TRACKS[i % TRACKS.length]); }, 'rapid switching');
  E.advance(0.5);

  // ------------------------------------------------------------ F. one-shots end and release the timer
  for (const [t, maxSec] of [['clear', 5], ['gameover', 7], ['ending', 20], ['victory', 5], ['podium', 8]]) {
    A.music(t);
    ok(A._state().track === t, t + ' starts');
    let endedAt = null;
    const t0 = E.ctx.currentTime;
    E.advance(maxSec + 2, () => { if (endedAt === null && A._state().track === null) endedAt = E.ctx.currentTime - t0; });
    ok(endedAt !== null && endedAt <= maxSec + 1.5, `${t} finishes on its own (${endedAt && endedAt.toFixed(2)} s)`);
    ok(!A._state().timer && E.intervals.size === 0, t + ': scheduler interval stops when silent');
    A.music(t);
    ok(A._state().track === t, t + ' can be replayed after finishing');
    A.music(null);
    E.advance(2);
  }
  ok(A._state().track === null && !A._state().timer, 'music(null) stops everything');

  // ------------------------------------------------------------ H. mute
  A.music('main');
  E.advance(1);
  A.setMuted(true);
  ok(A.isMuted() === true && E.storage.get('ppogeul-muted') === '1', 'mute persisted');
  ok(master.gain.events.some((e) => e[0] === 'target' && e[1] === 0), 'master ramps to 0 on mute');
  let n0 = E.stats.nodes;
  E.advance(3);
  A.sfx('pop'); A.sfx('jump');
  ok(E.stats.nodes === n0, 'nothing is synthesized while muted');
  A.music('title');
  ok(A._state().track === 'title', 'track switching still tracked while muted');
  A.setMuted(false);
  ok(A.isMuted() === false && E.storage.get('ppogeul-muted') === '0', 'unmute persisted');
  n0 = E.stats.nodes;
  E.advance(1);
  ok(E.stats.nodes > n0, 'music resumes after unmute');

  // ------------------------------------------------------------ N. visibility
  E.document.hidden = true; E.fire('visibilitychange');
  ok(E.ctx.state === 'suspended', 'suspends while tab hidden');
  E.advance(1);
  E.document.hidden = false; E.fire('visibilitychange');
  ok(E.ctx.state === 'running', 'resumes when visible');
  E.advance(1);
  ok(E.stats.late === 0, 'no late notes after resume');

  // ------------------------------------------------------------ O. hot reload disposes the old instance
  const oldCtx = E.ctx;
  E.reload();
  ok(oldCtx.state === 'closed', 'reload closes previous context');
  ok(E.intervals.size === 0, 'reload clears previous scheduler');
  ok(Object.values(E.docListeners).every((l) => l.length === 0), 'reload removes listeners');
  ok(E.A._state().unlocked === false, 'new instance starts locked');
  ok(E.errors.length === 0, 'no invalid Web Audio calls: ' + E.errors.slice(0, 5).join(' | '));
}

// ---------------------------------------------------------------- I. stored mute
{
  const E = makeEnv({ storage: { 'ppogeul-muted': '1' } });
  ok(E.A.isMuted() === true, 'stored mute read at load');
  E.A.unlock();
  const master = E.ctx._nodes.find((n) => n.kind === 'gain' && n.outs.includes(E.ctx.destination));
  ok(master.gain.value === 0, 'muted master starts silent');
  const n0 = E.stats.nodes; E.A.sfx('pop'); ok(E.stats.nodes === n0, 'muted sfx no-op');
}

// ---------------------------------------------------------------- J/K/L/M. degraded environments
{
  const E = makeEnv({ noAudio: true });
  noThrow(() => { E.A.unlock(); for (const n of SFX_NAMES) E.A.sfx(n); for (const t of TRACKS) E.A.music(t); E.A.setMuted(true); E.A.isMuted(); }, 'no Web Audio: all calls safe');
  ok(E.A.isMuted() === true, 'mute toggle still works without audio');
}
{
  const E = makeEnv({ ctorThrows: true });
  noThrow(() => { E.A.unlock(); E.A.unlock(); for (const n of SFX_NAMES) E.A.sfx(n); E.A.music('main'); }, 'AudioContext ctor throws: safe');
  ok(E.A._state().unlocked === false, 'stays locked when context fails');
}
{
  const E = makeEnv({ noPeriodicWave: true });
  E.A.unlock();
  noThrow(() => { for (const n of SFX_NAMES) E.A.sfx(n, { n: 2 }); E.A.music('main'); E.advance(3); }, 'no createPeriodicWave: fallback works');
  ok(E.ctx._nodes.some((n) => n.kind === 'osc' && n.type === 'square'), 'falls back to square');
  ok(E.errors.length === 0, 'fallback: no invalid calls ' + E.errors.slice(0, 3).join(' | '));
}
{
  const E = makeEnv({ storageThrows: true });
  noThrow(() => { E.A.setMuted(true); E.A.isMuted(); E.A.unlock(); E.A.sfx('pop'); }, 'localStorage throwing: safe');
}
{
  const E = makeEnv({ oscThrows: true });
  E.A.unlock();
  noThrow(() => { for (const n of SFX_NAMES) E.A.sfx(n); E.A.music('main'); E.advance(1); }, 'node creation throwing: safe');
}

// ---------------------------------------------------------------- P. song data
{
  const E = makeEnv();
  const S = E.A._songs;
  for (const t of TRACKS) ok(!!S[t], 'song compiled: ' + t);
  const secs = (s) => s.len * 60 / s.bpm / 4;
  ok(S.main.len >= 256, 'main is at least 16 bars');
  ok(LOOPS.every((t) => S[t].loop), LOOPS.join('/') + ' loop');
  ok(JINGLES.every((t) => !S[t].loop), 'jingles (' + JINGLES.join('/') + ') are one-shot');
  // v3 tracks
  ok(S.lobby.bpm < S.main.bpm && S.lobby.bpm >= 96 && S.lobby.swing > 0, `lobby is relaxed and bouncy (${S.lobby.bpm} bpm, swing ${S.lobby.swing})`);
  ok(S.lobby.len >= 256 && secs(S.lobby) > 25, `lobby is a full 16-bar loop (${secs(S.lobby).toFixed(1)} s)`);
  ok(S.lobby.inst.lead.env && S.lobby.inst.lead.env.s < 0.5 && S.lobby.inst.lead.env.am > 0, 'lobby lead is a plucked vibraphone with tremolo');
  ok(S.lobby.ev.flat().filter(Boolean).some((e) => e.c === 'drum' && e.m === 'b') &&
    S.lobby.ev.flat().filter(Boolean).some((e) => e.c === 'drum' && e.m === 'w'), 'lobby groove uses the bath-bucket clave and water drops');
  ok(S.battle.bpm >= 165 && S.battle.bpm > S.main.bpm * 1.1, `battle is fast (${S.battle.bpm} bpm)`);
  ok(S.battle.len >= 384 && secs(S.battle) > 30, `battle loop has room to breathe over a 3-minute match (${secs(S.battle).toFixed(1)} s)`);
  ok(!!S.battle.inst.dbl && S.battle.ev.flat().filter(Boolean).some((e) => e.c === 'arp'), 'battle has a doubled lead and an arpeggio');
  ok(secs(S.podium) >= 3 && secs(S.podium) <= 7, `podium is a short fanfare (${secs(S.podium).toFixed(1)} s)`);
  // the earlier tracks keep their exact voicing (no envelope override sneaks in)
  for (const t of TRACKS_V2) ok(S[t].inst.lead.env === null && S[t].inst.comp.env === null, t + ' keeps its default envelopes');
  ok(S.hurry.bpm > S.main.bpm * 1.15 && S.hurry.transpose > 0 && S.hurry.len === S.main.len, 'hurry = main faster and higher');
  ok(secs(S.clear) < 4 && secs(S.gameover) < 6 && secs(S.ending) < 20, `jingle lengths ${secs(S.clear).toFixed(1)}/${secs(S.gameover).toFixed(1)}/${secs(S.ending).toFixed(1)} s`);
  ok(secs(S.victory) >= 2 && secs(S.victory) < 4, `victory is a short jingle (${secs(S.victory).toFixed(1)} s)`);
  ok(S.boss.len >= 256 && secs(S.boss) > 15, 'boss is a full 16-bar loop');
  ok(S.final.bpm > S.boss.bpm && S.final.len > S.boss.len, 'final is bigger and faster than boss');
  ok(S.final.loopStart === 64 && S.boss.loopStart === 0 && S.main.loopStart === 0, 'final loops past its 4-bar intro; others loop from bar 1');
  ok(!!S.final.inst.dbl && S.final.ev.flat().filter(Boolean).some((e) => e.c === 'dbl'), 'final lead is doubled');
  for (const t of ['boss', 'final', 'victory']) ok(S[t].ev.flat().filter(Boolean).some((e) => e.c === 'arp'), t + ' has an arpeggio part');
  for (const t of ['boss', 'final']) ok(S[t].inst.bass.w === 'sawtooth' && S[t].inst.bass.lp > 0, t + ' uses a filtered saw bass');
  {
    // the battle tunes are their own: their lead lines share no 2-bar stretch with any other track
    const bars2 = (s) => {
      const set = new Set();
      for (let b = 0; b + 32 <= s.len; b += 16) {
        const seg = [];
        for (let k = b; k < b + 32; k++) for (const e of s.ev[k] || []) if (e.c === 'lead') seg.push((k - b) + ':' + (e.m[0] + s.transpose));
        if (seg.length) set.add(seg.join(' '));
      }
      return set;
    };
    for (const a of ['boss', 'final', 'victory'].concat(TRACKS_V3)) {
      const mine = bars2(S[a]);
      for (const b of TRACKS) {
        if (a === b) continue;
        const other = bars2(S[b]);
        ok(![...mine].some((x) => other.has(x)), `${a} lead never quotes ${b}`);
      }
    }
  }
  {
    // the old working title and outside reference names must not appear; encoded so this file never spells them
    const banned = [String.fromCharCode(0xBF40, 0xAE00), String.fromCharCode(0xBCF4, 0xAE00, 0xBCF4, 0xAE00),
      Buffer.from('YnViYmxlIGJvYmJsZQ==', 'base64').toString(), Buffer.from('dGFpdG8=', 'base64').toString()];
    const low = SRC.toLowerCase().replace(/\s+/g, ' ');
    ok(banned.every((w) => low.indexOf(w) < 0), 'source has no old title / reference names');
  }
  for (const t of TRACKS) {
    const evs = S[t].ev.flat().filter(Boolean);
    const kinds = new Set(evs.map((e) => e.c));
    ok(kinds.has('lead') && kinds.has('bass') && kinds.has('comp'), t + ' has lead+bass+comp');
    const midis = evs.filter((e) => e.c !== 'drum').flatMap((e) => e.m);
    ok(midis.every((m) => m >= 33 && m <= 96), t + ' notes in a sane range');
    ok(evs.every((e) => e.d >= 1), t + ' durations valid');
  }
  for (const t of ['title', 'main', 'boss', 'final', 'victory', 'lobby', 'battle', 'podium']) ok(S[t].ev.flat().filter(Boolean).some((e) => e.c === 'drum'), t + ' has drums');
  console.log('song lengths (s): ' + TRACKS.map((t) => `${t}=${secs(S[t]).toFixed(1)}`).join(' '));
}

// ---------------------------------------------------------------- Q. battle tracks: loop points, steady scheduling
{
  const E = makeEnv();
  const A = E.A;
  A.unlock();
  for (const t of ['boss', 'final', 'lobby', 'battle']) {
    A.music(t);
    const S = A._songs[t];
    const secs = S.len * 60 / S.bpm / 4;
    let prev = 0, firstAfterWrap = null, wraps = 0;
    const osc0 = E.stats.osc;
    E.advance(secs * 2 + 1, () => {
      const p = A._state().pos;
      if (p < prev) { wraps++; if (firstAfterWrap === null) firstAfterWrap = p; }
      prev = p;
    });
    ok(A._state().track === t && wraps >= 1, `${t} keeps looping (${wraps} wraps)`);
    ok(firstAfterWrap !== null && firstAfterWrap >= S.loopStart && firstAfterWrap <= S.loopStart + 4,
      `${t} wraps to its loop point (pos ${firstAfterWrap}, loopStart ${S.loopStart})`);
    const perSec = (E.stats.osc - osc0) / (secs * 2 + 1);
    ok(perSec > 15 && perSec < 120, `${t} note density sane (${perSec.toFixed(0)} oscillators/s)`);
    ok(E.stats.late === 0, t + ': no notes scheduled in the past');
    ok(E.stats.maxAhead <= 0.2, t + ': lookahead bounded');
  }
  // boss -> victory -> main hand-off like the engine does after a boss falls
  A.music('victory');
  ok(A._state().track === 'victory', 'victory replaces the boss tune');
  E.advance(6);
  ok(A._state().track === null && !A._state().timer, 'victory ends by itself and releases the scheduler');
  A.music('main');
  ok(A._state().track === 'main', 'main resumes after victory');
  E.advance(1);
  ok(E.errors.length === 0, 'battle tracks: no invalid Web Audio calls ' + E.errors.slice(0, 3).join(' | '));
}

// ---------------------------------------------------------------- S. an online match, start to finish
// lobby -> friends join and ready up -> 3-2-1-go -> battle (traps, KOs, revives, a boss drop-in)
// -> win -> podium (ends by itself) -> back to the lobby
{
  const E = makeEnv();
  const A = E.A;
  A.music('lobby');
  ok(A._state().pending === 'lobby' && A._state().track === null, 'lobby waits for the first gesture');
  A.unlock();
  ok(A._state().track === 'lobby', 'lobby starts on unlock');
  E.advance(2);
  noThrow(() => {
    for (let i = 0; i < 3; i++) { A.sfx('join'); E.advance(0.4); }
    A.sfx('leave'); E.advance(0.3); A.sfx('join'); E.advance(0.3);
    for (let i = 0; i < 4; i++) { A.sfx('ready'); E.advance(0.15); }
    A.music(null); E.advance(0.2);
    for (let i = 0; i < 3; i++) { A.sfx('countdown'); E.advance(1); }
    A.sfx('go'); A.music('battle');
  }, 'room flow sfx');
  ok(A._state().track === 'battle', 'battle starts on go');
  const t0 = E.ctx.currentTime;
  noThrow(() => {
    for (let s = 0; s < 40; s++) {
      if (s % 3 === 0) A.sfx('shoot');
      if (s % 5 === 1) A.sfx('trap_player');
      if (s % 5 === 3) { A.sfx('ko'); A.sfx('pop'); }
      if (s % 7 === 2) { A.sfx('ghost'); }
      if (s % 7 === 5) { A.sfx('revive'); }
      if (s === 20) { A.sfx('boss_roar'); A.sfx('shockwave'); }
      E.advance(0.25);
    }
  }, 'battle action sfx');
  ok(A._state().track === 'battle' && E.ctx.currentTime - t0 > 9, 'battle keeps playing through the action');
  A.sfx('win'); A.music('podium');
  ok(A._state().track === 'podium', 'podium replaces the battle tune');
  let endedAt = null;
  const p0 = E.ctx.currentTime;
  E.advance(9, () => { if (endedAt === null && A._state().track === null) endedAt = E.ctx.currentTime - p0; });
  ok(endedAt !== null && endedAt < 8, `podium ends by itself (${endedAt && endedAt.toFixed(2)} s)`);
  ok(!A._state().timer, 'podium releases the scheduler');
  A.music('lobby');
  ok(A._state().track === 'lobby', '로비로: lobby music comes back');
  E.advance(1);
  ok(E.stats.late === 0, 'online flow: no late notes');
  ok(E.errors.length === 0, 'online flow: no invalid Web Audio calls ' + E.errors.slice(0, 3).join(' | '));
}

// ---------------------------------------------------------------- U. v4 character kits
// every move / shot / per-animal pop is its own short sound; o.n picks and clamps the variant; the plain pop is
// untouched; nothing is louder than the effects that were already there (quake is the heaviest new one); and
// repeated calls (glide flaps, frog autofire, 4 otters in one volley) stay inside the existing de-dup + voice cap
{
  const E = makeEnv();
  const A = E.A;
  A.unlock();
  // the recipes that were already there (plain pop, i.e. pop without n)
  const base = new Map();
  let baseLvl = 0, baseLvlName = '';
  for (const name of SFX_V1.concat(SFX_V2, SFX_V3)) {
    const r = grab(E, name, name === 'pop' ? undefined : { n: 3 });
    base.set(r.fp, name);
    if (r.lvl > baseLvl) { baseLvl = r.lvl; baseLvlName = name; }
  }
  const plain = grab(E, 'pop'), shoot = grab(E, 'shoot'), shock = grab(E, 'shockwave');
  const got = new Map(), prints = new Map();
  for (const [name, n] of V4_SOUNDS) {
    const r = grab(E, name, optsOf(n), 1);
    const id = label(name, n);
    got.set(id, r);
    ok(r.srcs.length > 0, `v4 ${id} makes sound`);
    ok(r.span > 0.04 && r.span < 0.6, `v4 ${id} is short (${r.span.toFixed(2)} s)`);
    ok(r.made.every((x) => x.startT == null || x.startT >= E.ctx.currentTime), `v4 ${id} starts nothing in the past`);
    if (base.has(r.fp)) ok(false, `v4 ${id} sounds like ${base.get(r.fp)} (${r.fp})`);
    if (prints.has(r.fp)) ok(false, `v4 ${id} sounds like ${prints.get(r.fp)} (${r.fp})`);
    prints.set(r.fp, id);
    ok(r.lvl <= baseLvl + 1e-9, `v4 ${id} is no louder than the loudest existing effect (${r.lvl.toFixed(2)} vs ${baseLvlName} ${baseLvl.toFixed(2)})`);
  }
  ok(prints.size === V4_SOUNDS.length, 'every v4 sound has its own recipe (' + prints.size + '/' + V4_SOUNDS.length + ')');
  console.log('v4 levels (summed envelope peaks): ' + [...got].map(([id, r]) => id + '=' + r.lvl.toFixed(2)).join(' ') +
    ` | plain pop=${plain.lvl.toFixed(2)} loudest existing ${baseLvlName}=${baseLvl.toFixed(2)}`);
  // quake is the heaviest of the new sounds (the most energy, the lowest pitch) but no heavier than the boss shockwave;
  // the rest are short hits no heavier than the v1 shoot they sit beside
  const q = got.get('quake');
  ok(q.lvl <= shock.lvl, `quake is no heavier than the boss shockwave (${q.lvl.toFixed(2)} vs ${shock.lvl.toFixed(2)})`);
  for (const [id, r] of got) if (id !== 'quake') ok(r.lvl <= shoot.lvl, `v4 ${id} is no heavier than shoot (${r.lvl.toFixed(2)} vs ${shoot.lvl.toFixed(2)})`);
  ok([...got].every(([id, r]) => id === 'quake' || r.lvl < q.lvl), `quake is the heaviest v4 sound (${q.lvl.toFixed(2)})`);
  const lowest = (r) => Math.min(...r.f0.filter((s) => s[0][0] === 'o').map((s) => s[1]));
  ok([...got].every(([id, r]) => id === 'quake' || !r.f0.some((s) => s[0][0] === 'o') || lowest(r) > lowest(q)), `quake starts lowest (${lowest(q)} Hz)`);
  ok(q.f0[0][2] < q.f0[0][1] / 2, 'quake thud sweeps down (' + q.f0[0][1] + ' -> ' + q.f0[0][2] + ' Hz)');
  // each animal's pop replaces the plain pop at about its level (never much louder)
  for (let n = 1; n <= 6; n++) {
    const r = got.get(label('pop', n));
    ok(r.lvl <= plain.lvl * 1.25 && r.lvl >= plain.lvl * 0.35, `pop n=${n} sits at the plain pop's level (${r.lvl.toFixed(2)} vs ${plain.lvl.toFixed(2)})`);
    ok(r.sig !== plain.sig, `pop n=${n} is not the plain pop`);
  }
  // the plain pop is exactly today's whatever odd n it is given (perks off, enemies, a guest's 7..99)
  for (const o of [{}, null, { n: 0 }, { n: 7 }, { n: 99 }, { n: -3 }, { n: NaN }, { n: 'abc' }, 'x', 7, { open: true }]) {
    ok(grab(E, 'pop', o, 1).sig === plain.sig, 'pop with ' + JSON.stringify(o) + ' is the plain pop');
  }
  ok(grab(E, 'pop', { n: '4' }, 1).sig === got.get('pop(n=4)').sig, 'pop n given as a string still picks the animal');
  // variants: n is clamped into range, missing n picks the default
  const same = (a, oa, b, ob, what) => ok(grab(E, a, oa, 1).sig === grab(E, b, ob, 1).sig, what);
  same('slide', undefined, 'slide', { n: 1 }, 'slide without n = the dive');
  same('slide', { n: 9 }, 'slide', { n: 3 }, 'slide n=9 clamps to the bonk');
  same('slide', { n: -2 }, 'slide', { n: 1 }, 'slide n=-2 clamps to the dive');
  same('hop', undefined, 'hop', { n: 1 }, 'hop without n = level 1');
  same('hop', { n: 7 }, 'hop', { n: 2 }, 'hop n=7 clamps to level 2');
  same('b_echo', undefined, 'b_echo', { n: 0 }, 'b_echo without n = the shot');
  same('b_echo', { n: 5 }, 'b_echo', { n: 1 }, 'b_echo n=5 clamps to the turn');
  same('b_yarn', { n: '1' }, 'b_yarn', { n: 1 }, 'b_yarn n as a string');
  same('b_egg', { n: NaN }, 'b_egg', { n: 0 }, 'b_egg n=NaN = the shot');
  same('quake', { n: 3 }, 'quake', undefined, 'single-sound effects ignore n');
  noThrow(() => {
    for (const o of [undefined, null, {}, { n: NaN }, { n: -4 }, { n: 1e9 }, { n: '7' }, { open: 'yes' }, 'x', 7]) {
      for (const n of SFX_V4.concat(['pop'])) A.sfx(n, o);
      E.advance(1);
    }
  }, 'v4 sfx with odd opts');
  // shapes the spec asks for
  const sh = (id) => got.get(id).f0;
  ok(sh('hop(n=2)')[0][1] / sh('hop(n=1)')[0][1] > 1.15, 'hop level 2 croaks higher than level 1');
  ok(sh('hop(n=1)')[0][2] > sh('hop(n=1)')[0][1] && sh('hop(n=1)')[1][2] < sh('hop(n=1)')[1][1], 'hop "개굴" rises, then falls');
  ok(got.get('hop(n=1)').srcs[1].startT > got.get('hop(n=1)').srcs[0].startT, 'hop: the fall comes after the rise');
  ok(sh('b_icicle')[0][2] > sh('b_icicle')[0][1] && sh('b_onsen')[0][2] < sh('b_onsen')[0][1], 'icicle zips up, onsen bubble sags down');
  ok(sh('b_echo(n=0)')[0][2] > sh('b_echo(n=0)')[0][1] && sh('b_echo(n=1)')[0][2] < sh('b_echo(n=1)')[0][1], 'echo shot rises, its turn falls back');
  ok(sh('dash')[0][0] === 'n:bandpass' && sh('dash')[0][2] > sh('dash')[0][1], 'dash whoosh sweeps up');
  ok(got.get('slide(n=2)').span > got.get('slide(n=1)').span && got.get('slide(n=2)').span > got.get('slide(n=3)').span, 'the belly slide swish outlasts the dive and the bonk');
  ok(sh('b_yarn(n=0)')[0][1] < 1300 && got.get('b_yarn(n=1)').lvl < got.get('b_yarn(n=0)').lvl / 2, 'yarn blip arcs; its landing tick is tiny');
  ok(got.get('flap').lvl < plain.lvl / 2, `glide flap is soft, it repeats every 12 f (${got.get('flap').lvl.toFixed(2)})`);
  ok(sh('pop(n=4)').filter((s) => s[0] === 'o:triangle').map((s) => Math.round(s[1])).join() === '2093,3136', 'penguin pop rings C7 + G7');
  // de-dup: every pop shares one slot; the n-variants are separate slots
  {
    const heard = (calls) => { E.advance(1); return calls.map(([nm, o]) => { const b = E.stats.nodes; A.sfx(nm, o); return E.stats.nodes > b ? 1 : 0; }).join(''); };
    ok(heard([['pop', { n: 2 }], ['pop', { n: 3 }], ['pop']]) === '100', 'pops in one instant still collapse into one');
    ok(heard([['slide', { n: 1 }], ['slide', { n: 2 }], ['slide', { n: 2 }]]) === '110', 'dive + slide in one instant both sound, a repeat does not');
    ok(heard([['b_egg', { n: 0 }], ['b_egg', { n: 1 }], ['hop', { n: 1 }], ['hop', {}]]) === '1110', 'egg shot + egg settle both sound; hop {} = hop n=1 (one slot)');
  }
  // a frog autofiring for 10 s (a shot every 14 f, each egg settling 0.6 s later): every shot is heard,
  // and the effects ringing at once stay few
  {
    E.advance(2.5);
    let missed = 0, maxLive = 0;
    const live = [];
    for (let i = 0; i < 43; i++) {
      for (const [nm, o] of [['b_egg', { n: 0 }]].concat(i >= 3 ? [['b_egg', { n: 1 }]] : [])) {
        const b = E.ctx._nodes.length, now = E.ctx.currentTime;
        A.sfx(nm, o);
        const made = E.ctx._nodes.slice(b);
        if (!made.length) missed++;
        else live.push(Math.max(...made.filter((x) => x.stopT != null).map((x) => x.stopT)));
        maxLive = Math.max(maxLive, live.filter((e) => e > now).length);
      }
      E.ctx.currentTime += 14 / 60;
    }
    ok(missed === 0 && maxLive <= 3, `frog autofire: every egg heard (${missed} missed), at most ${maxLive} ringing at once`);
  }
  // 4 otters firing on 4 consecutive frames, 10 volleys: the 30 ms de-dup keeps each volley to <= 2 splashes
  {
    let worst = 0, least = 9;
    for (let v = 0; v < 10; v++) {
      E.advance(0.4);
      let n = 0;
      for (let p = 0; p < 4; p++) { const b = E.stats.nodes; A.sfx('b_splash'); if (E.stats.nodes > b) n++; A.sfx('dash'); E.ctx.currentTime += 1 / 60; }
      worst = Math.max(worst, n); least = Math.min(least, n);
    }
    ok(least >= 1 && worst <= 2, `4-otter volley: ${least}-${worst} of 4 splashes sound (de-dup keeps the stack small)`);
  }
  // a glide: one flap every 12 f for 3 s, every one heard
  {
    E.advance(1);
    let missed = 0;
    for (let i = 0; i < 15; i++) { const b = E.stats.nodes; A.sfx('flap'); if (E.stats.nodes === b) missed++; E.ctx.currentTime += 12 / 60; }
    ok(missed === 0, 'glide flaps every 12 f are all heard (' + missed + ' missed)');
  }
  // spam: every v4 sound 20 times in one instant stays bounded by the voice cap
  {
    E.advance(2.5);
    const n0 = E.stats.nodes;
    for (let i = 0; i < 20; i++) for (const [name, n] of V4_SOUNDS) A.sfx(name, optsOf(n == null ? i : n));
    const per = E.stats.nodes - n0;
    ok(per > 0 && per < 28 * 12, 'voice cap bounds v4 spam (' + per + ' nodes)');
  }
  {
    E.advance(2.5);
    const n0 = E.stats.nodes;
    for (const n of ['b_nope', 'pop_1', 'Flap', 'b_echo ', 'hop2', 'VARIANTS', 'variant', '__proto__']) A.sfx(n, { n: 1 });
    ok(E.stats.nodes === n0, 'unknown names stay silent no-ops');
  }
  ok(E.errors.length === 0, 'v4: no invalid Web Audio calls ' + E.errors.slice(0, 3).join(' | '));
}

// ---------------------------------------------------------------- V. v4 trophies
// five new local sounds: each its own recipe (tro_fly: one per n 0..5, climbing), never louder than the loudest
// existing effect, tro_down quiet, promote about 0.9 s, n clamped into range, garbage opts safe
{
  const E = makeEnv();
  const A = E.A;
  A.unlock();
  const base = new Map();
  let baseLvl = 0, baseLvlName = '';
  for (const name of SFX_V1.concat(SFX_V2, SFX_V3, SFX_V4)) {
    const r = grab(E, name, name === 'pop' ? undefined : { n: 3 });
    base.set(r.fp, name);
    if (r.lvl > baseLvl) { baseLvl = r.lvl; baseLvlName = name; }
  }
  const got = new Map(), prints = new Map();
  for (const [name, n] of V5_SOUNDS) {
    const r = grab(E, name, optsOf(n), 1);
    const id = label(name, n);
    got.set(id, r);
    ok(r.srcs.length > 0, `trophy ${id} makes sound`);
    ok(r.made.every((x) => x.startT == null || x.startT >= E.ctx.currentTime), `trophy ${id} starts nothing in the past`);
    if (base.has(r.fp)) ok(false, `trophy ${id} sounds like ${base.get(r.fp)} (${r.fp})`);
    if (prints.has(r.fp)) ok(false, `trophy ${id} sounds like ${prints.get(r.fp)} (${r.fp})`);
    prints.set(r.fp, id);
    ok(r.lvl <= baseLvl + 1e-9, `trophy ${id} is no louder than the loudest existing effect (${r.lvl.toFixed(2)} vs ${baseLvlName} ${baseLvl.toFixed(2)})`);
  }
  ok(prints.size === V5_SOUNDS.length, 'every trophy sound has its own recipe (' + prints.size + '/' + V5_SOUNDS.length + ')');
  console.log('trophy sounds (span s / level): ' + [...got].map(([id, r]) => id + '=' + r.span.toFixed(2) + '/' + r.lvl.toFixed(2)).join(' '));
  for (const [id, r] of got) if (id !== 'promote') ok(r.span > 0.04 && r.span < 0.6, `trophy ${id} is short (${r.span.toFixed(2)} s)`);
  ok(got.get('promote').span > 0.8 && got.get('promote').span < 1.2, 'promote is a ~0.9 s fanfare (' + got.get('promote').span.toFixed(2) + ' s)');
  ok(got.get('tro_down').lvl < got.get('tro_up').lvl, 'tro_down is quieter than tro_up');
  const f0 = (id) => got.get(id).f0[0][1];
  ok([0, 1, 2, 3, 4].every((n) => f0('tro_fly(n=' + (n + 1) + ')') > f0('tro_fly(n=' + n + ')')), 'tro_fly climbs with n');
  ok(got.get('tro_up').f0.filter((s) => s[0] === 'o:square' || s[0] === 'o:p25' || /^o:/.test(s[0])).length >= 4, 'tro_up is an arpeggio');
  const same = (a, oa, b, ob, what) => ok(grab(E, a, oa, 1).sig === grab(E, b, ob, 1).sig, what);
  same('tro_fly', undefined, 'tro_fly', { n: 0 }, 'tro_fly without n = the first landing');
  same('tro_fly', { n: 9 }, 'tro_fly', { n: 5 }, 'tro_fly n=9 clamps to 5');
  same('tro_fly', { n: '2' }, 'tro_fly', { n: 2 }, 'tro_fly n as a string');
  same('stake', { n: 3 }, 'stake', undefined, 'stake ignores n');
  noThrow(() => {
    for (const o of [undefined, null, {}, { n: NaN }, { n: -4 }, { n: 1e9 }, { n: '7' }, 'x', 7]) { for (const n of SFX_V5) A.sfx(n, o); E.advance(1); }
  }, 'trophy sfx with odd opts');
  {
    const heard = (calls) => { E.advance(1); return calls.map(([nm, o]) => { const b = E.stats.nodes; A.sfx(nm, o); return E.stats.nodes > b ? 1 : 0; }).join(''); };
    ok(heard([['tro_fly', { n: 0 }], ['tro_fly', { n: 1 }], ['tro_fly', { n: 1 }]]) === '110', 'two cups landing in one instant both ring, a repeat does not');
  }
  ok(E.errors.length === 0, 'trophies: no invalid Web Audio calls ' + E.errors.slice(0, 3).join(' | '));
}

// ---------------------------------------------------------------- W. v4 shop
// four new local sounds: each its own recipe (unlike every earlier one), short, never louder than the loudest existing
// effect; the armed tick is quieter and shorter than the purchase, the purchase the longest; garbage opts safe
{
  const E = makeEnv();
  const A = E.A;
  A.unlock();
  const base = new Map();
  let baseLvl = 0, baseLvlName = '';
  for (const name of SFX_V1.concat(SFX_V2, SFX_V3, SFX_V4, SFX_V5)) {
    const r = grab(E, name, name === 'pop' ? undefined : { n: 3 });
    base.set(r.fp, name);
    if (r.lvl > baseLvl) { baseLvl = r.lvl; baseLvlName = name; }
  }
  const got = new Map(), prints = new Map();
  for (const name of SFX_V6) {
    const r = grab(E, name, undefined, 1);
    got.set(name, r);
    ok(r.srcs.length > 0, `shop ${name} makes sound`);
    ok(r.made.every((x) => x.startT == null || x.startT >= E.ctx.currentTime), `shop ${name} starts nothing in the past`);
    if (base.has(r.fp)) ok(false, `shop ${name} sounds like ${base.get(r.fp)} (${r.fp})`);
    if (prints.has(r.fp)) ok(false, `shop ${name} sounds like ${prints.get(r.fp)} (${r.fp})`);
    prints.set(r.fp, name);
    ok(r.lvl <= baseLvl + 1e-9, `shop ${name} is no louder than the loudest existing effect (${r.lvl.toFixed(2)} vs ${baseLvlName} ${baseLvl.toFixed(2)})`);
    ok(r.span > 0.02 && r.span < 0.6, `shop ${name} is short (${r.span.toFixed(2)} s)`);
  }
  ok(prints.size === SFX_V6.length, 'every shop sound has its own recipe (' + prints.size + '/' + SFX_V6.length + ')');
  console.log('shop sounds (span s / level): ' + [...got].map(([id, r]) => id + '=' + r.span.toFixed(2) + '/' + r.lvl.toFixed(2)).join(' '));
  ok(got.get('arm').lvl < got.get('buy').lvl && got.get('arm').span < got.get('buy').span, 'the armed tick is quieter and shorter than the purchase');
  ok(SFX_V6.every((n) => n === 'buy' || got.get(n).span < got.get('buy').span), 'the purchase is the longest shop sound');
  ok(got.get('coin').f0.some((s) => s[0] === 'o:triangle' && Math.abs(s[1] - 2093) < 1), 'coin rings a C7 triangle');
  ok(got.get('buy').f0.filter((s) => s[0] === 'o:sine' && s[1] === 900 && s[2] === 1600).length === 2, 'buy: two squeaky rises 900 -> 1600 Hz');
  ok(got.get('equip').f0.some((s) => s[0] === 'n:bandpass'), 'equip: a band-passed cloth noise');
  noThrow(() => {
    for (const o of [undefined, null, {}, { n: NaN }, { n: -4 }, { n: 1e9 }, 'x', 7]) { for (const n of SFX_V6) A.sfx(n, o); E.advance(1); }
  }, 'shop sfx with odd opts');
  ok(E.errors.length === 0, 'shop: no invalid Web Audio calls ' + E.errors.slice(0, 3).join(' | '));
}

// ---------------------------------------------------------------- X. v4 뽑기
// four new local sounds, each its own recipe, short, never louder than the loudest earlier effect; the variants: the
// legend fanfare longer than the rare one, the 10th pop higher than the 1st, two turns of the crank longer than one and
// the knock alone the shortest, a landing without its bounce shorter; garbage opts safe
{
  const E = makeEnv();
  const A = E.A;
  A.unlock();
  const base = new Map();
  let baseLvl = 0, baseLvlName = '';
  for (const name of SFX_V1.concat(SFX_V2, SFX_V3, SFX_V4, SFX_V5, SFX_V6)) {
    const r = grab(E, name, name === 'pop' ? undefined : { n: 3 });
    base.set(r.fp, name);
    if (r.lvl > baseLvl) { baseLvl = r.lvl; baseLvlName = name; }
  }
  const V = { gacha_roll: [0, 1, 2], gacha_drop: [0, 1], gacha_pop: [0, 9], gacha_win: [2, 3] }, got = new Map(), prints = new Map();
  for (const name of SFX_V7) for (const n of V[name]) {
    const r = grab(E, name, { n }, 1.5), id = name + '(' + n + ')';
    got.set(id, r);
    ok(r.srcs.length > 0, `gacha ${id} makes sound`);
    ok(r.made.every((x) => x.startT == null || x.startT >= E.ctx.currentTime), `gacha ${id} starts nothing in the past`);
    if (base.has(r.fp)) ok(false, `gacha ${id} sounds like ${base.get(r.fp)} (${r.fp})`);
    if (n === V[name][0]) { if (prints.has(r.fp)) ok(false, `gacha ${id} sounds like ${prints.get(r.fp)}`); prints.set(r.fp, id); }
    ok(r.lvl <= baseLvl + 1e-9, `gacha ${id} is no louder than the loudest existing effect (${r.lvl.toFixed(2)} vs ${baseLvlName} ${baseLvl.toFixed(2)})`);
    ok(r.span > 0.02 && r.span < 1.2, `gacha ${id} is short (${r.span.toFixed(2)} s)`);
  }
  ok(prints.size === SFX_V7.length, 'every 뽑기 sound has its own recipe (' + prints.size + '/' + SFX_V7.length + ')');
  console.log('뽑기 sounds (span s / level): ' + [...got].map(([id, r]) => id + '=' + r.span.toFixed(2) + '/' + r.lvl.toFixed(2)).join(' '));
  const g = (id) => got.get(id);
  ok(g('gacha_win(3)').span > g('gacha_win(2)').span, 'the 전설 fanfare is longer than the 희귀 one');
  const top = (r) => Math.max(...r.f0.filter((q) => q[0] === 'o:sine').map((q) => Math.max(q[1], q[2])));
  ok(top(g('gacha_pop(9)')) > top(g('gacha_pop(0)')) * 1.6, 'the 10th capsule pops 9 semitones higher than the 1st');
  ok(g('gacha_roll(1)').span > g('gacha_roll(0)').span && g('gacha_roll(2)').span < g('gacha_roll(0)').span, 'the crank: two turns longer than one, the knock alone the shortest');
  ok(g('gacha_drop(1)').span < g('gacha_drop(0)').span, 'a landing without its bounce is shorter');
  ok(g('gacha_win(3)').lvl <= grab(E, 'promote').lvl + 1e-9, 'the 전설 fanfare is never louder than promote');
  noThrow(() => { for (const o of [undefined, null, {}, { n: NaN }, { n: -4 }, { n: 1e9 }, 'x', 7]) { for (const n of SFX_V7) A.sfx(n, o); E.advance(1); } }, '뽑기 sfx with odd opts');
  ok(E.errors.length === 0, '뽑기: no invalid Web Audio calls ' + E.errors.slice(0, 3).join(' | '));
}

// ---------------------------------------------------------------- T. the v1-v3 effects are untouched by v4
// node-for-node identical to the pre-kit build (src-v3-backup/audio.js) under the same random seed
{
  if (fs.existsSync(BACKUP)) {
    const OLD = makeEnv({ seed: 11, src: fs.readFileSync(BACKUP, 'utf8') }), NEW = makeEnv({ seed: 11 });
    OLD.A.unlock(); NEW.A.unlock();
    let diff = [];
    const calls = [];
    for (const name of SFX_V1.concat(SFX_V2, SFX_V3)) for (const o of [undefined, { n: 3 }]) calls.push([name, o]);
    calls.push(['door', { open: true }], ['boss_hit', { n: 0 }], ['boss_hit', { n: 99 }], ['chain', { n: 12 }], ['pop', { n: 0 }], ['pop', { n: 50 }]);
    for (const [name, o] of calls) {
      const a = grab(OLD, name, o), b = grab(NEW, name, o);
      if (a.sig !== b.sig) diff.push(label(name, o && o.n != null ? o.n : null) + (o && o.open ? '(open)' : ''));
    }
    // (pop n=3 is the otter's pop now: that one is meant to differ)
    diff = diff.filter((d) => d !== 'pop(n=3)');
    ok(diff.length === 0, `v1-v3 effects identical to the v3 build (${calls.length} calls; differ: ${diff.join(' ') || 'none'})`);
    OLD.A.music('main'); NEW.A.music('main'); OLD.advance(3); NEW.advance(3);
    ok(OLD.stats.nodes === NEW.stats.nodes && OLD.stats.osc === NEW.stats.osc, `music unchanged (${OLD.stats.nodes} vs ${NEW.stats.nodes} nodes)`);
    ok(OLD.errors.length === 0 && NEW.errors.length === 0, 'backup comparison: no invalid Web Audio calls');
  } else console.log('src-v3-backup/audio.js not found: v1-v3 identity check skipped');
}

// ---------------------------------------------------------------- R. engine <-> audio names
// every literal sfx / music name src/game.js asks for must exist here (underscored v2 names included)
{
  const gamePath = path.join(__dirname, '..', 'src', 'game.js');
  if (fs.existsSync(gamePath)) {
    const game = fs.readFileSync(gamePath, 'utf8');
    const E = makeEnv();
    const sfxSet = new Set(E.A._sfxNames), songSet = new Set(Object.keys(E.A._songs));
    const usedSfx = new Set([...game.matchAll(/\bsfx\(\s*'([a-z_]+)'|call\(\s*'sfx',\s*'([a-z_]+)'/g)].map((m) => m[1] || m[2]));
    const usedMusic = new Set([...game.matchAll(/\b(?:setMusic|music)\(\s*'([a-z_]+)'|\bmusic:\s*'([a-z_]+)'/g)].map((m) => m[1] || m[2]));
    for (const n of usedSfx) ok(sfxSet.has(n), `game.js sfx '${n}' exists in audio.js`);
    for (const n of usedMusic) ok(songSet.has(n), `game.js music '${n}' exists in audio.js`);
    ok(usedSfx.size >= 20 && usedMusic.size >= 6, `engine name scan found calls (${usedSfx.size} sfx, ${usedMusic.size} tracks)`);
    for (const n of ['boss', 'final', 'victory']) ok(usedMusic.has(n), `game.js uses music '${n}'`);
    for (const n of SFX_V2) ok(usedSfx.has(n), `game.js uses sfx '${n}'`);
    // v3 names are wired up by the engine/UI in parallel: report coverage, do not fail on it
    const v3 = SFX_V3.concat(TRACKS_V3);
    // (also counts snapshot-event style references such as {sfx: 'ko'} or sfx: ['ko', ...])
    const evSfx = new Set([...game.matchAll(/\b(?:sfx|snd|music)\s*:\s*\[?\s*'([a-z_]+)'/g)].map((m) => m[1]));
    const wired = v3.filter((n) => usedSfx.has(n) || usedMusic.has(n) || evSfx.has(n));
    console.log(`engine v3 audio names referenced: ${wired.length}/${v3.length}` +
      (wired.length < v3.length ? ` (not yet: ${v3.filter((n) => wired.indexOf(n) < 0).join(' ')})` : ''));
    // v4 kit names (wired by the engine in parallel): coverage, and whether the local ones are kept out of the echo
    const v4 = SFX_V4.filter((n) => usedSfx.has(n) || evSfx.has(n));
    const v4lit = SFX_V4.filter((n) => v4.indexOf(n) < 0 && new RegExp("'" + n + "'").test(game)); // (maybe a move state, maybe a table entry)
    const ne = /const NO_ECHO = {([^}]*)}/.exec(game), noEcho = new Set(ne ? [...ne[1].matchAll(/([a-z_]+)s*:/g)].map((m) => m[1]) : []);
    const echoed = V4_LOCAL.filter((n) => !noEcho.has(n));
    console.log(`engine v4 audio names referenced: ${v4.length}/${SFX_V4.length}` + (v4.length < SFX_V4.length ? ` (not as an sfx call: ${SFX_V4.filter((n) => v4.indexOf(n) < 0).join(' ')}; quoted elsewhere: ${v4lit.join(' ') || 'none'})` : '') +
      ` | NO_ECHO ${ne ? (echoed.length ? 'still echoes local: ' + echoed.join(' ') : 'has every local v4 name') : 'not found'}` + (noEcho.has('quake') ? ' | WARN quake should be echoed' : ''));
    console.log(`engine uses sfx [${[...usedSfx].sort().join(' ')}] music [${[...usedMusic].sort().join(' ')}]`);
  } else console.log('src/game.js not found: engine name check skipped');
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
