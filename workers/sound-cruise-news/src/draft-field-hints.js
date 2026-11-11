import {resolveProductType} from './assisted-product-type.js';
// Only display proposals from already-saved hints. No network, date inference,
// permissions, source-brand guessing or formal confirmation occurs here.
export function draftFieldHints(row,estimate){
 const title=(row.title||'').normalize('NFKC'),primary=title.split(/[|｜]/)[0],event=estimate.event||'',fields={},sources={},warnings=[];
 const offer=(key,value,kind,field)=>{if(typeof value==='string'&&value.length>=2&&value.length<=100&&!/[<>\x00-\x1f]/.test(value)){fields[key]=value;sources[key]={kind,reference:row.url,inputField:field,confirmed:false};}};
 const alias={'acoustic guitar':'アコースティックギター',acoustic_guitar:'アコースティックギター',electro_acoustic:'エレアコ','electro-acoustic guitar':'エレアコ','guitar amplifier':'ギターアンプ',guitar_amp:'ギターアンプ','guitar pickup':'ギター用ピックアップ',electric_guitar_bass:'エレキギター・ベース関連','electric guitar':'エレキギター・ベース関連','electric bass':'エレキギター・ベース関連',guitar_article:'ギター関連記事'};
 const ai=resolveProductType(alias[estimate.category.toLowerCase().trim()]||estimate.category);
 const editorial=/工房訪問|特集|試奏|feat[.．]|interview/i.test(primary+' '+event);
 const physical=[];if(/アコースティック[・\s]*ギター|アコギ/.test(primary)&&!/(?:ギター|アコギ)[・\s]*アンプ/.test(primary))physical.push('acoustic_guitar');if(/エレキギター|エレキベース|エレクトリック[・\s]*(?:ギター|ベース)|フルアコ/.test(primary))physical.push('electric_guitar_bass');if(/(?:ギター|アコギ)[・\s]*アンプ/.test(primary))physical.push('guitar_amp');
 let type=ai.resolved?ai.productType:'';
 if(editorial&&type!=='interview'&&/ギター|guitar/i.test(title+' '+estimate.category+' '+estimate.product)){type='guitar_article';offer('productType',type,'search_title_hint','title/event');}
 else if(new Set(physical).size===1){if(type&&type!==physical[0])warnings.push('保存AIの種別と検索見出しの候補が異なります。原記事を確認してください。');type=physical[0];offer('productType',type,'search_title_hint','title');}
 else if(physical.length>1){type='';warnings.push('検索見出しに複数の製品種別があります。主対象を確認してください。');}
 else if(type)offer('productType',type,'saved_ai_estimate','category');
 const signature=primary.match(/([^\s!！【】「」×]{2,30})シグネチャー(?:モデル)?/);
 if(/^(?:signature model|anniversary model|acoustic guitar|guitars?)$/i.test(estimate.product)&&signature)offer('product',signature[0],'search_title_hint','title');
 if(/^(?:signature model|anniversary model|acoustic guitar|guitars?|new series)$/i.test(estimate.product)&&!fields.product)warnings.push('対象名は一般的なAI案です。原記事で具体的な対象を確認してください。');
 // A qualifier keeps editions apart without pretending that a product page is
 // a new release. Ambiguous colour/limited claims remain unfilled.
 const q=[],years=primary.match(/(\d{2,3})周年/)||primary.match(/(\d{2,3})(?:st|nd|rd|th)\s+Anniversary/i),quantity=primary.match(/限定\s*\d+\s*本|\d+\s*本限定/),reissue=primary.match(/復刻版第\d+弾/);
 if(years)q.push(years[1]+'周年記念');if(quantity)q.push(quantity[0]);if(reissue)q.push(reissue[0]);if(signature)q.push(signature[0]);
 const special=/新色|限定|復刻|再発売|仕様変更|周年|シグネチャ|limited|reissue|anniversary|signature/i.test(primary+' '+event);
 let action='';if(type==='interview')action='interview';else if(type==='guitar_article')action='introduction';else if(/先行(?:紹介|公開)|preview/i.test(event))action='preview';else if(special&&q.length){action='variant_introduction';offer('qualifier',q.join('／'),'search_title_hint','title');}else if(!special)action=/発売|release/i.test(event)?'release':/発表|announcement/i.test(event)?'announcement':/紹介|introduction/i.test(event)?'introduction':/インタビュー/i.test(event)?'interview':'';
 if(action)offer('action',action,type==='guitar_article'||special?'search_title_hint':'saved_ai_estimate',type==='guitar_article'||special?'title/event':'event');
 return {fields,fieldSources:sources,warnings};
}
