// Explicit injection only. No boot installation, storage, transport or writer.
// A server snapshot is historical read evidence, never a credential lease.
const readers=new WeakSet();
const positive=n=>Number.isSafeInteger(n)&&n>0;
const qualified=v=>v?.contractVersion===1&&v.status==='observed'&&
    v.credentialFreshness==='owner-confirmed-at-read'&&v.credentialExpiresAt===null&&
    v.authorizationConfirmed===false&&v.operationAuthorized===false&&v.continuityProven===false&&
    v.recoveryRequired===true&&v.canWrite===false&&
    typeof v.accountId==='string'&&v.accountId.length>0&&typeof v.accountDeviceId==='string'&&v.accountDeviceId.length>0&&
    positive(v.serverAccountGeneration)&&positive(v.credentialVersion)&&
    typeof v.portMembership?.id==='string'&&v.portMembership.id.length>0&&
    v.portMembership.state==='active'&&positive(v.portMembership.generation)&&
    positive(v.serverObservedAt)&&positive(v.expiresAt)&&v.expiresAt>v.serverObservedAt&&
    positive(v.remainingMs)&&v.remainingMs<=5000&&v.remainingMs===v.expiresAt-v.serverObservedAt&&positive(v.serverRuntimeGeneration);
const unknown=()=>Object.freeze({status:'unconfirmed',asOfRead:true,accountId:null,
    authorizationConfirmed:false,operationAuthorized:false,canWrite:false});
function project(v) {
    if(!qualified(v))return unknown();
    return Object.freeze({status:'observed-readonly',asOfRead:true,accountId:v.accountId,
        accountDeviceId:v.accountDeviceId,accountRevisionSource:'canonical-owner-pin',
        serverAccountGeneration:v.serverAccountGeneration,membershipId:v.portMembership.id,
        membershipGeneration:v.portMembership.generation,credentialVersion:v.credentialVersion,
        credentialFreshness:v.credentialFreshness,credentialExpiresAt:null,serverObservedAt:v.serverObservedAt,
        serverRuntimeGeneration:v.serverRuntimeGeneration,authorizationConfirmed:false,operationAuthorized:false,canWrite:false});
}
export function isAccountObservationReader(value){return readers.has(value);}
export function createIsolatedAccountObservationReader({provider,generation}={}) {
    if(typeof generation!=='function'||['refresh','getCachedStatus','isCurrentObservation'].some(k=>typeof provider?.[k]!=='function'))throw Error('account-observation-reader-contract-required');
    let serial=0,original=null,view=unknown(),closed=false;
    const clear=()=>{original=null;view=unknown();return view;};
    const peek=()=>{
        try {if(closed||!original||provider.getCachedStatus()!==original||!qualified(original))return clear();return view;}
        catch{return clear();}
    };
    const reader=Object.freeze({
        canWrite:false,
        peek,
        async read(){
            if(closed)return clear();
            const attempt=++serial;clear();
            try {
                const result=await provider.refresh({generation:generation(),operationId:'consumer-read-'+crypto.randomUUID()});
                if(closed||attempt!==serial)return unknown();
                if(!qualified(result))return clear();
                const valid=await provider.isCurrentObservation(result);
                if(closed||attempt!==serial)return unknown();
                if(!valid)return clear();
                original=result;view=project(result);return peek();
            }catch {return attempt===serial?clear():unknown();}
        },
        async current(candidate){
            if(closed||candidate!==peek()||candidate.status!=='observed-readonly')return false;
            const source=original,attempt=serial;
            try {
                const valid=await provider.isCurrentObservation(source);
                if(closed||attempt!==serial||original!==source)return false;
                if(!valid){clear();return false;}
                return candidate===peek();
            }catch{if(attempt===serial)clear();return false;}
        },
        dispose(){closed=true;serial++;clear();}
    });
    readers.add(reader);return reader;
}
