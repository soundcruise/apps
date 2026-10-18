import {morrisNoticeFacts} from './morris-editorial-policy.js';
// All classifiers inspect the same bounded primary card. They never fetch,
// infer dates from publication metadata, or make a publication decision.
const normal=v=>v.normalize('NFKC').replace(/[‐‑–−]/g,'-').replace(/\s+/g,' ').trim();
const compact=v=>normal(v).replace(/\s/g,'').toLowerCase();
const contains=(text,value)=>compact(text).includes(compact(value));
const safe=v=>typeof v==='string'&&v.length>=2&&v.length<=70&&!/[<>\x00-\x1f]/.test(v);
const maker=/Morris(?:\s+Guitars)?|モーリス/i;
const makerBound=s=>maker.test(s)&&!/(?:Morris(?:\s+Guitars)?|モーリス)(?:ではない|ではなく|以外)/i.test(s);
const guitar=/アコースティックギター|エレクトリックアコースティックギター|エレアコ|アコギ/;
const acoustic=/アコースティックギター|エレアコ|アコギ|フィンガーピッキング|Finger\s*Picking|弾き語り/i;
const modelsIn=text=>[...new Set(normal(text).match(/\b[A-Z][A-Z0-9]{0,15}-[A-Z0-9][A-Z0-9-]{0,20}\b/g)||[])];
const relational=/対応|接続|保護|比較|アクセサリー|関連製品|旧製品/;
const planned=/予定|計画|検討|予告|近日|公開します|公開いたします/;
const unique=values=>[...new Set(values)];
function oneField(inputs,labels){
 const values=inputs.flatMap(input=>{const m=new RegExp('^(?:'+labels+')\\s*[:：]\\s*([^。；;\\n]{2,90})$').exec(input);return m?[m[1].trim()]:[];});
 const valuesUnique=unique(values);return valuesUnique.length===1&&safe(valuesUnique[0])?valuesUnique[0]:null;
}

// The official Information publisher is the announcer, never an inferred event
// organizer or product manufacturer. Products retain the existing typed schema.
// Every interpretation uses the same in-memory primary response. No parser here
// fetches or persists original sentences or headings.
export function analyzeMorrisAutomaticFacts(rawTitle,blocks,fields,url){
 const legacy=analyzeMorrisFacts(rawTitle,blocks,fields,url),title=normal(rawTitle);
 const sentences=blocks.map(normal).flatMap(p=>p.split(/[。！？\n]/)).map(s=>s.trim()).filter(Boolean);
 const normalizedFields=fields.map(normal),candidates=[];
 const quoted=s=>[...s.matchAll(/[「『]([^」』]{2,60})[」』]/g)].map(m=>m[1]);
 const safeSubject=s=>safe(s)&&s.length<=60&&!/[:：。！？]|^(?:こちら|詳細|お知らせ|新着情報|関連製品)$/.test(s);
 const cleanUnit=s=>!/(?:関連製品|関連記事|比較対象|旧製品|他社製品)|(?:しません|していません|ではありません|取りやめ)/.test(s);
 const noFuture=s=>!/公開予定|掲載予定|公開する予定|後日|近日|来月.*公開|公開を予定/.test(s);
 const strip=s=>s.replace(/^(?:Morris(?: Guitars)?|モーリス)(?:は|が|より|から|の)\s*/i,'').trim().replace(/^「|」$|^『|』$/g,'');
 function subjectFor(units,labels,suffix){
  const explicit=oneField(normalizedFields,labels),inTitle=quoted(title),unquoted=suffix?.exec(title)?.[1];
  const names=unique([...inTitle,...(explicit?[explicit]:[]),...(unquoted?[strip(unquoted)]:[])]).filter(safeSubject);
  // Require the target to be repeated in an action-bearing primary sentence.
  const bound=names.filter(n=>units.some(s=>contains(s,n)));
  return bound.length===1?bound[0]:null;
 }
 const add=(type,hint,pattern,{labels='対象名|名称',suffix=null,extra=()=>({}),filter=()=>true}={})=>{
  const units=sentences.filter(s=>cleanUnit(s)&&pattern.test(s.replace(/[「」『』]/g,''))&&filter(s)&&(!['report','catalog','interview','craftsmanship','artist','maintenance','official_notice'].includes(type)||noFuture(title+' '+blocks.join(' ')))),subject=subjectFor(units,labels,suffix);
  const checks={primary_type:hint,subject:!!subject,subject_action_binding:!!subject&&units.some(s=>contains(s,subject)),publisher:true,unambiguous_action:units.length>0};
  const additional=extra(units.filter(s=>subject&&contains(s,subject)));checks.explicit_fields=additional!==null;
  let input=subject&&additional!==null?{articleType:type,subject,...additional}:null;
  const facts=Object.values(checks).every(Boolean)&&input?morrisNoticeFacts(input,url,{automatic:true}):null;
  candidates.push({type,triggered:hint,eligible:!!facts,checks,missingFields:Object.keys(checks).filter(k=>!checks[k]),reason:facts?'EXPLICIT_BOUND_FACTS':units.length?'NOTICE_SUBJECT_MISSING_OR_UNBOUND':'NOTICE_ACTION_MISSING_OR_NEGATED',facts,eventType:'morris_notice'});
 };
 const pub=units=>({publicationAction:units.some(s=>/更新/.test(s))?'updated':'published'});
 const namedSuffix=action=>new RegExp('^(.+?)(?:の|を|への|についての)?(?:'+action+')(?:の)?(?:お知らせ|ご案内|情報|開始|公開|更新|について|を開始|を公開|しました|します|決定)?[!！。]?$');
 const deadline=()=>{const value=oneField(normalizedFields,'募集締切|応募締切|申込締切|受付締切'),d=dateRange(value);return d&&d.eventDate===d.endDate?{deadline:d.eventDate}:normalizedFields.some(v=>/^(?:募集締切|応募締切|申込締切|受付締切)[:：]/.test(v))?null:{};};
 const eventDetails=units=>{const dateInputs=normalizedFields.filter(v=>/^(?:開催日|開催日時|日程)[:：]/.test(v)),venueInputs=normalizedFields.filter(v=>/^会場[:：]/.test(v));
  const dateValue=oneField(dateInputs,'開催日|開催日時|日程'),venueValue=oneField(venueInputs,'会場');
  const proseDates=unique(units.flatMap(s=>[...s.matchAll(/20\d{2}年\s*\d{1,2}月\s*\d{1,2}日(?:\s*[~〜～－-]\s*(?:20\d{2}年)?\s*(?:\d{1,2}月)?\s*\d{1,2}日)?/g)].map(m=>m[0]))),proseVenues=unique(units.flatMap(s=>[...s.matchAll(/会場(?:は|[:：])?\s*「([^」]{2,60})」/g)].map(m=>m[1])));
  const d=dateRange(dateValue||proseDates[0]),venue=venueValue||proseVenues[0];
  if(dateInputs.length&&!dateRange(dateValue)||venueInputs.length&&!venueValue||proseDates.some(v=>{const p=dateRange(v);return !p||!d||p.eventDate!==d.eventDate||p.endDate!==d.endDate;})||proseVenues.some(v=>v!==venue))return null;
  return {...(d||{}),...(venue?{venue}:{})};
 };
 add('recruitment',/募集|応募|エントリー/.test(title),/(?:参加者|出場者|出演者|応募者|参加|出場)?募集(?:を)?(?:開始|受付|中)|(?:応募|エントリー|参加)(?:の)?受付(?:を)?(?:開始|中)|参加者を募集/,{labels:'募集対象|大会名|イベント名|コンテスト名',suffix:namedSuffix('参加者募集|出場者募集|募集|応募受付|エントリー受付'),extra:deadline,filter:s=>!/募集終了|受付終了|募集を終了|受付を終了|締め切りました|募集予定|募集を予定/.test(s)});
 add('competition',/コンテスト|コンペティション|予選/.test(title),/応募要項(?:を)?(?:公開|更新)|審査結果(?:を)?発表|コンテスト情報(?:を)?(?:公開|案内)/,{labels:'大会名|コンテスト名',suffix:namedSuffix('応募要項|審査結果|コンテスト情報'),filter:noFuture});
 add('exhibition',/出展/.test(title),/出展(?:いたします|します|予定|を予定)|出展が決定/,{labels:'イベント名|催事名',suffix:namedSuffix('出展'),extra:eventDetails});
 add('event_announcement',/開催|診断会|ワークショップ|公演/.test(title)&&!/レポート|報告|募集/.test(title),/開催(?:いたします|します|を予定)|開催が決定/,{labels:'イベント名|催事名|公演名',suffix:namedSuffix('開催|開催案内'),extra:eventDetails});
 add('report',/レポート|活動報告|開催報告/.test(title),/(?:レポート|活動報告|開催報告)(?:を)?(?:公開|掲載|お届け|紹介)|開催を振り返/,{labels:'イベント名|活動名|レポート対象',suffix:namedSuffix('開催レポート|イベントレポート|レポート|活動報告|開催報告'),extra:pub,filter:noFuture});
 add('catalog',/カタログ|資料/.test(title),/(?:カタログ|資料)(?:を)?(?:公開|更新|掲載)|公開(?:した|しました|いたしました).*(?:カタログ|資料)/,{labels:'カタログ名|資料名',suffix:namedSuffix('公開|更新'),extra:pub,filter:noFuture});
 add('interview',/インタビュー/.test(title),/インタビュー(?:を)?(?:公開|掲載|紹介)|インタビュー記事(?:を)?(?:公開|掲載)/,{labels:'演奏者|ギタリスト|インタビュー対象',suffix:namedSuffix('インタビュー'),extra:pub,filter:noFuture});
 add('artist',/活動情報|演奏活動|アーティスト情報/.test(title),/(?:活動情報|演奏活動|アーティスト情報)(?:を)?(?:紹介|公開|掲載)/,{labels:'演奏者|ギタリスト|アーティスト名',suffix:namedSuffix('活動情報|演奏活動|アーティスト情報'),extra:pub,filter:noFuture});
 add('craftsmanship',/製作|製造|工房/.test(title),/(?:ギター|製作|製造|工房|工程).*(?:紹介|解説|公開)/,{labels:'製作対象|工程名',suffix:namedSuffix('紹介|解説|公開'),extra:pub,filter:noFuture});
 add('maintenance',/メンテナンス|お手入れ/.test(title),/(?:メンテナンス|お手入れ).*(?:紹介|解説|公開)/,{labels:'対象サービス|対象名',suffix:namedSuffix('紹介|解説|公開'),filter:noFuture});
 const serviceAction=units=>{const joined=units.join(' '),actions=[[/受付(?:を)?(?:停止|休止)/,'intake_stopped'],[/受付(?:を)?(?:再開)/,'intake_resumed'],[/サービス(?:を)?開始/,'service_started'],[/条件(?:を)?変更/,'conditions_changed']].filter(([p])=>p.test(joined));return actions.length===1?{serviceAction:actions[0][1]}:{};};
 add('service',/修理|サービス|受付/.test(title),/受付(?:を)?(?:停止|休止|再開)(?:しました|いたしました|します|いたします)|サービス(?:を)?開始(?:しました|します)|条件(?:を)?変更(?:しました|します)/,{labels:'対象サービス|サービス名',suffix:namedSuffix('受付停止|受付休止|受付再開|サービス開始|条件変更'),extra:serviceAction,filter:s=>Object.keys(serviceAction([s])).length===1});
 add('official_notice',/お知らせ/.test(title),/お知らせ(?:を)?(?:公開|更新|掲載)/,{labels:'対象名|告知対象',suffix:namedSuffix('についてのお知らせ|のお知らせ|お知らせ'),extra:pub,filter:noFuture});
 const titleModels=modelsIn(title),fieldModel=oneField(normalizedFields,'製品名|モデル名|型番'),model=titleModels.length===1?titleModels[0]:null;
 const typed=oneField(normalizedFields,'製品種別|製品タイプ'),manufacturer=oneField(normalizedFields,'メーカー|製造元');
 const productUnits=sentences.filter(s=>model&&contains(s,model)&&cleanUnit(s)&&!relational.test(s)&&!/予定|計画|比較/.test(s));
 const modelTyped=productUnits.some(s=>guitar.test(s)&&new RegExp('(?:アコースティックギター|エレアコ|アコギ)[のシグネチャーモデル限定新色\\s「『]*'+model+'(?:[」』\\s、はをの]|$)').test(s))||['アコースティックギター','エレアコ'].includes(typed)&&fieldModel===model;
 const makerExplicit=productUnits.some(makerBound)||/^(?:Morris(?: Guitars)?|モーリス)$/i.test(manufacturer||'');
 const actions=unique(productUnits.flatMap(s=>/発売(?:が)?決定/.test(s)?['release_decided']:/発売(?:しました|いたしました|開始)|販売(?:を)?開始/.test(s)?['release']:/発表(?:しました|いたしました)|新製品として登場/.test(s)?['new_product']:[]));
 const qualifier=[[/シグネチャー(?:モデル)?/,'signature'],[/限定モデル/,'limited_edition'],[/新色/,'new_color']].filter(([p])=>p.test(title)&&productUnits.some(s=>p.test(s)));
 const checks={model:!!model,typed_model_binding:modelTyped,manufacturer:makerExplicit,product_action:actions.length===1,unambiguous_identity:(!fieldModel||fieldModel===model)&&modelsIn(blocks.join(' ')).every(m=>m===model),qualifier_binding:qualifier.length<=1&&![/シグネチャー(?:モデル)?/,/限定モデル/,/新色/].some(p=>p.test(title)!==productUnits.some(s=>p.test(s))),context:!legacy.analysis.excluded&&!relational.test(title)&&!/過去|昨年|旧製品/.test(title+' '+blocks.join(' '))&&!/予約|再入荷|セール|比較|レビュー/.test(title)};
 const action=actions[0],eventType=action==='release'?'release':'new_product',pf=Object.values(checks).every(Boolean)?{evidence:'morris_explicit_article_v1',listingSource:'morris',articleUrl:url,kind:'product',category:'acoustic_guitar',brand:'Morris Guitars',product:model,models:[model],productType:'acoustic_guitar',action:eventType,...(action==='release_decided'?{announcement:'release_decided'}:{}),...(qualifier.length?{productEvent:{action:qualifier[0][1]}}:{})}:null;
 candidates.push({type:qualifier[0]?.[1]==='signature'?'signature_model':eventType==='release'?'product_release':'product_announcement',triggered:!!model,eligible:!!pf,checks,missingFields:Object.keys(checks).filter(k=>!checks[k]),reason:pf?'EXPLICIT_BOUND_FACTS':'PRODUCT_FACTS_MISSING_OR_UNBOUND',facts:pf,eventType});
 if(/中止|延期|取りやめ/.test(title+' '+blocks.join(' ')))for(const c of candidates)if(!['report','service'].includes(c.type)){c.eligible=false;c.facts=null;}
 const eligible=candidates.filter(c=>c.eligible);
 // Retain the established product/event/editorial representation when both
 // analyses describe the same primary action. Different actions remain a hold.
 const group=f=>f?.kind==='product'?(f.productEvent?.action==='signature'?'signature_model':f.action==='release'?'product_release':'product_announcement'):f?.kind==='guitar_event'?({exhibition:'exhibition',competition:'recruitment'}[f.eventType]||'event_announcement'):f?.kind==='morris_editorial'?({event_report:'report',support:'maintenance',support_notice:'service',artist_activity:'artist'}[f.articleType]||f.articleType):f?.articleType;
 const productConflict=!!model&&(fieldModel&&fieldModel!==model||manufacturer&&!/^(?:Morris(?: Guitars)?|モーリス)$/i.test(manufacturer)||typed&&!['アコースティックギター','エレアコ'].includes(typed));
 const types=unique([...(legacy.facts?[group(legacy.facts)]:[]),...eligible.map(c=>c.type)]),selected=!productConflict&&types.length===1?(legacy.facts?{facts:legacy.facts,eventType:legacy.eventType}:eligible[0]):null;
 const analysis={...legacy.analysis,version:'morris-recovery-3',subjectBound:!!selected,actionExplicit:!!selected,articleType:selected?group(selected.facts):'unresolved',selected:selected?'generic':'none',result:selected?'recovered':'hold',reason:selected?'EXPLICIT_BOUND_FACTS':productConflict?'CONTRADICTORY_PRODUCT_FIELDS':types.length>1?'AMBIGUOUS_ARTICLE_TYPES':'NO_COMPLETE_ARTICLE_TYPE',candidates:[...legacy.analysis.candidates,...candidates.filter(c=>c.triggered).map(({facts,eventType,...c})=>c)],evaluatedTypes:unique([...legacy.analysis.evaluatedTypes,...candidates.map(c=>c.type)])};
 return {facts:selected?.facts||null,eventType:selected?.eventType||'other',analysis};
}
function dateRange(value){
 const m=/^(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日(?:[（(][^）)]{0,5}[）)])?(?:\s*[~〜～－-]\s*(?:(20\d{2})年)?\s*(?:(\d{1,2})月)?\s*(\d{1,2})日)?(?:[（(][^）)]{0,5}[）)])?$/.exec(value||'');
 if(!m)return null;
 const iso=(y,mo,d)=>`${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
 const start=iso(m[1],m[2],m[3]),end=iso(m[4]||m[1],m[5]||m[2],m[6]||m[3]);
 const valid=d=>Number.isFinite(Date.parse(d+'T00:00:00Z'))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
 return valid(start)&&valid(end)&&end>=start?{eventDate:start,endDate:end}:null;
}
function boundSubject(title,sentences,fields,labels,suffix){
 const names=[...title.matchAll(/「([^」]{2,70})」/g)].map(m=>m[1]);
 const explicit=oneField(fields,labels);if(explicit&&contains(title,explicit))names.push(explicit);
 // A nonquoted name must be repeated in primary prose, not just guessed from a heading.
 const unquoted=suffix&&suffix.exec(title);if(unquoted)names.push(unquoted[1].trim().replace(/^「|」$/g,''));
 const bound=unique(names.filter(n=>safe(n)&&sentences.some(s=>contains(s,n))));
 return bound.length===1?bound[0]:null;
}
export function analyzeMorrisFacts(rawTitle,paragraphs,fields,url){
 const title=normal(rawTitle),paras=paragraphs.map(normal),inputs=[...fields.map(normal),...paras];
 const sentences=paras.flatMap(p=>p.split(/[。！？]/)).map(s=>s.trim()).filter(Boolean),lead=paras.join(' '),all=title+' '+lead;
 const base={evidence:'morris_explicit_article_v1',listingSource:'morris',articleUrl:url};
 const candidates=[];
 const candidate=(type,triggered,checks,facts,eventType,reason)=>{
  const missingFields=Object.keys(checks).filter(k=>!checks[k]);
  const eligible=triggered&&!missingFields.length&&!!facts;
  candidates.push({type,triggered,eligible,checks,missingFields,reason:eligible?'EXPLICIT_BOUND_FACTS':reason,facts:eligible?facts:null,eventType});
 };
 const excluded=/中止|延期|昨年|過去|比較|レビュー|再入荷|セール/.test(all);
 const clean=s=>!relational.test(s)&&!/ではない|ではなく|旧製品|過去|昨年|予定|計画|検討/.test(s);
 // Product identity and action must coexist in a primary sentence. Reservations
 // and incidental event wording cannot supply a release/announcement action.
 const titleModels=modelsIn(title),model=titleModels.length===1?titleModels[0]:null;
 const primary=sentences.filter(s=>model&&contains(s,model)&&clean(s)&&makerBound(s)&&guitar.test(s)&&
  /(?:Morris(?:\s+Guitars)?|モーリス)(?:の|から|より|は|が)\s*(?:アコースティックギター|エレクトリックアコースティックギター|エレアコ|アコギ)/i.test(s)&&
  (new RegExp('(?:アコースティックギター|エレクトリックアコースティックギター|エレアコ|アコギ)[\\s「]*'+model+'(?:[」\\s、はをの]|$)').test(s)||
   new RegExp('「?'+model+'」?は.{0,12}(?:アコースティックギター|エレアコ|アコギ)').test(s)));
 const productActions=unique(primary.flatMap(s=>/発売(?:が)?決定/.test(s)?['release_decided']:
  /発売しました|発売いたしました|発売開始|販売を開始/.test(s)?['release']:
  /発表しました|発表いたしました|新モデル.{0,15}登場|新製品.{0,15}登場/.test(s)?['new_product']:[]));
 const productText=primary.join(' '),qualifiers=[[/限定モデル/,'limited_edition'],[/シグネチャー(?:モデル)?/,'signature'],[/新色/,'new_color']];
 const q=qualifiers.filter(([p])=>p.test(title)&&p.test(productText));
 const productChecks={model:!!model,typed_model_binding:!!primary.length,manufacturer:!!primary.length,
  product_action:productActions.length===1,unambiguous_identity:!!model&&modelsIn(lead).every(m=>m===model),
  qualifier_binding:q.length<=1&&!qualifiers.some(([p])=>p.test(title)!==p.test(productText)),context:!excluded};
 const action=productActions[0],productEventType=action==='release'?'release':'new_product';
 const productFacts={...base,kind:'product',category:'acoustic_guitar',brand:'Morris Guitars',product:model,models:model?[model]:[],productType:'acoustic_guitar',action:productEventType,
  ...(action==='release_decided'?{announcement:'release_decided'}:{}),...(q.length===1?{productEvent:{action:q[0][1]}}:{})};
 for(const [type,active]of [['product_announcement',action!=='release'&&!/シグネチャー/.test(title)],['product_release',action==='release'&&!/シグネチャー/.test(title)],['signature_model',/シグネチャー/.test(title)]])
  candidate(type,active&&(!!model||/新製品|新モデル|発売|発表|シグネチャー/.test(title)),productChecks,productFacts,productEventType,'PRODUCT_FACTS_MISSING_OR_UNBOUND');
 // Event, recruitment and reporting are separate candidates. Event words in
 // another sentence never suppress product, service, report or catalog checks.
 const eventName=boundSubject(title,sentences,inputs,'イベント名|大会名|催事名',/^(.+?)(?:への出展|の参加募集|の応募受付|の開催レポート|開催レポート|を開催)/);
 const eventSentences=sentences.filter(s=>eventName&&contains(s,eventName));
 const dateFields=inputs.filter(v=>/^(?:開催日|開催日時|開催日程|日程)\s*[:：]/.test(v));
 const proseDates=unique(eventSentences.flatMap(s=>[...s.matchAll(/20\d{2}年\s*\d{1,2}月\s*\d{1,2}日(?:\s*[~〜～－-]\s*(?:20\d{2}年)?\s*(?:\d{1,2}月)?\s*\d{1,2}日)?/g)].map(m=>m[0])));
 const dates=dateFields.length?dateRange(oneField(inputs,'開催日|開催日時|開催日程|日程')):proseDates.length===1?dateRange(proseDates[0]):null;
 const venueFields=inputs.filter(v=>/^会場\s*[:：]/.test(v));
 const proseVenues=unique(eventSentences.flatMap(s=>[...s.matchAll(/会場(?:は|[:：])?\s*「([^」]{2,70})」/g)].map(m=>m[1])));
 const venue=venueFields.length?oneField(inputs,'会場'):proseVenues.length===1?proseVenues[0]:null,performer=oneField(inputs,'出演|出演者');
 const eventContext=eventSentences.some(s=>makerBound(s)||acoustic.test(s));
 const otherEventNames=unique(eventSentences.flatMap(s=>[...s.matchAll(/「([^」]{2,70})」/g)].map(m=>m[1]))).filter(n=>n!==eventName&&n!==venue&&n!==performer);
 const common={consistent_event_dates:!dates||proseDates.every(v=>{const d=dateRange(v);return d&&d.eventDate===dates.eventDate&&d.endDate===dates.endDate;}),consistent_venue:!venue||proseVenues.every(v=>v===venue),unambiguous_event:otherEventNames.length===0,event_name:!!eventName,event_date:!!dates,venue:!!venue,subject_binding:eventContext,context:!excluded};
 const exhibition=eventSentences.some(s=>makerBound(s)&&/出展(?:いたします|します|予定)/.test(s));
 const recruitment=eventSentences.some(s=>/参加(?:者)?募集|エントリー受付|応募受付/.test(s)&&/開始|募集|受付中/.test(s));
 const hosting=eventSentences.some(s=>makerBound(s)&&acoustic.test(s)&&/(?:診断会|ワークショップ)/.test(s)&&/開催(?:します|いたします|予定)/.test(s));
 const performance=!!performer&&eventSentences.some(s=>contains(s,performer)&&acoustic.test(s)&&/出演(?:します|予定)|開催(?:します|予定)/.test(s));
 const eventFacts=(type,eventAction,extra={})=>({...base,kind:'guitar_event',category:'live_guitar',eventName,event:eventName,venue,...dates,eventType:type,action:eventAction,...extra});
 candidate('event_exhibition',/出展/.test(title),{...common,event_action:exhibition},eventFacts('exhibition','exhibiting',{exhibitor:'Morris Guitars'}),'guitar_event','EVENT_FIELDS_MISSING_OR_UNBOUND');
 candidate('recruitment_announcement',/募集|応募|エントリー/.test(title),{...common,event_action:recruitment,competition:/コンテスト|コンペティション|予選/.test(title+' '+eventSentences.join(' '))},eventFacts('competition','entry_open'),'guitar_event','RECRUITMENT_FIELDS_MISSING_OR_UNBOUND');
 candidate('event_announcement',/出演|開催|公演|診断会/.test(title)&&!/レポート/.test(title),{...common,event_action:performance||hosting,performer:hosting||!!performer},hosting?eventFacts('workshop','scheduled',{organizer:'Morris Guitars'}):eventFacts('performance','scheduled',{performer}),'guitar_event','EVENT_FIELDS_MISSING_OR_UNBOUND');
 const editorial=(articleType,extra={})=>({...base,kind:'morris_editorial',articleType,action:'information',category:articleType==='artist_activity'?'artist_guitar':'media_other',relevance:'acoustic_guitar',...extra});
 const editorialChecks=bound=>({subject_binding:bound,manufacturer:maker.test(lead),acoustic_context:acoustic.test(all),context:!excluded&&!planned.test(all)});
 const reportBound=!!eventName&&eventSentences.some(s=>makerBound(s)&&/開催レポート|開催を振り返/.test(s));
 candidate('event_report',/開催レポート/.test(title),editorialChecks(reportBound),editorial('event_report',{subject:eventName}),'morris_editorial','REPORT_SUBJECT_OR_ACTION_MISSING');
 for(const [type,topic,titlePattern,bodyPattern,actionPattern]of [
  ['craftsmanship','guitar_making',/ギター.{0,12}(?:製作|製造)(?:工程|過程)/,/アコースティックギター.{0,30}(?:製作|製造)(?:工程|過程)/,/紹介|解説|公開/],
  ['feature','guitar_structure',/ギター.{0,12}構造/,/アコースティックギター.{0,30}構造/,/解説/],
  ['support','guitar_maintenance',/ギター.{0,12}メンテナンス/,/アコースティックギター.{0,30}メンテナンス/,/解説/]
 ])candidate(type,titlePattern.test(title),editorialChecks(sentences.some(s=>makerBound(s)&&bodyPattern.test(s)&&actionPattern.test(s))),editorial(type,{topic}),'morris_editorial','EDITORIAL_SUBJECT_OR_ACTION_MISSING');
 const catalog=boundSubject(title,sentences,inputs,'カタログ名',/^(.+?(?:ギター)?カタログ)(?:を公開|公開|の公開)/);
 const catalogBound=!!catalog&&sentences.some(s=>contains(s,catalog)&&makerBound(s)&&/ギターカタログ/.test(s)&&/公開(?:しました|いたしました|中)?/.test(s));
 candidate('catalog',/カタログ/.test(title),editorialChecks(catalogBound),editorial('catalog',{subject:catalog}),'morris_editorial','CATALOG_SUBJECT_OR_ACTION_MISSING');
 const artist=boundSubject(title,sentences,inputs,'演奏者|ギタリスト',null);
 candidate('artist_activity',/演奏活動/.test(title),editorialChecks(!!artist&&contains(title,artist)&&sentences.some(s=>contains(s,artist)&&makerBound(s)&&/演奏活動.{0,15}紹介/.test(s))),editorial('artist_activity',{subject:artist}),'morris_editorial','ARTIST_SUBJECT_OR_ACTION_MISSING');
 // A service notice has its own bounded action, never an event with guessed dates.
 const servicePatterns=[['guitar_finish_repair',/塗装を伴う修理\s*受付.{0,5}(?:停止|休止)/],['guitar_repair',/アコースティックギター(?:の)?修理\s*受付.{0,5}(?:停止|休止)/]];
 const services=servicePatterns.filter(([,pattern])=>pattern.test(title)&&sentences.some(s=>makerBound(s)&&acoustic.test(s)&&pattern.test(s)));
 const service=services.length===1?services[0][0]:null;
 candidate('support_notice',/修理.{0,20}受付.{0,5}(?:停止|休止)/.test(title),{...editorialChecks(!!service),service:!!service},editorial('support_notice',{topic:service,serviceAction:'intake_stopped'}),'morris_editorial','SERVICE_SUBJECT_OR_ACTION_MISSING');
 const eligible=candidates.filter(c=>c.eligible),triggered=candidates.filter(c=>c.triggered);
 // Different complete factual interpretations are ambiguous: do not choose by
 // keyword order, score or arbitrary classifier priority.
 const selected=eligible.length===1?eligible[0]:null;
 const reason=selected?'EXPLICIT_BOUND_FACTS':eligible.length>1?'AMBIGUOUS_ARTICLE_TYPES':triggered.length===1?triggered[0].reason:triggered.length?'NO_COMPLETE_ARTICLE_TYPE':'NO_SUPPORTED_EXPLICIT_FACTS';
 const diagnostics=candidates.map(({type,triggered,eligible,checks,missingFields,reason})=>({type,triggered,eligible,checks,missingFields:triggered?missingFields:[],reason:triggered?reason:'NOT_TRIGGERED'}));
 return {facts:selected?.facts||null,eventType:selected?.eventType||'other',analysis:{version:'morris-recovery-2',selected:selected?'generic':'none',
  manufacturerExplicit:maker.test(lead),acousticExplicit:acoustic.test(all),modelCount:titleModels.length,typedIdentity:!!primary.length,
  eventSignal:triggered.some(c=>['event_exhibition','event_announcement','recruitment_announcement'].includes(c.type)),eventNameExplicit:!!eventName,eventDateExplicit:!!dates,venueExplicit:!!venue,
  subjectBound:!!selected,actionExplicit:!!selected,articleType:selected?.type||'unresolved',result:selected?'recovered':'hold',reason,excluded,evaluatedTypes:candidates.map(c=>c.type),candidates:diagnostics.filter(c=>c.triggered)}};
}
