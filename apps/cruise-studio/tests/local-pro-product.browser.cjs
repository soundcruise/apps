const test=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright');
test('Studio product routes use real Port Pro controllers with isolated local authority',async()=>{
 const url=process.env.STUDIO_URL;assert(url);const origin=new URL(url).origin;
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const context=await browser.newContext({permissions:['microphone'],serviceWorkers:'block'});
 await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await context.addInitScript(()=>{if(window===top){window.__streams=[];}if(navigator.mediaDevices){const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async(...args)=>{const stream=await get(...args);top.__streams.push(stream);return stream;};}});
 const p=await context.newPage();p.setDefaultTimeout(10000);p.on('dialog',d=>d.accept());const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
 await p.goto(url);await p.waitForFunction(()=>!!CruiseStudio.shellHost);
 async function open(tool){await p.evaluate(t=>CruiseStudio.shellHost.navigate(t),tool);const f=await p.locator(`#port-${tool}-surface iframe`).elementHandle();const frame=await f.contentFrame();await frame.waitForFunction(()=>document.body.dataset.componentState==='ready');return frame;}
 const t=await open('tuner');assert(await t.locator('#tuner-capo-up').isVisible());await t.locator('#tuner-capo-up').click();await t.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.tuner')||'null')?.capo===1);
 await p.waitForFunction(()=>__streams.some(s=>s.getTracks().some(t=>t.readyState==='live')));
 for(const theme of ['dark','midnight','charcoal','gray','light']){await p.locator(`#shell-theme input[value="${theme}"]`).check();await t.waitForFunction(theme=>document.documentElement.dataset.studioTheme===theme,theme);if(process.env.STUDIO_SCREENSHOTS)await p.screenshot({path:process.env.STUDIO_SCREENSHOTS+'/'+theme+'-pro-tuner.png'});}
 await p.evaluate(()=>CruiseStudio.shellHost.navigate('home'));await p.waitForFunction(()=>__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
 const m=await open('metronome');await m.locator('#metronome-details-summary').click();await m.locator('#metronome-meter').selectOption('3/4');await m.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.metronome')||'null')?.meter==='3/4');
 await m.locator('#metronome-preset-save-open').click();await m.locator('#metronome-preset-name').fill('Synthetic 3/4');await m.locator('#metronome-preset-save').click();await m.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.metronomePresets')||'null')?.items?.length===1);
 await m.locator('#metronome-toggle').click();await p.locator('#shell-audio-stop').click();await p.waitForFunction(()=>!document.querySelector('#port-metronome-surface iframe'));
 await p.reload();await p.waitForFunction(()=>!!CruiseStudio.shellHost);const t2=await open('tuner');assert.equal((await t2.locator('#tuner-capo-value').textContent()).trim(),'1');
 await p.evaluate(()=>CruiseStudio.shellHost.navigate('home'));const m2=await open('metronome');await m2.locator('#metronome-details-summary').click();assert.equal(await m2.locator('#metronome-meter').inputValue(),'3/4');assert(await m2.locator('#metronome-preset-select').textContent().then(s=>s.includes('Synthetic 3/4')));
 const presetId=await m2.locator('#metronome-preset-select option').last().getAttribute('value');await m2.locator('#metronome-preset-select').selectOption(presetId);await m2.locator('#metronome-preset-delete').click();await m2.waitForFunction(()=>JSON.parse(localStorage.getItem('cruisePort.metronomePresets')).items.length===0);
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
