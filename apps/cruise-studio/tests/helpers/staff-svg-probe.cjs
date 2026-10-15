/* Test-only paint observer. Delegates unchanged VexFlow drawing into labelled SVG groups.
   The labels are NOT evidence of paint: consumers must inspect live paths/bounds too. */
async function install(page) {
 await page.evaluate(()=>{
  const F=window.Vex.Flow,onsets=new WeakMap();let serial=0;
  const drawVoice=F.Voice.prototype.draw;
  F.Voice.prototype.draw=function(...args){let tick=0;for(const n of this.getTickables()){onsets.set(n,tick);if(!n.shouldIgnoreTicks())tick+=n.getTicks().value()*1920/F.RESOLUTION;}return drawVoice.apply(this,args);};
  const noteId=n=>n?.getAttribute('id')||null;
  function wrap(object,method,kind,context,info){
   const original=object[method];
   object[method]=function(...args){
    const ctx=context.call(this,args),group=ctx.openGroup('', 'score-qa-'+(++serial));
    group.setAttribute('data-score-qa',kind);
    group.setAttribute('data-score-info',JSON.stringify(info.call(this,args)));
    try{return original.apply(this,args);}finally{ctx.closeGroup();}
   };
  }
  const context=function(){return this.checkContext();};
  wrap(F.StaveNote.prototype,'draw','note',context,function(){return {id:noteId(this),keys:this.keys.slice(),rest:!!this.isRest(),onset:onsets.get(this),ticks:this.getTicks().value()*1920/F.RESOLUTION};});
  wrap(F.NoteHead.prototype,'draw','head',context,function(){return {};});
  wrap(F.Accidental.prototype,'draw','accidental',context,function(){return {note:noteId(this.getNote()),index:this.getIndex(),type:this.type,code:this.glyph.getCode()};});
  wrap(F.Dot.prototype,'draw','dot',context,function(){return {note:noteId(this.getNote())};});
  wrap(F.StaveNote.prototype,'drawFlag','flag',context,function(){return {note:noteId(this)};});
  wrap(F.Beam.prototype,'draw','beam',context,function(){return {notes:this.getNotes().map(noteId)};});
  wrap(F.StaveTie.prototype,'draw','tie',context,function(){const n=this.getNotes();return {first:noteId(n.first_note),last:noteId(n.last_note),firstIndices:n.first_indices,lastIndices:n.last_indices};});
  wrap(F.KeySignature.prototype,'draw','signature',function(){return this.checkStave().checkContext();},function(){return {key:this.keySpec};});
  wrap(F.Glyph.prototype,'render','glyph',args=>args[0],function(){return {code:this.getCode()};});
  wrap(F.Glyph.prototype,'renderToStave','glyph',context,function(){return {code:this.getCode()};});
  wrap(F.Glyph,'renderGlyph','glyph',args=>args[0],args=>({code:args[4]}));
  window.__staffSvgProbe=Object.freeze({read(root){
   function measure(group){
    const b=group.getBBox(),style=getComputedStyle(group),paths=[...group.querySelectorAll('path,circle,ellipse,polygon,polyline,rect,line')];
    const painted=paths.filter(p=>typeof p.getTotalLength==='function'&&p.getTotalLength()>0&&getComputedStyle(p).display!=='none'&&getComputedStyle(p).visibility!=='hidden'&&(getComputedStyle(p).fill!=='none'||getComputedStyle(p).stroke!=='none'));
    return {info:JSON.parse(group.getAttribute('data-score-info')),paths:painted.length,
     bbox:{x:b.x,y:b.y,width:b.width,height:b.height},visible:style.display!=='none'&&style.visibility!=='hidden',
     glyphs:[...group.querySelectorAll('[data-score-qa="glyph"]')].map(g=>JSON.parse(g.getAttribute('data-score-info')).code),
     geometry:painted.map(p=>p.getAttribute('d')||p.outerHTML)};
   }
   const groups=kind=>[...root.querySelectorAll('[data-score-qa="'+kind+'"]')].map(measure);
   return {notes:groups('note').map(n=>({...n,heads:groupsForNote(n.info.id)})),accidentals:groups('accidental'),dots:groups('dot'),flags:groups('flag'),beams:groups('beam'),ties:groups('tie'),signatures:groups('signature')};
   function groupsForNote(id){const g=[...root.querySelectorAll('[data-score-qa="note"]')].find(g=>JSON.parse(g.getAttribute('data-score-info')).id===id);return g?[...g.querySelectorAll('[data-score-qa="head"]')].map(measure):[];}
  }});
 });
}
async function read(page,index=0){return page.locator('.melody-svg').nth(index).evaluate(root=>__staffSvgProbe.read(root));}
function painted(x){return x.visible&&x.paths>0&&x.bbox.width>0&&x.bbox.height>0;}

const assert=require('node:assert/strict');
const symbolCode={'#':'accidentalSharp',b:'accidentalFlat',n:'accidentalNatural'};
function assertMeasure(actual,expected){
 assert.equal(actual.notes.length,expected.notes.length,'exact engraved note/rest count');
 const ids=actual.notes.map(n=>n.info.id);
 for(let i=0;i<actual.notes.length;i++){
  const n=actual.notes[i],e=expected.notes[i];
  assert.deepEqual({keys:n.info.keys,ticks:n.info.ticks,onset:n.info.onset,rest:n.info.rest},e,'written pitch/octave/time/rest '+i);
  assert(painted(n),'actual note paint '+i);assert.equal(n.heads.length,1,'one head/rest glyph');assert(painted(n.heads[0]),'painted head/rest '+i);
 }
 for(let i=1;i<actual.notes.length;i++)assert(actual.notes[i].heads[0].bbox.x>actual.notes[i-1].heads[0].bbox.x,'live glyphs preserve musical time order');
 assert.equal(actual.notes.reduce((sum,n)=>sum+n.info.ticks,0),1920,'complete 4/4 voice');
 assert.equal(actual.accidentals.length,expected.accidentals.length,'exact accidental count');
 actual.accidentals.forEach((g,i)=>{
  const e=expected.accidentals[i];assert.equal(g.info.note,ids[e.note],'accidental owner');assert.equal(g.info.index,0);
  assert.equal(g.info.type,e.type);assert.equal(g.info.code,symbolCode[e.type]);assert(painted(g),'actual accidental glyph paint');
  assert.deepEqual(g.glyphs,[symbolCode[e.type]]);
  assert(g.bbox.x+g.bbox.width<=actual.notes[e.note].heads[0].bbox.x+1,'accidental left of its own notehead');
 });
 for(const [kind,pairs] of [['beams',expected.beams||[]],['ties',expected.ties||[]]]){
  assert.equal(actual[kind].length,pairs.length,'exact '+kind+' count');
  actual[kind].forEach((g,i)=>{
   assert(painted(g),'actual '+kind+' paint');assert(g.bbox.width>10&&g.bbox.height>1,'non-degenerate '+kind+' geometry');
   if(kind==='beams')assert.deepEqual(g.info.notes,pairs[i].map(j=>ids[j]),'beam members respect beat grouping');
   else {assert.equal(g.info.first,ids[pairs[i][0]]);assert.equal(g.info.last,ids[pairs[i][1]]);assert.deepEqual(g.info.firstIndices,[0]);assert.deepEqual(g.info.lastIndices,[0]);assert.deepEqual(actual.notes[pairs[i][0]].info.keys,actual.notes[pairs[i][1]].info.keys,'tie joins identical written pitch');}
  });
 }
 for(const [kind,indices] of [['dots',expected.dots||[]],['flags',expected.flags||[]]]){
  const drawn=actual[kind].filter(painted);assert.deepEqual(drawn.map(g=>g.info.note),indices.map(i=>ids[i]),'exact painted '+kind+' owners');
 }
 assert.equal(actual.signatures.length,1);assert.equal(actual.signatures[0].info.key,expected.signature.key);
 assert.deepEqual(actual.signatures[0].glyphs,expected.signature.codes);
 if(expected.signature.codes.length)assert(painted(actual.signatures[0]),'painted key signature');
}
const note=(tick,durationTicks,step=0,alter=0,octave=0)=>({tick,durationTicks,step,alter,octave});
const written=(key,ticks,onset,rest=false)=>({keys:[key],ticks,onset,rest});
const rest=(ticks,onset)=>written('b/4',ticks,onset,true);
const bar=(notes,accidentals=[],extra={})=>({notes,accidentals,signature:{key:'C',codes:[]},...extra});
const cases=[
 {id:'C-F-sharp',key:'C',bars:[[note(0,1920,3,1)]],expected:[bar([written('f#/4',1920,0)],[{note:0,type:'#'}])]},
 {id:'C-B-flat',key:'C',bars:[[note(0,1920,6,-1)]],expected:[bar([written('bb/4',1920,0)],[{note:0,type:'b'}])]},
 {id:'G-F-natural-and-restore',key:'G',bars:[[note(0,960,6,-1,-1),note(960,960,6,0,-1)]],expected:[bar([written('f/4',960,0),written('f#/4',960,960)],[{note:0,type:'n'},{note:1,type:'#'}],{signature:{key:'G',codes:['accidentalSharp']}})]},
 {id:'F-B-natural-and-restore',key:'F',bars:[[note(0,960,3,1),note(960,960,3)]],expected:[bar([written('b/4',960,0),written('bb/4',960,960)],[{note:0,type:'n'},{note:1,type:'b'}],{signature:{key:'F',codes:['accidentalFlat']}})]},
 {id:'accidental-continuation',key:'C',bars:[[note(0,480,3,1),note(480,480,3,1),note(960,480,3),note(1440,480,3)]],expected:[bar([written('f#/4',480,0),written('f#/4',480,480),written('f/4',480,960),written('f/4',480,1440)],[{note:0,type:'#'},{note:2,type:'n'}])]},
 {id:'barline-resets-accidentals',key:'C',bars:[[note(0,1920,3,1)],[note(0,1920,3)],[note(0,1920,3,1)]],expected:[bar([written('f#/4',1920,0)],[{note:0,type:'#'}]),bar([written('f/4',1920,0)]),bar([written('f#/4',1920,0)],[{note:0,type:'#'}])]},
 {id:'octave-local-accidentals',key:'C',bars:[[note(0,480,3,1),note(480,480,3,0,1),note(960,960,3)]],expected:[bar([written('f#/4',480,0),written('f/5',480,480),written('f/4',960,960)],[{note:0,type:'#'},{note:2,type:'n'}])]},
 {id:'eighth-note-beams',key:'C',bars:[[note(0,240),note(240,240,1),note(480,240,2),note(720,240,3)]],expected:[bar([written('c/4',240,0),written('d/4',240,240),written('e/4',240,480),written('f/4',240,720),rest(960,960)],[],{beams:[[0,1],[2,3]]})]},
 {id:'beam-beat-boundary',key:'C',bars:[[note(240,240),note(480,240,1)]],expected:[bar([rest(240,0),written('c/4',240,240),written('d/4',240,480),rest(240,720),rest(960,960)],[],{flags:[1,2]})]},
 {id:'tie-across-beat',key:'C',bars:[[note(240,480)]],expected:[bar([rest(240,0),written('c/4',240,240),written('c/4',240,480),rest(240,720),rest(960,960)],[],{ties:[[1,2]],flags:[1,2]})]},
 {id:'dotted-quarter',key:'C',bars:[[note(0,720)]],expected:[bar([written('c/4',720,0),rest(240,720),rest(960,960)],[],{dots:[0]})]},
 {id:'notes-and-rests',key:'C',bars:[[note(0,480),note(960,480,1)]],expected:[bar([written('c/4',480,0),rest(480,480),written('d/4',480,960),rest(480,1440)])]}
];
module.exports={install,read,painted,assertMeasure,cases};
