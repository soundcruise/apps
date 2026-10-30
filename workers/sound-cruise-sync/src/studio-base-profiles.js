import {maintenanceCanonical} from './maintenance-bridge-v2.js';
import {STUDIO_PRODUCTION_BASE,STUDIO_BASE_JOURNAL} from './studio-base-profile-data.js';
// Studio-only allowlist. Shared Maintenance Bridge profiles are deliberately unchanged.
// No _cf_* wildcard: even _cf_METADATA must have this exact fixture definition.
const metadata=['table','_cf_METADATA','CREATE TABLE _cf_METADATA (\n        key INTEGER PRIMARY KEY,\n        value BLOB\n      )'];
const freezeRows=rows=>Object.freeze(rows.map(row=>Object.freeze([...row])));
const production=freezeRows(STUDIO_PRODUCTION_BASE);
const fixture=freezeRows([...STUDIO_PRODUCTION_BASE,metadata].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:a[1]<b[1]?-1:a[1]>b[1]?1:0));
const journal=freezeRows(STUDIO_BASE_JOURNAL);
const productionPlatform=freezeRows([['table','_cf_KV','CREATE TABLE _cf_KV (\n        key TEXT PRIMARY KEY,\n        value BLOB\n      ) WITHOUT ROWID']]);
const fixturePlatform=freezeRows([]);
export const STUDIO_PLATFORM_SQL="SELECT json_group_array(json_array(type,name,sql)) encoded FROM (SELECT type,name,sql FROM sqlite_master WHERE name='_cf_KV' AND sql IS NOT NULL ORDER BY type,name)";
export const STUDIO_BASE_SCHEMA_SQL="SELECT json_group_array(json_array(type,name,sql)) encoded FROM (SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name<>'_cf_KV' AND name NOT GLOB 'studio_document_*' ORDER BY type,name)";
export const STUDIO_BASE_PROFILES=Object.freeze({
 production102:Object.freeze({id:'production102',stage:33,fingerprint:'fac6295ff89f2f6a2a754329baba3f1c2264b48670249def9d0ac7b8886843d1',objects:production,journal,platform:productionPlatform}),
 fixture103:Object.freeze({id:'fixture103',stage:33,fingerprint:'a449ac771ca574ad622226e7eea68e9da33afb74d34dd8963e33f1528b750075',objects:fixture,journal,platform:fixturePlatform})
});
const encoded=Object.values(STUDIO_BASE_PROFILES).map(p=>[p,maintenanceCanonical(p.objects),maintenanceCanonical(p.journal),maintenanceCanonical(p.platform)]);
export function identifyStudioBase(objects,history,platform){
 const schema=maintenanceCanonical(objects),journal=maintenanceCanonical(history),managed=maintenanceCanonical(platform);
 return encoded.find(([,s,j,m])=>s===schema&&j===journal&&m===managed)?.[0]??null;
}
