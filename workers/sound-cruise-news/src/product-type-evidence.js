// Classify the product noun, not equipment connected to, protected by, or
// compared with it. Callers still own identity, source and article-scope checks.
// No publisher text is retained and no model/brand-specific rules are used.
export const POWER_DISTRIBUTION_PATTERN=/電源タップ|電源プロテクター|パワー[・ ]?(?:ディストリビューター|コンディショナー)|\bpower (?:strip|distributor|distribution unit|conditioner|protector)\b/i;

function targetMention(before,after){
 const prefix=before.slice(-90),suffix=after.slice(0,250).replace(/^\s*(?:「[^」]{1,110}」|"[^"]{1,110}")/,'').slice(0,130);
 // Include coordinated target lists: "amps, mixers, audio interfaces ...".
 if(/^(?:[、,／/・]+\s*[^。！？!?：:]{1,35}){0,3}?(?:など|等)?(?:の)?(?:接続|保護|対応|比較)(?:対象|機器|製品)/.test(suffix))return true;
 if(/^(?:など|等)?(?:を|に|へ|と)(?:[^。！？!?：:]{0,55}?)(?:保護|守る|守り|接続|つなぐ|繋ぐ|給電|対応|比較|比べ|異なり)/.test(suffix))return true;
 if(/^(?:など|等)?(?:用|向け|対応)(?:の)?(?:ケース|スタンド|アーム|ホルダー|ケーブル|カバー|アクセサリ|電源|パワーサプライ)/.test(suffix))return true;
 if(/^(?:ではない|ではなく|ではありません|との比較|と比較|と異な|以外)/.test(suffix))return true;
 // A fitted component is not the complete product: "pickup-equipped guitar".
 if(/^を[^。！？!?：:]{0,45}(?:搭載|採用|装備)(?:した|する|し)/.test(suffix))return true;
 if(/(?:関連(?:商品|製品)|参考製品|比較対象|旧製品|従来(?:品|モデル)|付属品|保護対象|接続先|対応機器|例えば|他社)[^。！？!?：:]{0,35}$/.test(prefix))return true;
 if(/(?:保護対象|接続対象|接続先|対応機器|関連製品|比較対象)\s*[:：]\s*[^。！？!?：:]{0,35}$/.test(prefix))return true;
 if(/(?:protects?|connect(?:ed)? to|compatible with|supports?|compared (?:to|with)|previous model|related product)\s*(?:the\s*)?[^.!?]{0,25}$/i.test(prefix))return true;
 return /^(?:s)?\s*(?:protection|accessor(?:y|ies))\b/i.test(suffix);
}

export function isProductSubjectMention(before,after){return !targetMention(before,after);}

export function hasProductSubject(text,models){
 for(const model of models){
  const escaped=model.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  for(const match of text.matchAll(new RegExp(escaped,'gi'))){
   if(!targetMention(text.slice(0,match.index),text.slice(match.index+match[0].length)))return true;
  }
 }
 return false;
}

export function subjectProductTypes(scopes,definitions){
 return definitions.filter(definition=>{
  const pattern=definition.at(-1);
  return scopes.some(scope=>typeof scope==='string'&&scope.split(/[。！？!?\n]/).some(sentence=>{
   const matches=sentence.matchAll(new RegExp(pattern.source,[...new Set(pattern.flags+'g')].join('')));
   for(const match of matches)if(!targetMention(sentence.slice(0,match.index),sentence.slice(match.index+match[0].length)))return true;
   return false;
  }));
 });
}
