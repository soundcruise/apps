// Read-only discovery view; all model output is displayed as text.
export function renderWebDiscovery(document,data){
 const section=document.createElement('section');section.setAttribute('aria-label','Web発見');
 const heading=document.createElement('h2');heading.textContent='Web発見 · 未検証のAI推定';section.append(heading);
 const notice=document.createElement('p');notice.textContent='AIによる推定情報です。日付・掲載価値・優先度には誤りが含まれる可能性があります。原記事を確認してください。';section.append(notice);
 if(data.manualEnabled){const run=document.createElement('button'),result=document.createElement('p');run.type='button';run.textContent='Web探索を1回実行';result.setAttribute('role','status');section.append(run,result);run.addEventListener('click',async()=>{if(!confirm('Web検索とAI分類を1回実行します。費用が発生します。実行しますか？'))return;run.disabled=true;result.textContent='実行中…';try{const session=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});if(!session.ok)throw Error();const {csrf}=await session.json();const response=await fetch('/api/web-discovery/run',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-News-CSRF':csrf},body:'{}'});if(!response.ok)throw Error();const r=await response.json();result.textContent=r.skipped?'既に実行済み、または実行中です。':'完了。検索 '+r.searches+'回、AI '+r.ai_calls+'回、分類 '+r.processed+'件、エラー '+r.errors+'件。一覧を更新してください。';}catch{result.textContent='実行結果を確認できません。再実行せず管理者へ確認してください。';}});}
 for(const item of data.items){
  const card=document.createElement('article'),title=document.createElement('p');title.textContent=item.title;card.append(title);
  const u=new URL(item.url);if(u.protocol==='https:'&&!u.username&&!u.password){const link=document.createElement('a');link.href=u.href;link.textContent='原記事';link.target='_blank';link.rel='noopener noreferrer';card.append(link);}
  const lang=document.createElement('p');lang.textContent=item.titleLanguageHint==='japanese_unconfirmed'?'海外・言語未確認の発見ヒント：日本語記事を探してください':'日本語見出し（推定）：ページ言語を人が要確認';card.append(lang);
  const e=item.estimate||{},body=document.createElement('p');body.textContent=`メーカー・製品（推定）: ${e.brand||'不明'} / ${e.product||'不明'} · 関連性: ${e.relevance||'不明'} · 掲載価値: ${e.value||'不明'} · 優先度: ${e.priority||'不明'} · 重複疑い: ${e.duplicate||'未照合'} · ${item.status} · ${item.reason||''} · 検索: ${new Date(item.searched_at).toISOString()} · 公開日未確認`;card.append(body);section.append(card);
 }
 if(!data.items.length){const p=document.createElement('p');p.textContent='発見候補はまだありません';section.append(p);}return section;
}
if(typeof document!=='undefined'){
 fetch('/api/web-discovery',{credentials:'same-origin',cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{if(data.enabled)document.querySelector('main').append(renderWebDiscovery(document,data));}).catch(()=>{});
}
