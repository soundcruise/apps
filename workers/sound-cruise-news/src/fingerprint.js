// The secret is injected by the caller. Neither it nor unkeyed title hashes are persisted.
const LIMIT=64, encoder=new TextEncoder();
export const normalizeHeadline=value=>value.normalize('NFKC').toLowerCase().replace(/[\p{P}\p{S}\p{Z}\s]/gu,'');
export function requirePepper(pepper) {
 if(typeof pepper!=='string'||encoder.encode(pepper).length<32)throw new Error('headline_pepper_required');
}
async function signer(pepper) {
 requirePepper(pepper);
 const key=await crypto.subtle.importKey('raw',encoder.encode(pepper),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return async value=>Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode('news-headline-v2:'+value))),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function fingerprint(value,pepper) {
 const sign=await signer(pepper), normalized=normalizeHeadline(value);
 if(!normalized||normalized.length>512)throw new Error('fingerprint_input_invalid');
 const grams=new Set();for(let i=0;i<normalized.length-2;i++)grams.add(normalized.slice(i,i+3));
 return {version:2,keyId:await sign('key-id'),exact:await sign('exact:'+normalized),
  count:grams.size,grams:(await Promise.all([...grams].map(g=>sign('gram:'+g)))).sort().slice(0,LIMIT)};
}
export async function validatedFingerprint(stored,pepper) {
 requirePepper(pepper); // Missing secret must stop approval, including legacy records.
 let old;try {old=typeof stored==='string'?JSON.parse(stored):stored;}catch{return null;}
 const hex=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 if(!old||old.version!==2||!hex(old.keyId)||!hex(old.exact)||!Number.isInteger(old.count)||old.count<0||old.count>510||
  !Array.isArray(old.grams)||old.grams.length!==Math.min(old.count,LIMIT)||old.grams.some(g=>!hex(g))||
  new Set(old.grams).size!==old.grams.length||old.grams.some((g,i)=>i>0&&old.grams[i-1]>=g))return null;
 const sign=await signer(pepper);
 return await sign('key-id')===old.keyId?old:null;
}
export async function headlineSimilarity(label,stored,pepper) {
 const old=await validatedFingerprint(stored,pepper);if(!old)return true;
 const next=await fingerprint(label,pepper);
 if(next.exact===old.exact)return true;
 // Compare both bottom-k sketches over the same hash range, avoiding truncation bias.
 const cutoff=[old,next].filter(x=>x.count>LIMIT).map(x=>x.grams.at(-1)).sort()[0]||'f'.repeat(64);
 const a=new Set(old.grams.filter(g=>g<=cutoff)),b=new Set(next.grams.filter(g=>g<=cutoff));
 if(!a.size||!b.size)return false;
 const overlap=[...a].filter(g=>b.has(g)).length;
 return overlap/(a.size+b.size-overlap)>=0.72||overlap/Math.min(a.size,b.size)>=0.88;
}
