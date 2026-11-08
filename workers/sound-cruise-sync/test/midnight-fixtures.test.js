import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

test('legacy four-theme and published five-theme fixture bytes remain pinned to their source commits', () => {
  for (const dir of ['pre-midnight','published-v1']) {
    const base = new URL('./fixtures/'+dir+'/',import.meta.url);
    const manifest=JSON.parse(fs.readFileSync(new URL('source.json',base),'utf8'));
    const entries=Array.isArray(manifest) ? manifest : Object.entries(manifest.sha256).map(([path,sha256])=>({file:path.split('/').at(-1)+'.fixture',sha256}));
    for (const item of entries) assert.equal(createHash('sha256').update(fs.readFileSync(new URL(item.file,base))).digest('hex'),item.sha256,item.file);
  }
});
