import test from 'node:test';import assert from 'node:assert/strict';
import {getSource} from '../src/registry.js';
import {parseShimamuraProductEvidence} from '../src/shimamura-product-evidence.js';
import {parseShimamuraReviewEvidence} from '../src/shimamura-review-evidence.js';
import {subjectProductTypes} from '../src/product-type-evidence.js';
import {factualLabel} from '../src/metadata.js';
const source=getSource('shimamura'),url='https://www.shimamura.co.jp/update/amp-effector/2026/10/990001/';
const row={source_id:'shimamura',source_url:url,published_at:'2026-10-15T15:00:00.000Z',review_status:'pending',event_type:'new_product'};
const page=(title,body)=>`<link rel="canonical" href="${url}"><div class="mb-80"><h1>${title}</h1></div><span>公開：<time datetime="2026-10-16"></time></span><div class="p-content">${body}</div>`;
const p=s=>`<p class="wp-block-paragraph">${s}</p>`;
const amp=()=>page('【限定カラー登場】Tone Houseの練習アンプ「AMP:20 V5」に限定カラーが登場',p('自宅練習用ギターアンプとしてTone House「AMP:20 V5」に、限定のスペシャルカラーがラインナップに加わります。'));
test('colon-bearing model and grammatical limited-colour addition retain exact identity and event',()=>{
 const r=parseShimamuraProductEvidence(amp(),source,row);assert.equal(r.productFacts.product,'AMP:20 V5');assert.equal(r.productFacts.brand,'Tone House');assert.equal(r.productFacts.productType,'guitar_amp');assert.equal(r.productFacts.productEvent.signal,'explicit_limited_color');assert.match(factualLabel(r.productFacts,r.eventType),/限定カラーが登場/);assert.equal(r.publishedAt,row.published_at);assert.equal(r.productFacts.releaseEvent,undefined);
});
test('related, denied or unsupported colour claims cannot complete product facts',()=>{
 for(const html of [amp().replace('限定のスペシャルカラー','従来のカラー'),amp().replace('ラインナップに加わります','今後の計画は不明です'),amp().replace('Tone House「AMP:20 V5」','他社「AMP:20 V5」'),amp().replace('class="p-content"','class="p-content" hidden')])assert.throws(()=>parseShimamuraProductEvidence(html,source,row),/facts_/);
});
test('a primary guitar identity outranks its fitted pickup and keeps bound collaboration facts',()=>{
 const r=parseShimamuraProductEvidence(page('Craft Lab「QA Stratocaster」という特別なストラトキャスターが登場',p('Craft Labより、レーベル「合成レコード」とのコラボレーションモデル「QA Stratocaster」が登場しました。')+p('ピックアップには3基のコイルを搭載しています。')),source,row);
 assert.equal(r.productFacts.productType,'guitar');assert.equal(r.productFacts.category,'electric_guitar_bass');assert.equal(r.productFacts.productEvent.action,'collaboration');
});
test('fitted components never become the main product, while actual pickup launches remain valid',()=>{
 const defs=[['pickup',/ピックアップ/],['guitar',/ギター/]];assert.deepEqual(subjectProductTypes(['ピックアップを搭載したギター'],defs).map(d=>d[0]),['guitar']);
 const r=parseShimamuraProductEvidence(page('Craft Lab「PU-90」ギター用ピックアップが登場',p('Craft Labより、ギター用ピックアップ「PU-90」が登場しました。')),source,row);assert.equal(r.productFacts.productType,'guitar_pickup');
});
const prose='ギターで演奏した音の変化と操作性について、複数の音色を試しながら詳しく確認しています。';
const review=()=>page('【実機レビュー】Craft Lab FX88は演奏表現を広げる',p('実機レビューには機材提供を受けています。')+p('Craft Labのマルチ・エフェクト・ペダル「FX88（EXPANDER）」を紹介します。')+`<h2>Craft Lab FX88の概要</h2>${p(prose)}<h2>接続と操作の検証</h2>${p(prose)}<h2>いざ試奏</h2>${p(prose)}`);
test('natural review title, typographic variants and observed trial sections stay editorial',()=>{
 const r=parseShimamuraReviewEvidence(review(),source,{...row,event_type:'review'});assert.equal(r.productFacts.product,'FX88');assert.equal(r.productFacts.articleType,'review');assert.equal(r.eventType,'product_article');assert.equal(r.productFacts.releaseEvent,undefined);assert.equal(r.productFacts.editorialNotice,'equipment_provided');
});
test('provided-gear notice alone, missing subject binding or hidden trial prose cannot establish a review',()=>{
 for(const html of [review().replace('Craft Lab FX88の概要','Other FX88の概要'),review().replaceAll(prose,'短い販促だけ。'),review().replace('いざ試奏','関連商品'),review().replace('マルチ・エフェクト・ペダル','ヘッドホン'),review().replace('class="p-content"','class="p-content" hidden')])assert.throws(()=>parseShimamuraReviewEvidence(html,source,{...row,event_type:'review'}),/facts_/);
});
