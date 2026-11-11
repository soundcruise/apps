// Read-only discovery view; all model output is displayed as text.
export function renderWebDiscovery(document,data,{diagnosticsOnly=false}={}){
 const section=document.createElement('section');section.setAttribute('aria-label','Web発見');
 const heading=document.createElement('h2');heading.textContent='Webで見つかった記事';section.append(heading);
 const reasons={existing_decision_reference:'既存の掲載・非掲載判断を再利用（再承認・上書きなし）',saved_collector_evidence_ready:'保存済み正式証拠と一致。取得なしの正式再確認が可能',formal_candidate_not_created:'通常collectorによる正式候補の作成が必要',formal_listing_evidence_missing:'許可済み一覧と候補の結び付きが不足',facts_saved_evidence_missing:'再利用できる正式取得証拠が不足',facts_saved_fingerprint_invalid:'出典証拠の署名検証が不成立',duplicate_confirmed:'正式検証で重複を確認',formal_validation_blocked:'既存の正式検証条件で停止',existing_formal_evidence:'既存候補の正式検証が成立',existing_candidate_verification:'既存候補の正式検証を確認',listing_discovery_required:'許可済み一覧での発見・登録が必要',existing_collector_work:'既存の取得・再試行を追跡中',permission_required:'この掲載面への取得・掲載許可の確認が必要',evidence_missing:'出典許可の証拠が不足',legal_block:'出典ポリシーによる利用停止',source_not_registered:'NEWSの出典登録・許可の確認が必要',source_collection_unavailable:'通常収集の停止・出典条件を確認',outside_allowed_article_path:'許可された記事範囲外',candidate_takedown:'削除要請あり',existing_decision_preserved:'既存の人間判断を維持',verification_unavailable:'確認経路の読取りに失敗',individual_article_required:'個別記事の確認が必要'};
 const notice=document.createElement('p');notice.textContent='検索・AI情報は未確認です。登録前に原記事を確認してください。';section.append(notice);
 if(data.manualAuthorization){const p=data.manualAuthorization,line=document.createElement('p'),labels={available:'期限内・未使用',operator_web_flags_off:'設定OFF',operator_web_permit_required:'期限付き許可なし',operator_web_permit_invalid:'許可設定が不正',operator_web_permit_not_started:'開始前',operator_web_permit_expired:'期限切れ',operator_web_utc_day_changed:'UTC日付変更で失効',operator_web_model_changed:'許可モデルと不一致',operator_web_permit_spent:'使用済み',operator_web_busy:'別の探索が実行中'};line.textContent=`単発探索の実効許可: ${p.effective?'ON':'OFF'} · ${labels[p.reason]||'確認が必要'}${p.expiresAt?' · 有効期限 '+p.expiresAt:''}${p.flagsEnabled&&!p.effective?' · 手動フラグはONです。管理者によるOFF復帰を確認してください。':''}`;if(p.flagsEnabled&&!p.effective){line.setAttribute('role','alert');section.append(line);}else{const d=document.createElement('details'),s=document.createElement('summary');s.textContent='探索の状態';d.append(s,line);section.append(d);}}
 if(data.manualEnabled){const run=document.createElement('button'),result=document.createElement('p');run.type='button';run.textContent='Web探索を1回実行';result.setAttribute('role','status');section.append(run,result);run.addEventListener('click',async()=>{if(!confirm('Web検索とAI分類を1回実行します。費用が発生します。実行しますか？'))return;run.disabled=true;result.textContent='実行中…';try{const session=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});if(!session.ok)throw Error();const {csrf}=await session.json();const response=await fetch('/api/web-discovery/run',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-News-CSRF':csrf},body:'{}'});if(!response.ok)throw Error();const r=await response.json();result.textContent=r.skipped?'既に実行済み、または実行中です。':r.stopped?'単発探索は停止しました（'+r.stopped+'）。再実行せず、手動設定のOFF復帰を確認してください。':'完了（実効許可は使用済み）。手動設定のOFF復帰を確認してください。検索 '+r.searches+'回、AI '+r.ai_calls+'回、分類 '+r.processed+'件、エラー '+r.errors+'件。一覧を更新してください。';}catch{result.textContent='実行結果を確認できません。再実行せず管理者へ確認してください。';}});}
 const archive=document.createElement('details'),as=document.createElement('summary');as.textContent='その他の発見・確認済み記事';archive.append(as);section.append(archive);
 for(const item of diagnosticsOnly?data.items.filter(x=>!x.articleDraft||x.webReview?.queue==='existing'):data.items){
  const card=document.createElement('article'),title=document.createElement('p');title.textContent=item.articleDraft?.fields.label||item.articleDraft?.headline||item.title;card.append(title);
  const u=new URL(item.url);if(u.protocol==='https:'&&!u.username&&!u.password){const link=document.createElement('a');link.href=u.href;link.textContent='原記事';link.target='_blank';link.rel='noopener noreferrer';card.append(link);}
  const source=document.createElement('p');source.textContent=u.hostname+' · 公開日 '+(item.verification?.publishedAt||'未確認');card.append(source);
  const state=document.createElement('p');state.textContent=item.verification?.candidateId?'既存の記事を確認':item.humanEntry?(item.humanEntry.basis==='public_facts_conditions_review'?'原記事・紹介条件の確認が必要です':'原記事で事実を確認して登録できます'):'出典条件・事実の確認が必要です';card.append(state);if(item.articleDraft){const p=document.createElement('p');p.textContent='確認が必要：'+item.articleDraft.missing.map(k=>({publishedAt:'公開日',brand:'主体',product:'対象名',productType:'製品・記事種別',action:'出来事'})[k]||'イベント情報').join('、')+'。AI案は未検証です。';card.append(p);}
  if(item.humanEntry&&!item.verification?.candidateId){const a=document.createElement('a');a.href='/?assistedUrl='+encodeURIComponent(item.humanEntry.url);a.textContent='AI案を確認';card.append(a);}
  const detail=document.createElement('details'),summary=document.createElement('summary');summary.textContent='出典・検索の詳細';detail.append(summary);card.append(detail);
  const lang=document.createElement('p');lang.textContent=item.titleLanguageHint==='japanese_unconfirmed'?'見出しに日本語なし：ページ言語は未確認です':'日本語見出し（推定）：ページ言語を人が要確認';detail.append(lang);
  const original=document.createElement('p');original.textContent='検索の見出し：'+item.title;detail.append(original);
  const meta=item.searchMetadata,trace=document.createElement('p');trace.textContent=meta?`公開日ヒント（未検証）: ${meta.publishedAtHint||'未確認'} · 更新日時ヒント（公開日ではありません）: ${meta.lastModifiedHint||'未確認'} · ページ言語: 未確認 · 検索 ${meta.queryId} / 順位 ${meta.rank}`:'旧ヒント：公開日・検索順位は記録なし';detail.append(trace);
  if(item.humanEntry?.basis==='public_facts_conditions_review'){const p=document.createElement('p');p.textContent='人間確認：客観的事実の独自紹介とリンクの条件を確認します。個別了承済みとは扱いません。Bot取得・本文や原見出しの転載は許可しません。不明点や禁止条件があれば保存せず保留します。';detail.append(p);}
  const v=item.verification;
  if(v){const step=document.createElement('p');step.textContent=`次工程: ${({A:'既存NEWS候補・判断を再利用',B:'既存NEWSの許可済み確認経路',C:'出典条件・事実の確認が必要'})[v.path]||'未確認'} · ${reasons[v.reason]||v.reason} · 操作先: ${v.candidateId?'既存候補の正式確認':v.path==='B'?'通常collectorの許可済み一覧（検索からの強制登録なし）':'運営者による出典・許可範囲の確認'}${v.path==='B'&&'automaticEvidenceEnabled' in v?' · 保存証拠の自動接続 '+(v.automaticEvidenceEnabled?'ON':'OFF'):''}${v.nextAt?' · 次回 '+new Date(v.nextAt).toISOString():''}${v.publishedAt?' · 既存NEWSで確認した公開日 '+v.publishedAt:''}。ヒントから正式登録・公開は行いません。`;detail.append(step);
   const target=v.candidateId?`/?candidate=${encodeURIComponent(v.candidateId)}`:v.listingUrl||v.confirmationUrl;
   if(target){const link=document.createElement('a');link.href=target;link.textContent=v.candidateId?'既存NEWS候補を確認':v.listingUrl?'許可済み一覧を確認':'出典・許可範囲の確認先';link.rel='noopener noreferrer';detail.append(link);}
  }
  const e=item.estimate||{},body=document.createElement('p');body.textContent=`メーカー・製品（推定）: ${e.brand||'不明'} / ${e.product||'不明'} · 関連性: ${e.relevance||'不明'} · 掲載価値: ${e.value||'不明'} · 優先度: ${e.priority||'不明'} · 重複疑い: ${e.duplicate||'未照合'} · ${item.status} · ${item.reason||''} · 検索: ${new Date(item.searched_at).toISOString()} · ${v?.publishedAt?'公開日は既存NEWS側で確認済み':'公開日未確認'}`;detail.append(body);const searched=Number(item.searched_at),recent=Number.isFinite(searched)&&Date.now()-searched<7*86400000;((item.status==='excluded'||item.verification?.candidateId||!recent||item.estimate?.value==='low')?archive:section).append(card);
 }
 for(const search of data.searches||[]){
  const detail=document.createElement('details'),summary=document.createElement('summary');summary.textContent=`検索記録 ${search.query_id} · ${new Date(search.queried_at).toISOString()} · ${search.outcome}`;detail.append(summary);
  const query=document.createElement('p');query.textContent=search.query_text;detail.append(query);
  for(const r of search.results){const row=document.createElement('p');row.textContent=`${r.rank}位 · ${r.url||'非公開URL・無効URL（値は保存しません）'} · ${({saved:'保存',held:'保留',excluded:'AI対象外'})[r.disposition]||r.disposition} · ${r.reason} · 公開日: ${r.publishedAtHint||'未確認'} · 更新日時: ${r.lastModifiedHint||'未確認'}（検索側の未検証値）`;detail.append(row);}
  section.append(detail);
 }
 if(!diagnosticsOnly&&!data.items.length){const p=document.createElement('p');p.textContent='発見候補はまだありません';section.append(p);}return section;
}
// The ordinary review workspace owns presentation; publication remains in assisted-entry.
const reviewReasons={operator_deferred:'見送り中（掲載・非掲載の判断ではありません）',operator_later:'あとで確認',possible_known_event:'掲載済み記事との同一ニュースの疑い。仕様・出来事を確認してください',general_page:'一般ページ・製品一覧の可能性',old_date_hint:'検索側の公開日ヒントが古いため低優先（未検証）',archive_or_old_url_hint:'アーカイブ・URLの古い日付表記。公開日は未確認です',background_or_roundup:'特集・紹介・まとめ記事。新しい出来事の確認が必要です',relevance_unconfirmed:'ギター関連性を確認できません',candidate_takedown:'削除要請により停止',source_prohibited:'出典の明示的な利用条件により停止',source_stopped:'出典の運用停止中',unsafe_url:'安全な原記事URLを確認できません',no_article_draft:'AI記事案なし'};
export function renderWebReviewCard(document,item,{change}={}){
 const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const card=el('article',undefined,'card web-review-card');card.dataset.webUrl=item.url;
 card.append(el('h3',item.articleDraft?.fields?.label||item.articleDraft?.headline||item.title));if(/^(?:signature model|anniversary model|acoustic guitar|guitars?|new series|70s guitar reissue)$/i.test(item.articleDraft?.fields?.product||''))card.append(el('p','検索で見つかった記事：'+item.title,'meta'));
 let hostname='出典未確認';try{hostname=new URL(item.url).hostname;}catch{}
 card.append(el('p',hostname+' · 公開日 '+(item.searchMetadata?.publishedAtHint?'要確認（検索ヒントあり）':'未確認'),'meta'),el('span',item.webReview?.queue==='judgment'?'要判断 · Web記事案':'低優先・保留','status-pill'));
 try{const u=new URL(item.url);if(u.protocol==='https:'&&!u.username&&!u.password){const a=el('a','原記事を開く');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';card.append(a);}}catch{}
 const missing=(item.articleDraft?.missing||[]).map(k=>({publishedAt:'公開日',brand:'主体',product:'対象名',productType:'製品・記事種別',action:'出来事'})[k]||'イベント情報');
 const guidance=item.webReview?.queue==='judgment'?'確認が必要：'+[...new Set([...missing,'原記事の事実','紹介条件'])].join('、')+'。AI案は未確認です。':reviewReasons[item.webReview?.reason]||'原記事と関連性を確認してください。';
 card.append(el('p',guidance,'next-action'));
 const actions=el('div',undefined,'actions');card.append(actions);
 const support=el('section');support.hidden=true;support.append(el('p','この出典は現在の人間確認による正式保存に未対応です。原記事で公開日・出来事と紹介条件を確認してください。確認結果だけで自動登録・公開はしません。','blocker'));card.append(support);
 if(item.webReview?.queue==='judgment'){
  if(item.humanEntry){const a=el('a','記事を確認して判断','button-link');a.href='/?assistedUrl='+encodeURIComponent(item.humanEntry.url);actions.append(a);}
  else{const b=el('button','記事を確認して判断');b.type='button';b.setAttribute('aria-expanded','false');b.addEventListener('click',()=>{support.hidden=!support.hidden;b.setAttribute('aria-expanded',String(!support.hidden));});actions.append(b);}
 }
 if(item.webReview?.candidateId){const a=el('a','既存NEWSを確認');a.href='/?candidate='+encodeURIComponent(item.webReview.candidateId);card.append(a);}
 const status=el('p');status.setAttribute('role','status');card.append(status);
 if(change&&!item.webReview?.blocked&&item.snapshot&&item.articleDraft){
  const choices=item.webReview?.queue==='judgment'?[['defer','見送る'],['later','あとで確認']]:[['review','審査へ戻す']];let pending=null;
  for(const [action,label]of choices){const b=el('button',label);b.type='button';actions.append(b);b.addEventListener('click',async()=>{if(actions.dataset.busy)return;actions.dataset.busy='true';for(const c of actions.children)if(c.tagName?.toLowerCase()==='button')c.disabled=true;
   // Keep one request ID after an uncertain response; never silently retry a write.
   if(!pending||pending.action!==action)pending={url:item.url,action,snapshot:item.snapshot,requestId:crypto.randomUUID()};
   try{await change(pending);status.textContent='Web案の表示を変更しました。掲載判断は行っていません。';}catch(e){status.textContent=e.message||'保存結果を確認できません。一覧を更新してください。';}
   finally{delete actions.dataset.busy;for(const c of actions.children)if(c.tagName?.toLowerCase()==='button')c.disabled=false;}
  });}
 }
 const detail=el('details'),summary=el('summary','記事案・出典の詳細');detail.append(summary,el('p','検索の見出し：'+item.title,'meta'),el('p','公開日ヒント：'+(item.searchMetadata?.publishedAtHint||'未確認')+' · 更新日時：'+(item.searchMetadata?.lastModifiedHint||'未確認')+'（公開日ではありません）','meta'));if(item.articleDraft){for(const [key,value]of Object.entries(item.articleDraft.fields||{})){if(!value||['url','sourceId'].includes(key))continue;const origin=item.articleDraft.fieldSources?.[key];detail.append(el('p',({brand:'ブランド',product:'対象',productType:'種別候補',action:'出来事候補',publishedAt:'公開日候補',label:'独自見出し案',qualifier:'特別仕様・発表の区別'})[key]+'：'+value+'（未確認）'+(origin?.kind?' · '+origin.kind:''),'meta'));}for(const warning of item.articleDraft.warnings||[])detail.append(el('p',warning,'blocker'));}if(item.estimate)detail.append(el('p',item.estimate.reason,'meta'));card.append(detail);return card;
}
if(typeof document!=='undefined'){
 let latest=null,inFlight=null;
 const emit=()=>{if(latest)document.dispatchEvent(new CustomEvent('news-web-review',{detail:{...latest,renderCard:(item)=>renderWebReviewCard(document,item,{change})}}));};
 const load=()=>{if(inFlight)return inFlight;inFlight=fetch('/api/web-discovery',{credentials:'same-origin',cache:'no-store'}).then(async r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
  latest=data;emit();let group=document.getElementById('web-discovery-workspace');if(group)group.remove();
  if(data.enabled){group=document.createElement('details');const summary=document.createElement('summary');group.id='web-discovery-workspace';summary.textContent='Web探索の記録・設定';group.append(summary,renderWebDiscovery(document,data,{diagnosticsOnly:true}));group.open=!!data.manualEnabled||!!data.manualAuthorization?.flagsEnabled;(document.getElementById('operations-detail')||document.querySelector('main')).append(group);}
 }).catch(()=>{document.dispatchEvent(new CustomEvent('news-web-review',{detail:{error:true}}));}).finally(()=>{inFlight=null;});return inFlight;};
 const change=async input=>{const session=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});if(!session.ok)throw Error('認証を確認できません');const {csrf}=await session.json(),r=await fetch('/api/web-hints/review',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-News-CSRF':csrf},body:JSON.stringify(input)});if(!r.ok){const data=await r.json();throw Error(data.error==='candidate_changed'?'記事が更新されました。一覧を更新してください。':'Web案の表示を保存できません。一覧を更新してください。');}await load();};
 document.addEventListener('news-review-ready',emit);document.addEventListener('news-web-refresh',load);load();
}
