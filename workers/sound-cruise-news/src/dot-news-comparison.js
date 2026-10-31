import {findSimilar} from '../dot-phase1/phase2e/similarity.mjs';

// A caller must supply independently authorized, bounded snapshots. This adapter
// never reads D1, changes a decision, or promotes similarity into formal SAME.
const scopes=['approved','pending','rejected','system_excluded','discovery','decision_ledger','takedown'];
export function compareDotWithNews(candidate,snapshot){
 const unavailable={duplicateStatus:'UNCERTAIN',historyComplete:false,similar:[],coverage:Object.fromEntries(scopes.map(s=>[s,'未照合']))};
 if(!candidate||!snapshot||typeof snapshot!=='object')return unavailable;
 try{
  const coverage={},records=[];
  for(const scope of scopes){const part=snapshot[scope];if(!part||!Array.isArray(part.items)||part.items.length>500){coverage[scope]='未照合';continue;}coverage[scope]=part.complete===true?(part.mode==='targeted'?'条件検索済み':'取得済み'):part.items.length?'部分照合':'未照合';for(const entry of part.items){if(!entry||typeof entry!=='object'||!entry.entity||!Array.isArray(entry.entity.models)||typeof entry.candidate_id!=='string')throw Error('invalid');records.push({...entry,scope});}}
  if(records.length>2000)throw Error('too_large');
  const priority={takedown:0,rejected:1,decision_ledger:2,system_excluded:3,approved:4,pending:5,discovery:6};records.sort((a,b)=>(priority[a.scope]??9)-(priority[b.scope]??9));
  const e=candidate.entity||{},models=Array.isArray(e.models)?e.models.slice():[];if(typeof e.product==='string'&&!models.includes(e.product))models.push(e.product);const searchCandidate={...candidate,entity:{...e,models}};
  const idMatches=records.filter(r=>candidate.candidate_id&&r.candidate_id===candidate.candidate_id).map(r=>({id:r.candidate_id,title:r.title||'不明',url:r.url||null,status:r.review_status,scope:r.scope,reason:['候補IDが一致（未検証の参考情報）'],comparison:'UNCERTAIN'}));
  const similar=[...idMatches,...findSimilar(searchCandidate,records)].filter((x,i,a)=>a.findIndex(y=>y.id===x.id&&y.scope===x.scope)===i).slice(0,8);
  return {duplicateStatus:'UNCERTAIN',historyComplete:false,similar,coverage,coverageCounts:Object.fromEntries(scopes.map(scope=>[scope,Array.isArray(snapshot[scope]?.items)&&(snapshot[scope].complete===true||snapshot[scope].items.length>0)?snapshot[scope].items.length:null]))};
 }catch{return unavailable;}
}
