/* Presentation only. The existing theme runtime alone owns saved preferences. */
(function(){
 const theme=window.CruiseStudio.colorTheme;
 function apply(id){
  const light=id==='gray'||id==='light';
  for(const image of document.querySelectorAll('img[data-studio-icon]')){
   const file='tool-'+image.dataset.studioIcon+(light?'-light':'')+'.svg?v=0.85.0';
   image.src=new URL('/apps/cruise-studio/assets/'+file,location.origin).href;
  }
 }
 apply(theme.getColorTheme());
 const stop=theme.subscribeColorTheme(apply);
 window.addEventListener('pagehide',stop,{once:true});
})();
