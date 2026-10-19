// Reads bogeul/firebase.config.json for build.js (design/cloud-trophies.md 3.1, FIREBASE-SETUP.md 2-4): the Firebase
// console's six web-app fields plus our optional "home" (the game's own address, opened by 새 창에서 열기 from a frame).
// Lenient, because the owner is not a developer: a UTF-8 BOM or a UTF-16 (Notepad "Unicode") file; JSON, or else the
// console's `const firebaseConfig = { apiKey: "...", ... };` pasted as it is (name: "value" / name: 'value' pairs);
// numbers where strings belong; unknown fields (measurementId) dropped. Every value is checked: a bad file stops the
// build with a message in Korean and English (the build prints it).
// As a module: const { readFirebaseConfig, fbCheck, parseConfigText } = require('./tools/fb-config');
//   readFirebaseConfig(file) -> null (no file) | { cfg: {apiKey, authDomain, projectId, appId, messagingSenderId?, storageBucket?}, home }
const fs = require('fs');
const path = require('path');

// [check, message, required]
const FB_FIELDS = {
  apiKey: [/^AIza[0-9A-Za-z_-]{35}$/, 'apiKey가 이상해요 (AIza로 시작하는 39글자예요) / apiKey looks wrong', true],
  authDomain: [/^[a-z0-9.-]+\.[a-z]{2,}$/, 'authDomain이 이상해요 (프로젝트ID.firebaseapp.com 모양이에요) / authDomain looks wrong', true],
  projectId: [/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/, 'projectId가 이상해요 (영어 소문자·숫자·- 로 된 6~30글자예요) / projectId looks wrong', true],
  appId: [/^1:\d+:web:[0-9a-f]+$/, 'appId가 이상해요 (1:숫자:web:영문숫자 모양이에요) / appId looks wrong', true],
  messagingSenderId: [/^\d+$/, 'messagingSenderId가 이상해요 (숫자만 있어요) / messagingSenderId looks wrong', false],
  storageBucket: [/^[a-z0-9._-]+$/, 'storageBucket이 이상해요 / storageBucket looks wrong', false],
};
// checked values -> { cfg, home }; throws with the message (name: what to call the source in it)
function fbCheck(o, name) {
  const fail = (m) => { throw new Error(`${name}: ${m}`); };
  if (!o || typeof o !== 'object' || Array.isArray(o)) fail('읽을 수 없어요. 따옴표(")와 쉼표(,)를 확인해 주세요 / cannot be read (check the quotes and commas)');
  const cfg = {};
  for (const [k, [re, msg, need]] of Object.entries(FB_FIELDS)) {
    const v = o[k] === undefined || o[k] === null ? '' : String(o[k]).trim();
    if (!v) { if (need) fail(`${k} 값이 없어요 / ${k} is missing`); continue; }
    if (!re.test(v)) fail(msg);
    cfg[k] = v;
  }
  const home = o.home === undefined || o.home === null ? '' : String(o.home).trim();
  if (home && !/^https:\/\/[^\s"'<>\\]+$/.test(home)) fail('home이 이상해요 (https://로 시작하는 게임 주소예요) / home must be an https:// address');
  return { cfg, home };
}
// a file's bytes -> the object it holds (null: nothing readable)
function parseConfigText(buf) {
  const txt = (buf[0] === 0xff && buf[1] === 0xfe ? buf.subarray(2).toString('utf16le') : buf.toString('utf8')).replace(/^﻿/, '');
  try { return JSON.parse(txt); } catch (e) { /* not JSON: the console's snippet? */ }
  const o = {};
  for (const m of txt.matchAll(/["']?([A-Za-z]+)["']?\s*:\s*(?:"([^"\\\r\n]*)"|'([^'\\\r\n]*)')/g)) o[m[1]] = m[2] !== undefined ? m[2] : m[3];
  return Object.keys(o).length ? o : null;
}
function readFirebaseConfig(file) {
  if (!fs.existsSync(file)) return null;
  return fbCheck(parseConfigText(fs.readFileSync(file)), path.basename(file));
}

module.exports = { FB_FIELDS, fbCheck, parseConfigText, readFirebaseConfig };
