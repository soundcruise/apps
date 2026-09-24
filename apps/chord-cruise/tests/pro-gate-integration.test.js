'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const apps = path.join(root, '..');
const standard = fs.readFileSync(path.join(root, 'standard/index.html'), 'utf8');
const pro = fs.readFileSync(path.join(root, 'pro_k7m4q9v2x8/index.html'), 'utf8');
const gate = fs.readFileSync(path.join(apps, 'shared/pro-gate.js'), 'utf8');

assert(pro.includes('data-app-edition="Pro"'));
assert(pro.includes('shared/pro-gate.css'));
assert(pro.includes('shared/pro-gate.js?v=22'));
assert(pro.includes("appName: 'コードクルーズ'"));
assert(pro.indexOf('window.__SOUNDCRUISE_PRO_GATE__') < pro.indexOf('shared/pro-gate.js?v=22'));
assert(pro.indexOf('shared/pro-gate.js?v=22') < pro.indexOf('<div id="cc-app"'));
assert(!pro.includes('passwordHash'), 'public verifier is removed');
assert(!standard.includes('shared/pro-gate.js'), 'Standard remains outside Pro auth');
assert(gate.includes("const AUTH_KEY = 'soundCruiseProAuth'"));
assert(gate.includes("request('/session'"));
assert(gate.includes("request('/verify'"));
assert(gate.includes('window.__soundCruiseClearGate = reset'));
assert(!gate.includes('passwordHash'));

for (const app of ['pitch-cruise/pro_x9v7q2m8', 'fretboard_cruise/pro_a9f4k7q2m8z',
  'rhythm-cruise/pro_r4m8k7n2q9x', 'cruise-port/pro_9a3943176561']) {
  const html = fs.readFileSync(path.join(apps, app, 'index.html'), 'utf8');
  assert(html.includes('shared/pro-gate.js') || html.includes('pro-gate-hash.js'));
  assert(!html.includes('passwordHash'));
}
console.log('pro-gate-integration: all five Pro entries use server authentication without a public verifier');
