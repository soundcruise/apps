// Privileged test setup only. Browser installation requires the actual /tests/
// route on loopback. Product boot graphs never import this module or install it.
import { createIsolatedIDBAuthorityScope, installIsolatedAuthorityTestProvider } from '../../port-indexeddb-authority-store.mjs';
import { equal, digest } from '../../port-idb-authority-contract.mjs';
const contexts=new WeakMap(),guards=new WeakMap(),ackCapabilities=new WeakMap();
export function createTestAuthorityScope(options,{fixtureMutations=true}={}) {
    const scope=createIsolatedIDBAuthorityScope(options);
    const provider=Object.freeze({fixtureMutations,
        capture(p,capability,context){const ack=ackCapabilities.get(capability),c=contexts.get(context);
            if(p.policy==='pro'&&c?.scope===scope)c.fingerprint??=p.fingerprint;
            return Object.freeze({initialize:p.policy==='isolated-initialize',fixture:p.policy==='isolated-fixture',
            ack:p.action==='ackDelete' && p.acknowledgements.length>0 && Object.keys(p.changes).length===0 &&
                (fixtureMutations || ack?.scope===scope && ack.generation===p.generation && ack.operationId===p.operationId && equal(ack.acknowledgements,p.acknowledgements))});},
        describe(token){const c=contexts.get(token);return c?.scope===scope?c.identity:null;},
        verify(token,guard,p){const c=contexts.get(token),g=guards.get(guard);return !!c&&c.scope===scope&&g?.token===token&&
            c.operationId===p.operationId&&c.action===p.action&&c.fingerprint===p.fingerprint&&equal(c.identity,p.authorizationIdentity);}
    });
    installIsolatedAuthorityTestProvider(scope,provider);return scope;
}
export function testAckCapability(scope,{generation,operationId,acknowledgements}) {
    const token=Object.freeze({});ackCapabilities.set(token,{scope,generation,operationId,acknowledgements:structuredClone(acknowledgements)});return token;
}
export function testProAuthorization(scope,{operationId,action,generation=1,credentialFingerprint=digest('isolated-test-credential'),
    wallMarginMs=60000,monoMarginMs=60000,resolve}={}) {
    const token=Object.freeze({operationId,action});const identity=Object.freeze({generation,credentialFingerprint});
    contexts.set(token,{scope,operationId,action,identity});
    const guard=(context,details)=>{
        if(context!==token||details.operationId!==operationId||details.action!==action)throw Error('test context mismatch');
        return resolve?resolve(context,details):{ok:true,policy:'pro',...identity,wallMarginMs,monoMarginMs};
    };
    guards.set(guard,{token});return {authorizationContext:token,commitGuard:guard};
}
