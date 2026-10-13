import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {Writable} from 'node:stream';
import {writeJSONReport} from './report-output.mjs';
test('cross-tab JSON >64KiB flushes fully through a backpressured pipe before child exits',async()=>{
 const url=new URL('./report-output.mjs',import.meta.url).href;
 const source=`import {writeJSONReport} from ${JSON.stringify(url)};await writeJSONReport({verdict:{pass:true},rounds:48,trace:'x'.repeat(1024*1024)});process.exit(0);`;
 const child=spawn(process.execPath,['--input-type=module','-e',source]),chunks=[];let stderr='';child.stderr.on('data',c=>stderr+=c);
 child.stdout.on('data',c=>{chunks.push(c);child.stdout.pause();setTimeout(()=>child.stdout.resume(),1);});
 const code=await new Promise((ok,no)=>{child.on('error',no);child.on('close',ok);});assert.equal(code,0,stderr);
 const body=Buffer.concat(chunks).toString();assert(body.length>65536);const json=JSON.parse(body);
 assert.equal(json.verdict.pass,true);assert.equal(json.rounds,48);assert.equal(json.trace.length,1024*1024);assert(body.endsWith('\n'));
});
test('failed JSON stream cannot be reported as successful flush',async()=>{
 const stream=new Writable({write(_chunk,_encoding,done){done(Error('fixture output error'));}});stream.on('error',()=>{});
 await assert.rejects(writeJSONReport({verdict:{pass:true}},stream),/fixture output error/);
});
