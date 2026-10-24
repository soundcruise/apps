// Explicit fixture-only adapter. No normal route installs this over root.storage.
import {createIsolatedAccountMutationStore} from '../shared/sync-account/account-mutation-receipts.mjs';
import {createIsolatedPortAccountCoordinator} from './port-account-coordination.mjs';
const error=code=>Object.assign(new Error(code),{code});
export const ACCOUNT_WRITER_REGISTRY=Object.freeze({
    'client.startAccount':'blocked-create',
    'client.commitAccountRecovery':'replace','client.resumePendingRecovery':'replace',
    'client.commitAccountRecoveryRotation':'replace','client.revokeEnvironment':'remove',
    'client.detachCurrentEnvironment':'remove','client.resumePendingEnvironmentDetach':'remove',
    'client.commitDelete':'remove','client.resumePendingDelete':'remove',
    'client.consumeJoinInvitation':'replace','client.consumeHandoff':'replace',
    'client.resumePendingStart':'replace','client.resumePendingConsume':'replace',
    'client.detachApp':'aux','client.resumePendingDetach':'aux',
    'client.enrollQa':'blocked-qualification','client.confirmConsumePersisted':'aux',
    'port.join.consume':'blocked-create','port.join.resume':'replace','port.terminal-clear':'remove',
    'storage.setAccount':'replace','storage.clearAccount':'remove','storage.changeAccountIfCurrent':'both',
    'bridge.prepare':'aux','bridge.commitDual':'aux','bridge.finalize':'aux','bridge.rollback':'aux','bridge.resume':'aux',
    'bridge.createAccountAndPrepare':'blocked-create'
});
const pending=['Start','Consume','Bridge','Recovery','Delete','Detach','EnvironmentDetach'];
export function createIsolatedAccountWriterAdapter({indexedDB,scopeName,scopeFactory,locks,summary}={}){
    if(!indexedDB?.open||typeof scopeFactory!=='function'||typeof summary!=='function'||!locks?.request||
        !/^sound-cruise-port-authority-v1-fixture-[A-Za-z0-9_-]+$/.test(scopeName??''))throw error('account-writer-isolation-required');
    let generation=0;const listeners=new Set();
    const storage=createIsolatedAccountMutationStore({indexedDB,scopeName,protocol:2,beforeAccountCommit(){
        generation++;for(const listener of listeners){try{listener(generation);}catch{}}return generation;
    }});
    const operations=new WeakMap();
    return Object.freeze({
        async capture(expectedAccount){
            const expected=structuredClone(expectedAccount);
            const ticket=await storage.capture(),record=await storage.inspect(ticket);
            if(!expected || JSON.stringify(record)!==JSON.stringify(expected))throw error('account-writer-source-mismatch');
            const token=Object.freeze({});operations.set(token,ticket);return token;
        },
        // Callbacks construct the EXISTING AccountClient/PortJoin/Bridge with
        // this operation's injected storage. There is no ambient shared token.
        async run({context,writerId,operationId,invoke}={}){
            const mode=ACCOUNT_WRITER_REGISTRY[writerId];
            if(!Object.hasOwn(ACCOUNT_WRITER_REGISTRY,writerId)||!mode||typeof invoke!=='function')throw error('account-writer-unregistered');
            if(mode.startsWith('blocked-'))throw error('account-writer-'+mode);
            let ticket=operations.get(context),closed=false,tail=Promise.resolve(),lastCommit,coordinator;
            if(!ticket)throw error('account-writer-source-required');operations.delete(context);
            await storage.inspect(ticket);
            const serial=fn=>{const job=tail.then(()=>{if(closed)throw error('account-writer-operation-closed');return fn();});tail=job;return job;};
            const local={getGeneration:()=>generation,subscribeAccount(fn){listeners.add(fn);return()=>listeners.delete(fn);},
                getAccount:()=>serial(()=>storage.inspect(ticket))};
            const auxRead=key=>serial(async()=>{const r=await storage.auxiliary({context:ticket,key});return r.value;});
            const auxWrite=(key,value,remove=false)=>{const payload=structuredClone(value);return serial(async()=>{const r=await storage.auxiliary({context:ticket,key,value:payload,remove,write:true});ticket=r.context;});};
            for(const suffix of pending){const key='pending'+suffix;local['getPending'+suffix]=()=>auxRead(key);local['setPending'+suffix]=v=>auxWrite(key,v);local['clearPending'+suffix]=()=>auxWrite(key,null,true);}
            const qaSlot=(scope,appId)=>{if(scope==='port' && appId===null)return 'port';if(scope==='app'&&['chord','pitch','fretboard','rhythm'].includes(appId))return 'app:'+appId;throw error('qa_admission_scope_invalid');};
            local.getQaAdmission=async(scope='port',appId=null)=>{const slot=qaSlot(scope,appId),values=await auxRead('qaAdmission');return values?.[slot]??null;};
            local.setQaAdmission=input=>{const value=structuredClone(input);return serial(async()=>{if(!value||!['port','app'].includes(value.scope)||value.scope==='app'&&!['chord','pitch','fretboard','rhythm'].includes(value.appId))throw error('qa_admission_scope_invalid');
                const current=(await storage.auxiliary({context:ticket,key:'qaAdmission'})).value??{};
                const slot=qaSlot(value.scope,value.appId??null);
                const r=await storage.auxiliary({context:ticket,key:'qaAdmission',value:{...current,[slot]:value},write:true});ticket=r.context;});};
            local.clearQaAdmission=(scope='port',appId=null)=>serial(async()=>{const current=(await storage.auxiliary({context:ticket,key:'qaAdmission'})).value??{};
                const slot=qaSlot(scope,appId),next={...current};delete next[slot];
                const r=await storage.auxiliary({context:ticket,key:'qaAdmission',value:next,remove:!Object.keys(next).length,write:true});ticket=r.context;});
            const change=(next,expected,cas=false)=>serial(async()=>{
                if(mode==='aux'||next===null&&mode==='replace'||next!==null&&mode==='remove')throw error('account-writer-action-mismatch');
                if(lastCommit)throw error('account-writer-one-account-commit');
                const old=await storage.inspect(ticket);
                if(cas&&JSON.stringify([old?.accountId,old?.accountCredential,old?.accountDeviceId??null])!==JSON.stringify([expected?.accountId,expected?.accountCredential,expected?.accountDeviceId??null]))throw error('account_identity_changed');
                const scope=scopeFactory();if(scope?.name!==scopeName)throw error('account-writer-scope-mismatch');
                let issued;
                const mutationStore={...storage,capture:async()=>ticket,async mutate(q){const r=await storage.mutate({...q,context:ticket});issued=r;return r;}};
                coordinator=await createIsolatedPortAccountCoordinator({scope,indexedDB,locks,accountStorage:local,mutationStore});
                const observation=await summary(old);
                if(!await storage.current(ticket))throw error('account-mutation-cas-conflict');
                const context=await coordinator.observe({generation:observation.authorityGeneration,summary:observation.summary});
                if(!context)throw error('account-writer-authority-unavailable');
                const result=await coordinator.transition({context,operationId,nextAccount:next});
                if(!result.ok||!issued?.context||issued.replayed)throw error(result.reason||'account-writer-recovery-required');
                lastCommit=issued;ticket=issued.context;
                return Object.freeze({generation:issued.uiGeneration,historical:true,canWrite:false});
            });
            local.setAccount=value=>change(structuredClone(value));local.clearAccount=()=>change(null);
            local.changeAccountIfCurrent=(expected,value)=>change(value===null?null:structuredClone(value),structuredClone(expected),true);
            try{const result=await invoke(Object.freeze(local));await tail;return result;}
            finally{closed=true;await tail.catch(()=>{});coordinator?.dispose();}
        }
    });
}
