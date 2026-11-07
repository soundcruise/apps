// Bounded identifiers only. These helpers do not infer aliases or discard variants.
export const MAINTENANCE_TOOL_KIT=/メンテナンス(?:用)?(?:ツール|工具)(?:セット|キット)|楽器(?:用)?(?:ツール|工具)(?:セット|キット)/;
const identifier=v=>typeof v==='string'&&v.length>=2&&v.length<=100&&/^[A-Za-z0-9][A-Za-z0-9 .&+()'/:-]*$/.test(v)&&!v.includes('://');
const folded=v=>v.normalize('NFKC').toLowerCase().replace(/\s+/g,'');
export function coDevelopment(title,lead,model){
 if(![title,lead,model].every(v=>typeof v==='string'))return null;
 const m=/([A-Za-z][A-Za-z0-9 .&'-]{1,35})と(?:[^A-Za-z。！？!?]{0,30})?([A-Za-z][A-Za-z0-9 .&'-]{1,35})が共同開発/.exec(lead);
 if(!m||/関連製品|比較対象|例えば|共同開発(?:ではない|していない)/.test(lead))return null;
 const brands=m.slice(1).map(s=>s.trim());
 return new Set(brands.map(folded)).size===2&&brands.every(b=>identifier(b)&&folded(title).includes(folded(b)))&&folded(model).includes(folded(brands.join(' x ')))?{basis:'verified_primary_article',brands}:null;
}
export function validCoDevelopment(f){
 if(!f||typeof f!=='object')return false;
 if(f.coDevelopment===undefined)return true;
 const c=f.coDevelopment;
 return !!c&&c.basis==='verified_primary_article'&&Object.keys(c).length===2&&Array.isArray(c.brands)&&c.brands.length===2&&new Set(c.brands.filter(identifier).map(folded)).size===2&&c.brands.every(identifier)&&Array.isArray(f.models)&&f.models.length===1&&identifier(f.product)&&folded(f.product).includes(folded(c.brands.join(' x ')))&&typeof f.brand==='string'&&(f.brand===c.brands[0]||f.brand.startsWith(c.brands[0]+' '));
}
// The full heading remains a variant; shared model names are never a colour alias.
export function productVariants(names){
 if(!Array.isArray(names)||names.length<2||names.length>4||!names.every(v=>typeof v==='string'))return null;
 const parts=names.map(v=>/^(.{2,90}) \(([A-Za-z][A-Za-z ]{1,35})\/([A-Za-z][A-Za-z ]{1,25})\)$/.exec(v));
 if(!parts.every(Boolean))return null;
 const variants=parts.map(m=>({model:m[1],color:m[2],fingerboard:m[3]}));
 return {models:[...new Set(variants.map(v=>v.model))],variants};
}
export function validVariants(f){
 if(!f||typeof f!=='object')return false;
 if(f.variants===undefined)return true;
 return Array.isArray(f.models)&&Array.isArray(f.variants)&&f.variants.length>=2&&f.variants.length<=4&&f.variants.every(v=>v&&Object.keys(v).sort().join(',')==='color,fingerboard,model'&&f.models.includes(v.model)&&[v.model,v.color,v.fingerboard].every(identifier))&&f.models.every(m=>f.variants.some(v=>v.model===m))&&new Set(f.variants.map(v=>JSON.stringify(v))).size===f.variants.length;
}
