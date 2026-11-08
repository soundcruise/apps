// Product-external fixture coordinator. This is NOT an Account authenticator or
// a normal writer/provider. Fixture proof is never transferable to production.
import {openIDBAuthorityStore,claimPortAuthorityIssuer,authorityProEnvironment} from './port-indexeddb-authority-store.mjs';
import {createIsolatedAccountBootstrapStore,accountCandidateDigest} from '../shared/sync-account/account-mutation-receipts.mjs';
import {captureAccountBootstrap,accountBootstrapFingerprint} from './port-account-bootstrap-intent.mjs';
import {equal,frozen,fail,identifier} from './port-idb-authority-contract.mjs';
export const bootstrapMutationBinding=(q,scopeName)=>frozen({schemaVersion:1,authorityScope:scopeName,partitionId:q.identity.partitionId,authorityGeneration:q.generation,operationId:q.operationId,intentFingerprint:accountBootstrapFingerprint(q),kind:q.kind,destination:q.destination,source:q.source,candidateDigest:q.candidateDigest});
export async function createIsolatedAccountBootstrapCoordinator({scope,indexedDB,locks,fixtureProof}={}){
    const env=authorityProEnvironment(scope);env.assertLive();
    if(!env.fixtureOnly||!/^sound-cruise-port-authority-v1-fixture-[A-Za-z0-9_-]+$/.test(scope?.name??'')||!locks?.request||!Object.isFrozen(fixtureProof)||['capture','verify'].some(k=>typeof fixtureProof[k]!=='function')||
       typeof window!=='undefined'&&!location.pathname.startsWith('/apps/cruise-port/tests/'))throw fail('account-bootstrap-fixture-required');
    const authority=await openIDBAuthorityStore(scope),issuer=claimPortAuthorityIssuer(scope),storage=createIsolatedAccountBootstrapStore({indexedDB,scopeName:scope.name}),contexts=new WeakMap();let disposed=false;
    const live=()=>{env.assertLive();if(disposed)throw fail('account-bootstrap-disposed');};
    return Object.freeze({
        async capture(generation){identifier(generation);live();const s=await authority.hydrate(generation);live();const c=s.snapshot?.control;
            if(!s.ok||s.readiness!=='writable'||c?.identity?.ownership!=='unbound-local'||c.identity.partitionId!==scope.partitionId||!s.snapshot?.pointer)throw fail('account-bootstrap-unbound-required');
            const source=await storage.capture();live();const final=await authority.hydrate(generation);live();
            if(!final.ok||!equal(final.snapshot.control,c)||!equal(final.snapshot.pointer,s.snapshot.pointer)||!await storage.current(source))throw fail('account-bootstrap-source-stale');
            const token=Object.freeze({});contexts.set(token,{generation,control:c,pointer:s.snapshot.pointer,source});return token;
        },
        async start({context,operationId,kind,candidate}={}){
            // Pin all caller-owned input before the first await.
            const value=structuredClone(candidate),c=contexts.get(context);identifier(operationId);live();
            if(!c)throw fail('account-bootstrap-context-invalid');contexts.delete(context);
            const q=captureAccountBootstrap({generation:c.generation,operationId,kind,identity:c.control.identity,expectedEpoch:c.control.epoch,expectedPointerEpoch:c.pointer.pointerEpoch,
                destination:{accountId:value?.accountId,accountDeviceId:value?.accountDeviceId??null},source:storage.describe(c.source),candidateDigest:await accountCandidateDigest(value)});
            live();const proof=fixtureProof.capture(frozen({request:q,candidate:structuredClone(value)}));
            if(!proof||typeof proof!=='object'||typeof proof.then==='function')throw fail('account-bootstrap-fixture-proof-required');
            const guard=()=>{live();return fixtureProof.verify(proof,frozen({request:q,candidate:structuredClone(value)}))===true;};
            if(!guard())throw fail('account-bootstrap-qualification-stale');
            return locks.request('sound-cruise-port-account-bootstrap:'+scope.partitionId,{mode:'exclusive'},async()=>{
                live();if(!await storage.current(c.source))throw fail('account-bootstrap-source-stale');live();
                const cap=issuer.issue('control:invalidate',{generation:c.generation});
                const stopped=await authority.beginAccountBootstrap({...q,capability:cap,commitGuard:guard});live();
                if(!stopped.ok||stopped.replayed)throw fail(stopped.reason||'account-bootstrap-historical-only');
                const result=await storage.commit({context:c.source,binding:bootstrapMutationBinding(q,scope.name),nextAccount:value,commitGuard:guard});live();
                // Keep Authority unbound and stopped. No dataset ownership change,
                // confirm/resume, current authorization or automatic retry.
                return frozen({...result,authorityStopped:true});
            });
        },
        async reconcile({generation,operationId}={}){identifier(generation);identifier(operationId);live();const before=await authority.accountBootstraps(generation);live();
            if(!before.ok)throw fail(before.reason);const row=before.intents.find(r=>r.operationId===operationId);if(!row)throw fail('account-bootstrap-intent-missing');
            const proof=await storage.reconcile(bootstrapMutationBinding(row.accountTransition.request,scope.name));live();const after=await authority.accountBootstraps(generation);live();
            if(!after.ok||!equal(before,after))throw fail('account-bootstrap-observation-stale');return frozen({...proof,accountIntentPhase:'stopped',recoveryRequired:true,canWrite:false});
        },
        dispose(){if(disposed)return;disposed=true;authority.dispose();}
    });
}
