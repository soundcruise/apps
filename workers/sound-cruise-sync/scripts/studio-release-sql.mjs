// Offline renderer only. Does not discover credentials or execute D1 statements.
import {STUDIO_RELEASE_ID,STUDIO_RELEASE_DDL,studioReleaseHash,releaseAssertion,STUDIO_SCHEMA_SQL,STUDIO_JOURNAL_SQL} from '../src/studio-release-schema.js';
import {STUDIO_BASE_PROFILES,STUDIO_PLATFORM_SQL} from '../src/studio-base-profiles.js';
const literal=x=>typeof x==='string'?"'"+x.replaceAll("'","''")+"'":String(x);
export async function renderStudioReleaseSQL(profileId){
 const p=STUDIO_BASE_PROFILES[profileId];if(!p)throw Error('unknown-base-profile');
 const hash=await studioReleaseHash(),record={prepare(sql){return{bind(...params){return{sql,params}}}}},assertion=releaseAssertion(record,hash,profileId);
 const split=assertion.sql.split('?');if(split.length!==assertion.params.length+1)throw Error('renderer-placeholder');
 const final=split.map((s,i)=>s+(i<assertion.params.length?literal(assertion.params[i]):'')).join('');
 const guard="SELECT CASE WHEN (SELECT encoded FROM ("+STUDIO_SCHEMA_SQL+"))="+literal(JSON.stringify(p.objects))+" AND (SELECT encoded FROM ("+STUDIO_JOURNAL_SQL+"))="+literal(JSON.stringify(p.journal))+" AND (SELECT encoded FROM ("+STUDIO_PLATFORM_SQL+"))="+literal(JSON.stringify(p.platform))+" THEN 1 ELSE json_extract('studio_base_mismatch','$.abort') END";
 return ["-- "+STUDIO_RELEASE_ID+" / "+profileId+"; one native D1 batch; default OFF; no remote approval.",guard,...STUDIO_RELEASE_DDL,
 "INSERT INTO studio_document_migrations VALUES(1,"+literal(STUDIO_RELEASE_ID)+","+literal(hash)+","+literal(p.fingerprint)+")",
 "INSERT INTO studio_document_schema_marker VALUES(1,"+literal(STUDIO_RELEASE_ID)+","+literal(hash)+")",
 'INSERT INTO studio_document_control VALUES(1,1,0,1)',final].map((s,i)=>i===0?s:s+';').join('\n')+'\n';
}
