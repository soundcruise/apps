const {createRequire}=require('node:module'),{chromium}=createRequire(process.env.STUDIO_TEST_RUNTIME)('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const OUT=process.env.STUDIO_CLIENT_OUTPUT,reference=process.env.STUDIO_REFERENCE_URL,before=process.env.STUDIO_PREVIOUS_URL,current=process.env.STUDIO_URL;assert(OUT&&reference&&before&&current);for(const url of [reference,before,current])assert(['127.0.0.1','localhost'].includes(new URL(url).hostname));
(async()=>{const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}),out={};try{
 for(const [name,url]of [['old',reference],['before',before],['restored',current]]){
  const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',reducedMotion:'reduce'}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(url);await p.waitForFunction(()=>!!CruiseStudio.shellHost&&!!CruiseStudio.entryAuth?.isAuthorized());
  await p.evaluate(()=>CruiseStudio.colorTheme.setColorTheme('midnight'));await p.locator('.studio-theme-option').first().waitFor();
  out[name]={errors,widths:{}};
  for(const width of [1440,1024,768,390]){
   await p.setViewportSize({width,height:1000});await p.mouse.move(0,0);await p.evaluate(()=>document.getElementById('studio-main').scrollTo(0,0));await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   await p.screenshot({path:OUT+'/'+name+'-'+width+'.png'});
   const cards=p.locator(name==='before'?'.home-creation':'.home-primary');await cards.screenshot({path:OUT+'/'+name+'-cards-'+width+'.png'});
   out[name].widths[width]=await p.locator('#open-sheet-cruise').evaluate(e=>{const c=getComputedStyle(e),r=e.getBoundingClientRect(),label=e.querySelector('.module-card-label'),l=getComputedStyle(label);return {width:r.width,height:r.height,border:c.borderRadius,padding:c.padding,background:c.background,borderColor:c.borderColor,shadow:c.boxShadow,textColor:l.color,font:l.fontFamily,size:l.fontSize,weight:l.fontWeight,art:!!e.querySelector('.home-page-front'),overflow:document.getElementById('studio-main').scrollWidth>document.getElementById('studio-main').clientWidth+1};});
  }
  await p.setViewportSize({width:1440,height:1000});await p.locator('#open-sheet-cruise').hover();
  const hover=await p.locator('#open-sheet-cruise').evaluate(e=>({title:getComputedStyle(e.querySelector('.module-card-label')).visibility,description:getComputedStyle(e.querySelector('.module-card-sub')).opacity}));
  out[name].hover=hover;
  await p.locator('#open-sheet-cruise').focus();await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.id),'open-pre-dtm');
  const touch=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'}),tp=await touch.newPage();
  await tp.goto(url);await tp.waitForFunction(()=>!!CruiseStudio.shellHost&&!!CruiseStudio.entryAuth?.isAuthorized());await tp.locator('#open-sheet-cruise').tap();assert.equal(await tp.evaluate(()=>CruiseStudio.shellHost.getActiveWorkspace()),'sheetCruise');await touch.close();out[name].touchOpensSheet=true;
  await context.close();
 }
 assert.deepEqual(out.restored.hover,out.old.hover);assert.equal(out.restored.hover.title,'hidden');assert.equal(out.restored.hover.description,'1');
 for(const width of [1440,1024,768,390]){
  assert.deepEqual(out.restored.widths[width],out.old.widths[width],'historical card geometry/type/colors at '+width);
 }
 for(const value of Object.values(out))assert.deepEqual(value.errors,[]);
 const compare=await browser.newPage({viewport:{width:1840,height:1000}});
 for(const width of [1440,1024,768,390]){
  const parts=[['old','旧Git正本 0.70.0'],['before','公開版 0.73.0'],['restored','復旧候補 0.73.1']].map(([id,title])=>`<figure><figcaption>${title} / ${width}px</figcaption><img src="data:image/png;base64,${fs.readFileSync(OUT+'/'+id+'-'+width+'.png').toString('base64')}"></figure>`).join('');
  await compare.setContent('<style>body{margin:0;background:#eee;font:16px system-ui}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:12px}figure{margin:0}figcaption{padding:12px}img{display:block;width:100%;height:auto}</style><main>'+parts+'</main>');
  await compare.screenshot({path:OUT+'/comparison-'+width+'.png',fullPage:true});
 }
 await compare.close();
}finally{fs.writeFileSync(OUT+'/visual-metrics.json',JSON.stringify(out,null,2));await browser.close();}console.log(out)})();
