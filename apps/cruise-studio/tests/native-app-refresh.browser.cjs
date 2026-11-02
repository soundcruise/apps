/* Synthetic Studio iframe refresh: no real Account, credential or network. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {createRequire} = require('node:module');
const {chromium} = createRequire(process.env.STUDIO_TEST_RUNTIME || __filename)('playwright');

test('native app refresh rebuilds the Studio host for all four apps', async () => {
 const root = path.resolve(__dirname, '../../..');
 const browser = await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const context = await browser.newContext({serviceWorkers:'block'});
 const bad=[];
 await context.route('https://studio.fixture.invalid/**', route => {
  const url = new URL(route.request().url());
  if(url.pathname==='/test')return route.fulfill({contentType:'text/html',body:`<!doctype html><html><body>
   <div id="studio-shell"></div><button id="studio-refresh"></button><span id="studio-refresh-status"></span><button id="shell-audio-stop"></button>
   ${['pitch','fretboard','rhythm','chord'].map(id=>`<div id="series-${id}-surface"></div><p data-series-sync-status="${id}"></p>`).join('')}
   <script>window.CruiseStudio={entryAuth:{read:()=>({accountId:'A'}),isAuthorized:()=>true},audio:{sessions:new Map(),register(x){if(this.sessions.has(x.sessionId))throw Error('Duplicate audio session');this.sessions.set(x.sessionId,x);return x;},request:()=>({}),grant:()=>true,async cleanup(h){await Promise.resolve();h?.cleanup();}},colorTheme:{getColorTheme:()=>"dark",subscribeColorTheme:()=>()=>{}}};
   window.SoundCruiseSyncAccount={storage:{getGeneration:()=>0,getAccount:async()=>({accountId:'A',accountCredential:'synthetic'}),subscribeAccount:()=>()=>{}},AccountClient:class{},core:{}};</script>
   <script src="/apps/cruise-studio/js/modules/series/workspaces.js"></script></body></html>`});
  if(url.pathname.endsWith('/port-pro-boundary.mjs'))return route.fulfill({contentType:'text/javascript',body:'export function createPortProBoundary(){return {authorize:async()=>({ok:true}),dispose(){}}}'});
  if(url.pathname==='/apps/cruise-port/cruise-app-links.js')return route.fulfill({contentType:'text/javascript',body:'export function resolveCruiseAppHref(){return "/apps/test/"}'});
  if(url.pathname==='/apps/test/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><script src="app.js"></script></head><body><button class="js-reload-app">ページを更新</button><button class="cc-refresh-app">ページを更新</button></body></html>'});
  if(url.pathname==='/apps/test/app.js')return route.fulfill({contentType:'text/javascript',body:'parent.nativeStartup=(parent.nativeStartup||0)+1;document.addEventListener("click",e=>{if(e.target.matches(".js-reload-app,.cc-refresh-app"))location.replace("/bad")})'});
  if(url.pathname==='/bad'){bad.push(url.pathname);return route.fulfill({status:500,body:'native reload escaped Studio'});}
  const file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep))return route.abort();
  try{return route.fulfill({contentType:url.pathname.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(file)});}catch{return route.fulfill({status:404,body:'missing'});}
 });
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('https://studio.fixture.invalid/test');
  for(const id of ['pitch','fretboard','rhythm','chord']){
   await page.evaluate(id=>CruiseStudio.seriesApps[id].activate(),id);
   try{await page.waitForFunction(id=>{const f=document.querySelector('#series-'+id+'-surface iframe');return f?.contentWindow?.SoundCruiseNativeSyncHost;},id,{timeout:5000});}
   catch(error){throw new Error(JSON.stringify({id,errors,host:await page.locator('#series-'+id+'-surface').textContent(),html:await page.locator('#series-'+id+'-surface').innerHTML()}));}
   assert.equal(await page.evaluate(id=>CruiseStudio.seriesApps[id].claimAudio(),id),true);
   const before=await page.evaluate(id=>{const f=document.querySelector('#series-'+id+'-surface iframe');window.oldHost=f.contentWindow.SoundCruiseNativeSyncHost;window.oldFrame=f.contentWindow;return nativeStartup;},id);
   const child=page.frameLocator('#series-'+id+'-surface iframe');
   await child.locator(id==='chord'?'.cc-refresh-app':'.js-reload-app').click();
   await page.waitForFunction(({id,before})=>{const f=document.querySelector('#series-'+id+'-surface iframe');return f?.contentWindow!==window.oldFrame&&nativeStartup===before+1;},{id,before});
   assert.equal(await page.evaluate(id=>{const f=document.querySelector('#series-'+id+'-surface iframe');return window.oldHost.storeOptions.signal.aborted&&f.contentWindow.SoundCruiseNativeSyncHost!==window.oldHost&&!f.contentWindow.SoundCruiseNativeSyncHost.storeOptions.signal.aborted;},id),true);
   assert.equal(await page.evaluate(id=>CruiseStudio.seriesApps[id].claimAudio(),id),true);
   await page.evaluate(id=>CruiseStudio.seriesApps[id].deactivate(),id);
  }
  assert.deepEqual(bad,[]);
  assert.equal(new URL(page.url()).pathname,'/test');
 }finally{await context.close();await browser.close();}
});
