import test from 'node:test';import assert from 'node:assert/strict';
import {placePlayhead,movePlayhead,syncPlaybackButton,applyScoreTheme,scoreColors} from '../js/modules/score-ui.mjs';
test('one composited cursor moves without changing left layout or replacing its node',()=>{
 const line={style:{}},parent={appends:0,append(n){this.appends++;n.parentElement=this;}};
 placePlayhead(line,parent,{x:12,y:30,height:150});placePlayhead(line,parent,{x:80,y:30,height:150});assert.equal(parent.appends,1);assert.equal(line.style.left,'0px');assert.equal(line.style.top,'0px');assert.equal(line.style.transform,'translate3d(80px,30px,0)');assert.equal(line.style.height,'150px');assert.equal(line.style.willChange,'transform');
 const next={appends:0,append:parent.append};placePlayhead(line,next,{x:0,height:100});assert.equal(next.appends,1);assert.equal(line.parentElement,next);
});
test('refreshing unchanged playback state never replaces button text during a pointer click',()=>{
 let text='',writes=0;const attrs=new Map(),b={disabled:false,get textContent(){return text;},set textContent(v){text=v;writes++;},getAttribute:k=>attrs.get(k),setAttribute:(k,v)=>attrs.set(k,v)};
 syncPlaybackButton(b,'playing');for(let i=0;i<60;i++)syncPlaybackButton(b,'playing');assert.equal(writes,1);assert.equal(text,'Ⅱ 一時停止');syncPlaybackButton(b,'playing',{stop:true});assert.equal(text,'■ 停止');assert.equal(attrs.get('aria-label'),'停止');syncPlaybackButton(b,'paused',{disabled:true});assert.equal(text,'▶ 再生');assert(b.disabled);assert.equal(attrs.get('aria-pressed'),'false');
});
test('editor and viewer derive their score accent from the same scoped palette',()=>{
 const values=new Map();applyScoreTheme({style:{getPropertyValue:k=>values.get(k),setProperty:(k,v)=>values.set(k,v)}});assert.equal(values.get('--score-line'),scoreColors.line);assert.equal(values.get('--score-border'),scoreColors.border);assert.equal(values.get('--score-fill'),scoreColors.fill);assert.equal(values.size,4);
});
test('highlight transparency changes only the fill and clamps unsafe opacity',()=>{
 const values=new Map(),root={style:{getPropertyValue:k=>values.get(k),setProperty:(k,v)=>values.set(k,v)}};
 applyScoreTheme(root,{highlight:'#3355aa',opacity:0});assert.equal(values.get('--score-fill'),'#3355aa00');assert.equal(values.get('--score-border'),'#3355aa');
 applyScoreTheme(root,{highlight:'#3355aa',opacity:1});assert.equal(values.get('--score-fill'),'#3355aaff');
 applyScoreTheme(root,{opacity:2});assert.equal(values.get('--score-fill'),scoreColors.border+'ff');
 applyScoreTheme(root,{opacity:NaN});assert.equal(values.get('--score-fill'),scoreColors.fill);
});
test('a running playhead follows audio time and reanchors on seek, bar change and resize',()=>{
 const animations=[];
 const line={style:{},animate(){const a={cancel(){this.cancelled=true;}};animations.push(a);return a;}};
 const parent={append(el){el.parentElement=this;}};
 const bounds={left:20,width:180,y:4,height:100,fraction:.1,seconds:2,segment:1};
 movePlayhead(line,parent,bounds);
 assert.equal(animations[0].currentTime,200);
 animations[0].currentTime=215;
 movePlayhead(line,parent,{...bounds,fraction:.11});
 assert.equal(animations.length,1);
 movePlayhead(line,parent,{...bounds,fraction:.7});
 assert.equal(animations[0].cancelled,true);
 assert.equal(animations[1].currentTime,1400);
 movePlayhead(line,parent,{...bounds,segment:2});
 movePlayhead(line,parent,{...bounds,segment:2,width:240});
 assert.equal(animations.length,4);
 assert(animations.slice(0,-1).every(a=>a.cancelled));
});
