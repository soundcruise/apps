/* Stable product address, not an authorization secret. Standard is not shipped. */
export const PRO_DIRECTORY = 'pro_969e958c31433f99c30b';
export const PRO_ENTRY = 'apps/cruise-studio/'+PRO_DIRECTORY+'/index.html';
export function renderPublicCreation(source){
 return source.replace(/<button\b([^>]*(?:data-workspace="(?:sheetCruise|preDtm)"|data-home-workspace="(?:sheetCruise|preDtm)")[^>]*)>([\s\S]*?)<\/button>/g,(_,attrs,content)=>attrs.includes('data-coming-soon')?'<button'+attrs+'>'+content+'</button>':'<button'+attrs+' disabled aria-disabled="true" data-coming-soon>'+content+'<small class="coming-soon-label">Coming soon...</small></button>')
 .replace(/(<section[^>]*id="screen-(?:sheet-cruise|pre-dtm)"[^>]*)(>)/g,'$1 hidden inert$2');
}
export function renderProEntry(source){
 source=renderPublicCreation(source);
 const root=new URL('https://layout.invalid/apps/cruise-studio/');
 return '<!-- Generated from the single Studio index.html source. Do not edit. -->\n'+source.replace('data-studio-product="studio"','data-studio-product="studio" data-studio-edition="pro"').replace(/\b(src|href)="([^"]+)"/g,(all,attr,value)=>{
  if(/^(#|[a-z][a-z0-9+.-]*:|\/)/i.test(value))return all;
  const url=new URL(value,root);return attr+'="'+url.pathname+url.search+url.hash+'"';
 });
}

export const APP_NAME = 'Cruise Studio';
export const PRO_APP_ID = '/apps/cruise-studio/'+PRO_DIRECTORY+'/';
// Reserved only. No Standard manifest or entry is generated.
export const STANDARD_APP_ID = '/apps/cruise-studio/';
export function renderProManifest(version){
 return JSON.stringify({id:PRO_APP_ID,name:APP_NAME,short_name:APP_NAME,start_url:PRO_APP_ID,scope:PRO_APP_ID,display:'standalone',background_color:'#10151c',theme_color:'#10151c',lang:'ja',description:'Cruise Studio Pro — 弾き語りストの総合ワークスペース',icons:[192,512,1024].map(size=>({src:'/apps/cruise-studio/assets/app-icons/pro/icon-'+size+'.png?v='+version,sizes:size+'x'+size,type:'image/png',purpose:'any'}))},null,2)+'\n';
}
