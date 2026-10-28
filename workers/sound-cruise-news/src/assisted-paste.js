import {resolveProductType,typeEvidence} from './assisted-product-type.js';
import {assistedUrl,assistedTypes,assistedActions} from './assisted-facts.js';

export const YAMAHA_TOPICS_START='https://jp.yamaha.com/musical-instruments/guitars-basses-amps/explore/topics/index.html';
const names={publishedAt:'記事公開日',brand:'ブランド・主催者・人物',product:'製品・イベント等の対象名',productType:'製品・記事種別',action:'出来事',eventDate:'開催日',venue:'会場'};
const dates=/20\d{2}(?:年\s*\d{1,2}月\s*\d{1,2}日|[-/]\d{1,2}[-/]\d{1,2})/g;
function date(s){const m=s?.match(/(20\d{2})[年/-]\s*(\d{1,2})[月/-]\s*(\d{1,2})/);if(!m)return null;const d=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;return Number.isFinite(Date.parse(d))&&new Date(Date.parse(d)).toISOString().slice(0,10)===d?d:null;}
const actions=[['announcement',/を(?:正式に)?発表(?:した|しました|します|。|$)$/],['release',/を(?:新たに)?発売(?:した|しました|。|$)$/],['introduction',/を紹介(?:した|しました|しています|します|。|$)$/],['event_announcement',/(?:の開催を案内|を開催すると発表)$/],['interview',/を公開(?:した|しました|しています|。|$)$/]];
const clean=s=>typeof s==='string'&&s.trim().length>=2&&s.trim().length<=100&&!/[<>\x00-\x1f]|https?:/i.test(s);
function modelList(value){const pieces=value.split(/[／/]/).map(s=>s.trim());return pieces.length>=2&&pieces.length<=4&&pieces.every(s=>/^[A-Za-z0-9][A-Za-z0-9._-]{1,59}$/.test(s)&&/[A-Za-z]/.test(s)&&/\d/.test(s))?pieces.join(' / '):value;}
const aliases={brand:['ブランド','メーカー','主催者','主体','人物'],product:['製品名','モデル名','対象名','イベント名','対象'],productType:['主製品種別','製品種別','記事種別','種別'],action:['出来事','行為'],venue:['会場'],publishedAt:['記事公開日','公開日','掲載日'],eventDate:['開催日']};

// No URL access, model catalogue, title reuse, date-from-URL or source-name fallback.
// Only explicit fields or a single bound actor/subject/action clause can supply facts.
export function parseAssistedPaste(input){
 if(!input||Object.keys(input).some(k=>!['sourceId','url','information'].includes(k)))throw Error('assisted_fields_invalid');
 const errors=[],fields={sourceId:input.sourceId,url:input.url},basis={},choices={};
 if(input.sourceId!=='yamaha'||!assistedUrl(input.url))errors.push('許諾済みYamahaギターTopicsの記事URLを入力してください');
 if(typeof input.information!=='string'||!input.information.trim()||input.information.length>2000||/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(input.information))return {valid:false,fields,missing:[],errors:[...errors,'確認済みの必要な情報を2000文字以内で貼り付けてください'],publisherHttpRequests:0};
 const text=input.information.trim(),lines=text.split(/\n/).map(s=>s.trim()).filter(Boolean),typeReadings=[];let unresolvedType=false;
 function offerType(phrase){const r=resolveProductType(phrase);if(!r.resolved){unresolvedType=true;return;}offer('productType',r.productType,'explicit_main_noun');typeReadings.push(typeEvidence(phrase));}
 function offer(k,v,how){if(!v)return;const list=choices[k] ||= [];if(!list.includes(v))list.push(v);basis[k]=how;}
 for(const line of lines){for(const [key,labels] of Object.entries(aliases)){const m=line.match(new RegExp('^(?:'+labels.join('|')+')[：:]\\s*(.+)$'));if(!m)continue;let v=m[1].trim();
   if(['publishedAt','eventDate'].includes(key)){const ds=v.match(dates)||[];v=ds.length===1?date(ds[0]):null;}
   if(key==='productType'){offerType(v);continue;}
   if(key==='action')v=Object.entries(assistedActions).find(([k,label])=>v===k||v===label||v===label.replace(/^を|^の/,''))?.[0]||null;
   if(v&&(clean(v)||['publishedAt','eventDate'].includes(key)))offer(key,v,'explicit_human_field');
 }}
 // Bare dates are ambiguous. They may be release/event dates, not publication.
 for(const line of lines){const m=line.match(/^(20\d{2}(?:年\s*\d{1,2}月\s*\d{1,2}日|[-/]\d{1,2}[-/]\d{1,2}))\s*(?:公開|掲載)$/);if(m)offer('publishedAt',date(m[1]),'explicit_article_date');}
 const clauses=text.split(/[。！？\n]/).map(s=>s.trim()).filter(Boolean),bound=[];
 for(const clause of clauses){
   if(/^(?:関連記事|関連製品|付属品|旧製品|比較対象|使用機材)[：:]/.test(clause))continue;
   if(/(?:未確認|不明|かもしれ|とは限|していない|していません|ではない|ではありません)/.test(clause))continue;
   const subject=clause.match(/「([^「」]+)」/g)||[],act=actions.filter(([,re])=>re.test(clause));
   // Do not merge independent announcements or unrelated quoted names.
   if(!subject.length||subject.length>4||act.length!==1)continue;
   const list=clause.slice(clause.indexOf('「'),clause.lastIndexOf('」')+1);
   if(subject.length>1&&!/^「[^「」]+」(?:\s*(?:と|／|\/|、)\s*「[^「」]+」)+$/.test(list))continue;
   if(clause.slice(clause.lastIndexOf('」')+1).trim().search(act[0][1])!==0)continue;
   const product=subject.map(s=>s.slice(1,-1)).join(' / '),actor=clause.match(/^([^「」：:]{2,60}?)(?:は|が|、)\s*/)?.[1]?.trim();
   if(!clean(product))continue;
   const prefix=clause.slice(0,clause.indexOf('「')).trim();
   const phrase=actor?prefix.slice(actor.length+1).replace(/^、\s*/,'').trim():prefix;
   const resolved=resolveProductType(phrase);
   const namedActor=clean(actor)&&!/公開日|掲載日|発売日|開催日|\d{4}年|^(?:同社|当社|弊社|こちら|この)/.test(actor)&&!(phrase.includes('の')&&!resolved.resolved);
   bound.push({...(namedActor?{brand:actor}:{}),product,action:act[0][0]});
   offerType(phrase);
 }
 for(const b of bound)for(const [k,v]of Object.entries(b))offer(k,v,'bound_human_sentence');
 // These actions need a richer schema; never silently turn them into a launch.
 if(/(?:新色|仕様変更|復刻|再発売|発売予定|発売する予定|発売します|予約受付|予約開始)/.test(text))errors.push('新色・仕様変更・発売予定・予約等はこの簡易登録で正確に表せません。発売や発表に置き換えて保存しないでください');
 // Explicit, named Yamaha actor spelling only; never derive a brand from a URL.
 if(choices.brand)choices.brand=[...new Set(choices.brand.map(b=>/^(?:ヤマハ(?:株式会社)?|YAMAHA|Yamaha)$/.test(b)?'Yamaha':b))];
 if(choices.product)choices.product=[...new Set(choices.product.map(modelList))];
 for(const [k,values]of Object.entries(choices))if(values.length===1)fields[k]=values[0];
 if(unresolvedType)delete fields.productType;
 const proof=typeReadings.find(r=>r.productType===fields.productType);if(proof&&fields.productType)fields.typeEvidence=proof;
 const typeResolution=fields.productType?{status:'resolved',confidence:'explicit_main_noun',mainProduct:fields.productType,usageTargets:proof.usageTargets,accessories:proof.accessories}:{status:'unresolved',confidence:'insufficient',candidates:choices.productType||[],reason:'主製品の種別が不明、未対応、または複数の候補があります'};
 const required=['publishedAt','brand','product','productType','action',...(fields.productType==='event'?['eventDate','venue']:[])];
 const missing=required.filter(k=>!fields[k]).map(key=>({key,label:names[key],reason:choices[key]?.length>1?'複数の情報があり確定できません':'貼り付け情報から確認できません'}));
 return {valid:!errors.length&&!missing.length,fields,basis,typeResolution,missing,errors,publisherHttpRequests:0};
}
