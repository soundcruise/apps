import {captureAccountBootstrap,accountBootstrapFingerprint,accountBootstrapRow,validateAccountBootstrap} from './port-account-bootstrap-intent.mjs';
import {CUTOVER_KIND,validateCutoverJournal,nextCutoverJournal} from './port-account-cutover-contract.mjs';
// L2a dormant Port-owned store. Only explicitly branded isolated scopes can open
// a database. No Repository adapter, boot hook, migration, Sync or Pro runtime.
import { AUTHORITY_DB_NAME, AUTHORITY_DB_VERSION, STORE_KEYS, V1_STORE_KEYS, COMMIT_STORES, AUTHORIZATION_MARGIN_MS,
    POINTER_KEY, NAMESPACE_KEY, namespaceState, validateNamespace, RESERVED_JOURNAL_PREFIX, PORT_DATASET_KEYS, PORT_DELETE_INTENTS, identifier, fail, frozen, canonical, equal, digest,
    validateDataset, assertPortReferentialIntegrity, assertRetainedFields, validateControl, assertWritableControl, validateHead,
    validateManifest, validateRecord, validateOplog, validatePointer, validateReservation, validatePublicationFact, reservationKey, assertJSONEvidence,
    inferredDependencies, fingerprintDependencies, mergeDeleteIntents } from './port-idb-authority-contract.mjs';
import { safeEvidence, MIGRATION_STATES } from './port-migration-contract.mjs';
import { actionPolicy, assertActionSemantics, AUTHORITY_ACTION_POLICY_VERSION } from './port-authority-action-policy.mjs';
import { claimCapabilityIssuer, verifyCapability, readAttestation, registerCapabilityScope, readFenceAttestation, fenceLifetimeSnapshot, observeFenceLifetime } from './port-authority-capabilities.mjs';
import {CONTROL_OPERATIONS,stoppingControl,captureControlRequest,controlFingerprint,transitionControl,validateControlFact,controlReadiness} from './port-authority-control.mjs';
import {evidenceLifetimeKey,evidenceLifetimeRow,validateEvidenceLifetimeRow} from './port-authority-evidence-lifetime.mjs';
import {describeTrustedProContext,captureTrustedProContext,verifyTrustedProGuard,invalidateTrustedProClock} from './port-authority-pro-device-adapter.mjs';
import {captureAccountTransition,accountTransitionFingerprint,accountTransitionRow,validateAccountTransition,ACCOUNT_TRANSITION_INTENT_LIMIT} from './port-account-transition-intent.mjs';
export { AUTHORITY_DB_NAME, AUTHORITY_DB_VERSION, STORE_KEYS, AUTHORIZATION_MARGIN_MS };
const scopes = new WeakMap();
// No storage object/capability escapes: new multi-DB recovery owners can reject
// accidentally mixing an Authority scope with another IndexedDB factory.
export function authorityUsesIndexedDB(scope,indexedDB){return scopes.get(scope)?.indexedDB===indexedDB&&!!indexedDB;}
// Explicit isolated adapter access; neither lease objects nor issuer authority escape.
export function authorityProEnvironment(scope){
    const env=scopes.get(scope);if(!env)throw fail('isolated-scope-required');const lease=env.lease;
    return Object.freeze({fixtureOnly:!!env.testProvider,now:env.now,monotonicNow:env.monotonicNow,clockIdentity:env.clockIdentity,
        assertLive(){if(env.lease!==lease||!lease.active)throw fail('pro-operation-disposed');}});
}
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
    'pointer-invalid','pointer-head-mismatch','pointer-control-mismatch','pointer-generation-missing','fixture-pointer-untrusted','reservation-invalid','pointer-provenance-missing','pointer-provenance-mismatch','pointer-missing','namespace-invalid','namespace-provenance-missing','namespace-schema-unsupported','publication-fact-invalid','publication-identity-conflict','control-fact-invalid','evidence-lifetime-invalid','account-intent-invalid','account-intent-barrier-missing']);
const rejected = reason => ({ok:false,status:corrupt.has(reason)?'recovery-required':'rejected',reason});
const positive = n => Number.isSafeInteger(n) && n > 0;
const errorCode = error => typeof error?.code==='string' ? error.code : (error?.name === 'QuotaExceededError' ? 'quota-exceeded' : 'idb-error');
const checkKeys = keys => { if (!Array.isArray(keys) || keys.some(k=>!PORT_DATASET_KEYS.includes(k)) || new Set(keys).size!==keys.length) throw fail('invalid-target-keys'); };
export function createIsolatedIDBAuthorityScope({indexedDB, name=AUTHORITY_DB_NAME, partitionId,
    now=Date.now,monotonicNow=()=>performance.now(),clockIdentity=()=>performance.timeOrigin, token=()=>globalThis.crypto.randomUUID(), onLifecycle=()=>{}}={}) {
    if (typeof window !== 'undefined' && !['localhost','127.0.0.1','::1','[::1]'].includes(window.location.hostname)) throw fail('isolated-scope-required');
    if (!indexedDB?.open || typeof partitionId !== 'string' || !partitionId || typeof now!=='function' || typeof token!=='function' || typeof monotonicNow!=='function'||typeof clockIdentity!=='function'||
        !(name===AUTHORITY_DB_NAME || /^sound-cruise-port-authority-v1-fixture-[A-Za-z0-9_-]+$/.test(name))) throw fail('isolated-scope-required');
    const scope=Object.freeze({name,partitionId}),env={scope,indexedDB,name,partitionId,now,monotonicNow,clockIdentity,token,onLifecycle,lease:{active:true,id:globalThis.crypto.randomUUID()}};scopes.set(scope,env);
    registerCapabilityScope(scope,()=>env.lease,()=>!!env.testProvider,()=>({wall:env.now(),mono:env.monotonicNow(),origin:env.clockIdentity()}));return scope;
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
function upgradeFromV1(db,tx,abort,partitionId) {
    if (!equal([...db.objectStoreNames].sort(),Object.keys(V1_STORE_KEYS).sort())) throw fail('schema-invalid');
    assertStoreShape(tx,V1_STORE_KEYS);
    createStores(db,{pointer:STORE_KEYS.pointer,reservations:STORE_KEYS.reservations});
    tx.objectStore('pointer').add(namespaceState(partitionId));
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
    if(!env.lease.active)env.lease={active:true,id:globalThis.crypto.randomUUID()};
    const lease=env.lease;
    return new Promise((resolve,reject)=>{
        let request,settled=false,upgradeFailure=null;
        const stop=code=>{if(!settled){settled=true;lease.active=false;reject(fail(code));}};
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
                if(event.oldVersion===0){createStores(request.result,STORE_KEYS);tx.objectStore('pointer').add(namespaceState(env.partitionId));}
                else if(event.oldVersion===1)upgradeFromV1(request.result,tx,abort,env.partitionId);
                else abort('schema-upgrade-unsupported');
            }catch(e){abort(e.code||'schema-upgrade-failed');}
        };
        request.onerror=()=>stop(upgradeFailure||(request.error?.name==='VersionError'?'future-schema':'database-unavailable'));
        request.onsuccess=()=>{
            const db=request.result;if(settled){db.close();return;}
            try{validateSchema(db);}catch(e){db.close();stop(e.code||'schema-invalid');return;}
            settled=true;resolve(makeStore(db,env,lifecycle,lease));
        };
    });
}
function validateJournal(journal) {
    if (!journal || journal.schemaVersion!==1 || !positive(journal.revision) || !MIGRATION_STATES.includes(journal.state)) throw fail('journal-invalid');
    identifier(journal.migrationId);identifier(journal.generation);assertJSONEvidence(journal);safeEvidence(journal);
    // Operation reservations live in their own store since schema v2.
    if (journal.migrationId.startsWith(RESERVED_JOURNAL_PREFIX)) throw fail('journal-invalid');
    if(journal.kind===CUTOVER_KIND)validateCutoverJournal(journal);
}
function validateRoot(root) {
    if (!root || root.schemaVersion!==1 || !['sync-base','recovery','migration-evidence'].includes(root.kind) ||
        !Array.isArray(root.manifestIds) || !Array.isArray(root.recordRefs) || !Array.isArray(root.journalIds)) throw fail('root-invalid');
    identifier(root.generation);identifier(root.rootId);root.manifestIds.forEach(identifier);root.journalIds.forEach(identifier);
    for(const ref of root.recordRefs)if(!PORT_DATASET_KEYS.includes(ref.logicalKey)||!positive(ref.version))throw fail('root-invalid');
    assertJSONEvidence(root);safeEvidence(root);
}
function makeStore(db,env,lifecycle,lease) {
    let state='open';const prepared=new WeakMap();
    db.onversionchange=()=>{state='versionchange';lease.active=false;db.close();lifecycle('versionchange');};
    db.onclose=()=>{if(state==='open'){state='connection-lost';lease.active=false;lifecycle('unexpected-close');}};
    // Only IDB requests and synchronous callbacks run in this transaction. The
    // enclosing Promise is completed by complete/abort, never by request success.
    function transact(names,mode,build) {
        if(state!=='open'||!lease.active)return Promise.resolve(rejected(state==='open'?'scope-runtime-inactive':state));
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
    function readPointer(ctx,done,{allowUnpublishedRead=false}={}) {
        ctx.request(ctx.store('pointer').get(NAMESPACE_KEY),namespace=>{
            if(!namespace&&!allowUnpublishedRead)throw fail('namespace-provenance-missing');
            if(namespace){validateNamespace(namespace);if(namespace.partitionId!==env.partitionId)throw fail('namespace-invalid');}
            ctx.request(ctx.store('pointer').get(POINTER_KEY),pointer=>{
                if(!pointer){
                    if(namespace&&namespace.pointerEpoch!==0)throw fail('pointer-missing');
                    // A zero marker is not enough if independent publication facts survive.
                    let pending=2;
                    for(const name of ['reservations','journal'])ctx.request(ctx.store(name).openCursor(),cursor=>{
                        if(cursor){const v=cursor.value;if(v.publication!==undefined||v.kind==='publication'||positive(v.publishedPointerEpoch))throw fail('pointer-missing');cursor.continue();}
                        else if(!--pending)done(null);
                    });return;
                }
                if(!namespace)throw fail('namespace-provenance-missing');
                validatePointer(pointer);
                if(pointer.partitionId!==env.partitionId)throw fail('pointer-invalid');
                if(namespace.pointerEpoch!==pointer.pointerEpoch)throw fail('pointer-provenance-mismatch');
                if(pointer.publication.kind==='isolated-fixture'&&!env.testProvider)throw fail('fixture-pointer-untrusted');
                ctx.request(ctx.store('reservations').get([pointer.activeGeneration,pointer.operationId]),row=>{
                    if(!row?.publication)throw fail('pointer-provenance-missing');
                    validateReservation(row,pointer.activeGeneration,pointer.operationId);
                    if(!equal(row.publication.pointer,pointer))throw fail('pointer-provenance-mismatch');
                    verifyPublicationFact(ctx,row,()=>done(pointer));
                });
            });
        });
    }
    function verifyPublicationFact(ctx,row,done) {
        validatePublicationFact(row);const f=row.publication,p=f.pointer;
        ctx.request(ctx.store('manifests').get([row.generation,p.publication.manifestId]),manifest=>{
            if(!manifest)throw fail('pointer-head-mismatch');validateManifest(manifest);
            if(manifest.generation!==row.generation||manifest.manifestId!==p.publication.manifestId||manifest.seq!==p.publication.headSeq||manifest.digest!==p.publication.sealHash)throw fail('pointer-head-mismatch');
            const finish=()=>readManifestValues(ctx,row.generation,manifest,values=>{assertPortReferentialIntegrity(values);done();});
            ctx.request(ctx.store('oplog').get([row.generation,row.operationId]),log=>{
                if(row.kind==='operation-identity') {
                    if(!log)throw fail('pointer-provenance-missing');validateOplog(log,row.generation,row.operationId);
                    if(log.fingerprint!==row.fingerprint||log.result.manifestId!==manifest.manifestId||log.result.seq!==manifest.seq)throw fail('publication-identity-conflict');finish();return;
                }
                if(log)throw fail('publication-identity-conflict');
                ctx.request(ctx.store('journal').get(p.migrationId),j=>{
                    if(!j)throw fail('pointer-provenance-missing');validateJournal(j);
                    if(j.generation!==row.generation||j.state!=='active'||!equal(j.identity,f.identity)||!equal(j.publication,f)||
                        j.publishedPointerEpoch!==p.pointerEpoch||j.sealManifestId!==manifest.manifestId||j.sealHeadSeq!==manifest.seq||j.sealHash!==manifest.digest)throw fail('pointer-provenance-mismatch');finish();
                });
            });
        });
    }
    function readGenerationSnapshot(ctx,generation,pointer,done) {
        ctx.request(ctx.store('head').get(generation),head=>ctx.request(ctx.store('control').get(generation),control=>{
            const target=pointer?.activeGeneration===generation;
            if(!head&&!control){
                if(target)throw fail('pointer-generation-missing');
                let pending=3;
                for(const name of ['records','manifests','oplog'])ctx.request(ctx.store(name).openCursor(),cursor=>{
                    if(cursor){if(cursor.value.generation===generation)throw fail('recovery-required');cursor.continue();}
                    else if(!--pending)done(null,pointer);
                });return;
            }
            if(!head||!control)throw fail(target?'pointer-generation-missing':'recovery-required');
            validateHead(head);validateControl(control);
            if(head.generation!==generation||control.generation!==generation||head.controlEpoch>control.epoch||control.identity.partitionId!==env.partitionId)throw fail('recovery-required');
            const read=()=>ctx.request(ctx.store('manifests').get([generation,head.manifestId]),manifest=>{
                if(!manifest)throw fail('recovery-required');validateManifest(manifest,head);
                readManifestValues(ctx,generation,manifest,values=>{assertPortReferentialIntegrity(values);
                    ctx.request(ctx.store('oplog').get([generation,head.operationId]),log=>{
                        if(!log)throw fail('oplog-invalid');validateOplog(log,generation,head.operationId);
                        if(log.result.seq!==head.seq||log.result.manifestId!==head.manifestId||log.result.revision!==head.revision)throw fail('oplog-invalid');
                        done(frozen({generation,head,control,manifest,values,versions:{...manifest.versions},pointer,active:target}),pointer);
                    });});
            });
            if(!target){read();return;}
            if(control.state!=='active'&&!(control.state==='recovery-required'&&control.recoveryRequired))throw fail('pointer-control-mismatch');
            if(pointer.publication.controlEpoch>control.epoch||pointer.publication.headSeq>head.seq)throw fail('pointer-head-mismatch');
            ctx.request(ctx.store('reservations').get([generation,pointer.operationId]),row=>{
                if(!row?.publication||!equal(row.publication.identity,control.identity))throw fail('pointer-provenance-mismatch');read();
            });
        }));
    }
    function readSnapshot(ctx,generation,done) {readPointer(ctx,pointer=>readGenerationSnapshot(ctx,generation,pointer,(snapshot,p)=>{
        if(!p&&snapshot?.control.state==='active')ctx.request(ctx.store('pointer').get(NAMESPACE_KEY),namespace=>{if(!namespace)throw fail('namespace-provenance-missing');done(snapshot,p);});
        else done(snapshot,p);
    }),{allowUnpublishedRead:true});}
    function readActive(ctx,done) {readPointer(ctx,pointer=>pointer?readGenerationSnapshot(ctx,pointer.activeGeneration,pointer,current=>done(pointer,current)):done(null,null));}
    function publicationEvidence(token,r,sealHash) {
        const e=readAttestation(token,{scope:env.scope,lease,generation:r.generation,migrationId:r.migrationId,sealHash});
        if(e.kind!=='isolated-fixture'||!env.testProvider)throw fail('publication-evidence-unavailable');
        return frozen({kind:e.kind,sealHash:e.sealHash,binary:{...e.binary},sync:{...e.sync},fence:e.fence&&{...e.fence}});
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
        const identity=authorizationIdentity??(policy==='pro'?describeTrustedProContext(env.scope,authorizationContext)??env.testProvider?.describe(authorizationContext)??null:null);
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
        captureTrustedProContext(env.scope,authorizationContext,value);
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
        return transact(COMMIT_STORES,'readwrite',ctx=>ctx.request(ctx.store('reservations').get([p.generation,p.operationId]),reserved=>{
            if(reserved){validateReservation(reserved,p.generation,p.operationId);if(reserved.kind!=='operation-identity'||reserved.fingerprint!==p.fingerprint)throw fail('operation-id-payload-conflict');}
            ctx.request(ctx.store('oplog').get([p.generation,p.operationId]),old=>{
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
                    if(!pointer){readActive(ctx,()=>write(null,{previous:null,oldControl:null}));return;}
                    readGenerationSnapshot(ctx,pointer.activeGeneration,pointer,active=>write(null,{previous:pointer,oldControl:active.control}));
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
                let authorizedAt;
                try{authorizedAt=env.now();if(!Number.isFinite(authorizedAt)||authorizedAt<0)throw fail('authorization-time-invalid');}
                catch(e){invalidateTrustedProClock(env.scope,p.authorizationContext);throw e;}
                if((p.policy==='pro'||p.authorizationContext!==undefined)&&typeof commitGuard!=='function')throw fail('operation-commit-guard-required');
                if(p.policy==='pro'&&!verifyTrustedProGuard(env.scope,p.authorizationContext,commitGuard,p)&&!env.testProvider?.verify(p.authorizationContext,commitGuard,p))throw fail('operation-guard-untrusted');
                if(commitGuard!==undefined){
                    if(typeof commitGuard!=='function')throw fail('operation-commit-guard-invalid');
                    const verdict=commitGuard(p.authorizationContext,frozen({operationId:p.operationId,action:p.action,generation:p.generation,
                        head:current?.head||null,control,authorizedAt,authorizationMarginMs:AUTHORIZATION_MARGIN_MS,targetKeys:Object.keys(p.changes),dependencyKeys:p.dependencyKeys}));
                    if(verdict?.then){verdict.catch?.(()=>{});throw fail('operation-commit-guard-async');}
                    if(verdict===false||verdict?.ok===false||verdict?.allowed===false)throw fail('operation-authorization-rejected');
                    if(p.policy==='pro') {
                        const identity=verdict&&Object.fromEntries(Object.keys(p.authorizationIdentity||{}).map(k=>[k,verdict[k]]));
                        if(!verdict || verdict.ok!==true || verdict.policy!=='pro' || !equal(identity,p.authorizationIdentity) ||
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
                    ctx.request(ctx.store('pointer').put(namespaceState(env.partitionId,next.pointerEpoch)));
                    const row={generation:p.generation,operationId:p.operationId,schemaVersion:1,kind:'operation-identity',fingerprint:p.fingerprint,
                        action:p.action,policy:p.policy,targetKeys:Object.keys(p.changes).sort(),origin:'v2',
                        publication:{schemaVersion:1,pointer:next,identity:control.identity,request:null,evidence:null}};
                    validateReservation(row,p.generation,p.operationId);ctx.request(ctx.store('reservations').add(row));
                }
                if(p.initialControl&&!publication){const row={generation:p.generation,operationId:p.operationId,schemaVersion:1,kind:'operation-identity',fingerprint:p.fingerprint,action:p.action,policy:p.policy,targetKeys:Object.keys(p.changes).sort(),origin:'v2'};validateReservation(row,p.generation,p.operationId);ctx.request(ctx.store('reservations').add(row));}
                ctx.request(ctx.store('oplog').add(log),()=>ctx.tx.commit?.());
                ctx.done(result);
            }
        });}));
    }
    function checkLifetimeOwner(row,lifetime){
        const p=row.evidenceLifetime;
        if(row.fingerprint!==digest(lifetime.evidence))throw fail('control-evidence-identity-conflict');
        if(p.runtimeId!==lifetime.runtimeId||p.issuerId!==lifetime.issuerId||p.clockId!==lifetime.clockId)throw fail('control-evidence-runtime-mismatch');
        if(!equal({...p,lastObservedWall:0,lastObservedMonotonic:0,expired:false,invalidated:false},{...lifetime,lastObservedWall:0,lastObservedMonotonic:0,expired:false,invalidated:false}))throw fail('evidence-lifetime-invalid');
    }
    const controlHandles=new WeakMap();
    function captureControl(action,input){
        const capability=input.capability;verifyCapability(capability,{scope:env.scope,lease,purpose:CONTROL_OPERATIONS[action],generation:input.generation});
        const evidence=input.evidence===undefined?null:readFenceAttestation(input.evidence,{scope:env.scope,lease,generation:input.generation});
        return {request:captureControlRequest(action,input,evidence),capability,evidenceToken:input.evidence};
    }
    async function prepareControlOperation(action,input={}){
        const p=captureControl(action,input),q=p.request,fingerprint=controlFingerprint(q);
        const row={schemaVersion:1,generation:q.generation,operationId:q.operationId,kind:'control',fingerprint,
            action,policy:CONTROL_OPERATIONS[action],targetKeys:['control'],origin:'v2',
            control:{schemaVersion:1,request:q,before:null,after:null,result:null}};
        validateReservation(row,q.generation,q.operationId);validateControlFact(row);
        const reserved=await transact(['reservations','oplog'],'readwrite',ctx=>{
            verifyCapability(p.capability,{scope:env.scope,lease,purpose:CONTROL_OPERATIONS[action],generation:q.generation});
            ctx.request(ctx.store('oplog').get([q.generation,q.operationId]),log=>{
                if(log)throw fail('operation-id-payload-conflict');
                ctx.request(ctx.store('reservations').get([q.generation,q.operationId]),old=>{
                    if(old){validateReservation(old,q.generation,q.operationId);
                        if(old.kind!=='control'||old.fingerprint!==fingerprint)throw fail('operation-id-payload-conflict');validateControlFact(old);
                        if(old.control.result){ctx.done({ok:true});return;}
                    }else ctx.request(ctx.store('reservations').add(row));
                    if(!q.evidence){ctx.done({ok:true});return;}
                    const lifetime=fenceLifetimeSnapshot(p.evidenceToken,{scope:env.scope,generation:q.generation,lease});
                    ctx.request(ctx.store('reservations').get([q.generation,evidenceLifetimeKey(q.evidence)]),previous=>{
                        if(previous){validateEvidenceLifetimeRow(previous);checkLifetimeOwner(previous,lifetime);}
                        else if(old)throw fail('control-evidence-unregistered');
                        else ctx.request(ctx.store('reservations').add(evidenceLifetimeRow(lifetime)));
                        ctx.done({ok:true});
                    });
                });
            });
        });
        if(!reserved.ok)throw fail(reserved.reason);
        const handle=Object.freeze({action,generation:q.generation,operationId:q.operationId});controlHandles.set(handle,p);return handle;
    }
    async function controlOperation(action,input={}){
        let request,capability,evidenceToken;
        try{
            const handle=controlHandles.has(input)?input:await prepareControlOperation(action,input),p=controlHandles.get(handle);
            if(handle.action!==action)throw fail('capability-invalid');({request,capability,evidenceToken}=p);
        }catch(e){return rejected(errorCode(e));}
        const fingerprint=controlFingerprint(request);
        return transact(COMMIT_STORES,'readwrite',ctx=>{
            verifyCapability(capability,{scope:env.scope,lease,purpose:CONTROL_OPERATIONS[action],generation:request.generation});
            ctx.request(ctx.store('oplog').get([request.generation,request.operationId]),log=>{
                if(log)throw fail('operation-id-payload-conflict');
                ctx.request(ctx.store('reservations').get([request.generation,request.operationId]),reserved=>{
                    if(reserved){
                        validateReservation(reserved,request.generation,request.operationId);
                        if(reserved.kind!=='control'||reserved.fingerprint!==fingerprint)throw fail('operation-id-payload-conflict');
                        validateControlFact(reserved);if(reserved.control.result){ctx.done({...reserved.control.result,replayed:true});return;}
                    }
                    if(!reserved)throw fail('control-reservation-missing');
                    const inspectControl=()=>readPointer(ctx,pointer=>{
                        if(pointer?.activeGeneration!==request.generation)throw fail('generation-not-active');
                        ctx.request(ctx.store('control').get(request.generation),old=>{
                            validateControl(old);
                            if(!equal(old.identity,request.identity)||old.identity.partitionId!==env.partitionId)throw fail('control-identity-mismatch');
                            if(old.state!=='active'&&!(old.state==='recovery-required'&&old.recoveryRequired))throw fail('control-state-invalid');
                            const finish=()=>{
                                verifyCapability(capability,{scope:env.scope,lease,purpose:CONTROL_OPERATIONS[action],generation:request.generation});
                                if(!stoppingControl(action)){
                                    if(old.epoch!==request.expectedEpoch)throw fail('control-stale');
                                    if(pointer.pointerEpoch!==request.expectedPointerEpoch)throw fail('pointer-stale');
                                    if(old.identityInvalidated||old.recoveryRequired||old.state==='recovery-required')throw fail('authority-invalidated');
                                    if(action==='resumeWrites'&&old.fenceRevoked)throw fail('fence-revoked');
                                    const e=request.evidence;
                                    if(action==='renewFence'||old.identity.ownership==='bound-account'){
                                        if(!e||e.controlEpoch!==old.epoch)throw fail('control-evidence-stale');
                                        if(!equal(e.identity,old.identity)||e.generation!==old.generation||e.pointerEpoch!==pointer.pointerEpoch)throw fail('control-evidence-identity-mismatch');
                                        if(action==='renewFence'?e.fenceEpoch<=old.fenceEpoch:e.fenceEpoch!==old.fenceEpoch)throw fail('control-fence-stale');
                                    }else if(e!==null)throw fail('control-evidence-unexpected');
                                }
                                if(request.evidence)inspectLifetime(commitControl,true);else commitControl();
                            };
                            function commitControl(){
                                const {next,changed}=transitionControl(old,request);
                                const result={ok:true,status:'control-committed',generation:request.generation,operationId:request.operationId,action,
                                    controlEpoch:next.epoch,changed,publish:false,operationAuthorized:false,historical:true};
                                const row={schemaVersion:1,generation:request.generation,operationId:request.operationId,kind:'control',fingerprint,
                                    action,policy:CONTROL_OPERATIONS[action],targetKeys:['control'],origin:'v2',
                                    control:{schemaVersion:1,request,before:old,after:next,result}};
                                validateReservation(row,request.generation,request.operationId);validateControlFact(row);
                                if(changed)ctx.request(ctx.store('control').put(next));
                                ctx.request(ctx.store('reservations').put(row));ctx.done(result);
                            }
                            // Stopping a damaged current dataset must not depend on head health.
                            // Lowering restrictions requires a healthy full current snapshot in this tx.
                            if(stoppingControl(action))finish();else readGenerationSnapshot(ctx,request.generation,pointer,finish);
                        });
                    });
                    function inspectLifetime(done,persistAlive){
                        const own=fenceLifetimeSnapshot(evidenceToken,{scope:env.scope,generation:request.generation,lease});
                        ctx.request(ctx.store('reservations').get([request.generation,evidenceLifetimeKey(request.evidence)]),row=>{
                            if(!row)throw fail('control-evidence-unregistered');validateEvidenceLifetimeRow(row);checkLifetimeOwner(row,own);
                            const observed=observeFenceLifetime(evidenceToken,{scope:env.scope,generation:request.generation,lease,persisted:row.evidenceLifetime});
                            if(!observed.ok||persistAlive)ctx.request(ctx.store('reservations').put(evidenceLifetimeRow(observed.lifetime)));
                            if(!observed.ok){ctx.done(rejected('control-evidence-stale'));return;}done();
                        });
                    }
                    // Observe expiry even when a later Control CAS will reject; recheck at final admission.
                    if(request.evidence)inspectLifetime(inspectControl,false);else inspectControl();
                });
            });
        });
    }
    // Account intent is a typed fact in reservations, not a pending reservation.
    // It commits alongside the restriction read by normal final admission.
    const accountTransitionReceipts=new WeakMap();
    async function beginAccountTransition(input={},bootstrap=false) {
        const capture=bootstrap?captureAccountBootstrap:captureAccountTransition, validate=bootstrap?validateAccountBootstrap:validateAccountTransition, fingerprint=bootstrap?accountBootstrapFingerprint:accountTransitionFingerprint, makeRow=bootstrap?accountBootstrapRow:accountTransitionRow;
        const intentKind=bootstrap?'account-bootstrap':'account-transition';
        const verifyGuard=()=>{if(bootstrap&&(!env.testProvider||typeof input.commitGuard!=='function'||input.commitGuard()!==true))throw fail('account-bootstrap-fixture-proof-required');};
        let q, capability;
        try {
            ({capability}=input);
            const {capability: ignored,commitGuard: ignoredGuard,...request}=input;
            if(!bootstrap&&ignoredGuard!==undefined)throw fail('account-intent-invalid');
            q=capture(request);verifyGuard();
            verifyCapability(capability,{scope:env.scope,lease,purpose:'control:invalidate',generation:q.generation});
        } catch(error) { return Promise.resolve(rejected(errorCode(error))); }
        const accepted=await transact(COMMIT_STORES,'readwrite',ctx=>{
            const verify=()=>{verifyCapability(capability,{scope:env.scope,lease,purpose:'control:invalidate',generation:q.generation});verifyGuard();};
            verify();
            ctx.request(ctx.store('oplog').get([q.generation,q.operationId]),log=>{
                if(log)throw fail('operation-id-payload-conflict');
                ctx.request(ctx.store('reservations').get([q.generation,q.operationId]),existing=>{
                    if(existing){
                        validateReservation(existing,q.generation,q.operationId);
                        if(existing.kind!==intentKind||existing.fingerprint!==fingerprint(q))throw fail('operation-id-payload-conflict');
                        validate(existing);
                        // Historical lookup never authorizes replaying the Account CAS.
                        ctx.done({ok:true,status:'account-intent-historical',replayed:true,historical:true,operationAuthorized:false,canWrite:false});return;
                    }
                    readPointer(ctx,pointer=>{
                        if(pointer?.activeGeneration!==q.generation)throw fail('generation-not-active');
                        if(pointer.pointerEpoch!==q.expectedPointerEpoch)throw fail('pointer-stale');
                        ctx.request(ctx.store('control').get(q.generation),old=>{
                            validateControl(old);
                            if(!equal(old.identity,q.identity)||old.identity.partitionId!==env.partitionId)throw fail('control-identity-mismatch');
                            if(old.epoch!==q.expectedEpoch)throw fail('control-stale');
                            if(old.identityInvalidated||old.recoveryRequired||old.state!=='active')throw fail('authority-invalidated');
                            let count=0, scanned=0;
                            ctx.request(ctx.store('reservations').openCursor(),cursor=>{
                                if(cursor){
                                    const order=env.indexedDB.cmp(cursor.key[0],q.generation);
                                    if(order<0){cursor.continue([q.generation,'']);return;}
                                    if(order>0){finish();return;}
                                    if(++scanned>4096)throw fail('account-intent-scan-capacity');
                                    if(cursor.value.generation===q.generation&&cursor.value.kind===intentKind){
                                        validate(cursor.value);if(++count>=ACCOUNT_TRANSITION_INTENT_LIMIT)throw fail('account-intent-capacity');
                                    }
                                    cursor.continue();return;
                                }
                                finish();
                            });
                            function finish(){
                                verify();const row=makeRow(q,old);
                                ctx.request(ctx.store('control').put(row.accountTransition.after));
                                ctx.request(ctx.store('reservations').add(row));
                                ctx.done({ok:true,status:'account-intent-stopped',generation:q.generation,operationId:q.operationId,
                                    controlEpoch:row.accountTransition.after.epoch,historical:true,operationAuthorized:false,canWrite:false});
                            }
                        });
                    });
                });
            });
        });
        if(!bootstrap&&accepted.ok&&accepted.status==='account-intent-stopped')accountTransitionReceipts.set(accepted,q);
        return accepted;
    }
    function accountTransitions(generation,bootstrap=false) {
        const intentKind=bootstrap?'account-bootstrap':'account-transition',validate=bootstrap?validateAccountBootstrap:validateAccountTransition;
        try{identifier(generation);}catch(error){return Promise.resolve(rejected(errorCode(error)));}
        return transact(COMMIT_STORES,'readonly',ctx=>{
            const intents=[];let scanned=0;
            ctx.request(ctx.store('control').get(generation),control=>{
                if(control)validateControl(control);
                ctx.request(ctx.store('reservations').openCursor(),cursor=>{
                    if(cursor){
                        const order=env.indexedDB.cmp(cursor.key[0],generation);
                        if(order<0){cursor.continue([generation,'']);return;}
                        if(order>0){finish();return;}
                        if(++scanned>4096)throw fail('account-intent-scan-capacity');
                        const row=cursor.value;
                        if(row.generation===generation&&row.kind===intentKind){
                            validate(row);
                            if(!control||!control.identityInvalidated||!equal(control.identity,row.accountTransition.request.identity)||control.epoch<row.accountTransition.after.epoch)
                                throw fail('account-intent-barrier-missing');
                            intents.push(row);
                            if(intents.length>ACCOUNT_TRANSITION_INTENT_LIMIT)throw fail('account-intent-capacity');
                        }
                        cursor.continue();
                    }else finish();
                    function finish(){ctx.done({ok:true,intents,controlEpoch:control?.epoch??null,
                        recoveryRequired:intents.some(row=>row.accountTransition.phase!=='account-confirmed'),canWrite:false});}
                });
            });
        });
    }
    function confirmAccountTransition({generation,operationId,capability,receipt}={}) {
        try{identifier(generation);identifier(operationId);
            const issued=accountTransitionReceipts.get(receipt);
            if(!issued||issued.generation!==generation||issued.operationId!==operationId)throw fail('account-intent-receipt-invalid');
            verifyCapability(capability,{scope:env.scope,lease,purpose:'control:invalidate',generation});}
        catch(error){return Promise.resolve(rejected(errorCode(error)));}
        return transact(COMMIT_STORES,'readwrite',ctx=>{
            verifyCapability(capability,{scope:env.scope,lease,purpose:'control:invalidate',generation});
            ctx.request(ctx.store('reservations').get([generation,operationId]),row=>{
                if(!row)throw fail('account-intent-missing');validateAccountTransition(row);
                ctx.request(ctx.store('control').get(generation),control=>{
                    validateControl(control);
                    if(!control.identityInvalidated||!equal(control.identity,row.accountTransition.request.identity)||control.epoch<row.accountTransition.after.epoch)throw fail('account-intent-barrier-missing');
                    row.accountTransition.phase='account-confirmed';validateAccountTransition(row);
                    ctx.request(ctx.store('reservations').put(row));
                    ctx.done({ok:true,status:'account-transition-complete',historical:true,operationAuthorized:false,canWrite:false});
                });
            });
        });
    }
    return Object.freeze({
        get status(){return state==='open'&&!lease.active?'scope-runtime-inactive':state;},
        dispose(){if(state==='open'){state='disposed';lease.active=false;db.close();lifecycle('disposed');}},
        hydrate(generation){
            try{identifier(generation);}catch(e){return Promise.resolve(rejected(e.code));}
            return transact(COMMIT_STORES,'readonly',ctx=>readSnapshot(ctx,generation,snapshot=>ctx.done(snapshot?
                {ok:true,status:'hydrated',snapshot,activity:snapshot.active?'active':'inactive',readiness:controlReadiness(snapshot),exportable:true,
                    readOnly:!snapshot.active||snapshot.control.state!=='active'||snapshot.control.suspended||snapshot.control.fenceRevoked||snapshot.control.identityInvalidated||snapshot.control.recoveryRequired}:
                {ok:true,status:'absent',snapshot:null}))).then(result=>result.ok?result:{...result,status:'recovery-required',readOnly:true,activity:'unknown'});
        },
        readPointer(){
            return transact(COMMIT_STORES,'readonly',ctx=>readActive(ctx,pointer=>ctx.done({ok:true,pointer}))).then(result=>result.ok?result:{...result,status:'recovery-required'});
        },
        // prepared -> sealed. Requires the Port-owned publication capability for
        // this generation. Seals the current head; the journal records its digest.
        seal({generation,migrationId,capability}={}){
            try{identifier(generation);identifier(migrationId);verifyCapability(capability,{scope:env.scope,lease,purpose:'migration-publication',generation});}
            catch(e){return Promise.resolve(rejected(errorCode(e)));}
            return transact(COMMIT_STORES,'readwrite',ctx=>readSnapshot(ctx,generation,current=>{
                verifyCapability(capability,{scope:env.scope,lease,purpose:'migration-publication',generation});
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
                verifyCapability(request.capability,{scope:env.scope,lease,purpose:'migration-publication',generation:r.generation});
            }catch(e){return Promise.resolve(rejected(errorCode(e)));}
            return transact(COMMIT_STORES,'readwrite',ctx=>readActive(ctx,(pointer,active)=>{
                verifyCapability(request.capability,{scope:env.scope,lease,purpose:'migration-publication',generation:r.generation});
                if(active&&(active.control.recoveryRequired||active.control.identityInvalidated||active.control.state==='recovery-required'))throw fail('authority-invalidated');
                // Every success path first verifies the current active head, all
                // records, control, and independent publication provenance.
                ctx.request(ctx.store('oplog').get([r.generation,r.operationId]),log=>{
                    if(log){validateOplog(log,r.generation,r.operationId);throw fail('operation-id-payload-conflict');}
                    ctx.request(ctx.store('reservations').get([r.generation,r.operationId]),reserved=>{
                        if(reserved)validateReservation(reserved,r.generation,r.operationId);
                        if(pointer?.activeGeneration===r.generation){
                            if(pointer.migrationId!==r.migrationId)throw fail('publication-conflict');
                            if(pointer.operationId!==r.operationId)throw fail('publication-operation-conflict');
                            if(!reserved?.publication||reserved.kind!=='publication')throw fail('publication-identity-conflict');
                            const evidence=publicationEvidence(request.attestation,r,reserved.publication.pointer.publication.sealHash);
                            if(reserved.fingerprint!==digest({kind:'publication',...r,evidence}))throw fail('operation-id-payload-conflict');
                            ctx.done({ok:true,status:'already-active',generation:r.generation,operationId:r.operationId,pointerEpoch:pointer.pointerEpoch,
                                publish:false,currentAuthorityVerified:true});return;
                        }
                        if(reserved)throw fail(reserved.kind==='publication'&&equal(reserved.publication?.request,r)?'publication-superseded':'operation-id-payload-conflict');
                        if((pointer?.pointerEpoch??null)!==r.expectedPointerEpoch)throw fail('pointer-stale');
                        readGenerationSnapshot(ctx,r.generation,pointer,current=>{
                            if(!current)throw fail('generation-missing');const c=current.control;
                            if(c.state!=='sealed')throw fail('publication-state-invalid');
                            if(c.epoch!==r.expectedControlEpoch)throw fail('control-stale');
                            if(c.suspended||c.fenceRevoked||c.identityInvalidated||c.recoveryRequired)throw fail('authority-invalidated');
                            ctx.request(ctx.store('journal').get(r.migrationId),j=>{
                                if(!j)throw fail('journal-missing');validateJournal(j);
                                if(j.generation!==r.generation||j.state!=='ready-to-publish'||!equal(j.identity,c.identity))throw fail('publication-state-invalid');
                                if(j.sealHash!==current.manifest.digest||j.sealManifestId!==current.head.manifestId||j.sealHeadSeq!==current.head.seq)throw fail('seal-mismatch');
                                const evidence=publicationEvidence(request.attestation,r,j.sealHash),f=evidence.fence;
                                if(c.identity.ownership==='bound-account'?!f||f.accountId!==c.identity.accountId||f.membershipId!==c.identity.membershipId||
                                    f.accountGeneration!==c.identity.accountGeneration||f.membershipGeneration!==c.identity.membershipGeneration:f!==null)throw fail('cloud-fence-required');
                                if(active)ctx.request(ctx.store('control').put({...active.control,state:'superseded',epoch:active.control.epoch+1}));
                                const control={...c,state:'active',epoch:c.epoch+1};validateControl(control);
                                const next={key:POINTER_KEY,schemaVersion:1,partitionId:env.partitionId,pointerEpoch:(pointer?.pointerEpoch||0)+1,
                                    activeGeneration:r.generation,namespaceVersion:1,repositoryProtocol:control.repositoryProtocol,writerProtocol:control.writerProtocol,
                                    migrationId:r.migrationId,publication:{kind:evidence.kind,manifestId:current.head.manifestId,headSeq:current.head.seq,
                                        sealHash:j.sealHash,controlEpoch:control.epoch},previousGeneration:pointer?.activeGeneration??null,operationId:r.operationId};
                                validatePointer(next);
                                const fact={schemaVersion:1,pointer:next,identity:control.identity,request:r,evidence};
                                const journal={...j,state:'active',revision:j.revision+1,publishedPointerEpoch:next.pointerEpoch,publication:fact};validateJournal(journal);
                                const reservation={generation:r.generation,operationId:r.operationId,schemaVersion:1,kind:'publication',
                                    fingerprint:digest({kind:'publication',...r,evidence}),action:'publish',policy:'migration-publication',targetKeys:[],origin:'v2',publication:fact};
                                validateReservation(reservation,r.generation,r.operationId);
                                ctx.request(ctx.store('control').put(control));ctx.request(ctx.store('journal').put(journal));
                                ctx.request(ctx.store('pointer').put(next));ctx.request(ctx.store('pointer').put(namespaceState(env.partitionId,next.pointerEpoch)));
                                ctx.request(ctx.store('reservations').add(reservation),()=>ctx.tx.commit?.());
                                ctx.done({ok:true,status:'published',generation:r.generation,operationId:r.operationId,pointerEpoch:next.pointerEpoch,
                                    previousGeneration:next.previousGeneration,publish:false,currentAuthorityVerified:true});
                            });
                        });
                    });
                });
            }));
        },
        // Historical publication lookup never asserts current active integrity or
        // write readiness. It remains readable after current head corruption.
        lookupPublication(generation,operationId){
            try{identifier(generation);identifier(operationId);}catch(e){return Promise.resolve(rejected(errorCode(e)));}
            return transact(COMMIT_STORES,'readonly',ctx=>ctx.request(ctx.store('reservations').get([generation,operationId]),row=>{
                if(!row||row.kind!=='publication'){ctx.done({ok:true,result:null});return;}
                validateReservation(row,generation,operationId);
                if(!row.publication)throw fail('pointer-provenance-missing');
                verifyPublicationFact(ctx,row,()=>ctx.done({ok:true,result:{generation,operationId,migrationId:row.publication.pointer.migrationId,
                    pointerEpoch:row.publication.pointer.pointerEpoch,status:'published',historical:true,publish:false,currentAuthorityVerified:false}}));
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
        beginAccountTransition, accountTransitions, confirmAccountTransition,
        // One Authority transaction establishes a durable recovery barrier and
        // its typed cutover intent. Account DB upgrade happens separately.
        beginDataCutover({journal,expectedControl,expectedPointer,capability}={}){
            let j;try{j=structuredClone(journal);identifier(j.migrationId);identifier(j.generation);
                if(!env.testProvider||j.kind!==CUTOVER_KIND||j.stage!=='stopped'||j.revision!==1)throw fail('cutover-isolation-required');
                verifyCapability(capability,{scope:env.scope,lease,purpose:'control:recovery',generation:j.generation});
            }catch(e){return Promise.resolve(rejected(errorCode(e)));}
            return transact(COMMIT_STORES,'readwrite',ctx=>readSnapshot(ctx,j.generation,s=>{
                if(!s?.active||!equal(s.control,expectedControl)||!equal(s.pointer,expectedPointer))throw fail('cutover-source-stale');
                assertWritableControl(s.control,expectedControl);
                if(!equal(j.identity,s.control.identity))throw fail('cutover-source-stale');
                ctx.request(ctx.store('journal').get(j.migrationId),old=>{
                    if(old)throw fail('cutover-already-exists');
                    const control={...s.control,epoch:s.control.epoch+1,state:'recovery-required',recoveryRequired:true};validateControl(control);
                    j={...j,barrierDigest:digest(control),pointerDigest:digest(s.pointer)};validateCutoverJournal(j);safeEvidence(j);
                    verifyCapability(capability,{scope:env.scope,lease,purpose:'control:recovery',generation:j.generation});
                    ctx.request(ctx.store('control').put(control));ctx.request(ctx.store('journal').add(j));ctx.done({ok:true,journal:j,canWrite:false});
                });
            }));
        },
        advanceDataCutover({migrationId,expectedRevision,stage,accountSnapshot}={}){
            if(!env.testProvider)return Promise.resolve(rejected('cutover-isolation-required'));
            let next;try{identifier(migrationId);next=structuredClone(accountSnapshot);}catch(e){return Promise.resolve(rejected(errorCode(e)));}
            return transact(COMMIT_STORES,'readwrite',ctx=>ctx.request(ctx.store('journal').get(migrationId),j=>{
                if(!j)throw fail('cutover-missing');validateCutoverJournal(j);if(j.revision!==expectedRevision)throw fail('cutover-revision-stale');
                readSnapshot(ctx,j.generation,s=>{
                    if(!s?.active||digest(s.control)!==j.barrierDigest||digest(s.pointer)!==j.pointerDigest||!s.control.recoveryRequired)throw fail('cutover-barrier-stale');
                    const updated=nextCutoverJournal(j,stage,next);safeEvidence(updated);
                    ctx.request(ctx.store('journal').put(updated));ctx.done({ok:true,journal:updated,canWrite:false});
                });
            }));
        },
        beginAccountBootstrap:input=>beginAccountTransition(input,true),accountBootstraps:generation=>accountTransitions(generation,true),
        prepareControlOperation,
        ...Object.fromEntries(Object.keys(CONTROL_OPERATIONS).map(action=>[action,input=>controlOperation(action,input)])),
        lookupControlOperation(generation,operationId){
            try{identifier(generation);identifier(operationId);}catch(e){return Promise.resolve(rejected(errorCode(e)));}
            return transact(['reservations'],'readonly',ctx=>ctx.request(ctx.store('reservations').get([generation,operationId]),row=>{
                if(!row||row.kind!=='control'){ctx.done({ok:true,result:null});return;}
                validateReservation(row,generation,operationId);validateControlFact(row);ctx.done({ok:true,result:row.control.result,pending:row.control.result===null});
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
            if(journal?.kind===CUTOVER_KIND)return Promise.resolve(rejected('typed-cutover-required'));
            let j,r;try{j=structuredClone(journal);validateJournal(j);r=structuredClone(roots);r.forEach(validateRoot);if(j.revision!==(expectedRevision||0)+1)throw fail('journal-stale');}
            catch(e){return Promise.resolve(rejected(errorCode(e)));}
            return transact(['journal','roots','manifests','records'],'readwrite',ctx=>ctx.request(ctx.store('journal').get(j.migrationId),old=>{
                if(old){validateJournal(old);if(old.kind===CUTOVER_KIND)throw fail('typed-cutover-required');if(old.generation!==j.generation)throw fail('journal-identity-conflict');}
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
