// Owner-authorized presentation facts for already published articles only.
// Not consumed by extraction, publication validation, duplicates, or learning.
export const PUBLISHED_PRODUCT_TYPES=Object.freeze({
 acoustic_guitar:'アコースティックギター',electric_guitar:'エレキギター',guitar:'ギター',hybrid_guitar:'ハイブリッドギター',
 signature_pick:'シグネチャーピック',cleaning_cloth:'楽器用クロス',guitar_stand:'ギタースタンド',
 multi_effect_pedal:'マルチエフェクター',guitar_amp:'ギターアンプ',smart_amp:'スマートアンプ',
 expression_pedal:'エクスプレッションペダル',pedal_power_supply:'ペダル用電源',tube_di:'真空管DI',
 wah_pedal:'ワウペダル',effect_pedal:'エフェクター',distortion_pedal:'歪みペダル',booster_pedal:'ブースターペダル',
 bass_effect_pedal:'ベース用エフェクター',octave_pedal:'オクターブペダル',tuner_metronome:'チューナー・メトロノーム',
 instrument_library:'音源ライブラリ',software:'ソフトウェア',plugin:'プラグイン',stereo_plugin:'音像調整プラグイン',
 stereo_imager:'ステレオイメージャー',voice_pack:'追加ボイスパック',vocal_plugin:'ボーカル編集プラグイン',daw:'DAW',
 orchestral_instrument:'オーケストラ音源',timecode_adapter:'タイムコード・アダプタ',handy_recorder:'ハンディレコーダー',
 amp_effect_modeler:'アンプ・エフェクトモデラー',usb_audio_interface:'USBオーディオインターフェース',audio_interface:'オーディオインターフェース',
 usb_microphone:'USBマイク',power_distribution:'電源タップ',pad_controller:'パッドコントローラー',digital_piano:'折りたたみ式電子ピアノ'
});
const actions=new Set(['announce','release','scheduled_release','release_delay','reservation_start','information','update','firmware','spec_change','arrival','early_sale','new_color','collaboration_color','price_change','discontinued','reissue','rerelease']);
const qualifiers=Object.freeze({limited:'限定',japan_limited:'日本限定の',special:'特別仕様の',signature:'シグネチャー・'});
const subtypes=Object.freeze({granular:'グラニュラー',flanger:'フランジャー'});
const themes=Object.freeze({composition_arrangement:'アコギでの作曲・アレンジ',composition_acoustic_arrangement:'作曲とアコギのアレンジ'});
const text=(s,max=100,quotes=false)=>typeof s==='string'&&s.length>0&&s.length<=max&&s===s.trim()&&!/[<>\x00-\x1f\x7f]/.test(s)&&(quotes||!/[「」]/.test(s));
const url=s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash;}catch{return false;}};
const keys=(o,allowed)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>allowed.includes(k));
export function validPublishedDate(s){
 if(typeof s!=='string'||!/^20\d\d(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(s))return false;
 if(s.length<10)return true;
 return new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
}
export function validPublishedHeadline(h,row){
 if(!keys(h,['schemaVersion','scope','candidateId','sourceUrl','kind','brand','product','productType','subtypes','action','date','qualifier','version','feature','person','theme','event','exhibit','evidence'])||
  h.schemaVersion!==1||h.scope!=='published_admin_quality'||h.candidateId!==row?.id||h.sourceUrl!==row?.source_url||row?.review_status!=='approved'||
  !Array.isArray(h.evidence)||!h.evidence.length||h.evidence.length>4||!h.evidence.every(e=>keys(e,['url','basis','verifiedAt','responseHash','fields'])&&url(e.url)&&['primary_article_review','official_product_review','trusted_structured_facts'].includes(e.basis)&&Number.isSafeInteger(e.verifiedAt)&&e.verifiedAt>0&&(!e.responseHash||/^[a-f0-9]{64}$/.test(e.responseHash))&&Array.isArray(e.fields)&&e.fields.length>0&&e.fields.every(f=>['identity','productType','subtypes','action','date','qualifier','version','feature','theme'].includes(f))))return false;
 const covered=field=>h.evidence.some(e=>e.fields.includes(field));
 if(!covered('identity')||!covered('action'))return false;
 if(h.kind==='product'){
  if(!text(h.brand,60)||!text(h.product)||!Object.hasOwn(PUBLISHED_PRODUCT_TYPES,h.productType)||!actions.has(h.action)||!covered('productType'))return false;
  if(h.qualifier!==undefined&&(!Object.hasOwn(qualifiers,h.qualifier)||!covered('qualifier')))return false;
  if(h.subtypes!==undefined&&(!Array.isArray(h.subtypes)||!h.subtypes.length||h.subtypes.length>2||new Set(h.subtypes).size!==h.subtypes.length||!h.subtypes.every(t=>Object.hasOwn(subtypes,t))||h.productType!=='effect_pedal'||!covered('subtypes')))return false;
  if(h.date!==undefined&&(!validPublishedDate(h.date)||!covered('date')||!['scheduled_release','release_delay','reservation_start'].includes(h.action)))return false;
  if(h.version!==undefined&&(!/^\d{1,3}(?:\.\d{1,3}){0,2}$/.test(h.version)||!covered('version')||!['update','firmware'].includes(h.action)))return false;
  if(h.feature!==undefined&&(!text(h.feature,40)||!covered('feature')||h.action!=='spec_change'))return false;
  return !['person','theme','event','exhibit'].some(k=>k in h);
 }
 if(h.kind==='interview')return text(h.person,40)&&Object.hasOwn(themes,h.theme)&&covered('theme')&&!['brand','product','productType','subtypes','qualifier','date','version','feature','event','exhibit'].some(k=>k in h)&&h.action==='interview';
 if(h.kind==='auction')return text(h.person,40)&&h.action==='guitar_collection_auction'&&!['brand','product','productType','subtypes','qualifier','date','version','feature','event','exhibit','theme'].some(k=>k in h);
 if(h.kind==='exhibition')return text(h.brand,60)&&text(h.event,60)&&text(h.exhibit,40)&&h.action==='exhibiting'&&!['person','product','productType','subtypes','qualifier','date','version','feature','theme'].some(k=>k in h);
 return false;
}
function datePhrase(date){
 if(!date)return '';
 const [y,m,d]=date.split('-');return m?`${Number(m)}月${d?Number(d)+'日':''}に`:`${y}年に`;
}
export function publishedHeadline(h,row){
 if(!validPublishedHeadline(h,row))return null;
 if(h.kind==='interview')return `${h.person}、${themes[h.theme]}を語るインタビュー`;
 if(h.kind==='auction')return `${h.person}、ギターなどの個人コレクションを競売へ`;
 if(h.kind==='exhibition')return `${h.brand}、${h.event}に${h.exhibit}を出展`;
 const subject=`${h.brand}、${qualifiers[h.qualifier]||''}${h.subtypes?.map(t=>subtypes[t]).join('／')||''}${PUBLISHED_PRODUCT_TYPES[h.productType]}「${h.product}」`,when=datePhrase(h.date);
 const suffix={announce:'を発表',release:'を発売',scheduled_release:`を${when}発売予定`,release_delay:`の発売を延期${h.date?'（'+when.replace(/に$/,'')+'予定）':''}`,
  reservation_start:`の予約受付を${when}開始`,information:'の製品情報',update:h.version?`の${h.version}更新版を公開`:'を更新',firmware:`のファームウェア${h.version?' '+h.version:''}を更新`,
  spec_change:h.feature?`に${h.feature}が登場`:'の仕様を変更',arrival:'の入荷情報',early_sale:'を国内先行販売',new_color:'に新色が登場',collaboration_color:'にコラボカラーが登場',
  price_change:'の価格を改定',discontinued:'の販売を終了',reissue:'を復刻',rerelease:'を再発売'}[h.action];
 return subject+suffix;
}
export function publishedHeadlineFromRow(row){
 try{const facts=typeof row.product_facts==='string'?JSON.parse(row.product_facts):row.product_facts;
  const label=publishedHeadline(facts?.headlineQuality,row);return label===row.label?label:null;
 }catch{return null;}
}
export function publishedCorrectionStatements(row,plan,q){
 const {headlineQuality,...identity}=plan.facts||{},old=JSON.parse(row.product_facts||'null');
 const {headlineQuality:previousQuality,...oldIdentity}=old||{};
 if(!validPublishedHeadline(headlineQuality,row)||publishedHeadline(headlineQuality,row)!==plan.label||
  JSON.stringify(identity)!==JSON.stringify(oldIdentity)||!text(plan.label,140,true)||!Array.isArray(plan.provenance)||
  JSON.stringify(plan.provenance.slice(0,-1))!==JSON.stringify(JSON.parse(row.facts_provenance||'[]'))||plan.provenance.at(-1)?.factField!=='headlineQuality'||
  !Number.isSafeInteger(plan.at)||!text(plan.requestId,80))throw Error('published_quality_patch_invalid');
 const cas=Object.keys(row).map(k=>`"${k}" IS ${q(row[k])}`).join(' AND ');
 return [
  `UPDATE candidate_items SET label=${q(plan.label)},product_facts=${q(JSON.stringify(plan.facts))},facts_provenance=${q(JSON.stringify(plan.provenance))},review_revision=review_revision+1 WHERE ${cas} AND review_status='approved' AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=${q(row.id)}) AND NOT EXISTS(SELECT 1 FROM source_state WHERE source_id=${q(row.source_id)} AND (publication_blocked=1 OR takedown=1))`,
  `INSERT INTO news_admin_audit(id,action,target,occurred_at,reason_code) SELECT ${q(plan.requestId)},'headline-quality-backfill',${q(row.id)},${plan.at},'verified_primary_presentation_only' WHERE changes()=1`,
  // Keep the existing exact legacy grant's display label aligned. Never create a
  // grant or change its identity, digest, source, category or publication date.
  `UPDATE legacy_news_grants SET label=${q(plan.label)} WHERE item_id=${q(row.id)} AND label=${q(row.label)} AND source_id=${q(row.source_id)} AND source_url=${q(row.source_url)} AND published_at=${q(row.published_at)} AND category=${q(row.category)} AND EXISTS(SELECT 1 FROM news_admin_audit WHERE id=${q(plan.requestId)} AND action='headline-quality-backfill' AND target=${q(row.id)}) AND EXISTS(SELECT 1 FROM candidate_items WHERE id=${q(row.id)} AND origin='legacy_fixture_backfill' AND review_status='approved' AND review_revision=${row.review_revision+1} AND label=${q(plan.label)})`
 ];
}
