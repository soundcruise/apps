// Isolated Account-only release candidate. NOT imported by normal app/index.
// Refusal is a migration prerequisite, never evidence that legacy users migrated.
export const RELEASE_RESTRICTED_ROUTES=Object.freeze([
 ['POST','/v1/sync/start','B','Account admission + app join'],
 ['POST','/v1/sync/pairing-codes','B','Account environment/app-device join'],
 ['POST','/v1/sync/pair','B','Account environment/app-device join'],
 ['POST','/v1/sync/recover','B','Account recovery; preserve legacy/dual recovery until migrated'],
 ['POST','/v1/sync/recovery-codes','B','Account recovery rotation'],
 ['POST','/v1/sync/account/delete-intent','B','Account/membership delete intent'],
 ['DELETE','/v1/sync/account','B','Account/membership deletion'],
 ['POST','/v2/accounts/qa/enroll','C','Disposable QA only'],
 ['GET','/v2/accounts/bridges/chord','B','Existing Chord bridge completion/migration proof'],
 ...['prepare','dual','finalize','rollback'].map(p=>['POST','/v2/accounts/bridges/chord/'+p,'B','Existing Chord bridge completion/migration proof'])
].map(([method,path,classification,migration])=>Object.freeze({method,path,classification,migration,productionClosure:'HOLD_PENDING_MIGRATION_EVIDENCE'})));
export function isolatedReleaseRefusal(request){
 const item=RELEASE_RESTRICTED_ROUTES.find(r=>r.path===new URL(request.url).pathname);if(!item)return null;
 const method=request.method==='OPTIONS'?request.headers.get('Access-Control-Request-Method'):request.method;
 const status=method!==item.method?405:item.classification==='C'?403:423;
 return new Response(JSON.stringify({ok:false,code:status===405?'method_not_allowed':item.classification==='C'?'qa_isolated_release_denied':'legacy_migration_required',classification:item.classification,scope:'isolated-account-only-candidate',productionClosure:'NOT_PERFORMED'}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
}
