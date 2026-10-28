// The relay Worker's entry (wrangler.toml main): the front door is relay.js (route, gate), each room a Durable Object
// (room-do.js -> room.js). Here only what Cloudflare hands over: the request and env (ORIGINS, ALLOW_LOCALHOST, the ROOMS
// namespace, the CONNECT_RATE binding). design/relay.md 3.
import { route, makeLimiter } from './relay.js';

export { Room } from './room-do.js';

const limiter = makeLimiter();        // (this isolate's count of connects per IP; kept while the isolate lives)

export default {
  fetch(request, env) {
    return route(request, env, { limiter, now: () => Date.now() });
  },
};
