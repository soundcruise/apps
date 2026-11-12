(async()=>{
 const c=fixtureConfig;window.client=ChordCruiseSync.client.createClient({enabled:true,endpoint:c.endpoint,localStorage,crypto});await client.initialize();window.store=await client.openStore();
 if(!localStorage.getItem('test.chord.seeded')){
  localStorage.setItem('chordCruise.settings',JSON.stringify(c.record.payload));await store.setMeta('appId','chord');await store.setMeta('deviceCredential',{credential:c.credential});await store.setMeta('cursor',c.cursor);await store.setMeta('migrationState','complete');await store.setMeta('datasetState','ready');await store.setMeta('syncState','pilot_ready');await store.putShadow({...c.record,recordKey:'settings/default'});localStorage.setItem('test.chord.seeded','true');
 }
 window.state=async()=>({local:JSON.parse(localStorage.getItem('chordCruise.settings')),outbox:await store.listOutbox(),shadow:await store.listShadow(),conflicts:await store.listConflicts(),cursor:await store.getMeta('cursor'),backups:await store.listBackups()});
 ChordCruiseSync.pairingUi.install({...client,applyPairingMerge:async(...args)=>{window.lastMerge=await client.applyPairingMerge(...args);return window.lastMerge}});await ChordCruiseSync.pairingUi.refresh();window.ready=true;
})().catch(e=>{window.bootError=e.stack;document.body.append(e.message)});
