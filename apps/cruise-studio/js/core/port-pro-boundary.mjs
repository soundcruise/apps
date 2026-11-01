/* Studio entrance authenticates native Pro; writer admission remains independent. */
export function createPortProBoundary(){
 let disposed=false,generation=0;
 function invalidate(){generation++;}
 return Object.freeze({invalidate,dispose(){disposed=true;invalidate();},async authorize(){
  const entry=globalThis.CruiseStudio?.entryAuth,turn=generation;
  if(disposed||!entry||!await entry.check()||disposed||turn!==generation||!entry.isAuthorized())return {ok:false,reason:'studio-entry-required'};
  // Native Port owns its writer admission. Pro alone never grants shared writes.
  return {ok:true};
 }});
}
