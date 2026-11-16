// Reuse the existing assisted facts contract for an existing candidate. No fetch,
// inference, new candidate or publication authority is created by this projection.
import {assistedSource,assistedTypes,assistedLabel} from './assisted-facts.js';
import {savedWebDraft} from './web-discovery.js';
export async function candidateHumanReview(store,row,now,registry){
 const source=assistedSource(row.source_url),registered=registry.find(s=>s.id===row.source_id),state=await store.state(row.source_id);
 const allowed=source?.id===row.source_id&&registered&&!['DO_NOT_USE','PROHIBITED'].includes(registered.legalStatus)&&!registered.humanFactsProhibited;
 const stopped=state.disabled||state.publicationBlocked||await store.db.prepare('SELECT 1 FROM news_takedowns WHERE item_id=?').bind(row.id).first();
 const decided=await store.db.prepare('SELECT 1 FROM news_decision_ledger WHERE candidate_id=?').bind(row.id).first();
 const available=!!allowed&&!stopped&&!decided&&['pending','reopened'].includes(row.review_status)&&row.expires_at>now&&row.origin!=='legacy_fixture_backfill';
 return {available,reason:!allowed?'この出典・URLの人間確認条件は未対応または未確認です':stopped?'出典停止・takedownを確認してください':decided?'既存判断を維持します':row.expires_at<=now?'保持期間・掲載期限を確認してください':'原記事の事実と紹介条件を確認して、既存候補を補完できます',url:row.source_url};
}
export async function candidateAssistedDraft(store,row,now){
 const source=assistedSource(row.source_url);if(!source||source.id!==row.source_id)return null;
 const base=await savedWebDraft(store.db,row.source_url,now);let facts={};try{facts=JSON.parse(row.product_facts)||{};}catch{}
 const fields={...(base?.fields||{}),url:row.source_url,sourceId:row.source_id},fieldSources={...(base?.fieldSources||{})};
 const offer=(key,value)=>{if(typeof value==='string'&&value.length&&value.length<=160){fields[key]=value;fieldSources[key]={kind:row.origin==='operator_assisted'?'human_confirmed_record':'candidate_record',reference:row.source_url,confirmed:false};}};
 offer('publishedAt',row.published_at?new Date(Date.parse(row.published_at)+9*3600000).toISOString().slice(0,10):'');
 offer('brand',facts.brand||facts.person);offer('product',facts.product);
 if(assistedTypes[facts.productType])offer('productType',facts.productType);
 if(facts.kind==='assisted_notice'){offer('action',facts.action);offer('qualifier',facts.qualifier);offer('label',row.label);}
 const label=assistedLabel({kind:'assisted_notice',...fields,category:assistedTypes[fields.productType]?.[1]});
 if(label&&!fields.label){fields.label=label;fieldSources.label={kind:'generated_from_draft',confirmed:false};}
 return {...base,headline:fields.label||'原記事で対象と出来事を確認してください',fields,fieldSources,formalFacts:false,humanConfirmed:false,registrationAllowed:true,usageBasis:source.basis,warnings:['既存候補の補完です。入力値は本人の最終確認まで正式証拠にしません。'],missing:['brand','product','productType','action','publishedAt'].filter(k=>!fields[k])};
}
export async function assistedDraftForUrl(store,url,now){
 const row=await store.db.prepare("SELECT * FROM candidate_items WHERE normalized_url=? AND review_status IN ('pending','reopened')").bind(url||'').first();
 return row?candidateAssistedDraft(store,row,now):savedWebDraft(store.db,url,now);
}
