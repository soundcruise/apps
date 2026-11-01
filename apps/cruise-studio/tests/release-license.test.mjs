import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {RELEASE_FILES} from '../scripts/package-port-pc.mjs';
test('the actual 34-file sprite contains the complete original Lucide notice and Feather permission, not an excluded filename',()=>{
 assert.equal(RELEASE_FILES.length,34);assert(RELEASE_FILES.includes('assets/studio-icons.svg'));
 const svg=fs.readFileSync(new URL('../assets/studio-icons.svg',import.meta.url),'utf8');
 const metadata=svg.match(/<metadata id="lucide-license"><!\[CDATA\[([\s\S]*?)\]\]><\/metadata>/)?.[1];assert(metadata);
 const original=metadata.slice(metadata.indexOf('ISC License'),metadata.indexOf('Feather-derived portions')).trim()+'\n';
 assert.equal(createHash('sha256').update(original).digest('hex'),'1e7290b35280a048667bbf0ebabac1c7fd52a75300e8b2946ac165715997f2bc');
 for(const text of ['Copyright (c) 2013-present Cole Bemis','Permission is hereby granted, free of charge','The above copyright notice and this permission notice shall be included','LIABILITY, WHETHER IN AN ACTION OF CONTRACT'])assert(metadata.includes(text));
 assert.equal((svg.match(/<symbol /g)||[]).length,9);
});
