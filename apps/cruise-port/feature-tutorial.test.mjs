import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEATURE_TUTORIAL_STEPS, findTutorialTarget, tutorialPlacement, tutorialStepText } from './feature-tutorial.js';
import { FEATURE_HELP } from './feature-help.js';
import { readFileSync } from 'node:fs';
test('both tutorials use a short ordered configuration with safe empty-state fallbacks',()=>{
 assert.equal(FEATURE_TUTORIAL_STEPS.practice.length,5);assert.equal(FEATURE_TUTORIAL_STEPS.gear.length,4);
 for(const steps of Object.values(FEATURE_TUTORIAL_STEPS))for(const step of steps){assert(step.target && step.title && step.text);assert(step.text.length<140);}
});
test('missing or hidden dynamic cards fall back to the fixed list region',()=>{
 const fixed={getBoundingClientRect:()=>({width:100,height:100}),closest:()=>null};
 const hidden={getBoundingClientRect:()=>({width:0,height:0}),closest:()=>null};
 const root={querySelectorAll:selector=>selector==='#fixed'?[fixed]:[hidden]};
 assert.equal(findTutorialTarget(root,{target:'.card',fallback:'#fixed'}),fixed);
 assert.equal(findTutorialTarget({querySelectorAll:()=>[]},{target:'.card'}),null);
});
test('bubble and cutout fit narrow, desktop, and partially offscreen targets',()=>{
 for(const width of [375,393,768,1280])for(const top of [-100,20,600,900]){
  const p=tutorialPlacement({left:-20,right:width+20,top,bottom:top+120},{width,height:852},{width:320,height:210});
  assert(p.bubbleX>=12 && p.bubbleX+320<=width-12);assert(p.bubbleY>=12 && p.bubbleY+210<=840);assert(p.left>=0 && p.right<=width && p.top>=0 && p.bottom<=852);
 }
});
test('help explains real controls and does not offer nonexistent count/URL inputs',()=>{
 assert.equal(FEATURE_HELP.practice.steps.length,6);assert.equal(FEATURE_HELP.gear.steps.length,4);
 assert.match(FEATURE_HELP.practice.steps.join(''),/チェック.*通算回数/);assert.doesNotMatch(FEATURE_HELP.gear.steps.join('')+FEATURE_HELP.gear.note,/URL/);
 for(const file of ['index.html','pro_9a3943176561/index.html']){const html=readFileSync(new URL(file,import.meta.url),'utf8');assert.match(html,/data-feature-tutorial>チュートリアルを見る/);assert.match(html,/id="practice-history-open"[^>]*aria-label="音楽カレンダーを開く"/);}
});
test('tutorial engine has no storage, authentication, transfer, or navigation mutations',()=>{
 const js=readFileSync(new URL('feature-tutorial.js',import.meta.url),'utf8');assert.doesNotMatch(js,/localStorage|indexedDB|fetch\(|innerHTML|location\s*\.|\.click\(/);assert.match(js,/scrollIntoView/);assert.match(js,/hashchange/);assert.match(js,/trigger\.focus/);
});

test('calendar reuses home SVG and preserves a bordered 44px control in both editions',()=>{
 for(const file of ['index.html','pro_9a3943176561/index.html']){
 const html=readFileSync(new URL(file,import.meta.url),'utf8');
 const icon=id=>html.match(new RegExp('<button id="'+id+'"[\\s\\S]*?(<svg[\\s\\S]*?</svg>)'))[1];
 assert.equal(icon('practice-history-open'),icon('home-calendar-button'));
 }
 const css=readFileSync(new URL('feature-help.css',import.meta.url),'utf8');
 assert.match(css,/#practice-history-open[^}]*width: 44px[^}]*border: 1px solid[^}]*border-radius: 8px/);
});
test('help and tutorial teach all-check completion and the upper manual finish',()=>{
 const copy=FEATURE_HELP.practice.steps[4];assert.match(FEATURE_HELP.practice.steps[3],/すべて.*チェック.*完了/);assert.match(copy,/画面上部.*練習終了/);assert.doesNotMatch(copy,/ここで練習終了/);
 const step=FEATURE_TUTORIAL_STEPS.practice[3];assert.equal(step.target,'#practice-timer-stop');assert.equal(step.fallback,'.practice-timer-card');assert.match(step.text,/すべて.*チェック.*完了/);assert.match(step.fallbackText,/練習スタート後.*練習終了/);
 assert(!FEATURE_TUTORIAL_STEPS.practice.some(step=>step.target==='#practice-finish'));
});

test('first-time order, empty prompts and stopped/running finish copy are accurate',()=>{
 assert.deepEqual(FEATURE_TUTORIAL_STEPS.practice.map(s=>s.target),['#practice-menu-add','#practice-timer-toggle','.practice-check','#practice-timer-stop','#practice-history-open']);
 assert.deepEqual(FEATURE_TUTORIAL_STEPS.gear.map(s=>s.target),['#gear-list-title-add','.gear-list-tabs','.gear-category-toolbar','.gear-card']);
 const finish=FEATURE_TUTORIAL_STEPS.practice[3];assert.equal(tutorialStepText({},finish,{matches:()=>true}),finish.text);assert.equal(tutorialStepText({},finish,{matches:()=>false}),finish.fallbackText);
 for(const step of [FEATURE_TUTORIAL_STEPS.practice[4],FEATURE_TUTORIAL_STEPS.gear[3]]){assert.match(tutorialStepText({querySelector:()=>null},step,{}),/まずは/);assert.equal(tutorialStepText({querySelector:()=>({})},step,{}),step.text);}
 assert.match(FEATURE_HELP.practice.steps[0],/目安/);assert.match(FEATURE_HELP.practice.note,/制限時間ではありません/);
 assert.match(FEATURE_HELP.gear.steps[1],/自分の機材.*今持っている機材と手放した機材/);assert.match(FEATURE_HELP.gear.steps[2],/⋮/);assert.match(FEATURE_HELP.gear.steps[3],/⋯/);
 assert.doesNotMatch(JSON.stringify(FEATURE_HELP)+JSON.stringify(FEATURE_TUTORIAL_STEPS),/区分変更|練習リスト/);
});
