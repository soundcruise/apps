'use strict';
(()=>{
 const section=document.querySelector('#dot-review'),items=document.querySelector('#dot-items'),status=document.querySelector('#dot-status');
 if(!section||!items||!status)return;
 const text=(tag,value)=>{const n=document.createElement(tag);n.textContent=String(value??'不明');return n;};
 const row=(label,value)=>text('p',`${label}：${value??'不明'}`);
 const safeLink=url=>{try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)return null;const a=text('a','出典を開く');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return null}};
 async function get(path){const r=await fetch(path,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('unavailable');return r.json();}
 function renderDetail(v){
  items.replaceChildren();const c=v.candidate,card=document.createElement('article');card.append(text('h3',`${c.entity.brand||c.entity.manufacturer||'主体未確認'} / ${(c.entity.models||[]).join('・')||c.entity.product||'不明'}`));
  card.append(row('出来事',c.event.type),row('公開日',`${c.dates.article_published.value||'不明'}（${c.dates.article_published.precision}）`),row('日付根拠ID',(c.dates.article_published.evidence_ids||[]).join(' / ')||'なし'),row('AI掲載推奨',`${c.recommendation.level}（人間判断ではありません）`),row('取得方式',c.sources.map(s=>s.acquisition_method).join(' / ')||'なし'),row('未検証事項',c.unresolved_questions.join(' / ')||'なし'),row('根拠不足',v.validation.blockers.join(' / ')||'別途確認'),row('正式facts','未検証'),row('READY','対象外'),row('重複','未照合（履歴の全件確認なし）'));
  for(const claim of c.claims)card.append(row(`主張 ${claim.field}`,`${Array.isArray(claim.value)?claim.value.join(' / '):claim.value} / 根拠 ${(claim.evidence_ids||[]).join(' / ')||'なし'} / ${claim.verification}`));
  for(const source of c.sources){card.append(row('出典・取得',`${source.publisher||'不明'} / ${source.acquisition_method} / ${source.evidence_locator||'箇所未確認'}`));const a=safeLink(source.url);if(a)card.append(a);}
  card.append(row('配送日時',v.delivery?.createdAt),row('配送記録',(v.delivery?.attempts||[]).map(a=>`${a.status} ${a.processedAt||''}`).join(' / ')||'なし'));items.append(card);
 }
 async function load(){try{status.textContent='読み込み中';const v=await get('/api/dot-candidates?limit=10');items.replaceChildren();status.textContent=`${v.items.length}件（既存NEWSの重複は未照合）`;for(const item of v.items){const button=text('button',`${item.brand||item.manufacturer||'主体未確認'} / ${(item.models||[]).join('・')||item.product||'不明'}`);button.type='button';button.addEventListener('click',async()=>{try{renderDetail(await get('/api/dot-candidates/'+encodeURIComponent(item.id)));status.textContent='読み取り専用';}catch{status.textContent='候補を読み込めませんでした';}});items.append(button);}if(v.nextCursor)items.append(text('p','続きがあります。ページングUIは未対応です。'));}catch{status.textContent='候補を読み込めませんでした';}}
 section.addEventListener('toggle',()=>{if(section.open)void load()});
 get('/api/dot-capabilities').then(v=>{if(v.available===true)section.hidden=false}).catch(()=>{});
})();
