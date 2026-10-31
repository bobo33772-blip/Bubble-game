/* ==========================================================================
   뽀득뽀득 목욕탕 — audio.js
   WebAudio sound effects + an ORIGINAL chiptune soundtrack composed for this game.

   PG.Audio = { unlock(), sfx(name, opts), music(track), setMuted(bool), isMuted() }
     unlock()        create/resume the AudioContext (call from a user gesture)
     sfx(name, o)    jump shoot capture pop chain(o.n) kill item extend die hurry
                     clear bounce steam start gameover escape pause
                     boss_hit(o.n?) boss_stun boss_damage boss_roar shockwave spore
                     scald_warn scald_splash splash freeze melt stamp ticket powerup door(o.open?)
                     join leave ready countdown go trap_player revive ghost ko win      (v3 online)
                     dry reload                                    (battle: an empty press, the magazine refilled)
                     flap slam quake dash slide(o.n) djump hop(o.n)              (v4 kit moves)
                     b_echo(o.n) b_onsen b_splash b_icicle b_yarn(o.n) b_egg(o.n) (v4 kit bubbles)
                     stake tro_fly(o.n) tro_up tro_down promote                  (v4 trophies)
                     coin arm buy equip                                          (v4 shop)
                     gacha_roll(o.n) gacha_drop(o.n) gacha_pop(o.n) gacha_win(o.n) (v4 뽑기)
                     puff(o.n)                                                    (파티: 펑's puff, local)
                     tap(o.n) scratch                (파티 새 게임 2: 수도꼭지's faucet note 0..3, 의자's stop; local)
                       chain: o.n = position in the chain (pitch climbs)
                       boss_hit: optional o.n = soap hits so far (slap pitch creeps up)
                       door: default = panels sliding shut (ends in a wooden clack);
                             o.open = true for the opening slide (latch click, no clack)
                       countdown: one beep — call it once per number (3, 2, 1), then go
                       pop: o.n = 1..6 is the first pop of a player's bubble, one per animal
                            (1 duck, 2 capy, 3 otter, 4 penguin, 5 cat, 6 frog); no n / any other n =
                            the plain pop, unchanged (perks off, enemies, stamps)
                       slide: o.n 1 = dive, 2 = belly slide, 3 = bonk;  hop: o.n = chain level 1..2
                       b_echo / b_yarn / b_egg: o.n 0 = the shot; 1 = echo turns back / yarn hop tick /
                            egg settles.  Variant n out of range is clamped; quake is the heaviest v4 hit
                       tro_fly: o.n 0..5 = the n-th cup landing on the podium (the pitch climbs, then wraps)
                     Repeats of one effect within 30 ms collapse into one (per variant for chain and the
                     v4 n-variants; all pops share one slot, so a frame of pops is still one pop), and
                     at most 28 effects ring at once: autofire, glide flaps and 4-player volleys stay bounded.
     music(track)    'title' | 'main' | 'hurry' | 'clear' | 'gameover' | 'ending' |
                     'boss' | 'final' | 'victory' | 'lobby' | 'battle' | 'podium' | 'party' | 'chair' | null
                     (clear/gameover/ending/victory/podium play once; the rest loop)
     setMuted(b)     persisted in localStorage 'ppogeul-muted'
   Every call is a silent no-op when audio is unavailable or not yet unlocked, and never throws.
   Music runs on a lookahead scheduler (setInterval 25 ms, ~0.12 s ahead) driven by
   AudioContext.currentTime; each track plays into its own gain node so switching
   tracks is a short fade instead of a click.
   ========================================================================== */
window.PG = window.PG || {};
(function (PG) {
  'use strict';
  const W = window;

  // Hot reload: shut down a previous instance so two schedulers never play at once.
  try { if (PG.Audio && typeof PG.Audio._dispose === 'function') PG.Audio._dispose(); } catch (e) { /* ignore */ }

  const MUTE_KEY = 'ppogeul-muted';
  const MASTER_VOL = 0.5;   // after the limiter
  const MUSIC_VOL = 0.5;
  const SFX_VOL = 0.8;
  const LOOKAHEAD = 0.12;    // seconds of music scheduled ahead of currentTime
  const TICK_MS = 25;        // scheduler period
  const FADE = 0.08;         // fade-out when a track is replaced/stopped
  const noop = function () {};

  /* ------------------------------------------------------------------------
     Music data. Notation (one token per step, space separated):
       C5 F#4 Bb3  note        -  hold previous note      .  rest
     Bass and arp tokens may also be chord-relative: R root, 3 third, 5 fifth,
     8 octave, 7 seventh, 6 sixth (the root sits in the octave starting at the part's
     `base` MIDI note: bass 40 = E2, arp 60 = C4 unless given).  Comp token x = chord
     stab.  Drum bars are 16 chars of 16th notes: k kick, s snare, h hat, o open hat,
     c crash+kick, t tom, b wooden bath-bucket knock, w water drop, . rest.
     Chords: one symbol per half bar (C Am F G7 Dm7 Cm Bb ...), exactly 2 per bar.
     Grid: 16 ticks per 4/4 bar; melodic parts use res 2 (8th notes) unless res: 1.
     Optional per part: bass/comp `w` (waveform) + bass `lp`/`q` (low-pass);
     lead/comp `env` {s, dc, r, am, ar} reshapes the note envelope (s sustain level,
     dc decay, r release, am/ar a tremolo depth/rate) — e.g. a plucked vibraphone;
     lead `dbl` {iv, w, v, lp} doubles every lead note iv semitones away;
     `arp` is an optional 4th part (thin plucked arpeggio).  `loopAt: n` makes a
     looping song restart at bar n, so bars before it are a play-once intro.
     ------------------------------------------------------------------------ */
  const rep = (x, n) => Array.from({ length: n }, () => x);

  const BA = 'R . 5 8 R . 5 .';       // bouncy bass: root, fifth, octave hop
  const CA = '. x . x . x . x';       // off-beat chord stabs (the "pah" of oom-pah)
  const D1 = 'c.h.s.h.k.hks.h.';      // section start with crash
  const DA = 'k.h.s.h.k.hks.h.';      // main groove
  const DB = 'k.h.s.hkk.h.s.ho';      // bridge groove
  const F1 = 'k.h.s.h.k.s.ssss';      // snare fill
  const F2 = 'k.h.s.h.k.t.tsss';      // tom fill (loop turnaround)

  // 'main' — 뽀득뽀득 행진 (C major, 152 bpm). AABA-ish, 16 bars, loops.
  const MAIN = {
    bpm: 152, swing: 0.22, bars: 16, loop: true,
    chords: 'C C Am Am F F G G  C C Am Am Dm7 G7 C C  F F G G Am Am Dm7 G7  C E7 Am C7 F G7 C G7',
    lead: {
      w: 'p25', v: 0.12, vib: 1, echo: { w: 'p12', v: 0.035, d: 3 },
      bars: [
        'G4 C5 E5 G5 . E5 G5 .', 'A5 - G5 E5 . C5 E5 .', 'F5 . A5 . C6 - A5 .', 'G5 - - . D5 E5 F5 D5',
        'G4 C5 E5 G5 . E5 G5 .', 'C6 - B5 A5 . E5 A5 .', 'F5 . A5 . G5 F5 D5 B4', 'C5 - - . . C5 D5 E5',
        'F5 - - E5 F5 - A5 .', 'G5 - - F#5 G5 - B5 .', 'A5 - - G#5 A5 - C6 .', 'D6 - C6 . B5 . G5 F5',
        'E5 . G5 C6 B5 . G#5 .', 'A5 . C6 A5 Bb5 . G5 E5', 'F5 . A5 C6 B5 . G5 F5', 'C6 - G5 E5 F5 . D5 B4',
      ],
    },
    bass: {
      v: 0.26,
      bars: [BA, BA, BA, BA, BA, BA, BA, 'C3 . G2 . C3 B2 A2 G2',
        'R - - 5 R - 5 .', 'R - - 5 R - 5 .', 'R - - 5 R - 5 .', 'R - - 5 R - 5 .',
        BA, BA, BA, 'R . 5 8 R . 3 .'],
    },
    comp: {
      v: 0.026,
      bars: [CA, CA, CA, CA, CA, CA, CA, '. x . x x . x .',
        'x - . x . x - .', 'x - . x . x - .', 'x - . x . x - .', 'x - . x . x - .',
        CA, CA, CA, '. x . x x . x .'],
    },
    drums: { v: 0.9, bars: [D1, DA, DA, DA, DA, DA, DA, F1, D1, DB, DB, DB, DA, DA, DA, F2] },
  };

  // 'hurry' — the same tune, faster, a whole step higher, with busy 16th hats.
  const HURRY = Object.assign({}, MAIN, {
    bpm: 192, swing: 0, transpose: 2,
    drums: { v: 0.9, bars: MAIN.drums.bars.map((b) => b.replace(/\./g, 'h')) },
  });

  // 'title' — 목욕탕 가는 길 (F major, 116 bpm shuffle), 16 bars, loops.
  const TITLE = {
    bpm: 116, swing: 0.6, bars: 16, loop: true,
    chords: 'F F Dm Dm Bb Bb C7 C7 F F Dm Dm Gm7 C7 F F  Bb Bb C C Am Am Dm Dm Gm Gm C7 C7 F F C7 C7',
    lead: {
      w: 'square', v: 0.085, vib: 1, echo: { w: 'p12', v: 0.03, d: 3 },
      bars: [
        'C5 . F5 G5 A5 - F5 .', 'A5 . D6 . C6 A5 F5 .', 'D6 - Bb5 . F5 . Bb5 .', 'C6 - - . Bb5 . G5 E5',
        'C5 . F5 G5 A5 - F5 .', 'A5 . D6 . F6 . E6 .', 'D6 . Bb5 G5 C6 . E5 G5', 'F5 - - . . . C5 .',
        'D5 . F5 . Bb5 - A5 .', 'G5 - E5 . C6 - G5 .', 'A5 . C6 . E6 - D6 C6', 'D6 - - . A5 . F5 .',
        'G5 . Bb5 . D6 - C6 Bb5', 'C6 . G5 . E5 - G5 .', 'F5 . A5 . C6 . A5 .', 'G5 - - . G4 A4 Bb4 .',
      ],
    },
    bass: { v: 0.24, bars: rep('R . 5 . R . 5 .', 16) },
    comp: { v: 0.022, bars: rep(CA, 16) },
    drums: { v: 0.55, bars: rep('k.h.s.h.k.h.s.h.', 15).concat(['k.h.s.h.k.s.s.ss']) },
  };

  // 'clear' — 반짝반짝 (round clear jingle), plays once.
  const CLEAR = {
    bpm: 150, swing: 0, bars: 2, loop: false,
    chords: 'F G C C',
    lead: {
      w: 'p25', v: 0.12, res: 1, echo: { w: 'p12', v: 0.04, d: 3 },
      bars: ['A5 . C6 . F6 . A5 C6 B5 . D6 . G6 . F6 D6', 'E6 - - - - - - - - - . . . . . .'],
    },
    bass: { v: 0.26, bars: ['F2 . F3 . G2 . G3 .', 'C3 - - - - . . .'] },
    comp: { v: 0.026, bars: [CA, 'x - - - - . . .'] },
    drums: { v: 0.9, bars: ['k...s...k.k.s.ss', 'c...............'] },
  };

  // 'gameover' — 목욕 끝 (C minor), plays once.
  const GAMEOVER = {
    bpm: 126, swing: 0, bars: 3, loop: false,
    chords: 'Cm Fm G7 Cm Cm Cm',
    lead: {
      w: 'square', v: 0.1, vib: 1, echo: { w: 'p12', v: 0.03, d: 3 },
      bars: ['G5 . Eb5 . Ab5 - F5 .', 'D5 . B4 . C5 - - -', '- - - . . . . .'],
    },
    bass: { v: 0.26, bars: ['C3 - - - F2 - - -', 'G2 - - - C2 - - -', '- - - . . . . .'] },
    comp: { v: 0.022, bars: ['x - - - x - - -', 'x - - - x - - -', '- - - . . . . .'] },
    drums: { v: 0.8, bars: ['................', '........t.......', '................'] },
  };

  // 'ending' — 반짝반짝 대청소 끝! (C major fanfare march), plays once.
  const ENDING = {
    bpm: 138, swing: 0, bars: 9, loop: false,
    chords: 'C C F F G G C C Am Am F F G7 G7 C G7 C C',
    lead: {
      w: 'p25', v: 0.12, vib: 1, echo: { w: 'p12', v: 0.035, d: 3 },
      bars: [
        'G4 C5 E5 G5 C6 - - .', 'C6 . A5 . F5 A5 C6 .', 'D6 - B5 . G5 . B5 D6', 'E6 - - . C6 . G5 .',
        'A5 - C6 . E6 - D6 C6', 'F6 - - . E6 D6 C6 A5', 'B5 - D6 . G6 - F6 D6', 'E6 - C6 . D6 . B5 .',
        'C6 - - - - - . .',
      ],
    },
    bass: { v: 0.26, bars: [BA, BA, BA, BA, BA, BA, BA, 'R . 5 . R . 3 .', 'C2 - - - - - . .'] },
    comp: { v: 0.026, bars: rep(CA, 8).concat(['x - - - - - . .']) },
    drums: { v: 0.9, bars: [D1, DA, DA, DA, DA, DA, DA, F1, 'c...............'] },
  };

  // Shared battle parts
  const A0 = rep('.', 16).join(' ');                  // arp tacet (16th grid)
  const AU = 'R 3 5 8 R 3 5 8 R 3 5 8 R 3 5 8';      // 16th arpeggio climbing
  const AD = '8 5 3 R 8 5 3 R 8 5 3 R 8 5 3 R';      // 16th arpeggio falling

  // 'boss' — 때 대장과의 한판 (D minor, 168 bpm). Straight-eighth drive: octave-hopping saw
  // bass, 3+3+2 chord stabs and a "da . da da DAA" hook that climbs the minor triad.
  const BB = 'R 8 R 8 R 8 R 8';                       // octave pump
  const CB = 'x . . x . . x .';                       // 3+3+2 stabs
  const XA = 'k.hhs.hkk.hhs.hh';                      // battle groove
  const XC = 'c.hhs.hkk.hhs.hh';                      // ... with crash
  const XB = 'k.o.s.o.k.o.s.oo';                      // open-hat section
  const XF = 'k.hhs.hkk.t.tsss';                      // tom fill
  const XR = 'k.hhs.hks.ssssss';                      // snare roll into the climax
  const BOSS = {
    bpm: 168, swing: 0, bars: 16, loop: true,
    chords: 'Dm Dm Bb C Dm Dm Gm A7  Dm Dm Bb C Bb Gm A7 A7  Gm Gm Dm Dm Eb Eb A7 A7  Bb Bb C C Dm Bb A7 A7',
    lead: {
      w: 'p25', v: 0.11, vib: 1, echo: { w: 'p12', v: 0.03, d: 3 },
      bars: [
        'D5 . D5 F5 A5 - G5 F5', 'G5 - F5 D5 E5 - C5 E5', 'F5 . F5 A5 D6 - C6 A5', 'Bb5 - A5 G5 A5 - C#5 E5',
        'D5 . D5 F5 A5 - G5 F5', 'G5 - F5 D5 E5 - G5 C6', 'D6 - C6 Bb5 G5 - Bb5 D6', 'C#6 - - A5 E6 - - .',
        'G5 - Bb5 - D6 . C6 Bb5', 'A5 - F5 - D5 . E5 F5', 'G5 - Bb5 - Eb6 . D6 Eb6', 'C#6 - E6 - G6 - - .',
        'F6 - D6 - Bb5 . C6 D6', 'E6 - C6 - G5 . A5 Bb5', 'A5 . A5 D6 F6 - D6 Bb5', 'C#6 - E6 C#6 A5 - E5 C#5',
      ],
    },
    bass: {
      w: 'sawtooth', lp: 1000, q: 2, base: 36, v: 0.15,
      bars: [BB, BB, BB, 'R 8 R 8 R 8 5 3', BB, BB, BB, 'R . R . R 8 5 7',
        'R - R 8 R - R 8', 'R - R 8 R - R 8', 'R - R 8 R - R 8', 'R R R R 5 5 7 7',
        BB, BB, BB, 'R 8 R 8 5 8 3 5'],
    },
    comp: {
      v: 0.024,
      bars: [CB, CB, CB, CB, CB, CB, CB, 'x . x . x . x x',
        'x - - - x - - -', 'x - - - x - - -', 'x - - - x - - -', 'x . x . x x x x',
        CB, CB, CB, 'x . x . x . x x'],
    },
    arp: { w: 'p12', v: 0.028, res: 1, base: 62, bars: [A0, A0, A0, A0, AU, AU, AU, AU, AD, AD, AD, AD, AU, AU, AU, AU] },
    drums: { v: 0.95, bars: [XC, XA, XA, XF, XA, XA, XA, XF, XB, XB, XB, XR, XC, XA, XA, XF] },
  };

  // 'final' — 이태리 타올 대마왕 (E harmonic minor, 184 bpm). A 4-bar ominous intro
  // (E–F half-step menace) plays once, then a galloping 16-bar loop with a sawtooth
  // octave-down double on the lead and a chromatic line-cliché bass in the last section.
  const FB = 'R R 8 R R R 8 R';                       // gallop
  const FA = 'R 5 8 5 R 5 8 5 R 5 8 5 R 5 8 5';      // 16th arp, open fifths
  const YA = 'k.hks.hkk.hks.hk';                      // double-kick groove
  const YC = 'c.hks.hkk.hks.hk';                      // ... with crash
  const YB = 'k.oks.okk.oks.ok';                      // open-hat section
  const YF = 'k.hks.hkk.t.ttss';                      // tom fill
  const FINAL = {
    bpm: 184, swing: 0, bars: 20, loop: true, loopAt: 4,
    chords: 'Em Em F F Em Em B7 B7  Em Em C D Em Em Am B7  Em Em C D Am B7 Em Em  C C G G Am Am B7 B7  Em Em Em Em C C B7 B7',
    lead: {
      w: 'square', v: 0.072, vib: 1, echo: { w: 'p12', v: 0.028, d: 3 },
      dbl: { iv: -12, w: 'sawtooth', v: 0.045, lp: 1800 },
      bars: [
        'B4 - - - E5 - - -', 'C5 - - - F5 - - -', 'B4 - - - E5 - G5 -', 'F#5 - - - D#5 - B4 -',
        'E5 . G5 B5 E6 - D#6 E6', 'C6 - B5 A5 D6 - A5 F#5', 'G5 . B5 E6 G6 - F#6 E6', 'C6 - B5 A5 B5 - D#5 F#5',
        'E5 . G5 B5 E6 - D#6 E6', 'C6 - B5 A5 D6 - A5 F#5', 'A5 C6 E6 C6 D#6 - F#6 -', 'E6 - - - B5 . G5 B5',
        'C6 - - G5 E5 - G5 C6', 'D6 - - B5 G5 - A5 B5', 'C6 - - A5 E6 - D6 C6', 'B5 - - - D#6 - F#6 -',
        'G6 - F#6 E6 D#6 - E6 B5', 'B5 - A5 G5 E5 - C#6 E6', 'G6 - E6 C6 G5 - D6 C6', 'D#6 - - . B5 A5 F#5 D#5',
      ],
    },
    bass: {
      w: 'sawtooth', lp: 1300, q: 2, base: 36, v: 0.15,
      bars: ['R R R R R R R R', 'R R R R R R R R', 'R R R R R R R R', 'R R R R 5 5 7 7',
        FB, FB, FB, FB, FB, FB, FB, 'R R 8 R 5 5 3 3',
        FB, FB, FB, 'R R 8 R 5 5 7 7',
        'E2 E2 E3 E2 D#2 D#2 D#3 D#2', 'D2 D2 D3 D2 C#2 C#2 C#3 C#2', FB, 'R R 8 R R 7 5 3'],
    },
    comp: {
      v: 0.022,
      bars: rep('x - - - x - - -', 4).concat(rep('x - . x - . x .', 8), rep('x - - - x - - -', 4), rep('x . x . x . x .', 4)),
    },
    arp: { w: 'p12', v: 0.026, res: 1, base: 60, bars: [A0, A0, AU, AU].concat(rep(FA, 8), rep(AD, 4), rep(AU, 4)) },
    drums: {
      v: 0.95,
      bars: ['k...k...k...k...', 'k...k...k...k.k.', 'k.h.k.h.k.h.k.hh', 's.s.s.s.ssssssss',
        YC, YA, YA, YA, YA, YA, YA, YF, YB, YB, YB, XR, YC, YA, YA, 'k.hks.hkt.tttsss'],
    },
  };

  // 'victory' — 뽀득! (D major fanfare after a boss falls; bVI–bVII–I lift), plays once.
  const VICTORY = {
    bpm: 150, swing: 0, bars: 2, loop: false,
    chords: 'D Bb C D',
    lead: {
      w: 'p25', v: 0.12, res: 1, vib: 1, echo: { w: 'p12', v: 0.04, d: 3 },
      bars: ['D5 . D5 . D5 F#5 A5 . Bb5 - - . D6 . F6 .', 'E6 - - . C6 . G5 C6 F#6 - - - - - - -'],
    },
    bass: { v: 0.26, bars: ['D3 . D2 . Bb2 . F2 .', 'C3 . G2 . D2 - - -'] },
    comp: { v: 0.026, bars: ['x . x . x - x .', 'x . x . x - - -'] },
    arp: { w: 'p12', v: 0.03, res: 1, base: 62, bars: [A0, '. . . . . . . . 8 5 3 R 8 5 3 R'] },
    drums: { v: 0.9, bars: ['c...s.s.k.s.s.ss', 'k.s.k.ssc.......'] },
  };

  /* ---- v3: online play ---- */

  // 'lobby' — 탈의실 라운지 (G major, 112 bpm, lazy swing). Waiting-room tune for the
  // friends / room screens: a plucked vibraphone lead with tremolo over I–vi–ii–V
  // seventh chords, charleston comp, a bouncing bass and a bath-bucket clave
  // (3-2) instead of a backbeat; water drops plip in the second half. 16 bars, loops.
  const LB = 'R . . 5 8 . 5 .';                       // lazy bounce
  const LBH = 'R . 5 . R . 5 .';                      // two chords in the bar
  const LC = 'x - . x - . . .';                       // charleston
  const LCH = 'x - . . x - . .';                      // two chords in the bar
  const L0 = '. . . . . . . .';                       // arp tacet (8th grid)
  const LA = '. 8 . 5 . 3 . 5';                       // high off-beat plinks
  const LDA = 'k.hb..b.k.b.b.h.';                     // kick + 3-2 bucket clave
  const LDB = 'k.hb.wb.k.b.b.hw';                     // ... with water drops
  const LDF = 'k.hb..b.k.bbt.tt';                     // turnaround
  const LOBBY = {
    bpm: 112, swing: 0.45, bars: 16, loop: true,
    chords: 'GM7 GM7 Em7 Em7 Am7 Am7 D7 D7  GM7 GM7 Em7 Em7 Am7 D7 G6 G6  CM7 CM7 Bm7 Bm7 Em7 Em7 A7 A7  Am7 Am7 Bm7 E7 Am7 D7 G6 D7',
    lead: {
      w: 'triangle', v: 0.2, env: { s: 0.3, dc: 0.3, r: 0.16, am: 0.18, ar: 5 }, echo: { w: 'p12', v: 0.022, d: 3 },
      bars: [
        'D5 . B4 D5 . G5 - F#5', '- . E5 . D5 B4 G4 .', 'A4 . C5 E5 . A5 - G5', '- . F#5 . E5 C5 A4 .',
        'D5 . B4 D5 . G5 - B5', 'A5 - G5 . E5 . D5 E5', 'C5 . E5 A5 . F#5 - E5', 'G5 - - . . B4 C5 D5',
        'E5 . G5 B5 . A5 - F#5', '- . D5 . B4 . A4 B4', 'G5 . E5 G5 . B5 - A5', '- . G5 . E5 C#5 A4 .',
        'C5 . E5 G5 . A5 - C6', 'B5 . A5 F#5 G#5 - B5 .', 'C6 - B5 A5 . F#5 . A5', 'G5 - - . . A4 B4 C5',
      ],
    },
    bass: { v: 0.25, bars: [LB, LB, LB, LB, LB, LB, LBH, LB, LB, LB, LB, LB, LB, LBH, LBH, LBH] },
    comp: {
      w: 'triangle', v: 0.05, env: { s: 0.45, dc: 0.22, r: 0.08 },
      bars: [LC, LC, LC, LC, LC, LC, LCH, LC, LC, LC, LC, LC, LC, LCH, LCH, LCH],
    },
    arp: { w: 'sine', v: 0.04, base: 72, bars: rep(L0, 8).concat(rep(LA, 8)) },
    drums: { v: 0.75, bars: rep(LDA, 7).concat([LDF], rep(LDB, 7), [LDF]) },
  };

  // 'party' — 파티 쇼 (F major, 132 bpm). Between the minigames (design/party-polish.md 8.2): the card, the tally, 마지막
  // 판!, the awards. The lobby's instruments - a plucked vibraphone lead, a triangle comp - with a bouncier octave bass, a
  // high bell arp and a hand-clap backbeat on the bath bucket. 8 bars, loops.
  const PTB = 'R . 8 . R 8 . 5';                      // bouncing octaves
  const PTC = '. x . x . x . x';                      // off-beat stabs
  const PTA = 'R 3 5 8 5 3 R 5';                      // bell arp
  const PTD = 'k.h.s.hbk.hks.hb';
  const PTF = 'k.h.s.hbk.s.s.ss';                     // turnaround
  const PARTY = {
    bpm: 132, swing: 0.2, bars: 8, loop: true,
    chords: 'F F Dm Dm Bb C7 F F  F F Gm7 C7 Am Dm Gm7 C7',
    lead: {
      w: 'triangle', v: 0.19, env: { s: 0.3, dc: 0.25, r: 0.12, am: 0.12, ar: 5 }, echo: { w: 'p12', v: 0.02, d: 3 },
      bars: [
        'A4 . C5 F5 . A5 - G5', 'F5 . D5 . F5 A4 . .', 'Bb4 . D5 F5 G5 . E5 C5', 'F5 - - . . C5 D5 E5',
        'F5 . A5 C6 . A5 - F5', 'G5 . Bb5 . G5 E5 . C5', 'A5 . G5 F5 D5 . F5 .', 'G5 - - . E5 - C5 .',
      ],
    },
    bass: { v: 0.25, bars: rep(PTB, 8) },
    comp: { w: 'triangle', v: 0.045, env: { s: 0.45, dc: 0.18, r: 0.06 }, bars: rep(PTC, 8) },
    arp: { w: 'sine', v: 0.035, base: 72, bars: rep(PTA, 8) },
    drums: { v: 0.7, bars: rep(PTD, 7).concat([PTF]) },
  };

  // 'chair' — 목욕 의자 뺏기 (C major, 150 bpm, two-beat; design/party-games-2.md 5.7). The musical-chairs tune: a square
  // lead hopping up and down the chord over an oom-pah triangle bass, off-beat stabs and light kick / snare drums. Each
  // page cuts it at its own view of each stop and starts it again from bar 1 (game.js chairSound). 4 bars, loops.
  const CHB = 'R . 5 . R . 5 .';                      // oom-pah
  const CHC = '. x . x . x . x';
  const CHD = 'k.h.s.h.k.h.s.h.';
  const CHAIR = {
    bpm: 150, swing: 0.15, bars: 4, loop: true,
    chords: 'C C F G7 C Am Dm7 G7',
    lead: {
      w: 'square', v: 0.075,
      bars: ['E5 G5 C6 G5 E5 G5 C6 .', 'A5 . F5 A5 G5 . D5 F5', 'E5 G5 C6 E6 D6 C6 A5 .', 'F5 A5 G5 F5 D5 . G4 .'],
    },
    bass: { v: 0.24, bars: rep(CHB, 4) },
    comp: { v: 0.02, bars: rep(CHC, 4) },
    drums: { v: 0.6, bars: [CHD, CHD, CHD, 'k.h.s.h.k.s.s.s.'] },
  };

  // 'battle' — 거품 한판 승부 (A dorian/minor, 176 bpm). Sporty versus tune: a tresillo
  // octave bass, a hooky "da-da . DA" lead with a soft triangle an octave below, and
  // three sections — A riff (Am–D vamp), B climb (F–G–Em–Am…), C 3+3+2 breakdown with a
  // pedal-octave arpeggio — then a snare roll back to the top. 24 bars, loops.
  const TB1 = 'R 8 . R 8 . R 8';                      // tresillo octaves
  const TB2 = 'R R . R 8 R . 5';
  const TB3 = 'R - - R - - 8 -';                      // follows the 3+3+2 lead
  const TCA = '. x . . x . x .';
  const TCB = 'x - . x - . x .';
  const TCC = 'x - - x - - x -';
  const TCT = 'x . x . x x x x';                      // turnaround stabs
  const TAR = 'R 8 5 8 3 8 5 8 R 8 5 8 3 8 5 8';      // pedal-octave 16ths
  const TA = 'k.hhs.hhk.hks.hh';
  const TC = 'c.hhs.hhk.hks.hh';
  const TBD = 'k.o.s.okk.o.s.ok';
  const TF = 'k.hhs.hhk.ttt.ss';
  const TR = 'k.hhs.hhs.ssssss';
  const TH = 'k..hs.h.k.hhs..h';                      // breakdown
  const BATTLE = {
    bpm: 176, swing: 0, bars: 24, loop: true,
    chords: 'Am Am D D Am Am D D F F G G Am Am E7 E7  F F G G Em Em Am Am Dm Dm G G E7 E7 E7 E7  ' +
      'C C G G Am Am Em Em F F C C Dm Dm E7 E7',
    lead: {
      w: 'p25', v: 0.1, vib: 1, echo: { w: 'p12', v: 0.03, d: 3 },
      dbl: { iv: -12, w: 'triangle', v: 0.07 },
      bars: [
        'E5 E5 . A5 . E5 G5 .', 'F#5 - E5 D5 . A4 D5 .', 'E5 E5 . A5 . E5 C6 .', 'B5 - A5 F#5 . D5 E5 F#5',
        'A5 . F5 A5 C6 - A5 .', 'B5 . G5 B5 D6 - B5 .', 'C6 - B5 A5 E5 . A5 C6', 'B5 - G#5 E5 B4 - D5 .',
        'C6 . A5 . F5 . A5 C6', 'D6 . B5 . G5 . B5 D6', 'E6 - D6 B5 G5 - E5 G5', 'A5 - - E5 A5 - C6 .',
        'D6 - C6 A5 F5 . A5 .', 'B5 - A5 G5 D5 . G5 B5', 'G#5 - B5 - D6 - E6 -', 'D6 . B5 G#5 E5 - - .',
        'E5 - - G5 - - C6 -', 'B5 - - D6 - - G5 -', 'C6 - - E6 - - A5 -', 'B5 - - G5 - - E5 -',
        'A5 - - C6 - - F6 -', 'E6 - - C6 - - G5 -', 'F5 - A5 - D6 - F6 -', 'E6 - D6 - B5 - G#5 -',
      ],
    },
    bass: {
      w: 'square', lp: 1100, q: 2, base: 36, v: 0.13,
      bars: rep(TB1, 7).concat(['R 8 R 8 5 8 7 8'], rep(TB2, 7), ['R R 8 R 7 5 3 5'], rep(TB3, 7), ['R 8 7 8 5 8 3 5']),
    },
    comp: { v: 0.022, bars: rep(TCA, 7).concat([TCT], rep(TCB, 7), [TCT], rep(TCC, 7), [TCT]) },
    arp: { w: 'p12', v: 0.026, res: 1, base: 64, bars: rep(A0, 4).concat(rep(TAR, 4), rep(A0, 6), rep(TAR, 10)) },
    drums: { v: 0.95, bars: [TC, TA, TA, TA, TA, TA, TA, TF, TC, TBD, TBD, TBD, TBD, TBD, TBD, TF, TC, TH, TH, TH, TH, TH, TH, TR] },
  };

  // 'podium' — 시상식 (Eb major, 160 bpm), plays once: a snare roll on the dominant while
  // the podium rises, a "da da-da" pickup, then a I–IV / ii–V fanfare that lands on a
  // held tonic with a crash and a twinkling arpeggio. ~6 s.
  const PODIUM = {
    bpm: 160, swing: 0, bars: 4, loop: false,
    chords: 'Bb7 Bb7 Eb Ab Fm7 Bb7 Eb Eb',
    lead: {
      w: 'p25', v: 0.12, res: 1, vib: 1, echo: { w: 'p12', v: 0.035, d: 3 },
      bars: [
        '. . . . . . . . . . . . Bb4 . Bb4 Bb4',
        'Eb5 - - . G5 - Bb5 - Eb6 - - . C6 - Ab5 -',
        'F5 - Ab5 - C6 - - . D6 - - . F6 - D6 -',
        'Eb6 - - - - - - - - - - - . . . .',
      ],
    },
    bass: { v: 0.26, bars: ['Bb2 - - - - - . .', 'Eb3 . Eb2 . Ab2 . Ab2 .', 'F2 . F3 . Bb2 . Bb2 .', 'Eb2 - - - - - . .'] },
    comp: { v: 0.026, bars: ['. . . . . . x x', 'x . x . x . x .', 'x . x . x . x .', 'x - - - - - . .'] },
    arp: {
      w: 'p12', v: 0.028, res: 1, base: 75,
      bars: [A0, A0, '. . . . . . . . R 3 5 8 R 3 5 8', '8 5 8 5 8 5 8 5 . . . . . . . .'],
    },
    drums: { v: 0.8, bars: ['s.s.s.s.ssssssss', 'c...s...k.k.s...', 'k...s...k.k.s.ss', 'c...............'] },
  };

  /* ------------------------------------------------------------------------
     Song compiler: turns the notation above into per-tick event lists.
     ------------------------------------------------------------------------ */
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const QUAL = {
    '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11],
    dim: [0, 3, 6], sus4: [0, 5, 7], aug: [0, 4, 8], '6': [0, 4, 7, 9],
  };
  const acc = (s) => (s === '#' ? 1 : s === 'b' ? -1 : 0);

  function noteMidi(tok) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(tok);
    return m ? 12 * (Number(m[3]) + 1) + PC[m[1]] + acc(m[2]) : null;
  }
  function parseChord(s) {
    const m = /^([A-G])(#|b)?(.*)$/.exec(s);
    if (!m || !QUAL[m[3]]) throw new Error('bad chord ' + s);
    return { root: (PC[m[1]] + acc(m[2]) + 12) % 12, iv: QUAL[m[3]] };
  }
  const inRange = (pc, lo) => lo + ((pc - (lo % 12) + 24) % 12);

  function compile(def) {
    const len = def.bars * 16;
    const loopStart = def.loop && def.loopAt ? def.loopAt * 16 : 0;
    if (!(loopStart >= 0 && loopStart < len)) throw new Error('bad loopAt');
    const ev = new Array(len);
    // events past the end wrap to the loop point (echo tails of the last bar)
    const push = (tick, e) => {
      const k = tick < len ? tick : loopStart + ((tick - len) % (len - loopStart));
      (ev[k] || (ev[k] = [])).push(e);
    };
    const chords = def.chords.trim().split(/\s+/).map(parseChord);
    if (chords.length !== def.bars * 2) throw new Error('chords: ' + chords.length + ', expected ' + def.bars * 2);
    const chordAt = (tick) => chords[Math.floor(tick / 8) % chords.length];
    // chord-relative tokens (bass / arp); the root sits in [base, base+11]
    const relative = (base) => (tk, ch) => {
      const n = noteMidi(tk);
      if (n != null) return n;
      const r = inRange(ch.root, base);
      switch (tk) {
        case 'R': return r;
        case '3': return r + ch.iv[1];
        case '5': return r + ch.iv[2];
        case '6': return r + 9;
        case '7': return r + (ch.iv[3] || 10);
        case '8': return r + 12;
        default: return null;
      }
    };

    function melodic(part, c, map) {
      const res = part.res || 2;
      const toks = part.bars.join(' ').trim().split(/\s+/);
      if (toks.length * res !== len) throw new Error(c + ': ' + toks.length + ' steps, expected ' + len / res);
      const out = [];
      for (let i = 0; i < toks.length; i++) {
        const tk = toks[i];
        if (tk === '-' || tk === '.') continue;
        let j = i + 1;
        while (j < toks.length && toks[j] === '-') j++;
        const tick = i * res;
        const m = map(tk, chordAt(tick));
        if (m == null) throw new Error(c + ': bad token ' + tk);
        const e = { c, m: Array.isArray(m) ? m : [m], d: (j - i) * res };
        push(tick, e);
        out.push([tick, e]);
      }
      return out;
    }

    const leadNotes = melodic(def.lead, 'lead', (tk) => noteMidi(tk));
    const echo = def.lead.echo;
    if (echo) {
      for (const [tick, e] of leadNotes) {
        if (def.loop || tick + echo.d < len) push(tick + echo.d, { c: 'echo', m: e.m, d: e.d });
      }
    }
    const dbl = def.lead.dbl;
    if (dbl) for (const [tick, e] of leadNotes) push(tick, { c: 'dbl', m: e.m.map((m) => m + (dbl.iv || 0)), d: e.d });
    melodic(def.bass, 'bass', relative(def.bass.base || 40)); // default root E2..D#3
    melodic(def.comp, 'comp', (tk, ch) => {
      if (tk !== 'x') return null;
      const pcs = ch.iv.length > 3 ? ch.iv.slice(1, 4) : ch.iv; // drop the root on 7th chords (bass has it)
      return pcs.map((iv) => inRange((ch.root + iv) % 12, 55)).sort((a, b) => a - b); // G3..F#4
    });
    if (def.arp) melodic(def.arp, 'arp', relative(def.arp.base || 60));
    const dr = def.drums.bars.join('').replace(/\s+/g, '');
    if (dr.length !== len) throw new Error('drums: ' + dr.length + ' ticks, expected ' + len);
    for (let i = 0; i < dr.length; i++) {
      const ch = dr[i];
      if (ch === '.') continue;
      if ('kshoctbw'.indexOf(ch) < 0) throw new Error('drums: bad char ' + ch);
      push(i, { c: 'drum', m: ch, d: 1 });
    }

    // optional envelope override {s, dc, r, am, ar}; null keeps the default voicing
    const envOf = (e) => (e ? { s: e.s, dc: e.dc, r: e.r, am: e.am || 0, ar: e.ar || 0 } : null);
    const leadEnv = envOf(def.lead.env);
    return {
      bpm: def.bpm, swing: def.swing || 0, loop: !!def.loop, loopStart, transpose: def.transpose || 0, len, ev,
      inst: {
        lead: { w: def.lead.w || 'p25', v: def.lead.v, vib: !!def.lead.vib, env: leadEnv },
        echo: echo ? { w: echo.w || 'p12', v: echo.v, env: leadEnv } : null,
        dbl: dbl ? { w: dbl.w || 'p12', v: dbl.v, lp: dbl.lp || 0 } : null,
        bass: { w: def.bass.w || 'triangle', v: def.bass.v, lp: def.bass.lp || 0, q: def.bass.q || 1 },
        comp: { w: def.comp.w || 'square', v: def.comp.v, env: envOf(def.comp.env) },
        arp: def.arp ? { w: def.arp.w || 'p12', v: def.arp.v } : null,
        drum: { v: def.drums.v },
      },
    };
  }

  const SONGS = {};
  const DEFS = {
    title: TITLE, main: MAIN, hurry: HURRY, clear: CLEAR, gameover: GAMEOVER, ending: ENDING,
    boss: BOSS, final: FINAL, victory: VICTORY,
    lobby: LOBBY, battle: BATTLE, podium: PODIUM, party: PARTY, chair: CHAIR,
  };
  for (const k of Object.keys(DEFS)) {
    try { SONGS[k] = compile(DEFS[k]); } catch (e) { try { console.warn('[audio] song ' + k + ': ' + e.message); } catch (e2) { /* ignore */ } }
  }

  /* ------------------------------------------------------------------------
     State
     ------------------------------------------------------------------------ */
  let ctx = null, master = null, limiter = null, musicBus = null, sfxBus = null, noiseBuf = null;
  const waves = {};
  let unlocked = false;
  let muted = readMuted();
  let cur = null;          // { name, song, gain, pos, next, tickDur, ended, endAt }
  let fading = [];         // [{ gain, until }]
  let pending = null;      // looping track requested before unlock
  let timer = null;
  let lastSfx = {};
  let sfxLive = [];        // end times of sound effects still ringing (voice cap)
  let sfxEnd = 0;          // latest end time of the sfx being built
  let listening = false;

  function readMuted() {
    try { return W.localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; }
  }
  function writeMuted(v) {
    try { W.localStorage.setItem(MUTE_KEY, v ? '1' : '0'); } catch (e) { /* ignore */ }
  }
  function ready() { return !!(ctx && unlocked && ctx.state !== 'closed'); }
  function settle(p) { if (p && typeof p.catch === 'function') p.catch(noop); }

  /* ------------------------------------------------------------------------
     Context + graph:  music/sfx buses -> limiter (compressor) -> master -> out
     ------------------------------------------------------------------------ */
  function create() {
    const AC = W.AudioContext || W.webkitAudioContext;
    if (typeof AC !== 'function') return false;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) {
      try { ctx = new AC(); } catch (e2) { ctx = null; return false; }
    }
    try {
      limiter = ctx.createDynamicsCompressor();
      const setP = (p, v) => { if (p) { try { p.value = v; } catch (e) { /* ignore */ } } };
      setP(limiter.threshold, -12); setP(limiter.knee, 10); setP(limiter.ratio, 3.5);
      setP(limiter.attack, 0.004); setP(limiter.release, 0.22);
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER_VOL;
      limiter.connect(master);
      master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = MUSIC_VOL; musicBus.connect(limiter);
      sfxBus = ctx.createGain(); sfxBus.gain.value = SFX_VOL; sfxBus.connect(limiter);

      const sr = ctx.sampleRate || 44100;
      noiseBuf = ctx.createBuffer(1, Math.floor(sr), sr);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      waves.p12 = pulseWave(0.125);
      waves.p25 = pulseWave(0.25);

      // iOS: playing a silent buffer inside the gesture fully unlocks output.
      const sb = ctx.createBufferSource();
      sb.buffer = ctx.createBuffer(1, 1, sr);
      sb.connect(ctx.destination);
      sb.start(0);
    } catch (e) {
      try { settle(ctx.close()); } catch (e2) { /* ignore */ }
      ctx = null;
      return false;
    }
    return true;
  }

  function pulseWave(duty) {
    try {
      if (typeof ctx.createPeriodicWave !== 'function') return null;
      const N = 48;
      const re = new Float32Array(N), im = new Float32Array(N);
      for (let n = 1; n < N; n++) {
        re[n] = Math.sin(2 * Math.PI * n * duty) / (Math.PI * n);
        im[n] = (1 - Math.cos(2 * Math.PI * n * duty)) / (Math.PI * n);
      }
      return ctx.createPeriodicWave(re, im);
    } catch (e) { return null; }
  }
  function setWave(osc, w) {
    if (w === 'p12' || w === 'p25') {
      const pw = waves[w];
      if (pw && typeof osc.setPeriodicWave === 'function') { osc.setPeriodicWave(pw); return; }
      osc.type = 'square';
      return;
    }
    osc.type = w || 'square';
  }

  /* ------------------------------------------------------------------------
     Synth voices
     ------------------------------------------------------------------------ */
  // attack -> decay toward sustain -> release at t+d (exponential tails, no clicks).
  // The param's own value is zeroed first: a fresh GainNode defaults to 1, and Chrome can render
  // a source's first (sub-sample) frame before the setValueAtTime(0, t) below applies, which
  // leaked one full-scale noise sample per drum hit (an audible tick).
  function env(p, t, d, v, a, dc, s, r) {
    const ta = t + Math.min(a, d);
    p.value = 0;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(v, ta);
    p.setTargetAtTime(v * s, ta, Math.max(0.002, dc / 3));
    p.setTargetAtTime(0, t + d, Math.max(0.002, r / 5));
  }

  // exponential ramps through [[dt, value], ...] (dt ascending, value > 0) starting after t
  function path(p, t, pts) {
    for (const [dt, v] of pts) p.exponentialRampToValueAtTime(v, t + dt);
  }

  // o: { w, f, f2?, sl?, lin?, fp?, t, d, v, a, dc, s, r, vib?, vr?, vd?, lp?, lp2?, lpp?, q?, am?, ar? }
  //   fp  = pitch path [[dt, Hz], ...] (instead of f2)    lpp = low-pass path (instead of lp2)
  //   am  = amplitude-wobble depth 0..0.5 at ar Hz (growls, rattles)
  function voice(dest, o) {
    const t = o.t, d = Math.max(0.01, o.d);
    const a = o.a != null ? o.a : 0.005, dc = o.dc != null ? o.dc : 0.08;
    const s = o.s != null ? o.s : 0.7, r = o.r != null ? o.r : 0.05;
    const end = t + d + r + 0.03;
    const osc = ctx.createOscillator();
    setWave(osc, o.w);
    osc.frequency.setValueAtTime(o.f, t);
    if (o.fp) path(osc.frequency, t, o.fp);
    else if (o.f2) {
      const st = t + (o.sl || d);
      if (o.lin) osc.frequency.linearRampToValueAtTime(o.f2, st);
      else osc.frequency.exponentialRampToValueAtTime(o.f2, st);
    }
    const g = ctx.createGain();
    env(g.gain, t, d, o.v, a, dc, s, r);
    let src = osc;
    if (o.lp) {
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(o.lp, t);
      if (o.lpp) path(flt.frequency, t, o.lpp);
      else if (o.lp2) flt.frequency.exponentialRampToValueAtTime(o.lp2, t + d);
      flt.Q.value = o.q || 1;
      osc.connect(flt);
      src = flt;
    }
    if (o.am) {
      const am = Math.min(0.5, o.am);
      const tg = ctx.createGain();
      tg.gain.value = 1 - am;               // LFO swings the gain between 1 - 2am and 1
      const al = ctx.createOscillator();
      al.type = 'sine';
      al.frequency.value = o.ar || 20;
      const ag = ctx.createGain();
      ag.gain.value = am;
      al.connect(ag);
      ag.connect(tg.gain);
      src.connect(tg);
      src = tg;
      al.start(t);
      al.stop(end);
    }
    src.connect(g);
    g.connect(dest);
    if (o.vib) {
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = o.vr || 6;
      const lg = ctx.createGain();
      lg.gain.value = 0;
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(o.f * o.vib, t + (o.vd || 0.01));
      lfo.connect(lg);
      lg.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(end);
    }
    osc.start(t);
    osc.stop(end);
    osc.onended = () => { try { g.disconnect(); } catch (e) { /* ignore */ } };
    if (dest === sfxBus && end > sfxEnd) sfxEnd = end;
    return end;
  }

  // o: { t, d, v, ft, f, f2?, q?, a, dc, s, r }
  function noise(dest, o) {
    const t = o.t, d = Math.max(0.01, o.d);
    const r = o.r != null ? o.r : 0.03;
    const end = t + d + r + 0.03;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = o.ft || 'highpass';
    flt.frequency.setValueAtTime(o.f || 1000, t);
    if (o.f2) flt.frequency.exponentialRampToValueAtTime(o.f2, t + d);
    flt.Q.value = o.q || 0.7;
    const g = ctx.createGain();
    env(g.gain, t, d, o.v, o.a != null ? o.a : 0.002, o.dc != null ? o.dc : d, o.s != null ? o.s : 0, r);
    src.connect(flt);
    flt.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 0.9);
    src.stop(end);
    src.onended = () => { try { g.disconnect(); } catch (e) { /* ignore */ } };
    if (dest === sfxBus && end > sfxEnd) sfxEnd = end;
    return end;
  }

  const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* ------------------------------------------------------------------------
     Drum kit
     ------------------------------------------------------------------------ */
  function kick(dest, t, v) {
    voice(dest, { w: 'sine', f: 155, f2: 42, sl: 0.09, t, d: 0.17, v: 0.6 * v, a: 0.001, s: 0, dc: 0.15, r: 0.02 });
  }
  function drum(dest, ch, t, v) {
    switch (ch) {
      case 'k': kick(dest, t, v); break;
      case 's':
        noise(dest, { t, d: 0.13, v: 0.2 * v, ft: 'highpass', f: 1300, s: 0, dc: 0.11, r: 0.02 });
        voice(dest, { w: 'triangle', f: 250, f2: 150, sl: 0.05, t, d: 0.07, v: 0.16 * v, a: 0.001, s: 0, dc: 0.06, r: 0.02 });
        break;
      case 'h': noise(dest, { t, d: 0.035, v: 0.07 * v, ft: 'highpass', f: 7500, s: 0, dc: 0.03, r: 0.01 }); break;
      case 'o': noise(dest, { t, d: 0.16, v: 0.06 * v, ft: 'highpass', f: 6500, s: 0, dc: 0.12, r: 0.03 }); break;
      case 'c':
        kick(dest, t, v);
        noise(dest, { t, d: 0.9, v: 0.08 * v, ft: 'highpass', f: 4200, s: 0, dc: 0.6, r: 0.1 });
        break;
      case 't': voice(dest, { w: 'triangle', f: 196, f2: 92, sl: 0.16, t, d: 0.2, v: 0.34 * v, a: 0.002, s: 0, dc: 0.18, r: 0.03 }); break;
      case 'b': // wooden bath bucket knocked on the tiles ("똑")
        voice(dest, { w: 'triangle', f: 980, f2: 690, sl: 0.03, t, d: 0.05, v: 0.22 * v, a: 0.001, s: 0, dc: 0.045, r: 0.02 });
        noise(dest, { t, d: 0.012, v: 0.05 * v, ft: 'bandpass', f: 2600, q: 2, s: 0, dc: 0.012, r: 0.005 });
        break;
      case 'w': // a drop falling from the ceiling into the bath ("퐁")
        voice(dest, { w: 'sine', f: 1150, f2: 1950, sl: 0.035, t, d: 0.05, v: 0.11 * v, a: 0.002, s: 0.2, dc: 0.04, r: 0.03 });
        break;
      default: break;
    }
  }

  /* ------------------------------------------------------------------------
     Music scheduler
     ------------------------------------------------------------------------ */
  function playEvent(tr, e, t) {
    const song = tr.song, dest = tr.gain, dur = e.d * tr.tickDur, tp = song.transpose;
    switch (e.c) {
      case 'lead':
      case 'echo': {
        const ins = song.inst[e.c];
        if (!ins) return;
        const nd = e.d <= 2 ? dur * 0.78 : dur - 0.03;
        const vib = e.c === 'lead' && ins.vib && dur > 0.3 ? 0.012 : 0;
        const en = ins.env;
        for (const m of e.m) {
          if (en) voice(dest, { w: ins.w, f: mf(m + tp), t, d: nd, v: ins.v, a: 0.006, dc: en.dc, s: en.s, r: en.r, vib, vr: 5.5, vd: 0.15, am: en.am, ar: en.ar });
          else voice(dest, { w: ins.w, f: mf(m + tp), t, d: nd, v: ins.v, a: 0.006, dc: 0.12, s: 0.7, r: 0.07, vib, vr: 5.5, vd: 0.15 });
        }
        break;
      }
      case 'dbl': {
        const ins = song.inst.dbl;
        if (!ins) return;
        const nd = e.d <= 2 ? dur * 0.78 : dur - 0.03;
        for (const m of e.m) {
          voice(dest, { w: ins.w, f: mf(m + tp), t, d: nd, v: ins.v, a: 0.008, dc: 0.15, s: 0.75, r: 0.07, lp: ins.lp, q: 1 });
        }
        break;
      }
      case 'bass': {
        const ins = song.inst.bass;
        voice(dest, { w: ins.w, f: mf(e.m[0] + tp), t, d: Math.max(0.05, dur * 0.9), v: ins.v, a: 0.004, dc: 0.2, s: 0.8, r: 0.04, lp: ins.lp, q: ins.q });
        break;
      }
      case 'comp': {
        const ins = song.inst.comp, en = ins.env;
        const nd = e.d <= 2 ? dur * 0.55 : dur * 0.95;
        for (const m of e.m) {
          if (en) voice(dest, { w: ins.w, f: mf(m + tp), t, d: nd, v: ins.v, a: 0.004, dc: en.dc, s: en.s, r: en.r, am: en.am, ar: en.ar });
          else voice(dest, { w: ins.w, f: mf(m + tp), t, d: nd, v: ins.v, a: 0.004, dc: 0.07, s: 0.5, r: 0.04 });
        }
        break;
      }
      case 'arp': {
        const ins = song.inst.arp;
        if (!ins) return;
        voice(dest, { w: ins.w, f: mf(e.m[0] + tp), t, d: Math.max(0.03, dur * 0.6), v: ins.v, a: 0.002, dc: 0.05, s: 0.45, r: 0.03 });
        break;
      }
      case 'drum': drum(dest, e.m, t, song.inst.drum.v); break;
      default: break;
    }
  }

  function startTrack(name) {
    const song = SONGS[name];
    if (!song || !ctx) return;
    const g = ctx.createGain();
    g.gain.value = 1;
    g.connect(musicBus);
    cur = { name, song, gain: g, pos: 0, next: ctx.currentTime + 0.06, tickDur: 60 / song.bpm / 4, ended: false, endAt: 0 };
    ensureTimer();
  }

  function stopCurrent() {
    if (!cur) return;
    const g = cur.gain;
    cur = null;
    try {
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + FADE);
      fading.push({ gain: g, until: now + FADE + LOOKAHEAD + 1.2 });
    } catch (e) {
      try { g.disconnect(); } catch (e2) { /* ignore */ }
    }
    ensureTimer();
  }

  function ensureTimer() {
    if (!timer) timer = setInterval(pump, TICK_MS);
  }
  function stopTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function pump() {
    try {
      if (!ctx || ctx.state === 'closed') { stopTimer(); return; }
      const now = ctx.currentTime;
      const tr = cur;
      if (tr) {
        // Timers throttled (background/occluded tab): skip ahead instead of bursting old notes.
        if (tr.next < now - 0.2) tr.next = now + 0.03;
        const beat = tr.tickDur * 4;
        while (!tr.ended && tr.next < now + LOOKAHEAD) {
          const sw = tr.song.swing && tr.pos % 4 >= 2 ? tr.song.swing * beat / 6 : 0;
          if (!muted) {
            const evs = tr.song.ev[tr.pos];
            if (evs) for (const e of evs) playEvent(tr, e, tr.next + sw);
          }
          tr.pos++;
          tr.next += tr.tickDur;
          if (tr.pos >= tr.song.len) {
            if (tr.song.loop) tr.pos = tr.song.loopStart || 0; // intro bars play once
            else { tr.ended = true; tr.endAt = tr.next + 1.2; }
          }
        }
        if (tr.ended && now > tr.endAt) {
          try { tr.gain.disconnect(); } catch (e) { /* ignore */ }
          if (cur === tr) cur = null;
        }
      }
      if (fading.length) {
        fading = fading.filter((f) => {
          if (now < f.until) return true;
          try { f.gain.disconnect(); } catch (e) { /* ignore */ }
          return false;
        });
      }
      if (!cur && !fading.length) stopTimer();
    } catch (e) { /* never throw from the timer */ }
  }

  /* ------------------------------------------------------------------------
     Sound effects (t = start time)
     ------------------------------------------------------------------------ */
  const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28];
  // v4 kit sounds whose o.n picks a variant: [lo, hi, default]; the n is clamped into lo..hi
  const VARIANTS = { slide: [1, 3, 1], hop: [1, 2, 1], b_echo: [0, 1, 0], b_yarn: [0, 1, 0], b_egg: [0, 1, 0], tro_fly: [0, 5, 0],
    // (v4 뽑기, design/gacha.md 9: the crank 0 one turn / 1 two / 2 the knock alone; a capsule landing 0 with its bounce /
    // 1 without; a capsule opening 0..9 semitones up; the fanfare 2 희귀 / 3 전설)
    gacha_roll: [0, 2, 0], gacha_drop: [0, 1, 0], gacha_pop: [0, 9, 0], gacha_win: [2, 3, 2],
    // (파티 새 게임, party-games 9.2: 펑's puff 0..10, the bubble's size in tens of %; party-games-2 10.2: 수도꼭지's
    // four faucets 0..3)
    puff: [0, 10, 0], tap: [0, 3, 0] };
  function variant(name, o) {
    const v = VARIANTS[name];
    return Math.max(v[0], Math.min(v[1], (o && o.n) | 0 || v[2]));
  }
  // v4: the first pop of a player-owned bubble, one per animal (pop o.n = 1..6, the char index).
  // Each sits at or a little under the plain pop's level; a guest receives n as 1..99, and 7..99 is the plain pop.
  const POP_KIT = [null,
    // 1 꽥꽥이: rubber-duck squeak
    (t) => {
      voice(sfxBus, { w: 'p25', f: 900, f2: 2000, sl: 0.04, t, d: 0.06, v: 0.19, a: 0.002, dc: 0.05, s: 0.4, r: 0.03 });
    },
    // 2 까삐: a soft, round onsen "뽀옹" with a muffled puff of foam
    (t) => {
      voice(sfxBus, { w: 'sine', f: 300, f2: 160, t, d: 0.1, v: 0.24, a: 0.003, dc: 0.08, s: 0.4, r: 0.04 });
      noise(sfxBus, { t, d: 0.08, v: 0.08, ft: 'lowpass', f: 900, a: 0.004, s: 0, dc: 0.08, r: 0.03 });
    },
    // 3 해롱이 "퐁": a falling water drop and a splash of droplets
    (t) => {
      voice(sfxBus, { w: 'sine', f: 900, f2: 420, t, d: 0.08, v: 0.24, a: 0.002, dc: 0.06, s: 0.35, r: 0.03 });
      noise(sfxBus, { t, d: 0.04, v: 0.08, ft: 'bandpass', f: 1500, q: 1.2, s: 0, dc: 0.04, r: 0.01 });
    },
    // 4 펭펭 "쨍": an icy C7 + G7 clink with a glassy tick
    (t) => {
      voice(sfxBus, { w: 'triangle', f: 2093, t, d: 0.08, v: 0.13, a: 0.001, dc: 0.08, s: 0, r: 0.04 });
      voice(sfxBus, { w: 'triangle', f: 3136, t, d: 0.08, v: 0.08, a: 0.001, dc: 0.07, s: 0, r: 0.04 });
      noise(sfxBus, { t, d: 0.03, v: 0.06, ft: 'highpass', f: 6000, s: 0, dc: 0.03, r: 0.01 });
    },
    // 5 냥냥: a wobbly upward mew-blip
    (t) => {
      voice(sfxBus, { w: 'p25', f: 760, f2: 1500, t, d: 0.07, v: 0.18, vib: 0.05, vr: 22, vd: 0.01, a: 0.002, dc: 0.05, s: 0.5, r: 0.03 });
    },
    // 6 깨굴이 "뽁": a tight jelly pop, then a low croak-bloop
    (t) => {
      voice(sfxBus, { w: 'sine', f: 800, f2: 1600, t, d: 0.03, v: 0.22, a: 0.001, dc: 0.025, s: 0.3, r: 0.015 });
      voice(sfxBus, { w: 'square', f: 190, f2: 130, t: t + 0.02, d: 0.04, v: 0.09, a: 0.002, dc: 0.03, s: 0.4, r: 0.02 });
    },
  ];
  const SFX = {
    jump(t) {
      voice(sfxBus, { w: 'p25', f: 300, f2: 760, sl: 0.11, t, d: 0.12, v: 0.2, a: 0.004, dc: 0.1, s: 0.6, r: 0.04 });
    },
    // soft "puh" of blowing a soap bubble
    shoot(t) {
      noise(sfxBus, { t, d: 0.11, v: 0.24, ft: 'bandpass', f: 1400, f2: 450, q: 1.4, a: 0.006, dc: 0.09, s: 0.3, r: 0.04 });
      voice(sfxBus, { w: 'sine', f: 250, f2: 150, t, d: 0.09, v: 0.22, a: 0.004, dc: 0.06, s: 0.4, r: 0.03 });
    },
    // wobbly bloop: enemy caught in a bubble
    capture(t) {
      voice(sfxBus, { w: 'sine', f: 320, f2: 190, sl: 0.06, t, d: 0.06, v: 0.2, s: 0.6, r: 0.02 });
      voice(sfxBus, { w: 'triangle', f: 230, f2: 620, sl: 0.22, t: t + 0.06, d: 0.24, v: 0.26, vib: 0.09, vr: 17, vd: 0.02, s: 0.7, r: 0.06 });
      voice(sfxBus, { w: 'sine', f: 460, f2: 1240, sl: 0.22, t: t + 0.06, d: 0.2, v: 0.06, vib: 0.09, vr: 17, vd: 0.02, s: 0.6, r: 0.05 });
    },
    // bright plip; o.n = 1..6 plays that animal's pop instead (POP_KIT above)
    pop(t, o) {
      const kit = POP_KIT[(o && o.n) | 0];
      if (kit) { kit(t); return; }
      voice(sfxBus, { w: 'sine', f: 720, f2: 1800, sl: 0.045, t, d: 0.06, v: 0.26, a: 0.002, dc: 0.05, s: 0.3, r: 0.03 });
      noise(sfxBus, { t, d: 0.03, v: 0.07, ft: 'highpass', f: 3500, s: 0, dc: 0.03, r: 0.01 });
    },
    // chain pops climb a pentatonic ladder with opts.n
    chain(t, o) {
      const n = Math.max(1, Math.min(40, (o && o.n) | 0 || 1));
      const f = 523.25 * Math.pow(2, LADDER[Math.min(n, LADDER.length) - 1] / 12);
      voice(sfxBus, { w: 'sine', f: f * 0.7, f2: f * 1.4, sl: 0.04, t, d: 0.05, v: 0.2, a: 0.002, dc: 0.04, s: 0.3, r: 0.02 });
      voice(sfxBus, { w: 'p12', f, t: t + 0.02, d: 0.07, v: 0.15, a: 0.003, dc: 0.06, s: 0.5, r: 0.04 });
      voice(sfxBus, { w: 'triangle', f: f * 2, t: t + 0.06, d: 0.1 + Math.min(n, 8) * 0.012, v: 0.12, a: 0.003, dc: 0.08, s: 0.3, r: 0.06 });
      if (n >= 4) voice(sfxBus, { w: 'triangle', f: f * 3, t: t + 0.1, d: 0.09, v: 0.05, s: 0.3, r: 0.05 });
      noise(sfxBus, { t, d: 0.025, v: 0.06, ft: 'highpass', f: 4000, s: 0, dc: 0.025, r: 0.01 });
    },
    // knocked-out enemy spinning away
    kill(t) {
      voice(sfxBus, { w: 'p25', f: 1400, f2: 180, sl: 0.28, t, d: 0.3, v: 0.15, vib: 0.06, vr: 28, vd: 0.01, s: 0.8, dc: 0.2, r: 0.05 });
      noise(sfxBus, { t, d: 0.07, v: 0.15, ft: 'lowpass', f: 2400, s: 0, dc: 0.07, r: 0.01 });
    },
    // coin-like ding (a fifth up, with shimmer)
    item(t) {
      voice(sfxBus, { w: 'p25', f: 1046.5, t, d: 0.055, v: 0.17, s: 0.9, r: 0.01 });
      voice(sfxBus, { w: 'p25', f: 1568, t: t + 0.06, d: 0.22, v: 0.17, a: 0.003, dc: 0.2, s: 0.3, r: 0.08 });
      voice(sfxBus, { w: 'sine', f: 3136, t: t + 0.06, d: 0.15, v: 0.06, s: 0.2, dc: 0.1, r: 0.05 });
    },
    // extra life fanfare: C - F - G - C
    extend(t) {
      const lead = [[0, 72, 0.08], [0.09, 76, 0.08], [0.18, 79, 0.08], [0.27, 84, 0.2], [0.5, 81, 0.1], [0.62, 83, 0.1], [0.74, 84, 0.55]];
      const harm = [[0.27, 79, 0.2], [0.5, 77, 0.1], [0.62, 79, 0.1], [0.74, 76, 0.55]];
      const bass = [[0, 48, 0.25], [0.27, 48, 0.2], [0.5, 41, 0.1], [0.62, 43, 0.1], [0.74, 36, 0.55]];
      for (const [dt, m, d] of lead) voice(sfxBus, { w: 'p25', f: mf(m), t: t + dt, d, v: 0.12, s: 0.75, r: 0.05, vib: d > 0.3 ? 0.015 : 0, vr: 6, vd: 0.12 });
      for (const [dt, m, d] of harm) voice(sfxBus, { w: 'p12', f: mf(m), t: t + dt, d, v: 0.06, s: 0.7, r: 0.05 });
      for (const [dt, m, d] of bass) voice(sfxBus, { w: 'triangle', f: mf(m), t: t + dt, d, v: 0.24, s: 0.8, r: 0.05 });
      noise(sfxBus, { t: t + 0.74, d: 0.6, v: 0.05, ft: 'highpass', f: 5000, s: 0, dc: 0.5, r: 0.1 });
    },
    // descending "wah"
    die(t) {
      voice(sfxBus, { w: 'p25', f: 880, f2: 440, sl: 0.08, t, d: 0.08, v: 0.13, s: 0.8, r: 0.02 });
      voice(sfxBus, { w: 'sawtooth', f: 620, f2: 105, sl: 0.95, t: t + 0.1, d: 0.95, v: 0.14, vib: 0.04, vr: 7, vd: 0.05, lp: 2800, lp2: 350, q: 5, a: 0.01, dc: 0.4, s: 0.8, r: 0.12 });
    },
    // alarm blips
    hurry(t) {
      for (let i = 0; i < 6; i++) voice(sfxBus, { w: 'p25', f: i % 2 ? 988 : 1318.5, t: t + i * 0.1, d: 0.075, v: 0.12, s: 0.9, r: 0.01 });
    },
    // "squeaky clean" sparkle
    clear(t) {
      voice(sfxBus, { w: 'triangle', f: 1046.5, f2: 2093, sl: 0.14, lin: true, t, d: 0.16, v: 0.2, s: 0.6, r: 0.05 });
      voice(sfxBus, { w: 'triangle', f: 1568, f2: 3136, sl: 0.14, lin: true, t: t + 0.1, d: 0.18, v: 0.16, s: 0.5, r: 0.08 });
      noise(sfxBus, { t, d: 0.3, v: 0.04, ft: 'highpass', f: 7000, s: 0.3, dc: 0.2, r: 0.05 });
    },
    // springy boing off a bubble
    bounce(t) {
      voice(sfxBus, { w: 'triangle', f: 170, f2: 470, sl: 0.1, t, d: 0.15, v: 0.3, vib: 0.08, vr: 22, vd: 0.04, s: 0.6, r: 0.04 });
      voice(sfxBus, { w: 'p12', f: 340, f2: 940, sl: 0.1, t, d: 0.07, v: 0.04, s: 0.5, r: 0.02 });
    },
    // steam blast whoosh
    steam(t) {
      noise(sfxBus, { t, d: 0.5, v: 0.32, ft: 'bandpass', f: 500, f2: 2800, q: 0.9, a: 0.03, dc: 0.3, s: 0.7, r: 0.2 });
      voice(sfxBus, { w: 'sine', f: 95, f2: 55, t, d: 0.4, v: 0.18, s: 0.6, r: 0.1 });
      noise(sfxBus, { t: t + 0.05, d: 0.35, v: 0.07, ft: 'highpass', f: 5000, s: 0.5, dc: 0.2, r: 0.1 });
    },
    // bathhouse door bell "띵-동"
    start(t) {
      const bell = (tt, f, d) => {
        voice(sfxBus, { w: 'sine', f, t: tt, d, v: 0.22, a: 0.002, dc: d, s: 0, r: 0.05 });
        voice(sfxBus, { w: 'sine', f: f * 2.76, t: tt, d: d * 0.4, v: 0.05, a: 0.002, dc: d * 0.3, s: 0, r: 0.03 });
        voice(sfxBus, { w: 'triangle', f: f / 2, t: tt, d: d * 0.6, v: 0.07, a: 0.002, dc: d * 0.5, s: 0, r: 0.04 });
      };
      bell(t, 1318.5, 0.5);
      bell(t + 0.24, 1046.5, 0.8);
    },
    gameover(t) {
      voice(sfxBus, { w: 'triangle', f: 330, f2: 82, sl: 0.6, t, d: 0.6, v: 0.3, s: 0.8, dc: 0.3, r: 0.1 });
      voice(sfxBus, { w: 'p12', f: 165, f2: 41, sl: 0.6, t, d: 0.5, v: 0.06, s: 0.7, r: 0.08 });
    },
    // angry enemy bursting out: crack + growl
    escape(t) {
      noise(sfxBus, { t, d: 0.05, v: 0.13, ft: 'highpass', f: 2500, s: 0, dc: 0.05, r: 0.01 });
      voice(sfxBus, { w: 'p25', f: 140, f2: 300, sl: 0.18, t: t + 0.02, d: 0.22, v: 0.12, vib: 0.15, vr: 32, vd: 0.01, s: 0.8, r: 0.04 });
    },
    pause(t) {
      voice(sfxBus, { w: 'p12', f: 784, t, d: 0.05, v: 0.17, s: 0.9, r: 0.01 });
      voice(sfxBus, { w: 'p12', f: 1175, t: t + 0.06, d: 0.08, v: 0.17, s: 0.6, r: 0.03 });
    },

    /* ---- bosses ---- */
    // squishy soap slap on a boss; o.n (soap hits so far) nudges the squish up, max +7 semitones
    boss_hit(t, o) {
      const k = Math.pow(2, Math.max(0, Math.min(14, (o && o.n) | 0)) / 24);
      noise(sfxBus, { t, d: 0.045, v: 0.34, ft: 'bandpass', f: 2600, f2: 900, q: 1.1, a: 0.001, s: 0, dc: 0.04, r: 0.02 });
      noise(sfxBus, { t, d: 0.018, v: 0.1, ft: 'highpass', f: 5000, s: 0, dc: 0.018, r: 0.01 });
      voice(sfxBus, { w: 'triangle', f: 420 * k, f2: 165 * k, sl: 0.14, t: t + 0.008, d: 0.15, v: 0.3, vib: 0.14, vr: 34, vd: 0.01, a: 0.003, dc: 0.1, s: 0.5, r: 0.05 });
      voice(sfxBus, { w: 'sine', f: 760 * k, f2: 1500 * k, sl: 0.04, t: t + 0.1, d: 0.045, v: 0.1, a: 0.002, dc: 0.03, s: 0.3, r: 0.02 });
    },
    // rising bubble swell: the boss is sealed inside a giant bubble
    boss_stun(t) {
      voice(sfxBus, { w: 'triangle', f: 150, f2: 700, sl: 0.85, t, d: 0.9, v: 0.24, vib: 0.05, vr: 11, vd: 0.2, a: 0.25, dc: 0.4, s: 0.85, r: 0.18 });
      voice(sfxBus, { w: 'sine', f: 300, f2: 1400, sl: 0.85, t: t + 0.05, d: 0.85, v: 0.08, vib: 0.05, vr: 11, vd: 0.2, a: 0.3, dc: 0.4, s: 0.9, r: 0.18 });
      noise(sfxBus, { t, d: 0.85, v: 0.09, ft: 'bandpass', f: 300, f2: 2600, q: 3, a: 0.5, dc: 0.4, s: 0.9, r: 0.15 });
      for (let i = 0; i < 8; i++) {
        const f = 420 * Math.pow(2, i * 0.32);
        voice(sfxBus, { w: 'sine', f, f2: f * 1.9, sl: 0.035, t: t + 0.06 + i * 0.1, d: 0.045, v: 0.06 + i * 0.008, a: 0.002, dc: 0.03, s: 0.3, r: 0.02 });
      }
      voice(sfxBus, { w: 'sine', f: 1760, t: t + 0.86, d: 0.4, v: 0.08, a: 0.003, dc: 0.35, s: 0, r: 0.08 });
      voice(sfxBus, { w: 'sine', f: 2637, t: t + 0.9, d: 0.34, v: 0.05, a: 0.003, dc: 0.3, s: 0, r: 0.08 });
    },
    // huge pop + thud: the giant bubble bursts and the boss slams down, foam spraying
    boss_damage(t) {
      voice(sfxBus, { w: 'sine', f: 380, f2: 2400, sl: 0.05, t, d: 0.07, v: 0.24, a: 0.001, dc: 0.06, s: 0.2, r: 0.03 });
      noise(sfxBus, { t, d: 0.35, v: 0.18, ft: 'lowpass', f: 9000, f2: 400, q: 0.8, a: 0.001, dc: 0.22, s: 0, r: 0.08 });
      noise(sfxBus, { t, d: 0.04, v: 0.1, ft: 'highpass', f: 3000, s: 0, dc: 0.04, r: 0.01 });
      voice(sfxBus, { w: 'sine', f: 130, f2: 34, sl: 0.4, t: t + 0.05, d: 0.5, v: 0.34, a: 0.002, dc: 0.35, s: 0, r: 0.08 });
      voice(sfxBus, { w: 'triangle', f: 95, f2: 45, sl: 0.3, t: t + 0.07, d: 0.3, v: 0.16, a: 0.002, dc: 0.2, s: 0, r: 0.06 });
      noise(sfxBus, { t: t + 0.05, d: 0.45, v: 0.2, ft: 'lowpass', f: 320, f2: 70, s: 0, dc: 0.3, r: 0.06 });
      for (let i = 0; i < 7; i++) {
        const f = 900 + Math.random() * 1700;
        voice(sfxBus, { w: 'sine', f, f2: f * 1.8, sl: 0.03, t: t + 0.12 + i * 0.05 + Math.random() * 0.03, d: 0.035, v: 0.06, a: 0.002, dc: 0.03, s: 0.3, r: 0.02 });
      }
    },
    // low growl sweep: pitch rises then sags, the filter opens and closes, 23 Hz amplitude growl
    boss_roar(t) {
      const fp = [[0.3, 118], [0.62, 96], [1.0, 46]];
      const lpp = [[0.3, 2200], [0.62, 1400], [1.0, 280]];
      const scale = (pts, k) => pts.map(([dt, f]) => [dt, f * k]);
      voice(sfxBus, { w: 'sawtooth', f: 58, fp, t, d: 1.0, v: 0.22, a: 0.09, dc: 0.5, s: 0.85, r: 0.15, vib: 0.05, vr: 31, vd: 0.05, lp: 420, lpp, q: 6, am: 0.42, ar: 23 });
      voice(sfxBus, { w: 'sawtooth', f: 59.8, fp: scale(fp, 1.03), t, d: 1.0, v: 0.14, a: 0.12, dc: 0.5, s: 0.85, r: 0.15, lp: 380, lpp: scale(lpp, 0.6), q: 2 });
      voice(sfxBus, { w: 'square', f: 29, fp: scale(fp, 0.5), t, d: 0.95, v: 0.1, a: 0.1, dc: 0.5, s: 0.8, r: 0.15, lp: 220, q: 1 });
      noise(sfxBus, { t, d: 0.95, v: 0.12, ft: 'bandpass', f: 280, f2: 700, q: 1.5, a: 0.15, dc: 0.6, s: 0.6, r: 0.15 });
    },
    // rumbling thump: a boss landing sends a wave rolling along the floor
    shockwave(t) {
      voice(sfxBus, { w: 'sine', f: 115, f2: 33, sl: 0.28, t, d: 0.34, v: 0.4, a: 0.002, dc: 0.25, s: 0, r: 0.06 });
      noise(sfxBus, { t, d: 0.06, v: 0.22, ft: 'lowpass', f: 2000, f2: 400, s: 0, dc: 0.05, r: 0.02 });
      noise(sfxBus, { t: t + 0.02, d: 0.75, v: 0.32, ft: 'lowpass', f: 450, f2: 70, q: 1.5, a: 0.03, dc: 0.6, s: 0.4, r: 0.15 });
      voice(sfxBus, { w: 'triangle', f: 150, f2: 70, sl: 0.7, t: t + 0.03, d: 0.7, v: 0.18, a: 0.02, dc: 0.4, s: 0.5, r: 0.12, am: 0.5, ar: 16 });
    },
    // soft double puff of a spore ball leaving the mold queen
    spore(t) {
      noise(sfxBus, { t, d: 0.09, v: 0.22, ft: 'bandpass', f: 2400, f2: 1100, q: 1.2, a: 0.012, dc: 0.07, s: 0.2, r: 0.04 });
      noise(sfxBus, { t: t + 0.08, d: 0.12, v: 0.14, ft: 'bandpass', f: 1600, f2: 650, q: 1.2, a: 0.015, dc: 0.1, s: 0.2, r: 0.05 });
      voice(sfxBus, { w: 'triangle', f: 640, f2: 380, sl: 0.08, t, d: 0.08, v: 0.1, vib: 0.1, vr: 26, vd: 0.01, a: 0.004, dc: 0.06, s: 0.4, r: 0.03 });
    },

    /* ---- broken shower (scalding drops) ---- */
    // tense drip blip: a bead of scalding water forms under the ceiling (drip, then a tritone pair)
    scald_warn(t) {
      voice(sfxBus, { w: 'sine', f: 1100, f2: 2300, sl: 0.035, t, d: 0.04, v: 0.16, a: 0.001, dc: 0.03, s: 0.3, r: 0.02 });
      voice(sfxBus, { w: 'p12', f: 1480, t: t + 0.06, d: 0.04, v: 0.055, a: 0.002, s: 0.8, r: 0.01 });
      voice(sfxBus, { w: 'p12', f: 1047, t: t + 0.11, d: 0.05, v: 0.055, a: 0.002, s: 0.8, r: 0.015 });
    },
    // sizzle: the hot drop splats, then hisses and crackles
    scald_splash(t) {
      noise(sfxBus, { t, d: 0.05, v: 0.16, ft: 'bandpass', f: 1400, f2: 700, q: 1, s: 0, dc: 0.05, r: 0.02 });
      noise(sfxBus, { t: t + 0.01, d: 0.5, v: 0.13, ft: 'highpass', f: 3500, f2: 6500, a: 0.02, dc: 0.45, s: 0.15, r: 0.1 });
      for (let i = 0; i < 9; i++) {
        noise(sfxBus, { t: t + 0.02 + Math.random() * 0.4, d: 0.008, v: 0.08 + Math.random() * 0.08, ft: 'bandpass', f: 2500 + Math.random() * 5000, q: 2, s: 0, dc: 0.008, r: 0.005 });
      }
    },

    /* ---- water / ice ---- */
    // water plop: rising resonance + spray + a few droplets
    splash(t) {
      voice(sfxBus, { w: 'sine', f: 280, f2: 950, sl: 0.07, t, d: 0.09, v: 0.3, a: 0.002, dc: 0.07, s: 0.3, r: 0.03 });
      noise(sfxBus, { t, d: 0.22, v: 0.2, ft: 'bandpass', f: 1800, f2: 500, q: 0.9, a: 0.004, dc: 0.15, s: 0.2, r: 0.06 });
      for (let i = 0; i < 3; i++) {
        const f = 1300 + i * 380 + Math.random() * 200;
        voice(sfxBus, { w: 'sine', f, f2: f * 1.6, sl: 0.025, t: t + 0.09 + i * 0.065, d: 0.03, v: 0.07, a: 0.001, dc: 0.025, s: 0.3, r: 0.02 });
      }
    },
    // crackly chime: ice crackles across the surface, then an icy bell rings
    freeze(t) {
      for (let i = 0; i < 7; i++) {
        noise(sfxBus, { t: t + i * 0.02 + Math.random() * 0.01, d: 0.012, v: 0.12, ft: 'highpass', f: 2500 + i * 700, s: 0, dc: 0.012, r: 0.005 });
      }
      const bell = (dt, f, v) => {
        voice(sfxBus, { w: 'sine', f, t: t + dt, d: 0.75, v, a: 0.002, dc: 0.75, s: 0, r: 0.1 });
        voice(sfxBus, { w: 'sine', f: f * 2.76, t: t + dt, d: 0.3, v: v * 0.35, a: 0.002, dc: 0.25, s: 0, r: 0.06 });
      };
      bell(0.13, 1975.5, 0.12);   // B6
      bell(0.18, 2637, 0.09);     // E7
      bell(0.23, 3322.4, 0.06);   // G#7
      noise(sfxBus, { t: t + 0.13, d: 0.45, v: 0.04, ft: 'highpass', f: 8000, a: 0.01, dc: 0.4, s: 0.2, r: 0.08 });
    },
    // dripping glissando: the ice block sags away drop by drop
    melt(t) {
      voice(sfxBus, { w: 'triangle', f: 1400, f2: 330, sl: 0.75, t, d: 0.75, v: 0.09, vib: 0.03, vr: 9, vd: 0.1, a: 0.02, dc: 0.4, s: 0.7, r: 0.12 });
      for (let i = 0; i < 7; i++) {
        const f = 2000 * Math.pow(0.82, i);
        voice(sfxBus, { w: 'sine', f, f2: f * 1.7, sl: 0.03, t: t + 0.03 + i * 0.1, d: 0.035, v: 0.13, a: 0.001, dc: 0.03, s: 0.3, r: 0.02 });
      }
    },

    /* ---- stamp card, power-ups, door ---- */
    // solid "쾅" stamp thunk (click + wooden thock + body), then a tiny confirm ding
    stamp(t) {
      noise(sfxBus, { t, d: 0.018, v: 0.22, ft: 'bandpass', f: 2200, q: 1.5, s: 0, dc: 0.018, r: 0.01 });
      voice(sfxBus, { w: 'triangle', f: 340, f2: 160, sl: 0.07, t, d: 0.09, v: 0.26, a: 0.001, dc: 0.07, s: 0, r: 0.03 });
      voice(sfxBus, { w: 'sine', f: 150, f2: 55, sl: 0.12, t, d: 0.16, v: 0.32, a: 0.001, dc: 0.12, s: 0, r: 0.04 });
      noise(sfxBus, { t, d: 0.08, v: 0.14, ft: 'lowpass', f: 900, f2: 200, s: 0, dc: 0.07, r: 0.02 });
      voice(sfxBus, { w: 'p25', f: 1568, t: t + 0.12, d: 0.05, v: 0.07, s: 0.6, r: 0.02 });
      voice(sfxBus, { w: 'p25', f: 2093, t: t + 0.17, d: 0.12, v: 0.07, a: 0.002, dc: 0.1, s: 0.3, r: 0.05 });
    },
    // festive fanfare for a full stamp card: party popper, snare roll, triplet pickup in Bb, confetti
    ticket(t) {
      noise(sfxBus, { t, d: 0.08, v: 0.16, ft: 'bandpass', f: 3000, f2: 1200, q: 0.8, s: 0, dc: 0.07, r: 0.02 });
      voice(sfxBus, { w: 'sine', f: 500, f2: 1800, sl: 0.05, t, d: 0.06, v: 0.12, s: 0.3, r: 0.02 });
      const lead = [[0.08, 77, 0.06], [0.155, 77, 0.06], [0.23, 77, 0.06], [0.3, 82, 0.24], [0.56, 86, 0.1], [0.68, 84, 0.1], [0.8, 86, 0.1], [0.92, 89, 0.55]];
      const harm = [[0.08, 74, 0.06], [0.155, 74, 0.06], [0.23, 74, 0.06], [0.3, 77, 0.24], [0.56, 82, 0.1], [0.68, 81, 0.1], [0.8, 82, 0.1], [0.92, 86, 0.55]];
      const bass = [[0.08, 46, 0.2], [0.3, 46, 0.24], [0.56, 41, 0.1], [0.68, 45, 0.1], [0.8, 46, 0.1], [0.92, 46, 0.55]];
      for (const [dt, m, d] of lead) voice(sfxBus, { w: 'p25', f: mf(m), t: t + dt, d, v: 0.12, s: 0.75, r: 0.05, vib: d > 0.3 ? 0.015 : 0, vr: 6, vd: 0.1 });
      for (const [dt, m, d] of harm) voice(sfxBus, { w: 'p12', f: mf(m), t: t + dt, d, v: 0.06, s: 0.7, r: 0.05 });
      for (const [dt, m, d] of bass) voice(sfxBus, { w: 'triangle', f: mf(m), t: t + dt, d, v: 0.18, s: 0.8, r: 0.05 });
      // (the roll and hits sit a touch under the v1 effects' level: the fanfare is long, not loud)
      for (let i = 0; i < 5; i++) drum(sfxBus, 's', t + 0.08 + i * 0.045, 0.36);
      drum(sfxBus, 'k', t + 0.3, 0.5);
      drum(sfxBus, 'c', t + 0.92, 0.5);
      for (let i = 0; i < 6; i++) {
        voice(sfxBus, { w: 'sine', f: 2000 + Math.random() * 2500, t: t + 1.0 + i * 0.07, d: 0.04, v: 0.05, a: 0.002, dc: 0.03, s: 0.3, r: 0.03 });
      }
    },
    // sparkly rising arpeggio (C lydian) with a twinkling trill on top
    powerup(t) {
      [72, 76, 79, 83, 86, 90, 91, 95].forEach((m, i) => {
        voice(sfxBus, { w: 'triangle', f: mf(m), t: t + i * 0.045, d: 0.1, v: 0.14, a: 0.003, s: 0.4, r: 0.05 });
        voice(sfxBus, { w: 'p12', f: mf(m), t: t + i * 0.045, d: 0.04, v: 0.04, s: 0.5, r: 0.02 });
      });
      for (let i = 0; i < 6; i++) {
        voice(sfxBus, { w: 'sine', f: mf(i % 2 ? 93 : 95), t: t + 0.38 + i * 0.05, d: 0.04, v: 0.06 - i * 0.006, a: 0.002, s: 0.5, r: 0.02 });
      }
      noise(sfxBus, { t, d: 0.55, v: 0.045, ft: 'highpass', f: 6000, f2: 9000, a: 0.1, dc: 0.3, s: 0.5, r: 0.1 });
    },
    // wooden sliding door: rumbling whoosh along the track with roller ticks; shutting ends in a
    // clack where the panels meet, opening (o.open) starts with a latch click instead
    door(t, o) {
      const open = !!(o && o.open);
      noise(sfxBus, { t, d: 0.46, v: 0.22, ft: 'bandpass', f: open ? 1300 : 380, f2: open ? 380 : 1300, q: 1.6, a: 0.12, dc: 0.3, s: 0.7, r: 0.1 });
      noise(sfxBus, { t, d: 0.46, v: 0.12, ft: 'lowpass', f: 260, q: 2, a: 0.05, dc: 0.2, s: 0.8, r: 0.08 });
      for (let i = 0; i < 6; i++) {
        voice(sfxBus, { w: 'triangle', f: 210 + (i % 2) * 45, t: t + 0.05 + i * 0.066, d: 0.022, v: 0.09, a: 0.001, dc: 0.02, s: 0, r: 0.01 });
      }
      if (open) {
        noise(sfxBus, { t, d: 0.012, v: 0.16, ft: 'bandpass', f: 3200, q: 2, s: 0, dc: 0.012, r: 0.005 });
        voice(sfxBus, { w: 'triangle', f: 720, f2: 560, sl: 0.02, t, d: 0.025, v: 0.14, a: 0.001, dc: 0.02, s: 0, r: 0.01 });
      } else {
        const clack = (dt, v) => {
          noise(sfxBus, { t: t + dt, d: 0.03, v: 0.24 * v, ft: 'bandpass', f: 1700, q: 1.8, s: 0, dc: 0.03, r: 0.01 });
          voice(sfxBus, { w: 'triangle', f: 520, f2: 330, sl: 0.05, t: t + dt, d: 0.06, v: 0.32 * v, a: 0.001, dc: 0.05, s: 0, r: 0.02 });
          voice(sfxBus, { w: 'sine', f: 140, f2: 90, sl: 0.06, t: t + dt, d: 0.08, v: 0.25 * v, a: 0.001, dc: 0.06, s: 0, r: 0.02 });
        };
        clack(0.47, 1);
        clack(0.54, 0.4); // small rebound
      }
    },

    /* ---- v3: online play (lobby, room, co-op, battle) ---- */
    // a friend pops into the room: bubble glide up, then a bright "안녕!" G–C–E hello
    join(t) {
      voice(sfxBus, { w: 'sine', f: 330, f2: 990, sl: 0.09, t, d: 0.1, v: 0.18, a: 0.004, dc: 0.08, s: 0.4, r: 0.03 });
      [[0.08, 79, 0.07], [0.16, 84, 0.07], [0.24, 88, 0.22]].forEach(([dt, m, d]) => {
        voice(sfxBus, { w: 'triangle', f: mf(m), t: t + dt, d, v: 0.16, a: 0.003, dc: 0.08, s: 0.5, r: 0.06 });
        voice(sfxBus, { w: 'p12', f: mf(m), t: t + dt, d: 0.04, v: 0.04, s: 0.5, r: 0.02 });
      });
    },
    // a friend heads out: the hello in reverse, then a soft bubble sinking away (friendly, not sad)
    leave(t) {
      [[0, 88, 0.06], [0.08, 84, 0.06], [0.16, 79, 0.14]].forEach(([dt, m, d]) => {
        voice(sfxBus, { w: 'triangle', f: mf(m), t: t + dt, d, v: 0.14, a: 0.003, dc: 0.07, s: 0.4, r: 0.06 });
      });
      voice(sfxBus, { w: 'sine', f: 880, f2: 260, sl: 0.18, t: t + 0.18, d: 0.2, v: 0.15, a: 0.004, dc: 0.12, s: 0.4, r: 0.05 });
    },
    // 준비 완료: a crisp tick, a quick upward "삑" swoop and a bright major-third ding
    ready(t) {
      noise(sfxBus, { t, d: 0.015, v: 0.12, ft: 'bandpass', f: 4200, q: 2, s: 0, dc: 0.015, r: 0.005 });
      voice(sfxBus, { w: 'triangle', f: 660, f2: 1320, sl: 0.05, t, d: 0.06, v: 0.16, a: 0.002, dc: 0.05, s: 0.5, r: 0.02 });
      voice(sfxBus, { w: 'p25', f: mf(86), t: t + 0.07, d: 0.14, v: 0.1, a: 0.003, dc: 0.12, s: 0.35, r: 0.06 });
      voice(sfxBus, { w: 'p25', f: mf(90), t: t + 0.07, d: 0.14, v: 0.08, a: 0.003, dc: 0.12, s: 0.35, r: 0.06 });
    },
    // one countdown beep (A5); the game calls it for 3, 2 and 1
    countdown(t) {
      voice(sfxBus, { w: 'square', f: 880, t, d: 0.13, v: 0.14, a: 0.002, dc: 0.1, s: 0.7, r: 0.03 });
      voice(sfxBus, { w: 'sine', f: 1760, t, d: 0.09, v: 0.06, a: 0.002, dc: 0.07, s: 0.3, r: 0.03 });
    },
    // the start signal: an octave above the countdown, longer, as a bright A-major chord with a whoosh
    go(t) {
      voice(sfxBus, { w: 'square', f: 1760, t, d: 0.38, v: 0.08, a: 0.002, dc: 0.2, s: 0.65, r: 0.08, vib: 0.008, vr: 7, vd: 0.15 });
      voice(sfxBus, { w: 'p25', f: mf(88), t, d: 0.38, v: 0.06, a: 0.002, dc: 0.2, s: 0.6, r: 0.08 });
      voice(sfxBus, { w: 'p25', f: mf(85), t, d: 0.38, v: 0.05, a: 0.002, dc: 0.2, s: 0.6, r: 0.08 });
      noise(sfxBus, { t, d: 0.32, v: 0.1, ft: 'bandpass', f: 900, f2: 5000, q: 0.8, a: 0.01, dc: 0.25, s: 0.3, r: 0.08 });
      voice(sfxBus, { w: 'sine', f: 150, f2: 50, sl: 0.12, t, d: 0.16, v: 0.22, a: 0.001, s: 0, dc: 0.14, r: 0.03 });
    },
    // a player is caught in a bubble: surprised squeak, a big wobbling gulp, two escaping air bubbles
    trap_player(t) {
      voice(sfxBus, { w: 'p12', f: 700, f2: 1400, sl: 0.07, t, d: 0.08, v: 0.1, vib: 0.05, vr: 20, vd: 0.01, a: 0.003, dc: 0.06, s: 0.6, r: 0.03 });
      voice(sfxBus, { w: 'triangle', f: 160, f2: 420, sl: 0.3, t: t + 0.06, d: 0.34, v: 0.28, vib: 0.12, vr: 12, vd: 0.02, a: 0.01, dc: 0.2, s: 0.7, r: 0.08 });
      voice(sfxBus, { w: 'sine', f: 320, f2: 840, sl: 0.3, t: t + 0.06, d: 0.3, v: 0.08, vib: 0.12, vr: 12, vd: 0.02, s: 0.6, r: 0.06 });
      noise(sfxBus, { t: t + 0.04, d: 0.18, v: 0.12, ft: 'bandpass', f: 900, f2: 2400, q: 1.5, a: 0.01, dc: 0.12, s: 0.3, r: 0.05 });
      for (let i = 0; i < 2; i++) {
        const f = 1100 + i * 300;
        voice(sfxBus, { w: 'sine', f, f2: f * 1.7, sl: 0.03, t: t + 0.38 + i * 0.07, d: 0.035, v: 0.07, a: 0.001, dc: 0.03, s: 0.3, r: 0.02 });
      }
    },
    // battle: a press with every bubble already out (the shot cap) - a quiet dry "칙", a short hiss and a tiny tick
    dry(t) {
      noise(sfxBus, { t, d: 0.07, v: 0.05, ft: 'highpass', f: 3800, a: 0.002, s: 0, dc: 0.06, r: 0.02 });
      voice(sfxBus, { w: 'square', f: 2200, t, d: 0.012, v: 0.025, a: 0.001, s: 0, dc: 0.01, r: 0.005 });
    },
    // battle: my magazine refilled after it ran dry (장전 끝) - a soft little "뽁-뽁" pair of rising bubble blips
    reload(t) {
      voice(sfxBus, { w: 'sine', f: 740, f2: 1110, sl: 0.035, t, d: 0.045, v: 0.07, a: 0.002, s: 0, dc: 0.04, r: 0.02 });
      voice(sfxBus, { w: 'sine', f: 988, f2: 1480, sl: 0.035, t: t + 0.075, d: 0.055, v: 0.08, a: 0.002, s: 0, dc: 0.05, r: 0.03 });
      noise(sfxBus, { t: t + 0.075, d: 0.02, v: 0.02, ft: 'highpass', f: 6000, s: 0, dc: 0.02, r: 0.01 });
    },
    // a partner frees a ghost: the ghost bubble pops, a harp-like run climbs, a warm G-major bell blooms
    revive(t) {
      voice(sfxBus, { w: 'sine', f: 520, f2: 1560, sl: 0.05, t, d: 0.06, v: 0.2, a: 0.002, dc: 0.05, s: 0.3, r: 0.03 });
      noise(sfxBus, { t, d: 0.03, v: 0.06, ft: 'highpass', f: 4500, s: 0, dc: 0.03, r: 0.01 });
      [67, 69, 71, 74, 76, 79, 81, 83].forEach((m, i) => {
        voice(sfxBus, { w: 'triangle', f: mf(m), t: t + 0.05 + i * 0.035, d: 0.14, v: 0.1, a: 0.002, dc: 0.1, s: 0.25, r: 0.08 });
      });
      for (const m of [79, 83, 86]) {
        voice(sfxBus, { w: 'sine', f: mf(m), t: t + 0.36, d: 0.45, v: 0.07, a: 0.01, dc: 0.4, s: 0.2, r: 0.12, vib: 0.008, vr: 5, vd: 0.2 });
      }
      noise(sfxBus, { t: t + 0.36, d: 0.4, v: 0.035, ft: 'highpass', f: 7000, a: 0.02, dc: 0.3, s: 0.3, r: 0.08 });
    },
    // a player turns into a ghost bubble: a soft puff, then a wobbly "우~" pair drifting down (cute, not scary)
    ghost(t) {
      noise(sfxBus, { t, d: 0.2, v: 0.1, ft: 'bandpass', f: 1200, f2: 500, q: 1.2, a: 0.02, dc: 0.15, s: 0.2, r: 0.05 });
      voice(sfxBus, { w: 'sine', f: 880, fp: [[0.25, 990], [0.7, 520]], t: t + 0.05, d: 0.7, v: 0.13, a: 0.08, dc: 0.4, s: 0.8, r: 0.15, vib: 0.03, vr: 6, vd: 0.15 });
      voice(sfxBus, { w: 'triangle', f: 740, fp: [[0.25, 832], [0.7, 437]], t: t + 0.05, d: 0.7, v: 0.07, a: 0.1, dc: 0.4, s: 0.8, r: 0.15, vib: 0.03, vr: 6, vd: 0.15 });
      noise(sfxBus, { t: t + 0.1, d: 0.6, v: 0.03, ft: 'highpass', f: 6000, a: 0.1, dc: 0.4, s: 0.5, r: 0.12 });
    },
    // 뽀득 KO!: a trapped player's bubble bursts — big pop, cartoon bonk, dizzy slide whistle, stars
    ko(t) {
      voice(sfxBus, { w: 'sine', f: 300, f2: 2200, sl: 0.04, t, d: 0.06, v: 0.26, a: 0.001, dc: 0.05, s: 0.2, r: 0.03 });
      noise(sfxBus, { t, d: 0.12, v: 0.2, ft: 'bandpass', f: 3500, f2: 1200, q: 0.9, a: 0.001, dc: 0.1, s: 0, r: 0.03 });
      voice(sfxBus, { w: 'square', f: 196, f2: 98, sl: 0.1, t: t + 0.04, d: 0.12, v: 0.12, lp: 1400, q: 2, a: 0.002, dc: 0.1, s: 0.3, r: 0.04 });
      voice(sfxBus, { w: 'p25', f: 600, fp: [[0.12, 1500], [0.42, 700]], t: t + 0.12, d: 0.42, v: 0.09, vib: 0.06, vr: 14, vd: 0.03, a: 0.01, dc: 0.3, s: 0.8, r: 0.06 });
      for (let i = 0; i < 3; i++) {
        voice(sfxBus, { w: 'sine', f: 2349 + i * 440, t: t + 0.56 + i * 0.07, d: 0.05, v: 0.06, a: 0.002, dc: 0.04, s: 0.3, r: 0.03 });
      }
    },
    // a win sting: two quick C-major stabs and a held chord on top ("빰빠 밤!") with a crash
    win(t) {
      const stab = (dt, ms, d, v) => ms.forEach((m) => {
        voice(sfxBus, { w: 'p25', f: mf(m), t: t + dt, d, v, a: 0.003, dc: 0.1, s: 0.75, r: 0.06, vib: d > 0.3 ? 0.012 : 0, vr: 6, vd: 0.15 });
      });
      stab(0, [76, 79, 84], 0.07, 0.06);
      stab(0.12, [76, 79, 84], 0.07, 0.06);
      stab(0.26, [79, 84, 88], 0.55, 0.065);
      for (const [dt, m, d] of [[0, 48, 0.08], [0.12, 48, 0.08], [0.26, 36, 0.55]]) {
        voice(sfxBus, { w: 'triangle', f: mf(m), t: t + dt, d, v: 0.22, s: 0.8, r: 0.06 });
      }
      drum(sfxBus, 's', t, 0.4);
      drum(sfxBus, 's', t + 0.12, 0.4);
      drum(sfxBus, 'c', t + 0.26, 0.5);
      noise(sfxBus, { t: t + 0.26, d: 0.5, v: 0.04, ft: 'highpass', f: 6500, s: 0.3, dc: 0.3, r: 0.1 });
    },

    /* ---- v4: character kits. Moves (JUMP button) and shots are local to the player's own screen;
       only quake and the per-animal pops are echoed to guests. All are short and sit at or under
       the v1 shoot/pop level, since they repeat (glide flaps every 12 f, autofire, 4-player volleys);
       quake, the one heavy hit, stays at the boss shockwave's weight. ---- */
    // 꽥꽥이 둥실 활공: one soft wing flutter (the engine repeats it every 12 f while gliding)
    flap(t) {
      voice(sfxBus, { w: 'triangle', f: 990, f2: 740, sl: 0.08, t, d: 0.09, v: 0.08, a: 0.004, dc: 0.06, s: 0.4, r: 0.03 });
      noise(sfxBus, { t, d: 0.05, v: 0.04, ft: 'bandpass', f: 1800, q: 1, a: 0.004, s: 0, dc: 0.05, r: 0.02 });
    },
    // 까삐 털썩 엉덩방아 wind-up "뿅": a quick drop in pitch before the fall
    slam(t) {
      voice(sfxBus, { w: 'p25', f: 700, f2: 350, sl: 0.08, t, d: 0.1, v: 0.12, a: 0.003, dc: 0.08, s: 0.6, r: 0.03 });
    },
    // the capy lands: the heaviest kit hit — a deep floor thud, a rumble and a slap of water on tile.
    // (spec levels x0.8, so it stays at the boss shockwave's weight instead of topping it)
    quake(t) {
      voice(sfxBus, { w: 'sine', f: 120, f2: 40, t, d: 0.25, v: 0.4, a: 0.002, dc: 0.2, s: 0, r: 0.06 });
      noise(sfxBus, { t, d: 0.2, v: 0.2, ft: 'lowpass', f: 500, a: 0.002, s: 0, dc: 0.18, r: 0.05 });
      noise(sfxBus, { t, d: 0.18, v: 0.1, ft: 'bandpass', f: 1400, f2: 700, q: 1, a: 0.002, s: 0, dc: 0.15, r: 0.04 });
    },
    // 해롱이 휙 대시: an upward whoosh with a little rising tone
    dash(t) {
      noise(sfxBus, { t, d: 0.16, v: 0.2, ft: 'bandpass', f: 900, f2: 2600, q: 1.2, a: 0.012, dc: 0.12, s: 0.3, r: 0.05 });
      voice(sfxBus, { w: 'sine', f: 400, f2: 800, t, d: 0.06, v: 0.08, a: 0.003, dc: 0.05, s: 0.4, r: 0.02 });
    },
    // 펭펭 쭉 배미끄럼: o.n 1 = the dive, 2 = the belly slide swish, 3 = bonk into the wall
    slide(t, o) {
      const n = variant('slide', o);
      if (n === 1) {
        noise(sfxBus, { t, d: 0.08, v: 0.12, ft: 'highpass', f: 3000, a: 0.004, s: 0, dc: 0.08, r: 0.02 });
        voice(sfxBus, { w: 'triangle', f: 900, f2: 600, t, d: 0.05, v: 0.12, a: 0.003, dc: 0.04, s: 0.4, r: 0.02 });
      } else if (n === 2) {
        noise(sfxBus, { t, d: 0.35, v: 0.14, ft: 'highpass', f: 3200, f2: 1600, a: 0.02, dc: 0.2, s: 0.5, r: 0.08 });
      } else {
        voice(sfxBus, { w: 'triangle', f: 300, f2: 150, t, d: 0.06, v: 0.2, a: 0.001, dc: 0.05, s: 0.2, r: 0.02 });
        noise(sfxBus, { t, d: 0.04, v: 0.12, ft: 'lowpass', f: 600, s: 0, dc: 0.04, r: 0.01 });
      }
    },
    // 냥냥 2단 점프: a springy upward fifth with a sparkle on top
    djump(t) {
      voice(sfxBus, { w: 'p25', f: 880, f2: 1320, sl: 0.05, t, d: 0.08, v: 0.14, a: 0.003, dc: 0.06, s: 0.5, r: 0.03 });
      voice(sfxBus, { w: 'triangle', f: 1760, t, d: 0.05, v: 0.06, a: 0.002, dc: 0.04, s: 0.3, r: 0.03 });
    },
    // 깨굴 3단 뛰기 "깨굴" (rise, then fall): o.n = chain level 1..2, k = 3 / 6 semitones up as the chain climbs
    hop(t, o) {
      const k = [1.19, 1.41][variant('hop', o) - 1];
      voice(sfxBus, { w: 'square', f: 220 * k, f2: 330 * k, t, d: 0.06, v: 0.14, a: 0.003, dc: 0.05, s: 0.6, r: 0.02 });
      voice(sfxBus, { w: 'square', f: 260 * k, f2: 190 * k, t: t + 0.06, d: 0.05, v: 0.12, a: 0.003, dc: 0.04, s: 0.5, r: 0.03 });
    },
    // 메아리 거품: o.n 0 = shot "삑", 1 = the echo turns back, a softer falling "삐요"
    b_echo(t, o) {
      if (variant('b_echo', o)) {
        voice(sfxBus, { w: 'p12', f: 1500, f2: 1000, t, d: 0.06, v: 0.08, a: 0.003, dc: 0.05, s: 0.5, r: 0.03 });
        return;
      }
      voice(sfxBus, { w: 'p25', f: 1100, f2: 1500, t, d: 0.05, v: 0.16, a: 0.002, dc: 0.04, s: 0.5, r: 0.02 });
      voice(sfxBus, { w: 'sine', f: 700, t, d: 0.04, v: 0.08, a: 0.002, dc: 0.03, s: 0.4, r: 0.02 });
    },
    // 왕방울 거품 "뽀옹": a big, low, slow bubble
    b_onsen(t) {
      voice(sfxBus, { w: 'sine', f: 220, f2: 150, t, d: 0.12, v: 0.24, a: 0.006, dc: 0.09, s: 0.5, r: 0.04 });
      noise(sfxBus, { t, d: 0.1, v: 0.1, ft: 'lowpass', f: 800, a: 0.006, s: 0, dc: 0.1, r: 0.03 });
    },
    // 물장구 거품 "촵": a wet slap fanning out
    b_splash(t) {
      noise(sfxBus, { t, d: 0.09, v: 0.22, ft: 'bandpass', f: 2000, f2: 700, q: 1.3, a: 0.003, dc: 0.07, s: 0.2, r: 0.03 });
      voice(sfxBus, { w: 'sine', f: 500, f2: 300, t, d: 0.06, v: 0.12, a: 0.003, dc: 0.05, s: 0.4, r: 0.02 });
    },
    // 고드름 거품 "슝": a thin, fast, rising zip
    b_icicle(t) {
      voice(sfxBus, { w: 'triangle', f: 1800, f2: 2600, t, d: 0.07, v: 0.16, a: 0.002, dc: 0.06, s: 0.5, r: 0.03 });
      noise(sfxBus, { t, d: 0.03, v: 0.05, ft: 'highpass', f: 5000, s: 0, dc: 0.03, r: 0.01 });
    },
    // 털실 거품: o.n 0 = shot "냥" blip (up, then down), 1 = a tiny tick each time the yarn lands
    b_yarn(t, o) {
      if (variant('b_yarn', o)) {
        voice(sfxBus, { w: 'sine', f: 1400, t, d: 0.02, v: 0.05, a: 0.001, dc: 0.02, s: 0.3, r: 0.01 });
        return;
      }
      voice(sfxBus, { w: 'triangle', f: 1000, fp: [[0.04, 1300], [0.08, 900]], t, d: 0.08, v: 0.14, a: 0.003, dc: 0.06, s: 0.6, r: 0.03 });
    },
    // 개구리알 거품: o.n 0 = shot "뿍", 1 = "뽀옥" when the egg stops and hangs
    b_egg(t, o) {
      if (variant('b_egg', o)) {
        voice(sfxBus, { w: 'sine', f: 600, f2: 500, t, d: 0.04, v: 0.06, a: 0.003, dc: 0.03, s: 0.5, r: 0.02 });
        return;
      }
      voice(sfxBus, { w: 'sine', f: 420, f2: 260, t, d: 0.07, v: 0.2, a: 0.003, dc: 0.05, s: 0.4, r: 0.03 });
      noise(sfxBus, { t, d: 0.01, v: 0.1, ft: 'highpass', f: 3000, s: 0, dc: 0.01, r: 0.005 });
    },

    /* ---- v4 trophies (design/trophies.md §10): always played locally by the engine (never echoed) ---- */
    // 트로피 걸기: a soft wooden knock (stamp's low end) under two quick metallic clinks, 40 ms apart
    stake(t) {
      voice(sfxBus, { w: 'sine', f: 140, f2: 60, sl: 0.1, t, d: 0.12, v: 0.24, a: 0.001, dc: 0.1, s: 0, r: 0.03 });
      noise(sfxBus, { t, d: 0.05, v: 0.09, ft: 'lowpass', f: 800, f2: 240, s: 0, dc: 0.05, r: 0.02 });
      voice(sfxBus, { w: 'p25', f: 1568, t: t + 0.01, d: 0.05, v: 0.09, a: 0.001, dc: 0.045, s: 0.2, r: 0.03 });
      voice(sfxBus, { w: 'p25', f: 2093, t: t + 0.05, d: 0.09, v: 0.09, a: 0.001, dc: 0.08, s: 0.2, r: 0.04 });
      voice(sfxBus, { w: 'sine', f: 4186, t: t + 0.05, d: 0.06, v: 0.03, a: 0.001, dc: 0.05, s: 0, r: 0.03 });
    },
    // a cup landing on the podium winner: a short bright "팅" climbing with o.n 0..5, a sine an octave up
    tro_fly(t, o) {
      const f = mf(84 + 2 * variant('tro_fly', o));
      voice(sfxBus, { w: 'triangle', f, t, d: 0.07, v: 0.15, a: 0.001, dc: 0.06, s: 0.2, r: 0.04 });
      voice(sfxBus, { w: 'sine', f: f * 2, t, d: 0.06, v: 0.05, a: 0.001, dc: 0.05, s: 0.1, r: 0.03 });
    },
    // my trophies went up: C6 E6 G6 C7 in 45 ms steps, a shimmer of noise on top
    tro_up(t) {
      [84, 88, 91, 96].forEach((m, i) => voice(sfxBus, { w: 'p25', f: mf(m), t: t + i * 0.045, d: i === 3 ? 0.24 : 0.06, v: 0.1, a: 0.002, dc: 0.05, s: 0.5, r: 0.06 }));
      voice(sfxBus, { w: 'sine', f: mf(108), t: t + 0.135, d: 0.2, v: 0.035, a: 0.002, dc: 0.18, s: 0, r: 0.05 });
      noise(sfxBus, { t: t + 0.1, d: 0.3, v: 0.035, ft: 'highpass', f: 6500, s: 0.3, dc: 0.2, r: 0.08 });
    },
    // my trophies went down: a soft, quiet G5 -> D5 pair
    tro_down(t) {
      voice(sfxBus, { w: 'triangle', f: mf(79), t, d: 0.12, v: 0.12, a: 0.006, dc: 0.1, s: 0.5, r: 0.05 });
      voice(sfxBus, { w: 'triangle', f: mf(74), t: t + 0.13, d: 0.14, v: 0.1, a: 0.006, dc: 0.12, s: 0.4, r: 0.06 });
    },
    // 승급!: a ~0.9 s brass fanfare - snare pickup, Bb C D F, a held bell-like high F (like ticket, shorter)
    promote(t) {
      for (let i = 0; i < 3; i++) drum(sfxBus, 's', t + i * 0.05, 0.3);
      const lead = [[0.15, 70, 0.09], [0.26, 72, 0.09], [0.37, 74, 0.09], [0.48, 77, 0.38]];
      const harm = [[0.15, 65, 0.09], [0.26, 67, 0.09], [0.37, 70, 0.09], [0.48, 74, 0.38]];
      for (const [dt, m, d] of lead) voice(sfxBus, { w: 'p25', f: mf(m), t: t + dt, d, v: 0.11, s: 0.75, r: 0.05, vib: d > 0.3 ? 0.012 : 0, vr: 6, vd: 0.12 });
      for (const [dt, m, d] of harm) voice(sfxBus, { w: 'p12', f: mf(m), t: t + dt, d, v: 0.055, s: 0.7, r: 0.05 });
      for (const [dt, m, d] of [[0.15, 46, 0.2], [0.37, 41, 0.1], [0.48, 46, 0.38]]) voice(sfxBus, { w: 'triangle', f: mf(m), t: t + dt, d, v: 0.18, s: 0.8, r: 0.05 });
      voice(sfxBus, { w: 'sine', f: mf(89), t: t + 0.48, d: 0.42, v: 0.07, a: 0.002, dc: 0.4, s: 0, r: 0.05 });
      voice(sfxBus, { w: 'sine', f: mf(89) * 2.76, t: t + 0.48, d: 0.16, v: 0.02, a: 0.002, dc: 0.12, s: 0, r: 0.03 });
      drum(sfxBus, 'k', t + 0.48, 0.45);
      drum(sfxBus, 'o', t + 0.48, 0.6);
    },

    /* ---- v4 shop (design/shop.md §11): always played locally by the engine (never echoed) ---- */
    // coins: a bright soap "띵" - a triangle C7 for 60 ms over a short bubble pop (a sine sweeping 1200 -> 600 Hz, 40 ms)
    coin(t) {
      voice(sfxBus, { w: 'sine', f: 1200, f2: 600, sl: 0.04, t, d: 0.04, v: 0.09, a: 0.001, dc: 0.035, s: 0, r: 0.02 });
      voice(sfxBus, { w: 'triangle', f: mf(96), t: t + 0.008, d: 0.06, v: 0.14, a: 0.001, dc: 0.05, s: 0.3, r: 0.05 });
    },
    // 사기, the first tap (armed): a soft wooden tick, stake's low end, 30 ms
    arm(t) {
      voice(sfxBus, { w: 'sine', f: 190, f2: 90, sl: 0.03, t, d: 0.03, v: 0.1, a: 0.001, dc: 0.028, s: 0, r: 0.015 });
      noise(sfxBus, { t, d: 0.02, v: 0.035, ft: 'lowpass', f: 900, s: 0, dc: 0.02, r: 0.01 });
    },
    // a purchase, "뽀득!": two quick squeaky rises (sine 900 -> 1600 Hz, 50 ms each, 30 ms apart), then a sparkle of
    // E7 G7 C8 in 35 ms steps
    buy(t) {
      for (let i = 0; i < 2; i++) voice(sfxBus, { w: 'sine', f: 900, f2: 1600, sl: 0.05, t: t + i * 0.08, d: 0.05, v: 0.12, a: 0.003, dc: 0.04, s: 0.5, r: 0.02 });
      [100, 103, 108].forEach((m, i) => voice(sfxBus, { w: 'triangle', f: mf(m), t: t + 0.17 + i * 0.035, d: i === 2 ? 0.12 : 0.035, v: 0.07, a: 0.001, dc: 0.03, s: 0.3, r: 0.04 }));
    },
    // wearing / taking off: a cloth "슥" (band-passed noise, 80 ms) and a small pop (sine 700 Hz, 25 ms)
    equip(t) {
      noise(sfxBus, { t, d: 0.08, v: 0.07, ft: 'bandpass', f: 2400, f2: 1100, q: 1.1, a: 0.012, dc: 0.07, s: 0, r: 0.02 });
      voice(sfxBus, { w: 'sine', f: 700, t: t + 0.06, d: 0.025, v: 0.1, a: 0.001, dc: 0.022, s: 0, r: 0.015 });
    },

    /* ---- v4 뽑기 (design/gacha.md §9): always played locally by the engine (uiSfx: never echoed); quiet and short, so a
       10회 뽑기's nine drops and ten pops are a patter, not a din ---- */
    // the crank "드르륵": a ratchet of short band-passed clicks, each with a soft snare hit that swells (one 50 ms grid),
    // ending in a wooden knock (stake's low end): n 0 one turn (0.6 s), 1 two turns (0.8 s), 2 the knock alone
    gacha_roll(t, o) {
      const n = variant('gacha_roll', o), dur = n === 2 ? 0 : n === 1 ? 0.7 : 0.5;
      for (let k = 0; k * 0.05 < dur - 1e-9; k++) {
        const u = t + k * 0.05;
        noise(sfxBus, { t: u, d: 0.012, v: 0.08, ft: 'bandpass', f: 3200, q: 4, s: 0, dc: 0.012, r: 0.005 });
        drum(sfxBus, 's', u, 0.12 + 0.18 * (k * 0.05) / dur);
      }
      voice(sfxBus, { w: 'sine', f: 140, f2: 60, sl: 0.1, t: t + dur, d: 0.1, v: 0.2, a: 0.001, dc: 0.09, s: 0, r: 0.03 });
    },
    // a plastic capsule landing "톡": a sine 520 -> 300 Hz (50 ms) over a low thud of noise; n 0 bounces once 90 ms later
    // at half volume (n 1, the ten's first nine: no bounce - it would flam with the next capsule)
    gacha_drop(t, o) {
      const tok = (u, k) => {
        voice(sfxBus, { w: 'sine', f: 520, f2: 300, sl: 0.05, t: u, d: 0.05, v: 0.14 * k, a: 0.001, dc: 0.045, s: 0, r: 0.02 });
        noise(sfxBus, { t: u, d: 0.03, v: 0.06 * k, ft: 'lowpass', f: 900, s: 0, dc: 0.03, r: 0.01 });
      };
      tok(t, 1);
      if (variant('gacha_drop', o) === 0) tok(t + 0.09, 0.5);
    },
    // a capsule opening "뽁!": a sine sweeping 300 -> 1,100 Hz in 35 ms and a high burst of noise; n raises both by n
    // semitones (the ten cells climb to the best one, opened last)
    gacha_pop(t, o) {
      const k = Math.pow(2, variant('gacha_pop', o) / 12);
      voice(sfxBus, { w: 'sine', f: 300 * k, f2: 1100 * k, sl: 0.035, t, d: 0.035, v: 0.16, a: 0.001, dc: 0.03, s: 0.3, r: 0.02 });
      noise(sfxBus, { t, d: 0.04, v: 0.1, ft: 'highpass', f: 2500 * k, s: 0, dc: 0.04, r: 0.01 });
    },
    // a new 희귀 (n 2): C6 E6 G6 C7 in 60 ms steps, the last held, a C8 shine and a sparkle of noise (tro_up, longer);
    // a new 전설 (n 3): the same run, then a held C7-E7-G7 chord with a 6 Hz vibrato over a kick and an open hat, and
    // an E8 bell (promote's shape, lighter - never louder than it)
    gacha_win(t, o) {
      const leg = variant('gacha_win', o) === 3;
      // (the shine and the sparkle first: its own recipe, not tro_up's)
      voice(sfxBus, { w: 'sine', f: mf(108), t: t + 0.18, d: 0.25, v: 0.035, a: 0.002, dc: 0.22, s: 0, r: 0.05 });
      noise(sfxBus, { t: t + 0.12, d: 0.3, v: 0.035, ft: 'highpass', f: 6500, s: 0.3, dc: 0.2, r: 0.08 });
      [84, 88, 91, 96].forEach((m, i) => voice(sfxBus, { w: 'p25', f: mf(m), t: t + i * 0.06, d: i === 3 && !leg ? 0.25 : 0.06, v: 0.1, a: 0.002, dc: 0.05, s: 0.5, r: 0.06 }));
      if (!leg) return;
      const c = t + 0.24;
      [96, 100, 103].forEach((m, i) => voice(sfxBus, { w: i ? 'p12' : 'p25', f: mf(m), t: c, d: 0.6, v: i ? 0.045 : 0.09, s: 0.75, r: 0.08, vib: 0.012, vr: 6, vd: 0.1 }));
      drum(sfxBus, 'k', c, 0.35); drum(sfxBus, 'o', c, 0.45);
      voice(sfxBus, { w: 'sine', f: mf(112), t: c, d: 0.4, v: 0.05, a: 0.002, dc: 0.38, s: 0, r: 0.05 });
    },

    /* ---- 파티 다듬기 (design/party-polish.md 8.2): the minigame show's stings. All at or under the v1 levels; the
       tally's tick and my row's rise are local (NO_ECHO in game.js), the rest echo from the host ---- */
    // the card's title splash (0.5 s): a noise swell into a rising "따-단-딴!" (G5 C6 E6) over a triangle bass, a crash
    mg_title(t) {
      noise(sfxBus, { t, d: 0.22, v: 0.06, ft: 'bandpass', f: 600, f2: 4000, q: 0.8, a: 0.18, dc: 0.04, s: 0.2, r: 0.02 });
      [[0.2, 79, 0.06], [0.28, 84, 0.06], [0.36, 88, 0.22]].forEach(([dt, m, d]) => {
        voice(sfxBus, { w: 'p25', f: mf(m), t: t + dt, d, v: 0.11, a: 0.002, dc: 0.08, s: 0.7, r: 0.05 });
        voice(sfxBus, { w: 'triangle', f: mf(m - 24), t: t + dt, d, v: 0.18, s: 0.8, r: 0.04 });
      });
      drum(sfxBus, 'c', t + 0.36, 0.4);
    },
    // 시작! in a party (0.6 s): two quick brass pickups, then go's chord ("빰빠-라밤!"), kick + crash
    mg_go(t) {
      for (const [dt, ms] of [[0, [76, 79]], [0.09, [77, 81]]]) ms.forEach((m) => voice(sfxBus, { w: 'p25', f: mf(m), t: t + dt, d: 0.06, v: 0.06, a: 0.002, dc: 0.05, s: 0.6, r: 0.03 }));
      const c = t + 0.2;
      [84, 88, 91].forEach((m, i) => voice(sfxBus, { w: i ? 'p25' : 'square', f: mf(m), t: c, d: 0.4, v: i ? 0.06 : 0.07, a: 0.002, dc: 0.2, s: 0.65, r: 0.08, vib: 0.008, vr: 7, vd: 0.15 }));
      voice(sfxBus, { w: 'triangle', f: mf(48), t: c, d: 0.35, v: 0.22, s: 0.8, r: 0.06 });
      noise(sfxBus, { t: c, d: 0.3, v: 0.08, ft: 'bandpass', f: 900, f2: 5000, q: 0.8, a: 0.01, dc: 0.25, s: 0.3, r: 0.08 });
      drum(sfxBus, 'k', t, 0.4); drum(sfxBus, 'c', c, 0.5);
    },
    // 끝! (0.7 s): a referee whistle - two blasts of a trilling 2.6 kHz pulse - and a crash
    mg_finish(t) {
      for (const [dt, d] of [[0, 0.12], [0.16, 0.3]]) {
        voice(sfxBus, { w: 'p12', f: 2600, t: t + dt, d, v: 0.08, a: 0.004, dc: 0.05, s: 0.85, r: 0.03, vib: 0.03, vr: 38, vd: 0 });
        noise(sfxBus, { t: t + dt, d, v: 0.05, ft: 'bandpass', f: 2600, q: 3, a: 0.004, dc: d, s: 0.6, r: 0.03 });
      }
      drum(sfxBus, 'c', t + 0.46, 0.45);
    },
    // the winner's jingle (1.6 s): a bouncy C-major run (C E G C' E' D' C') over an oom-pah bass, then a held C-E-G
    // with a 6 Hz vibrato, snare + crash (extend's shape, longer, brighter)
    mg_win(t) {
      [72, 76, 79, 84, 88, 86, 84].forEach((m, i) => voice(sfxBus, { w: 'p25', f: mf(m), t: t + i * 0.1, d: 0.08, v: 0.11, a: 0.002, dc: 0.06, s: 0.7, r: 0.04 }));
      [48, 55, 48, 55, 48, 55, 48].forEach((m, i) => voice(sfxBus, { w: 'triangle', f: mf(m), t: t + i * 0.1, d: 0.08, v: 0.22, s: 0.8, r: 0.03 }));
      const c = t + 0.72;
      [84, 88, 91].forEach((m, i) => voice(sfxBus, { w: i ? 'p12' : 'p25', f: mf(m), t: c, d: 0.8, v: i ? 0.05 : 0.1, s: 0.75, r: 0.12, vib: 0.014, vr: 6, vd: 0.15 }));
      voice(sfxBus, { w: 'triangle', f: mf(36), t: c, d: 0.8, v: 0.24, s: 0.8, r: 0.1 });
      drum(sfxBus, 's', t + 0.6, 0.35); drum(sfxBus, 'c', c, 0.5);
      noise(sfxBus, { t: c, d: 0.7, v: 0.04, ft: 'highpass', f: 6500, s: 0.3, dc: 0.4, r: 0.1 });
    },
    // one point counting in (o.n 1..: the pitch climbs 2 semitones a step from C6, wrapping after 9): a 40 ms "띡"
    tally(t, o) {
      const n = (((o && o.n) | 0) || 1) - 1;
      voice(sfxBus, { w: 'triangle', f: mf(84 + 2 * (n % 9)), t, d: 0.04, v: 0.09, a: 0.001, dc: 0.035, s: 0, r: 0.01 });
    },
    // my row went up the board: a 0.25 s sine swoosh 600 -> 1800 Hz and item's ding
    rank_up(t) {
      voice(sfxBus, { w: 'sine', f: 600, f2: 1800, sl: 0.22, t, d: 0.25, v: 0.12, a: 0.01, dc: 0.2, s: 0.5, r: 0.04 });
      voice(sfxBus, { w: 'p25', f: 1568, t: t + 0.2, d: 0.16, v: 0.12, a: 0.003, dc: 0.14, s: 0.3, r: 0.06 });
    },
    // 펑! 비눗방울 (party-games 9.2, local): one counted puff into my bubble - a 40 ms soft band-passed "푸" (shoot's,
    // quieter), its centre 500 Hz + 120 Hz a step of o.n 0..10: the pitch rises as the bubble grows
    puff(t, o) {
      const f = 500 + 120 * variant('puff', o);
      noise(sfxBus, { t, d: 0.04, v: 0.12, ft: 'bandpass', f, f2: f * 0.8, q: 1.4, a: 0.004, dc: 0.035, s: 0.3, r: 0.03 });
    },
    // 수도꼭지 순서 기억하기 (party-games-2 10.2, local): one faucet's note - a 120 ms soft square "똥" with a fast decay,
    // o.n 0..3 = 위 / 왼쪽 / 오른쪽 / 아래 on a major chord, C5 E5 G5 C6
    tap(t, o) {
      const m = [72, 76, 79, 84][variant('tap', o)];
      voice(sfxBus, { w: 'square', f: mf(m), t, d: 0.12, v: 0.07, a: 0.003, dc: 0.09, s: 0.15, r: 0.04 });
      voice(sfxBus, { w: 'triangle', f: mf(m - 12), t, d: 0.1, v: 0.1, a: 0.003, dc: 0.08, s: 0.1, r: 0.03 });
    },
    // 목욕 의자 뺏기 (local, each page at its own view of the stop): the record stopping - 0.25 s of band-passed noise
    // sweeping 1.8 kHz -> 300 Hz and a soft 80 Hz thump
    scratch(t) {
      noise(sfxBus, { t, d: 0.25, v: 0.14, ft: 'bandpass', f: 1800, f2: 300, q: 2.2, a: 0.004, dc: 0.22, s: 0.4, r: 0.04 });
      voice(sfxBus, { w: 'sine', f: 80, f2: 55, t: t + 0.02, d: 0.12, v: 0.2, a: 0.004, dc: 0.1, s: 0.2, r: 0.04 });
    },
    // a 0.9 s snare roll (every 35 ms, swelling) ending on a crash
    drumroll(t) {
      for (let i = 0; i < 24; i++) drum(sfxBus, 's', t + i * 0.035, 0.15 + i * 0.012);
      drum(sfxBus, 'c', t + 0.86, 0.5);
    },
    // an award's reveal (0.6 s): powerup's sparkling top and a two-note brass "따-란!"
    award(t) {
      for (let i = 0; i < 5; i++) voice(sfxBus, { w: 'sine', f: mf(i % 2 ? 93 : 96), t: t + i * 0.04, d: 0.05, v: 0.06, a: 0.002, s: 0.5, r: 0.02 });
      [[0.12, [79, 84], 0.1], [0.26, [84, 88], 0.34]].forEach(([dt, ms, d]) => ms.forEach((m) => voice(sfxBus, { w: 'p25', f: mf(m), t: t + dt, d, v: 0.07, a: 0.003, dc: 0.1, s: 0.7, r: 0.06 })));
      noise(sfxBus, { t: t + 0.26, d: 0.35, v: 0.04, ft: 'highpass', f: 6500, s: 0.3, dc: 0.25, r: 0.08 });
    },
  };

  /* ------------------------------------------------------------------------
     Page lifecycle: pause audio while hidden, resume on return / next gesture.
     ------------------------------------------------------------------------ */
  const hasDoc = typeof document !== 'undefined' && document && typeof document.addEventListener === 'function';
  function resumeCtx() {
    if (ctx && ctx.state !== 'running' && ctx.state !== 'closed') settle(ctx.resume());
  }
  function onVisibility() {
    try {
      if (!ctx || ctx.state === 'closed') return;
      if (document.hidden) { if (typeof ctx.suspend === 'function') settle(ctx.suspend()); }
      else if (unlocked) resumeCtx();
    } catch (e) { /* ignore */ }
  }
  function onGesture() {
    try { if (unlocked && !document.hidden) resumeCtx(); } catch (e) { /* ignore */ }
  }
  function listen(on) {
    if (!hasDoc || listening === on) return;
    listening = on;
    const fn = on ? 'addEventListener' : 'removeEventListener';
    try {
      document[fn]('visibilitychange', onVisibility);
      document[fn]('pointerdown', onGesture, true);
      document[fn]('keydown', onGesture, true);
      document[fn]('touchend', onGesture, true);
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------------------
     Public API
     ------------------------------------------------------------------------ */
  function unlock() {
    try {
      if (!ctx && !create()) return;
      if (ctx.state === 'closed') return;
      resumeCtx();
      if (!unlocked) {
        unlocked = true;
        listen(true);
        if (pending && !cur) startTrack(pending);
      }
    } catch (e) { /* never throw */ }
  }

  function sfx(name, opts) {
    try {
      if (!ready() || muted) return;
      const fn = Object.prototype.hasOwnProperty.call(SFX, name) ? SFX[name] : null;
      if (!fn) return;
      const now = ctx.currentTime;
      // (chain and the v4 n-variants de-dup per variant; every pop, plain or per-animal, shares one key)
      const key = name === 'chain' ? 'chain' + ((opts && opts.n) | 0) : VARIANTS[name] ? name + variant(name, opts) : name;
      if (lastSfx[key] !== undefined && now - lastSfx[key] < 0.03 && now >= lastSfx[key]) return;
      if (sfxLive.length) sfxLive = sfxLive.filter((e) => e > now);
      if (sfxLive.length >= 28) return; // voice cap: drop effects only under extreme spam
      lastSfx[key] = now;
      sfxEnd = 0;
      fn(now + 0.005, opts || {});
      sfxLive.push(sfxEnd || now + 0.5);
    } catch (e) { /* never throw */ }
  }

  function music(track) {
    try {
      const name = track || null;
      if (name && !Object.prototype.hasOwnProperty.call(SONGS, name)) return;
      pending = name && SONGS[name].loop ? name : null;
      if (!ready()) return;
      if (!name) { stopCurrent(); return; }
      if (cur && cur.name === name) return; // already playing: keep going seamlessly
      stopCurrent();
      startTrack(name);
    } catch (e) { /* never throw */ }
  }

  function setMuted(b) {
    try {
      muted = !!b;
      writeMuted(muted);
      if (ctx && master && ctx.state !== 'closed') {
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setTargetAtTime(muted ? 0 : MASTER_VOL, now, 0.03);
      }
    } catch (e) { /* never throw */ }
  }

  function isMuted() { return muted; }

  function dispose() {
    try {
      stopTimer();
      listen(false);
      cur = null; fading = []; pending = null;
      if (ctx && ctx.state !== 'closed' && typeof ctx.close === 'function') settle(ctx.close());
    } catch (e) { /* ignore */ }
    ctx = null; unlocked = false;
  }

  PG.Audio = {
    unlock, sfx, music, setMuted, isMuted,
    // internal helpers for tests / hot reload (not part of the game-facing API)
    _dispose: dispose,
    _state: () => ({
      unlocked, muted, ctxState: ctx ? ctx.state : null, track: cur ? cur.name : null,
      pos: cur ? cur.pos : 0, pending, fading: fading.length, timer: !!timer,
    }),
    _songs: SONGS,
    _sfxNames: Object.keys(SFX),
  };
})(window.PG);
