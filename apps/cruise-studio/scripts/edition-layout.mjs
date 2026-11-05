/* Stable product address, not an authorization secret. Standard is not shipped. */
export const PRO_DIRECTORY = 'pro_969e958c31433f99c30b';
export const PRO_ENTRY = 'apps/cruise-studio/'+PRO_DIRECTORY+'/index.html';
export function renderProEntry(source){
 const root=new URL('https://layout.invalid/apps/cruise-studio/');
 return '<!-- Generated from the single Studio index.html source. Do not edit. -->\n'+source.replace('data-studio-product="studio"','data-studio-product="studio" data-studio-edition="pro"').replace(/\b(src|href)="([^"]+)"/g,(all,attr,value)=>{
  if(/^(#|[a-z][a-z0-9+.-]*:|\/)/i.test(value))return all;
  const url=new URL(value,root);return attr+'="'+url.pathname+url.search+url.hash+'"';
 });
}
