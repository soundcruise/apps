import test from 'node:test';import assert from 'node:assert/strict';
import {outputContextTime,createOutputPosition} from '../../score-viewer/core/output-position.mjs';
test('output timestamp maps device presentation time without double subtracting latency',()=>{
 const c={currentTime:10,baseLatency:.02,outputLatency:.15,getOutputTimestamp:()=>({contextTime:9.7,performanceTime:990})};assert(Math.abs(outputContextTime(c,1000)-9.71)<1e-9);assert.equal(c.currentTime,10);
 assert.equal(outputContextTime({...c,getOutputTimestamp:()=>({contextTime:0,performanceTime:0})},1000),9.83);
 assert.equal(outputContextTime({...c,getOutputTimestamp(){throw Error();}},1000),9.83);
 assert.equal(outputContextTime({...c,getOutputTimestamp:()=>({contextTime:10.5,performanceTime:1000})},1000),9.83);
 assert.equal(outputContextTime({currentTime:.01,baseLatency:.2},1000),0);
});
test('presentation follows output position across a tempo change, loop boundary and natural end',()=>{
 const p=createOutputPosition(),base={phase:'playing',time:0,tick:0,bpm:60,totalTicks:7680,range:{start:0,end:3840,loop:false},anchorTime:0,iteration:0};p.observe(base);p.observe({...base,time:1,tick:480,bpm:120});
 let at=p.at({...base,time:1.1,tick:576,bpm:120},.9);assert.equal(at.tick,432);assert.equal(at.bpm,120);assert.equal(at.outputBpm,60);at=p.at({...base,time:1.1,tick:576,bpm:120},1.05);assert.equal(at.tick,528);assert.equal(at.outputBpm,120);
 p.reset();p.observe({...base,time:0,tick:3780,range:{start:1920,end:3840,loop:true}});at=p.at({...base,time:.2,tick:1956,iteration:1},.1);assert.equal(at.tick,3828);assert.equal(at.iteration,0);at=p.at({...base,time:.2,tick:1956,iteration:1},.2);assert.equal(at.tick,1956);assert.equal(at.iteration,1);
 p.reset();p.observe({...base,time:0,tick:3780});at=p.at({...base,phase:'ended',time:.2,tick:3840},.1);assert.equal(at.phase,'playing');assert.equal(at.tick,3828);assert.equal(p.at({...base,phase:'ended'},.2).phase,'ended');
 assert.equal(p.at({...base,phase:'paused',tick:123},0).tick,123);p.reset();assert.equal(p.size,0);
});
test('output history is bounded and pre-start presentation does not advance before scheduled anchor',()=>{
 const p=createOutputPosition();for(let i=0;i<5000;i++)p.observe({phase:'playing',time:i/1000,tick:i,bpm:100,totalTicks:10000,range:{start:0,end:10000},anchorTime:i/1000});assert(p.size<=1024);p.reset();const s={phase:'playing',time:10,tick:1920,bpm:100,totalTicks:10000,range:{start:1920,end:10000},anchorTime:10.03};p.observe(s);assert.equal(p.at(s,9.9).tick,1920);assert.equal(p.at(s,10.02).tick,1920);assert(Math.abs(p.at(s,10.04).tick-1928)<.0001);
});
