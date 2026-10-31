/* Display-only projection. Never reads/writes application stores or controller state. */
export function attachPresentation(iframe) {
 const theme=window.CruiseStudio.colorTheme;
 let observer;
 function apply(){
  const doc=iframe.contentDocument;if(!doc?.head)return;
  const root=doc.documentElement,id=theme.getColorTheme();
  const native=id==='midnight'?'charcoal':id;
  if(root.dataset.theme!==native)root.dataset.theme=native;
  root.dataset.studioTheme=id;
  const mode=iframe.closest('#tool-window-slot')?'pane':'center';
  if(root.dataset.studioLayout!==mode){root.dataset.studioLayout=mode;}
  const tokens=getComputedStyle(document.getElementById('studio-shell'));
  for(const key of ['space-1','space-2','space-3','space-4','space-6','space-8','space-12','app-bg','surface','panel','text-primary','text-muted','border-default','field','control','control-hover','focus','color-scheme'])root.style.setProperty('--studio-'+key,tokens.getPropertyValue('--studio-'+key));
  if(!doc.getElementById('studio-series-presentation')){const link=doc.createElement('link');link.id='studio-series-presentation';link.rel='stylesheet';link.href=new URL('js/modules/series/presentation.css',document.baseURI).href;doc.head.append(link);}
  if(!observer){observer=new MutationObserver(apply);observer.observe(root,{attributes:true,attributeFilter:['data-theme']});}
 }
 iframe.addEventListener('load',apply);const unsubscribe=theme.subscribeColorTheme(apply);const size=new ResizeObserver(apply);size.observe(iframe);
 return {refresh:apply,dispose(){iframe.removeEventListener('load',apply);unsubscribe();size.disconnect();observer?.disconnect();}};
}
