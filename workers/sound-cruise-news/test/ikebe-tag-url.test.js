import test from 'node:test';import assert from 'node:assert/strict';import {ikebeTagUrl} from '../src/ikebe-tag-url.js';
test('tag URL decoding is single-segment same-origin and never a fetch permission',()=>{
 const base='https://www.ikebe-gakki-pb.com/new_product/tag/';
 assert(ikebeTagUrl(base+'pjb%EF%BC%88phil-jones-bass%EF%BC%89/'));assert(ikebeTagUrl(base+'craft/'));
 for(const u of [base+'a%2Fb/',base+'a%5Cb/',base+'a%00b/',base+'a%zz/',base+'a/?q=1',base+'a/#x',base+'a/b/','https://evil.test/new_product/tag/craft/','https://u:p@www.ikebe-gakki-pb.com/new_product/tag/craft/'])assert.equal(ikebeTagUrl(u),false,u);
});
