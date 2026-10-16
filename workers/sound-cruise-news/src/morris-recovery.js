// Deterministic secondary analysis of the SAME verified card/article input.
// No I/O, article-name table, source-text persistence or publication decision.
const normalize=v=>v.normalize('NFKC').replace(/\s+/g,'').toLowerCase();
const safe=v=>typeof v==='string'&&v.length>=2&&v.length<=70&&!/[<>\x00-\x1f]/.test(v);
const contains=(text,value)=>normalize(text).includes(normalize(value));
const acoustic=/アコースティックギター|エレクトリックアコースティックギター|エレアコ|アコギ/;
const maker=/Morris(?:\s+Guitars)?|モーリス/i;
const eventWords=/イベント|コンサート|コンテスト|コンペティション|診断会|ワークショップ|展示会|出展|出演|開催|募集|受付|予選/;
const future=/予定|計画|検討|予告|近日|公開します|開催します|開催いたします|参加募集|エントリー|出展します|発売/;
const modelsIn=text=>[...new Set(text.match(/\b[A-Z][A-Z0-9]{0,15}-[A-Z0-9][A-Z0-9-]{0,20}\b/g)||[])];
function oneField(inputs,labels){
 const values=inputs.flatMap(input=>{const m=new RegExp('^(?:'+labels+')\\s*[:：]\\s*([^。；;\\n]{2,90})$').exec(input.trim());return m?[m[1].trim()]:[];});
 const unique=[...new Set(values)];return unique.length===1&&safe(unique[0])?unique[0]:null;
}
function dateRange(value){
 const m=/^(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日(?:[（(][^）)]{0,5}[）)])?(?:\s*[〜～－-]\s*(?:(20\d{2})年)?\s*(?:(\d{1,2})月)?\s*(\d{1,2})日)?$/.exec(value||'');
 if(!m)return null;
 const iso=(y,mo,d)=>`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
 const start=iso(m[1],m[2],m[3]),end=iso(m[4]||m[1],m[5]||m[2],m[6]||m[3]);
 const valid=d=>Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 return valid(start)&&valid(end)&&end>=start?{eventDate:start,endDate:end}:null;
}
function subjectIn(title,lead,fields,labels){
 const names=[...title.matchAll(/「([^」]{2,70})」/g)].map(m=>m[1]).filter(n=>contains(lead,n));
 const explicit=oneField(fields,labels);if(explicit&&contains(title,explicit))names.push(explicit);
 const unique=[...new Set(names)];return unique.length===1&&safe(unique[0])?unique[0]:null;
}
export function analyzeMorrisFacts(title,paragraphs,fields,url){
 const lead=paragraphs.join(' '),all=title+' '+lead,inputs=[...fields,...paragraphs];
 const analysis={version:'morris-recovery-1',manufacturerExplicit:maker.test(lead),acousticExplicit:acoustic.test(all),
  modelCount:modelsIn(title).length,typedIdentity:false,eventSignal:eventWords.test(all),eventNameExplicit:false,
  eventDateExplicit:false,venueExplicit:false,subjectBound:false,actionExplicit:false,articleType:'unresolved',
  result:'hold',reason:'NO_SUPPORTED_EXPLICIT_FACTS'};
 const finish=(facts,eventType,reason)=>({facts,eventType,analysis:{...analysis,articleType:facts?.articleType||(facts?.kind==='product'?'product_announcement':facts?.kind==='guitar_event'?'event_announcement':'unresolved'),result:facts?'recovered':'hold',reason}});
 const hold=reason=>finish(null,'other',reason);
 // A statement about another/old/canceled product must not become a new event.
 if(/中止|延期|昨年|過去|比較|レビュー|再入荷|セール|対応機器|接続対象|保護対象/.test(all))return hold('EXCLUDED_OR_RELATIONAL_CONTEXT');
 const base={evidence:'morris_explicit_article_v1',listingSource:'morris',articleUrl:url};
 const model=modelsIn(title).length===1?modelsIn(title)[0]:null;
 if(model){
  const sentences=paragraphs.flatMap(p=>p.split(/[。！？]/)).filter(s=>contains(s,model));
  const primary=sentences.filter(s=>maker.test(s)&&acoustic.test(s)&&
   /(?:Morris(?:\s+Guitars)?|モーリス)(?:の|から|より|は|が)\s*(?:アコースティックギター|エレアコ|アコギ)/i.test(s)&&
   (new RegExp('(?:アコースティックギター|エレアコ|アコギ)[\\s「]*'+model+'(?:[」\\s、はをの]|$)').test(s)||
    new RegExp('[「]?'+model+'[」]?は(?:[^。]{0,12})(?:アコースティックギター|エレアコ|アコギ)').test(s))&&
   !/対応|接続|保護|比較|アクセサリー|カタログ|関連製品|旧製品/.test(s));
  analysis.typedIdentity=primary.length>0;analysis.subjectBound=primary.length>0;
  const actions=new Set(primary.flatMap(s=>{
   const f=/発売予定|発売いたします|発売します|近日発売|発売決定|発売が決定/.test(s);
   if(/発売(?:が)?決定/.test(s))return ['release_decided'];
   if(!f&&/発売しました|発売いたしました|発売開始|販売を開始/.test(s))return ['release'];
   if(!f&&/発表しました|発表いたしました|新モデル.{0,15}登場|新製品.{0,15}登場/.test(s))return ['new_product'];
   return [];
  }));
  analysis.actionExplicit=actions.size===1;
  if(primary.length&&actions.size===1&&modelsIn(lead).every(m=>m===model)){
   const action=[...actions][0],text=primary.join(' '),qualifiers=[[/限定モデル/,'limited_edition'],[/シグネチャーモデル/,'signature'],[/新色/,'new_color']].filter(([p])=>p.test(title)&&p.test(text));
   if(qualifiers.length>1||[/限定モデル/,/シグネチャーモデル/,/新色/].some(p=>p.test(title)!==p.test(text)))return hold('AMBIGUOUS_PRODUCT_EVENT');
   const eventType=action==='release'?'release':'new_product';
   return finish({...base,kind:'product',category:'acoustic_guitar',brand:'Morris Guitars',product:model,models:[model],productType:'acoustic_guitar',action:eventType,
    ...(action==='release_decided'?{announcement:'release_decided'}:{}),...(qualifiers.length?{productEvent:{action:qualifiers[0][1]}}:{})},eventType,'EXPLICIT_TYPED_PRODUCT_ACTION');
  }
  // An ambiguous product is never converted into an editorial introduction.
  return hold(primary.length?'PRODUCT_ACTION_MISSING_OR_CONFLICTING':'PRIMARY_PRODUCT_BINDING_MISSING');
 }
 const eventName=subjectIn(title,lead,inputs,'イベント名|大会名|催事名'),dates=dateRange(oneField(inputs,'開催日|開催日時|開催日程|日程')),
  venue=oneField(inputs,'会場'),performer=oneField(inputs,'出演|出演者');
 analysis.eventNameExplicit=!!eventName;analysis.eventDateExplicit=!!dates;analysis.venueExplicit=!!venue;
 if(analysis.eventSignal&&!/開催レポート/.test(title)){
  const exhibition=/出展/.test(title)&&paragraphs.some(p=>eventName&&contains(p,eventName)&&maker.test(p)&&/出展(?:いたします|します|予定)/.test(p));
  const contest=/コンテスト|コンペティション/.test(title)&&paragraphs.some(p=>eventName&&contains(p,eventName)&&/参加(?:者)?募集|エントリー受付/.test(p));
  const performance=!!performer&&paragraphs.some(p=>eventName&&contains(p,eventName)&&contains(p,performer)&&/出演(?:します|予定)/.test(p)&&/アコースティック|フィンガーピッキング|弾き語り/.test(p));
  analysis.subjectBound=!!eventName;analysis.actionExplicit=[exhibition,contest,performance].filter(Boolean).length===1;
  if(eventName&&dates&&venue&&analysis.manufacturerExplicit&&analysis.actionExplicit)return finish({...base,kind:'guitar_event',category:'live_guitar',eventName,event:eventName,venue,...dates,
   eventType:exhibition?'exhibition':contest?'competition':'performance',action:exhibition?'exhibiting':contest?'entry_open':'scheduled',
   ...(exhibition?{exhibitor:'Morris Guitars'}:performance?{performer}:{})},'guitar_event','EXPLICIT_BOUND_EVENT_FIELDS');
  return hold('EVENT_FIELDS_MISSING_OR_UNBOUND');
 }
 if(!analysis.manufacturerExplicit||!analysis.acousticExplicit)return hold('EDITORIAL_CONTEXT_MISSING');
 if(future.test(all))return hold('EDITORIAL_FUTURE_OR_EVENT_WORDING');
 let articleType,topic,subject;
 const report=subjectIn(title,lead,inputs,'イベント名|大会名');
 if(report&&/開催レポート/.test(title)&&/開催レポート|開催を振り返/.test(lead)){articleType='event_report';subject=report;}
 else if(eventWords.test(all))return hold('EVENT_NOT_EDITORIAL');
 else if(/ギター.{0,12}(?:製作|製造)(?:工程|過程)/.test(title)&&/アコースティックギター.{0,30}(?:製作|製造)(?:工程|過程)/.test(lead)&&/紹介|解説|公開/.test(lead)){articleType='craftsmanship';topic='guitar_making';}
 else if(/ギター.{0,12}構造/.test(title)&&/アコースティックギター.{0,30}構造/.test(lead)&&/解説/.test(lead)){articleType='feature';topic='guitar_structure';}
 else if(/ギター.{0,12}メンテナンス/.test(title)&&/アコースティックギター.{0,30}メンテナンス/.test(lead)&&/解説/.test(lead)){articleType='support';topic='guitar_maintenance';}
 else {
  const catalog=subjectIn(title,lead,inputs,'カタログ名'),artist=oneField(inputs,'演奏者|ギタリスト');
  if(catalog&&/ギターカタログ/.test(title)&&/ギターカタログ.{0,90}公開/.test(lead)){articleType='catalog';subject=catalog;}
  else if(artist&&contains(title,artist)&&paragraphs.some(p=>contains(p,artist)&&/演奏活動/.test(p)&&/紹介/.test(p)&&acoustic.test(p))){articleType='artist_activity';subject=artist;}
 }
 if(!articleType)return hold('EDITORIAL_TYPE_OR_ACTION_MISSING');
 analysis.subjectBound=true;analysis.actionExplicit=true;
 return finish({...base,kind:'morris_editorial',articleType,action:'information',category:articleType==='artist_activity'?'artist_guitar':'media_other',relevance:'acoustic_guitar',...(topic?{topic}:{}),...(subject?{subject}:{})},'morris_editorial','EXPLICIT_EDITORIAL_SUBJECT_ACTION');
}
