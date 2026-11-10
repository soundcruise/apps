import {assistedLabel,assistedTypes,assistedActions} from './assisted-facts.js';

const record=v=>v&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[<>\x00-\x1f]/.test(v);
export function draftDate(value){
 if(typeof value!=='string'||!/^20\d{2}-\d\d-\d\d(?:T\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d))?$/.test(value))return '';
 const day=value.slice(0,10),stamp=Date.parse(day+'T00:00:00Z');
 return Number.isFinite(Date.parse(value))&&Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===day?day:'';
}
// Input assistance only. It is not a human confirmation or a publication proof.
export function validateDraftAssistance(input,url){
 const fail=()=>{throw Error('assisted_draft_invalid');};
 if(!record(input)||Object.keys(input).some(k=>!['version','url','source','fields','notes'].includes(k))||input.version!==1||input.url!==url)fail();
 if(!record(input.source)||Object.keys(input.source).some(k=>!['label','url'].includes(k))||!text(input.source.label,100)||!text(input.source.url,500))fail();
 try{const u=new URL(input.source.url);if(u.protocol!=='https:'||u.username||u.password||u.hash)fail();}catch{fail();}
 const fields=input.fields;if(!record(fields)||!Object.keys(fields).length||Object.keys(fields).some(k=>!['brand','product','productType','action','publishedAt','label','eventDate','venue'].includes(k)))fail();
 for(const [k,v]of Object.entries(fields)){
  if(!text(v,k==='label'?160:100))fail();
  if(['publishedAt','eventDate'].includes(k)&&(!draftDate(v)||v.length!==10))fail();
  if(k==='productType'&&(!assistedTypes[v]||v==='guitar_accessory'))fail();
  if(k==='action'&&!assistedActions[v])fail();
 }
 const notes=input.notes??[];
 if(!Array.isArray(notes)||notes.length>6||notes.some(n=>!record(n)||Object.keys(n).some(k=>!['label','value'].includes(k))||!text(n.label,40)||!text(n.value,200)))fail();
 return {...input,notes};
}
export function assistedDraftWithInformation(draft,input){
 if(!draft?.registrationAllowed)throw Error('assisted_draft_unavailable');
 const info=validateDraftAssistance(input,draft.fields.url),fields={...draft.fields,...info.fields};
 // A changed subject/event must never retain an older generated headline.
 if(!Object.hasOwn(info.fields,'label'))delete fields.label;
 const generated=assistedLabel({kind:'assisted_notice',...fields,category:assistedTypes[fields.productType]?.[1]});
 if(!fields.label&&generated)fields.label=generated;
 const fieldSources={...draft.fieldSources};
 for(const k of Object.keys(info.fields))fieldSources[k]={kind:'provided_information',label:info.source.label,reference:info.source.url,confirmed:false};
 if(!info.fields.label&&generated)fieldSources.label={kind:'generated_from_draft',confirmed:false};
 return {...draft,headline:fields.label||draft.headline,fields,fieldSources,notes:info.notes,assistanceSource:info.source,missing:['publishedAt','brand','product','productType','action'].filter(k=>!fields[k]),formalFacts:false,humanConfirmed:false};
}
