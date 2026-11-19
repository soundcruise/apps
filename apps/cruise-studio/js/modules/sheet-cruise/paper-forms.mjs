import {bindOutsideDismiss} from '../score-ui.mjs';
import {playedSnapshot} from './form-cycle.mjs';
// Read-only registered forms, rendered with the owner's static SVG (no title/UI).
export function registeredPaperForms(project){
    const materials=new Map(project.materials.forms.map(m=>[m.id,m])),bindings=new Map(project.performance.formBindings.map(b=>[b.chordEventId,b]));
    return project.bars.map(bar=>bar.chords.flatMap(chord=>{const binding=bindings.get(chord.id),material=materials.get(binding?.materialId);if(!material?.snapshot?.strings.some(n=>n.kind==='note'))return [];
        const snapshot=playedSnapshot(material.snapshot,binding.playedStrings);
        return [{eventId:chord.id,tick:chord.onsetTick,symbol:chord.symbol,snapshot,materialId:material.id}];}).sort((a,b)=>a.tick-b.tick));
}
// Geometry is independent of the SVG artwork and of the Project snapshot.
function layoutEntries(entries,beats,scale){
    const columns=beats/scale,span=100/columns,groups=[];let group=null;
    for(const e of entries){const left=Math.max(0,Math.min(e.tick/(beats*480)*100+(100/beats-span)/2,100-span));
        if(!group||left>=group.end){group={end:0,ends:[],entries:[]};groups.push(group);}
        let level=group.ends.findIndex(end=>end<=left);if(level<0)level=group.ends.length;group.ends[level]=left+span;group.end=Math.max(group.end,left+span);group.entries.push({...e,left,level});
    }
    return groups.flatMap(group=>group.entries.map(e=>({...e,depth:group.ends.length})));
}
function positionForms(row,entries,columns){
    const levels=entries.reduce((max,e)=>Math.max(max,e.depth),1);row.dataset.formResolution=columns;
    for(const e of entries){const center=(e.level+.5+(levels-e.depth)/2)/levels;
        Object.assign(e.box.style,{left:'calc('+e.left+'% + 2px)',top:'calc('+(center*100)+'% + '+(4-8*center)+'px)',width:'calc('+100/columns+'% - 4px)'});
    }
    row.children[0].style.aspectRatio=(columns*345)+' / '+(levels*269);
}
export function createPaperForms(renderer,doc=document){
    const svgCache=new Map(),templates=new Map(),lists=new WeakMap();let zoomDialog=null;
    const labels={1:'人',2:'中',3:'薬',4:'小',T:'親'};
    function optionsFor(snapshot,fingers,showZero=false){
        const notes=snapshot.strings.filter(n=>n.kind==='note'),fretsOf=notes.map(n=>n.relativeFret),openNote=fretsOf.includes(0),open=showZero||openNote||snapshot.strings.some(n=>n.kind==='muted'),min=openNote?0:Math.min(...fretsOf,notes.length?Infinity:1),max=Math.max(openNote?3:min,...fretsOf),frets=[];
        if(open)frets.push(0);for(let f=Math.max(1,min);f<=max;f++)frets.push(f);
        const options={monochrome:true,frets,openStringNutOnly:open,monochromeViewportLeftCrop:open?12:0,monochromeFretNumberYOffset:10,
            markers:notes.map(n=>({string:n.string,fret:n.relativeFret,label:fingers?(labels[n.finger]||(n.fingeringWarning?'⚠':'')):'',role:'root'})),
            mutedStrings:snapshot.strings.filter(n=>n.kind==='muted').map(n=>n.string),barres:snapshot.barres.map(b=>({...b,fret:b.relativeFret})),markerLabelFontSize:18,fretNumberScale:19/13};
        return options;
    }
    function svg(snapshot,fingers,showZero=false){
        const key=JSON.stringify([snapshot,fingers,showZero]);if(svgCache.has(key))return svgCache.get(key);
        const options=optionsFor(snapshot,fingers,showZero),open=options.frets.includes(0);
        const width=renderer.createModel(options).width,crop=open?12:0,pad=Math.max(10,(345-width+crop)/2);
        const result=renderer.buildStaticSvg({...options,svgPadding:{left:pad,right:pad,top:8,bottom:20,fillMonochromeBackground:true}}).replace(/(<text x="[^"]+" y=")([^"]+)(" text-anchor="middle")(?=[^>]*style="font-family:Arial,sans-serif;font-size:18px)/g,(_,before,y,after)=>before+(Number(y)-4)+after+' dominant-baseline="central"');
        svgCache.set(key,result);if(svgCache.size>256)svgCache.delete(svgCache.keys().next().value);return result;
    }
    // Parse each trusted static SVG once. Clones remain self-contained, including
    // their own gradients, rather than referencing another page's definitions.
    function appendSvg(box,text){
        if(!doc.createElementNS){box.innerHTML=text;return;}
        let template=templates.get(text);
        if(!template){template=doc.createElement('template');template.innerHTML=text;templates.set(text,template);if(templates.size>256)templates.delete(templates.keys().next().value);}
        box.appendChild(template.content.cloneNode(true));
    }
    function styles(){if(doc.getElementById?.('sc-form-list-style'))return;const style=doc.createElement('style');style.id='sc-form-list-style';style.textContent=`
.sc-form-list{max-width:738px;margin-top:28px;padding-top:18px;border-top:1px solid #aaa59b;break-before:auto}.sc-form-list h2{font:600 16px system-ui;margin:0 0 16px}.sc-form-list-grid{display:grid;grid-template-columns:repeat(auto-fill,min(100%,calc(100px * var(--sc-form-list-scale,1))));gap:16px}.sc-form-list .sc-form-list-item{display:grid;align-content:start;gap:6px;min-width:0;width:100%;box-sizing:border-box;background:transparent;border:0;color:#29251f;text-align:center;cursor:zoom-in;break-inside:avoid;padding:4px}.sc-form-list-item strong{color:#29251f;font:600 16px system-ui}.sc-form-list-item svg{display:block;width:100%;height:auto}.sc-readonly-form{position:fixed;inset:0;margin:auto;height:fit-content;box-sizing:border-box;width:min(400px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;padding:18px;background:#fffdf7;color:#29251f;border:1px solid #8b857a;border-radius:14px}.sc-readonly-form::backdrop{background:#10182088}.sc-readonly-form header{display:flex;align-items:center;gap:12px}.sc-readonly-form h2{flex:1;text-align:center;font:650 26px system-ui;margin:8px 0}.sc-readonly-form button{font:14px system-ui;padding:8px 12px;border:1px solid #aaa59b;border-radius:7px;background:transparent;cursor:pointer}.sc-readonly-form figure{margin:12px 0 0}.sc-readonly-form svg{display:block;width:100%;height:auto}@media print{.sc-readonly-form{display:none!important}.sc-form-list-item{cursor:default}.sc-form-list{color:#29251f}}
`;doc.head.append(style);}
    function catalogue(project){const seen=new Set();return registeredPaperForms(project).flat().filter(e=>{const key=JSON.stringify([e.symbol,e.snapshot]);if(seen.has(key))return false;seen.add(key);return true;});}
    function closeZoom(){zoomDialog?.close();zoomDialog=null;}
    function zoom(project,eventId){const entry=registeredPaperForms(project).flat().find(e=>e.eventId===eventId);if(!entry)return;closeZoom();styles();const previous=doc.activeElement,d=doc.createElement('dialog');zoomDialog=d;d.className='sc-readonly-form';d.setAttribute('aria-label',entry.symbol+'のコードフォーム');const h=doc.createElement('header'),title=doc.createElement('h2'),close=doc.createElement('button'),figure=doc.createElement('figure');h.className='score-form-header';title.textContent=entry.symbol;close.type='button';close.textContent='閉じる';close.onclick=()=>d.close();h.append(title,close);appendSvg(figure,svg(entry.snapshot,true,true));d.append(h,figure);d.addEventListener('keydown',e=>e.stopPropagation());d.addEventListener('close',()=>{if(zoomDialog===d)zoomDialog=null;d.remove();if(previous?.isConnected)previous.focus({preventScroll:true});},{once:true});(doc.fullscreenElement||doc.body).append(d);bindOutsideDismiss(d);d.showModal();close.focus();}
    return {
        catalogue,zoom,closeZoom,
        list(project,{interactive=true}={}){styles();const entries=catalogue(project);if(!entries.length)return null;const section=doc.createElement('section');section.className='sc-form-list';const title=doc.createElement('h2');title.textContent='フォーム一覧';const items=[],grid=doc.createElement('div');grid.className='sc-form-list-grid';section.dataset.formListFingers='true';section.append(title,grid);for(const entry of entries){const button=doc.createElement(interactive?'button':'div'),label=doc.createElement('strong');if(interactive)button.type='button';button.className='sc-form-list-item';if(interactive)button.dataset.formEvent=entry.eventId;button.setAttribute('aria-label',entry.symbol+'のフォームを拡大');label.textContent=entry.symbol;button.append(label);const image=doc.createElement('div');image.className='sc-form-list-svg';button.append(image);appendSvg(image,svg(entry.snapshot,true));items.push({image,entry});if(interactive)button.onclick=e=>{e.stopPropagation();zoom(project,entry.eventId);};grid.append(button);}lists.set(section,{fingers:true,items});return section;},
        resizeList(host,percent){const fingers=percent>=100;host.querySelectorAll('.sc-form-list').forEach(section=>{const record=lists.get(section);if(!record||record.fingers===fingers)return;record.fingers=fingers;section.dataset.formListFingers=String(fingers);for(const {image,entry}of record.items){image.replaceChildren();appendSvg(image,svg(entry.snapshot,fingers));}});},
        resize(host,percent){
            const scale=Number.isFinite(percent)?Math.max(60,Math.min(140,percent))/100:1;
            host.querySelectorAll('.sheet-bar-forms[data-form-beats]').forEach(row=>{
                const beats=Number(row.dataset.formBeats);if(Number(row.dataset.formResolution)===beats/scale)return;const entries=Array.from(row.children[0].children,box=>({tick:Number(box.dataset.slotTick),box}));
                positionForms(row,layoutEntries(entries,beats,scale),beats/scale);
            });
        },
        diagram(snapshot){const opts=optionsFor(snapshot,true,true);return {svg:svg(snapshot,true,true),slots:opts.frets.flatMap(fret=>renderer.createModel({...opts,mutedStrings:[],markers:[1,2,3,4,5,6].map(string=>({string,fret}))}).markers),model:renderer.createModel(opts),rows:renderer.createModel({...opts,markers:[1,2,3,4,5,6].map(string=>({string,fret:opts.frets[0]}))}).markers};},
        detail(project,eventId){const entry=registeredPaperForms(project).flat().find(e=>e.eventId===eventId);return entry?{symbol:entry.symbol,svg:svg(entry.snapshot,true)}:null;},
        view(project,options={}){
            const rows=registeredPaperForms(project),beats=project.songInfo?.timeSignature?.beats||4,scale=Number.isFinite(options.scale)?Math.max(60,Math.min(140,options.scale))/100:1,columns=beats/scale;
            const layouts=rows.map(entries=>layoutEntries(entries,beats,scale));
            return {
                has:number=>!!rows[number-1]?.length,
                row(number){
                    const entries=layouts[number-1];
                    if(!entries)return null;
                    const row=doc.createElement('div');row.className='sheet-bar-row sheet-bar-forms';row.dataset.formBeats=beats;const lane=doc.createElement('div');lane.className='sheet-form-lane';row.appendChild(lane);
                    const positioned=[];for(const e of entries){
                        const box=doc.createElement('span');box.className='sheet-form-event';box.dataset.formEvent=e.eventId;box.dataset.formMaterial=e.materialId;box.dataset.slotTick=e.tick;box.setAttribute('role','button');box.tabIndex=0;box.setAttribute('aria-haspopup','dialog');box.setAttribute('aria-label',e.symbol+'の登録フォーム');
                        appendSvg(box,svg(e.snapshot,false));lane.appendChild(box);positioned.push({...e,box});
                    }
                    positionForms(row,positioned,columns);return row;
                }
            };
        }
    };
}
