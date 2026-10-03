import {productFacts} from './metadata.js';
export const RS20MM_URL='https://www.shimamura.co.jp/update/guitar-bass/2026/10/89944/';
// Explicitly authorized published-category repair. Never a publication decision.
export function rs20mmCategoryCorrection(row){
 const facts=JSON.parse(row.product_facts||'null');
 if(row.source_url!==RS20MM_URL||row.source_id!=='shimamura'||row.review_status!=='approved'||row.category!=='acoustic_guitar'||facts?.brand!=='Yamaha'||facts.product!=='RS20MM'||facts.category!==row.category||row.published_at!=='2026-09-30T15:00:00.000Z')throw Error('category_correction_target_changed');
 const verified=productFacts('Yamaha RS20MM');
 if(verified?.category!=='electric_guitar_bass')throw Error('category_mapping_not_verified');
 return {category:verified.category,product_facts:JSON.stringify({...facts,category:verified.category})};
}
export function categoryCorrectionSql(row,q){
 const patch=rs20mmCategoryCorrection(row),cas=Object.keys(row).map(k=>`"${k}" IS ${q(row[k])}`).join(' AND ');
 return `UPDATE candidate_items SET category=${q(patch.category)},product_facts=${q(patch.product_facts)} WHERE ${cas} AND NOT EXISTS(SELECT 1 FROM news_takedowns WHERE item_id=${q(row.id)}) AND NOT EXISTS(SELECT 1 FROM source_state WHERE source_id=${q(row.source_id)} AND (disabled=1 OR takedown=1 OR publication_blocked=1));`;
}
