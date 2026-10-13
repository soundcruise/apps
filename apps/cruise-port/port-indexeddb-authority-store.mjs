// L2a dormant Port-owned store. Only explicitly branded isolated scopes can open
// a database. No Repository adapter, boot hook, migration, Sync or Pro runtime.
import { AUTHORITY_DB_NAME, AUTHORITY_DB_VERSION, STORE_KEYS, V1_STORE_KEYS, COMMIT_STORES, AUTHORIZATION_MARGIN_MS,
    POINTER_KEY, RESERVED_JOURNAL_PREFIX, PORT_DATASET_KEYS, PORT_DELETE_INTENTS, identifier, fail, frozen, canonical, equal, digest,
    validateDataset, assertPortReferentialIntegrity, assertRetainedFields, validateControl, assertWritableControl, validateHead,
    validateManifest, validateRecord, validateOplog, validatePointer, validateReservation, reservationKey, assertJSONEvidence,
    inferredDependencies, fingerprintDependencies, mergeDeleteIntents } from './port-idb-authority-contract.mjs';
import { safeEvidence, MIGRATION_STATES } from './port-migration-contract.mjs';
import { actionPolicy, assertActionSemantics, AUTHORITY_ACTION_POLICY_VERSION } from './port-authority-action-policy.mjs';
import { claimCapabilityIssuer, verifyCapability, readAttestation } from './port-authority-capabilities.mjs';
export { AUTHORITY_DB_NAME, AUTHORITY_DB_VERSION, STORE_KEYS, AUTHORIZATION_MARGIN_MS };
const scopes = new WeakMap();
// Port-owned capability issuer for a registered isolated scope (one claimant per
// scope). Product boot does not import this module or call this function.
export function claimPortAuthorityIssuer(scope) {
    if (!scopes.has(scope)) throw fail('isolated-scope-required');
    return claimCapabilityIssuer(scope);
}
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
    'manifest-digest-invalid','head-manifest-mismatch','manifest-intent-mismatch','record-invalid','oplog-invalid','journal-invalid','root-invalid','non-json-evidence',
    'pointer-invalid','pointer-head-mismatch','pointer-control-mismatch','pointer-generation-missing','fixture-pointer-untrusted','reservation-invalid']);
const rejected = reason => ({ok:false,status:corrupt.has(reason)?'recovery-required':'rejected',reason});
const positive = n => Number.isSafeInteger(n) && n > 0;
const errorCode = error => typeof error?.code==='string' ? error.code : (error?.name === 'QuotaExceededError' ? 'quota-exceeded' : 'idb-error');
const checkKeys = keys => { if (!Array.isArray(keys) || keys.some(k=>!PORT_DATASET_KEYS.includes(k)) || new Set(keys).size!==keys.length) throw fail('invalid-target-keys'); };
export function createIsolatedIDBAuthorityScope({indexedDB, name=AUTHORITY_DB_NAME, partitionId,
    now=Date.now, token=()=>globalThis.crypto.randomUUID(), onLifecycle=()=>{}}={}) {
    if (typeof window !== 'undefined' && !['localhost','127.0.0.1','::1','[::1]'].includes(window.location.hostname)) throw fail('isolated-scope-required');
    if (!indexedDB?.open || typeof partitionId !== 'string' || !partitionId || typeof now!=='function' || typeof token!=='function' ||
        !(name===AUTHORITY_DB_NAME || /^sound-cruise-port-authority-v1-fixture-[A-Za-z0-9_-]+$/.test(name))) throw fail('isolated-scope-required');
    const scope=Object.freeze({name,partitionId});scopes.set(scope,{scope,indexedDB,name,partitionId,now,token,onLifecycle});return scope;
}
const object = value => !!value && Object.getPrototypeOf(value) === Object.prototype;
function assertStoreShape(tx,inventory) {
    for (const [name,keyPath] of Object.entries(inventory)) {
        const store=tx.objectStore(name);
        if (!equal(store.keyPath,keyPath) || store.autoIncrement || store.indexNames.length) throw fail('schema-invalid');
    }
}
function createStores(db,inventory) {
    for (const [name,keyPath] of Object.entries(inventory)) db.createObjectStore(name,{keyPath:Array.isArray(keyPath)?[...keyPath]:keyPath});
}
function validateV1Reservation(row) {
    if (!object(row) || !equal(Object.keys(row).sort(),['fingerprint','generation','kind','migrationId','operationId','schemaVersion']) ||
        row.schemaVersion!==1 || row.kind!=='operation-identity' || !/^[a-f0-9]{64}$/.test(row.fingerprint)) throw fail('reservation-migration-invalid');
    identifier(row.generation);identifier(row.operationId);
    if (row.migrationId!==reservationKey(row.generation,row.operationId)) throw fail('reservation-migration-invalid');
    return row;
}
// v1 -> v2, inside the single versionchange transaction: verify the exact v1
// inventory, add pointer/reservations, copy every L3a operation reservation out
// of the migration journal, read each copy back, and only then delete originals.
// Any doubt aborts the whole upgrade, leaving the v1 database untouched.
function upgradeFromV1(db,tx,abort) {
    if (!equal([...db.objectStoreNames].sort(),Object.keys(V1_STORE_KEYS).sort())) throw fail('schema-invalid');
    assertStoreShape(tx,V1_STORE_KEYS);
    createStores(db,{pointer:STORE_KEYS.pointer,reservations:STORE_KEYS.reservations});
    const journal=tx.objectStore('journal'),reservations=tx.objectStore('reservations'),oplog=tx.objectStore('oplog'),rows=[];
    const guard=fn=>(...args)=>{try{fn(...args);}catch(e){abort(e.code||'reservation-migration-failed');}};
    const request=(r,success,code='reservation-migration-failed')=>{r.onerror=event=>{event?.preventDefault?.();abort(code);};r.onsuccess=guard(()=>success(r.result));return r;};
    request(journal.openCursor(),cursor=>{
        if(cursor){
            const row=cursor.value;
            if(row?.kind==='operation-identity')rows.push(validateV1Reservation(row));
            else if(typeof row?.migrationId==='string'&&row.migrationId.startsWith(RESERVED_JOURNAL_PREFIX))throw fail('journal-reserved-key');
            cursor.continue();return;
        }
        let pending=rows.length;
        const copied=()=>{if(--pending)return;for(const row of rows)request(journal.delete(row.migrationId),()=>{});};
        for(const row of rows)request(oplog.get([row.generation,row.operationId]),log=>{
            if(log){validateOplog(log,row.generation,row.operationId);if(log.fingerprint!==row.fingerprint)throw fail('reservation-migration-conflict');}
            const copy={generation:row.generation,operationId:row.operationId,schemaVersion:1,kind:'operation-identity',
                fingerprint:row.fingerprint,action:null,policy:null,targetKeys:null,origin:'v1-journal'};
            request(reservations.add(copy),()=>request(reservations.get([row.generation,row.operationId]),stored=>{
                validateReservation(stored,row.generation,row.operationId);if(!equal(stored,copy))throw fail('reservation-migration-conflict');copied();
            }),'reservation-migration-conflict');
        });
    });
}
function validateSchema(db) {
    if (db.version!==AUTHORITY_DB_VERSION || !equal([...db.objectStoreNames].sort(),Object.keys(STORE_KEYS).sort())) throw fail('schema-invalid');
    assertStoreShape(db.transaction(Object.keys(STORE_KEYS),'readonly'),STORE_KEYS);
}
export function openIDBAuthorityStore(scope) {
    const env=scopes.get(scope);if(!env)return Promise.reject(fail('isolated-scope-required'));
    return new Promise((resolve,reject)=>{
        let request,settled=false,upgradeFailure=null;
        const stop=code=>{if(!settled){settled=true;reject(fail(code));}};
        const lifecycle=event=>{try{env.onLifecycle(event);}catch{}};
        try{request=env.indexedDB.open(env.name,AUTHORITY_DB_VERSION);}catch{stop('database-unavailable');return;}
        request.onblocked=()=>{lifecycle('blocked');stop('open-blocked');};
        // Whitelisted additive steps only: 0->2 creates, 1->2 adds and moves
        // reservations. Anything else (or a late upgrade after blocked) aborts.
        request.onupgradeneeded=event=>{
            const tx=request.transaction;
            const abort=code=>{upgradeFailure||=code;try{tx.abort();}catch{}};
            if(settled){abort('open-blocked');return;}
            try{
                if(event.oldVersion===0)createStores(request.result,STORE_KEYS);
                else if(event.oldVersion===1)upgradeFromV1(request.result,tx,abort);
                else abort('schema-upgrade-unsupported');
            }catch(e){abort(e.code||'schema-upgrade-failed');}
        };
        request.onerror=()=>stop(upgradeFailure||(request.error?.name==='VersionError'?'future-schema':'database-unavailable'));
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
    // Operation reservations live in their own store since schema v2.
    if (journal.migrationId.startsWith(RESERVED_JOURNAL_PREFIX)) throw fail('journal-invalid');
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
    // The pointer is the only statement of which generation is active. A fixture
    // publication is never trusted by a scope without the privileged test provider.
    function readPointer(ctx,done) {
        ctx.request(ctx.store('pointer').get(POINTER_KEY),pointer=>{
            if(pointer){
                validatePointer(pointer);
                if(pointer.partitionId!==env.partitionId)throw fail('pointer-invalid');
                if(pointer.publication.kind==='isolated-fixture'&&!env.testProvider)throw fail('fixture-pointer-untrusted');
            }
            done(pointer||null);
        });
    }
    function readSnapshot(ctx,generation,done) {
        readPointer(ctx,pointer=>ctx.request(ctx.store('head').get(generation),head=>ctx.request(ctx.store('control').get(generation),control=>{
            const target=pointer?.activeGeneration===generation;
            if(!head&&!control){
                if(target)throw fail('pointer-generation-missing');
                // Missing both pointers is not a fresh generation if orphaned
                // immutable data / commit facts survive. Never silently reseed it.
                let pending=3;
                for(const name of ['records','manifests','oplog'])ctx.request(ctx.store(name).openCursor(),cursor=>{
                    if(cursor){if(cursor.value.generation===generation)throw fail('recovery-required');cursor.continue();}
                    else if(!--pending)done(null,pointer);
                });
                return;
            }
            if(!head||!control)throw fail(target?'pointer-generation-missing':'recovery-required');
            validateHead(head);validateControl(control);
            if(head.generation!==generation||control.generation!==generation||head.controlEpoch>control.epoch||control.identity.partitionId!==env.partitionId)throw fail('recovery-required');
            const read=()=>ctx.request(ctx.store('manifests').get([generation,head.manifestId]),manifest=>{
                if(!manifest)throw fail('recovery-required');validateManifest(manifest,head);
                readManifestValues(ctx,generation,manifest,values=>{
                    assertPortReferentialIntegrity(values);
                    done(frozen({generation,head,control,manifest,values,versions:{...manifest.versions},pointer,active:target}),pointer);
                });
            });
            if(!target){read();return;}
            // Pointer, control and the published manifest must agree; a head may
            // only have advanced past the publication point by later commits.
            if(control.state!=='active')throw fail('pointer-control-mismatch');
            if(pointer.publication.controlEpoch>control.epoch||pointer.publication.headSeq>head.seq)throw fail('pointer-head-mismatch');
            ctx.request(ctx.store('manifests').get([generation,pointer.publication.manifestId]),published=>{
                if(!published)throw fail('pointer-head-mismatch');validateManifest(published);
                if(published.seq!==pointer.publication.headSeq||published.digest!==pointer.publication.sealHash)throw fail('pointer-head-mismatch');
                read();
            });
        })));
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
            // The pointer seen by the base is pinned, but it is not part of the
            // historical fingerprint: an L2b request without it still replays.
            if(b.pointer!==undefined&&b.pointer!==null)validatePointer(b.pointer);
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
            const reservation=await transact(['reservations','oplog'],'readwrite',ctx=>{
                ctx.request(ctx.store('oplog').get([p.generation,p.operationId]),log=>{
                    if(log){validateOplog(log,p.generation,p.operationId);if(log.fingerprint!==p.fingerprint)throw fail('operation-id-payload-conflict');ctx.done({ok:true});return;}
                    ctx.request(ctx.store('reservations').get([p.generation,p.operationId]),old=>{
                        const row={generation:p.generation,operationId:p.operationId,schemaVersion:1,kind:'operation-identity',fingerprint:p.fingerprint,
                            action:p.action,policy:p.policy,targetKeys:Object.keys(p.changes).sort(),origin:'v2'};
                        if(old){
                            validateReservation(old,p.generation,p.operationId);
                            // A migrated v1 row keeps only its identity fingerprint.
                            if(old.kind!=='operation-identity'||old.fingerprint!==row.fingerprint||
                                old.origin==='v2'&&!equal(old,row))throw fail('operation-id-payload-conflict');
                        }
                        else ctx.request(ctx.store('reservations').add(row));ctx.done({ok:true});
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
            readSnapshot(ctx,p.generation,(current,pointer)=>{
                if(!current){
                    if(p.base||!p.initialControl)throw fail('recovery-required');
                    // Only an isolated fixture may create an already-active generation;
                    // it publishes the pointer and supersedes the previous one atomically.
                    if(p.initialControl.state!=='active'){write(null,null);return;}
                    if(!pointer){write(null,{previous:null,oldControl:null});return;}
                    ctx.request(ctx.store('control').get(pointer.activeGeneration),old=>{
                        if(!old)throw fail('pointer-generation-missing');validateControl(old);
                        if(old.state!=='active')throw fail('pointer-control-mismatch');
                        write(null,{previous:pointer,oldControl:old});
                    });
                    return;
                }
                if(!p.base||p.initialControl)throw fail('generation-already-exists');
                // Only the generation named by the current pointer is writable;
                // prepared/sealed/superseded generations and a missing pointer reject.
                if(!current.active)throw fail('generation-not-active');
                if(p.base.pointer&&p.base.pointer.pointerEpoch!==current.pointer.pointerEpoch)throw fail('pointer-stale');
                ctx.request(ctx.store('manifests').get([p.generation,p.base.head.manifestId]),baseManifest=>{
                    if(!baseManifest)throw fail('base-manifest-missing');validateManifest(baseManifest,p.base.head);
                    if(!equal(baseManifest,p.base.manifest)||p.base.head.seq>current.head.seq)throw fail('base-invalid');
                    const keys=[...new Set([...Object.keys(p.changes).filter(k=>k!==PORT_DELETE_INTENTS),...p.dependencyKeys])];
                    for(const key of keys)if(current.versions[key]!==p.base.versions[key])throw fail('stale');
                    assertWritableControl(current.control,p.base.control);write(current);
                });
            });
            function write(current,publication) {
                const control=current?.control||p.initialControl;validateControl(control);
                if(control.generation!==p.generation||control.identity.partitionId!==env.partitionId)throw fail('control-identity-invalid');
                if(p.initialControl&&!['staging','prepared','active'].includes(control.state))throw fail('initial-state-invalid');
                if(!p.initialControl||control.state==='active')assertWritableControl(control,p.base?.control||control);
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
                if(publication){
                    const previous=publication.previous;
                    if(publication.oldControl)ctx.request(ctx.store('control').put({...publication.oldControl,state:'superseded',epoch:publication.oldControl.epoch+1}));
                    const next={key:POINTER_KEY,schemaVersion:1,partitionId:env.partitionId,pointerEpoch:(previous?.pointerEpoch||0)+1,
                        activeGeneration:p.generation,namespaceVersion:1,repositoryProtocol:control.repositoryProtocol,writerProtocol:control.writerProtocol,
                        migrationId:p.operationId,publication:{kind:'isolated-fixture',manifestId,headSeq:seq,sealHash:manifest.digest,controlEpoch:control.epoch},
                        previousGeneration:previous?.activeGeneration??null,operationId:p.operationId};
                    validatePointer(next);ctx.request(ctx.store('pointer').put(next));
                }
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
                {ok:true,status:'hydrated',snapshot,activity:snapshot.active?'active':'inactive',
                    readOnly:!snapshot.active||snapshot.control.state!=='active'||snapshot.control.suspended||snapshot.control.fenceRevoked||snapshot.control.identityInvalidated||snapshot.control.recoveryRequired}:
                {ok:true,status:'absent',snapshot:null}))).then(result=>result.ok?result:{...result,status:'recovery-required'});
        },
        readPointer(){
            return transact(['pointer'],'readonly',ctx=>readPointer(ctx,pointer=>ctx.done({ok:true,pointer}))).then(result=>result.ok?result:{...result,status:'recovery-required'});
        },
        // prepared -> sealed. Requires the Port-owned publication capability for
        // this generation. Seals the current head; the journal records its digest.
        seal({generation,migrationId,capability}={}){
            try{identifier(generation);identifier(migrationId);verifyCapability(capability,{scope:env.scope,purpose:'migration-publication',generation});}
            catch(e){return Promise.resolve(rejected(errorCode(e)));}
            return transact([...COMMIT_STORES,'journal'],'readwrite',ctx=>readSnapshot(ctx,generation,current=>{
                if(!current)throw fail('generation-missing');
                ctx.request(ctx.store('journal').get(migrationId),j=>{
                    if(!j)throw fail('journal-missing');validateJournal(j);
                    if(j.generation!==generation||!equal(j.identity,current.control.identity))throw fail('journal-identity-conflict');
                    if(current.control.state==='sealed'&&j.state==='ready-to-publish'&&j.sealManifestId===current.head.manifestId&&j.sealHash===current.manifest.digest){
                        ctx.done({ok:true,status:'already-sealed',sealHash:j.sealHash,controlEpoch:current.control.epoch});return;
                    }
                    // A migration retried after its publication: report, never reseal.
                    if(current.active&&j.state==='active'&&typeof j.sealHash==='string'){
                        ctx.done({ok:true,status:'already-published',sealHash:j.sealHash,controlEpoch:current.control.epoch});return;
                    }
                    if(current.active||current.control.state!=='prepared'||j.state!=='prepared')throw fail('seal-state-invalid');
                    const control={...current.control,state:'sealed',epoch:current.control.epoch+1};validateControl(control);
                    const journal={...j,state:'ready-to-publish',revision:j.revision+1,sealHash:current.manifest.digest,
                        sealManifestId:current.head.manifestId,sealHeadSeq:current.head.seq};validateJournal(journal);
                    ctx.request(ctx.store('control').put(control));ctx.request(ctx.store('journal').put(journal));
                    ctx.done({ok:true,status:'sealed',sealHash:journal.sealHash,controlEpoch:control.epoch});
                });
            }));
        },
        // sealed -> active in ONE transaction: current pointer CAS, sealed journal,
        // full manifest/records/references, evidence, old control superseded,
        // new control active, pointer update and the publication reservation.
        publish(request={}){
            let r;
            try{
                r={generation:request.generation,migrationId:request.migrationId,operationId:request.operationId,
                    expectedPointerEpoch:request.expectedPointerEpoch??null,expectedControlEpoch:request.expectedControlEpoch};
                identifier(r.generation);identifier(r.migrationId);identifier(r.operationId);
                if(r.expectedPointerEpoch!==null&&!positive(r.expectedPointerEpoch)||!positive(r.expectedControlEpoch))throw fail('publication-request-invalid');
                verifyCapability(request.capability,{scope:env.scope,purpose:'migration-publication',generation:r.generation});
            }catch(e){return Promise.resolve(rejected(errorCode(e)));}
            const fingerprint=digest({kind:'publication',...r});
            return transact([...COMMIT_STORES,'journal','reservations'],'readwrite',ctx=>readPointer(ctx,pointer=>{
                if(pointer?.activeGeneration===r.generation){
                    // Same migration retried: one pointer epoch, no second switch.
                    if(pointer.migrationId!==r.migrationId)throw fail('publication-conflict');
                    ctx.done({ok:true,status:'already-active',generation:r.generation,pointerEpoch:pointer.pointerEpoch});return;
                }
                if((pointer?.pointerEpoch??null)!==r.expectedPointerEpoch)throw fail('pointer-stale');
                ctx.request(ctx.store('reservations').get([r.generation,r.operationId]),reserved=>{
                    if(reserved){validateReservation(reserved,r.generation,r.operationId);
                        throw fail(reserved.fingerprint===fingerprint&&reserved.kind==='publication'?'publication-superseded':'operation-id-payload-conflict');}
                    readSnapshot(ctx,r.generation,current=>{
                        if(!current)throw fail('generation-missing');
                        const c=current.control;
                        if(c.state!=='sealed')throw fail('publication-state-invalid');
                        if(c.epoch!==r.expectedControlEpoch)throw fail('control-stale');
                        if(c.suspended||c.fenceRevoked||c.identityInvalidated||c.recoveryRequired)throw fail('authority-invalidated');
                        ctx.request(ctx.store('journal').get(r.migrationId),j=>{
                            if(!j)throw fail('journal-missing');validateJournal(j);
                            if(j.generation!==r.generation||j.state!=='ready-to-publish'||!equal(j.identity,c.identity))throw fail('publication-state-invalid');
                            if(j.sealHash!==current.manifest.digest||j.sealManifestId!==current.head.manifestId||j.sealHeadSeq!==current.head.seq)throw fail('seal-mismatch');
                            const evidence=readAttestation(request.attestation,{scope:env.scope,generation:r.generation,migrationId:r.migrationId,sealHash:j.sealHash});
                            // L4 evidence is not connected: only an isolated fixture can model it.
                            if(evidence.kind!=='isolated-fixture'||!env.testProvider)throw fail('publication-evidence-unavailable');
                            const f=evidence.fence;
                            if(c.identity.ownership==='bound-account'?!f||f.accountId!==c.identity.accountId||f.membershipId!==c.identity.membershipId||
                                f.accountGeneration!==c.identity.accountGeneration||f.membershipGeneration!==c.identity.membershipGeneration:f!==null)throw fail('cloud-fence-required');
                            const apply=oldControl=>{
                                if(oldControl)ctx.request(ctx.store('control').put({...oldControl,state:'superseded',epoch:oldControl.epoch+1}));
                                const control={...c,state:'active',epoch:c.epoch+1};validateControl(control);
                                const next={key:POINTER_KEY,schemaVersion:1,partitionId:env.partitionId,pointerEpoch:(pointer?.pointerEpoch||0)+1,
                                    activeGeneration:r.generation,namespaceVersion:1,repositoryProtocol:control.repositoryProtocol,writerProtocol:control.writerProtocol,
                                    migrationId:r.migrationId,publication:{kind:evidence.kind,manifestId:current.head.manifestId,headSeq:current.head.seq,
                                        sealHash:j.sealHash,controlEpoch:control.epoch},previousGeneration:pointer?.activeGeneration??null,operationId:r.operationId};
                                validatePointer(next);
                                const journal={...j,state:'active',revision:j.revision+1,publishedPointerEpoch:next.pointerEpoch};validateJournal(journal);
                                const reservation={generation:r.generation,operationId:r.operationId,schemaVersion:1,kind:'publication',fingerprint,
                                    action:'publish',policy:'migration-publication',targetKeys:[],origin:'v2'};validateReservation(reservation,r.generation,r.operationId);
                                ctx.request(ctx.store('control').put(control));ctx.request(ctx.store('journal').put(journal));
                                ctx.request(ctx.store('pointer').put(next));ctx.request(ctx.store('reservations').add(reservation),()=>ctx.tx.commit?.());
                                ctx.done({ok:true,status:'published',generation:r.generation,pointerEpoch:next.pointerEpoch,previousGeneration:next.previousGeneration});
                            };
                            if(!pointer){apply(null);return;}
                            ctx.request(ctx.store('control').get(pointer.activeGeneration),old=>{
                                if(!old)throw fail('pointer-generation-missing');validateControl(old);
                                if(old.state!=='active')throw fail('pointer-control-mismatch');apply(old);
                            });
                        });
                    });
                });
            }));
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
