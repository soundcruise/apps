import fs from 'node:fs';import assert from 'node:assert/strict';
import {world}from'./theme-compat-harness.js';
import {seedTestPro,TEST_PRO_TOKEN,TEST_PRO_PEPPER}from'./pro-entitlement-fixture.js';
const dir=process.env.MIDNIGHT_CANDIDATE_DIR;assert.ok(dir,'MIDNIGHT_CANDIDATE_DIR is required');const file=dir+'/flow-probe.mjs';fs.writeFileSync(file,fs.readFileSync(dir+'/production-v148.mjs','utf8')+'\nexport {handleRequest,createD1SyncRepository,hashRecord,validatePushPayload,visibleRecordView,preserveHiddenSettings,parseBodyCapabilities,validateRecordPayload};\n');const m=await import(file);let checks=0;
assert.ok(m.STUDIO_CANARY_POLICY);
try{for(const appId of ['pitch','fretboard','rhythm']){const w=world(appId);try{
 await seedTestPro(w.db);w.env.PRO_CREDENTIAL_PEPPER=TEST_PRO_PEPPER;w.db.raw.prepare("UPDATE sync_datasets SET state='ready'").run();const deps={...w.dependencies,createRepository:db=>m.createD1SyncRepository(db)};const headers={Origin:'https://soundcruise.jp',Authorization:'Bearer '+w.addDevice(),'X-Sound-Cruise-Pro-Authorization':'Bearer '+TEST_PRO_TOKEN,'Content-Type':'application/json'};
 const send=async(path,body)=>{const r=await m.handleRequest(new Request('https://sync.soundcruise.jp'+path,{headers,method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})}),w.env,null,deps);return {status:r.status,body:await r.json()}};
 const op={operationId:crypto.randomUUID(),recordType:'settings',recordId:'settings',schemaVersion:1,baseRevision:0,payload:{id:'settings',values:{theme:'midnight'}},deleted:false};op.payloadHash=await m.hashRecord(op,crypto,appId);
 let r=await send('/v1/sync/push',{appId,mode:'sync',capabilities:['settings_theme_v1'],operations:[op]});assert.equal(r.body.results[0].code,'settings_theme_upgrade_required');assert.equal(w.stored(),null);checks++;
 r=await send('/v1/sync/push',{appId,mode:'sync',capabilities:['settings_theme_v1','settings_theme_v2'],operations:[op]});assert.equal(r.body.results[0].status,'applied');checks++;
 const old=await send('/v1/sync/snapshot?appId='+appId+'&capabilities=settings_theme_v1');assert.equal(old.body.records[0].payload.values.theme,'dark');checks++;
 const modern=await send('/v1/sync/snapshot?appId='+appId+'&capabilities=settings_theme_v2');assert.equal(modern.body.records[0].payload.values.theme,'midnight');checks++;
 const light={...op,operationId:crypto.randomUUID(),baseRevision:1,payload:{id:'settings',values:{theme:'light'}}};light.payloadHash=await m.hashRecord(light,crypto,appId);r=await send('/v1/sync/push',{appId,mode:'sync',capabilities:['settings_theme_v1'],operations:[light]});assert.equal(r.body.results[0].status,'applied');assert.equal(w.stored().values.theme,'light');checks++;
 const denied=await m.handleRequest(new Request('https://sync.soundcruise.jp/v1/sync/snapshot?appId='+appId,{headers:{Origin:'https://soundcruise.jp'}}),w.env,null,deps);assert.notEqual(denied.status,200);checks++;
 }finally{w.close()}}
 const ai=await m.handleRequest(new Request('https://sync.soundcruise.jp/v2/support/ask',{method:'POST',headers:{Origin:'https://soundcruise.jp','Content-Type':'application/json'},body:'{}'}),{ALLOWED_ORIGINS:'https://soundcruise.jp',AI_SUPPORT_MODE:'off'});assert.equal(ai.status,404);checks++;
 console.log(JSON.stringify({productionBundleHandlerChecks:checks,aiOffStatus:ai.status}));
}finally{fs.unlinkSync(file)}
