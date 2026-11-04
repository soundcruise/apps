import test from 'node:test';
import assert from 'node:assert/strict';
import { getAttentionGuide,issueFingerprint,takeAttentionRequest } from './sync-attention-ui.mjs';
import { syncAttentionItems } from './sync-center-ui.js';
const root=()=>({document:{hidden:false},history:{state:{route:'sync'},replaceState(s){this.state=s;}}});
test('cancel/close is one presentation; repaint and tab return do not reopen; manual reopen works',async()=>{
 const w=root(),g=getAttentionGuide(w);let opens=0;const issue={key:'A/chord/conflict-1',open:()=>{opens++;}};
 assert(await g.open(issue,true));assert.equal(await g.open(issue,true),false);w.document.hidden=true;assert.equal(await g.open({...issue,key:'new'},true),false);w.document.hidden=false;assert.equal(await g.open(issue,true),false);assert(await g.open(issue));assert.equal(opens,2);assert.equal(w.history.state.route,'sync');
});
test('a new conflict with the same count or an Account change is a new presentation',async()=>{
 const g=getAttentionGuide(root());let n=0;for(const key of ['A/chord/old','A/chord/new','B/chord/new'])assert(await g.open({key,open:()=>n++},true));assert.equal(n,3);
});
test('busy and blocked forms defer without marking a new problem as shown',async()=>{
 const g=getAttentionGuide(root());let release;const p=g.open({key:'one',open:()=>new Promise(r=>release=r)},true);assert.equal(await g.open({key:'two',open:()=>{}},true),false);release();await p;assert.equal(await g.open({key:'two',canOpen:()=>false,open:()=>{}},true),false);assert(await g.open({key:'two',open:()=>{}},true));
});
test('Studio child documents share one Port-owned guide in the owning window',async()=>{
 const parent=root(),a={SoundCruiseNativeSyncHost:{attentionWindow:parent}},b={CruisePortSyncAttentionHost:{owner:parent}};assert.equal(getAttentionGuide(a),getAttentionGuide(b));
});
test('history retains UI dismissal only across a full navigation/back; no storage API is used',async()=>{
 const a=root();await getAttentionGuide(a).open({key:'seen',open:()=>{}},true);const b=root();b.history.state=structuredClone(a.history.state);assert.equal(await getAttentionGuide(b).open({key:'seen',open:()=>assert.fail()},true),false);
});
test('opening a regenerated merge preview does not fabricate a new issue identity',()=>{
 const s={stage:'awaiting_confirmation',sessionId:'old',localSnapshot:{manifestHash:'l'},cloudSnapshot:{manifestHash:'r'},plan:{conflicts:[{recordKey:'folder/f',kind:'field',fields:['name']}]}};
 assert.equal(issueFingerprint([],s),issueFingerprint([],{...s,sessionId:'new'}));assert.notEqual(issueFingerprint([{conflictId:'one',baseRevision:1}]),issueFingerprint([{conflictId:'two',baseRevision:2}]));
});
test('overall count does not add the same membership report and target report twice or alter Port success',()=>{
 const p={kind:'ready',accountState:'active',portStatus:{state:'synced'},portConflictCount:0,apps:[{id:'chord',status:'synced',removalSafety:'attention',attentionCount:1,environments:[{id:'current',lastReport:{state:'attention',attentionCount:1}}]}]};const i=syncAttentionItems(p);assert.equal(i.reduce((n,x)=>n+x.count,0),1);assert.equal(p.portStatus.state,'synced');assert.equal(syncAttentionItems({...p,apps:[],portStatus:{state:'attention'},portConflictCount:2})[0].count,2);
});
test('unavailable/offline is not mislabeled as a four-app conflict',()=>{
 assert.deepEqual(syncAttentionItems({kind:'offline',accountState:'active',apps:[{id:'chord',status:'attention'}]}),[]);
});
test('review URL hint is UI-only and leaves other parameters and route intact',()=>{
 const w=root();w.location={href:'https://soundcruise.jp/apps/chord-cruise/pro/?sync-review=1&edition=pro#library'};let to;w.history.replaceState=(s,title,u)=>to=u;assert(takeAttentionRequest(w));assert.equal(to,'https://soundcruise.jp/apps/chord-cruise/pro/?edition=pro#library');
});

test('a changed server payload is material even if an existing conflict ID is reused',()=>{
 const old={conflictId:'same',recordKey:'settings/default',local:{payloadHash:'local'},server:{payloadHash:'remote-one'}};
 assert.notEqual(issueFingerprint([old]),issueFingerprint([{...old,server:{payloadHash:'remote-two'}}]));
});
