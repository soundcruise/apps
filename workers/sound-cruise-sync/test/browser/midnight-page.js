(async()=>{
 const c=window.fixtureConfig,app=c.app, identity=c.identity||'browser-A';
 if(!localStorage.getItem('test.account'))localStorage.setItem('test.account',identity);
 if(!localStorage.getItem('test.valid'))localStorage.setItem('test.valid','true');
 const assertCurrent=()=>{if(localStorage.getItem('test.account')!==identity||localStorage.getItem('test.valid')!=='true')throw Object.assign(Error('account_generation_changed'),{code:'account_generation_changed'})};
 const store=SoundCruiseMultiAppSync.dataStorage.createStore(app,{accountId:identity,assertCurrent});
 window.store=store;
 if(!localStorage.getItem(c.key))for(const [k,v]of Object.entries(c.seed))localStorage.setItem(k,v);
 const adapter=new window[c.root][c.name]({storage:localStorage,cryptoImpl:crypto});window.adapter=adapter;
 const accountClient={admissionMode:'qa',consumeHandoff:async()=>({consumeMode:'new_app',membershipId:'membership-'+app,membershipState:'active',appDeviceCredential:'scd1.valid',qaCredential:'scq1.valid'}),confirmConsumePersisted:async()=>{}};
 window.runtime=new SoundCruiseMultiAppSync.MultiAppSyncRuntime({appId:app,accountId:identity,endpoint:c.endpoint,adapter,store,accountClient,accountCore:{validAppCredential:x=>x==='scd1.valid',validQaCredential:x=>x==='scq1.valid',createOperationId:()=>crypto.randomUUID()},admissionMode:'qa',assertCurrent,assertCurrentAsync:async()=>assertCurrent()});
 window.settings=()=>{let s=JSON.parse(localStorage.getItem(c.key));return app==='fretboard'?s.settings:s};
 window.change=values=>{let s=JSON.parse(localStorage.getItem(c.key));Object.assign(app==='fretboard'?s.settings:s,values);localStorage.setItem(c.key,JSON.stringify(s))};
 window.state=async()=>({settings:settings(),outbox:await store.listOutbox(),shadow:await store.listShadow(),cursor:await store.readMeta('cursor'),conflicts:await store.listConflicts(),dbs:(await indexedDB.databases()).map(d=>d.name)});
 document.getElementById('state').textContent='ready';window.ready=true;
})().catch(e=>{window.bootError=e.message;document.getElementById('state').textContent=e.message});
