# 뽀득뽀득 목욕탕: 온라인 중계 서버 (WebSocket relay) v1 — design spec

Status: **design only** on `feat/ws-relay` (2026-10-27). The branch starts from the stopped WIP commit `8236a8d`
(`feat/cf-turn`: a Cloudflare Worker that minted TURN credentials). Nothing in this spec is built yet. Code is referenced
by function name, never by line number. Every function named here exists today (in `src/net.js`, `src/game.js`,
`build.js`, or the WIP's `cloudflare/`) unless it is marked **new**.

The owner picked option ② ("그냥 2번으로 가자 오늘 온라인 없어도되니까"): a WebSocket relay becomes the **default**
online path of the standalone deploy. There is no rush (online play can stay broken today), so v1 is built and tested
locally first, and the owner deploys it. Why: the Metered TURN trial ran out, so `'peer'` (PeerJS + WebRTC) fails on LTE
and even on the same Wi-Fi (mDNS host candidates). A relay that only forwards messages needs no NAT traversal, uses
`wss://` on port 443 only (this also works in the Apps in Toss WebView), and runs on the owner's own free Cloudflare
account. The research and the numbers marked *(research)* come from the scratchpad note `ws-relay-research.md`
(2026-10-27). Cloudflare's free-plan figures in it should be checked once on the official pricing page before release.

---

## 0. Decisions in one table

| Question | Decision |
|---|---|
| What is built | A Cloudflare Worker `ppodeuk-relay` (the WIP's skeleton) plus **one Durable Object per room** (class `Room`, SQLite-backed, Hibernation API). It forwards JSON frames between a room's host page and its guests. It has no game logic and stores nothing. The host page still runs the whole game (host-authoritative as today). |
| Client side | A **new `'ws'` link** in `net.js` (`wsLink`, modeled on `peerLink`) behind `makeCore`. The Session API that `game.js` uses does not change. `NET_V` stays 4 and there is no new game message. |
| Transport choice | **One function**, `netOrder()` (**new**, `game.js`), returns the list host / join try in order: the artifact `['room']`; a deploy with a relay `['ws', 'peer']`; a deploy without one `['peer']` (today); only this browser's tabs `['bc']`; forced `?net=x` gives `[x]`. `feat/toss` later edits only this function. |
| Finding a room | A code says nothing about its transport. A **joiner tries `ws`, then `peer`** when `ws` says not found / unavailable. An answer from a room that exists (`full`, `playing`, a join timeout after the relay found the host) stops the search. A **host falls back to `peer`** only when the relay is down or capped. |
| Room spaces | `w` (live web: web.app, firebaseapp.com, github.io), `p` (PR previews), `t` (Toss, for `feat/toss`). The Worker derives the allowed space from the page's `Origin`, so the three never meet. |
| Wire | Relay protocol **v1**: JSON text frames with short keys (section 2). The relay **issues seat ids** and **stamps every frame with its sender** (no spoofing). The member filter mirrors `peerLink`: a stranger can talk only to the host. |
| Guards | At most **6 sockets per room** (4 players + 2 spare). Frames up to **4,096 characters**. **75 messages/s per socket** (burst 150; a legit page sends about 35). **30 connects/min per IP**. An origin allowlist per space. |
| Phone backgrounding | **No resume in v1.** A socket that drops is gone (`'lost'`), exactly as `'peer'` is today. Field names are reserved for a v2 resume (section 8). |
| Hibernation | **Yes**: `ctx.acceptWebSocket`, seat data in socket attachments, a free keepalive by auto-response. An idle room (a host alone on the room screen) costs nothing. |
| TURN pieces of the WIP | **Dropped** (section 13). There is no TURN key, so `/turn` would answer 503 on every room, cost a Worker request, and delay the `peer` fallback. Kept: the Worker skeleton (route table, origin parser, limiter, health route), `build.js`'s relay-URL plumbing, the CI variable, the artifact check, and `.gitignore`. The TURN code stays in `8236a8d` if it is ever wanted again. |
| Page injection | `build.js`: `<script id="pg-relay">window.PG_RELAY={url:"https://…"};</script>` in the deploy page only, when `PG_RELAY_URL` / `relay.config.json` gives a URL. PR previews get `space:"p"` (a checked swap in `previewOf`). The itch zip strips it. The artifact never has it. Without a URL, the deploy page is today's page. |
| Traffic cuts now | No state frames while the host is alone. Pings every 2 s on `ws` (was 1 s). A free keepalive. The bigger lever (guest bodies at 20 Hz on `ws`) is written down but **not** done now (section 9). |
| Free cap | About **4.7 h of 4-player play a day** (about 6.5 h with 3 players, 10.5 h with 2). It resets at 09:00 KST. Past the cap: new rooms fall back to `peer`, and the friends panel says so. |
| Latency | Two hops via Cloudflare ICN instead of one direct path: roughly +15-40 ms one-way between host and guest. That fits inside the existing interpolation buffers (section 7). |
| Tests | `tools/relay-node-test.js` (the room core, the Worker and the DO with fakes, the local RFC 6455 server). `net-node-test.js` `testWs()` (a fake socket plus the real room core in-process). `serve.js` gets a local relay. New run-all jobs `net-ws`, `battle-net-ws`, `ws-deploy`. All `bc` tests stay. One full suite run at the end. |
| Owner | `CLOUDFLARE-SETUP.md` is rewritten: sign up, `npx wrangler login`, `npx wrangler deploy`, set the repository variable `RELAY_URL`, check on phones, watch usage. No TURN key, no secrets. |

---

## 1. Ground truth from the code (what this builds on)

| Thing | Code | Consequence |
|---|---|---|
| The core / link split | `makeCore(transport, role, code, opts)` does hello / welcome / full / lock, slots, the roster, pings and rtt, unstable / lost / host_left, stale-state guards, queueing, `STATE_MAX` 3600 / `MSG_MAX` 900. `openLink` returns a link `{selfId, hostId, setMembers(ids), sendState(obj), sendRel(to, env), health(), close(fast)}` that calls `h.state(from, obj)`, `h.rel(from, env)`, `h.gone(id, 'left'/'lost'/'gone')`, `h.fatal(why)`. Opening rejects with `fail('taken' / 'not_found' / 'unavailable' / 'timeout')`. | `'ws'` is one function, `wsLink(code, role, h, opts)`, plus a branch in `openLink`. Nothing else in the core changes except `TUNE.ws` and the transport list (4.6). |
| `peerLink` | A star: the host forwards guests' states and `'*'` / direct messages to admitted members (`members` from `setMembers`), stamps relayed frames with `f`, ignores states from non-members, skips states while a channel is backed up (`backedUp`), sends `bye` then closes 120 ms later. A dropped connection means `h.gone(id, 'lost')`. | The relay takes over the star's job with the same rules (2.3). The host phone uploads one copy of each snapshot instead of one per guest. |
| `TUNE` | `bc` / `peer`: `stateMs 30, pingMs 1000`; `peer`: `unstableMs 3000, lostMs 12000, joinMs 15000`. The core re-sends an unchanged state about once a second (`tick`) and sends the latest state to a newcomer (`setMembers`, `grew`). | `TUNE.ws` (4.1). Convergence for late joiners is already the core's job. |
| Transports list | `TRANSPORTS = ['room', 'peer', 'bc']`; `fromQuery` accepts `?net=` from it; `host()` re-rolls a generated code on `'taken'` (5 tries); `join()` rejects `not_found` / `full` / `unavailable` / `timeout`. | Adding `'ws'` to the list makes `?net=ws` work on test pages. |
| Engine traffic | Host: `netSnapshot` every `SNAP_EVERY` 3 frames (20 Hz) during play; in the room screen `netFrame` sends `{v, R}` every 30 frames (2 Hz). Guest: `guestSend` every `BODY_EVERY` 2 frames (30 Hz) during play. Each guest's core pings the host once a second. | The numbers behind the free cap (section 9). |
| Transport detection | `netTransport()` picks one value: `t.room ? 'room' : t.peer ? 'peer' : t.bc ? 'bc' : null`, waiting for the deferred PeerJS script first (`peerTag`, `domReady`). `localOnly` / `roomOffKind` read `NET.tr === 'bc'`. | `netOrder()` replaces the single choice for host / join. `NET.tr` stays "the first choice" for the friends panel (6.2). |
| `'peer'` UI sites | `renderFriends` (the note `NET_TEXT.peer`), `renderRoom` (the room hint "친구에게 이 게임 링크와 방 코드 C를 보내 주세요"), `inviteText` (the `?join=` link). | They become `codeTr(tr)` (**new**: `'peer'` or `'ws'`), so `ws` rooms say the same things (6.3). |
| Invites | Firestore `invites/{friend}/in/{me}` holds `{code, mode, nick, at}` (`ivInvite`); a `?join=CODE` link fills the code (`netSetupDOM`). | Neither carries a transport and neither needs to: the joiner's order finds the room (5.2). No rules change. |
| Build | WIP `build.js`: `readRelayUrl()` (`PG_RELAY_URL`, else `relay.config.json`; `none` = off), `RELAY_RE`, a `deploy-relay/` test fixture, a check that the artifact has nothing of the relay. CI passes `vars.RELAY_URL` to the deploy and preview builds and `none` to the test build. `run-all.js` builds with `PG_RELAY_URL=none` unless it is set. | Kept. Only what is injected changes (10.1). |
| PWA | The service worker caches the shell and the PeerJS CDN file. It never sees a WebSocket. | No `sw.js` change. |

---

## 2. Wire protocol (relay v1)

### 2.1 Connecting

```
wss://<relay host>/r/<space>/<code>?v=1&role=h        a host
wss://<relay host>/r/<space>/<code>?v=1&role=g        a guest
```

- `<space>` is `w`, `p` or `t` (3.4). `<code>` is the room code, `[a-z0-9]{4}` (the core's `CODE_RE`).
- `v=1` is the **relay** protocol version. It is separate from net.js's `V` (3), which still rides in the core's
  `hello`. A relay that does not speak `v` closes with 4426.
- The local test relay serves the same paths under a base, for example `ws://localhost:8798/ws/r/w/abcd` (11.3).
- The page never chooses its seat id. The relay issues it in `hi`.

### 2.2 Frames

All frames are UTF-8 JSON text. Binary frames are junk (2.6).

| Direction | Frame | Meaning |
|---|---|---|
| relay → page | `{k:'hi', v:1, id, h}` | Always the **first** frame. `id` is my seat id (`'s'` + 11 chars of `[a-z0-9]`, so it matches the core's `ID_RE`). `h` is the host's seat id (for the host it equals `id`). The link resolves on it. |
| page → relay | `{k:'s', q, d}` | My latest state: `q` is my state sequence number (integer, strictly rising), `d` is the state. |
| relay → page | `{k:'s', f, q, d}` | Another seat's state, stamped with its id `f`. |
| page → relay | `{k:'r', t, d}` | A reliable envelope (the core's `{u: msg}` or `{c: ...}`) to `t`: a seat id or `'*'`. |
| relay → page | `{k:'r', f, t, d}` | A reliable envelope from `f` (`t` is `'*'` or my id). |
| page → relay | `{k:'m', l:[ids]}` | **Host only**: the admitted members (guests) the relay may fan out to. The core sends it from `setMembers`. |
| relay → page | `{k:'gone', f, why}` | Seat `f` is gone: `why` is `'left'` (it said bye) or `'lost'` (its socket died). |
| page → relay | `{k:'bye'}` | I am leaving on purpose. The relay ends my seat as `'left'`. |
| page → relay | `{"k":"p"}` (exactly these 9 bytes) | Keepalive after 45 s with nothing sent. The DO's auto-response answers `{"k":"P"}` without waking (3.5). |

Every other `k` is junk. The relay re-serializes what it forwards (`JSON.parse`, then `JSON.stringify` with `f` set),
so a page can never smuggle fields past it. `d` is passed on as parsed JSON. The receiving core still cleans every
payload (`clean`).

### 2.3 Who hears what (the relay's routing)

"Members" are the ids in the host's last `m` frame that are still seated. A "stranger" is a guest seat that is not a
member yet (it is saying hello).

| Sender | Frame | Delivered to |
|---|---|---|
| host | `s` | every member |
| member | `s` | the host and every other member |
| stranger | `s` | nobody (dropped) |
| host | `r` to `'*'` | every member |
| host | `r` to an id | that seat, member or stranger (welcome / full / roster reach a stranger this way) |
| member | `r` to `'*'` | the host and every other member |
| member | `r` to the host or a member id | that seat only |
| member | `r` to a stranger id | nobody (as `peerLink`: member to member only) |
| stranger | `r` to the host, or to `'*'` | the host only (its `hello`; this mirrors `peerLink`) |
| stranger | `r` to anyone else | nobody |
| guest | `m` | ignored (host only) |
| anyone | `bye` / socket close | `gone` to every other seat (2.4) |

Order: one socket is one TCP stream, and the DO handles one event at a time. So frames from one sender reach each
receiver in the order they were sent. A reliable message sent right before `bye` reaches the others **before** the
`gone` (the core's "last word before leave" guarantee).

The relay caps `m` at 3 ids (the core's `MAX_PLAYERS` is 4 with the host). `MAX_PLAYERS`, `full` and `playing` are still
decided by the host core through hello / welcome; the relay only caps sockets (2.6).

### 2.4 Seats, presence, leaving

- **Host connects**: if the room already has a host seat → close **4409** (`taken`; `host()` re-rolls a generated code).
  Otherwise it takes the host seat, and the relay sends `hi` with `h = id`.
- **Guest connects**: if there is no host seat → close **4404** (`not_found`). Otherwise it gets a seat, and the relay
  sends `hi` with `h` set to the host's id. The core then says hello and the host core admits it.
- **A guest leaves** (`bye` → `'left'`, a dead socket → `'lost'`): the relay sends `{k:'gone', f, why}` to every other
  seat and frees the seat. The host core drops it (`onGone` → `dropMember`) and sends the new roster.
- **The host leaves** (`'left'` or `'lost'`): the relay sends `gone` for the host to every guest, then closes every guest
  socket with **4001**. The room is empty and its code is free at once. The guests' cores close `host_left` (bye) or
  `lost` (dead socket), exactly as with `'peer'` (`onGone`).
- v1 has **no grace**: a socket that drops cannot come back as the same seat (no resume), so waiting would only delay
  the news. Presence is therefore `hi` (who is the host) plus `gone`. The `down` / `up` frames are reserved for v2 (8.3).

### 2.5 Close codes

The relay (and the Worker in front of it) closes with these codes. The page maps them as follows.

| Code | When | Before `hi`: `wsLink` rejects | After `hi` |
|---|---|---|---|
| 1000 | After my own `bye` | (n/a) | ignored (I am leaving) |
| 4001 | The host is gone: sent to every guest right after the `gone` frame | `not_found` (the host left while I connected) | `h.gone(hostId, 'left')` unless a `gone` already ended it |
| 4400 | Bad path, role or grammar; 8 junk frames | `unavailable` (reason `bad`) | `h.fatal('lost')` |
| 4403 | The `Origin` is not allowed for this space (Worker) | `unavailable` (`origin`) | (n/a) |
| 4404 | A guest, and the room has no host | `not_found` | (n/a) |
| 4409 | A host, and the room already has one | `taken` | (n/a) |
| 4413 | Frames too big or binary, 3 times | (n/a) | `h.fatal('lost')` |
| 4426 | `v` is not 1 (Worker) | `unavailable` (`version`) | (n/a) |
| 4429 | Too many connects from this IP (Worker), or too many messages on this socket (DO) | `unavailable` (`rate`) | `h.fatal('lost')` |
| 4430 | The room already holds 6 sockets | `full` (reason `full`) | (n/a) |
| 4503 | The Worker caught an error from the DO; reason `cap` when it looks like the free-tier limit, else `busy` | `unavailable` (`cap` / `busy`) | (n/a) |
| 1006, 1001, 1011, 1012, anything else | Network gone, relay down, a deploy restarted the DO | `unavailable` (`down`) | `h.fatal('lost')` |
| (no `hi` within `TUNE.ws.connectMs` 6 s) | Relay unreachable or very slow | `unavailable` (`down`), and the socket is closed | (n/a) |

The Worker can only send a close code if it accepts a socket. So for its own refusals (4403, 4426, 4429, 4503, 4400)
it accepts **its own** `WebSocketPair` and closes it at once. That costs one Worker request and no Durable Object
request. A plain HTTP error would reach the page only as an anonymous 1006.

### 2.6 Size and rate caps

- **Frame size**: an incoming text frame longer than **4,096 UTF-16 code units** is dropped. The core never sends more:
  a state is at most `STATE_MAX` 3600 UTF-8 bytes plus about 30 bytes of envelope, and UTF-16 length is never more
  than UTF-8 length. Binary frames are dropped. Bad JSON, an unknown `k`, a bad `q` / `t` or a guest's `m` are dropped
  too. These count as **junk**: 3 oversize or binary frames close the socket with 4413, and 8 junk frames of any kind
  close it with 4400.
- **Message rate**: a token bucket per socket, 150 tokens, refilled at 75 per second. An empty bucket closes the socket
  with 4429. A real page sends about 35 messages/s at peak (a guest: 30 bodies, a ping every 2 s, shots and mashes; the
  host: 20 snapshots, pongs, room messages). The bucket lives in memory; a woken object starts every bucket full.
  The limit is there because **every incoming message is billed** (section 9), even one the relay drops.
- **Sockets**: at most **6 per room**: 4 players plus 2 spare. The spare lets a 5th page hear the host core's proper
  `full` answer, and covers a page that reconnects before its old socket's close is seen. The 7th gets 4430.
- **Connects**: at most 30 upgrades a minute per IP in the Worker (the `CONNECT_RATE` binding, else the isolate's own
  counter, `makeLimiter` from the WIP). A real player connects once per room.

### 2.7 Reserved for v2 (resume)

Not in v1, but kept free: `hi.tok`, the connect parameters `&id=&tok=&got=`, a per-seat downstream sequence `n` on
relayed `r` frames, the frames `{k:'down', f}` / `{k:'up', f}`, and close code 4410 (gap too big). Section 8.3 has the
sketch.

---

## 3. The relay (`cloudflare/`)

### 3.1 Files

| File | Role |
|---|---|
| `cloudflare/wrangler.toml` | Rewritten (3.2). |
| `cloudflare/package.json` | Kept. The description becomes "뽀득뽀득 목욕탕 relay Worker: a WebSocket relay for online rooms (CLOUDFLARE-SETUP.md)". |
| `cloudflare/src/index.js` | The Worker entry: `export default { fetch(req, env) { return route(req, env, io) } }` and `export { Room } from './room-do.js'`. |
| `cloudflare/src/relay.js` | The WIP file, trimmed: the route table (`/` health, `/r/<space>/<code>` relay), the space-aware origin parser, `makeLimiter`, `gate()` (**new**), the refusal helper. No `/turn`. |
| `cloudflare/src/room.js` (**new**) | `RoomCore`: the pure room logic (seats, routing, caps, junk, buckets). It uses no Cloudflare API, so the DO and the local Node relay (11.3) run the same code. |
| `cloudflare/src/room-do.js` (**new**) | `class Room`: the Durable Object wrapper (Hibernation API → `RoomCore`). It is a plain class with no `cloudflare:workers` import, so Node can load it in tests. |

### 3.2 `wrangler.toml`

```toml
# 뽀득뽀득 목욕탕 relay Worker (CLOUDFLARE-SETUP.md): one Durable Object per room code forwards the game's messages
# between the host page and its guests (design/relay.md). No secrets: nothing here or in the repo is private.
#   GET /                      {ok, service} - a health check to open in a browser after `npx wrangler deploy`
#   GET /r/<space>/<code>      WebSocket upgrade into that room (space w = the web game, p = PR previews, t = Toss)
# Deploy from this folder:  npx wrangler deploy      (it drops every open room: deploy outside play time)
name = "ppodeuk-relay"
main = "src/index.js"
compatibility_date = "2026-09-01"
workers_dev = true

[vars]
# which pages may enter which space: "<space>=<origin>", space- or comma-separated; '*' = one host label part
# (never a dot), for the PR preview channels bubble-c3ad4--pr23-ab12cd34.web.app
ORIGINS = "w=https://bubble-c3ad4.web.app w=https://bubble-c3ad4.firebaseapp.com w=https://bobo33772-blip.github.io p=https://bubble-c3ad4--*.web.app t=https://ppodeuk-bath.apps.tossmini.com t=https://ppodeuk-bath.private-apps.tossmini.com"
# "1": also http://localhost:<port> / 127.0.0.1 / [::1], in any space (testing against the deployed Worker); "0" when live
ALLOW_LOCALHOST = "0"

[[durable_objects.bindings]]
name = "ROOMS"
class_name = "Room"

# SQLite-backed classes are the ones the Workers Free plan allows (the relay stores nothing in it)
[[migrations]]
tag = "v1"
new_sqlite_classes = ["Room"]

# a light abuse guard: at most 30 WebSocket connects a minute per client IP (per Cloudflare location)
[[ratelimits]]
name = "CONNECT_RATE"
namespace_id = "7301"

  [ratelimits.simple]
  limit = 30
  period = 60

# off: every relayed message would be a log event (far past the free log quota, and no use).
# Live view instead: npx wrangler tail
[observability]
enabled = false
```

### 3.3 The Worker's `fetch` (`route` in `relay.js`)

1. `GET /` → `{ok: true, service: 'ppodeuk-relay', v: 1}` (JSON, `Cache-Control: no-store`). This is the owner's
   check after a deploy. It needs no origin.
2. Other paths: `gate()` (**new**, exported, also used by the local relay) checks in this order:
   - the path is `^/r/(w|p|t)/([a-z0-9]{4})$`, else 404 (plain HTTP when it is not an upgrade, else close 4400);
   - `Upgrade: websocket`, else 426;
   - the `Origin` is allowed for that space (3.4), else close 4403;
   - `v=1` and `role` is `h` or `g`, else 4426 / 4400;
   - `CONNECT_RATE.limit({key: ip})` succeeds (`CF-Connecting-IP`; the isolate counter when the binding is missing or
     fails), else 4429.
3. `env.ROOMS.get(env.ROOMS.idFromName(space + ':' + code)).fetch(req)` returns the DO's 101 response. A throw becomes
   a refusal with 4503. Its reason is `cap` when the error message matches `/exceed|limit|quota/i` (the exact text of
   Cloudflare's free-tier error is not confirmed), else `busy`.
4. There is no `locationHint`. A DO is created near its first request (the host's connect), which for Korean players
   means a DO-capable data center near ICN *(research: where.durableobjects.live lists ICN)*. If the phone test
   (12, step 6) shows a far placement, `locationHint: 'apac'` is the documented knob.

Refusals never touch the DO, so a flood of bad connects costs Worker requests (100,000 a day free) and not DO requests.

### 3.4 Origins and spaces

- `ORIGINS` is parsed by the WIP's `parseOrigins` grammar (exact origins, `*` = one `[a-z0-9-]+` label), extended with a
  `<space>=` prefix. `originAllowed(origin, space, env)` is true when an entry of that space matches. Loopback origins
  (`http://localhost:<port>`, `127.0.0.1`, `[::1]`) pass for any space only when `ALLOW_LOCALHOST` is `1`.
- `null`, a missing `Origin`, or anything longer than 200 characters is refused. The check stops other websites from
  using the relay from their visitors' browsers. A non-browser client can fake any `Origin`; room codes stay the only
  access control, as with PeerJS today (risk 6).
- **Why spaces**: `p` keeps PR previews (other builds, their own save keys, no sign-in gate) out of live rooms. `t` keeps
  Toss rooms (friendly matches, game keys) apart from web rooms, the role `ppodeuk-t-` plays for PeerJS in
  `design/toss.md`. The page names its space (`window.PG_RELAY.space`, default `w`) and the Worker refuses a space its
  origin does not own. So a preview page asking for `w` gets 4403, and the client then falls back as for any refusal.
- itch.io is not listed: `html-classic.itch.zone` serves every itch game, and the itch zip has no relay anyway (10.1).

### 3.5 The Durable Object `Room` (`room-do.js`)

```
class Room {
  constructor(ctx, env)       // this.ctx = ctx; this.core = null (built lazily, see wake);
                              // ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"k":"p"}', '{"k":"P"}'))
  async fetch(req)            // the Worker already ran gate(); role from the URL
                              // const [client, server] = Object.values(new WebSocketPair());
                              // this.ctx.acceptWebSocket(server);            (hibernatable)
                              // const no = this.wake().open(server, {role}); if (no) server.close(no.code, no.reason);
                              // return new Response(null, {status: 101, webSocket: client});
  webSocketMessage(ws, msg)   // this.wake().message(ws, msg)
  webSocketClose(ws, code)    // this.wake().closed(ws); try { ws.close(1000) } catch {}   (completes the handshake)
  webSocketError(ws)          // this.wake().closed(ws)
  wake()                      // this.core ||= new RoomCore({... io below ..., seats: this.ctx.getWebSockets()
                              //   .map((s) => [s, s.deserializeAttachment()]).filter(([, a]) => a && a.i)})
}
```

- **Hibernation**: sockets are accepted with `ctx.acceptWebSocket`, so the object may leave memory while its sockets stay
  open (no duration is billed then), and its handlers run again on the next frame. Everything `RoomCore` needs after a
  wake is in the sockets' **attachments** (`serializeAttachment`, at most 2 KB each): `{i: seatId, r: 'h' or 'g'}`, and
  on the host's socket also `m: [member ids]`. The core is rebuilt from `ctx.getWebSockets()` on the first event after a
  wake. Token buckets and junk counters live in memory only; after a wake they start fresh (a wake follows about 10 s of
  silence, so they would be full anyway).
- During play a room never hibernates (about 100 messages a second). It does hibernate when only a host sits on the room
  screen: with the cut in 9.2 that host sends nothing. The keepalive (`{"k":"p"}`, after 45 s of not sending) is
  answered by the **auto-response**, which does not wake the object (whether it is billed at all is not confirmed;
  either way it is at most about 1,900 messages a day per idle socket, about 100 requests if they count).
- **No storage**: no SQLite rows, no alarms, nothing written per message. Durable Object CPU per message stays tiny
  (one parse, one stringify, at most 5 sends).
- The `RoomCore` io the DO hands over: `send(ws, str)` → `ws.send(str)` (wrapped in try), `close(ws, code, reason)`,
  `save(ws, att)` → `ws.serializeAttachment(att)`, `rand(n)` → `crypto.getRandomValues`, `now()` → `Date.now()`.

### 3.6 `RoomCore` (`room.js`, shared with the local relay)

```
new RoomCore({send, close, save, rand, now, seats?: [[sock, attachment]]})
core.open(sock, {role: 'h' | 'g'}) -> null | {code, reason}   // null: seated, 'hi' sent
core.message(sock, data)                                       // string (or anything else = junk)
core.closed(sock)                                              // the socket closed or failed: the seat is 'lost'
core.info() -> {host: id|null, seats: n, members: [ids]}       // tests and the local relay's admin page
```

Constants at the top of `room.js`: `RELAY_V = 1`, `MAX_SOCKS = 6`, `MAX_MEMBERS = 3`, `FRAME_MAX = 4096`,
`BUCKET = 150`, `REFILL = 75`, `JUNK_BIG = 3`, `JUNK_ANY = 8`, and the close codes of 2.5 as named constants
(`C_TAKEN = 4409`, ...). The 2.3 table is the whole routing logic. `closed()` on a socket whose seat already said
`bye` does nothing more.

### 3.7 Restarts, evictions, the cap

| Event | What happens | What the players see |
|---|---|---|
| Hibernation (idle object) | Sockets stay open; the object is rebuilt from attachments on the next frame. | Nothing. |
| `npx wrangler deploy` (a new version), or a Cloudflare runtime update | Every DO restarts and its sockets are closed (code 1001/1006/1012; the exact code is not confirmed and does not matter). The new object has no seats. | Every page in a room: `h.fatal('lost')` → **연결이 끊겼어요**. They make a new room. That is why the owner guide says to deploy outside play time. |
| Memory eviction of a busy object | Not expected while sockets are active. If it happens, it is the same as a restart. | 연결이 끊겼어요. |
| Free-tier cap reached mid-game | Not confirmed. Most likely the object's next events fail and its sockets close. | 연결이 끊겼어요. The next 방 만들기 / 참여 gets 4503 `cap` and falls back to `peer` (5.3). |
| Worker free requests (100,000 a day) exceeded | Cloudflare answers with its own error page and the upgrade fails (1006). | Treated as relay `down` (5.3). |

---

## 4. The `'ws'` link (`src/net.js`)

### 4.1 Constants

```js
const TRANSPORTS = ['room', 'ws', 'peer', 'bc'];
const WS_V = 1;                                  // the relay protocol (design/relay.md 2)
const WS_SPACES = ['w', 'p', 't'];
TUNE.ws = { stateMs: 30, pingMs: 2000, unstableMs: 3000, lostMs: 12000, joinMs: 12000, connectMs: 6000, quietMs: 45000, byeMs: 150 };
```

- `pingMs` 2000 is a traffic cut (9.2). The core still hears the host constantly during play (snapshots) and every half
  second on the room screen (`R`). So `unstableMs` 3000 and `lostMs` 12000 work as they do for `'peer'`.
- `lostMs` (12 s) only matters for a half-open socket (a phone that changed networks without a close, which TCP can
  take minutes to notice). A clean close is reported at once.

### 4.2 Finding the relay: `relayInfo()` (**new**), `transports()`, `fromQuery()`

- `relayInfo()` → `{base, space}` or `null`:
  1. `fromQuery().relay`: a test page's `?relay=`, accepted **only** as `ws://` or `wss://` to `localhost`,
     `127.0.0.1` or `[::1]` (an optional port, an optional path of `[A-Za-z0-9._~/-]`). Anything else is ignored.
     Otherwise a link like `https://bubble-c3ad4.web.app/?relay=wss://someone-else` could send a player's room to a
     stranger's server.
  2. Else `window.PG_RELAY`: a plain object whose `url` is `https://<host>[:port][/path]` (the WIP's `RELAY_RE`
     grammar) or `http://` to a loopback host. `https:` becomes `wss:`, `http:` becomes `ws:`. `space` defaults to
     `'w'` and must be one of `WS_SPACES`.
  3. Else `null`.
  net.js only **reads** `window.PG_RELAY` (it never assigns it: `check-pages` relies on that, 10.3).
- `transports()` → `{room, ws, peer, bc}` with `ws: typeof W.WebSocket === 'function' && !!relayInfo()`.
- `fromQuery()` → `{transport, net, relay}`. `?net=ws` is accepted because `'ws'` is in `TRANSPORTS`.
- `lobby('ws')` resolves `null` (no 열린 방 list, as for `'peer'`).

### 4.3 `wsLink(code, role, h, opts)` (**new**) against the link interface

| Link member | `'ws'` behaviour |
|---|---|
| open | `new WebSocket(base + '/r/' + space + '/' + code + '?v=1&role=' + (host ? 'h' : 'g'))`. It resolves on the first frame `hi` (`v` 1, `id` and `h` matching `ID_RE`): `link.selfId = hi.id`, `link.hostId = hi.h` (a host checks `h === id`). A close before `hi` rejects per 2.5. No `hi` within `connectMs` (6 s): close it and reject `unavailable` (`down`). A relay already known to be capped or down rejects at once without a socket (5.3). |
| `selfId` / `hostId` | From `hi`. The relay issues them, so the core's `admit()` / roster logic sees ordinary ids. |
| `setMembers(ids)` | Host: send `{k:'m', l: ids}` and remember whether the list is empty. Guest: nothing (the relay decides). |
| `sendState(obj)` | Skipped when the host's member list is empty (9.2), or while `ws.bufferedAmount > 65536` (latest wins; the core's once-a-second re-send brings the newest one later, as with `peerLink`'s `backedUp`). Otherwise send `{k:'s', q: ++stateQ, d: obj}`. |
| `sendRel(to, env)` | Always sent, never skipped: `{k:'r', t: to, d: env}`. TCP keeps the order, and the session ends if the socket dies, so "exactly once" holds without sequence numbers in v1. |
| incoming `s` | Drop when `f` fails `ID_RE` or `q <= lastQ[f]` (cheap, mirrors the other links), else `h.state(f, d)`. |
| incoming `r` | `t` must be `'*'` or my id, then `h.rel(f, d)`. |
| incoming `gone` | `h.gone(f, why === 'left' ? 'left' : 'lost')`. |
| incoming `P` | Ignored (the keepalive's answer). |
| `health()` | `false` while the socket is not `OPEN`, while I am leaving, or while `bufferedAmount` has stayed above 256 KB for over 2 s (a stalled uplink: the core shows 연결이 불안정해요). Else `true`. |
| keepalive | When nothing was sent for `quietMs` (45 s), send `{"k":"p"}` (a timer checked from the link's own 5 s interval). |
| `close(fast)` | Mark leaving (incoming frames ignored from now on). Send `{k:'bye'}`. `fast` (pagehide): `ws.close(1000)` at once (frames queued before the close frame still go out first while the page lives). Slow: close once `bufferedAmount` is 0 or after `byeMs` 150 ms, whichever comes first. |
| unexpected close after `hi` | 4001 → `h.gone(hostId, 'left')` (normally the `gone` frame already ended the session). Anything else → `h.fatal('lost')`. |

`openLink()` gains `if (transport === 'ws') return wsLink(code, role, h, opts);`.

### 4.4 The test network on `ws`

`?net=ws&lat=60&jit=30` (test pages; `simOf` as on `bc`) delays every outgoing and incoming frame by latency plus a
random jitter, through the `fifo()` queue `bcLink` already has. This keeps the order (TCP never reorders) and **never
drops** (`drop` is ignored on `ws`). Each page models its own link, as on `bc`. Without `net`, there is no delay.

### 4.5 Host and join with a transport list

`PG.Net.host(opts)` and `PG.Net.join(opts)` accept `opts.transport` as **a string (today) or an array** (**new**). An
array is tried in order, each entry with its own `makeCore` and its own timers:

- **host**: the first success wins. `taken` with an explicit `opts.code` throws at once (the test API). `unavailable`
  or `timeout` goes on to the next entry.
- **join**: the first success wins. `full` (either reason) and a `timeout` that happened **after** the relay's `hi`
  (the room exists, its host did not answer) stop the search. `not_found` and `unavailable` go on to the next entry.
- **The final error**, when every entry failed, is the most telling one: `full` > `timeout` > `not_found` >
  `unavailable`. It carries `.transport` (who said it) and `.relay` (`'cap'`, `'down'` or `null`, 5.3).
- **The session** carries `s.transport` (the one that worked, as today) and **new** `s.fallback`: `null`, or `'cap'` /
  `'down'` when an earlier `'ws'` entry was skipped or failed for that reason.

A string transport behaves exactly as before. All of this is in net.js so that `net-node-test.js` can test it with fakes.

### 4.6 Relay memory and `PG.Net.relay()` (**new**)

- After a 4503 `cap`: the relay counts as capped until the next 00:00 UTC (09:00 KST). After `down` (1006, a connect
  timeout, 4503 `busy`): it counts as down for **60 s**. While capped or down, a `'ws'` entry is skipped at once (no
  socket, no Worker request, no 6 s wait) and the result has `fallback` set.
- This lives in memory only (never in storage). A reload asks again.
- `PG.Net.relay()` → `{on: boolean, state: 'ok' | 'cap' | 'down', until: ms | 0}` for `game.js`. `on` is
  `!!relayInfo()`.
- `PG.Net._relayReset()` (tests only) forgets the state.

### 4.7 The header comment

net.js's header gains a `'ws'` section (after `'room'`, before `'peer'`): the relay, the URL grammar, the frames in
one paragraph, what is stamped, the fallback rules of 4.5 / 4.6, and a pointer to this spec. The `'peer'` paragraph loses
the WIP's sentence about `window.PG_RELAY`'s TURN servers.

---

## 5. Transport choice, finding a room, falling back

### 5.1 The order (`netOrder()`, the one place)

```js
// THE transport choice (design/relay.md 5.1): the list 방 만들기 / 참여 try in order. Forced (?net=x, tests) = [x];
// the artifact's room; the deploy: the relay first (window.PG_RELAY), PeerJS behind it while it still ships; only this
// browser's tabs last. (feat/toss: an AIT.on branch here, e.g. ['ws'] or ['ws', 'peer'] - nowhere else)
function netOrder() {
  if (NET.trForced) return [NET.tr];
  const t = NET.trInfo || {};
  if (t.room) return ['room'];
  const out = [];
  if (t.ws) out.push('ws');
  if (typeof window.Peer === 'function') out.push('peer');
  if (!out.length && t.bc) out.push('bc');
  return out;
}
```

`window.Peer` is read when the button is tapped, not at detection. So PeerJS arriving late still joins the list.

### 5.2 How a joiner finds a room

A room code does not say which transport made it, and invites (`ivInvite`, `?join=`) carry only the code. The joiner
tries its own `netOrder()`:

| Host's room is on | Joiner's relay | What happens | Time |
|---|---|---|---|
| `ws` | up | `ws` finds it. | ~0.2-0.5 s |
| `peer` (the host's relay was down or capped) | up | `ws` says `not_found` (4404, about one round trip), then `peer` finds it. | + ~0.2 s |
| `peer` | capped or down (known) | `ws` is skipped, `peer` finds it. | as today |
| `ws` | down for this phone only (a network that blocks workers.dev) | `ws` fails `down`, `peer` says `not_found`: **방을 찾을 수 없어요**. | ~1-7 s |
| (none: a typo) | up | `ws` `not_found`, then `peer` `not_found`: **방을 찾을 수 없어요**. | ~1-3 s |

A ws room and a peer room with the same code at the same time: the joiner gets the ws one. That needs two hosts drawing
the same code on two transports at once (about 1 in 900,000 per pair of live rooms), and is accepted.

### 5.3 Falling back, and what the player sees

- **Host**: `ws` first. On `down` or `cap` it goes on to `peer` (when PeerJS is there). The "연결 중…" chip stays up the
  whole time. The worst case is about 6 s (connect timeout) plus up to 12 s for PeerJS. A known down or capped relay
  costs nothing (4.6).
- **Room hint** (the host only): when `s.fallback` is set, `renderRoom`'s hint line (shown while the room is not full)
  is the fallback line instead of the share line. The big code and 코드 복사 are still there. A guest that reached a
  `peer` room by falling back sees the usual share line: the fallback lines say "열었어요", which is the host's news.
- **Friends panel**: while `PG.Net.relay().state === 'cap'`, the note under the buttons is `relayCap` instead of
  `NET_TEXT.peer`.
- **A failed join while capped**: the error line gets `capTail` appended.
- **A ws join timeout** (the relay found the host, the host never welcomed): `errText` shows `joinQuiet`, not
  `joinFail`. `joinFail`'s advice ("같은 와이파이에서 해 보거나") is about direct connections.
- **Nothing works** (relay down and no PeerJS): as today, 온라인에 연결할 수 없어요.

New `NET_TEXT` entries (verbatim):

| Key | Text |
|---|---|
| `relayCap` | `오늘 무료 중계를 다 써서 오전 9시까지는 직접 연결만 돼요` |
| `hintCap` | `오늘 무료 중계를 다 써서 직접 연결로 열었어요 · 오전 9시에 다시 채워져요` |
| `hintDown` | `중계 서버에 닿지 않아 직접 연결로 열었어요 · 친구가 못 들어오면 잠시 뒤 다시 만들어 주세요` |
| `capTail` | ` · 오늘 무료 중계는 오전 9시에 다시 채워져요` |
| `joinQuiet` | `방장 기기가 대답하지 않아요 · 잠시 뒤 다시 해 주세요` |

"오전 9시" is right because the free daily limits reset at 00:00 UTC *(research)* and the players are in Korea.

---

## 6. `game.js` changes (small; the rest of the game unchanged)

### 6.1 Host and join

- `netHost` / `netJoin`: `PG.Net.host(Object.assign(peerOpts({transport: netOrder()}), net ? {net} : {}))` (and the
  same for join with `code`). `peerOpts` goes back to the synchronous pre-WIP version: it only adds
  `window.PG_PEER_OPTIONS`, which `'peer'` alone reads.
- An empty `netOrder()` is handled like `tr === null` today: 온라인에 연결할 수 없어요.
- `netAttach`: **new** `NET.str = s.transport` (the transport of this session) and `NET.fb = s.fallback`. `netClose`
  clears both. `NET.tr` keeps meaning "this page's first choice" (detection, the friends panel, `localOnly`).

### 6.2 Detection (`netTransport`)

- `NET.trInfo` now includes `ws`. When `t.ws` is true, `netTransport` resolves `'ws'` **without** waiting for the
  deferred PeerJS (`peerTag` / `domReady` wait). `NET.tr` becomes `t.room ? 'room' : t.ws ? 'ws' : t.peer ? 'peer' :
  t.bc ? 'bc' : null`.
- The PeerJS wait, `peerWatch`, the `'peer'` block card and `loadingPeer` stay for a deploy without a relay, unchanged.

### 6.3 The `'peer'` UI sites → `codeTr()`

`const codeTr = (tr) => tr === 'peer' || tr === 'ws';` (**new**: rooms shared by code). It replaces
`NET.tr === 'peer'` in:
1. `renderFriends`: `else if (codeTr(tr)) note = NET_TEXT.peer;` (with `relayCap` taking its place while capped, 5.3).
2. `renderRoom`: the hint (`codeTr(NET.str)` → the share line, or `hintCap` / `hintDown` when `NET.fb` is set and
   `NET.role === 'host'`).
3. `inviteText`: `if (codeTr(NET.str))` adds the `?join=` link.

The `'peer'`-specific sites stay as they are: `roomOffKind` / `OFF_ERRS` / `peerHead` / `peerOff`, all about PeerJS
failing to load.

### 6.4 A readout for the phone test

With `?netinfo=1` in the page URL, `renderRoom` adds ` · ws 84ms` (the session's transport and `stats().rttMs`, refreshed
every second while the room screen is open) to the end of the room hint line. On a guest, the rtt is the round trip to
the host through the relay. This is only for the owner's measurement (12, step 6). Nothing is shown without the
parameter.

### 6.5 Untouched

`NET_V` (4), every message type, `snapOf` / `netSnapshot` / `guestSend` rates, `netGated` (the Google gate), the trophy /
coin / party flows, `localOnly` / `roomOffKind`, the lobby (room only), and the artifact path.

---

## 7. Latency

- **Path**: today, with a direct WebRTC link, host and guest are one hop apart (about 10-30 ms one-way in the same city).
  Through TURN it was often farther. Via the relay it is two hops: phone → Cloudflare ICN (Seoul) → the room's DO →
  ICN → phone. *(research)*: the owner's PC reaches colo ICN with a warm TCP connect of 19-27 ms. Not measured yet on
  SKT / KT / LGU+ LTE.
- **Expected**: host ↔ guest one-way about 30-70 ms (LTE), round trip about 60-140 ms. That is roughly +15-40 ms
  one-way compared with a good direct link. Guest ↔ guest bodies already went through the host's phone with `'peer'`
  (two hops), so they are no slower.
- **What absorbs it**:
  - a guest moves its own animal locally (no lag on its own controls);
  - the world is drawn `SNAP_DELAY` 8 ticks (~133 ms) behind the newest snapshot, and other players `PEER_DELAY` 6
    ticks (~100 ms) behind their newest body; both buffers grow with measured jitter (`bufPush`, `bufDelay`);
  - the guest's prediction lifetimes follow `stats().rttMs` (`guestUpdate`: `predLife`, `claimWait`);
  - battle captures are judged against what the victim saw (`rt`, `lagTrapCheck`).

  Together these absorb up to about 60 ms one-way. Above about 100 ms one-way, hits and pickups start to feel late for
  guests.
- **Jitter / head-of-line blocking**: a lost TCP packet on LTE stalls the frames behind it (200 ms or more). The current
  PeerJS channel is reliable and ordered too (SCTP), so this is the same class of problem, not a new one.
- **Uplink win**: the host's phone uploads one snapshot (about 3.4 KB at 20 Hz, about 68 KB/s) instead of one per guest
  (about 204 KB/s for three). On LTE uplinks this helps the host.
- **If routing is bad** (a carrier served from Tokyo or Hong Kong, 100 ms or more one-way): the same `RoomCore` can run
  on a Seoul VM behind `wss` (out of scope, risk 1). Nothing in the client would change but the URL.

---

## 8. Phone backgrounding

### 8.1 v1: no resume (the smaller safe option)

A socket that closes is gone. This is exactly what `'peer'` does today, so no game-layer flow meets a new state.

| Case | Result |
|---|---|
| A guest switches apps for a few seconds, and the OS keeps the socket | Nothing is lost. The backlog arrives when JS resumes, and the core may show 연결이 불안정해요 briefly. The host keeps the guest unless it was silent for more than `lostMs` 12 s. |
| The OS kills a guest's socket (iOS often does for a suspended page; the Toss WebView is not confirmed) | The relay sends `gone(lost)`: the host drops the guest at once. Back on the page, the guest sees 연결이 끊겼어요. It can join again with the code unless a round is running (`playing`). |
| The host's page is hidden | The game freezes for everyone (the rAF loop stops), as today. If the socket dies, the room ends: guests see 연결이 끊겼어요. |
| A network switch (Wi-Fi ↔ LTE) | The socket dies: the same as above for that player. |

### 8.2 Why not resume now

Resume needs tokens, a sequence ring on both sides (256 frames), a grace timer that must stay below `lostMs`, a retry
backoff, and a v2 close code. That is about 3 h *(research)*, and it adds failure modes the game layer has never met
(a seat that comes back mid-round with a gap of snapshots). Measure first: if the phone test (12, step 6) shows
backgrounding kicks players often, v2 adds it.

### 8.3 v2 sketch (reserved names, 2.7)

`hi` gains `tok` (16 chars) and `n` (the last upstream number the relay saw). Relayed `r` frames get a per-seat
downstream `n`; the relay keeps the last 256 per seat. A socket that drops keeps its seat for a grace of 10 s (below
`lostMs` 12 s), and the others get `{k:'down', f}` (the unstable chip). The page reconnects at about 0.3 / 1 / 2 / 4 s
with `&id=&tok=&got=`; both sides resend their rings above the other's number. States need no replay (latest wins). A
gap bigger than the ring closes with 4410, and so does an expired seat: then `'lost'`. Hibernation attachments would
then need the ring, so the ring moves to the DO's memory with a size check, or to SQLite (writes: 100,000 rows a day free).

---

## 9. Traffic and the free cap

### 9.1 What is billed *(research; check the pricing page once)*

On Workers Free, Durable Objects allow 100,000 requests and 13,000 GB-s of duration a day. Each **incoming** WebSocket
message counts as 1/20 of a request. Outgoing messages are free. A connect is 1 request. There is no egress charge.
Past a limit, further operations of that type fail until 00:00 UTC (09:00 KST); there is no bill. Duration (128 MB per
active object) allows about 28 room-hours a day, so **requests are the limit**.

### 9.2 Messages into the relay during play (`SNAP_EVERY` 3, `BODY_EVERY` 2, the core's pings)

| Players | Host | Each guest | Total /s | Billed req/s | Per hour | **Play hours a day** |
|---|---|---|---|---|---|---|
| 4 | 20 snapshots + 3 pongs | 30 bodies + 1 ping + about 1 action | about 119 | 6.0 | about 21,400 | **about 4.7** |
| 3 | 20 + 2 | 32 | about 86 | 4.3 | about 15,500 | about 6.5 |
| 2 | 20 + 1 | 32 | about 53 | 2.65 | about 9,500 | about 10.5 |

The room screen: the host sends `R` at 2 Hz, and each guest pings. With 4 players that is about 5 messages a second,
about 900 requests an hour.

### 9.3 Cuts: done now

1. **No state without an audience** (`wsLink.sendState` while the host's member list is empty). A host alone on the
   room screen (the classic "tab left open") would otherwise send 2 states a second all day, about 8,600 requests a day.
   Now it sends nothing, and with hibernation (3.5) its idle room costs nothing at all. There is no feel change: the
   core sends the latest state to the first guest the moment it is admitted (`setMembers`, `grew`).
2. **Pings every 2 s on `ws`** (`TUNE.ws.pingMs`). This saves 3 messages/s in a 4-player game and halves the room
   screen's ping traffic. The rtt readout updates every 2 s instead of every 1 s. There is no feel change (health comes
   from the host's states).
3. **A free keepalive** (auto-response, 3.5) instead of any client-side heartbeat.
4. **Refusals in the Worker** (2.5, 3.3): bad connects never reach a Durable Object.

After 1-2, 4-player play is about 116 messages/s → about 4.8 h a day. The cuts matter for idle rooms and abuse, not for
play.

### 9.4 Levers: not now

- **Guest bodies at 20 Hz on `ws`** (`BODY_EVERY` 3 when `NET.str === 'ws'`): 4 players → about 86 messages/s → about
  6.5 h a day. The cost: other players' movement is sampled every 50 ms instead of 33, and a move bit's edge can show
  one frame later. Pull this lever only if the dashboard shows real days near the cap. The owner's group plays far
  less than 4.7 h a day.
- **Skip unchanged bodies**: the body carries `k` (the frame) and `rt`, so it is never unchanged as sent, and the
  interpolation buffers would read gaps as jitter. Not worth it.
- **Batching control messages into state frames**: pings are about 3% of the traffic. Not worth the protocol change.
- **The paid plan** ($5/month, 1M requests included *(research)*): the owner's call if the cap ever bites.

### 9.5 At the cap

New rooms fall back to `peer` with 5.3's texts. Rooms already running probably drop (risk 3). At 09:00 KST everything
works again. A reload is not needed: the capped state expires by itself (4.6).

---

## 10. Build, CI, the artifact

### 10.1 `build.js`

- Kept from the WIP: `readRelayUrl()` (`PG_RELAY_URL` > `bogeul/relay.config.json` `{"url": ...}`; `PG_RELAY_URL=none`
  means no relay whatever the file says), `RELAY_RE`, and its error messages.
- `relayTag(u)` becomes one line (nothing inlined from `src/relay/`):
  `` `<script id="pg-relay">window.PG_RELAY={url:${JSON.stringify(u).replace(/</g, '\\u003c')}};</script>\n` ``.
  Its place in the head is unchanged: after `peerTag`, before the PeerJS script.
- `previewOf`: one more checked `swap()` turns `window.PG_RELAY={url:"…"}` into `window.PG_RELAY={url:"…",space:"p"}`
  when the page has a relay. This is a no-op without one, and is checked by count.
- `tools/pack-itch.js` (`itchPage`) strips `<script id="pg-relay">…</script>`, checked by count. The itch build stays on
  `peer` (3.4).
- Build checks (replacing the WIP's): the deploy page has exactly one `pg-relay` tag when `RELAY` is set and none
  otherwise; a preview with a relay has `space:"p"`; the artifact contains no `pg-relay`, no `PG_RELAY=` assignment
  and no `workers.dev`; the itch zip's page has no `pg-relay`.
- Without a URL, the deploy page is byte-for-byte what it would be without this feature (only the `net.js` / `game.js`
  code differs). Its order is `['peer']`: today's behaviour.
- `deploy-relay/` fixture: kept, with the placeholder `http://127.0.0.1:9`. The `ws-deploy` job rewrites it (11.3).
- `.gitignore`: add `relay.config.json` (a local convenience; CI uses the variable). Keep the WIP's
  `cloudflare/.wrangler/`, `cloudflare/node_modules/`, `cloudflare/.dev.vars`.

### 10.2 CI

- `deploy.yml` (both builds) and `pr.yml` (the preview build): `PG_RELAY_URL: ${{ vars.RELAY_URL }}` (from the WIP).
  The variable is not secret: it is the public Worker address. If it is empty, the build is today's.
- `pr.yml` test build: `PG_RELAY_URL: none` (from the WIP). The quick `JOBS` list replaces `relay-worker relay-client`
  with `relay-node`. `net-node` already runs `testWs`.
- The `TURN_CONFIG` → `turn.config.json` steps stay as they are (the static TURN list for the `peer` fallback; with the
  expired Metered account it adds nothing, and the owner may delete the secret).

### 10.3 The artifact

Untouched in behaviour. It has no `window.PG_RELAY`, so `transports().ws` is false and `netOrder()` is `['room']`.
`net.js` (inlined there too) contains the `wsLink` code, but nothing reaches it. `tools/check-pages.js` keeps the WIP's
assertion with the TURN parts removed: `!/PG_RELAY\s*=|pg-relay|workers\.dev/.test(art)`. Because the artifact inlines
`net.js` and `game.js` with their comments, neither file may contain the strings `pg-relay` or `workers.dev`, nor
assign `PG_RELAY` (comments included: the header says "the relay Worker's address", never a sample workers.dev URL).

---

## 11. Tests

### 11.1 `tools/relay-node-test.js` (node; renamed from the WIP's `relay-worker-test.js`)

Prints `RELAY-NODE PASS/FAIL <name>` and `RELAY-NODE OK|FAIL: N passed, M failed`.

- **RoomCore** with fake sockets:
  - host / guest open (4409 taken, 4404 no host, 4430 at the 7th socket), the `hi` frame;
  - stamping (a spoofed `f` in a frame is overwritten);
  - every row of 2.3: members, strangers to the host only, the host's unicast to a stranger, `'*'` fan-out, a guest's
    `m` ignored, `m` capped at 3 and filtered to seated ids;
  - order kept; `bye` → `gone(left)` after the frames before it; a closed socket → `gone(lost)`;
  - a host leaving → `gone` to everyone then 4001 for all, and the code free (a new host gets in);
  - junk (oversize ×3 → 4413, binary, bad JSON ×8 → 4400); the bucket (a burst of 150 passes, a sustained 100/s → 4429);
  - rebuilt from attachments (a "woken" core routes as before and keeps the members).
- **The Worker** (`route`, `gate`) with a fake `WebSocketPair`, a fake `Response` that allows status 101 (Node's own
  `Response` refuses it), and a fake `ROOMS` namespace:
  - the health route;
  - the path grammar; 426 without an upgrade;
  - origins per space: the live sites in `w`, the preview pattern in `p` only (one label, never a dot), the Toss
    origins in `t`; look-alikes, `http:`, `null` and a missing `Origin` refused; localhost only with
    `ALLOW_LOCALHOST=1`;
  - `v` → 4426; the rate binding (and its failure falling back to the isolate count);
  - a throwing DO → 4503 `cap` / `busy`;
  - `idFromName` called with `space:code`.
- **The DO** (`Room`) with a fake `ctx` (`acceptWebSocket`, `getWebSockets`, attachments, `setWebSocketAutoResponse`):
  the 101 answer, the auto-response pair registered, `webSocketClose` completing the close, a dropped `core` (simulated
  hibernation) rebuilt correctly.
- **The shipped `wrangler.toml`**: the binding, the `new_sqlite_classes` migration, the `ORIGINS` entries (the test's
  own copy of the expected list), `ALLOW_LOCALHOST = "0"`, observability off.
- **The local relay** (`tools/ws-relay.js`, 11.3) on a random port with Node 22's global `WebSocket` client:
  the handshake, masked frames in, frames out, a 70 KB frame refused, close codes passed through, admin `kill` /
  `restart` / `cap`.

### 11.2 `tools/net-node-test.js`: `testWs()` (**new**)

A `FakeWebSocket` on the existing virtual clock: `readyState`, `onopen` / `onmessage` / `onclose` (with a code),
`bufferedAmount` (a modeled uplink rate), latency plus jitter per hop **in FIFO order**, `cut()` (an abrupt 1006).
The server is the real `cloudflare/src/room.js` loaded in-process (`await import`), on the clock's timers.
`loadPage(name, {WebSocket, PG_RELAY})` injects them. It mirrors `testPeer` and adds the `ws`-specific cases:

- `transports().ws` true only with both `PG_RELAY` and `WebSocket`; a bad `PG_RELAY.url` (`http://evil.example`,
  `javascript:`) gives false; `?relay=ws://localhost:1/ws` accepted, `?relay=wss://evil.example` ignored;
  `lobby('ws')` null;
- host on a code; an explicit taken code → `unavailable` (`taken`); a generated code re-rolls past a taken one;
- 3 joins with agreeing rosters; the 5th → `full` (the host core); a 7th socket → `full` (the relay); an unknown
  code → `not_found`;
- states latest-wins host → guests and guest → host + guests (stamped); a stranger receives no states and its states
  are dropped;
- `'*'` and direct reliable streams in order, exactly once; guest → guest direct only to its target; a stranger's
  `'*'` reaches the host only;
- rtt measured (at least 4 one-way hops' worth); a message sent right before `leave()` arrives before the `gone`;
- a guest's socket cut → the host drops it and it sees `closed:lost`; the host's socket cut → the guests see
  `closed:lost`; the host leaves → `closed:host_left`; a relay "restart" (every socket 1012) → everyone `closed:lost`;
- junk / oversize / rate from a page closes only that page (`closed:lost`);
- backpressure skips states, never reliable messages, and `health()` turns false after 2 s stalled;
- a host alone sends no `s` frames; the first admitted guest still gets the host's latest state at once;
- a keepalive after 45 s of quiet;
- **fallback** (with the fake PeerJS of `testPeer`):
  - `['ws', 'peer']` with the relay refusing (1006) → a `peer` room, `s.fallback === 'down'`, and no second socket
    within 60 s;
  - a 4503 `cap` → `'cap'` until the next 00:00 UTC on the virtual clock;
  - a connect that never answers → `peer` after 6 s;
  - a joiner: `ws` `not_found` → `peer` finds the room; `ws` `full` → no `peer` try; both `not_found` → `not_found`
    with `.transport`;
- `?net=ws&lat=80&jit=40` delays in order and never drops.

### 11.3 The local relay and the real-socket jobs

- `tools/ws-relay.js` (**new**, about 120 lines, no dependencies): an RFC 6455 server. It does the handshake
  (`Sec-WebSocket-Key` + the GUID, SHA-1, base64; no extensions), reads masked client frames (7/16/64-bit lengths,
  continuation frames, close / ping / pong), writes text and close frames, and caps a frame at 64 KB. It mounts the
  real `RoomCore` and the real `gate()` (with loopback origins allowed) at `/ws/r/<space>/<code>`.
  Admin (GET, loopback only, test server only):
  - `/ws-admin/kill?code=` (destroy that room's sockets abruptly);
  - `/ws-admin/restart` (close everything with 1012);
  - `/ws-admin/cap?on=1|0` (refuse new connects with 4503 `cap`);
  - `/ws-admin/info` (rooms and seats as JSON).
- `tools/serve.js`: `start()` attaches `ws-relay` to both of its servers' `upgrade` events (`{relay: false}` turns it
  off). run-all checks `/ws-admin/info` before reusing a running server, so an older `serve.js` without a relay is not
  mistaken for one.
- Drivers get a transport switch: `const TR = Q.get('tr') || 'bc'`. Their frames use
  `'net=' + TR + (TR === 'ws' ? '&relay=' + encodeURIComponent('ws://' + location.host + '/ws') : '') + '&' + LINK`.
  An assertion that names `'bc'` reads `TR` instead (in `battle-net.js`; `net-ws.js` is new).
- New jobs (`tools/run-all.js`, real time, one at a time; headless Chrome always with `--mute-audio`, as `run-chrome.js`
  / `cdp-run.js` already do):

```js
  // ---- the WebSocket relay (design/relay.md 11.3): PG.Net's contract over real sockets through serve.js's local relay
  V('net-ws', HTTP + 'test-net-ws.html', 'rt120000', doneZero('NETWS'), { done: 'NETWS DONE' }),
  // the battle scenarios of battle-net over 'ws' (lat 60 ms on each page's link)
  V('battle-net-ws', HTTP + 'test-battle-net.html?tr=ws', 'rt300000', doneZero('BNET'), { done: 'BNET DONE', w: 1200, h: 900 }),
  // the DEPLOY page with a relay: 2 players over ws (no PeerJS wait), then the relay capped -> the fake PeerJS room,
  // the cap hint, the joiner finding it (review-peer-deploy.js's fake PeerJS, its page from deploy-relay/)
  V('ws-deploy', HTTP + 'rrp-ws-main.html', 'rt240000', doneZero('RWD'), { done: 'RWD DONE', w: 1200, h: 900 }),
```

  - `src/tests/net-ws.js` (**new**, modeled on `net-bc.js`): 5 same-origin frames of `preview.html?net=ws&relay=...`.
    It covers host / join / taken / not_found / full / roster, states and reliable order, leave, host_left, admin
    `kill` → lost, admin `restart` → everyone lost, and the 7th socket → full.
  - `ws-deploy`: `genPlatformPages` writes `rrp-ws-main.html` from `deploy-relay/index.html`, with the tag's URL
    rewritten to `http://localhost:<PORT>/ws` and the PeerJS tag swapped for the driver's fake (as `rrp-peer-main.html`
    does). The driver is `src/tests/review-ws-deploy.js` (**new**), reusing `review-peer-deploy.js`'s fake PeerJS code.
- `mp-net` over `ws` (`test-mp-net.html?tr=ws`, 15 minutes) is not in the default list. It can be run by name before a
  release that touches the link.
- Every existing `bc` job (`net-bc`, `mp-net`, `battle-net`, `trophies-net`, `party-net`, ...) and `peer-deploy` stay
  exactly as they are.

### 11.4 What changes in existing tests

- `check-pages.js`: the assertions of 10.1 / 10.3.
- `run-all.js`: the WIP's `relay-worker` / `relay-client` jobs become `relay-node`; the three jobs above. The WIP's
  `PG_RELAY_URL=none` default and the `pg-relay` strip in `genPlatformPages` stay.
- One full suite run at the end, in this worktree:
  `PG_BUILD_TEMP="C:/Temp/bogeul-ws" PG_HTTP_PORT=8798 node tools/run-all.js`.

### 11.5 Manual (owner, once, after the deploy): section 12, steps 4 and 6

`tools/relay-check.js` (**new**, tiny): `node tools/relay-check.js https://ppodeuk-relay.<계정>.workers.dev`. It
fetches `/` (ok, version) and `/cdn-cgi/trace` (`colo=`), times 5 requests, and prints one line in Korean
(`중계 서버 OK · 서울(ICN) · 평균 23ms`). It opens no WebSocket (the Worker refuses a missing `Origin`).

---

## 12. Owner guide (`CLOUDFLARE-SETUP.md`, rewritten)

Title: `# 온라인 중계 서버 만들기 (Cloudflare 설정 안내)`. It is PowerShell only, has no TURN key and no secrets, and
takes about 20 minutes. The opening box (verbatim):

> 친구와 하기가 이제 Cloudflare의 작은 **중계 서버**를 거쳐요. 폰 데이터(LTE)든 다른 집 와이파이든 같은 방에 들어올 수 있어요.
> 무료예요. 하루에 4명이 4시간 반쯤 놀 수 있고, 다 쓰면 오전 9시까지는 예전처럼 직접 연결로 해요 (돈이 나가지 않아요).
> 비밀번호나 키는 하나도 없어요. 아래에 나오는 주소는 남이 봐도 괜찮아요.

Steps:
1. **가입**: https://dash.cloudflare.com/sign-up. Skip the domain screen and stay on Free. (Whether Free asks for a card
   is not confirmed; the guide says "카드를 물어보면 여기서 멈추고 알려 주세요".)
2. **로그인 (PowerShell)**:
   ```powershell
   cd "C:\Users\뽀숑\OneDrive\바탕 화면\미니게임\bogeul\cloudflare"
   npx wrangler login
   ```
   Chrome opens: press **Allow**. Wait for `Successfully logged in`.
3. **올리기**:
   ```powershell
   npx wrangler deploy
   ```
   The first time it may ask for a workers.dev name for the account: type a short English name and press Enter. Copy
   the address at the end: `https://ppodeuk-relay.<내계정이름>.workers.dev` (not a secret).
4. **확인**: open that address in Chrome. It must show `{"ok":true,"service":"ppodeuk-relay","v":1}`. Then
   ```powershell
   node ..\tools\relay-check.js https://ppodeuk-relay.<내계정이름>.workers.dev
   ```
   It should print `서울(ICN)`.
5. **게임에 주소 넣기 (GitHub)**: the repository → **Settings** → **Secrets and variables** → **Actions** → the
   **Variables** tab → **New repository variable**: Name `RELAY_URL`, Value the address from step 3 → **Add variable**.
   Then **Actions** → **배포 (GitHub Pages + Firebase)** → **Run workflow** (or just merge the next PR).
6. **폰으로 시험**: one phone on LTE and one on another Wi-Fi (and one inside Toss, later).
   - Open the game with `?netinfo=1` at the end of the address. Make a room on one phone and join with the code on the
     other.
   - The hint line ends in `ws 84ms`. Below about 150 ms is good, and above 250 ms tell Claude.
   - Also open `https://ppodeuk-relay.<내계정이름>.workers.dev/cdn-cgi/trace` on each phone's browser and look for
     `colo=ICN`.
7. **사용량 보기**: dash.cloudflare.com → **Workers & Pages** → `ppodeuk-relay` → **Metrics** (requests), and the
   **Durable Objects** page for `Room` (requests a day). 100,000 a day is free, counted from 09:00 KST. To watch rooms
   live:
   ```powershell
   npx wrangler tail
   ```
   (`Ctrl+C` to stop).
8. **고칠 때 / 끌 때**:
   - `npx wrangler deploy` again ends every open room, so only do it when nobody is playing.
   - To switch the relay off: delete the `RELAY_URL` variable and run the deploy workflow. The game goes back to
     direct connections only.
   - To remove the Worker entirely: `npx wrangler delete`.
9. **하지 마세요**: none of this needs a key. If any screen asks you to paste a token into a chat, do not.

The old TURN sections (Realtime TURN key, `wrangler secret put`) are removed. The `TURN_CONFIG` secret note moves to
one line: "예전 Metered 비밀값 `TURN_CONFIG`는 이제 안 써도 돼요 (지워도 괜찮아요)".

`README.md`: the two WIP lines become "온라인 방: Cloudflare 중계 서버(`cloudflare/`)를 거쳐요. 설정:
[CLOUDFLARE-SETUP.md](CLOUDFLARE-SETUP.md) (Worker 주소는 GitHub 변수 `RELAY_URL`). 없으면 예전처럼 PeerJS 직접
연결" and the folder row "`cloudflare/` | 온라인 중계 서버 (방마다 메시지를 전달하는 Worker)". The `ice-check` line is
removed.

---

## 13. The WIP (`8236a8d`), file by file

| File | Fate | Why |
|---|---|---|
| `cloudflare/wrangler.toml` | Rewritten (3.2). | DO binding + migration, spaces, a connect limiter; no TURN secrets. |
| `cloudflare/src/relay.js` | Trimmed. Keep `parseOrigins` / `originAllowed` (made space-aware), `makeLimiter`, the JSON / health helpers and the route table. Drop `TTL`, `UPSTREAM_MS`, `mint`, `cleanIceServers`, `iceUrlOk` and `/turn`. Add `gate()` and the `/r/` route. | The skeleton was meant for this ("a later route ... will add a WebSocket relay on a Durable Object"). |
| `cloudflare/src/index.js` | Kept, plus `export { Room }`. | |
| `cloudflare/package.json` | Description only. | |
| `src/relay/ice.js` | **Deleted.** | No TURN key exists. With it inlined, every `peer` fallback would first ask `/turn` (a 503, a Worker request, and up to 3 s of waiting). |
| `tools/ice-check.js` | **Deleted.** | It probes TURN candidates. |
| `tools/relay-client-test.js` | **Deleted.** Its build-step cases (URL grammar, `none`, `relay.config.json`, a bad URL stopping the build) move into `relay-node-test.js` as a `build` group on a copy of the sources. | It tested `ice.js`. |
| `tools/relay-worker-test.js` | Renamed `relay-node-test.js`, rewritten (11.1). Keep its origin cases. | |
| `build.js` | Keep `readRelayUrl`, `RELAY_RE`, the fixture list, the log line. Replace `relaySrc` / `RELAY_AT` / the `ice.js` checks with 10.1. | |
| `src/game.js` | The WIP hunks are reverted (`relayApi`, `relayWarm`, the async `peerOpts`), then 6 is applied. | They only served TURN. |
| `src/net.js` | The WIP's header sentence is replaced (4.7). | |
| `.github/workflows/*` | Keep the `vars.RELAY_URL` / `none` lines. `JOBS`: `relay-node` instead of `relay-worker relay-client`. The comment in `deploy.yml` becomes "저장소 변수 RELAY_URL(중계 서버 주소, CLOUDFLARE-SETUP.md)이 있으면 온라인 방이 그 중계 서버를 거쳐요". | |
| `tools/run-all.js`, `tools/check-pages.js`, `.gitignore`, `README.md`, `CLOUDFLARE-SETUP.md` | 11.4, 10.3, 10.1, 12. | |

The TURN code can be restored from `8236a8d` if a TURN key ever exists. `turn.config.json` / `PG_PEER_OPTIONS` (the
static list for `peer`) is pre-WIP and untouched.

---

## 14. Build order and effort (one PR on `feat/ws-relay`)

1. `room.js` + `relay.js` / `room-do.js` / `index.js` / `wrangler.toml` + `relay-node-test.js` (2.5-3 h)
2. `wsLink`, `relayInfo`, the transport list in `host` / `join`, the relay memory, `TUNE.ws`, the header +
   `testWs` (3-4 h)
3. `game.js` (`netOrder`, `codeTr`, the texts, `?netinfo=1`) + `build.js` / `pack-itch` / `check-pages` / revert the
   WIP's TURN files (1.5 h)
4. `ws-relay.js` + `serve.js` + `net-ws.js` + the `tr` switch in `battle-net.js` + `review-ws-deploy.js` + run-all
   (2.5 h)
5. `CLOUDFLARE-SETUP.md`, `README.md`, `relay-check.js`, then **one** full suite run and its fixes (1-1.5 h)

That is about **11-12 h** of agent time. The owner then spends about 30 minutes: sign-up, login, deploy, the variable,
and one phone test.

---

## 15. Out of scope (explicitly not in this PR)

- Resume after a dropped socket (8.3), and a 열린 방 lobby on `ws`.
- Retiring PeerJS: it stays one release as the fallback, and goes once the phone test is good (then the CDN tag, the
  `peerTag` wait and `turn.config.json` go too).
- The Toss build's own `PG_RELAY` (`space:'t'`) and its `netOrder` branch (`feat/toss`; this spec leaves the hooks).
- A custom domain, the paid plan, a Seoul VM, binary or compressed frames, the 20 Hz body lever (9.4).
- Spectators, relay-side room lists, any relay-side game logic.

---

## 16. Risks

1. **Routing from Korean carriers**: from the owner's PC Cloudflare answers from ICN *(research)*. LTE on SKT / KT /
   LGU+ is not measured, and a Tokyo or Hong Kong PoP adds 30-70 ms one-way. Step 6 of the owner guide measures it
   before PeerJS is retired. The fallback plan is the same `RoomCore` on a Seoul VM.
2. **The free cap** (about 4.7 h a day of 4-player play): past it there is no online play through the relay until
   09:00 KST, and the `peer` fallback is the one that fails on LTE. It is visible (5.3) and does not bill.
3. **Cap behaviour is not confirmed**: what an object does when the free limit is reached mid-game, and the exact error
   text the Worker sees (`cap` detection is a regex; a miss shows `hintDown` instead of `hintCap`, nothing worse).
4. **Deploys and DO restarts end every room** (3.7). The owner guide says to deploy outside play time.
5. **Apps in Toss**: whether the WebView sends the expected `Origin` on the handshake, and whether Toss needs the
   workers.dev domain declared or allowlisted, are not confirmed (QR test items in `design/toss.md`). The ws transport
   is the reason Toss can work at all, so this is checked first there.
6. **A public endpoint**: anyone with the URL and a code can connect from a non-browser client (the `Origin` check only
   stops other sites' visitors), and every incoming message is billed even when dropped. The socket cap, the per-socket
   bucket, junk closes and the per-IP connect limit bound it. A determined attacker with many IPs could still burn the
   day's cap: online then falls back for that day. Room codes are the only access control, as with PeerJS.
7. **No resume**: an app switch that kills the socket, or a Wi-Fi ↔ LTE handover, kicks that player, exactly as
   `'peer'` does today (8).
8. **Old cached pages**: an installed app on a build from before the relay is `peer`-only until its service worker
   updates (on its next online start). A new host's `ws` room is "방을 찾을 수 없어요" for it; 새로고침 fixes it. A
   new joiner still finds an old host's `peer` room (5.2).
9. **A single point of failure**: a Cloudflare outage or a problem with the owner's account stops relay play. The `peer`
   fallback covers the same Wi-Fi only on good days.
10. **Hibernation details not confirmed**: whether auto-responses are billed, whether Cloudflare closes long-idle
    WebSockets (the 45 s keepalive covers it), and the close code on a restart. None of them changes the design.

---

## 17. Open questions for the owner

1. **itch.io**: keep the itch build on direct connections only (this spec), or add the itch origin to `w`? itch's
   origin is shared by every itch game, so any game hosted there could use the relay from its players' browsers.
2. **PR previews in their own space `p`** (this spec): previews and the live game never share rooms. Is that right, or
   should a preview be able to join a live room?
3. **When to retire PeerJS**: after one release and a good phone test (this spec), or keep it longer as the fallback?
4. **The 20 Hz body lever** (9.4): only if the cap bites (this spec), or now, to have more daily hours from day one?
5. **Card at sign-up**: if Cloudflare's Free plan asks for a card, is that acceptable (it does not bill on Free)?
