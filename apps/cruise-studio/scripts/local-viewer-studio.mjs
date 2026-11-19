import {chooseExportName,exportComplete} from '../../score-viewer/ui/export-dialogs.mjs';
import {createStudioViewerContract} from '../js/modules/sheet-cruise/viewer-contract.mjs';
import {createViewerLibrary} from '../../score-viewer/core/library.mjs';
import {mountViewer} from '../../score-viewer/ui/viewer.mjs';
import {createPaperLayout} from '../js/modules/sheet-cruise/paper-layout.mjs';
import {createViewerPlayer} from '../../score-viewer/core/audio-player.mjs';
import {createViewerSamples} from '../js/modules/sheet-cruise/viewer-samples.mjs';

export function createViewerPaperRenderer(C){const layouts=new WeakMap();
    function renderPaper(reader,host,{width,interactive=false}) {
        const {document:doc,presentation:stored}=reader.read(),score=doc.score;
        const p=host.closest('.score-fullscreen')&&stored.flow!=='horizontal'?{...stored,flow:'source'}:stored;
        const logicalWidth=width/p.zoom,automatic=p.flow==='responsive',horizontal=p.flow==='horizontal',scale=p.flow==='source'?width/794*p.zoom:p.zoom,columns=automatic?(logicalWidth<600?1:logicalWidth<1050?2:4):p.layout.barsPerLine||4;
        const paperWidth=p.flow==='source'?794:automatic?Math.max(100,Math.floor(logicalWidth)):Math.max(794,Math.floor(logicalWidth));
        host.style.width=Math.ceil(paperWidth*scale)+'px';
        // A separate in-memory presentation owner shares CSS/geometry only. It
        // never reads or writes the editor's AppSettings or row configuration.
        let local=layouts.get(host);
        if(!local){const surface=host.ownerDocument.createElement('div');surface.className='sv-sheet';host.append(surface);local={surface,layout:createPaperLayout({storage:{getAppSetting:()=>null,setAppSetting:()=>({ok:true})},localPaperForms:C.localPaperForms},host.ownerDocument)};layouts.set(host,local);}
        const {surface,layout}=local;surface.classList.toggle('sv-horizontal-sheet',horizontal);
        surface.classList.toggle('sv-horizontal-sheet',horizontal);surface.style.width=paperWidth+'px';surface.style.transform='scale('+scale+')';
        layout.set(p.layout,false);
        const visibility={...C.sheetRenderer.resolveShowSettings(score),...p.layout.appearance.visibility};
        const structureView=C.model.toStructureView(score);
        const forms=visibility.forms!==false&&C.localPaperForms.view(score,{scale:p.layout.formScale});
        const rules=new Map(p.rows.map(r=>[r.barId,r]));
        reader.renderWith(C.sheetRenderer,surface,{reuseBars:!horizontal&&local.flow!=='horizontal',barsPerLine:automatic?columns:(p.layout.barsPerLine||undefined),visibility,structureView,formsList:visibility.formList?C.localPaperForms.list(score,{interactive}):null,formsForBar:forms?forms.row:null,
            resolutionForBar(bar){const slots=C.model.getBarEffectiveStrumSlots(structureView,bar.barNumber);return Math.max(C.model.barNeedsSixteenthResolution({strumSlots:Array.isArray(slots)?slots:[]})?16:8,p.layout.gridResolution||0);},
            contentKey:doc.viewerDocumentId+':'+doc.revisionId+':'+JSON.stringify([visibility,p.layout.gridResolution]),
            lineLayoutForSlot:automatic?undefined:id=>rules.get(id)||null});
        if(interactive&&!local.zoomBound){surface.addEventListener('click',e=>{const form=e.target.closest('.sheet-form-event');if(form){e.stopPropagation();C.localPaperForms.zoom(local.reader.read().document.score,form.dataset.formEvent);}});surface.addEventListener('keydown',e=>{const form=e.target.closest('.sheet-form-event');if(form&&['Enter',' '].includes(e.key)){e.preventDefault();e.stopPropagation();C.localPaperForms.zoom(local.reader.read().document.score,form.dataset.formEvent);}});local.zoomBound=true;}local.reader=reader;
        if(interactive)surface.querySelectorAll('.sheet-form-event').forEach(e=>{e.tabIndex=0;e.setAttribute('role','button');e.setAttribute('aria-haspopup','dialog');e.style.cursor='zoom-in';});
        layout.apply(surface);local.flow=p.flow;
        if(horizontal){const page=surface.querySelector('.sheet-page'),bars=Array.from(surface.querySelectorAll('.sheet-bar[data-bar-number]')),line=host.ownerDocument.createElement('div'),barWidth=Math.max(180,logicalWidth/4);line.className='sheet-line sv-horizontal-line';
            const heights=new Map();for(const bar of bars)for(const row of bar.children)if(row.classList.contains('sheet-bar-row')){const key=Array.from(row.classList).filter(c=>c!=='sheet-bar-row').join(' ');heights.set(key,Math.max(heights.get(key)||0,row.getBoundingClientRect().height/scale));}
            for(const bar of bars){bar.style.flex='0 0 '+barWidth+'px';bar.style.width=barWidth+'px';for(const row of bar.children)if(row.classList.contains('sheet-bar-row')){const key=Array.from(row.classList).filter(c=>c!=='sheet-bar-row').join(' ');if(heights.get(key)>0)row.style.height=heights.get(key)+'px';}line.append(bar);}
            const seen=new Set();for(const bar of bars){const id=score.bars[Number(bar.dataset.barNumber)-1]?.sectionId;if(!id||seen.has(id))continue;seen.add(id);const section=score.sections.find(s=>s.id===id);if(section){const label=host.ownerDocument.createElement('span');label.className='sheet-section-label sv-horizontal-section';label.textContent=section.name;label.title=section.name;label.style.maxWidth=(barWidth-10)+'px';bar.append(label);}}
            page.querySelectorAll('.sheet-line,.sheet-section-heading').forEach(e=>e.remove());page.insertBefore(line,page.querySelector('.sc-form-list'));const total=bars.length*barWidth+56;surface.style.width=total+'px';host.style.width=Math.ceil(total*scale)+'px';page.querySelector('.sheet-header')?.style.setProperty('max-width',Math.max(200,logicalWidth-56)+'px');
        }
        host.style.height=Math.ceil(surface.scrollHeight*scale)+'px';
    }
    renderPaper.closeForms=()=>C.localPaperForms.closeZoom();renderPaper.forms=C.localPaperForms;return renderPaper;
}

export function mountStudioViewer(C,host=document.getElementById('score-viewer-host'),options={}) {
    const contract=createStudioViewerContract({schema:C.model.schema2}),library=createViewerLibrary({indexedDB:window.indexedDB,codec:contract.codec}),renderPaper=createViewerPaperRenderer(C);
    options.onServices?.({contract,library});
    const loadSample=createViewerSamples(C,document);
    function createPlayback(doc,settings,onState){
        let plan;try{plan=contract.tickPlan(doc.score);}catch{const melody=contract.tickPlan(doc.score,{melodyOnly:true});plan={...melody,warnings:['この伴奏形式は再生未対応です。メロディと拍音のみ再生します。',...melody.warnings]};}
        return createViewerPlayer({plan,originalBpm:doc.score.songInfo.bpm,settings,loadSample,coordinator:C.audio,
            createClock:options=>contract.createClock(doc.score,options),createContext:()=>new(window.AudioContext||window.webkitAudioContext)(),
            sessionId:'studio.viewer.'+crypto.randomUUID(),onState});
    }
    createPlayback.stopGeneration=()=>C.audio.getStopGeneration();return mountViewer({host,contract,library,renderPaper,createPlayback,...options});
}

export async function saveToViewerLibrary(C,bytes,{isCurrent=()=>true}={}){
    const contract=createStudioViewerContract({schema:C.model.schema2}),library=createViewerLibrary({indexedDB:window.indexedDB,codec:contract.codec});
    try{const decoded=await contract.codec.decode(bytes),name=decoded.document.score.songInfo.title||'無題';
        for(let attempt=0;attempt<3;attempt++){
            const [entries,folders]=await Promise.all([library.list(),library.listFolders()]);if(!isCurrent())throw Error('viewer-export-stale');
            const options=await chooseExportName(document,{name,entries,folders,createFolder:async(name,parent)=>{if(!isCurrent())throw Error('viewer-export-stale');return library.createFolder(name,parent);}});if(!options)return null;
            try{return await library.save(bytes,{select:false,canSave:isCurrent,...options,requireUniqueName:options.newEntry===true});}
            catch(error){if(!['viewer-name-conflict','viewer-entry-conflict'].includes(error.message))throw error;}
        }throw Error('viewer-entry-conflict');
    }finally{await library.close();}
}
export async function showViewerExportComplete(C,row){if(await exportComplete(document,row.title))return C.scoreViewer.openEntry(row.entryId);return false;}
export async function readViewerEntry(C,entryId){const contract=createStudioViewerContract({schema:C.model.schema2}),library=createViewerLibrary({indexedDB:window.indexedDB,codec:contract.codec});try{return await library.read(entryId);}finally{await library.close();}}

export async function exportEditorPDF(C,project,presentation,{isCurrent=()=>true,notify=()=>{}}={}){const contract=createStudioViewerContract({schema:C.model.schema2}),file=await contract.codec.encode(project,{documentId:'pdf-'+crypto.randomUUID(),revisionId:crypto.randomUUID(),exportedAt:new Date().toISOString(),studioVersion:'0.192.0-dev.1',defaultPresentation:presentation});if(!isCurrent())return false;const {downloadScorePDF}=await import('../../score-viewer/ui/pdf-download.mjs');return downloadScorePDF({document,contract,bytes:file.text,presentation,renderPaper:createViewerPaperRenderer(C),name:project.songInfo.title,notify,isCurrent});}
