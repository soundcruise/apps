// Synthetic, local-only editing fixture. No repository, browser storage or cloud access.
import vm from 'node:vm';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {isAbsolute} from 'node:path';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {createFormAuthoring} from '../js/modules/chord/form-authoring.mjs';
const require=createRequire(import.meta.url);
export function createUITestProject(){
 const realm={window:{CruiseStudio:{},ChordCruise:{},crypto:webcrypto},TextEncoder};
 for(const path of ['../js/core/music-theory.js','../js/core/song-model.js','../../chord-cruise/js/core/music-theory.js','../../chord-cruise/js/core/caged-forms.js'])vm.runInNewContext(readFileSync(new URL(path,import.meta.url),'utf8'),realm);
 const C=realm.window.CruiseStudio,legacy=C.model.createEmptyProject();
 legacy.songInfo.title='編集操作テスト — 海辺の散歩';legacy.songInfo.artist='テスト用・書き下ろし';legacy.songInfo.bpm=100;
 legacy.sections=[{id:'intro',name:'イントロ',lyricsHidden:false},{id:'verse',name:'Aメロ',lyricsHidden:false},{id:'chorus',name:'サビ',lyricsHidden:false},{id:'outro',name:'アウトロ',lyricsHidden:false}];
 const plans=[['C','G'],['Am','F'],['Dm','G7'],['C'],['Em','Am'],['Dm','G'],['Cmaj7','G'],['F','G'],['Em','Am'],['Dm','G7'],['C','F','G','C'],['C']];
 const lyrics=['あおいそらのした','かぜをききながら','うみへあるこうよ','ひかりがゆれてる','なみのこえをきく','ゆっくりすすもう','ふねがてをふるよ','あしたのかなたへ','こころをひらいて','おとをかさねよう','またあえるひまで','おやすみうみよ'];
 legacy.bars=plans.map((symbols,index)=>{
  const bar=C.model.createEmptyBar(index+1,index<3?'intro':index<7?'verse':index<11?'chorus':'outro');
  bar.chords=symbols.map((symbol,i)=>({tick:i*1920/symbols.length,durationTicks:1920/symbols.length,symbol}));
  bar.lyrics=Array.from(lyrics[index]).slice(0,8).map((text,i)=>({tick:i*240,text}));
  bar.lineBreakAfter=index===2||index===6||index===10;return bar;
 });
 for(let i=0;i<legacy.bars.length;i++){
  const actions=i===2?[]:i%3===0?['down','','up','up','','up','down','up']:i%3===1?['down','up','down','up','mute','up','down','up']:['down','','down','','down','','down',''];
  const result=C.model.setBarStrumSlots(legacy,i+1,actions.flatMap((action,j)=>action?[{tick:j*240,action,durationTicks:240}]:[]),{keepEmpty:true});if(result.inherited||!result.patternId)throw Error('Failed to set synthetic stroke');
 }
 C.schema2=require('../js/core/schema2.js');C.model.configureSchema2();
 const migrated=C.model.schema2.migrate(legacy,JSON.stringify(legacy),true);if(!migrated.ok)throw Error(migrated.error);
 const p=migrated.project,api=C.model.schema2,forms=createFormAuthoring(C,realm.window.ChordCruise);forms.initialize(p);
 const steps=['C','D','E','G','A','G','E','D'];
 for(const [i,bar] of p.bars.entries()){
  for(const chord of bar.chords){chord.provenance={origin:'user-set'};forms.syncEvent(p,chord);}
  for(const lyric of bar.lyrics)lyric.provenance={origin:'user-set'};
  // One two-note cell, one sustained note and C3/C4/C5 pitches exercise note navigation.
  const onsets=i%3===0?[0,120,240,480,720,960,1440]:[0,240,480,720,960,1200,1440,1680];
  bar.melody=onsets.map((onset,j)=>({id:api.newId(),kind:'note',pitch:{step:steps[(i+j)%steps.length],alter:0,octave:i===0&&j===0?3:i===7&&j>3?5:4},onsetTick:onset,durationTicks:(onsets[j+1]??1920)-onset,provenance:api.timing('user-set',true)}));
 }
 p.notation.settings.showChords=true;p.notation.settings.showStrum=true;p.notation.settings.showLyrics=true;p.notation.settings.showDoremi=true;
 const result=api.validate(p);if(!result.ok)throw Error(result.errors.join('/'));
 return JSON.parse(JSON.stringify(p));
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const out=process.argv[2];if(!out||!isAbsolute(out))throw Error('An absolute output file is required');
 const p=createUITestProject();writeFileSync(out,JSON.stringify(p,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({path:out,title:p.songInfo.title,bars:p.bars.length,forms:p.performance.formBindings.length}));
}
