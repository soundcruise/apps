import {maintenanceCanonical,maintenanceDigest} from './maintenance-bridge-v2.js';
import {MAINTENANCE_V2_DDL} from './maintenance-v2-schema.js';
import {MAINTENANCE_V2_PROFILES} from './maintenance-v2-profiles.js';

const metaName=n=>/^(sync_maintenance_v2_|maintenance_v2_|idx_maintenance_v2_)/.test(n);
const normal=s=>s.trim().replace(/;$/,'');
const schemaSql="SELECT json_group_array(json_array(type,name,sql)) encoded FROM (SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name<>'_cf_KV' ORDER BY type,name)";
const journalSql='SELECT json_group_array(json_array(id,name)) encoded FROM (SELECT id,name FROM d1_migrations ORDER BY id)';
const expected=MAINTENANCE_V2_DDL.map(sql=>{const m=/^CREATE (TABLE|INDEX|TRIGGER) (\w+)/.exec(sql);return{type:m[1].toLowerCase(),name:m[2],sql:normal(sql)};}).sort((a,b)=>a.type.localeCompare(b.type)||a.name.localeCompare(b.name));
// Read only. The exact encoded observations below also form the SQL commit guard.
export async function compatibleSchemaSnapshot(db){
 const encoded=(await db.prepare(schemaSql).first())?.encoded,journal=(await db.prepare(journalSql).first())?.encoded;
 if(typeof encoded!=='string'||typeof journal!=='string')throw Error('compatible_schema_unknown');
 const rows=JSON.parse(encoded).map(([type,name,sql])=>({type,name,sql:normal(sql)})),names=JSON.parse(journal);
 const meta=rows.filter(x=>metaName(x.name)).sort((a,b)=>a.type.localeCompare(b.type)||a.name.localeCompare(b.name));
 const fingerprint=await maintenanceDigest(rows.filter(x=>!metaName(x.name)));
 const profile=Object.values(MAINTENANCE_V2_PROFILES).find(x=>x.fingerprint===fingerprint&&maintenanceCanonical(x.journal)===maintenanceCanonical(names.map(x=>x[1])));
 if(!profile||names.some(([id],i)=>!Number.isSafeInteger(id)||id!==i+1))throw Error('compatible_base_schema_unknown');
 const metadata=meta.length===0?'absent':maintenanceCanonical(meta)===maintenanceCanonical(expected)?'exact':'partial';
 if(metadata==='partial')throw Error('compatible_maintenance_schema_unknown');
 return Object.freeze({stage:profile.stage,metadata,digest:await maintenanceDigest({encoded,journal}),handoverSchemaDigest:await maintenanceDigest({schemaEncoded:encoded,journalEncoded:journal}),
  guard:{sql:'SELECT CASE WHEN (SELECT encoded FROM ('+schemaSql+'))=? AND (SELECT encoded FROM ('+journalSql+'))=? THEN 1 ELSE 0 END AS ok',params:[encoded,journal]}});
}

// Legacy normal SQL is permitted ONLY on exact0033 with no Maintenance metadata.
// A schema/metadata transition races the same D1 transaction, not an earlier JS check.
export function guardLegacyD1(db,snapshot){
 if(snapshot.stage!==33||snapshot.metadata!=='absent')throw Error('compatible_legacy_schema_hold');
 return guardCompatibleD1(db,snapshot);
}
export function guardCompatibleD1(db,snapshot){
 const specs=new WeakMap();
 const guard=()=>db.prepare("SELECT CASE WHEN (SELECT ok FROM ("+snapshot.guard.sql+"))=1 THEN 1 ELSE json_extract('compatible-schema-drift','$.invalid') END").bind(...snapshot.guard.params);
 async function batch(items){
  if(!Array.isArray(items)||!items.length||items.some(x=>!specs.has(x)))throw Error('compatible_foreign_statement');
  const out=await db.batch([guard(),...items.map(x=>specs.get(x)),guard()]);return out.slice(1,-1);
 }
 function prepare(sql,values=[]){
  if(typeof sql!=='string'||sql.includes(';')||!/^\s*(SELECT|INSERT|UPDATE|DELETE|WITH)\b/i.test(sql))throw Error('compatible_sql_hold');
  const read=/^\s*SELECT\b/i.test(sql),native=db.prepare(sql).bind(...values);
  const wrapped={bind(...v){return prepare(sql,v);},async run(){return(await batch([wrapped]))[0];},async all(){return read?native.all():(await batch([wrapped]))[0];},async first(column){if(read)return native.first(column);const row=(await batch([wrapped]))[0].results?.[0]||null;return column===undefined||row===null?row:row[column];}};
  specs.set(wrapped,native);return Object.freeze(wrapped);
 }
 return Object.freeze({prepare,batch,withSession(bookmark){if(typeof db.withSession!=='function')return guardCompatibleD1(db,snapshot);return guardCompatibleD1(db.withSession(bookmark),snapshot);},getBookmark(){return typeof db.getBookmark==='function'?db.getBookmark():null;},exec(){throw Error('compatible_exec_hold');}});
}
