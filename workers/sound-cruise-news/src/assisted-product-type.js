// A bounded noun-phrase grammar. Definitions are alternatives, never priority rules.
// No URL, model catalogue or source-brand inference is used.
export const productTypes={
 acoustic_guitar:['アコースティックギター','acoustic_guitar'],electro_acoustic:['エレアコ','acoustic_guitar'],
 pickup:['ギター用ピックアップ','amps_effects'],guitar_amp:['ギターアンプ','amps_effects'],
 preamp:['ギター用プリアンプ','amps_effects'],footswitch:['フットスイッチ','amps_effects'],
 tuner:['ギター用チューナー','electric_guitar_bass'],strings:['ギター用弦','electric_guitar_bass'],
 guitar_case:['ギター用ケース','electric_guitar_bass'],effect:['エフェクター','amps_effects'],
 interview:['ギター演奏のインタビュー','artist_guitar'],event:['ギター関連イベント','live_guitar']
};
const vocabulary={
 acoustic_guitar:['アコースティックギター','アコギ'],electro_acoustic:['エレアコ','エレクトリックアコースティックギター','エレクトリック・アコースティックギター'],
 pickup:['ピックアップ','ギターピックアップ'],guitar_amp:['ギターアンプ','アンプ'],preamp:['プリアンプ'],
 footswitch:['フットスイッチ'],tuner:['チューナー','ギターチューナー'],strings:['弦','ギター弦'],
 guitar_case:['ケース','ギターケース'],effect:['エフェクター'],
 interview:['インタビュー','ギター演奏のインタビュー'],event:['ギターイベント','ギター演奏イベント','ギター関連イベント','ギターコンサート','弾き語りライブ']
};
const text=s=>typeof s==='string'?s.normalize('NFKC').trim().replace(/\s+/g,' '):'';
function atom(s){const n=text(s).replace(/本体$/,'');const matches=Object.entries(vocabulary).filter(([,words])=>words.includes(n)).map(([k])=>k);return matches.length===1?matches[0]:null;}
const target=s=>text(s)==='ギター'?'guitar':text(s)==='アンプ'?'amplifier':atom(s);
const validTarget=t=>['guitar','acoustic_guitar','electro_acoustic','guitar_amp','amplifier'].includes(t);
const guitarTarget=targets=>targets.some(t=>['guitar','acoustic_guitar','electro_acoustic','guitar_amp'].includes(t));
export function resolveProductType(raw){
 const phrase=text(raw),unresolved={resolved:false,phrase,reason:'主製品の種別を一意に確認できません'};
 if(!phrase||phrase.length>100||/[<>\x00-\x1f]/.test(phrase))return unresolved;
 // Parentheses can only describe explicitly marked ancillary roles.
 let main=phrase,accessories=[],usageTargets=[];
 const note=main.match(/^(.*)\(([^()]+)\)$/);
 if(note){main=note[1].trim();const n=note[2];
  if(n.endsWith('付属')){const a=atom(n.slice(0,-2));if(a)accessories=[a];}
  else if(/^(?:付属品|対応機器|用途)[:：]/.test(n)){const parts=n.split(/[:：]/);if(parts.length!==2)return unresolved;const [role,value]=parts;const a=role==='付属品'?atom(value):target(value);if(a){if(role==='付属品')accessories=[a];else if(validTarget(a))usageTargets=[a];}}
  else return unresolved;
 }
 const direct=atom(main);let productType=direct;
 if(!direct){const relations=[...main.matchAll(/専用の?|向けの?|対応の?|用の?/g)];
  if(relations.length!==1)return unresolved;
  const r=relations[0],t=target(main.slice(0,r.index)),head=atom(main.slice(r.index+r[0].length));
  if(!validTarget(t)||!head||['acoustic_guitar','electro_acoustic','interview','event'].includes(head))return unresolved;
  usageTargets.push(t);productType=head;
 }
 // Bare accessory nouns do not establish guitar scope. Exact guitar nouns and
 // explicitly named usage targets do; a manufacturer/source name does not.
 if(['pickup','preamp','tuner','strings','guitar_case'].includes(productType)&&!guitarTarget(usageTargets)&&!/^ギター(?:ピックアップ|チューナー|弦|ケース)$/.test(main))return unresolved;
 if(productType==='guitar_amp'&&main!=='ギターアンプ'&&!guitarTarget(usageTargets))return unresolved;
 if(!productTypes[productType])return unresolved;
 return {resolved:true,phrase,productType,category:productTypes[productType][1],usageTargets:[...new Set(usageTargets)],accessories,confidence:'explicit_main_noun',version:1};
}
export function typeEvidence(raw,method='human_supplied_type_phrase'){
 const r=resolveProductType(raw);return r.resolved?{version:1,method,phrase:r.phrase,productType:r.productType,usageTargets:r.usageTargets,accessories:r.accessories}:null;
}
export function validTypeEvidence(e,type){
 if(!e||Object.keys(e).some(k=>!['version','method','phrase','productType','usageTargets','accessories'].includes(k))||e.version!==1||!['human_supplied_type_phrase','human_type_selection'].includes(e.method))return false;
 const r=typeEvidence(e.phrase,e.method);return !!r&&r.productType===type&&r.phrase===e.phrase&&JSON.stringify(r.usageTargets)===JSON.stringify(e.usageTargets)&&JSON.stringify(r.accessories)===JSON.stringify(e.accessories);
}
export function labelMatchesType(label,type){
 if(typeof label!=='string')return false;
 const noun=label.match(/、([^「」]+)「/i)?.[1]?.trim();if(!noun)return true;
 if(noun==='ギター')return ['acoustic_guitar','electro_acoustic'].includes(type);
 const r=resolveProductType(noun);return r.resolved&&r.productType===type;
}
