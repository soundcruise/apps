import {findSimilar} from '../dot-phase1/phase2e/similarity.mjs';

// A caller must supply independently authorized, bounded snapshots. This adapter
// never reads D1, changes a decision, or promotes similarity into formal SAME.
const scopes=['approved','pending','rejected','system_excluded','discovery','decision_ledger','takedown'];
export function compareDotWithNews(candidate,snapshot){
 const unavailable={duplicateStatus:'UNCERTAIN',historyComplete:false,similar:[],coverage:Object.fromEntries(scopes.map(s=>[s,'未照合']))};
 if(!candidate||!snapshot||typeof snapshot!=='object')return unavailable;
 try{
  const coverage={},records=[];
  for(const scope of scopes){const part=snapshot[scope];if(!part||!Array.isArray(part.items)||part.items.length>500){coverage[scope]='未照合';continue;}coverage[scope]=part.complete===true?'取得済み':part.items.length?'部分照合':'未照合';for(const entry of part.items){if(!entry||typeof entry!=='object'||!entry.entity||!Array.isArray(entry.entity.models)||typeof entry.candidate_id!=='string')throw Error('invalid');records.push({...entry,scope});}}
  if(records.length>2000)throw Error('too_large');
  return {duplicateStatus:'UNCERTAIN',historyComplete:false,similar:findSimilar(candidate,records),coverage};
 }catch{return unavailable;}
}
