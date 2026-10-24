// Exact reviewed spelling variants for duplicate comparison only. This is not
// an extraction allowlist and never changes a publisher's stored brand fact.
// Review: retained Ikebe primary facts and Oct 25 Shimamura primary evidence
// independently name the same reference headphone under these two brand forms.
// No general removal of "Audio", "Guitars", etc. is permitted.
const reviewed=Object.freeze([Object.freeze(['ADAM Audio','ADAM'])]);
const normalized=s=>typeof s==='string'?s.normalize('NFKC').trim().toLowerCase():'';
export function productBrandVariants(brand){
 if(typeof brand!=='string'||!brand)return [];
 const group=reviewed.find(names=>names.some(name=>normalized(name)===normalized(brand)));
 return [...new Set([brand,...(group||[])])];
}
