import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('./practice-menu-app.js',import.meta.url),'utf8');
test('all shared action refreshes use a readonly render, regardless of runtime existence',()=>{
 const binding=source.slice(source.indexOf('syncCenterActions = bindSyncCenterActions'));
 const expression=binding.match(/refresh: (\(\) => renderSyncCenterView\(\)),/);assert(expression,'shared refresh must not use owner/runtime existence as activation permission');
 for(const runtime of [null,{}, {disposed:true}]){
  const calls=[];const callback=Function('renderSyncCenterView','portSyncController','return '+expression[1])((options={activate:false})=>calls.push(options),{runtime});
  callback();callback({activate:true});assert.deepEqual(calls,[{activate:false},{activate:false}]);
 }
 assert.match(source,/start\.addEventListener\('click',[\s\S]*?renderSyncCenterView\(\{ activate: true \}\)/,'explicit start remains explicit');
});
