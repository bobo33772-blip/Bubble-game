// Full-campaign integration run (built to C:/Temp/bogeul/test-campaign.html):
//   node tools/run-chrome.js test-campaign.html - 900 760 30000
// ONE game session from 1번째 탕 through all 24 entries (20 rounds + 4 boss arenas) to the ending and on into
// 2회차. Normal rounds are cleared with a real chain pop of every trapped enemy; each boss is beaten through
// its real loop three times (soap gauge filled -> giant bubble -> the duck touches it -> HP segment lost).
// At every hand-off it checks what the modules pass to each other: the door transition and the round banner,
// the music for the round (main / boss / final / victory / ending), the getState() shape (boss, stamps,
// power, water, ice, drops), the 뽀득 combo sum, the 세신 bonus banner, boss rewards (10000 x boss number,
// +3 stamps), no hurry / scald in boss arenas, nothing carried over between rounds, and no page errors.
// Prints "CAMP PASS/FAIL <name>" (passes are summarised per round) and "CAMP DONE pass=N fail=M".
(function () {
  let pass = 0, fail = 0, pageErrors = 0;
  window.addEventListener('error', (e) => { pageErrors++; console.log('CAMP page error: ' + e.message + ' @' + e.lineno); });
  const fails = [];
  const ok = (name, cond, info) => { if (cond) pass++; else { fail++; fails.push(name); console.log('CAMP FAIL ' + name + (info !== undefined ? ': ' + info : '')); } return !!cond; };
  const $ = (id) => document.getElementById(id);
  const fin = (v) => typeof v === 'number' && isFinite(v);

  function run() {
    const D = PG.debug, G = D.G, LV = D.levels(), S = () => D.getState();
    const seen = { banners: new Set(), music: new Set() };
    const step = (n) => { for (let i = 0; i < (n || 1); i++) { D.step(1); if (G.banner) seen.banners.add(G.banner.main + '|' + G.banner.sub); seen.music.add(String(G.music)); } };
    const until = (cond, max) => { for (let i = 1; i <= max; i++) { step(1); if (cond()) return i; } return -1; };
    const comboSum = (n) => { let s = 0; for (let k = 1; k <= n; k++) s += Math.min(5000, 500 * k); return s; };
    const waterCount = (L) => L.map.join('').split('').filter((c) => c === '~' || c === '=').length;

    ok('24 entries with bosses at 6/12/18/24', LV.length === 24 && [5, 11, 17, 23].every((i) => LV[i].boss) && LV.filter((L) => L.boss).length === 4);
    D.seed(2024);
    D.start(0); D.setInvincible(true);
    ok('game starts on 1번째 탕', S().phase === 'playing' && S().round === 0 && S().lives === 3 && S().stamps === 0);

    let totalKills = 0;
    for (let i = 0; i < LV.length; i++) {
      const L = LV[i], tag = 'R' + (i + 1) + (L.boss ? ' ' + L.boss : '');
      const p0 = pass;
      seen.banners.clear(); seen.music.clear();
      // ---- arrival (the doors are opening, or the game just started)
      ok(tag + ' arrives', G.round === i && (G.mode === 'playing' || G.mode === 'transition'), 'round ' + G.round + ' mode ' + G.mode);
      ok(tag + ' round banner', G.banner && G.banner.main === L.name && G.banner.sub.indexOf((i + 1) + '번째 탕') >= 0, G.banner && G.banner.main + '/' + G.banner.sub);
      ok(tag + ' nothing carried over', !G.bubbles.length && !G.items.length && !G.drops.length && !G.ice.length && !G.hazards.length && !G.pickup && !G.hurry && !G.scald);
      if (G.mode === 'transition') ok(tag + ' doors open on the new round', until(() => G.mode === 'playing' && !G.trans, 120) > 0);
      ok(tag + ' duck at its spawn', Math.abs(G.p.x - Math.max(14, Math.min(226, L.player.col * 8 - 4))) < 0.01 && !G.p.dead, G.p.x + ' vs col ' + L.player.col);
      const s = S();
      ok(tag + ' getState shape', fin(s.stamps) && (s.power === null || (typeof s.power.type === 'string' && fin(s.power.framesLeft))) &&
        s.water === waterCount(L) && s.ice === 0 && s.drops === 0 && (L.boss ? s.boss && s.boss.type === L.boss : s.boss === null), JSON.stringify({ w: s.water, want: waterCount(L), boss: s.boss }));

      if (!L.boss) {
        // ---- normal round: let everyone land, trap them all, pop the whole cluster as one chain
        until(() => G.introT > 82 && G.enemies.every((e) => e.state === 'active'), 400);
        ok(tag + ' 준비! banner + main music', seen.banners.has('준비!|') && G.music === 'main', [...seen.banners].join(',') + ' music ' + G.music);
        D.trapAll(); step(2);
        const n = G.enemies.filter((e) => e.state === 'trapped').length;
        const soaked = G.bubbles.filter((b) => b.kind === 'trapped' && b.soaked).length;
        const sc0 = G.score, nb = G.bubbles.length;
        D.popAll(); // scores synchronously (the next update clears the round and adds the 세신 bonus)
        const gain = G.score - sc0;
        step(1);
        ok(tag + ' 뽀득 combo pays 500k per kill', n > 0 && gain >= comboSum(n) && gain <= (soaked ? 2 : 1) * comboSum(n) + 10 * nb, 'n=' + n + ' soaked=' + soaked + ' gain=' + gain + ' want ' + comboSum(n));
        totalKills += n;
        ok(tag + ' cleared', until(() => G.clearT >= 0, 400) > 0);
        ok(tag + ' 세신 보너스 banner', G.banner && G.banner.main === '청소 완료!' && G.banner.sub.indexOf('세신 보너스') === 0, G.banner && G.banner.sub);
      } else {
        // ---- boss round: intro -> fight (music), no hurry / scald, three stun -> burst loops, defeat
        const b0 = G.boss;
        ok(tag + ' boss waits for its entrance', b0.state === 'intro');
        ok(tag + ' boss enters the fight', until(() => G.boss.state === 'fight', 400) > 0);
        const music = L.boss === 'towelKing' ? 'final' : 'boss';
        ok(tag + ' 등장 banner + ' + music + ' music', [...seen.banners].some((x) => / 등장!\|/.test(x)) && G.music === music, [...seen.banners].join(',') + ' music ' + G.music);
        G.roundT = 2800; step(30);
        ok(tag + ' no hurry / scald in a boss arena', !G.hurry && !G.scald && (L.boss === 'towelKing' || !G.drops.length), 'hurry ' + G.hurry + ' scald ' + G.scald + ' drops ' + G.drops.length);
        G.roundT = 0;
        const sc0 = G.score;
        for (let hp = 3; hp >= 1; hp--) {
          if (G.boss.state === 'down') until(() => G.boss.state === 'fight', 200);
          const st = D.soapBoss(G.boss.soapMax);
          ok(tag + ' soap fills -> giant bubble (hp ' + hp + ')', st && G.boss.state === 'stun' && G.boss.giant, JSON.stringify(st));
          step(5);
          const g = G.boss.giant; // (null if the duck happened to be standing in it and burst it already)
          if (g) { D.setPlayer(g.x + 12, g.y + 12); step(1); }
          const st2 = S().boss;
          ok(tag + ' duck bursts it -> HP ' + (hp - 1), st2.hp === hp - 1 && st2.soap === 0 && (hp > 1 ? st2.state === 'down' : st2.state === 'defeat'), JSON.stringify(st2));
        }
        const stamps0 = G.stamps; G.stamps = 0; // count this boss's reward on an empty card
        const deaths = G.roundDeaths;
        ok(tag + ' defeat boom', until(() => G.boss && G.boss.t >= 51, 120) > 0);
        const num = { kingGrime: 1, moldQueen: 2, megaSponge: 3, towelKing: 4 }[L.boss];
        ok(tag + ' boss points 10000 x ' + num, G.score - sc0 >= 10000 * num + 3 * 2000 * num, 'gain ' + (G.score - sc0));
        ok(tag + ' +3 boss stamps', G.stamps === 3 + (deaths ? 0 : 1), 'stamps ' + G.stamps);
        G.stamps = (stamps0 + G.stamps) % 10;
        ok(tag + ' 뽀득! banner + victory', [...seen.banners].some((x) => x.indexOf('뽀득!|') === 0 && x.indexOf(G.boss.name + ' 퇴치!') >= 0) && G.music === 'victory', [...seen.banners].filter((x) => /뽀득/.test(x)).join(','));
      }
      // ---- leave the round: doors (or the ending after the final boss)
      if (i < LV.length - 1) {
        ok(tag + ' door transition starts', until(() => G.mode === 'transition', 400) > 0, 'mode ' + G.mode);
        ok(tag + ' doors shut, next round built behind them', until(() => G.trans && G.trans.swapped, 60) > 0 && G.round === i + 1);
      } else {
        ok(tag + ' ending after the final boss', until(() => G.mode === 'ending', 400) > 0 && !$('pg-ending').hidden && G.music === 'ending', 'mode ' + G.mode + ' music ' + G.music);
      }
      ok(tag + ' no page errors so far', pageErrors === 0);
      if (pass - p0 > 0 && !fails.some((f) => f.indexOf(tag + ' ') === 0)) console.log('CAMP PASS ' + tag + ' ' + L.name + ' (' + (pass - p0) + ' checks) score ' + G.score + ' stamps ' + G.stamps + ' lives ' + G.lives);
    }
    ok('lives never lost (invincible run)', G.lives >= 3, 'lives ' + G.lives);
    ok('ending shows the score', +$('pg-end-score').textContent.replace(/[^0-9]/g, '') === G.score, $('pg-end-score').textContent + ' vs ' + G.score);
    // ---- 2회차: the ending's primary button starts the loop
    $('pg-end-next').click(); step(2);
    ok('2회차 starts at 1번째 탕', G.mode === 'playing' && G.loop === 1 && G.round === 0 && G.banner && G.banner.sub.indexOf('2회차') === 0, G.mode + ' loop ' + G.loop + ' ' + (G.banner && G.banner.sub));
    until(() => G.enemies.every((e) => e.state === 'active'), 400);
    ok('2회차 enemies are faster', G.loopMul > 1, 'loopMul ' + G.loopMul);
    ok('total kills sane', totalKills >= 100, 'kills ' + totalKills);
    ok('no page errors', pageErrors === 0, pageErrors);
    console.log('CAMP DONE pass=' + pass + ' fail=' + fail + (fails.length ? ' failed: ' + fails.join(' ; ') : ''));
  }
  function go() { if (!window.PG || !PG.debug || !PG.debug.G) return setTimeout(go, 30); setTimeout(() => { try { run(); } catch (e) { console.log('CAMP FAIL exception ' + e.message + ' ' + String(e.stack).split('\n').slice(0, 3).join(' | ')); console.log('CAMP DONE pass=' + pass + ' fail=' + (fail + 1)); } }, 50); }
  go();
})();
