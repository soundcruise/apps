/* Stable product address, not an authorization secret. Standard and Pro use separate generated entries. */
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
// Reserved Standard identity, now used by the independently generated entry.
export const STANDARD_APP_ID = '/apps/cruise-studio/';
export function renderProManifest(version){
 return JSON.stringify({id:PRO_APP_ID,name:APP_NAME,short_name:APP_NAME,start_url:PRO_APP_ID,scope:PRO_APP_ID,display:'standalone',background_color:'#10151c',theme_color:'#10151c',lang:'ja',description:'Cruise Studio Pro — 弾き語りストの総合ワークスペース',icons:[192,512,1024].map(size=>({src:'/apps/cruise-studio/assets/app-icons/pro/icon-'+size+'.png?v='+version,sizes:size+'x'+size,type:'image/png',purpose:'any'}))},null,2)+'\n';
}

// Standard renders the same shell but never loads Pro gate, Pro frame hosts,
// operation credentials or the Project canary host. Native Standard pages own rights.
export function renderStandardEntry(source){
 let html=renderPublicCreation(source).replace('data-studio-product="studio"','data-studio-product="studio" data-studio-edition="standard"');
 html=html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/g,(all,attrs,body)=>{
  if(/__SOUNDCRUISE_PRO_GATE__/.test(body)||/shared\/(?:pro-|sync-account\/)|js\/(?:core\/studio-entry|port-sync-status|cloud\/canary-entry|modules\/series\/(?:workspaces|official-links)|modules\/(?:practice|tuner|metronome|library)\/port-surface)/.test(attrs))return '';
  if(attrs.includes('js/port-pc.js'))return '<script src="js/standard-surfaces.js?v=0.88.0"></script>'+all;
  return all;
 }).replace(/<link[^>]*shared\/pro-gate.css[^>]*>/g,'').replace(/pro_969e958c31433f99c30b\/manifest.webmanifest/g,'manifest.webmanifest').replace(/<span class="studio-pro-badge">Pro<\/span>/g,'').replace(/Cruise Studio Pro/g,'Cruise Studio').replace(/クルーズ Pro/g,'クルーズ').replace(/同期を確認中…/g,'通常版 — 各アプリの機能制限が適用されます。').replace(/data-studio-edition="pro"/g,'data-studio-edition="standard"');
 for(const [dir,pro] of Object.entries({'pitch-cruise':'pro_x9v7q2m8','fretboard_cruise':'pro_a9f4k7q2m8z','rhythm-cruise':'pro_r4m8k7n2q9x','chord-cruise':'pro_k7m4q9v2x8'}))html=html.replaceAll('../'+dir+'/'+pro+'/', '../'+dir+'/standard/');
 return '<!-- Generated Standard edition. Native Standard owners enforce capabilities. -->\n'+html.replace(/^[ \t]+$/gm,'');
}
export function renderStandardManifest(version){const m=JSON.parse(renderProManifest(version));m.id=m.start_url=m.scope=STANDARD_APP_ID;m.description='Cruise Studio — 弾き語りストの総合ワークスペース';return JSON.stringify(m,null,2)+'\n';}
