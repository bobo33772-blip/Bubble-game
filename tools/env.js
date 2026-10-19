// Where the test tools find Chrome and the build's temp dir. Windows defaults (this PC); CI (Linux) sets
//   PG_CHROME=<chrome binary>      e.g. /usr/bin/google-chrome
//   PG_BUILD_TEMP=<dir>            the same dir build.js writes its test pages to
const CH = process.env.PG_CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const T = process.env.PG_BUILD_TEMP || 'C:/Temp/bogeul';
// a page under T as a file:// URL (file:///C:/Temp/bogeul/x on Windows, file:///tmp/x on Linux); keeps #hash / ?query
const fileUrl = (rel) => `file://${T.startsWith('/') ? '' : '/'}${T}/${rel}`;
// an output path: absolute as it is, else inside T
const inT = (p) => (p.includes(':') || p.startsWith('/') ? p : `${T}/${p}`);
module.exports = { CH, T, fileUrl, inT };
