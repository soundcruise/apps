import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const menus='cruisePort.practiceMenus',assets='cruisePort.syncAssetMetadata',apps='cruisePort.myApps',intents='cruisePort.syncDeletionIntent.v1';
export async function runReferentialSuite({evaluate,primary,peer,rounds,payloads,reproduction=false}) {
 const results=[];
 const init=async({attached=false,payload=0}={})=>{const generation=randomUUID();for(const [session,role]of [[primary,'primary'],[peer,'peer']])await evaluate(session,`crossTab.prepare(${JSON.stringify({reference:true,attached,payload,generation,role})})`);};
 const prepare=(session,o)=>evaluate(session,`crossTab.referencePrepare(${JSON.stringify(o)})`);
 const commit=(session,id)=>evaluate(session,`crossTab.referenceCommit(${JSON.stringify(id)})`);
 const observe=session=>evaluate(session||primary,'crossTab.referenceObserve()');
 const pair=async(a,b)=>{await prepare(primary,a);await prepare(peer,b);return Promise.all([commit(primary,a.id),commit(peer,b.id)]);};
 const single=async(o)=>{await prepare(primary,o);return commit(primary,o.id);};
 if(reproduction){
  for(const payload of payloads){
   const aggregate={scenario:'reproduction',payload,rounds:0,violations:0,details:[]};
   for(let round=0;round<rounds;round++){
    await init({attached:true,payload});assert((await single({id:'remove',kind:'attachment-delete'})).ok);
    let s=await observe(),j=JSON.parse(s.values[intents]||'{}');const missing=['practice_attachment/attachment-a','practice_attachment_set/menu-0'].filter(k=>!j[k]);
    await init({payload});await prepare(primary,{id:'delete-owner',kind:'menu-delete'});await prepare(peer,{id:'add',kind:'attachment-add'});
    assert((await commit(peer,'add')).ok);const removed=await commit(primary,'delete-owner');s=await observe();
    const detail={deleteIntentMissing:missing.length,danglingAttachments:s.dangling.length,ownerDeleteAccepted:removed.ok,violations:missing.length+s.dangling.length};
    aggregate.rounds++;aggregate.violations+=detail.violations;aggregate.details.push(detail);
   }results.push(aggregate);
  }return results;
 }
 const scenarios=['attachment-intent-parity','menu-delete-attachment-add','attachment-delete-owner-set-update','my-app-practice-link','delete-recreate-old-ack','independent-menu-attachment','unrelated-keys'];
 for(const scenario of scenarios)for(const payload of payloads){
  const aggregate={scenario,payload,rounds:0,violations:0,details:[]};
  for(let round=0;round<rounds;round++){
   const attached=['attachment-intent-parity','attachment-delete-owner-set-update','delete-recreate-old-ack'].includes(scenario);
   await init({attached,payload});let outcomes=[];
   if(scenario==='attachment-intent-parity'){
    outcomes=[await single({id:'remove',kind:'attachment-delete'})];assert(outcomes[0].ok);
    const j=JSON.parse((await observe()).values[intents]);assert(j['practice_attachment/attachment-a']);assert(j['practice_attachment_set/menu-0']);
   }else if(scenario==='menu-delete-attachment-add'){
    await prepare(primary,{id:'delete-owner',kind:'menu-delete'});await prepare(peer,{id:'add',kind:'attachment-add'});
    outcomes=round%2?[await commit(primary,'delete-owner'),await commit(peer,'add')]:[await commit(peer,'add'),await commit(primary,'delete-owner')];
    assert.equal(outcomes.filter(r=>r.ok).length,1);assert.equal(outcomes.filter(r=>r.reason==='attachment-owner-missing').length,1);
   }else if(scenario==='attachment-delete-owner-set-update'){
    outcomes=await pair({id:'delete-a',kind:'attachment-delete'},{id:'add-b',kind:'attachment-add',attachmentId:'attachment-b'});
    assert.equal(outcomes.filter(r=>r.ok).length,1);assert.equal(outcomes.filter(r=>r.reason==='stale').length,1);
    const s=await observe(),rows=JSON.parse(s.values[assets]).attachments,j=JSON.parse(s.values[intents]||'{}');
    if(outcomes[0].ok){assert.equal(Object.keys(rows).length,0);assert(j['practice_attachment/attachment-a']);assert(j['practice_attachment_set/menu-0']);}
    else{assert(rows['attachment-a']);assert(rows['attachment-b']);}
   }else if(scenario==='my-app-practice-link'){
    const id=JSON.parse((await observe()).values[apps]).items[0].id;
    outcomes=await pair({id:'delete-app',kind:'my-app-delete'},{id:'link-app',kind:'my-app-link'});assert(outcomes.every(r=>r.ok));
    const s=await observe();assert.equal(JSON.parse(s.values[apps]).items.length,0);assert.equal(JSON.parse(s.values[menus]).items[0].appId,'myapp:'+id);assert(JSON.parse(s.values[intents])['my_app/'+id]);
   }else if(scenario==='delete-recreate-old-ack'){
    const first=await single({id:'old-delete',kind:'attachment-delete'});assert(first.ok);await observe(peer);
    await prepare(peer,{id:'old-ack',kind:'old-ack',acknowledgements:[{key:'practice_attachment/attachment-a',generation:'old-delete'},{key:'practice_attachment_set/menu-0',generation:'old-delete'}]});
    const recreated=await single({id:'recreate',kind:'attachment-add'}),deleted=await single({id:'new-delete',kind:'attachment-delete'}),ack=await commit(peer,'old-ack');outcomes=[first,recreated,deleted,ack];assert(outcomes.every(r=>r.ok));
    const j=JSON.parse((await observe()).values[intents]);assert.equal(j['practice_attachment/attachment-a'].generation,'new-delete');assert.equal(j['practice_attachment_set/menu-0'].generation,'new-delete');
   }else if(scenario==='independent-menu-attachment'){
    outcomes=await pair({id:'edit-menu-0',kind:'menu-edit'},{id:'add-menu-1',kind:'attachment-add',owner:'menu-1'});assert(outcomes.every(r=>r.ok));
    const s=await observe();assert.equal(JSON.parse(s.values[menus]).items[0].memo,'edit-menu-0');assert.equal(JSON.parse(s.values[assets]).attachments['attachment-a'].practiceId,'menu-1');
   }else{
    await Promise.all([evaluate(primary,"crossTab.preparePacket('met','cruisePort.metronome',{bpm:145})"),evaluate(peer,"crossTab.preparePacket('tuner','cruisePort.tuner',{thresholdDb:-75})")]);
    outcomes=await Promise.all([evaluate(primary,"crossTab.commitPacket('met')"),evaluate(peer,"crossTab.commitPacket('tuner')")]);assert(outcomes.every(r=>r.ok));
    const s=await observe();assert.equal(JSON.parse(s.values['cruisePort.metronome']).bpm,145);assert.equal(JSON.parse(s.values['cruisePort.tuner']).thresholdDb,-75);
   }
   const s=await observe(),integrity=await evaluate(primary,'crossTab.integrity()');assert.equal(s.dangling.length,0);assert.equal(integrity.logs,integrity.unique);assert.equal(integrity.partial,0);assert.equal(integrity.seq,1+outcomes.filter(r=>r.ok).length);
   aggregate.rounds++;aggregate.details.push({committed:outcomes.filter(r=>r.ok).length,rejected:outcomes.filter(r=>!r.ok).map(r=>r.reason),danglingAttachments:0,deleteIntentLoss:0,duplicateOperations:0,partialManifests:0,lostUpdates:0,violations:0});
  }
  results.push(aggregate);process.stderr.write(`${scenario} payload=${payload}: rounds=${rounds} violations=0\n`);
 }
 return results;
}
export async function runReferentialFailures({evaluate,send,openTab,primaryTab,peerTab,token}){
 let primary=primaryTab.session;const peer=peerTab.session,results=[];
 const record=name=>results.push({name,pass:true});
 const generation=randomUUID(),opts=role=>JSON.stringify({reference:true,attached:true,generation,role});
 await evaluate(primary,`crossTab.prepare(${opts('primary')})`);await evaluate(peer,`crossTab.prepare(${opts('peer')})`);
 const before=await evaluate(peer,'crossTab.referenceObserve()');
 for(const kind of ['abort','quota']){
  await evaluate(primary,`crossTab.referencePrepare({id:'${kind}',kind:'attachment-delete'})`);
  const r=await evaluate(primary,`crossTab.referenceFailure('${kind}','${kind}')`);assert.equal(r.ok,false);
  assert.equal((await evaluate(peer,`crossTab.lookup('${kind}')`)).result,null);
  assert.deepEqual((await evaluate(peer,'crossTab.referenceObserve()')).values,before.values);record('native attachment '+kind+' leaves metadata/intents/head/oplog unchanged');
 }
 const packet=await evaluate(primary,"crossTab.preparePacket('attachment-response-loss','cruisePort.syncAssetMetadata',{attachments:{}})");
 await send('Runtime.evaluate',{expression:"crossTab.commitPacket('attachment-response-loss');'dispatched'",returnByValue:true},primary);
 let fact;
 for(let i=0;i<200;i++){fact=await evaluate(peer,"crossTab.lookup('attachment-response-loss')");if(fact.result)break;await new Promise(r=>setTimeout(r,25));}
 assert(fact.result);await send('Target.closeTarget',{targetId:primaryTab.target});primaryTab=await openTab();primary=primaryTab.session;
 await evaluate(primary,`crossTab.claim(${JSON.stringify(token)})`);await evaluate(primary,`crossTab.prepare(${opts('peer')})`);
 const retry=await evaluate(primary,`crossTab.retryPacket(${JSON.stringify(packet)})`);assert.equal(retry.replayed,true);assert.equal(retry.seq,fact.result.seq);
 const j=JSON.parse((await evaluate(primary,'crossTab.referenceObserve()')).values[intents]);assert(j['practice_attachment/attachment-a']);assert(j['practice_attachment_set/menu-0']);record('native attachment response loss / reopen / same-ID replay preserves intent generation');
 const beforeCrash=await evaluate(peer,'crossTab.referenceObserve()');
 // Use native Page.crash in a record request callback. The injected callback
 // crashes its own isolated renderer before that transaction can complete.
 const crashPacket=await evaluate(primary,"crossTab.preparePacket('attachment-renderer-crash','cruisePort.syncAssetMetadata',{attachments:{'attachment-a':{practiceId:'menu-0',pending:{localId:'fixture-local'}}}})");
 await send('Debugger.enable',{},primary);
 await send('Runtime.evaluate',{expression:"crossTab.armCrash();crossTab.commitPacket('attachment-renderer-crash');'dispatched'",returnByValue:true},primary);
 // Caller supplies the debugger checkpoint, so Page.crash is sent only after
 // request success but before transaction.complete.
 return {results,primaryTab,crashPending:true,generation,beforeCrash,crashPacket};
}
