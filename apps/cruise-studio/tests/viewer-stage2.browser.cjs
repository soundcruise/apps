const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,webkit}=require('playwright');
const origin='http://127.0.0.1:18874',out=process.env.VIEWER_QA_OUT;
const state=p=>p.evaluate(async()=>(await CruiseStudio.scoreViewer.ready()).playback());
async function waitState(p,predicate){let last;for(let i=0;i<750;i++){last=await state(p);if(predicate(last))return last;await p.waitForTimeout(20);}assert.fail('playback state timeout: '+JSON.stringify(last));}
const data=p=>p.evaluate(async()=>{const r=(await CruiseStudio.scoreViewer.ready()).read();return JSON.stringify({document:r.document,hash:r.byteHash,storage:{...localStorage}});});
const range=async(p,selector,value)=>p.locator(selector).evaluate((e,value)=>{e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));},value);
const paused=async p=>{await p.locator('.sv-viewport').focus();await p.keyboard.press('Space');await waitState(p,s=>s.phase==='paused');};
for(const engine of ['chrome','webkit'])test('viewer stage 2: '+engine,async t=>{
    const {viewerFixture}=await import('./helpers/viewer-fixture.mjs'),f=viewerFixture(),{longProject}=require('../scripts/measure-score-geometry.cjs');
    const file=await f.contract.codec.encode(f.score,f.metadata),long=await f.contract.codec.encode(longProject(f.score,128),f.metadata);
    const browser=await(engine==='webkit'?webkit.launch():chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}));
    async function fresh(fn,{large=false}={}){
        const c=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),p=await c.newPage(),errors=[],external=[];p.setDefaultTimeout(15000);p.on('pageerror',e=>errors.push(e.message));
        await c.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external.push(r.request().url());return r.abort();}return r.continue();});
        await require('./helpers/viewer-regression-choices.cjs').discardTemporaryViewerFiles(c);
        try{await p.goto(origin);await p.click('#open-score-viewer');await p.locator('[data-viewer-action=open]').waitFor({state:'attached'});await p.locator('[data-viewer-file]').setInputFiles({name:'stage2.cruise-score.json',mimeType:'application/json',buffer:Buffer.from((large?long:file).text)});await p.locator('.sv-paper .sheet-title').waitFor();await fn(p,c);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);}finally{await c.close();}
    }
    async function settings(p){await p.click('[data-viewer-action=playback-settings]');await p.getByRole('dialog',{name:'音設定',exact:true}).waitFor();}
    async function done(p){await p.getByRole('button',{name:'完了',exact:true}).click();await p.getByRole('dialog').waitFor({state:'detached'});}
    async function mute(p){await settings(p);for(const key of ['chords','melody','metronome'])await range(p,'[data-viewer-volume='+key+']',0);await done(p);}
    async function tempo(p,value){await p.locator('[data-viewer-tempo]').fill(String(value));await p.locator('[data-viewer-tempo]').press('Tab');}
    async function play(p){await p.click('[data-viewer-action=play]');await waitState(p,s=>s.phase==='playing');}
    try{
        await t.test('display preview cancels atomically; saved toggles/fonts/colors never alter the file',()=>fresh(async p=>{
            const before=await data(p);await p.click('[data-viewer-action=display]');await p.locator('[data-viewer-visible=chords]').uncheck();await p.locator('[data-viewer-visible=forms]').uncheck();await range(p,'[data-viewer-size=lyricsSize]',20);
            assert.equal(await p.locator('.sv-paper .sheet-bar-chord').count(),0);assert.equal(await p.locator('.sv-paper .sheet-bar-forms').count(),0);assert.equal(await data(p),before);
            if(out){fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,engine+'-settings-desktop.png')});await p.setViewportSize({width:390,height:844});const box=await p.locator('.sv-settings').boundingBox();assert(box.x>=0&&box.x+box.width<=390);await p.screenshot({path:path.join(out,engine+'-settings-portrait.png')});await p.setViewportSize({width:1440,height:1000});}
            await p.click('[data-viewer-display-cancel]');await p.locator('.sv-settings').waitFor({state:'detached'});assert.equal(await p.locator('.sv-paper .sheet-bar-chord').count(),12);
            await p.click('[data-viewer-action=display]');await p.locator('[aria-label="歌詞の書体"]').selectOption('serif');await range(p,'[data-viewer-size=lyricsSize]',18);await p.locator('[data-viewer-visible=showArtist]').uncheck();await p.click('[data-viewer-display-save]');await p.locator('.sv-settings').waitFor({state:'detached'});
            assert.equal(await data(p),before);assert(await p.locator('.sv-paper .sheet-artist').isHidden());
            if(out){fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,engine+'-display.png')});}
        }));
        let shared;
        await t.test('named presets persist locally and export presentation only',()=>fresh(async p=>{
            await p.click('[data-viewer-action=display]');await range(p,'[data-viewer-size=lyricsSize]',21);await p.locator('[data-viewer-visible=strum]').uncheck();
            await p.getByRole('button',{name:'新規保存',exact:true}).click();await p.locator('[aria-label="プリセット名"]').fill('演奏用');
            await p.locator('.sv-presets').getByRole('button',{name:'保存',exact:true}).click();await p.waitForFunction(()=>document.querySelector('[data-viewer-preset-status]').textContent.includes('保存しました'));
            const pending=p.waitForEvent('download');await p.click('[data-viewer-preset-export]');const download=await pending;shared=fs.readFileSync(await download.path());
            const x=JSON.parse(shared.toString());assert.equal(x.presentation.layout.lyricsSize,21);assert.equal(x.presentation.layout.appearance.visibility.strum,false);assert(!shared.toString().includes(f.score.projectId));assert(!('playback' in x||'bpm'in x.presentation));
            await p.click('[data-viewer-display-save]');await p.locator('.sv-settings').waitFor({state:'detached'});await p.click('[data-viewer-action=display]');await p.locator('[aria-label="表示プリセット"] option[value="演奏用"]').waitFor({state:'attached'});await p.click('[data-viewer-display-cancel]');
        }));
        await t.test('a separate profile previews and imports the shared preset; malformed input keeps the current display',()=>fresh(async p=>{
            const before=await data(p);await p.click('[data-viewer-action=display]');await p.locator('[data-viewer-preset-file]').setInputFiles({name:'shared.cruise-view-preset.json',mimeType:'application/json',buffer:shared});await p.waitForFunction(()=>document.querySelector('[data-viewer-preset-status]').textContent.includes('プレビュー'));
            assert.equal(await p.locator('.sv-paper .sheet-bar-strum').count(),0);assert.equal(await p.locator('[data-viewer-size=lyricsSize]').inputValue(),'21');assert.equal(await data(p),before);
            await p.locator('[data-viewer-preset-file]').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{')});await p.waitForFunction(()=>document.querySelector('[data-viewer-preset-status]').textContent.includes('読み込めません'));assert.equal(await p.locator('.sv-paper .sheet-bar-strum').count(),0);
            await p.click('[data-viewer-display-cancel]');await p.locator('.sv-settings').waitFor({state:'detached'});assert.equal(await p.locator('.sv-paper .sheet-bar-strum').count(),12);
            await p.click('[data-viewer-action=display]');await p.locator('[data-viewer-preset-file]').setInputFiles({name:'shared.json',mimeType:'application/json',buffer:shared});await p.waitForFunction(()=>document.querySelector('[data-viewer-preset-status]').textContent.includes('プレビュー'));await p.click('[data-viewer-display-save]');await p.locator('.sv-settings').waitFor({state:'detached'});assert.equal(await p.locator('.sv-paper .sheet-bar-strum').count(),0);
        }));
        await t.test('real banks decode and stream both parts; live tempo, mute, hidden parts and Space keep source immutable',()=>fresh(async p=>{
            const before=await data(p);await mute(p);await play(p);await p.waitForTimeout(220);const a=await state(p);assert(a.stats.parts.guitar>0&&a.stats.parts.piano>0);assert.equal(a.settings.mix.chords,0);
            await tempo(p,200);const b=await state(p);assert.equal(b.settings.bpm,200);assert(b.tick>=a.tick);assert.equal(b.phase,'playing');
            await p.click('[data-viewer-action=display]');await p.locator('[data-viewer-visible=chords]').uncheck();await p.locator('[data-viewer-visible=doremi]').uncheck();await p.click('[data-viewer-display-save]');await p.locator('.sv-settings').waitFor({state:'detached'});const old=(await state(p)).stats.parts;
            await p.waitForTimeout(400);const later=await state(p);assert(later.stats.parts.guitar>old.guitar);assert(later.stats.parts.piano>old.piano);assert.equal(await data(p),before);
            await paused(p);const tick=(await state(p)).tick;await p.waitForTimeout(120);assert.equal((await state(p)).tick,tick);await p.keyboard.press('Space');await waitState(p,s=>s.phase==='playing');assert((await state(p)).tick>=tick);
            await p.evaluate(()=>CruiseStudio.audio.stopAll());await waitState(p,s=>s.contextState==='closed');assert.equal((await state(p)).nodes,0);
        }));
        await t.test('native offline rendering produces real guitar/piano output, independent mixes and the reference waveform',()=>fresh(async p=>{
            const result=await p.evaluate(async()=>{
                const C=CruiseStudio,reader=(await C.scoreViewer.ready()).read(),score=reader.document.score;
                const {createStudioViewerContract}=await import('/apps/cruise-studio/js/modules/sheet-cruise/viewer-contract.mjs');
                const {createViewerSamples}=await import('/apps/cruise-studio/js/modules/sheet-cruise/viewer-samples.mjs');
                const {pickOffset,tickTime,musicalEnd}=await import('/apps/score-viewer/core/audio-player.mjs');
                const contract=createStudioViewerContract({schema:C.model.schema2}),plan=contract.tickPlan(score),sample={time:.03,anchorTime:.03,tick:0,bpm:100};
                const next=plan.events.filter(e=>!['click','count'].includes(e.part)).map(e=>{const attack=tickTime(sample,e.tick);return {...e,start:attack+pickOffset(e,100),duration:musicalEnd(e,plan,sample,attack)-attack-pickOffset(e,100)};}).filter(e=>e.start<2&&e.duration>.0001);
                const old=contract.playbackPlan(score,{bpm:100}).events.filter(e=>e.start<2&&e.duration>.0001);
                const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext,load=createViewerSamples(C),decode=new Offline(1,96000,48000),buffers=new Map();
                await Promise.all(next.map(async e=>{const key=e.part+':'+e.midi;if(!buffers.has(key))buffers.set(key,load(decode,e.midi,e.part));}));
                for(const [key,value]of buffers)buffers.set(key,await value);
                async function render(events,mix){
                    const ctx=new Offline(1,96000,48000);
                    for(const e of events){const asset=buffers.get(e.part+':'+e.midi),source=ctx.createBufferSource(),gain=ctx.createGain(),end=Math.min(e.start+e.duration,e.start+asset.buffer.duration/Math.pow(2,(e.midi-asset.midi)/12));
                        source.buffer=asset.buffer;source.playbackRate.value=Math.pow(2,(e.midi-asset.midi)/12);source.connect(gain);gain.connect(ctx.destination);
                        const volume=e.gain*(e.part==='piano'?mix[1]:mix[0]);if(!volume)continue;
                        const release=Math.min(e.part==='guitar'?.045:.35,(end-e.start)*.35);gain.gain.setValueAtTime(0,e.start);gain.gain.linearRampToValueAtTime(volume,e.start+Math.min(.005,(end-e.start)/4));gain.gain.setValueAtTime(volume,end-release);gain.gain.exponentialRampToValueAtTime(.0001,end);source.start(e.start);source.stop(end);
                    }
                    return (await ctx.startRendering()).getChannelData(0);
                }
                const reference=await render(old,[1,1]),both=await render(next,[1,1]),guitar=await render(next,[1,0]),piano=await render(next,[0,1]),silent=await render(next,[0,0]);
                const rms=a=>Math.sqrt(a.reduce((n,x)=>n+x*x,0)/a.length);let difference=0,error=0,linearity=0;for(let i=0;i<both.length;i++){const delta=reference[i]-both[i];error+=delta*delta;difference=Math.max(difference,Math.abs(delta));linearity=Math.max(linearity,Math.abs(both[i]-guitar[i]-piano[i]));}
                return {guitar:rms(guitar),piano:rms(piano),silent:rms(silent),difference,relativeError:Math.sqrt(error/both.length)/rms(both),linearity};
            });
            // Native engines quantize tiny floating-point start/envelope changes
            // differently. Tick/onset equality is also checked independently in Node.
            assert(result.guitar>.00001&&result.piano>.00001,JSON.stringify(result));assert.equal(result.silent,0);assert(result.difference<.001&&result.relativeError<.001,JSON.stringify(result));assert(result.linearity<.00001,JSON.stringify(result));
            if(out)fs.writeFileSync(path.join(out,engine+'-audio.json'),JSON.stringify(result,null,2));
        }));
        await t.test('saved practice settings and position reopen stopped; repeated workspace exits release audio ownership',()=>fresh(async p=>{
            await mute(p);await tempo(p,180);await p.click('[data-viewer-action=save]');await p.waitForFunction(()=>document.querySelector('[data-viewer-action=save]').textContent==='端末に保存済み');
            await play(p);await p.waitForTimeout(200);await paused(p);const tick=(await state(p)).tick;await p.waitForTimeout(250);await p.reload();await p.click('#open-score-viewer');await p.locator('.sv-paper .sheet-title').waitFor();
            const restored=await state(p);assert.equal(restored.phase,'paused');assert.equal(restored.settings.bpm,180);assert.equal(restored.settings.mix.melody,0);assert(Math.abs(restored.tick-tick)<1);assert.equal(restored.contextState,'closed');
            for(let i=0;i<4;i++){await play(p);await p.locator('#screen-score-viewer .workspace-home').click();await waitState(p,s=>s.contextState==='closed');assert.equal((await state(p)).nodes,0);await p.click('#open-score-viewer');await p.locator('.sv-paper .sheet-title').waitFor();assert.equal((await state(p)).phase,'paused');}
        }));
        await t.test('continuous row motion follows the beat; manual scroll detaches only the viewport and can rejoin',()=>fresh(async p=>{
            await p.setViewportSize({width:390,height:844});await mute(p);await tempo(p,400);await play(p);await waitState(p,s=>s.tick>4500);
            const motion=await p.evaluate(()=>new Promise(resolve=>{const values=[];function frame(){values.push(document.querySelector('.sv-viewport').scrollTop);if(values.length===25)resolve(values);else requestAnimationFrame(frame);}requestAnimationFrame(frame);}));
            assert(new Set(motion.map(n=>Math.round(n))).size>8);assert(motion.at(-1)>motion[0]);assert(Math.max(...motion.slice(1).map((n,i)=>Math.abs(n-motion[i])))<180);
            assert.equal(await p.locator('.sv-playing').count(),1);assert.equal(await p.locator('[data-viewer-playhead]').count(),1);
            await p.locator('.sv-viewport').hover();await p.mouse.wheel(0,200);await p.waitForFunction(()=>!document.querySelector('[data-viewer-action=follow]').hidden);
            const detached=await state(p),top=await p.locator('.sv-viewport').evaluate(e=>e.scrollTop);await p.waitForTimeout(180);assert((await state(p)).tick>detached.tick);assert(Math.abs(await p.locator('.sv-viewport').evaluate(e=>e.scrollTop)-top)<10);
            await p.click('[data-viewer-action=follow]');assert(await p.locator('[data-viewer-action=follow]').isHidden());await p.setViewportSize({width:844,height:390});await p.waitForTimeout(120);assert.equal((await state(p)).phase,'playing');
            assert.equal(await p.locator('.sv-playing').count(),1);assert.equal(await p.locator('[data-viewer-playhead]').count(),1);
            if(out)await p.screenshot({path:path.join(out,engine+'-playing-landscape.png')});await paused(p);
        },{large:true}));
        await t.test('count-in, metronome and stopped-bar start share one owned context; input/dialog Space is isolated',()=>fresh(async p=>{
            await mute(p);await tempo(p,400);await settings(p);await p.locator('[data-viewer-playback=countIn]').check();await p.locator('[data-viewer-playback=metronome]').check();await done(p);
            await p.click('[data-viewer-action=play]');await waitState(p,s=>s.phase==='counting');const count=await state(p);assert.equal(count.tick,0);assert.equal(count.stats.parts.count,4,JSON.stringify(count));
            await waitState(p,s=>s.phase==='playing');await p.waitForTimeout(180);assert((await state(p)).stats.parts.click>0);await paused(p);
            const base=(await state(p)).tick;await p.locator('[data-viewer-tempo]').focus();await p.keyboard.press('Space');assert.equal((await state(p)).phase,'paused');assert.equal((await state(p)).tick,base);
            await p.locator('.sheet-bar[data-bar-number="1"]').click({position:{x:5,y:5}});await p.locator('.sv-paper .sheet-bar[data-bar-number="2"]').click({position:{x:10,y:10}});assert((await p.locator('[data-viewer-selection]').innerText()).includes('2小節'));await p.click('[data-viewer-action=play]');await waitState(p,s=>s.phase==='playing');assert((await state(p)).tick>=1920);
            await p.locator('#screen-score-viewer .workspace-home').click();await p.waitForFunction(()=>CruiseStudio.shellHost.getActiveWorkspace()==='home');assert.equal((await state(p)).nodes,0);assert.equal((await state(p)).contextState,'closed');
        }));
        await t.test('global stop revokes a delayed sample load so it can never start afterwards',()=>fresh(async(p,c)=>{
            let release,seen=false;await c.route('**/vendor/guitar/acoustic-bank.js',async r=>{seen=true;await new Promise(resolve=>release=resolve);await r.continue();});
            await p.click('[data-viewer-action=play]');for(let i=0;i<50&&!seen;i++)await p.waitForTimeout(20);assert(seen);assert.equal((await state(p)).phase,'loading');
            await p.evaluate(()=>CruiseStudio.audio.stopAll());release();await p.waitForTimeout(200);assert.equal((await state(p)).nodes,0);assert.equal((await state(p)).phase,'paused');assert.equal((await state(p)).contextState,'closed');
        }));
    }finally{await browser.close();}
});
