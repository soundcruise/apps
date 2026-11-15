const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {pathToFileURL}=require('node:url'),{chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'../../..'),origin='http://127.0.0.1:18874';
for(const engine of ['chrome','webkit'])test('Pre-DTM exports inherited confirmed guitar voicing through the real MIDI button: '+engine,async()=>{
 const {fixture}=await import(pathToFileURL(path.join(root,'apps/cruise-studio/tests/helpers/chord-form-fixture.mjs'))),f=fixture();
 assert(f.s().runOperation('carry fixture',p=>{p.bars[0].chords=p.bars[0].chords.slice(0,1);p.bars[0].chords[0].symbol='C';delete p.bars[0].chords[0].durationTicks;p.bars[1].chords=[];}).ok);assert(f.adopt().ok);
 const project=f.s().workingSnapshot(),browser=await(engine==='chrome'?chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}):webkit.launch());
 try{
  const context=await browser.newContext(),p=await context.newPage(),errors=[],external=[];
  await context.route('**/*',r=>{if(new URL(r.request().url()).origin!==origin){external.push(r.request().url());return r.abort();}return r.continue();});
  p.setDefaultTimeout(5000);p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
  await p.goto(origin);await p.locator('#open-sheet-cruise').click();await p.locator('#sc-import-json').setInputFiles({name:'carry.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});
  await p.waitForFunction(()=>CruiseStudio.sheetCruise.getSession().draft.projectId==='A');
  const before=await p.evaluate(()=>CruiseStudio.sheetCruise.getSession().workingSnapshot());
  // Pre-DTM is not a published navigation entry; open its existing development workspace.
  await p.evaluate(()=>CruiseStudio.shellHost.navigate('preDtm'));
  const result=await p.evaluate(()=>{const a=CruiseStudio.arrangement.generateArrangement(CruiseStudio.documents.getSession().workingSnapshot());return {bars:a.bars.slice(0,2).map(b=>({strokes:b.guitar.length,notes:b.guitarNotes.length})),total:a.bars.reduce((n,b)=>n+b.guitarNotes.length,0)};});
  assert.equal(result.bars[1].notes,result.bars[1].strokes*5);assert(result.bars[1].notes>0);
  const download=p.waitForEvent('download');await p.locator('#pd-export-midi').click();const bytes=fs.readFileSync(await(await download).path()),parsed=f.C.midi.inspectSmf(new Uint8Array(bytes));
  assert(parsed.ok);assert.equal(parsed.trackNoteOns.at(-1),result.total);
  assert.deepEqual(await p.evaluate(()=>CruiseStudio.documents.getSession().workingSnapshot()),before);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 }finally{await browser.close();}
});
