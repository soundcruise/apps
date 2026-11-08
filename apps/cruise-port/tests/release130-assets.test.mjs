import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../../../',import.meta.url);
test('all captured non-overlay Port dependencies retain their published bytes',()=>{
 const audit=JSON.parse(fs.readFileSync(new URL('../docs/release130/public-audit.json',import.meta.url)));
 const overlay=new Set(['index.html','pro_9a3943176561/index.html','app-version.js','practice-menu-app.js','pro-app-boot.js','settings-store.js','style.css','tuner-app.js']);
 let checked=0;
 for(const row of audit){if(row.error||!row.path.startsWith('apps/cruise-port/'))continue;
  if(overlay.has(row.path.slice('apps/cruise-port/'.length)))continue;
  assert.equal(createHash('sha256').update(fs.readFileSync(new URL(row.path,root))).digest('hex'),row.sha256,row.path);checked++;
 }
 assert(checked>20);
});
