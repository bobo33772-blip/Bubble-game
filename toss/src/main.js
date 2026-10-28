// The 앱인토스 page's one module entry (design/toss.md 2.3): the SDK, PeerJS and the two fonts from npm (no CDN at run
// time), then src/ait.js boots - it restores the storage, locks landscape, sets the Safe Area and window.PG_AIT, and
// only then loads the five engine files in order. The engine never imports anything.
// (Only the SDK members the bridge uses are imported, so the bundle carries nothing else of the SDK: no payments, no
// ads, no login.)
import {
  Analytics, Environment, Game, SafeAreaInsets, Screen, Storage, getUserKeyForGame, graniteEvent, onVisibilityChangedByTransparentServiceWeb,
} from '@apps-in-toss/web-framework';
import { Peer } from 'peerjs';
import '@fontsource/black-han-sans/400.css';      // font-family "Black Han Sans" (page.html --font-sign)
import '@fontsource/gowun-dodum/400.css';         // font-family "Gowun Dodum"    (page.html --font-body)
import '../../src/ait.js';                        // defines window.PG.Ait (a plain script, no imports)

window.Peer = Peer;                               // what PG.Net's 'peer' transport looks for
const SDK = { Analytics, Environment, Game, SafeAreaInsets, Screen, Storage, getUserKeyForGame, graniteEvent, onVisibilityChangedByTransparentServiceWeb };
window.PG.Ait.boot(SDK, { scripts: ['pg/sprites.js', 'pg/levels.js', 'pg/audio.js', 'pg/net.js', 'pg/game.js'] });
