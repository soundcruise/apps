// Authorized category-only correction. Full row CAS, no publication/learning writes.
import {readFile,writeFile} from 'node:fs/promises';
import {remoteSql,sqlLiteral as q} from './remote-db.mjs';
import {RS20MM_URL,rs20mmCategoryCorrection,categoryCorrectionSql} from '../src/category-correction.js';
import {hash} from '../src/policy.js';
const mode=process.argv[2],file=new URL('../.local/rs20mm-category-plan.json',import.meta.url),now=Date.now();
if(!['plan','apply'].includes(mode))throw Error('plan | apply');
const row=(await remoteSql(`SELECT * FROM candidate_items WHERE source_url=${q(RS20MM_URL)};`))[0].results;
if(row.length!==1)throw Error('category_target_ambiguous');
if(mode==='plan'){
 const plan={at:now,before:row[0],patch:rs20mmCategoryCorrection(row[0]),evidence:{primaryProductUrl:'https://usa.yamaha.com/products/musical_instruments/guitars_basses/el_guitars/rs20mm/index.html',type:'electric_guitar',articleUrl:RS20MM_URL}};
 await writeFile(file,JSON.stringify({...plan,digest:await hash(JSON.stringify(plan))}),{mode:0o600});console.log(JSON.stringify({mode,id:row[0].id,patch:plan.patch,evidence:plan.evidence}));
}else{
 const {digest,...plan}=JSON.parse(await readFile(file,'utf8'));
 if(digest!==await hash(JSON.stringify(plan))||now-plan.at>3600000||plan.at>now||JSON.stringify(row[0])!==JSON.stringify(plan.before)||JSON.stringify(plan.patch)!==JSON.stringify(rs20mmCategoryCorrection(row[0])))throw Error('category_plan_changed');
 const results=await remoteSql(categoryCorrectionSql(row[0],q)+`SELECT * FROM candidate_items WHERE id=${q(row[0].id)};`),after=results[1].results[0];
 for(const k of Object.keys(row[0]))if(after[k]!==({...row[0],...plan.patch})[k])throw Error('category_postcondition_failed');
 console.log(JSON.stringify({mode,id:after.id,category:after.category,changedFields:['category','product_facts.category'],status:after.review_status}));
}
