// Read-only registered forms, rendered with the owner's static SVG (no title/UI).
export function registeredPaperForms(project){
    const materials=new Map(project.materials.forms.map(m=>[m.id,m])),bindings=new Map(project.performance.formBindings.map(b=>[b.chordEventId,b.materialId]));
    return project.bars.map(bar=>bar.chords.flatMap(chord=>{const material=materials.get(bindings.get(chord.id));return material?.snapshot?.strings.some(n=>n.kind==='note')?[{eventId:chord.id,tick:chord.onsetTick,symbol:chord.symbol,snapshot:material.snapshot,materialId:material.id}]:[];}).sort((a,b)=>a.tick-b.tick));
}
export function createPaperForms(renderer,doc=document){
    const svgCache=new Map();
    const labels={1:'人',2:'中',3:'薬',4:'小',T:'親'};
    function svg(snapshot,fingers){
        const key=JSON.stringify([snapshot,fingers]);
        if(svgCache.has(key)){const cached=svgCache.get(key);svgCache.delete(key);svgCache.set(key,cached);return cached;}
        const notes=snapshot.strings.filter(n=>n.kind==='note'),fretsOf=notes.map(n=>n.relativeFret),open=fretsOf.includes(0),min=open?0:Math.min(...fretsOf),max=Math.max(open?3:min,...fretsOf),frets=[];
        if(open)frets.push(0);for(let f=Math.max(1,min);f<=max;f++)frets.push(f);
        const options={monochrome:true,frets,openStringNutOnly:open,monochromeViewportLeftCrop:open?12:0,monochromeFretNumberYOffset:10,
            markers:notes.map(n=>({string:n.string,fret:n.relativeFret,label:fingers?(labels[n.finger]||(n.fingeringWarning?'⚠':'')):'',role:'root'})),
            mutedStrings:snapshot.strings.filter(n=>n.kind==='muted').map(n=>n.string),barres:snapshot.barres.map(b=>({...b,fret:b.relativeFret})),markerLabelFontSize:18,fretNumberScale:19/13};
        const width=renderer.createModel(options).width,crop=open?12:0,pad=Math.max(10,(345-width+crop)/2);
        const result=renderer.buildStaticSvg({...options,svgPadding:{left:pad,right:pad,top:8,bottom:20,fillMonochromeBackground:true}}).replace(/(<text x="[^"]+" y=")([^"]+)(" text-anchor="middle")(?=[^>]*style="font-family:Arial,sans-serif;font-size:18px)/g,(_,before,y,after)=>before+(Number(y)-4)+after+' dominant-baseline="central"');
        svgCache.set(key,result);if(svgCache.size>256)svgCache.delete(svgCache.keys().next().value);return result;
    }
    return {
        detail(project,eventId){const entry=registeredPaperForms(project).flat().find(e=>e.eventId===eventId);return entry?{symbol:entry.symbol,svg:svg(entry.snapshot,true)}:null;},
        view(project,options={}){
            const rows=registeredPaperForms(project),beats=project.songInfo?.timeSignature?.beats||4,scale=Number.isFinite(options.scale)?Math.max(60,Math.min(140,options.scale))/100:1,columns=beats/scale,span=100/columns;
            // One beat per diagram, independent of eighth/sixteenth display resolution.
            const layouts=rows.map(entries=>{
                const groups=[];let group=null;
                for(const e of entries){const left=Math.max(0,Math.min(e.tick/1920*100+(100/beats-span)/2,100-span));
                    if(!group||left>=group.end){group={end:0,ends:[],entries:[]};groups.push(group);}
                    let level=group.ends.findIndex(end=>end<=left);if(level<0)level=group.ends.length;group.ends[level]=left+span;group.end=Math.max(group.end,left+span);group.entries.push({...e,left,level});
                }
                return groups.flatMap(group=>group.entries.map(e=>({...e,depth:group.ends.length})));
            });
            return {
                has:number=>!!rows[number-1]?.length,
                row(number){
                    const entries=layouts[number-1];
                    if(!entries)return null;
                    const levels=entries.reduce((max,e)=>Math.max(max,e.depth),1);
                    const row=doc.createElement('div');row.className='sheet-bar-row sheet-bar-forms';row.dataset.formResolution=columns;const lane=doc.createElement('div');lane.className='sheet-form-lane';row.appendChild(lane);
                    for(const e of entries){const level=e.level;
                        const box=doc.createElement('span');box.className='sheet-form-event';box.dataset.formEvent=e.eventId;box.dataset.formMaterial=e.materialId;box.dataset.slotTick=e.tick;box.setAttribute('role','button');box.tabIndex=0;box.setAttribute('aria-haspopup','dialog');box.setAttribute('aria-label',e.symbol+'の登録フォーム');
                        Object.assign(box.style,{left:'calc('+e.left+'% + 2px)',top:'calc('+((level+.5+(levels-e.depth)/2)/levels*100)+'% + '+(4-8*(level+.5+(levels-e.depth)/2)/levels)+'px)',width:'calc('+100/columns+'% - 4px)'});box.innerHTML=svg(e.snapshot,false);lane.appendChild(box);
                    }
                    // The lane only reserves height. Absolute diagram coordinates belong to the
                    // whole shared form row, not a flex item's baseline or intrinsic height.
                    lane.style.aspectRatio=(columns*345)+' / '+(levels*269);return row;
                }
            };
        }
    };
}
