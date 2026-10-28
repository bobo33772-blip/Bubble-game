// The owner's check after `npx wrangler deploy` (CLOUDFLARE-SETUP.md step 4, design/relay.md 11.5):
//   node tools/relay-check.js https://ppodeuk-relay.<계정>.workers.dev
// It asks the Worker's health route GET / ({ok, service: 'ppodeuk-relay', v}) five times (the average time of a
// request), and Cloudflare's /cdn-cgi/trace for the data center that answered (colo=ICN is Seoul), then prints one line:
//   중계 서버 OK · 서울(ICN) · 평균 23ms
// It opens no WebSocket (the Worker refuses a connect without a game page's Origin) and sends nothing but those GETs.
// Exit code 0 when the health route answers as the relay, 1 otherwise.
'use strict';
const COLO = { ICN: '서울', NRT: '도쿄', HND: '도쿄', KIX: '오사카', FUK: '후쿠오카', HKG: '홍콩', TPE: '타이베이', SIN: '싱가포르', LAX: '로스앤젤레스', SJC: '산호세', SEA: '시애틀', FRA: '프랑크푸르트' };
const arg = process.argv[2] || '';
const base = arg.trim().replace(/\/+$/, '');
if (!/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(base)) {
  console.log('쓰는 법: node tools/relay-check.js https://ppodeuk-relay.<내계정이름>.workers.dev');
  process.exit(2);
}
(async () => {
  const times = [];
  let body = null;
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    let r = null;
    try { r = await fetch(base + '/', { cache: 'no-store', signal: AbortSignal.timeout(8000) }); } catch (e) { r = null; }
    if (!r) { console.log(`중계 서버에 닿지 않아요 (${base}) · 주소와 인터넷을 확인해 주세요`); process.exit(1); }
    const text = await r.text();
    times.push(performance.now() - t0);
    try { body = JSON.parse(text); } catch (e) { body = null; }
    if (r.status !== 200 || !body || body.ok !== true || body.service !== 'ppodeuk-relay') {
      console.log(`중계 서버가 아니에요: ${r.status} ${text.slice(0, 120).replace(/\s+/g, ' ')} · npx wrangler deploy가 끝났는지 확인해 주세요`);
      process.exit(1);
    }
  }
  let colo = '';
  try { const t = await (await fetch(base + '/cdn-cgi/trace', { cache: 'no-store', signal: AbortSignal.timeout(8000) })).text(); colo = ((t.match(/^colo=([A-Z]{3})$/m) || [])[1]) || ''; } catch (e) { colo = ''; }
  // (the first request also opens the connection: the average of the other four is what a room's messages see)
  const warm = times.slice(1), avg = Math.round(warm.reduce((a, b) => a + b, 0) / warm.length);
  const where = colo ? (COLO[colo] ? `${COLO[colo]}(${colo})` : colo) : '위치 모름';
  console.log(`중계 서버 OK · ${where} · 평균 ${avg}ms${colo && colo !== 'ICN' ? ' · 서울(ICN)이 아니에요: Claude에게 알려 주세요' : ''} (v${body.v})`);
  process.exit(0);
})();
