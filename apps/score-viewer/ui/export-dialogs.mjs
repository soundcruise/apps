export function chooseExportName(doc,{name,entries,folders}){
 const matches=entries.filter(e=>e.title===name);if(!matches.length)return Promise.resolve({entryId:crypto.randomUUID(),name,newEntry:true});
 return new Promise(resolve=>{const d=doc.createElement('dialog');d.className='sv-library sv-export-choice';d.setAttribute('aria-label','同名のファイル');let result=null;
 const node=(tag,text,parent=d)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;parent.append(e);return e;};
 node('h2','同じ名前のファイルがあります');node('p','上書きするか、別名で書き出すか選んでください。');const target=node('select');target.setAttribute('aria-label','上書きするファイル');
 const map=new Map(folders.map(f=>[f.folderId,f]));for(const entry of matches){const path=[];let at=entry.folderId;while(at&&path.length<17){const f=map.get(at);if(!f)break;path.unshift(f.name);at=f.parentId;}const o=node('option',(path.length?path.join(' / ')+' / ':'')+entry.title,target);o.value=entry.entryId;}
 let suffix=2;while(entries.some(e=>e.title===name+' ('+suffix+')'))suffix++;
 const label=node('label','別名'),input=node('input',undefined,label);input.value=name.slice(0,170)+' ('+suffix+')';input.maxLength=180;input.dataset.exportName='';const status=node('p','');status.setAttribute('role','status');
 const button=(text,id,run)=>{const b=node('button',text);b.type='button';b.dataset.exportChoice=id;b.onclick=run;};
 button('上書きする','overwrite',()=>{const selected=matches.find(e=>e.entryId===target.value);result={entryId:selected.entryId,name:selected.title,expectedVersion:selected.version,folderId:selected.folderId};d.close();});
 button('別名で書き出す','rename',()=>{const value=input.value.trim();if(!value||value.length>180||/[\u0000-\u001f\u007f]/.test(value)){status.textContent='名前を入力してください。';return;}if(entries.some(e=>e.title===value)){status.textContent='その名前は使用されています。別の名前を入力してください。';return;}result={entryId:crypto.randomUUID(),name:value,newEntry:true,requireUniqueName:true};d.close();});button('キャンセル','cancel',()=>d.close());
 d.addEventListener('keydown',e=>e.stopPropagation());d.addEventListener('close',()=>{d.remove();resolve(result);},{once:true});doc.body.append(d);d.showModal();
 });
}
export function exportComplete(doc,name){return new Promise(resolve=>{const d=doc.createElement('dialog');d.className='sv-library sv-export-complete';d.setAttribute('aria-label','書き出し完了');let move=false;
 const h=doc.createElement('h2');h.textContent='書き出しが完了しました';const p=doc.createElement('p');p.textContent='「'+name+'」を譜面ビューワーに追加しました。';d.append(h,p);
 for(const [id,label]of [['open','譜面ビューワーに移動'],['close','閉じる']]){const b=doc.createElement('button');b.type='button';b.textContent=label;b.dataset.exportComplete=id;b.onclick=()=>{move=id==='open';d.close();};d.append(b);}
 d.addEventListener('keydown',e=>e.stopPropagation());d.addEventListener('close',()=>{d.remove();resolve(move);},{once:true});doc.body.append(d);d.showModal();});}
