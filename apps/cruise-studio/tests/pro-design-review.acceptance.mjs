import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';
// Observe real CSS transitions through completion, rather than recording an
// intermediate charcoal -> gray/light color. Product CSS stays untouched.
async function settle(page){await page.evaluate(async()=>{
 getComputedStyle(document.querySelector('.home-tools .pc-home-grid button')).backgroundColor;
 await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
 await Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{})));
 });await page.waitForFunction(()=>[...document.querySelectorAll('img')].filter(i=>i.getBoundingClientRect().width>0).every(i=>i.complete&&i.naturalWidth>0));}
async function palette(page){return page.evaluate(()=>{
 const props=['backgroundColor','color','borderTopColor','borderTopWidth'];const read=s=>{const e=document.querySelector(s),c=getComputedStyle(e);return Object.fromEntries(props.map(p=>[p,c[p]]));};
 return {page:read('.studio-main'),card:read('.home-tools .pc-home-grid button'),text:read('.home-tools .pc-home-grid strong')};
});}
export async function acceptDesignReview({p,check,OUT,root,entry}){
 const {page}=p,baseline=process.env.STUDIO_BASELINE_ARTIFACT;assert(baseline?.startsWith('/private/tmp/'));
 const routeOld=async route=>{const file=path.join(baseline,new URL(route.request().url()).pathname);try{return route.fulfill({contentType:({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'),body:fs.readFileSync(file)});}catch{return route.fallback();}};
 await check('Published 0.84.2 palette equals revised 0.85.0: 5 themes x 4 widths',async()=>{
 const rows=[];const transitionEvidence=[];
 for(const version of ['published','revised']){
  if(version==='published')await p.context.route('https://soundcruise.jp/apps/cruise-studio/**',routeOld);else await p.context.unroute('https://soundcruise.jp/apps/cruise-studio/**',routeOld);
  await page.goto(version==='published'?root+'index.html':entry);await page.waitForFunction(()=>CruiseStudio.entryAuth.isAuthorized());
  for(const width of [1440,1024,768,390])for(const theme of ['midnight','dark','charcoal','gray','light']){
   await page.setViewportSize({width,height:width===390?844:1000});await page.evaluate(t=>CruiseStudio.colorTheme.applyColorTheme(t),theme);
   if(theme==='gray'&&width===1440){const during=await page.evaluate(()=>{const e=document.querySelector('.home-tools .pc-home-grid button');getComputedStyle(e).backgroundColor;return{background:getComputedStyle(e).backgroundColor,transitionDuration:getComputedStyle(e).transitionDuration,activeTransitions:document.getAnimations().filter(a=>a.transitionProperty==='background-color').length};});transitionEvidence.push({version,...during});}
   await settle(page);const colors=await palette(page);
   if(version==='published')rows.push({theme,width,published:colors});else{
    const row=rows.find(r=>r.theme===theme&&r.width===width);assert.deepEqual(colors,row.published);row.revised=colors;
    const geometry=await page.evaluate(()=>{const b=document.querySelector('.studio-pro-badge').getBoundingClientRect(),c=document.querySelector('#home-cruise-sync').getBoundingClientRect();return{overflow:document.documentElement.scrollWidth>innerWidth,syncInEyebrow:c.top<b.top&&c.left>document.querySelector('.studio-header-eyebrow').getBoundingClientRect().left,images:[...document.querySelectorAll('img[data-studio-icon]')].map(i=>({light:i.src.includes('-light.svg'),loaded:i.complete&&i.naturalWidth>0}))};});assert(!geometry.overflow&&geometry.syncInEyebrow);assert(geometry.images.every(i=>i.loaded&&i.light===['gray','light'].includes(theme)));row.geometry=geometry;
   }
   await page.screenshot({path:OUT+'/'+version+'-'+theme+'-'+width+'.png'});
   // Tool cards below the fold must also be reviewed, rather than only title.
   if(['gray','light','midnight'].includes(theme)&&[1440,390].includes(width)){
    await page.locator('.home-tools').scrollIntoViewIfNeeded();await settle(page);await page.screenshot({path:OUT+'/'+version+'-tools-'+theme+'-'+width+'.png'});
    await page.evaluate(()=>document.querySelector('.studio-main').scrollTop=0);
   }
  }
 }
 fs.writeFileSync(OUT+'/palette-comparison.json',JSON.stringify(rows,null,2));fs.writeFileSync(OUT+'/transition-evidence.json',JSON.stringify(transitionEvidence,null,2));
 });
 await check('Light icon centers are actually transparent, preserving native backgrounds',async()=>{
  const alpha=await page.evaluate(()=>Object.fromEntries([['calendar',256,264],['sync',240,220]].map(([name,x,y])=>{const img=document.querySelector('img[data-studio-icon="'+name+'"]'),canvas=document.createElement('canvas');canvas.width=canvas.height=512;const c=canvas.getContext('2d');c.drawImage(img,0,0,512,512);return[name,c.getImageData(x,y,1,1).data[3]];})));
  assert.deepEqual(alpha,{calendar:0,sync:0});fs.writeFileSync(OUT+'/transparent-faces.json',JSON.stringify(alpha));
 });
}

