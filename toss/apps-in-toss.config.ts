// 앱인토스 (Apps in Toss) config for `ait build` (design/toss.md 2.3). ait packs dist/ (Vite's output) as it is into
// ppodeuk-bath.ait next to package.json; nothing here builds anything.
import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'ppodeuk-bath',                    // = the console's app name, exactly
  brand: { primaryColor: '#0a2327' },         // the page's --bg (the manifest's theme colour); the owner may change it
  permissions: [],                            // nothing: no camera, mic, clipboard permission, location
  webBundleDir: 'dist',
  webView: { bounces: false, pullToRefreshEnabled: false, overScrollMode: 'never', allowsBackForwardNavigationGestures: false },
  // the game draws under it (fullscreen); 더보기 / X float on top. theme 'dark' = light icons for the dark --bg (the
  // docs' example for a dark background): the X must be visible. withTitle false: no logo / name even if the bar
  // were ever the non-game one. (The game nav bar itself comes from the console's 앱 유형 = 게임.)
  navigationBar: { transparentBackground: true, theme: 'dark', withTitle: false },
});
