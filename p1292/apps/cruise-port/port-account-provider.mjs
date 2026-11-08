// Dormant owner adapter. No normal boot imports this module. The transport is
// mandatory and fixture-only: even an authenticated GET can touch server activity.
import { authorityProEnvironment, openIDBAuthorityStore, claimPortAuthorityIssuer } from './port-indexeddb-authority-store.mjs';
import { equal, frozen, identifier } from './port-idb-authority-contract.mjs';
import { requestAccountOwnerContext, validateAccountOwnerContext } from '../shared/sync-account/account-owner-context.mjs';

const terminal = new Set(['invalid_account_credential', 'account_device_revoked', 'account_deleting', 'account_deleted', 'account_not_found']);
const positive = v => Number.isSafeInteger(v) && v > 0;
const validAccount = a => a && ['accountId','accountDeviceId','accountCredential'].every(k => typeof a[k] === 'string' && a[k].length > 0);

// Official summary intentionally filters Port out. Do not invent its membership
// generation from an Account generation, local revision, device or Authority.
export function projectOfficialAccountObservation(account, summary, devices) {
    if (!Array.isArray(devices?.devices)) return null;
    const current = devices.devices.filter(d => d?.isCurrent === true);
    if (!validAccount(account) || summary?.ok !== true || summary.account?.id !== account.accountId ||
        summary.account.state !== 'active' || !positive(summary.account.generation) ||
        !Array.isArray(summary.memberships) || !Array.isArray(devices?.devices) || devices.ok !== true ||
        current.length !== 1 || current[0].id !== account.accountDeviceId || current[0].revokedAt !== null ||
        !positive(current[0].credentialVersion)) return null;
    const memberships = [];
    for (const m of summary.memberships) {
        if (!m || !['chord','pitch','fretboard','rhythm'].includes(m.appId) ||
            typeof m.id !== 'string' || !m.id || typeof m.state !== 'string' || !positive(m.generation) ||
            memberships.some(p => p.appId === m.appId)) return null;
        memberships.push({ appId:m.appId, id:m.id, state:m.state, generation:m.generation });
    }
    return frozen({ accountId:account.accountId, accountDeviceId:account.accountDeviceId,
        serverAccountGeneration:summary.account.generation, credentialVersion:current[0].credentialVersion,
        memberships, portMembership:null, credentialFreshness:'observed-only', expiresAt:null });
}

export async function createIsolatedPortAccountProvider({ scope, mutationStore, accountStorage, AccountClient, fetchImpl, ownerContext=false } = {}) {
    const env = authorityProEnvironment(scope); env.assertLive();
    if (![true,false].includes(ownerContext)||!env.fixtureOnly || !/^sound-cruise-port-authority-v1-fixture-/.test(scope.name) ||
        typeof fetchImpl !== 'function' || typeof AccountClient !== 'function' ||
        ['capture','inspect','current','reconcile'].some(k => typeof mutationStore?.[k] !== 'function') ||
        ['getGeneration','subscribeAccount'].some(k => typeof accountStorage?.[k] !== 'function')) throw Error('account-provider-isolation-required');
    const store = await openIDBAuthorityStore(scope);
    let issuer;
    try { issuer = claimPortAuthorityIssuer(scope); } catch (e) { store.dispose(); throw e; }
    let closed=false, revision=0, request=0;
    const listeners=new Set(), terminalSources=[];
    const state = (status, extra={}) => frozen({contractVersion:1,status,...extra,
        uiRevision:revision, authorizationConfirmed:false, operationAuthorized:false,
        continuityProven:false, recoveryRequired:true, canWrite:false});
    let cached=state('unconfirmed'), freshness=null, observationPin=null;
    const publish=(status,extra) => { observationPin=null; cached=state(status,extra); for(const fn of listeners) {try {fn(cached);} catch { /* display observer */ }} return cached; };
    const live=()=>{env.assertLive();if(closed)throw Error('account-provider-disposed');};
    const off=accountStorage.subscribeAccount(()=>{revision++;request++;publish('stale');});
    const clock=()=>{const c={wall:env.now(),mono:env.monotonicNow(),origin:env.clockIdentity()};
        if(!Number.isFinite(c.wall)||!Number.isFinite(c.mono)||c.wall<0||c.mono<0||
            !(typeof c.origin==='string'&&c.origin.length>0||typeof c.origin==='number'&&Number.isFinite(c.origin)))throw Error('account-provider-clock-invalid');return c;};
    const elapsed=f=>{try{const c=clock();if(c.origin!==f.start.origin||c.wall<f.previous.wall||c.mono<f.previous.mono)return Infinity;
        f.previous=c;return Math.max(c.wall-f.start.wall,c.mono-f.start.mono);}catch{return Infinity;}};
    const cachedStatus=()=>{if(freshness&&cached.status==='observed'&&elapsed(freshness)>=freshness.budget){freshness=null;return publish('expired');}return cached;};
    async function pin(generation) {
        identifier(generation); live();
        const local=accountStorage.getGeneration(), epoch=revision;
        if (!Number.isSafeInteger(local)||local<0) throw Error('account-provider-local-generation-invalid');
        const context=await mutationStore.capture(), account=await mutationStore.inspect(context);
        if(!validAccount(account))throw Error('account-provider-account-invalid');
        const hydrated=await store.hydrate(generation), transitions=await store.accountTransitions(generation);
        const c=hydrated.snapshot?.control, p=hydrated.snapshot?.pointer;
        if(!transitions.ok||transitions.recoveryRequired||hydrated.readiness!=='writable'||
            c?.identity?.ownership!=='bound-account'||c.identity.accountId!==account.accountId||
            c.epoch!==transitions.controlEpoch||!p)throw Error('account-provider-barrier-required');
        const value={context,account,generation,local,epoch,control:c,pointer:p};
        if(!await current(value))throw Error('account-provider-source-stale');
        return value;
    }
    async function current(p) {
        live();
        if(p.epoch!==revision||p.local!==accountStorage.getGeneration()||!await mutationStore.current(p.context))return false;
        const h=await store.hydrate(p.generation), t=await store.accountTransitions(p.generation);
        live();
        return p.epoch===revision&&p.local===accountStorage.getGeneration()&&t.ok&&!t.recoveryRequired&&
            h.readiness==='writable'&&equal(h.snapshot?.control,p.control)&&equal(h.snapshot?.pointer,p.pointer)&&
            await mutationStore.current(p.context);
    }
    return Object.freeze({
        getCachedStatus:cachedStatus,
        // Read-result validation only, never a writer/admission capability. The
        // opaque durable source remains inside the owner. Notifications alone
        // cannot prove a result current after a consumer's asynchronous work.
        async isCurrentObservation(value) {
            live(); const pinned=observationPin;
            if(!pinned || pinned.serial!==request || cachedStatus()!==value || pinned.value!==value)return false;
            if(!await current(pinned.source)) {
                if(observationPin===pinned)publish('stale');
                return false;
            }
            return observationPin===pinned && pinned.serial===request && cachedStatus()===value;
        },
        subscribe(fn){if(typeof fn!=='function')throw Error('account-provider-listener-invalid');live();listeners.add(fn);return()=>listeners.delete(fn);},
        async refresh({generation,operationId}={}) {
            identifier(operationId); live(); const serial=++request;
            let p;
            try {
                p=await pin(generation);
                if(terminalSources.some(a=>equal(a,p.account)))return publish('recovery-required',{stopProven:false});
                const client=new AccountClient({endpoint:'https://account-provider.invalid',admissionMode:'production',
                    storage:accountStorage, fetchImpl, requestTimeoutMs:1000});
                let projection,timing=null;
                if(ownerContext){const requestId=crypto.randomUUID(),challenge=crypto.randomUUID(),start=clock();
                    timing={start,previous:start,budget:0};
                    const result=await requestAccountOwnerContext(client,p.account.accountCredential,{requestId,challenge});
                    projection=validateAccountOwnerContext(result,{requestId,challenge,account:p.account,identity:p.control.identity});
                    if(projection){timing.budget=projection.remainingMs;if(elapsed(timing)>=timing.budget)projection=null;}
                } else {
                    const summary=await client.summary(p.account.accountCredential);
                    if(!await current(p))throw Error('account-provider-source-stale');
                    const devices=await client.devices(p.account.accountCredential);
                    projection=projectOfficialAccountObservation(p.account,summary,devices);
                }
                if(!projection)throw Error('account-provider-response-unresolved');
                if(!await current(p)||serial!==request) return serial===request?publish('stale'):state('stale');
                if(timing&&elapsed(timing)>=timing.budget)throw Error('account-provider-observation-expired');
                freshness=timing;
                // Two authenticated reads are observations, not an atomic lease or
                // a freshness proof. They never unlock coordinator/writer admission.
                const result=publish('observed',{...projection,localNotificationGeneration:p.local});
                observationPin={source:p,serial,value:result};
                return result;
            } catch(error) {
                if(closed)return state('disposed');
                if(p&&terminal.has(error.code)) {
                    // A terminal response may overtake another refresh. Do not
                    // discard it by request order; pin the exact credential/source.
                    let retiring=null;
                    try {
                        if(!await current(p))return serial===request?publish('stale'):state('stale');
                        terminalSources.push(p.account);
                        revision++; retiring=++request;
                        const capability=issuer.issue('control:invalidate',{generation:p.generation});
                        const q={generation:p.generation,operationId,identity:p.control.identity,
                            expectedEpoch:p.control.epoch,expectedPointerEpoch:p.pointer.pointerEpoch,kind:'revoke',destination:null,capability};
                        // Existing Authority transaction persists intent + stop. No
                        // Account mutation, confirmation, resume or credential issuance.
                        const stopped=await store.beginAccountTransition(q);
                        if(closed)return state('disposed');
                        if(!await mutationStore.current(p.context)||retiring!==request)return retiring===request?publish('stale'):state('stale');
                        return publish(stopped.ok?'denied':'recovery-required',{stopProven:!!stopped.ok,
                            reason:stopped.ok?'account-provider-terminal':'account-provider-stop-unproven'});
                    } catch {
                        if((retiring??serial)!==request)return state('stale');
                        return closed?state('disposed'):publish('recovery-required',{stopProven:false,reason:'account-provider-stop-unproven'});
                    }
                }
                if(serial!==request)return state('stale');
                return publish('unconfirmed',{reason:'account-provider-unresolved'});
            }
        },
        // Existing owner receipt reader remains historical. It can never make
        // this provider authorized, even if a matching receipt is found.
        async reconcile(binding) { live(); try {const r=await mutationStore.reconcile(binding);live();return state('recovery-required',{mutationProven:r.ok===true&&r.mutationProven===true});}
            catch {return state(closed?'disposed':'recovery-required',{mutationProven:false});} },
        dispose(){if(closed)return;closed=true;revision++;request++;cached=state('disposed');off();listeners.clear();store.dispose();}
    });
}

// Least-authority consumer surface. No writer, client, source token or credential
// is exposed. Normal Port/Shared/Studio entrypoints do not install it.
export function createAccountObservationConsumer(provider) {
    return Object.freeze({getCachedStatus:()=>provider.getCachedStatus(),
        refresh:request=>provider.refresh(request),subscribe:fn=>provider.subscribe(fn)});
}
