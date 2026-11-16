const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const origin='http://127.0.0.1:18874',fixtures=path.join(__dirname,'fixtures/viewer-pdf'),out=process.env.VIEWER_PDF_QA_OUT;
const read=p=>p.evaluate(async()=>(await CruiseStudio.scoreViewer.ready()).read());
const state=p=>p.evaluate(async()=>(await CruiseStudio.scoreViewer.ready()).playback());
async function until(p,fn){let value;for(let i=0;i<1000;i++){value=await read(p);if(fn(value))return value;await p.waitForTimeout(20);}assert.fail(JSON.stringify(value));}
async function phase(p,value){for(let i=0;i<500;i++){if((await state(p))?.phase===value)return;await p.waitForTimeout(20);}assert.fail(JSON.stringify(await state(p)));}
const settled=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
for(const engine of ['chrome','webkit'])test('viewer PDF: '+engine,async t=>{
    const {viewerFixture}=await import('./helpers/viewer-fixture.mjs'),f=viewerFixture(),native=await f.contract.codec.encode(f.score,f.metadata);
    const browser=await(engine==='webkit'?webkit.launch():chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}));
    async function fresh(fn){const context=await browser.newContext({viewport:{width:1440,height:1000}}),p=await context.newPage(),errors=[],external=[];p.setDefaultTimeout(20000);
        p.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external.push(r.request().url());return r.abort();}return r.continue();});
        try{await p.goto(origin);await p.click('#open-score-viewer');await p.locator('[data-viewer-file]').waitFor({state:'attached'});await fn(p,context);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);}finally{await context.close();}}
    async function load(p,name='mixed.pdf'){const number=(await read(p))?.loadNumber||0,input=await p.locator('[data-pdf-file]').count()&&await p.locator('[data-pdf-action=open]').isVisible()?'[data-pdf-file]':'[data-viewer-file]';await p.locator(input).setInputFiles(path.join(fixtures,name));await until(p,r=>r?.kind==='pdf'&&r.name===name&&r.loadNumber>number);await p.locator('[data-pdf-page="1"][data-pdf-ready=true]').waitFor();}
    async function configure(p,mode='seconds',value=2){await p.click('[data-pdf-action=settings]');await p.locator('[data-pdf-mode]').selectOption(mode);await p.locator('[data-pdf-setting='+ (mode==='seconds'?'seconds':'beats')+']').fill(String(value));if(mode==='beats')await p.locator('[data-pdf-setting=bpm]').fill('120');await p.click('[data-pdf-action=settings-save]');await p.locator('.sv-settings').waitFor({state:'detached'});}
    try{
        await t.test('native canvas rendering preserves rotated pages without installing PDF scripts, links or editor controls',()=>fresh(async p=>{
            const before=await p.evaluate(()=>JSON.stringify({...localStorage}));await load(p);const r=await read(p);assert.equal(r.pages,3);assert.equal(await p.evaluate(()=>typeof __pdfExecuted),'undefined');
            assert.equal(await p.locator('.sv-pdf-paper iframe,.sv-pdf-paper a,.sv-pdf-paper input').count(),0);
            const pixels=await p.locator('[data-pdf-page="1"] canvas').evaluate(c=>{const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let dark=0;for(let i=0;i<data.length;i+=4)if(data[i]<180)dark++;return dark;});assert(pixels>1000);
            const first=await p.locator('[data-pdf-page="1"]').boundingBox(),second=await p.locator('[data-pdf-page="2"]').boundingBox();assert(first.height>first.width);assert(second.width>second.height);assert.equal(await p.evaluate(()=>JSON.stringify({...localStorage})),before);
            if(out){fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,engine+'-pdf-desktop.png')});const png=await p.locator('[data-pdf-page="1"] canvas').evaluate(c=>c.toDataURL('image/png').split(',')[1]);fs.writeFileSync(path.join(out,engine+'-page1.png'),Buffer.from(png,'base64'));}
        }));
        await t.test('scanned image PDF renders without text extraction or music recognition',()=>fresh(async p=>{await load(p,'scan.pdf');assert.equal((await read(p)).pages,2);if(out)await p.screenshot({path:path.join(out,engine+'-scan.png')});}));
        await t.test('zoom and portrait/landscape retain the semantic page and fraction; saved bytes reopen unchanged',()=>fresh(async p=>{
            await load(p);await settled(p);await p.locator('[data-pdf-page-input]').fill('2');await p.locator('[data-pdf-page-input]').press('Tab');await settled(p);
            await p.locator('.sv-pdf-viewport').evaluate(v=>{const page=v.querySelector('[data-pdf-page="2"]');v.scrollTop=page.offsetTop+page.offsetHeight*.25;});await settled(p);const before=await read(p);
            await p.click('[data-pdf-action=zoom-in]');await settled(p);const zoomed=await read(p);assert.equal(zoomed.zoom,1.1);assert(Math.abs(zoomed.anchor.position-before.anchor.position)<.04);
            for(const size of [{width:390,height:844},{width:844,height:390},{width:390,height:844}]){await p.setViewportSize(size);await settled(p);const r=await read(p);assert(Math.abs(r.anchor.position-before.anchor.position)<.04,JSON.stringify(r));}
            await p.locator('[data-pdf-page="2"][data-pdf-ready=true]').waitFor();if(out)await p.screenshot({path:path.join(out,engine+'-pdf-portrait.png')});await p.click('[data-pdf-action=save]');await p.waitForFunction(()=>document.querySelector('[data-pdf-action=save]').disabled);await p.waitForTimeout(250);
            const hash=(await read(p)).byteHash;await p.reload();await p.click('#open-score-viewer');await until(p,r=>r?.kind==='pdf');assert.equal((await read(p)).byteHash,hash);assert.equal((await read(p)).zoom,1.1);assert.equal((await state(p)).phase,'paused');
            const bytes=await p.evaluate(async()=>{const request=indexedDB.open('cruiseStudio.viewer.library.v1');return new Promise(resolve=>{request.onsuccess=()=>{const db=request.result,tx=db.transaction('revisions'),r=tx.objectStore('revisions').getAll();r.onsuccess=()=>{resolve(Array.from(r.result.find(r=>r.kind==='pdf').bytes));db.close();};};});});assert.deepEqual(Buffer.from(bytes),fs.readFileSync(path.join(fixtures,'mixed.pdf')));
        }));
        await t.test('seconds and beat modes scroll continuously; pause, manual detach, resume and end are explicit',()=>fresh(async p=>{
            await p.setViewportSize({width:390,height:844});await load(p);await p.click('[data-pdf-action=play]');await p.getByRole('dialog',{name:'PDFの送り設定'}).waitFor();await p.click('[data-pdf-action=dialog-close]');assert.equal((await state(p)).phase,'paused');
            await configure(p,'seconds',2);await p.click('[data-pdf-action=play]');await phase(p,'playing');
            const trace=await p.evaluate(()=>new Promise(resolve=>{const a=[];function sample(time){a.push({top:document.querySelector('.sv-pdf-viewport').scrollTop,time});if(a.length===25)resolve(a);else requestAnimationFrame(sample);}requestAnimationFrame(sample);})),motion=trace.map(v=>v.top),intervals=trace.slice(1).map((v,i)=>v.time-trace[i].time).sort((a,b)=>a-b),p95=intervals[Math.floor(intervals.length*.95)];assert(new Set(motion.map(Math.round)).size>10);assert(motion.at(-1)>motion[0]);assert(p95<50);if(out)fs.writeFileSync(path.join(out,engine+'-scroll.json'),JSON.stringify({p95ms:p95,samples:trace.length},null,2));
            await p.locator('.sv-pdf-viewport').hover();await p.mouse.wheel(0,150);await p.waitForFunction(()=>!document.querySelector('[data-pdf-action=follow]').hidden);const top=await p.locator('.sv-pdf-viewport').evaluate(v=>v.scrollTop);await p.waitForTimeout(150);assert(Math.abs(await p.locator('.sv-pdf-viewport').evaluate(v=>v.scrollTop)-top)<5);await p.click('[data-pdf-action=follow]');
            await p.locator('.sv-pdf-viewport').focus();await p.keyboard.press('Space');await phase(p,'paused');const at=(await state(p)).position;await p.waitForTimeout(100);assert.equal((await state(p)).position,at);
            await configure(p,'beats',2);assert.equal((await state(p)).settings.bpm,120);await p.click('[data-pdf-action=start]');await p.click('[data-pdf-action=play]');await phase(p,'ended');await settled(p);assert.equal((await state(p)).position,3);assert(await p.locator('[data-pdf-action=play]').isDisabled());
        }));
        await t.test('200 pages stay virtualized at high zoom; repeated replacement releases previous workers and canvases',()=>fresh(async p=>{
            const begin=Date.now();await load(p,'long-200.pdf');const elapsed=Date.now()-begin;assert.equal((await read(p)).pages,200);await p.locator('[data-pdf-page-input]').fill('180');await p.locator('[data-pdf-page-input]').press('Tab');await p.locator('[data-pdf-page="180"][data-pdf-ready=true]').waitFor();
            for(let i=0;i<20;i++)await p.click('[data-pdf-action=zoom-in]');await settled(p);await p.locator('[data-pdf-page="180"][data-pdf-ready=true]').waitFor();const big=await read(p);assert(big.stats.canvases>=1&&big.stats.canvases<=5&&big.stats.pixels<=20e6,JSON.stringify(big));
            for(let i=0;i<20;i++)await load(p,'mixed.pdf');await p.waitForTimeout(150);assert.equal((await read(p)).loadNumber,21);assert(p.workers().length<=1,p.workers().length+' workers');assert.equal(await p.locator('.sv-pdf-page').count(),3);assert((await read(p)).stats.canvases<=5);
            if(out)fs.writeFileSync(path.join(out,engine+'-limits.json'),JSON.stringify({initial200ms:elapsed,atZoom3:big.stats,workers:p.workers().length},null,2));
        }));
        await t.test('encrypted, oversized, too-many-page and malformed input keep the current score',()=>fresh(async p=>{
            await load(p);const hash=(await read(p)).byteHash;
            for(const [name,pattern]of [['encrypted.pdf','暗号化'],['over-201.pdf','200ページ']]){await p.locator('[data-pdf-file]').setInputFiles(path.join(fixtures,name));await p.waitForFunction(pattern=>document.querySelector('[data-pdf-status]').textContent.includes(pattern),pattern);assert.equal((await read(p)).byteHash,hash);}
            await p.locator('[data-pdf-file]').setInputFiles({name:'bad.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\nbroken')});await p.waitForFunction(()=>document.querySelector('[data-pdf-status]').textContent.includes('開けません'));assert.equal((await read(p)).byteHash,hash);
            await p.locator('[data-pdf-file]').setInputFiles({name:'huge.pdf',mimeType:'application/pdf',buffer:Buffer.alloc(20*1024*1024+1)});await p.waitForFunction(()=>document.querySelector('[data-pdf-status]').textContent.includes('20MiB'));assert.equal((await read(p)).byteHash,hash);
        }));
        await t.test('PDF and native formats switch through the same library without source writes or mixed controls',()=>fresh(async p=>{
            await load(p);const expected=(await read(p)).byteHash;await p.click('[data-pdf-action=save]');await p.waitForTimeout(200);await p.locator('[data-pdf-file]').setInputFiles({name:'score.cruise-score.json',mimeType:'application/json',buffer:Buffer.from(native.text)});await until(p,r=>r?.document?.revisionId===native.document.revisionId);assert(await p.locator('[data-viewer-action=play]').isVisible());assert(await p.locator('[data-pdf-action=play]').isHidden());
            await p.click('[data-viewer-action=library]');await p.locator('[data-viewer-action=library-open]').filter({hasText:'mixed.pdf'}).click();await until(p,r=>r?.kind==='pdf');assert.equal((await read(p)).byteHash,expected);
        }));
        await t.test('leaving during parser startup cancels the candidate and cannot replace or start the preceding score later',()=>fresh(async(p,context)=>{
            await p.locator('[data-viewer-file]').setInputFiles({name:'score.cruise-score.json',mimeType:'application/json',buffer:Buffer.from(native.text)});await until(p,r=>r?.document?.revisionId===native.document.revisionId);
            let release,seen=false;await context.route('**/pdf.worker.min.mjs',async r=>{seen=true;await new Promise(resolve=>release=resolve);await r.continue();});
            await p.locator('[data-viewer-file]').setInputFiles(path.join(fixtures,'mixed.pdf'));for(let i=0;i<100&&!seen;i++)await p.waitForTimeout(10);assert(seen);assert(await p.locator('[data-viewer-action=play]').isDisabled());
            await p.locator('#screen-score-viewer .workspace-home').click();release();await p.waitForTimeout(150);await p.click('#open-score-viewer');await until(p,r=>r?.document?.revisionId===native.document.revisionId);assert.equal((await state(p)).phase,'paused');assert.equal(await p.locator('.sv-pdf-page').count(),0);
        }));
        await t.test('a later canvas failure pauses scrolling and a numbered retry recovers without discarding the PDF',()=>fresh(async p=>{
            await p.evaluate(()=>{const original=HTMLCanvasElement.prototype.getContext;window.restorePDFCanvas=()=>HTMLCanvasElement.prototype.getContext=original;HTMLCanvasElement.prototype.getContext=function(...args){if(this.closest('[data-pdf-page=\"6\"]'))throw Error('synthetic canvas allocation failure');return original.apply(this,args);};});
            await load(p,'long-200.pdf');await configure(p,'seconds',1);await p.click('[data-pdf-action=play]');await p.waitForFunction(()=>document.querySelector('[data-pdf-retry=\"6\"]'));
            assert.equal((await state(p)).phase,'paused');assert(await p.locator('[data-pdf-action=play]').isDisabled());const hash=(await read(p)).byteHash;await p.evaluate(()=>restorePDFCanvas());await p.locator('[data-pdf-retry=\"6\"]').click();await p.locator('[data-pdf-page=\"6\"][data-pdf-ready=true]').waitFor();assert.equal((await read(p)).byteHash,hash);assert(await p.locator('[data-pdf-action=play]').isEnabled());
        }));
    }finally{await browser.close();}
});
