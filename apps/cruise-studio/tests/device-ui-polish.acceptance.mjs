import assert from 'node:assert/strict';import fs from 'node:fs';
export async function acceptDeviceUI({profile,bootstrapPro,check,result={},OUT}){
 const p=await profile('UI-polish',false);await bootstrapPro(p);const page=p.page;await page.goto('https://soundcruise.jp/apps/cruise-studio/index.html');await page.waitForFunction(()=>CruiseStudio.entryAuth?.isAuthorized());const baseline=process.env.UI_POLISH_BASELINE==='1';const measures=[];
 await check('Home and 4 app initial states, colors, manual settings and viewport scrolling',async()=>{
 for(const width of [1440,1024,768,390]){
 await page.setViewportSize({width,height:width===390?844:1000});await page.locator('button[data-workspace=home]').click();await page.evaluate(()=>{CruiseStudio.colorTheme.setColorTheme('midnight');document.querySelector('#studio-main').scrollTop=0;});await page.screenshot({path:OUT+'/home-'+width+'.png'});if(!baseline&&width>=1024)assert(await page.locator('.studio-nav [data-workspace]').evaluateAll(nodes=>nodes.every(e=>getComputedStyle(e).whiteSpace==='nowrap'&&e.scrollWidth<=e.clientWidth+1)));
 await page.evaluate(()=>{const m=document.querySelector('#studio-main');m.scrollTop=m.scrollHeight;});
 measures.push({width,workspace:'home',...await page.evaluate(()=>{const m=document.querySelector('#studio-main').getBoundingClientRect(),b=document.querySelector('.home-series .module-card:last-child').getBoundingClientRect();return{bottomCardCenter:(b.top+b.height/2-m.top)/m.height,overflow:document.documentElement.scrollWidth>innerWidth};})});await page.screenshot({path:OUT+'/home-bottom-'+width+'.png'});
 if(!baseline){const m=measures.at(-1);assert(m.bottomCardCenter>.25&&m.bottomCardCenter<.7);assert(!m.overflow);assert.equal(await page.locator('.home-project-storage-note').count(),0);assert.equal(await page.locator('.home-tools [data-home-workspace=portSync]').count(),1);}
 for(const id of ['pitch','fretboard','rhythm','chord']){
 await page.locator('button[data-workspace=home]').click();await (width===1024?page.locator('button[data-workspace=app_'+id+']'):page.locator('#screen-home [data-studio-cruise-app='+id+']')).click();const frame=await(await page.locator('#series-'+id+'-surface iframe').elementHandle()).contentFrame();await frame.waitForLoadState('load');await frame.waitForLoadState('networkidle');await frame.waitForFunction(()=>!!window.SoundCruiseSyncAttention);
 const settings={pitch:'#settings-modal',fretboard:'.settings-screen',rhythm:'#screen-settings',chord:'#cc-settings-overlay'};
 const state=await frame.evaluate(selector=>{const e=document.querySelector(selector);return{settingsVisible:!!e&&!!e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden',theme:document.documentElement.dataset.theme,midnight:document.documentElement.getAttribute('data-midnight'),projected:document.documentElement.dataset.studioTheme,bg:getComputedStyle(document.body).backgroundColor,overlay:getComputedStyle(document.querySelector('#overlay')||document.body).backgroundColor};},settings[id]);measures.push({width,workspace:id,...state});await page.screenshot({path:OUT+'/'+id+'-'+width+'.png'});
 if(!baseline){assert(!state.settingsVisible,id+' starts outside settings');assert.equal(state.projected,'midnight');assert.equal(state.midnight,'true');assert.equal(state.bg,'rgb(16, 21, 28)');}
 if(!baseline&&width===1440){for(const theme of ['dark','charcoal','gray','light','midnight']){await page.evaluate(t=>CruiseStudio.colorTheme.setColorTheme(t),theme);assert.equal(await frame.locator('html').getAttribute('data-studio-theme'),theme);} }
 // Explicit settings stays the native operation; leaving retains its dirty guard.
 const button={pitch:'#home-settings-btn',fretboard:'#btn-settings-home',rhythm:'#settings-btn',chord:'#cc-settings-btn'}[id];if(!state.settingsVisible)await frame.locator(button).click();await frame.locator(settings[id]).waitFor({state:'visible'});await frame.locator(settings[id]).locator('button:visible:enabled').last().click({trial:true});
 const leave=d=>d.accept();page.on('dialog',leave);try{await page.locator('button[data-workspace=home]').click();}finally{page.off('dialog',leave);}
 }
 }
 });
 const engine=process.env.STUDIO_UI_BROWSER||'chromium';
 for(const width of [1440,1024,768,390])await check('center surfaces keep one scrollbar and reachable bottom controls at '+width,async()=>{
  await page.setViewportSize({width,height:width===390?844:1000});await page.evaluate(()=>CruiseStudio.colorTheme.setColorTheme('midnight'));
  const measurements=[];
  for(const [workspace,surface] of [['tuner','port-tuner'],['metronome','port-metronome'],['portPractice','port-practice'],['portGear','port-gear'],['portMyApps','port-my-apps'],['portSync','port-sync'],['calendar','port-practice'],...['pitch','fretboard','rhythm','chord'].map(id=>['app_'+id,'series-'+id])]){
   console.log('CENTER_CHECK',workspace);const leave=d=>d.accept();page.on('dialog',leave);try{await page.evaluate(id=>{CruiseStudio.shellHost.navigate('home');if(id!=='calendar')CruiseStudio.shellHost.navigate(id);},workspace);if(workspace==='calendar')await page.locator('#screen-home [data-open-calendar]').click();}finally{page.off('dialog',leave);}
   const locator=page.locator('#'+surface+'-surface iframe');await locator.waitFor();
   const child=await(await locator.elementHandle()).contentFrame();await child.waitForLoadState('load');
   await child.waitForFunction(()=>document.body&&document.getElementById('studio-center-height'));
   await child.waitForFunction(()=>document.scrollingElement.scrollHeight<=innerHeight+4).catch(async error=>{console.log('SCROLL_FAIL',workspace,await child.evaluate(()=>({height:innerHeight,root:document.scrollingElement.scrollHeight,body:document.body.getBoundingClientRect().height,children:[...document.body.children].map(e=>({tag:e.tagName,id:e.id,height:e.getBoundingClientRect().height,position:getComputedStyle(e).position})).slice(0,8)})));throw error;});
   if(workspace==='metronome'){await child.locator('#metronome-details').evaluate(e=>e.open=true);await child.waitForFunction(()=>document.scrollingElement.scrollHeight<=innerHeight+4);}
   if(workspace==='tuner'){await child.locator('#tuner-input-settings-toggle').click();await child.waitForFunction(()=>document.scrollingElement.scrollHeight<=innerHeight+4);}
   const bottom=await child.locator('button').evaluateAll(buttons=>{let target=null,max=-Infinity;for(const button of buttons){if(button.closest('details:not([open])')||button.matches(':disabled')||!button.getClientRects().length||getComputedStyle(button).visibility!=='visible')continue;let fixed=false;for(let n=button;n;n=n.parentElement)if(getComputedStyle(n).position==='fixed'||(n!==document.body&&n!==document.documentElement&&n.scrollHeight>n.clientHeight+1&&/auto|scroll/.test(getComputedStyle(n).overflowY))){fixed=true;break;}const r=button.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(!fixed&&hit&&button.contains(hit)&&r.width>0&&r.height>0&&r.bottom>max){target=button;max=r.bottom;}}if(target)target.dataset.studioBottomQa='';return !!target;});
   assert(bottom,workspace+' has an actionable bottom control');await child.locator('[data-studio-bottom-qa]').scrollIntoViewIfNeeded();await child.locator('[data-studio-bottom-qa]').click({trial:true});assert.equal(await child.evaluate(()=>scrollY),0,workspace+' uses only outer vertical scrolling');
   await page.evaluate(()=>{const m=document.querySelector('#studio-main');m.scrollTop=m.scrollHeight;});const buttonRect=await child.locator('[data-studio-bottom-qa]').boundingBox(),mainRect=await page.locator('#studio-main').boundingBox();const position=(buttonRect.y+buttonRect.height/2-mainRect.y)/mainRect.height;assert(position>0&&position<.85,workspace+' final control remains visible above the bottom edge');await page.screenshot({path:OUT+'/bottom-'+workspace+'-'+width+'.png'});
   measurements.push({workspace,finalControlPosition:position,...await child.evaluate(()=>({height:innerHeight,scroll:document.scrollingElement.scrollHeight,theme:document.documentElement.dataset.studioTheme}))});
  }
  fs.writeFileSync(OUT+'/center-scroll-'+engine+'-'+width+'.json',JSON.stringify(measurements,null,2));
 });
 fs.writeFileSync(OUT+'/MEASUREMENTS.json',JSON.stringify(measures,null,2));result.measurements=measures;
}
