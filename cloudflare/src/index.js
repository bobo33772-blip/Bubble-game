// The relay Worker's entry (wrangler.toml main). The logic lives in relay.js (tested in node by
// tools/relay-worker-test.js); here only what Cloudflare hands over: the request, env (ALLOWED_ORIGINS, ALLOW_LOCALHOST,
// the secrets TURN_KEY_ID / TURN_KEY_API_TOKEN, the TURN_RATE binding) and the platform's fetch.
import { route, makeLimiter } from './relay.js';

const limiter = makeLimiter();        // (this isolate's count; kept between requests while the isolate lives)

export default {
  async fetch(request, env) {
    return route(request, env, { fetch: (url, init) => fetch(url, init), limiter, now: () => Date.now() });
  },
};
