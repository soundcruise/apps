/* Explicit historical fixture builder. Never loaded by the product module graph. */
exports.install=async function(context){await context.addInitScript(()=>{
 window.__editSchema1Fixture=function(canonical,edit){
  if(canonical.schemaVersion===1)return edit(canonical);
  const C=window.CruiseStudio,legacy=JSON.parse(JSON.stringify(C.model.toLegacyView(canonical))),outcome=edit(legacy);
  const result=C.model.schema2.migrate(legacy,JSON.stringify(legacy));
  if(!result.ok||result.project.schemaVersion!==2)throw Error(result.error||'unsupported fixture');
  // Fixture replacement is explicit; retain the session's immutable restoration record.
  if(canonical.provenance.legacySource)result.project.provenance.legacySource=JSON.parse(JSON.stringify(canonical.provenance.legacySource));else delete result.project.provenance.legacySource;
  Object.keys(canonical).forEach(k=>{if(!Object.hasOwn(result.project,k))delete canonical[k];});Object.assign(canonical,result.project);
  return outcome;
 };
});};
