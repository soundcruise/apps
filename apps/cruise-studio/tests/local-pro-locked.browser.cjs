const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright');
test('public Studio component route stays locked without the development server',async()=>{
 const url=process.env.STUDIO_URL;assert(url);const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});const context=await browser.newContext({serviceWorkers:'block'});
 await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(url).origin?r.continue():r.abort());
 try{const p=await context.newPage();await p.goto(url);await p.waitForFunction(()=>!!CruiseStudio.shellHost);await p.evaluate(()=>CruiseStudio.shellHost.navigate('tuner'));const f=await(await p.locator('#port-tuner-surface iframe').elementHandle()).contentFrame();await f.waitForFunction(()=>document.body.dataset.componentState==='locked');assert.equal(await f.locator('#tuner-view').count(),0);assert.equal(await p.evaluate(()=>localStorage.getItem('cruisePort.tuner')),null);}finally{await browser.close();}
});
