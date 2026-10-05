// Cloudflare OAuth CLI only. Known publisher titles are read from stdin and never written/logged.
import {readFile} from 'node:fs/promises';
import {manualCandidate,ingestManual} from '../src/manual-ingestion.js';
import {qualitySnapshot,qualityRegressionGate,candidateTicker} from '../src/quality-gate.js';
import {guardedResearchArtifact} from './research-retention.mjs';
import {remoteDatabase} from './remote-store.mjs';import {NewsStore} from '../src/store.js';import {checkedConfig} from './remote-db.mjs';
const args=process.argv.slice(2),apply=args.includes('--apply'),path=args[args.indexOf('--file')+1];
if(args.filter(a=>a==='--file').length!==1||!path||args.some((a,i)=>!['--file','--apply','--dry-run'].includes(a)&&args[i-1]!=='--file')||apply&&args.includes('--dry-run'))throw Error('Use --file facts.json [--dry-run|--apply]; stdin must be a JSON array of original titles for transient comparison.');
const inputText=await readFile(path,'utf8');if(inputText.length>16000)throw Error('manual_input_too_large');let stdin='';for await(const chunk of process.stdin){stdin+=chunk;if(stdin.length>4096)throw Error('manual_title_check_too_large');}
const titles=JSON.parse(stdin);if(!Array.isArray(titles)||!titles.length||titles.length>8||titles.some(t=>typeof t!=='string'||!t.trim()||t.length>512))throw Error('manual_original_title_check_required');
const item=await manualCandidate(JSON.parse(inputText));
// Facts/label must pass the same normalized/near-copy guard; only safe facts are emitted.
const facts={...item.productFacts};for(const k of ['kind','category','sellerKind','event','nature','brand','percentOff','verificationUrl'])delete facts[k];
if(facts.equipment===undefined)delete facts.equipment;
const researchFacts=item.sourceId==='manual-agm-test'?{brands:item.productFacts.brand?[item.productFacts.brand]:[],equipment:item.productFacts.models||[item.productFacts.product],...(item.productFacts.artist?{artist:item.productFacts.artist}:{}),eventType:item.productFacts.event}:facts;
guardedResearchArtifact([{canonicalUrl:item.sourceUrl,facts:researchFacts},{facts:{policyFinding:item.label}}],{originalTitles:titles});
if(!apply){console.log(JSON.stringify({mode:'dry-run',item,publisherRequests:0}));process.exit(0);}
const config=await checkedConfig(),base='https://'+config.name+'.cruise-port-requests.workers.dev',get=async path=>{const r=await fetch(base+path,{headers:{Origin:'https://soundcruise.jp'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('manual_preflight_api_'+r.status);return r.json();};
const store=new NewsStore(remoteDatabase()),rows=await store.candidates(),burden=rows.filter(i=>['pending','reopened'].includes(i.review_status)).length;
let items=[],pathApi='/v1/news?limit=50';for(let page=0;page<20&&pathApi;page++){const p=await get(pathApi);items.push(...p.items);pathApi=p.nextCursor?'/v1/news?limit=50&cursor='+encodeURIComponent(p.nextCursor):null;}if(pathApi)throw Error('manual_baseline_incomplete');
const now=Date.now(),ticker=(await get('/v1/news/ticker')).items,current=qualitySnapshot(items,{ticker,reviewBurden:burden,now}),prospective=items.some(i=>i.id===item.id)?items:[...items,item];
const gate=qualityRegressionGate(current,qualitySnapshot(prospective,{ticker:candidateTicker(prospective,now),reviewBurden:burden,now}));if(!gate.pass)throw Error('manual_quality_gate_'+gate.reasons.join('_'));
const result=await ingestManual(store,item,now);console.log(JSON.stringify({result,label:item.label,category:item.category,qualityGate:gate}));
