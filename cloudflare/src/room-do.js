// The Durable Object `Room` (design/relay.md 3.5): one per room code (the Worker names it "<space>:<code>"), a thin
// wrapper that hands the Hibernation API's events to RoomCore (room.js). A plain class with no 'cloudflare:workers'
// import, so node can load it in the tests (they hand it a fake ctx).
//   - hibernation: sockets are accepted with ctx.acceptWebSocket, so the object may leave memory while they stay open
//     (no duration billed then). On the next event the runtime runs the constructor again: it only registers the
//     keepalive's auto-response, and the core is rebuilt lazily from the sockets' attachments ({i, r, t} + the host's
//     k / m, serializeAttachment, far under 16 KB)
//   - no timers, no alarms, no storage, no await: handlers stay synchronous, so no two events ever interleave (the order
//     of frames from one sender is the order the others get them)
//   - the keepalive {"k":"p"} is answered {"k":"P"} by the runtime itself (setWebSocketAutoResponse: it does not wake
//     the object and is not billed); getWebSocketAutoResponseTimestamp tells the core when, for its dead-seat sweep
import { RoomCore, PING, PONG } from './room.js';

const ABC = 'abcdefghijklmnopqrstuvwxyz0123456789';
function rand(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  let s = '';
  for (let i = 0; i < n; i++) s += ABC[b[i] % 36];
  return s;
}
function attachmentOf(ws) { try { return ws.deserializeAttachment(); } catch (e) { return null; } }

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.core = null;
    try {
      const Pair = globalThis.WebSocketRequestResponsePair;
      if (typeof Pair === 'function') ctx.setWebSocketAutoResponse(new Pair(PING, PONG));
    } catch (e) { /* an older runtime: RoomCore answers the keepalive itself (it then wakes the object) */ }
  }

  // the Worker already ran gate(): the path, the origin, v and the role are fine
  async fetch(req) {
    const q = new URL(req.url).searchParams;
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server);
    const no = this.wake().open(server, { role: q.get('role') === 'h' ? 'h' : 'g', id: q.get('id') || '', tok: q.get('tok') || '' });
    if (no) { try { server.close(no.code, no.reason); } catch (e) { /* ignore */ } }
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(ws, msg) { this.wake().message(ws, msg); }
  // (the attachment too: a socket that closes while the object slept is not in getWebSockets() any more, so the woken
  // core learns its seat from it)
  webSocketClose(ws) {
    this.wake().closed(ws, attachmentOf(ws));
    // (with the compatibility date of wrangler.toml the runtime has answered the close frame already: harmless then)
    try { ws.close(1000); } catch (e) { /* ignore */ }
  }
  webSocketError(ws) { this.wake().closed(ws, attachmentOf(ws)); }

  // the room's core: built on the first event after the object (re)started, from the sockets still open
  wake() {
    if (this.core) return this.core;
    const ctx = this.ctx;
    const seats = ctx.getWebSockets().map((s) => [s, attachmentOf(s)]).filter((e) => e[1] && e[1].i);
    this.core = new RoomCore({
      send: (ws, s) => { try { ws.send(s); } catch (e) { /* a closing socket */ } },
      close: (ws, code, reason) => { try { ws.close(code, String(reason || '').slice(0, 60)); } catch (e) { /* closed already */ } },
      save: (ws, a) => { try { ws.serializeAttachment(a); } catch (e) { /* closed already */ } },
      heard: (ws) => { try { const d = ctx.getWebSocketAutoResponseTimestamp(ws); return d ? +d : 0; } catch (e) { return 0; } },
      rand,
      now: () => Date.now(),
      seats,
    });
    return this.core;
  }
}
