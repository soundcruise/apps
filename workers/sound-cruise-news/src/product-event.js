// Additive product-action facts. Keep the coarse event_type and public API stable.
// Only an explicit launch statement tied to the verified product can refine it.
export const PRODUCT_ACTIONS=Object.freeze({
 new_variant:'に新仕様が登場',special_edition:'に特別仕様が登場',
 limited_edition:'の限定モデルを発表',new_color:'に新色が登場',
 collaboration:'のコラボモデルを発表',reissue:'を復刻',rerelease:'を再発売'
});
const signals=Object.freeze([
 ['rerelease','explicit_rerelease',/再発売|再販売|\bre-?release\b/i],
 ['reissue','explicit_reissue',/復刻|\b(?:reissue|revival)\b/i],
 ['collaboration','explicit_collaboration_color',/コラボ(?:レーション)?カラー|\bcollaboration colou?r\b/i],
 ['collaboration','explicit_collaboration',/(?:コラボ(?:レーション)?)(?:.{0,12})(?:モデル|製品|カラー)|\bcollaboration (?:model|edition|colou?r)\b/i],
 ['new_color','explicit_new_color',/新色|追加カラー|カラー(?:バリエーション)?追加|\b(?:new colou?r|colou?r variation)\b/i],
 ['limited_edition','explicit_limited_color',/限定カラー|限定色|\blimited colou?r\b/i],
 ['limited_edition','explicit_limited_edition',/限定(?:.{0,8})(?:モデル|仕様|版|カラー|色|生産)|\blimited (?:edition|model|run|colou?r)\b/i],
 ['special_edition','explicit_special_edition',/特別仕様|特別モデル|(?:材|木材|仕上げ)仕様(?:が|を).{0,12}(?:登場|追加|ラインナップ)|\bspecial edition\b|\bcustom specification\b/i],
 ['new_variant','explicit_variant',/新仕様|仕様追加|派生モデル|\bnew variant\b/i]
]);
const launch=/発表|発売|販売開始|登場|追加|ラインナップ|復刻|再発売|再販売|\b(?:introduc(?:e|es|ing)|announc(?:e|es|ed|ement)|launch(?:ed|es)?|releases?|released|reissue|revival)\b/i;
const normalize=s=>String(s).normalize('NFKC').replace(/[™®]/g,'').toLowerCase();
export function explicitProductAction(statement){
 if(typeof statement!=='string'||statement.length>512||!launch.test(statement))return null;
 if(/過去|以前|かつて|他社|例えば|発売予定|登場しない|登場していません|ではない|not (?:a|an)|previous|example|review|レビュー|(?:special|custom) (?:sound|circuit|design|tone)|特別(?:な)?(?:音|サウンド|回路|設計)|(?:特別仕様|custom specification).{0,20}(?:搭載|採用|features?|equipped)/i.test(statement))return null;
 const match=signals.find(([, ,re])=>re.test(statement));
 return match?{action:match[0],basis:'explicit_primary_title',signal:match[1]}:null;
}
export function productEventFrom(title,facts,eventType){
 if(!facts?.product||!['new_product','release','other'].includes(eventType)||typeof title!=='string'||title.length>512)return null;
 // Not historical examples, denied launches, accessories, reviews, or instructions.
 if(/(?:過去|以前|かつて|他社|例えば|発売予定|登場しない|登場していません|ではない|not (?:a|an)|previous|example|review|レビュー|(?:special|custom) (?:sound|circuit|design|tone)|特別(?:な)?(?:音|サウンド|回路|設計)|(?:特別仕様|custom specification).{0,20}(?:搭載|採用|features?|equipped))/i.test(title))return null;
 const names=normalize(facts.product).split(/\s*\/\s*/);
 const normalized=normalize(title);
 if(!names.every(p=>p&&normalized.includes(p)))return null;
 const clause=normalized.split(/。|[!?！？]|\.(?:\s|$)/).find(c=>names.every(p=>c.includes(p)));
 if(!clause)return null;
 const first=clause.indexOf(names[0]),window=clause.slice(Math.max(0,first-100),first+facts.product.length+150);
 return explicitProductAction(window);
}
export function validatedProductEvent(event){
 return !!event&&['explicit_primary_title','verified_primary_article'].includes(event.basis)&&signals.some(([action,signal])=>event.action===action&&event.signal===signal)&&Object.keys(event).every(k=>['action','basis','signal'].includes(k));
}
export function uncertainProductAction(title,eventType,event){
 return !event&&['new_product','release','other'].includes(eventType)&&/限定|特別仕様|特別モデル|新仕様|派生モデル|新色|コラボ|復刻|再発売|\b(?:special edition|limited edition|new variant|new colou?r|collaboration|reissue|revival)\b/i.test(title);
}
export function productActionSuffix(event){
 if(!validatedProductEvent(event))return null;
 if(event.signal==='explicit_collaboration_color')return 'にコラボカラーが登場';
 if(event.signal==='explicit_limited_color')return 'に限定カラーが登場';
 return PRODUCT_ACTIONS[event.action];
}
