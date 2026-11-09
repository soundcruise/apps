// Synthetic publisher HTML, parsed and sealed through the existing formal path.
// No production proof hashes or original article bodies are reused as fixtures.
import assert from 'node:assert/strict';
import {store,pepper} from './helpers.js';
import {put} from './operator-case.js';
import {getSource} from '../src/registry.js';
import {hash} from '../src/policy.js';
import {administer} from '../src/admin.js';
import {recheckFacts} from '../src/facts-recheck.js';
import {candidateSnapshot,operatorDecision} from '../src/operator-review.js';
import {publicationValidation,CHECKS} from '../src/decision-policy.js';
export const at=Date.parse('2026-10-02T09:00:00+09:00');
export async function automaticCase({sourceId='ikebe',teachers=5,db,additionalFixtureSlots=0,signatureModels=false}={}){
 const s=await store(db),robots='User-agent: *\nAllow: /',registry=['ikebe','shimamura'].map(id=>({...getSource(id),enabled:true,productionEnabled:true,robotsHash:null}));
 // Additional synthetic articles only for multi-candidate race tests; production quotas are unchanged.
 for(const source of registry)source.dailyPrimaryArticleLimit+=additionalFixtureSlots;
 await administer(s,{action:'publish-on',reason:'review_complete'},at,registry);
 for(const source of registry){source.robotsHash=await hash(robots);await s.recordHealth({sourceId:source.id,status:'healthy',reasonCode:'ok',checkedAt:at,successfulAt:at});await s.db.prepare('INSERT OR REPLACE INTO source_state(source_id,last_discovery_at,robots_hash) VALUES(?,?,?)').bind(source.id,at,source.robotsHash).run();}
 async function add({id='target',sourceId:origin=sourceId,model='Studio H200',num=90001}={}){
  const source=registry.find(a=>a.id===origin),url=origin==='ikebe'?`https://www.ikebe-gakki-pb.com/new_product/${num}/`:`https://www.shimamura.co.jp/update/dtm-recording/2026/10/${num}/`;
  await put(s,id,{sourceId:origin,sourceName:source.name,sourceUrl:url,normalizedUrl:url,publishedAt:'2026-09-30T15:00:00.000Z',productFacts:null,category:signatureModels?'electric_guitar_bass':'recording_audio',eventType:'release',topicKey:id});
  const row=await s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(id).first();
  const shim=`<div class="mb-80"><h1>Craft Audio ヘッドホン ${model} 発売案内</h1></div><p>公開：<time datetime="2026-10-01">2026/10/01</time></p><div class="p-content"><p class="wp-block-paragraph">Craft Audioがオープン型ヘッドホン「${model}」を発売します。</p><h3>発売日</h3><p>2026年11月10日</p></div>`;
  const ikebe=`<article id="main"><div class="blog_title"><h1>Craft Audio ヘッドホン ${model} 新製品</h1><time class="sub_info_date" datetime="2026-10-01">2026年10月01日公開</time><a href="https://www.ikebe-gakki-pb.com/new_product/tag/craft/">Craft Audio</a></div><div class="main_wrap"><h2 class="wp-block-heading">Craft Audio<br>${model}</h2><p class="wp-block-paragraph">オープン型ヘッドホン${model}を発売します。</p><h3>発売日</h3><p>2026年11月10日</p></div></article>`;
  const signatureBody=signatureModels?[1,2,3,4].map(n=>`<h2 class="wp-block-heading">Craft Audio<br>${model} Model ${n}</h2><p class="wp-block-paragraph">Craft Audioの${model} Model ${n}はエレキギターです。ネック、ボディ、指板の仕様を説明します。</p>`).join('')+'<h3>発売日</h3><p>2026年11月10日</p>':null;
  const signature=signatureBody?(origin==='ikebe'?`<article id="main"><div class="blog_title"><h1>Craft Audio エレキギター 新シグネチャーモデル発売</h1><time class="sub_info_date" datetime="2026-10-01">2026年10月01日公開</time><a href="https://www.ikebe-gakki-pb.com/new_product/tag/craft/">Craft Audio</a></div><div class="main_wrap">${signatureBody}</div></article>`:`<div class="mb-80"><h1>Craft Audio エレキギター 新シグネチャーモデル発売</h1></div><p>公開：<time datetime="2026-10-01">2026/10/01</time></p><div class="p-content">${signatureBody}</div>`):null;
  const result=await recheckFacts(s,{id,revision:row.review_revision,snapshot:await candidateSnapshot(row),requestId:crypto.randomUUID()},at,registry,pepper,{type:'human_operator',id:'fixture:proof-acquisition'},{sleep:async()=>{},fetcher:async u=>{assert([url,source.robotsUrl].includes(u));return new Response(u===source.robotsUrl?robots:`<link rel="canonical" href="${url}">${signature|| (origin==='ikebe'?ikebe:shim)}`,{headers:{'Content-Type':u===source.robotsUrl?'text/plain':'text/html'}});}});
  assert.equal(result.recovered,true,JSON.stringify(result));
  return s.db.prepare('SELECT * FROM candidate_items WHERE id=?').bind(id).first();
 }
 for(let i=0;i<teachers;i++){
  const row=await add({id:'teacher'+i,model:'Studio H'+(300+i),num:91000+i}),v=await publicationValidation(s,row,at,registry,pepper);
  assert.equal(v.valid,true,JSON.stringify(v.errors));
  await operatorDecision(s,{id:row.id,action:'approve',reason:'useful_product',requestId:crypto.randomUUID(),revision:row.review_revision,snapshot:await candidateSnapshot(row),checks:Object.fromEntries(CHECKS.map(k=>[k,true])),label:v.publishableLabel,category:row.category,publishedAt:row.published_at},at,registry,pepper,{type:'human_operator',id:'access:fixture'});
 }
 const row=await add();return {s,registry,row,add,source:registry.find(a=>a.id===sourceId),now:at};
}
