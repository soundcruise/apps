// L2a dormant Port-owned store. Only explicitly branded isolated scopes can open
// a database. No Repository adapter, boot hook, migration, Sync or Pro runtime.
import { AUTHORITY_DB_NAME, AUTHORITY_DB_VERSION, STORE_KEYS, COMMIT_STORES, AUTHORIZATION_MARGIN_MS,
    PORT_DATASET_KEYS, PORT_DELETE_INTENTS, identifier, fail, frozen, canonical, equal, digest,
    validateDataset, assertPortReferentialIntegrity, assertRetainedFields, validateControl, assertWritableControl, validateHead,
    validateManifest, validateRecord, validateOplog, assertJSONEvidence, inferredDependencies, fingerprintDependencies, mergeDeleteIntents } from './port-idb-authority-contract.mjs';
import { safeEvidence, MIGRATION_STATES } from './port-migration-contract.mjs';
import { actionPolicy, assertActionSemantics, AUTHORITY_ACTION_POLICY_VERSION } from './port-authority-action-policy.mjs';
export { AUTHORITY_DB_NAME, AUTHORITY_DB_VERSION, STORE_KEYS, AUTHORIZATION_MARGIN_MS };
const scopes = new WeakMap();
// Test injection is a separate privileged, explicit fixture setup step. A normal
// Port/Studio route cannot install it, even when served on localhost. Not a JS sandbox.
export function installIsolatedAuthorityTestProvider(scope, provider) {
    const env=scopes.get(scope);
    if(!env || typeof window!=='undefined' && (!['localhost','127.0.0.1','[::1]'].includes(location.hostname) ||
        !location.pathname.startsWith('/apps/cruise-port/tests/')) || !Object.isFrozen(provider) ||
        ['capture','describe','verify'].some(k=>typeof provider[k]!=='function') || env.testProvider) throw fail('test-provider-isolation-required');
    env.testProvider=provider;
}
const corrupt = new Set(['recovery-required','head-invalid','control-invalid','control-identity-invalid','manifest-invalid',
    'manifest-digest-invalid','head-manifest-mismatch','manifest-intent-mismatch','record-invalid','oplog-invalid','journal-invalid','root-invalid','non-json-evidence']);
const rejected = reason => ({ok:false,status:corrupt.has(reason)?'recovery-required':'rejected',reason});
const positive = n => Number.isSafeInteger(n) && n > 0;
const errorCode = error => typeof error?.code==='string' ? error.code : (error?.name === 'QuotaExceededError' ? 'quota-exceeded' : 'idb-error');
const checkKeys = keys => { if (!Array.isArray(keys) || keys.some(k=>!PORT_DATASET_KEYS.includes(k)) || new Set(keys).size!==keys.length) throw fail('invalid-target-keys'); };
export function createIsolatedIDBAuthorityScope({indexedDB, name=AUTHORITY_DB_NAME, partitionId,
    now=Date.now, token=()=>globalThis.crypto.randomUUID(), onLifecycle=()=>{}}={}) {
    if (typeof window !== 'undefined' && !['localhost','127.0.0.1','::1','[::1]'].includes(window.location.hostname)) throw fail('isolated-scope-required');
    if (!indexedDB?.open || typeof partitionId !== 'string' || !partitionId || typeof now!=='function' || typeof token!=='function' ||
        !(name===AUTHORITY_DB_NAME || /^sound-cruise-port-authority-v1-fixture-[A-Za-z0-9_-]+$/.test(name))) throw fail('isolated-scope-required');
    const scope=Object.freeze({name,partitionId});scopes.set(scope,{indexedDB,name,partitionId,now,token,onLifecycle});return scope;
}
function validateSchema(db) {
    if (db.version!==AUTHORITY_DB_VERSION || !equal([...db.objectStoreNames].sort(),Object.keys(STORE_KEYS).sort())) throw fail('schema-invalid');
    const tx=db.transaction(Object.keys(STORE_KEYS),'readonly');
    for (const [name,keyPath] of Object.entries(STORE_KEYS)) {
        const store=tx.objectStore(name);
        if (!equal(store.keyPath,keyPath) || store.autoIncrement || store.indexNames.length) throw fail('schema-invalid');
    }
}
export function openIDBAuthorityStore(scope) {
    const env=scopes.get(scope);if(!env)return Promise.reject(fail('isolated-scope-required'));
    return new Promise((resolve,reject)=>{
        let request,settled=false;
        const stop=code=>{if(!settled){settled=true;reject(fail(code));}};
        const lifecycle=event=>{try{env.onLifecycle(event);}catch{}};
        try{request=env.indexedDB.open(env.name,AUTHORITY_DB_VERSION);}catch{stop('database-unavailable');return;}
        request.onblocked=()=>{lifecycle('blocked');stop('open-blocked');};
        request.onupgradeneeded=event=>{
            if(settled||event.oldVersion!==0){request.transaction.abort();stop('schema-upgrade-unsupported');return;}
            for(const [name,keyPath]of Object.entries(STORE_KEYS))request.result.createObjectStore(name,{keyPath:Array.isArray(keyPath)?[...keyPath]:keyPath});
        };
        request.onerror=()=>stop(request.error?.name==='VersionError'?'future-schema':'database-unavailable');
        request.onsuccess=()=>{
            const db=request.result;if(settled){db.close();return;}
            try{validateSchema(db);}catch(e){db.close();stop(e.code||'schema-invalid');return;}
            settled=true;resolve(makeStore(db,env,lifecycle));
        };
    });
}
function validateJournal(journal) {
    if (!journal || journal.schemaVersion!==1 || !positive(journal.revision) || !MIGRATION_STATES.includes(journal.state)) throw fail('journal-invalid');
    identifier(journal.migrationId);identifier(journal.generation);assertJSONEvidence(journal);safeEvidence(journal);
}
function validateRoot(root) {
    if (!root || root.schemaVersion!==1 || !['sync-base','recovery','migration-evidence'].includes(root.kind) ||
        !Array.isArray(root.manifestIds) || !Array.isArray(root.recordRefs) || !Array.isArray(root.journalIds)) throw fail('root-invalid');
    identifier(root.generation);identifier(root.rootId);root.manifestIds.forEach(identifier);root.journalIds.forEach(identifier);
    for(const ref of root.recordRefs)if(!PORT_DATASET_KEYS.includes(ref.logicalKey)||!positive(ref.version))throw fail('root-invalid');
    assertJSONEvidence(root);safeEvidence(root);
}
function makeStore(db,env,lifecycle) {
    let state='open';const prepared=new WeakMap();
    db.onversionchange=()=>{state='versionchange';db.close();lifecycle('versionchange');};
    db.onclose=()=>{if(state==='open'){state='connection-lost';lifecycle('unexpected-close');}};
    // Only IDB requests and synchronous callbacks run in this transaction. The
    // enclosing Promise is completed by complete/abort, never by request success.
    function transact(names,mode,build) {
        if(state!=='open')return Promise.resolve(rejected(state));
        return new Promise(resolve=>{
            let tx,reason,output;
            try{tx=db.transaction(names,mode,{durability:'strict'});}catch(e){resolve(rejected(errorCode(e)));return;}
            const ctx={tx,store:name=>tx.objectStore(name),done:value=>{output=value;},
                fail:code=>{if(reason)return;reason=code;try{tx.abort();}catch{}},
                request(request,success=()=>{}){
                    request.onerror=()=>ctx.fail(errorCode(request.error));
                    request.onsuccess=()=>{if(reason)return;try{success(request.result);}catch(e){ctx.fail(errorCode(e));}};
                    return request;
                }};
            tx.onabort=()=>resolve(rejected(reason||errorCode(tx.error)));
            tx.onerror=()=>{reason ||= errorCode(tx.error);};
            tx.oncomplete=()=>resolve(frozen(output===undefined?{ok:true}:output));
            try{build(ctx);}catch(e){ctx.fail(errorCode(e));}
        });
    }
    function readManifestValues(ctx,generation,manifest,done) {
        validateManifest(manifest);const values={};let remaining=PORT_DATASET_KEYS.length;
        const finish=()=>{
            if(--remaining)return;
            validateDataset(values);
            if(!equal(JSON.parse(values[PORT_DELETE_INTENTS]||'{}'),manifest.deleteIntents))throw fail('manifest-intent-mismatch');
            done(values);
        };
        for(const key of PORT_DATASET_KEYS){
            const version=manifest.versions[key];
            if(version===null){values[key]=null;finish();}
            else ctx.request(ctx.store('records').get([generation,key,version]),record=>{
                validateRecord(record,generation,key,version,manifest.recordDigests[key]);values[key]=record.raw;finish();
            });
        }
    }
    function readSnapshot(ctx,generation,done) {
        ctx.request(ctx.store('head').get(generation),head=>ctx.request(ctx.store('control').get(generation),control=>{
            if(!head&&!control){
                // Missing both pointers is not a fresh generation if orphaned
                // immutable data / commit facts survive. Never silently reseed it.
                let pending=3;
                for(const name of ['records','manifests','oplog'])ctx.request(ctx.store(name).openCursor(),cursor=>{
                    if(cursor){if(cursor.value.generation===generation)throw fail('recovery-required');cursor.continue();}
                    else if(!--pending)done(null);
                });
                return;
            }
            if(!head||!control)throw fail('recovery-required');
            validateHead(head);validateControl(control);
            if(head.generation!==generation||control.generation!==generation||head.controlEpoch>control.epoch||control.identity.partitionId!==env.partitionId)throw fail('recovery-required');
            ctx.request(ctx.store('manifests').get([generation,head.manifestId]),manifest=>{
                if(!manifest)throw fail('recovery-required');validateManifest(manifest,head);
                readManifestValues(ctx,generation,manifest,values=>{
                    assertPortReferentialIntegrity(values);
                    done(frozen({generation,head,control,manifest,values,versions:{...manifest.versions}}));
                });
            });
        }));
    }
    function checkRootReferences(ctx,root,done) {
        let count=root.manifestIds.length+root.recordRefs.length+root.journalIds.length;
        if(!count){done();return;}
        const finish=()=>{if(!--count)done();};
        for(const id of root.manifestIds)ctx.request(ctx.store('manifests').get([root.generation,id]),m=>{
            if(!m)throw fail('root-reference-missing');validateManifest(m);finish();
        });
        for(const ref of root.recordRefs)ctx.request(ctx.store('records').get([root.generation,ref.logicalKey,ref.version]),r=>{
            if(!r)throw fail('root-reference-missing');validateRecord(r,root.generation,ref.logicalKey,ref.version,r.digest);finish();
        });
        for(const id of root.journalIds)ctx.request(ctx.store('journal').get(id),j=>{
            validateJournal(j);if(j.generation!==root.generation)throw fail('root-reference-missing');finish();
        });
    }
    function storeRoot(ctx,root,done) {
        ctx.request(ctx.store('roots').get([root.generation,root.rootId]),old=>{
            if(old){validateRoot(old);if(!equal(old,root))throw fail('root-identity-conflict');done();return;}
            checkRootReferences(ctx,root,()=>ctx.request(ctx.store('roots').add(root),done));
        });
    }
    function checkCommittedFact(ctx,log,done) {
        ctx.request(ctx.store('manifests').get([log.generation,log.result.manifestId]),manifest=>{
            if(!manifest)throw fail('recovery-required');validateManifest(manifest);
            if(manifest.generation!==log.generation||manifest.seq!==log.result.seq||manifest.revision!==log.result.revision)throw fail('oplog-invalid');
            done();
        });
    }
    function capture({generation,operationId,action,base,changes,dependencyKeys=[],acknowledgements=[],authorizationContext,initialControl,
        operationData=null,authorizationIdentity,authorizationPolicy,systemCapability}) {
        identifier(generation);identifier(operationId);identifier(action);
        if(!changes||Object.getPrototypeOf(changes)!==Object.prototype)throw fail('invalid-draft');
        const keys=Object.keys(changes);checkKeys(keys);checkKeys(dependencyKeys);
        if(!Array.isArray(acknowledgements)||acknowledgements.some(a=>!a||!equal(Object.keys(a).sort(),['generation','key'])||typeof a.key!=='string'||!a.key||typeof a.generation!=='string'||!a.generation))throw fail('invalid-acknowledgements');
        if(authorizationContext!==undefined&&(!authorizationContext||!Object.isFrozen(authorizationContext)))throw fail('operation-context-invalid');
        const b=base&&structuredClone(base), c=structuredClone(changes), a=structuredClone(acknowledgements);
        const dependencies=[...new Set([...dependencyKeys,...inferredDependencies(keys)])];
        if(b){
            if(b.generation!==generation)throw fail('base-generation-mismatch');validateHead(b.head);validateControl(b.control);validateManifest(b.manifest,b.head);validateDataset(b.values);
            if(!equal(b.versions,b.manifest.versions))throw fail('base-invalid');
            for(const key of PORT_DATASET_KEYS){
                const version=b.versions[key];
                if(version===null?b.values[key]!==null:digest({generation,logicalKey:key,version,raw:b.values[key]})!==b.manifest.recordDigests[key])throw fail('base-invalid');
            }
        }else if(!initialControl)throw fail('base-required');
        const draft=b?{...b.values,...c}:c;validateDataset(draft);
        if(b)assertRetainedFields(b.values,draft,keys);
        const policy=initialControl?'isolated-initialize':actionPolicy(action,env.testProvider?.fixtureMutations===true);
        const identity=authorizationIdentity??(policy==='pro'?env.testProvider?.describe(authorizationContext)??null:null);
        const policyIdentity={version:AUTHORITY_ACTION_POLICY_VERSION,policy};
        if(authorizationPolicy!==undefined&&!equal(authorizationPolicy,policyIdentity))throw fail('authorization-policy-changed');
        const body={schemaVersion:1,generation,operationId,action,base:b?{manifestId:b.head.manifestId,seq:b.head.seq,
            versions:b.versions,control:b.control}:null,changes:c,dependencyKeys:[...new Set([...dependencyKeys,...fingerprintDependencies(keys)])],acknowledgements:a,initialControl:initialControl||null};
        // Legacy fixture fingerprints remain historical; formal policy identities
        // include policy version, operation semantics and pinned credential identity.
        if(policy!=='isolated-fixture'&&policy!=='isolated-initialize')Object.assign(body,{authorizationPolicy:policyIdentity,operationData,authorizationIdentity:identity});
        const value=frozen({generation,operationId,action,base:b,changes:c,dependencyKeys:dependencies,acknowledgements:a,
            policy,operationData:structuredClone(operationData),authorizationIdentity:structuredClone(identity),authorizationPolicy:policyIdentity,
            initialControl:initialControl&&structuredClone(initialControl),fingerprint:digest(body)});
        const handle=Object.freeze({generation,operationId});prepared.set(handle,{...value,authorizationContext,
            capability:env.testProvider?.capture(value,systemCapability,authorizationContext)});return handle;
    }
    async function reserveOperation(handle) {
        const p=prepared.get(handle);if(!p)return Promise.resolve(rejected('prepared-handle-invalid'));
        // Reserve the immutable identity even when authorization later rejects.
        // This transaction publishes no dataset, control, head or commit fact.
        // The journal row is not a migration journal/root and cannot authorize writes.
        if(!p.policy.startsWith('isolated-')) {
            const reservation=await transact(['journal','oplog'],'readwrite',ctx=>{
                const key='operation-'+digest([p.generation,p.operationId]);
                ctx.request(ctx.store('oplog').get([p.generation,p.operationId]),log=>{
                    if(log){validateOplog(log,p.generation,p.operationId);if(log.fingerprint!==p.fingerprint)throw fail('operation-id-payload-conflict');ctx.done({ok:true});return;}
                    ctx.request(ctx.store('journal').get(key),old=>{
                        const row={migrationId:key,kind:'operation-identity',schemaVersion:1,generation:p.generation,operationId:p.operationId,fingerprint:p.fingerprint};
                        if(old){if(!equal(old,row))throw fail('operation-id-payload-conflict');}
                        else ctx.request(ctx.store('journal').add(row));ctx.done({ok:true});
                    });
                });
            });
            if(!reservation.ok)return reservation;
        }
        return {ok:true};
    }
    async function commit(handle,{commitGuard}={}) {
        const p=prepared.get(handle);if(!p)return rejected('prepared-handle-invalid');
        const reservation=await reserveOperation(handle);if(!reservation.ok)return reservation;
        return transact(COMMIT_STORES,'readwrite',ctx=>ctx.request(ctx.store('oplog').get([p.generation,p.operationId]),old=>{
            if(old){
                validateOplog(old,p.generation,p.operationId);
                if(old.fingerprint!==p.fingerprint)throw fail('operation-id-payload-conflict');
                checkCommittedFact(ctx,old,()=>ctx.done({...old.result,replayed:true}));return;
            }
            readSnapshot(ctx,p.generation,current=>{
                if(!current){if(p.base||!p.initialControl)throw fail('recovery-required');write(null);return;}
                if(!p.base||p.initialControl)throw fail('generation-already-exists');
                ctx.request(ctx.store('manifests').get([p.generation,p.base.head.manifestId]),baseManifest=>{
                    if(!baseManifest)throw fail('base-manifest-missing');validateManifest(baseManifest,p.base.head);
                    if(!equal(baseManifest,p.base.manifest)||p.base.head.seq>current.head.seq)throw fail('base-invalid');
                    const keys=[...new Set([...Object.keys(p.changes).filter(k=>k!==PORT_DELETE_INTENTS),...p.dependencyKeys])];
                    for(const key of keys)if(current.versions[key]!==p.base.versions[key])throw fail('stale');
                    assertWritableControl(current.control,p.base.control);write(current);
                });
            });
            function write(current) {
                const control=current?.control||p.initialControl;validateControl(control);
                if(control.generation!==p.generation||control.identity.partitionId!==env.partitionId)throw fail('control-identity-invalid');
                assertWritableControl(control,p.base?.control||control);
                const empty=Object.fromEntries(PORT_DATASET_KEYS.map(k=>[k,null])),before=current?.values||empty;
                const values={...before,...p.changes};
                if(p.initialControl) { if(!p.capability?.initialize)throw fail('initialize-capability-required'); }
                else {
                    if(p.policy!==actionPolicy(p.action,env.testProvider?.fixtureMutations===true))throw fail('authorization-policy-changed');
                    assertActionSemantics(p,before,p.capability);
                }
                const authorizedAt=env.now();if(!Number.isFinite(authorizedAt)||authorizedAt<0)throw fail('authorization-time-invalid');
                if((p.policy==='pro'||p.authorizationContext!==undefined)&&typeof commitGuard!=='function')throw fail('operation-commit-guard-required');
                if(p.policy==='pro'&&!env.testProvider?.verify(p.authorizationContext,commitGuard,p))throw fail('operation-guard-untrusted');
                if(commitGuard!==undefined){
                    if(typeof commitGuard!=='function')throw fail('operation-commit-guard-invalid');
                    const verdict=commitGuard(p.authorizationContext,frozen({operationId:p.operationId,action:p.action,generation:p.generation,
                        head:current?.head||null,control,authorizedAt,authorizationMarginMs:AUTHORIZATION_MARGIN_MS,targetKeys:Object.keys(p.changes),dependencyKeys:p.dependencyKeys}));
                    if(verdict?.then){verdict.catch?.(()=>{});throw fail('operation-commit-guard-async');}
                    if(verdict===false||verdict?.ok===false||verdict?.allowed===false)throw fail('operation-authorization-rejected');
                    if(p.policy==='pro') {
                        if(!verdict || verdict.ok!==true || verdict.policy!=='pro' || !equal({generation:verdict.generation,credentialFingerprint:verdict.credentialFingerprint},p.authorizationIdentity) ||
                            !Number.isSafeInteger(verdict.generation)||verdict.generation<1||!/^[a-f0-9]{64}$/.test(verdict.credentialFingerprint))throw fail('pro-proof-result-invalid');
                        if(!Number.isFinite(verdict.wallMarginMs)||!Number.isFinite(verdict.monoMarginMs)||
                            verdict.wallMarginMs<AUTHORIZATION_MARGIN_MS||verdict.monoMarginMs<AUTHORIZATION_MARGIN_MS)throw fail('pro-proof-margin-insufficient');
                    }
                }
                if(current){
                    const merged=mergeDeleteIntents(before,values,p.changes[PORT_DELETE_INTENTS],p.base.values,p.acknowledgements,p.operationId);
                    values[PORT_DELETE_INTENTS]=Object.keys(merged).length||before[PORT_DELETE_INTENTS]!==null||p.changes[PORT_DELETE_INTENTS]!==undefined?JSON.stringify(merged):null;
                    assertRetainedFields(before,values,Object.keys(p.changes));
                }
                validateDataset(values);
                // Validate the merged latest head, not the caller's old cache.
                // All-or-nothing rejection happens before any record publication.
                assertPortReferentialIntegrity(values,current?.values);
                const seq=(current?.head.seq||0)+1;if(!Number.isSafeInteger(seq))throw fail('sequence-exhausted');
                const manifestId=identifier(env.token()),revision=identifier(env.token()),versions={...current?.versions},recordDigests={...current?.manifest.recordDigests};
                if(!current)ctx.request(ctx.store('control').add(control));
                for(const key of PORT_DATASET_KEYS){
                    const prior=current?.versions[key]??null;
                    if(values[key]===before[key]){versions[key]=prior;recordDigests[key]=current?.manifest.recordDigests[key]??null;continue;}
                    const version=(prior||0)+1;if(!Number.isSafeInteger(version))throw fail('record-version-exhausted');
                    versions[key]=version;
                    const record={schemaVersion:1,generation:p.generation,logicalKey:key,version,raw:values[key],digest:digest({generation:p.generation,logicalKey:key,version,raw:values[key]})};
                    recordDigests[key]=record.digest;ctx.request(ctx.store('records').add(record));
                }
                const body={schemaVersion:1,generation:p.generation,manifestId,seq,revision,parentManifestId:current?.head.manifestId||null,
                    versions,recordDigests,deleteIntents:JSON.parse(values[PORT_DELETE_INTENTS]||'{}')};
                const manifest={...body,digest:digest(body)};validateManifest(manifest);
                const head={schemaVersion:1,repositoryProtocol:control.repositoryProtocol,writerProtocol:control.writerProtocol,
                    generation:p.generation,seq,manifestId,revision,operationId:p.operationId,controlEpoch:control.epoch};validateHead(head);
                const result={ok:true,status:'committed',generation:p.generation,seq,manifestId,revision,operationId:p.operationId,authorizedAt,publish:false};
                const log={schemaVersion:1,generation:p.generation,operationId:p.operationId,fingerprint:p.fingerprint,result};validateOplog(log,p.generation,p.operationId);
                ctx.request(ctx.store('manifests').add(manifest));ctx.request(ctx.store('head').put(head));
                ctx.request(ctx.store('oplog').add(log),()=>ctx.tx.commit?.());
                ctx.done(result);
            }
        }));
    }
    return Object.freeze({
        get status(){return state;},
        dispose(){if(state==='open'){state='disposed';db.close();lifecycle('disposed');}},
        hydrate(generation){
            try{identifier(generation);}catch(e){return Promise.resolve(rejected(e.code));}
            return transact(COMMIT_STORES,'readonly',ctx=>readSnapshot(ctx,generation,snapshot=>ctx.done(snapshot?
                {ok:true,status:'hydrated',snapshot,readOnly:snapshot.control.state!=='active'||snapshot.control.suspended||snapshot.control.fenceRevoked||snapshot.control.identityInvalidated||snapshot.control.recoveryRequired}:
                {ok:true,status:'absent',snapshot:null}))).then(result=>result.ok?result:{...result,status:'recovery-required'});
        },
        prepare({base,operationId,action='fixture-save',changes,dependencyKeys,acknowledgements,authorizationContext,operationData,authorizationIdentity,authorizationPolicy,systemCapability}){
            if(state!=='open')throw fail(state);return capture({generation:base?.generation,base,operationId,action,changes,dependencyKeys,acknowledgements,authorizationContext,operationData,authorizationIdentity,authorizationPolicy,systemCapability});
        },
        preparedIdentity(handle){const p=prepared.get(handle);if(!p)throw fail('prepared-handle-invalid');return frozen({authorizationPolicy:p.authorizationPolicy,authorizationIdentity:p.authorizationIdentity});},
        reserveOperation,
        initialize({generation,control,values,operationId}){
            try{validateControl(control);const handle=capture({generation,operationId,action:'fixture-initialize',changes:values,initialControl:control});return commit(handle);}
            catch(e){return Promise.resolve(rejected(errorCode(e)));}
        },
        commit,
        // Exact historical dataset for Repository Adapter read bases. A later
        // head must never be substituted for the operation that just completed.
        readCommittedDataset(generation,operationId){
            try{identifier(generation);identifier(operationId);}catch(e){return Promise.resolve(rejected(e.code));}
            return transact(['oplog','manifests','records'],'readonly',ctx=>ctx.request(ctx.store('oplog').get([generation,operationId]),log=>{
                if(!log){ctx.done({ok:true,result:null});return;}
                validateOplog(log,generation,operationId);
                ctx.request(ctx.store('manifests').get([generation,log.result.manifestId]),manifest=>{
                    if(!manifest)throw fail('recovery-required');validateManifest(manifest);
                    if(manifest.generation!==generation||manifest.seq!==log.result.seq||manifest.revision!==log.result.revision)throw fail('oplog-invalid');
                    readManifestValues(ctx,generation,manifest,values=>ctx.done({ok:true,result:log.result,values,versions:manifest.versions}));
                });
            }));
        },
        lookupOperation(generation,operationId){
            try{identifier(generation);identifier(operationId);}catch(e){return Promise.resolve(rejected(e.code));}
            return transact(['oplog','manifests'],'readonly',ctx=>ctx.request(ctx.store('oplog').get([generation,operationId]),log=>{
                if(!log){ctx.done({ok:true,result:null});return;}
                validateOplog(log,generation,operationId);checkCommittedFact(ctx,log,()=>ctx.done({ok:true,result:log.result}));
            }));
        },
        updateControl(generation,{expectedEpoch,patch}){
            if(!env.testProvider)return Promise.resolve(rejected('fixture-control-capability-required'));
            try{identifier(generation);if(!patch||Object.keys(patch).some(k=>!['state','suspended','fenceRevoked','identityInvalidated','recoveryRequired','fenceEpoch','fenceEvidence'].includes(k)))throw fail('control-patch-invalid');}
            catch(e){return Promise.resolve(rejected(errorCode(e)));}
            const nextPatch=structuredClone(patch);
            return transact(['control'],'readwrite',ctx=>ctx.request(ctx.store('control').get(generation),old=>{
                validateControl(old);if(old.epoch!==expectedEpoch)throw fail('control-stale');
                const next={...old,...nextPatch,epoch:old.epoch+1};validateControl(next);
                if(next.fenceEpoch<old.fenceEpoch)throw fail('control-stale');
                ctx.request(ctx.store('control').put(next));ctx.done({ok:true,control:next});
            }));
        },
        readJournal(migrationId){
            try{identifier(migrationId);}catch(e){return Promise.resolve(rejected(e.code));}
            return transact(['journal'],'readonly',ctx=>ctx.request(ctx.store('journal').get(migrationId),j=>{if(j)validateJournal(j);ctx.done({ok:true,journal:j||null});}));
        },
        writeJournal(journal,{expectedRevision=null,roots=[]}={}){
            if(!env.testProvider)return Promise.resolve(rejected('fixture-journal-capability-required'));
            let j,r;try{j=structuredClone(journal);validateJournal(j);r=structuredClone(roots);r.forEach(validateRoot);if(j.revision!==(expectedRevision||0)+1)throw fail('journal-stale');}
            catch(e){return Promise.resolve(rejected(errorCode(e)));}
            return transact(['journal','roots','manifests','records'],'readwrite',ctx=>ctx.request(ctx.store('journal').get(j.migrationId),old=>{
                if(old){validateJournal(old);if(old.generation!==j.generation)throw fail('journal-identity-conflict');}
                if((old?.revision??null)!==expectedRevision)throw fail('journal-stale');
                ctx.request(ctx.store('journal').put(j));
                let pending=r.length;const done=()=>{if(!--pending)ctx.done({ok:true,journal:j});};
                if(!pending)ctx.done({ok:true,journal:j});else for(const root of r)storeRoot(ctx,root,done);
            }));
        },
        writeRoot(root){
            if(!env.testProvider)return Promise.resolve(rejected('fixture-root-capability-required'));
            let r;try{r=structuredClone(root);validateRoot(r);}catch(e){return Promise.resolve(rejected(errorCode(e)));}
            return transact(['roots','manifests','records','journal'],'readwrite',ctx=>storeRoot(ctx,r,()=>ctx.done({ok:true,root:r})));
        },
        readRoot(generation,rootId){
            try{identifier(generation);identifier(rootId);}catch(e){return Promise.resolve(rejected(e.code));}
            return transact(['roots'],'readonly',ctx=>ctx.request(ctx.store('roots').get([generation,rootId]),r=>{if(r)validateRoot(r);ctx.done({ok:true,root:r||null});}));
        }
    });
}
