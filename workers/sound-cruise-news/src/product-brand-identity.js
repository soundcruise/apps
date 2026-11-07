// Exact reviewed spelling variants for duplicate comparison only. This is not
// an extraction allowlist and never changes a publisher's stored brand fact.
// Review: retained Ikebe primary facts and Oct 25 Shimamura primary evidence
// independently name the same reference headphone under these two brand forms.
// No general removal of "Audio", "Guitars", etc. is permitted.
// PJB's expanded name is explicitly retained in the approved Ikebe primary facts;
// this manufacturer spelling relation never aliases products, colours or events.
const reviewed=Object.freeze([Object.freeze(['ADAM Audio','ADAM']),Object.freeze(['PJB (Phil Jones Bass)','PJB','Phil Jones Bass'])]);
const normalized=s=>typeof s==='string'?s.normalize('NFKC').trim().toLowerCase().replace(/\s+\(/g,'('):'';
export function productBrandVariants(brand){
 if(typeof brand!=='string'||!brand)return [];
 const group=reviewed.find(names=>names.some(name=>normalized(name)===normalized(brand)));
 return [...new Set([brand,...(group||[]).flatMap(n=>[n,n.replace(/\s+\(/g,'(')])])];
}
// Reviewed only for same-day, explicitly limited-edition identity checks.
export function limitedEditionBrandVariants(brand){
 return ['fender','fender mex'].includes(normalized(brand))?[...new Set([brand,'Fender','Fender MEX'])]:productBrandVariants(brand);
}
