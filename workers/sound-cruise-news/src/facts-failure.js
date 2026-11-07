// Closed operational codes only: never retain arbitrary publisher prose/identity strings.
const codes=xs=>[...new Set((Array.isArray(xs)?xs:[]).filter(x=>typeof x==='string'&&/^[A-Za-z_]{1,60}$/.test(x)))].slice(0,16);
export function safeFactDiagnostics(d={}){
 if(!d||typeof d!=='object'||Array.isArray(d))d={};
 const out={stage:typeof d.stage==='string'&&/^[a-z_]{1,60}$/.test(d.stage)?d.stage:'parser',missingFields:codes(d.missingFields),conflictingFields:codes(d.conflictingFields)};
 if(d.checks&&typeof d.checks==='object')out.checks=Object.fromEntries(Object.entries(d.checks).filter(([k,v])=>/^[a-zA-Z_]{1,60}$/.test(k)&&(typeof v==='boolean'||Number.isSafeInteger(v)&&v>=0&&v<=100)).slice(0,16));
 if(Array.isArray(d.dates))out.dates=d.dates.slice(0,12).map(x=>({role:['publication','updated','event','release','unknown'].includes(x.role)?x.role:'unknown',normalized:isoDay(x.normalized),expected:isoDay(x.expected),basis:['datetime','text','both','conflict'].includes(x.basis)?x.basis:'text'}));
 return out;
}
const isoDay=x=>typeof x==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(x)?x:null;
export function factFailure(code,diagnostics){const e=Error(code);e.factDiagnostics=safeFactDiagnostics(diagnostics);return e;}
export function factFailureKind(code){
 if(/^(?:verified_surface|facts_(?:recovered|provenance_recovered|unchanged|already_complete|duplicate_preserved))$/.test(code||''))return 'none';
 if(/^(?:facts_)?(?:http_(?:401|403|451)|robots_|optout|header_optout|redirect_|source_gate|source_invalid|access_stopped)/.test(code||''))return 'policy';
 if(/^(?:facts_)?(?:http_|timeout|request_timeout|rate_limited|network_or_internal_error|source_unavailable|unavailable|recheck_busy)/.test(code||''))return 'transport';
 if(['facts_identity_changed','facts_identity_conflict','facts_official_identity_conflict','facts_date_changed','facts_release_date_conflict'].includes(code))return 'conflict';
 if(code==='facts_official_identity_missing')return 'uncertainty';
 if(/extract|identity_unconfirmed|date_unconfirmed|scope_uncertain|event_missing|primary_.*(?:unbound|invalid)|parser|structure_changed/.test(code||''))return 'extraction';
 return 'insufficient';
}
export const articleParserFailure=code=>/^(?:facts_(?:date_|identity_|extraction_|scope_|event_|parser_|primary_|not_recovered)|listing_structure_changed|listing_too_large)/.test(code||'');
// Only explicit same-subject title fields may establish a source-field conflict.
// No normalized identity strings are retained in the resulting diagnostic.
export function sourceIdentityConflict(title,brand,models){
 const norm=v=>v.normalize('NFKC').replace(/[®™\s]/g,'').toLowerCase();
 const titleBrand=/^([A-Za-z][A-Za-z0-9 .&'-]{1,60})[「『]/.exec(title)?.[1]?.trim();
 const titleModels=[...title.matchAll(/[「『]([A-Za-z0-9][A-Za-z0-9 .&+()'/:-]{1,99})[」』]/g)].map(m=>m[1]);
 const conflictingFields=[];
 if(titleBrand&&brand&&norm(titleBrand)!==norm(brand)&&!norm(titleBrand).endsWith(norm(brand))&&!norm(brand).endsWith(norm(titleBrand)))conflictingFields.push('brand');
 const words=v=>v.normalize('NFKC').replace(/[®™]/g,'').replace(/,/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
 if(models.length===1&&titleModels.length===1&&norm(models[0])!==norm(titleModels[0])&&!words(models[0]).startsWith(words(titleModels[0])+' ')&&!words(titleModels[0]).startsWith(words(models[0])+' '))conflictingFields.push('models');
 return conflictingFields;
}
