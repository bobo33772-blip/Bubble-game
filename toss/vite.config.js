// The Vite build of the 앱인토스 page (design/toss.md 2.3): index.html (written by `node ../build.js --toss`) with its one
// module entry, src/main.js; public/pg/ (the engine files, also written by build.js) is copied as it is.
import { defineConfig } from 'vite';
import devtools from '@apps-in-toss/devtools/unplugin';

export default defineConfig(({ command }) => ({
  base: './',                                            // relative URLs inside the bundle
  plugins: command === 'serve' ? [devtools.vite()] : [], // the mock SDK panel for `npm run dev` only, never in the .ait
  server: { fs: { allow: ['..'] } },                     // main.js imports ../../src/ait.js
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: false, assetsInlineLimit: 0, modulePreload: { polyfill: false } },
}));
