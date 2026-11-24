import test from 'node:test';import assert from 'node:assert/strict';import {createScrollSpeed} from '../../score-viewer/core/scroll-speed.mjs';
test('BPM follow is exact, custom speed uses the same elapsed audio time and reset returns immediately',()=>{const c=createScrollSpeed({bpm:100,totalTicks:19200}),s=(tick,time,phase='playing')=>({tick,time,phase});assert.equal(c.target(s(480,1)),480);c.configure({mode:'custom',secondsPerBar:4},s(480,1));assert.equal(c.target(s(480,1)),480);assert.equal(c.target(s(960,2)),960);assert.equal(c.target(s(1440,3)),1440);c.configure({secondsPerBar:2},s(1440,3));c.target(s(1440,3));assert.equal(c.target(s(1500,4)),2400);c.pause();assert.equal(c.target(s(1500,40)),2400);c.configure({mode:'bpm'},s(1500,40));assert.equal(c.target(s(1500,40)),1500);});
test('custom scroll has bounded persistence and does not consume paused time or alter the musical sample',()=>{const c=createScrollSpeed({bpm:120,totalTicks:3840,value:{mode:'custom',secondsPerBar:2,cursorTick:100}}),s={tick:200,time:1,phase:'playing'},before=JSON.stringify(s);c.target(s);c.target({...s,time:100});assert.equal(c.snapshot().cursorTick,3840);c.seek(1920);c.pause();assert.equal(c.target({...s,time:200,phase:'paused'}),1920);assert.equal(JSON.stringify(s),before);const restored=createScrollSpeed({bpm:120,totalTicks:3840,value:c.snapshot()});assert.equal(restored.target({...s,time:300}),1920);});

test('custom visual speed stays inside the selected playback range',()=>{const speed=createScrollSpeed({value:{mode:'custom',secondsPerBar:.15},bpm:100,totalTicks:10000});speed.seek(1920);speed.target({tick:1920,time:0,phase:'playing',range:{start:1920,end:3840}});assert.equal(speed.target({tick:2400,time:1,phase:'playing',range:{start:1920,end:3840}}),3840);});

test('auto-scroll switch persists separately from tempo and resets elapsed custom time on resume',()=>{const c=createScrollSpeed({bpm:100,totalTicks:19200,value:{enabled:false,mode:'custom',secondsPerBar:4}});assert.equal(c.snapshot().enabled,false);const s={tick:960,time:1,phase:'playing'};c.configure({enabled:true},s);assert.equal(c.snapshot().enabled,true);assert.equal(c.target(s),960);assert.equal(c.target({...s,time:2}),1440);c.configure({enabled:false},s);assert.equal(c.snapshot().enabled,false);});

test('old scroll preferences retain continuous follow; viewport origin and fixed placement round-trip',()=>{
 const options={bpm:120,totalTicks:19200},sample={tick:480,time:1,phase:'playing'};
 const speed=createScrollSpeed({...options,value:{mode:'custom',secondsPerBar:3}});
 assert.equal(speed.snapshot().position,'smooth');
 assert.equal(speed.snapshot().origin,'score');
 speed.configure({origin:'viewport',position:'end'},sample);
 assert.deepEqual(createScrollSpeed({...options,value:speed.snapshot()}).snapshot(),speed.snapshot());
});
