// Read-only registered forms, rendered with the owner's static SVG (no title/UI).
export function registeredPaperForms(project){
    const materials=new Map(project.materials.forms.map(m=>[m.id,m])),bindings=new Map(project.performance.formBindings.map(b=>[b.chordEventId,b.materialId]));
    return project.bars.map(bar=>bar.chords.flatMap(chord=>{const material=materials.get(bindings.get(chord.id));return material?.snapshot?.strings.some(n=>n.kind==='note')?[{eventId:chord.id,tick:chord.onsetTick,symbol:chord.symbol,snapshot:material.snapshot,materialId:material.id}]:[];}).sort((a,b)=>a.tick-b.tick));
}
export function createPaperForms(renderer,doc=document){
    const labels={1:'人',2:'中',3:'薬',4:'小',T:'親'};
    function svg(snapshot){
        const notes=snapshot.strings.filter(n=>n.kind==='note'),fretsOf=notes.map(n=>n.relativeFret),open=fretsOf.includes(0),min=open?0:Math.min(...fretsOf),max=Math.max(open?3:min,...fretsOf),frets=[];
        if(open)frets.push(0);for(let f=Math.max(1,min);f<=max;f++)frets.push(f);
        const options={monochrome:true,frets,openStringNutOnly:open,monochromeViewportLeftCrop:open?12:0,monochromeFretNumberYOffset:10,
            markers:notes.map(n=>({string:n.string,fret:n.relativeFret,label:labels[n.finger]||(n.fingeringWarning?'⚠':''),role:'root'})),
            mutedStrings:snapshot.strings.filter(n=>n.kind==='muted').map(n=>n.string),barres:snapshot.barres.map(b=>({...b,fret:b.relativeFret})),markerLabelFontSize:18,fretNumberScale:19/13};
        const width=renderer.createModel(options).width,crop=open?12:0,pad=Math.max(10,(280-width+crop)/2);
        return renderer.buildStaticSvg({...options,svgPadding:{left:pad,right:pad,top:8,bottom:20,fillMonochromeBackground:true}});
    }
    return {
        view(project){
            const rows=registeredPaperForms(project);
            return {
                has:number=>!!rows[number-1]?.length,
                row(number,resolution){
                    const entries=rows[number-1];
                    if(!entries?.length)return null;
                    const row=doc.createElement('div');row.className='sheet-bar-row sheet-bar-forms';row.dataset.formResolution=resolution;
                    let levels=1;const counts=new Map();
                    for(const e of entries){const level=counts.get(e.tick)||0;counts.set(e.tick,level+1);levels=Math.max(levels,level+1);const next=entries.find(n=>n.tick>e.tick)?.tick??1920,gap=(next-e.tick)/1920*100;
                        const box=doc.createElement('span');box.className='sheet-form-event';box.dataset.formEvent=e.eventId;box.dataset.formMaterial=e.materialId;box.dataset.slotTick=e.tick;box.setAttribute('role','img');box.setAttribute('aria-label',e.symbol+'の登録フォーム');
                        Object.assign(box.style,{left:e.tick/1920*100+'%',top:level*82+'px',width:'max(1px,min(78px,calc('+gap+'% - 4px)))'});box.innerHTML=svg(e.snapshot);row.appendChild(box);
                    }
                    row.style.height=levels*82+'px';return row;
                }
            };
        }
    };
}
