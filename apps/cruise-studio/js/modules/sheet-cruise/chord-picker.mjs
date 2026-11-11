// B-owned presentation. Reuses released owner theory and existing form adoption;
// never imports Chord UI/storage or creates a second Project/editor repository.
import {createChordFormAdapter} from '../chord/form-adapter.mjs?v=0.88.1';
import {createFormAdoptionService} from '../chord/form-adoption.mjs?v=0.88.1';
import {getAppVersion} from '../../core/component-metadata.mjs?v=0.88.1';

export function createChordPicker(C, owner) {
    const adapter=createChordFormAdapter({chordTheory:owner.theory,caged:owner.caged,parseChordSymbol:C.theory.parseBasicChordSymbol,ownerVersion:getAppVersion('chord-cruise')});
    const context=()=>({workspaceId:C.shellHost.getActiveWorkspace(),generation:C.shellHost.getWorkspaceGeneration(),blocked:!!C.shellHost.modal.getActive()||C.shellHost.keyboard.isIMEBlocked({})});
    const service=createFormAdoptionService({owner:C.documents,schema:C.model.schema2,adapter,repository:C.repository,getContext:context,chordTheory:owner.theory,parseChordSymbol:C.theory.parseBasicChordSymbol,ownerVersion:getAppVersion('chord-cruise')});
    const states=new WeakMap();
    return {mount(root, target) {
        const {session,bar,tick,project}=target;
        let state=states.get(session);
        if(!state){state={key:((C.model.schema2.pitchMidi(project.solfege.tonic)%12)+12)%12,scale:'major',tones:'3',custom:false,spec:{rootPc:0,third:4,fifth:7,seventh:null,tensions:[],bassPc:null},shape:'',view:'finger',confirmed:false,max:project.instrument.maxAbsoluteFret??22,played:null};states.set(session,state);}
        const event=bar.chords.find(e=>e.onsetTick===tick);
        const targetKey=bar.id+':'+tick+':'+session.snapshotVersion;
        if(state.targetKey!==targetKey){state.targetKey=targetKey;state.symbol=event?.symbol||'C';state.played=null;state.notice='';}
        function current(){return root.isConnected&&target.current()&&target.eligible();}
        function node(tag,text,parent){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;(parent||root).appendChild(n);return n;}
        function button(text,action,parent,attrs={}){const b=node('button',text,parent);b.type='button';for(const[k,v]of Object.entries(attrs))b.setAttribute(k,String(v));b.title=b.getAttribute('aria-label')||text;b.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();});b.addEventListener('click',()=>{if(b.isConnected&&root.contains(b)&&current())action();});return b;}
        function select(label,values,value,change,parent){const l=node('label',label,parent),s=node('select',undefined,l);s.setAttribute('aria-label',label);for(const[v,text]of values){const o=node('option',text,s);o.value=String(v);}s.value=String(value);s.addEventListener('change',()=>{if(!current())return;change(s.value);paint();});return s;}
        function applySymbol(){if(!current())return;if(target.write(state.symbol)){session.finishTextGroup();state.notice='このマスへ入力しました。保存は「保存」から。';}}
        function request(generation,played){return {symbol:state.symbol,capo:project.instrument.capo,tuningMidi:[64,59,55,50,45,40],maxAbsoluteFret:state.max,generation,...(played?{playedStrings:played}:{})};}
        function candidate(shape){
            if(!Number.isInteger(state.max)||state.max<project.instrument.capo||state.max>36)return null;
            const seen=new Set();
            for(let min=0;min<=state.max-project.instrument.capo;min++)for(const width of [4,5,13]){
                const generation={minRelativeFret:min,maxRelativeFret:Math.min(min+width,state.max-project.instrument.capo)},result=adapter.resolve(request(generation));
                if(!result.display.possible||shape&&result.form.shape!==shape)continue;
                const key=JSON.stringify(result.form.notes.map(n=>[n.string,n.relativeFret]));if(seen.has(key))continue;seen.add(key);
                return {generation,result};
            }
            return null;
        }
        function paint(){
            root.replaceChildren();root.className='score-chord-picker';root.setAttribute('aria-label','コードを調べる');
            const controls=node('div');controls.className='score-chord-controls';
            select('キー',owner.theory.NOTES_SHARP.map((n,i)=>[i,n]),state.key,v=>{state.key=Number(v);},controls);
            select('スケール',Object.values(owner.theory.SCALES).map(s=>[s.id,s.label]),state.scale,v=>{state.scale=v;},controls);
            const tones=node('div',undefined,controls);tones.className='score-chord-segment';tones.setAttribute('role','group');tones.setAttribute('aria-label','和音数');
            for(const[value,label]of [['3','3和音'],['7','4和音']])button(label,()=>{state.tones=value;paint();},tones,{'data-chord-tones':value,'aria-pressed':state.tones===value});
            const choices=node('div');choices.className='score-chord-choices';
            for(const chord of owner.theory.getDiatonicChords(state.key,state.scale,state.tones))button(chord.roman+' '+chord.symbol,()=>{state.symbol=chord.symbol;state.played=null;state.notice='';paint();},choices,{'data-chord-symbol':chord.symbol,'aria-pressed':state.symbol===chord.symbol});
            const line=node('div');line.className='score-chord-controls';
            button('＋ 任意コードを作る',()=>{state.custom=!state.custom;paint();},line,{'data-chord-custom':'','aria-expanded':state.custom});
            const symbol=node('input',undefined,line);symbol.value=state.symbol;symbol.maxLength=64;symbol.setAttribute('aria-label','入力するコード');symbol.dataset.chordSymbolInput='';symbol.addEventListener('input',()=>{state.symbol=symbol.value;root.querySelector('[data-chord-adopt]')?.setAttribute('disabled','');});symbol.addEventListener('change',()=>{if(current())paint();});symbol.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();applySymbol();}});
            button('このマスに入力',applySymbol,line,{'data-chord-insert':''});
            if(state.custom){
                const builder=node('div');builder.className='score-chord-builder';builder.setAttribute('aria-label','任意コード作成');
                function change(name,value){state.spec[name]=value==='null'?null:Number(value);state.symbol=owner.chordModel.generateName(state.spec)+(state.spec.bassPc===null?'':'/'+owner.chordModel.bassNoteName(state.spec.bassPc));state.played=null;}
                select('ルート音',owner.chordModel.CUSTOM_ROOT_NAMES.map((n,i)=>[i,n]),state.spec.rootPc,v=>change('rootPc',v),builder);
                select('3度',[[4,'Major (M3)'],[3,'Minor (m3)'],[5,'Sus4 (P4)'],['null','なし']],state.spec.third,v=>change('third',v),builder);
                select('5度',[[7,'P5'],[6,'♭5'],[8,'♯5'],['null','なし']],state.spec.fifth,v=>change('fifth',v),builder);
                select('7度',[['null','なし (Triad)'],[10,'m7'],[11,'M7'],[9,'dim7 (6th)']],state.spec.seventh,v=>change('seventh',v),builder);
                select('ベース音',[['null','通常'],...owner.chordModel.CUSTOM_ROOT_NAMES.map((n,i)=>[i,n])],state.spec.bassPc,v=>change('bassPc',v),builder);
                const tensions=node('fieldset',undefined,builder);node('legend','テンション',tensions);
                for(const[value,label]of Object.entries(owner.chordModel.TENSION_LABELS)){const l=node('label',undefined,tensions),x=node('input',undefined,l);x.type='checkbox';x.checked=state.spec.tensions.includes(Number(value));l.append(label);x.addEventListener('change',()=>{if(!current())return;state.spec.tensions=x.checked?[...state.spec.tensions,Number(value)].sort((a,b)=>a-b):state.spec.tensions.filter(n=>n!==Number(value));change('rootPc',state.spec.rootPc);paint();});}
            }
            const forms=node('div');forms.className='score-chord-forms';
            const tabs=node('div',undefined,forms);tabs.className='score-chord-controls';
            for(const shape of ['', 'C','A','G','E','D'])button(shape?shape+'型':'全体',()=>{state.shape=shape;state.played=null;paint();},tabs,{'data-chord-shape':shape,'aria-pressed':state.shape===shape});
            for(const[value,label]of [['finger','運指'],['note','CDE'],['solfege','ドレミ'],['degree','度数']])button(label,()=>{state.view=value;paint();},tabs,{'data-chord-view':value,'aria-pressed':state.view===value});
            const parsed=C.theory.parseBasicChordSymbol(state.symbol),rootNote=parsed&&owner.theory.parseSpelledNoteName(parsed.root),quality=parsed&&Object.keys(owner.theory.QUALITIES).find(k=>k===parsed.quality||owner.theory.QUALITIES[k].symbolSuffix===parsed.quality),definition=quality&&owner.theory.QUALITIES[quality];
            const picked=state.shape?candidate(state.shape):null;
            const raw=state.shape&&rootNote&&quality&&Number.isInteger(state.max)&&state.max>=project.instrument.capo&&state.max<=36?owner.caged.getForm(state.shape,quality,(rootNote.pc-project.instrument.capo+12)%12,Math.max(0,state.max-project.instrument.capo),0):null;
            const notes=picked?picked.result.form.notes.map(n=>({string:n.string,fret:n.relativeFret,finger:n.finger})):raw?.available?raw.notes:[];
            const diagram=node('div',undefined,forms);diagram.className='score-chord-fretboard';
            if(rootNote&&definition)drawFretboard(diagram,{notes,shape:state.shape,root:((rootNote.pc-project.instrument.capo)%12+12)%12,muted:picked?picked.result.form.mutedStrings:raw?.mutedStrings||[],definition,view:state.view,max:state.max-project.instrument.capo,capo:project.instrument.capo,theory:owner.theory});
            else node('p','この表記の構成音／フォーム表示は未対応です。入力済みのコードは保持します。',diagram);
            if(state.shape){
                const adoption=node('div',undefined,forms);adoption.className='score-chord-controls';
                const confirm=node('label',undefined,adoption),check=node('input',undefined,confirm);check.type='checkbox';check.dataset.chordInstrument='';check.checked=state.confirmed;confirm.append('標準6弦チューニングを確認');check.addEventListener('change',()=>{if(current()){state.confirmed=check.checked;paint();}});
                const limit=node('label','物理フレット上限',adoption),max=node('input',undefined,limit);max.type='number';max.min=project.instrument.capo;max.max=36;max.value=state.max;max.setAttribute('aria-label','楽器の物理フレット上限');max.addEventListener('change',()=>{if(current()){state.max=max.valueAsNumber;state.played=null;paint();}});
                if(picked){
                    const strings=node('div',undefined,forms);strings.className='score-chord-controls';strings.setAttribute('aria-label','鳴らす弦');const played=state.played??picked.result.form.notes.map(n=>n.string);
                    for(const note of picked.result.form.notes){const l=node('label',undefined,strings),x=node('input',undefined,l);x.type='checkbox';x.checked=played.includes(note.string);x.dataset.chordString=note.string;l.append(note.string+'弦');x.addEventListener('change',()=>{if(current()){state.played=x.checked?[...played,note.string]:played.filter(n=>n!==note.string);paint();}});}
                    const result=adapter.resolve(request(picked.generation,played));
                    const adopt=button('このコードにフォームを採用',()=>{
                        if(!event||event.symbol!==state.symbol||!state.confirmed){state.notice='先にコードの入力と楽器条件を確認してください。';paint();return;}
                        session.finishTextGroup();const h=service.prepare({barId:bar.id,chordEventId:event?.id,instrument:{confirmed:state.confirmed,tuningMidi:[64,59,55,50,45,40],maxAbsoluteFret:state.max},playedStrings:played,generation:picked.generation});
                        if(!h.ok){state.notice='採用できませんでした。入力・保存・競合の状態を確認してください。';paint();return;}
                        const r=service.apply(h);if(r.ok)target.changed();else{state.notice='フォームを採用できませんでした。元の内容を保持しています。';paint();}
                    },adoption,{'data-chord-adopt':''});
                    adopt.disabled=!event||event.symbol!==state.symbol||!state.confirmed||!result.performance.voicingUsable;
                    node('p',!event||event.symbol!==state.symbol?'先に「このマスに入力」でコードを確定してください。':!result.performance.voicingUsable?'使用弦の構成音・最低音が揃わないため採用できません。':'このコードだけに採用します。保存は「保存」から。',forms);
                }else node('p',raw?.available?'この型は表示のみ。既存の採用条件を満たす候補がないため、譜面へのフォーム採用は保留です。':'この型のフォームは未収録または範囲外です。',forms);
            }
            if(state.notice){const notice=node('p',state.notice);notice.setAttribute('role','status');}
        }
        paint();
    }};
}

function drawFretboard(root,{notes,muted,shape,root:pc,definition,view,max,capo,theory}) {
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 720 176');svg.setAttribute('role','img');svg.setAttribute('aria-label',shape?shape+'型の指板（カポ相対）':'コード構成音の指板');root.appendChild(svg);
    const frets=notes.filter(n=>n.fret>0).map(n=>n.fret),start=shape?Math.max(0,Math.min(...frets,1e3)-1):0,count=Math.min(12,Math.max(5,shape?Math.max(...frets,4)-start:12),max-start);
    if(count<1)return;
    const x=f=>44+(f-start+.5)*650/count,y=s=>22+(s-1)*24;
    function draw(tag,attrs,text){const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;svg.appendChild(n);return n;}
    for(let s=1;s<=6;s++){draw('line',{x1:44,x2:694,y1:y(s),y2:y(s),stroke:'#a9aeb2','stroke-width':.7+s*.16});draw('text',{x:16,y:y(s)+4,fill:'#6c747b','font-size':11},String(s));}
    for(let f=0;f<=count;f++){draw('line',{x1:44+f*650/count,x2:44+f*650/count,y1:16,y2:148,stroke:'#92999f','stroke-width':f===0&&start===0?3:1});if(f<count)draw('text',{x:x(start+f),y:168,fill:'#6c747b','font-size':11,'text-anchor':'middle'},String(start+f));}
    const opens=[4,11,7,2,9,4],intervals=definition.intervals;
    // Open/muted strings must remain visible even when the displayed frets start above zero.
    if(shape)for(let s=1;s<=6;s++){
        if(muted.includes(s))draw('text',{x:30,y:y(s)+4,fill:'#6c747b','font-size':12,'text-anchor':'middle'},'×');
        else if(start>0&&notes.some(n=>n.string===s&&n.fret===0))draw('text',{x:30,y:y(s)+4,fill:'#4f687b','font-size':12,'text-anchor':'middle','data-chord-open-string':s},'○');
    }
    for(let s=1;s<=6;s++)for(let f=start;f<start+count;f++){
        const note=notes.find(n=>n.string===s&&n.fret===f),degree=((opens[s-1]+f-pc)%12+12)%12,index=intervals.findIndex(n=>n%12===degree);
        if(shape?!note:index<0)continue;
        const label=view==='finger'?(note?.finger??(f===0?'○':'●')):view==='note'?theory.noteName((opens[s-1]+f+capo)%12,false):view==='solfege'?theory.solfegeName((opens[s-1]+f+capo)%12,false):theory.degreeLabelsForQuality('',intervals)[index]||String(degree);
        draw('circle',{cx:x(f),cy:y(s),r:10,fill:degree===0?'#915d31':'#4f687b'});draw('text',{x:x(f),y:y(s)+4,fill:'white','font-size':10,'text-anchor':'middle'},String(label));
    }
}
