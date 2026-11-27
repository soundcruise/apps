import test from 'node:test';
import assert from 'node:assert/strict';
import {store} from './helpers.js';
import {getSource} from '../src/registry.js';
import {shimamuraReviewDraft} from '../src/shimamura-product-evidence.js';
import {candidateAssistedDraft} from '../src/candidate-draft.js';
import {draftRequirements} from '../src/review-presentation.js';

const source=getSource('shimamura');
const url='https://www.shimamura.co.jp/update/guitar-bass/2026/11/999991/';
const row={id:'daily-model-fixture',source_id:source.id,source_url:url,review_status:'pending',origin:'automatic_collection',published_at:'2026-11-22T15:00:00.000Z'};
const now=Date.parse('2026-11-24T07:00:00+09:00');
const article=(intro,detail)=>`<link rel="canonical" href="${url}"><div class="mb-80"><h1>Arborの限定ストラトキャスターを発売</h1></div><p>公開：<time datetime="2026-11-23"></time></p><div class="p-content"><p class="wp-block-paragraph">${intro}</p>${detail}</div>`;
const intro='新モデル「Series 50 Guitar」と「Series 60 Guitar」が登場しました。';
const headings='<h2>Arbor Series 50 Guitar</h2><h2>Arbor Series 60 Guitar</h2>';

test('daily multi-model input can enter the human review flow without a hand-written note',async()=>{
 const s=await store(),fields=shimamuraReviewDraft(article(intro,headings),source,row);
 assert.deepEqual(fields,{brand:'Arbor',product:'Series 50 Guitar／Series 60 Guitar',productType:'electric_guitar_bass',action:'introduction'});
 const proof={sourceId:row.source_id,sourceUrl:url,publishedAt:row.published_at,verifiedAt:now,responseHash:'b'.repeat(64),reviewDraft:fields};
 await s.db.prepare("INSERT INTO news_discovery_work (source_id,normalized_url,first_seen_at,updated_at,processing_state,reason_code,next_action,candidate_id,evidence_json) VALUES (?,?,?,?,'parser_failed','facts_extraction_incomplete','new_parser_or_evidence',?,?)").bind(source.id,url,now,now,row.id,JSON.stringify({proof})).run();
 const draft=await candidateAssistedDraft(s,row,now);
 assert.deepEqual(draftRequirements(draft,now).missing,[]);
 assert.equal(draft.formalFacts,false);
 assert.equal(draft.humanConfirmed,false);
 assert.equal(draft.fieldSources.product.confirmed,false);
 const changed=await candidateAssistedDraft(s,{...row,published_at:'2026-11-21T15:00:00.000Z'},now);
 assert(draftRequirements(changed,now).missing.includes('product'));
});

test('the fallback ignores uncorroborated models, date mismatches and opt-outs',()=>{
 assert.equal(shimamuraReviewDraft(article(intro,'<aside>'+headings+'</aside>'),source,row),null);
 assert.equal(shimamuraReviewDraft(article(intro,headings).replace('2026-11-23','2026-11-24'),source,row),null);
 assert.equal(shimamuraReviewDraft('<meta name="robots" content="noindex">'+article(intro,headings),source,row),null);
});

test('a single SD player can reach human review with a maker in the lead and a product row',()=>{
 const title='商業設備向けSDプレーヤー「PS-12」が登場';
 const lead='Acmeが、展示用SDプレーヤー「PS-12」を発売します。';
 const table='<table><tr><td>PS-12</td><td>JAN：1234567890123</td></tr></table>';
 const page=article(lead,table).replace('Arborの限定ストラトキャスターを発売',title);
 assert.deepEqual(shimamuraReviewDraft(page,source,row),{brand:'Acme',product:'PS-12',productType:'sd_audio_player',action:'introduction'});
 assert.equal(shimamuraReviewDraft(page.replace('PS-12</td>','PS-15</td>'),source,row),null);
 assert.equal(shimamuraReviewDraft(page.replace(table,'<aside>'+table+'</aside>'),source,row),null);
});
