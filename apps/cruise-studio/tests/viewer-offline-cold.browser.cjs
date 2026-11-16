// Stops ONLY the explicitly supplied, cwd-verified loopback fixture server,
// proves disk cold start with its TCP port closed, and restores it in finally.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),net=require('node:net'),crypto=require('node:crypto');
const {execFileSync,spawn}=require('node:child_process'),{chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'../../..'),base='http://127.0.0.1:18874/apps/score-viewer/local/',out=process.env.VIEWER_MOBILE_QA_OUT;
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
async function until(p,fn){let value;for(let i=0;i<1000;i++){value=await p.evaluate(()=>CruiseViewer.view.read());if(fn(value))return value;await sleep(20);}assert.fail(JSON.stringify(value));}
async function playing(p){for(let i=0;i<500;i++){const s=await p.evaluate(()=>CruiseViewer.view.playback());if(s.phase==='playing')return s;if(s.reason==='audio-error')assert.fail(JSON.stringify(s));await sleep(20);}assert.fail('playback did not start');}
const portOpen=()=>new Promise(resolve=>{const socket=net.connect(18874,'127.0.0.1');socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>resolve(false));});
const launchChrome=dir=>chromium.launchPersistentContext(dir,{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',viewport:{width:390,height:844}});
test((process.env.VIEWER_COLD_USE_MOCK_SYNC?'received mock Sync files: ':'')+'real TCP disconnect: Chrome disk restart and WebKit new page preserve native/PDF reading and sound',async t=>{
    const pid=Number(process.env.VIEWER_LOCAL_SERVER_PID);assert(Number.isInteger(pid)&&pid>1,'Set VIEWER_LOCAL_SERVER_PID to the existing local fixture process');
    const cwd=execFileSync('lsof',['-a','-p',String(pid),'-d','cwd','-Fn'],{encoding:'utf8'});assert(cwd.includes('\nn'+root+'\n'));assert(execFileSync('ps',['-p',String(pid),'-o','command='],{encoding:'utf8'}).includes('serve-local-ui.py'));
    const {viewerFixture}=await import('./helpers/viewer-fixture.mjs'),f=viewerFixture(),file=await f.contract.codec.encode(f.score,f.metadata),pdf=fs.readFileSync(path.join(__dirname,'fixtures/viewer-pdf/mixed.pdf')),profiles=new Map(),expectedPNG=new Map();let stopped=false,webkitBrowser=null,webkitContext=null;
    try{
        for(const engine of ['chrome','webkit']){
            const dir=fs.mkdtempSync(path.join(os.tmpdir(),'viewer-offline-'+engine+'-'));profiles.set(engine,dir);
            if(engine==='webkit'){webkitBrowser=await webkit.launch();webkitContext=await webkitBrowser.newContext({viewport:{width:390,height:844}});}
            const c=engine==='chrome'?await launchChrome(dir):webkitContext,p=c.pages()[0]||await c.newPage();p.setDefaultTimeout(20000);
            try{await p.goto(base+'index.html');await p.waitForFunction(()=>window.CruiseViewer);
                let incomingNative=null,sender=null;
                if(process.env.VIEWER_COLD_USE_MOCK_SYNC){
                    sender=await(engine==='chrome'?chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}):webkit.launch());
                    try{const source=await sender.newPage();await source.goto(base+'index.html');await source.waitForFunction(()=>!!window.CruiseViewer);
                        const incomingPDF=await source.evaluate(bytes=>CruiseViewer.mock.sync.publish({bytes:new Uint8Array(bytes),kind:'viewer_pdf',title:'offline.pdf'}),Array.from(pdf));
                        incomingNative=await source.evaluate(text=>CruiseViewer.mock.sync.publish({bytes:text,kind:'viewer_score'}),file.text);
                        await p.evaluate(async record=>{await CruiseViewer.mock.sync.refresh();await CruiseViewer.mock.sync.download(record);await CruiseViewer.mock.sync.apply(record);},incomingPDF);
                    }finally{await sender.close();}
                }else assert(await p.evaluate(bytes=>CruiseViewer.view.openBytes(new Uint8Array(bytes),{name:'offline.pdf'}),Array.from(pdf)));
                await p.locator('[data-pdf-page="1"][data-pdf-ready=true]').waitFor();
                expectedPNG.set(engine,hash(await p.locator('[data-pdf-page="1"] canvas').evaluate(c=>c.toDataURL())));if(!incomingNative)await p.click('[data-pdf-action=save]');await p.waitForFunction(()=>document.querySelector('[data-pdf-action=save]').textContent==='端末に保存済み');
                if(incomingNative)await p.evaluate(async record=>{await CruiseViewer.mock.sync.download(record);await CruiseViewer.mock.sync.apply(record);},incomingNative);
                else assert(await p.evaluate(text=>CruiseViewer.view.openBytes(text),file.text));await p.click('[data-viewer-action=playback-settings]');for(const key of ['chords','melody','metronome'])await p.locator('[data-viewer-volume='+key+']').evaluate(e=>{e.value='0';e.dispatchEvent(new Event('input',{bubbles:true}));});await p.getByRole('button',{name:'完了',exact:true}).click();if(!incomingNative)await p.click('[data-viewer-action=save]');await p.waitForFunction(()=>document.querySelector('[data-viewer-action=save]').textContent==='端末に保存済み');await sleep(250);
                await p.locator('.sv-device-options summary').click();await p.click('#viewer-offline-prepare');await p.waitForFunction(()=>document.querySelector('#viewer-offline-status').textContent.includes('準備済み'),{},{timeout:120000});
            }finally{if(engine==='chrome')await c.close();else for(const page of c.pages())await page.close();}
        }
        process.kill(pid,'SIGTERM');stopped=true;for(let i=0;i<100&&await portOpen();i++)await sleep(30);assert.equal(await portOpen(),false,'Server must really be unavailable');
        const results=await Promise.allSettled([...profiles].map(async([engine,dir])=>{
            const c=engine==='chrome'?await launchChrome(dir):webkitContext,p=c.pages()[0]||await c.newPage(),errors=[],external=[];p.setDefaultTimeout(20000);p.on('pageerror',e=>errors.push(e.message));c.on('request',r=>{const u=new URL(r.url());if(u.origin!=='http://127.0.0.1:18874'&&!['data:','blob:'].includes(u.protocol))external.push(r.url());});
            try{
                await p.goto(base+'index.html');await p.waitForFunction(()=>window.CruiseViewer);const r=await until(p,r=>r?.document?.revisionId===file.document.revisionId);assert.equal(r.byteHash,file.byteHash);assert.deepEqual(r.document.score,f.score);assert(await p.locator('.sv-paper .sheet-form-event svg').count()>0);
                assert(await p.evaluate(()=>navigator.serviceWorker.controller?.scriptURL.endsWith('/apps/score-viewer/local/sw.js')));assert.equal(await p.evaluate(async()=>{try{await fetch('./not-cached.txt');return true;}catch{return false;}}),false);
                if(process.env.VIEWER_COLD_USE_MOCK_SYNC){const records=await p.evaluate(()=>CruiseViewer.mock.sync.catalog());assert(records.some(r=>r.descriptor.asset.kind==='viewer_pdf'));assert(records.some(r=>r.descriptor.asset.kind==='viewer_score'));assert.equal(await p.evaluate(async()=>{try{await CruiseViewer.mock.sync.refresh();return true;}catch{return false;}}),false);const cached=await p.evaluate(async()=>{const all=[];for(const key of await caches.keys())all.push(...(await(await caches.open(key)).keys()).map(r=>r.url));return all;});assert(!cached.some(u=>u.includes('/mock-sync/')));}
                await p.click('[data-viewer-action=play]');await playing(p);await sleep(200);const sound=await p.evaluate(()=>CruiseViewer.view.playback());assert(sound.stats.parts.guitar>0&&sound.stats.parts.piano>0);assert.equal(sound.settings.mix.chords,0);assert.equal(sound.settings.mix.melody,0);await p.click('[data-viewer-action=play]');await p.evaluate(()=>CruiseStudio.audio.stopAll());
                await p.locator('.sv-file-menu:visible').evaluate(e=>e.open=true);await p.click('[data-viewer-action=library]');await p.locator('[data-viewer-action=library-open]').filter({hasText:'offline.pdf'}).click();await until(p,r=>r?.kind==='pdf');await p.locator('[data-pdf-page="1"][data-pdf-ready=true]').waitFor();const png=hash(await p.locator('[data-pdf-page="1"] canvas').evaluate(c=>c.toDataURL()));assert.equal(png,expectedPNG.get(engine),'Offline rendering, including Japanese CMap, must match online');
                await p.click('[data-pdf-action=settings]');await p.locator('[data-pdf-advanced]').evaluate(e=>e.open=true);await p.locator('[data-pdf-setting=seconds]').fill('10');await p.click('[data-pdf-action=settings-save]');await p.click('[data-pdf-action=play]');await sleep(120);assert((await p.evaluate(()=>CruiseViewer.view.playback())).position>0);await p.click('[data-pdf-action=play]');
                if(out){fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,engine+'-offline-cold.png')});fs.writeFileSync(path.join(out,engine+'-offline-proof.json'),JSON.stringify({serverPortOpen:false,browserRestarted:engine==='chrome',freshPage:true,sourceHash:r.byteHash,pdfPNG:png,parts:sound.stats.parts,worker:await p.evaluate(()=>navigator.serviceWorker.controller.scriptURL)},null,2));}
                await p.click('#viewer-return');assert(await p.locator('#score-viewer-card').isVisible());assert.deepEqual(errors,[]);assert.deepEqual(external,[]);return engine+' cold native + audio + PDF + Port passed';
            }finally{await c.close();}
        }));
        for(const result of results)await t.test(result.status==='fulfilled'?result.value:'offline cold start failure',()=>{if(result.status==='rejected')throw result.reason;});
    }finally{
        if(stopped){const fd=fs.openSync('/private/tmp/viewer-stage4-restored-server.log','a'),child=spawn('python3',['apps/cruise-studio/scripts/serve-local-ui.py'],{cwd:root,detached:true,stdio:['ignore',fd,fd]});child.unref();fs.closeSync(fd);fs.writeFileSync('/private/tmp/viewer-stage4-restored-server.pid',String(child.pid));for(let i=0;i<200&&!await portOpen();i++)await sleep(30);assert(await portOpen(),'Local server failed to restart');}
        await webkitBrowser?.close();
        for(const dir of profiles.values())fs.rmSync(dir,{recursive:true,force:true});
    }
});
