import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{createRepository}=require('../js/core/project-repository.js');
test('a locked entrance cannot execute keyboard commands even outside an inert workspace',()=>{
 const {createRouter}=require('../js/core/command-router.js');let authorized=false,calls=0;
 const router=createRouter(()=>({authorized}));router.register({id:'edit',target:()=>({}),canExecute:()=>true,execute:()=>{calls++;return {consumed:true};}});
 assert.equal(router.execute('edit').consumed,false);assert.equal(calls,0);authorized=true;assert.equal(router.execute('edit').consumed,true);assert.equal(calls,1);
});

test('existing Project lock runs entrance validation before save/delete, preserving stored bytes on refusal',async()=>{
 const values=new Map([['cruiseStudio.project.p','preserved']]);let lockCount=0,validationCount=0;
 const repo=createRepository({storage:{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},
  locks:{request:async(_name,_options,fn)=>{lockCount++;return fn();}},authorizeWrite:async()=>{validationCount++;return false;},canWrite:()=>false});
 assert.equal((await repo.save({target:{type:'project',projectId:'p'},snapshot:{},baseRevision:'preserved'})).code,'studio-entry-required');
 assert.equal((await repo.remove({type:'project',projectId:'p'},'preserved')).code,'studio-entry-required');
 assert.equal(values.get('cruiseStudio.project.p'),'preserved');assert.equal(lockCount,2);assert.equal(validationCount,2);assert.equal(repo.canWrite(),false);
});

function mediaFixture(){
 let authorized=true,revision=1,release,stopped=0;
 const stream={getTracks:()=>[{stop:()=>stopped++}]};
 const doc={head:{append(){}},getElementById:()=>true};
 const child={location:{origin:'https://fixture.invalid'},document:doc,navigator:{mediaDevices:{getUserMedia:()=>new Promise(r=>release=r)}}};
 const entry={isAuthorized:()=>authorized,read:()=>({revision})};
 const window={CruiseStudio:{entryAuth:entry}},frame={contentWindow:child,inert:false,isConnected:true,closest:()=>null};
 vm.runInNewContext(fs.readFileSync(new URL('../js/core/native-port-presentation.js',import.meta.url),'utf8'),{window,location:child.location,DOMException});
 window.CruiseStudio.presentNativePort(frame);
 return {child,frame,stream,stop:()=>window.CruiseStudio.stopNativePort(frame),lock(){authorized=false;revision++;},resolve(){release(stream);},stopped:()=>stopped};
}
test('late native microphone permission cannot revive audio after entrance invalidation',async()=>{
 const f=mediaFixture(),pending=f.child.navigator.mediaDevices.getUserMedia({audio:true});f.lock();f.resolve();await assert.rejects(pending,/qualification changed/);assert.equal(f.stopped(),1);
});
test('native retained document stops active media and refuses stale Account iframe starts',async()=>{
 const f=mediaFixture(),pending=f.child.navigator.mediaDevices.getUserMedia({audio:true});f.resolve();assert.equal(await pending,f.stream);f.stop();assert.equal(f.stopped(),1);f.frame.inert=true;await assert.rejects(f.child.navigator.mediaDevices.getUserMedia({audio:true}),/locked/);
});
