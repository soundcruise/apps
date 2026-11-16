import {chooseExportName,exportComplete} from '../../score-viewer/ui/export-dialogs.mjs';
import {createStudioViewerContract} from '../js/modules/sheet-cruise/viewer-contract.mjs';
import {createViewerLibrary} from '../../score-viewer/core/library.mjs';
import {mountViewer} from '../../score-viewer/ui/viewer.mjs';
import {createPaperLayout} from '../js/modules/sheet-cruise/paper-layout.mjs';
import {createViewerPlayer} from '../../score-viewer/core/audio-player.mjs';
import {createViewerSamples} from '../js/modules/sheet-cruise/viewer-samples.mjs';

export function mountStudioViewer(C,host=document.getElementById('score-viewer-host'),options={}) {
    const contract=createStudioViewerContract({schema:C.model.schema2}),library=createViewerLibrary({indexedDB:window.indexedDB,codec:contract.codec}),layouts=new WeakMap();
    options.onServices?.({contract,library});
    function renderPaper(reader,host,{width}) {
        const {document:doc,presentation:p}=reader.read(),score=doc.score;
        const logicalWidth=width/p.zoom,automatic=p.flow==='responsive',columns=automatic?(logicalWidth<600?1:logicalWidth<1050?2:4):p.layout.barsPerLine||4;
        const paperWidth=automatic?Math.max(100,Math.floor(logicalWidth)):Math.max(794,Math.floor(logicalWidth));
        host.style.width=Math.ceil(paperWidth*p.zoom)+'px';
        // A separate in-memory presentation owner shares CSS/geometry only. It
        // never reads or writes the editor's AppSettings or row configuration.
        let local=layouts.get(host);
        if(!local){const surface=host.ownerDocument.createElement('div');surface.className='sv-sheet';host.append(surface);local={surface,layout:createPaperLayout({storage:{getAppSetting:()=>null,setAppSetting:()=>({ok:true})},localPaperForms:C.localPaperForms},host.ownerDocument)};layouts.set(host,local);}
        const {surface,layout}=local;
        surface.style.width=paperWidth+'px';surface.style.transform='scale('+p.zoom+')';
        layout.set(p.layout,false);
        const visibility={...C.sheetRenderer.resolveShowSettings(score),...p.layout.appearance.visibility};
        const structureView=C.model.toStructureView(score);
        const forms=visibility.forms!==false&&C.localPaperForms.view(score,{scale:p.layout.formScale});
        const rules=new Map(p.rows.map(r=>[r.barId,r]));
        reader.renderWith(C.sheetRenderer,surface,{reuseBars:true,barsPerLine:columns,visibility,structureView,formsForBar:forms?forms.row:null,
            resolutionForBar(bar){const slots=C.model.getBarEffectiveStrumSlots(structureView,bar.barNumber);return Math.max(C.model.barNeedsSixteenthResolution({strumSlots:Array.isArray(slots)?slots:[]})?16:8,p.layout.gridResolution||0);},
            contentKey:doc.viewerDocumentId+':'+doc.revisionId+':'+JSON.stringify([visibility,p.layout.gridResolution]),
            lineLayoutForSlot:automatic?undefined:id=>rules.get(id)||null});
        layout.apply(surface);host.style.height=Math.ceil(surface.scrollHeight*p.zoom)+'px';
    }
    const loadSample=createViewerSamples(C,document);
    function createPlayback(doc,settings,onState){
        let plan;try{plan=contract.tickPlan(doc.score);}catch{const melody=contract.tickPlan(doc.score,{melodyOnly:true});plan={...melody,warnings:['この伴奏形式は再生未対応です。メロディと拍音のみ再生します。',...melody.warnings]};}
        return createViewerPlayer({plan,originalBpm:doc.score.songInfo.bpm,settings,loadSample,coordinator:C.audio,
            createClock:options=>contract.createClock(doc.score,options),createContext:()=>new(window.AudioContext||window.webkitAudioContext)(),
            sessionId:'studio.viewer.'+crypto.randomUUID(),onState});
    }
    return mountViewer({host,contract,library,renderPaper,createPlayback,...options});
}

export async function saveToViewerLibrary(C,bytes,{isCurrent=()=>true}={}){
    const contract=createStudioViewerContract({schema:C.model.schema2}),library=createViewerLibrary({indexedDB:window.indexedDB,codec:contract.codec});
    try{const decoded=await contract.codec.decode(bytes),name=decoded.document.score.songInfo.title||'無題';
        for(let attempt=0;attempt<3;attempt++){
            const [entries,folders]=await Promise.all([library.list(),library.listFolders()]);if(!isCurrent())throw Error('viewer-export-stale');
            const options=await chooseExportName(document,{name,entries,folders});if(!options)return null;
            try{return await library.save(bytes,{select:false,canSave:isCurrent,...options,requireUniqueName:options.newEntry===true});}
            catch(error){if(!['viewer-name-conflict','viewer-entry-conflict'].includes(error.message))throw error;}
        }throw Error('viewer-entry-conflict');
    }finally{await library.close();}
}
export async function showViewerExportComplete(C,row){if(await exportComplete(document,row.title))return C.scoreViewer.openEntry(row.entryId);return false;}
export async function readViewerEntry(C,entryId){const contract=createStudioViewerContract({schema:C.model.schema2}),library=createViewerLibrary({indexedDB:window.indexedDB,codec:contract.codec});try{return await library.read(entryId);}finally{await library.close();}}
