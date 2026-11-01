// Normal boot is display-only. Isolated host injection reuses Session + durable Client.
const labels={DISCARD_UNKNOWN:'競合操作の整理結果が不明：同じ要求を照合してください',DISCARDED_LOCAL_RETAINED:'拒否済み操作の証拠整理・ローカル保持済み',HISTORY_RETIRED:'証拠の保持範囲外：過去の保存結果は未証明です',ARCHIVED_UNKNOWN:'過去の結果未証明・ローカル保持済み',LOCAL_RETAINED:'ローカルを保持しました。過去の保存結果は未証明です',QUEUED:'未送信',UPLOADING:'アップロード中',COMMITTING:'保存結果を確認中',SYNCED:'Cloud同期確認済み',LOCAL_CHANGED:'Cloud保存後にローカルが変更されています',CONFLICT:'競合：ローカルとCloudを確認してください',UNKNOWN:'結果不明：再送せず結果照合を行ってください',PENDING_RECOVERY:'資格の再認証・復旧が必要です',ADOPTION_UNKNOWN:'復旧の採用結果を照合してください',REMOTE_DELETED:'Cloudは削除済みです。ローカルは保持しています',HISTORICAL_RECEIPT:'過去の保存結果です。現在のCloudを確認してください',REMOTE_ADVANCED:'別端末でCloudが更新されています'};
export function mountStudioCloudPanel({element,session=null,client=null,repository=null,getProject=null,identityActions={}}={}){
 if(!element)throw Error('cloud-panel-element');
 let busy=false,disposed=false,generation=0,refreshSequence=0,activeId=null,operations=[],status='Cloud Syncは未接続です。ローカル保存は引き続き利用できます。';
 const doc=element.ownerDocument,buttons=new Map();
 element.replaceChildren();element.classList.add('studio-cloud-panel');
 const title=doc.createElement('h2');title.textContent='Cloud Sync';element.append(title);
 const account=doc.createElement('p'),pro=doc.createElement('p'),state=doc.createElement('p');state.setAttribute('role','status');state.setAttribute('aria-live','polite');element.append(account,pro,state);
 const note=doc.createElement('p');note.textContent='ローカル保存とCloud保存は別の操作です。編集内容をローカル保存してから同期してください。';element.append(note);
 const list=doc.createElement('select');list.setAttribute('aria-label','未送信・復旧操作');list.addEventListener('change',()=>{activeId=list.value||null;render();});element.append(list);
 const confirmation=doc.createElement('input');confirmation.type='checkbox';confirmation.id='studio-cloud-delete-confirm';const label=doc.createElement('label');label.htmlFor=confirmation.id;label.append(confirmation,doc.createTextNode('Cloudのみ削除する（ローカルProjectを保持）'));element.append(label);
 confirmation.addEventListener('change',render);
 const retireConfirm=doc.createElement('input');retireConfirm.type='checkbox';retireConfirm.id='studio-cloud-retire-confirm';const retireLabel=doc.createElement('label');retireLabel.append(retireConfirm,doc.createTextNode('過去の保存結果は未証明のまま保持し、ローカル草稿で新しい操作へ進む'));element.append(retireLabel);retireConfirm.addEventListener('change',render);
 const discardConfirm=doc.createElement('input');discardConfirm.type='checkbox';discardConfirm.dataset.discardConfirm='';const discardLabel=doc.createElement('label');discardLabel.append(discardConfirm,doc.createTextNode('競合で拒否済みの操作のみ整理する（UNKNOWNは対象外・ローカル保持）'));element.append(discardLabel);discardConfirm.addEventListener('change',render);
 const panel=doc.createElement('div');panel.className='studio-cloud-actions';element.append(panel);
 function currentProject(){const p=getProject?.();if(!p||typeof p.projectId!=='string'||p.dirty===true)throw Object.assign(Error('先に編集内容をローカル保存してください'),{code:'local-draft-unsaved'});return p.projectId;}
 function authenticated(){try{return session?.readSession();}catch{return null;}}
 const online=()=>globalThis.navigator?.onLine!==false;
 function render(){const s=authenticated(),admitted=globalThis.CruiseStudio?.entryAuth?.isAuthorized()===true;account.textContent=s?'Account接続済み / Device '+s.binding.deviceId.slice(0,8):admitted?'Account接続済み / Project Sync未接続':'Account未接続';pro.textContent=s?'Pro認証済み / '+new Date(s.validUntil).toLocaleString()+'まで':admitted?'Studio Pro認証済み':'Pro認証を確認してください';state.textContent=online()?status:'Offline：未送信データは端末に保持されています';
  for(const [name,b] of buttons){b.disabled=busy||!online()||!session||(!['connect','refresh','register','device','recover'].includes(name)&&!s);}
  const op=operations.find(x=>x.operationId===activeId);for(const name of ['send','reconcile','adopt'])if(buttons.has(name))buttons.get(name).disabled ||= !op;
  if(buttons.has('send'))buttons.get('send').disabled ||= !['QUEUED','UPLOADING'].includes(op?.state);
  if(buttons.has('adopt'))buttons.get('adopt').disabled ||= !['PENDING_RECOVERY','ADOPTION_UNKNOWN'].includes(op?.state)||!identityActions.adoption;
  if(buttons.has('retain'))buttons.get('retain').disabled ||= !retireConfirm.checked||op?.state!=='HISTORY_RETIRED';
  if(buttons.has('discard'))buttons.get('discard').disabled ||= !discardConfirm.checked||!['CONFLICT','DISCARD_UNKNOWN'].includes(op?.state);
  if(buttons.has('delete'))buttons.get('delete').disabled ||= !confirmation.checked;
 }
 async function refreshList(){const captured=generation,sequence=++refreshSequence;const id=getProject?.()?.projectId;if(!client||!authenticated()||!id){render();return;}const found=await client.list(id);if(captured!==generation||sequence!==refreshSequence||id!==getProject?.()?.projectId)return;operations=found;list.replaceChildren();for(const o of found){const option=doc.createElement('option');option.value=o.operationId;option.textContent=(labels[o.state]||o.state)+' / '+o.operationId.slice(-8);list.append(option);}if(!found.some(x=>x.operationId===activeId))activeId=found.at(-1)?.operationId??null;list.value=activeId||'';render();}
 async function run(fn){if(busy||disposed)return;busy=true;status='処理中…';const captured=generation;render();try{const r=await fn();if(captured!==generation||disposed)return;status=labels[r?.state]||r?.message||'確認が完了しました';await refreshList();}catch(e){if(captured===generation){try{await refreshList();}catch{} }if(captured===generation)status=e.code==='local-draft-unsaved'?e.message:'操作を停止しました：'+(e.code||e.message)+ '。ローカルと未確定データは保持しています。';}finally{busy=false;render();}}
 function button(name,text,fn){const b=doc.createElement('button');b.type='button';b.textContent=text;b.dataset.cloudAction=name;b.addEventListener('click',()=>run(fn));panel.append(b);buttons.set(name,b);}
 if(session&&client&&repository&&getProject){
  button('connect','このAccountで接続',()=>session.enroll());button('refresh','Account・Pro資格を確認',()=>session.refresh());
  for(const [name,text]of [['register','Account新規登録'],['device','このDeviceを登録'],['recover','Accountを復旧']])if(typeof identityActions[name]==='function')button(name,text,()=>identityActions[name](session));
  button('save','現在のProjectをCloudへ保存',async()=>{const o=await client.enqueue(currentProject());activeId=o.operationId;status=labels.UPLOADING;render();return client.send(o.operationId);});
  button('observe','Cloudの状態を確認',async()=>{const r=await client.observe(currentProject());return{...r,message:r.state==='REMOTE_AVAILABLE'?'Cloud文書あり / revision '+r.head.revision:r.state==='REMOTE_ABSENT'?'Cloudに文書はありません':labels[r.state]};});
  button('load','Cloudを取得してローカル保存',async()=>{const id=currentProject(),here=repository.read({type:'project',projectId:id});if(!here.ok)throw Error('local-read');return client.applyRemote(id,here.revision);});
  if(client.discardConflict)button('discard','拒否済み競合操作を整理',async()=>{if(!discardConfirm.checked)throw Error('discard-confirmation-required');const r=await client.discardConflict(activeId,{confirm:true});discardConfirm.checked=false;return r;});
  button('retain','結果未証明の草稿を保持して再開',async()=>{if(!retireConfirm.checked)throw Error('retired-confirmation-required');const r=await client.retainRetiredDraft(activeId,{confirm:true});retireConfirm.checked=false;return r;});
  button('send','未送信操作を送信',()=>client.send(activeId));button('reconcile','結果不明・保存結果を照合',()=>client.reconcile(activeId));
  if(identityActions.adoption)button('adopt','現在のOwnerで復旧',async()=>{const r=await identityActions.adoption(client,activeId);if(r.operationId)activeId=r.operationId;return r;});
  button('delete','Cloudのみ削除',async()=>{if(!confirmation.checked)throw Error('delete-confirmation');const o=await client.enqueue(currentProject(),{deleted:true});activeId=o.operationId;confirmation.checked=false;return client.send(o.operationId);});
 }else{list.hidden=true;label.hidden=true;retireLabel.hidden=true;discardLabel.hidden=true;}
 function changed(){render();}globalThis.addEventListener?.('online',changed);globalThis.addEventListener?.('offline',changed);const expiryTimer=globalThis.setInterval?.(render,1000);render();
 return Object.freeze({refresh:refreshList,reset(){generation++;activeId=null;operations=[];list.replaceChildren();status='Account変更：現在の資格を再確認してください';render();},dispose(){disposed=true;generation++;globalThis.clearInterval?.(expiryTimer);globalThis.removeEventListener?.('online',changed);globalThis.removeEventListener?.('offline',changed);element.replaceChildren();}});
}
const normal=globalThis.document?.querySelector('[data-studio-cloud-panel]');
if(normal){
 const config=globalThis.__SOUND_CRUISE_STUDIO_CLOUD__;
 if(config?.endpoint){
  import('./identity-host.mjs').then(({mountStudioIdentityHost})=>{
   // Transport enforces the existing production-release boundary; no override.
   globalThis.CruiseStudio.identityHost=mountStudioIdentityHost({element:normal,...config});
  }).catch(()=>{normal.textContent='Cloud接続を確認できません。ローカルProjectは保持しています。';});
 }else mountStudioCloudPanel({element:normal});
}
