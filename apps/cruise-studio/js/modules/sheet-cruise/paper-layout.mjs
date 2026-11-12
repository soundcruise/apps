// Browser-local presentation preferences. Never edits a Project or its Session.
export const DEFAULT_LAYOUT=Object.freeze({barsPerLine:0,chordHeight:24,titleSize:26,metaSize:12,chordSize:17.5,strumSize:14,lyricsSize:13.5,doremiSize:13.5,partSize:13,numberSize:9,showNumbers:true,showParts:true});
const ranges={chordHeight:[22,64],titleSize:[18,40],metaSize:[9,18],chordSize:[12,28],strumSize:[10,24],lyricsSize:[10,24],doremiSize:[10,24],partSize:[10,22],numberSize:[8,16]};
export function normalizeLayout(value){const out={...DEFAULT_LAYOUT},v=value&&typeof value==='object'?value:{};for(const [key,[min,max]] of Object.entries(ranges))if(typeof v[key]==='number'&&Number.isFinite(v[key]))out[key]=Math.max(min,Math.min(max,v[key]));if([0,1,2,3,4].includes(v.barsPerLine))out.barsPerLine=v.barsPerLine;for(const key of ['showNumbers','showParts'])if(typeof v[key]==='boolean')out[key]=v[key];return out;}
export function normalizeLineRules(rows){
    const result=new Map();if(!Array.isArray(rows)||rows.length>2048)return [];
    for(const row of rows)if(row&&typeof row.barId==='string'&&row.barId.length>0&&row.barId.length<=160&&Number.isInteger(row.columns)&&row.columns>=1&&row.columns<=8&&Number.isInteger(row.used)&&row.used>=1&&row.used<=row.columns)result.set(row.barId,{barId:row.barId,columns:row.columns,used:row.used});
    return Array.from(result.values());
}
export function createPaperLayout(C,doc=document){
    const key='scorePaperLayoutV1';let value=normalizeLayout(C.storage.getAppSetting(key)),dialog=null,changed=()=>{},refreshSample=()=>{};
    const rowKey='scorePaperRowsV1',rowProjects=new Map();
    const savedRows=C.storage.getAppSetting(rowKey);if(Array.isArray(savedRows))for(const record of savedRows)if(record&&typeof record.projectId==='string'&&record.projectId.length<=160)rowProjects.set(record.projectId,normalizeLineRules(record.rows));
    if(!doc.getElementById('sc-paper-layout-style')){const style=doc.createElement('style');style.id='sc-paper-layout-style';style.textContent=`
.sc-paper-layout .sheet-title{font-size:var(--sc-titleSize)!important;}
.sc-paper-layout .sheet-meta{font-size:var(--sc-metaSize)!important;}
.sc-paper-layout .sheet-section-label{font-size:var(--sc-partSize)!important;}
.sc-paper-layout.sc-hide-parts .sheet-section-label{display:none!important;}
.sc-paper-layout .sheet-bar-num{font-size:var(--sc-numberSize)!important;min-height:18px!important;line-height:1.3;}
.sc-paper-layout.sc-hide-numbers .sheet-bar-num,.sc-paper-layout.sc-hide-numbers [data-edit-selected-bar]{display:none!important;}
.sc-paper-layout .sheet-bar-chord{height:max(var(--sc-chordHeight),calc(var(--sc-chordSize) * 1.35));min-height:0!important;font-size:var(--sc-chordSize)!important;align-items:center;padding:0!important;}
.sc-paper-layout .sheet-bar-chord>.sheet-timed-cell{line-height:1.2;}
.sc-paper-layout .sheet-bar-lyrics{font-size:var(--sc-lyricsSize)!important;}
.sc-paper-layout .sheet-bar-doremi{font-size:var(--sc-doremiSize)!important;}
.sc-paper-layout .sheet-bar-strum{font-size:var(--sc-strumSize)!important;column-gap:0;margin:0 calc(-1 * var(--sheet-bar-pad-x));padding:3px 0 0;border-radius:0;background:transparent;box-shadow:none;}
.sc-paper-layout .sheet-bar-strum>span:not([data-playback-band]){background:transparent;border-radius:0;box-shadow:none;}
.sc-paper-layout .sheet-bar-strum>span{font-size:inherit!important;}
.sc-paper-layout .sheet-bar-strum [data-strum-arrow]{height:1.2em!important;width:1em!important;}
.sc-paper-layout [data-edit-selected-bar]{font:600 9px/12px sans-serif!important;padding:2px 6px!important;top:2px!important;}
.sc-paper-layout .sheet-bar-forms{padding:3px 0!important;}
.sc-paper-layout .sheet-form-lane{position:relative;width:100%;}
.sc-layout-dialog{position:fixed;inset:50% auto auto 50%;transform:translate(-50%,-50%);margin:0;width:min(1080px,calc(100vw - 32px));max-height:90vh;overflow:auto;padding:20px;border:1px solid #798b9a;border-radius:14px;background:#1e2832;color:#f7f4ec;}
.sc-layout-dialog::backdrop{background:#10182088;}
.sc-layout-dialog header{position:sticky;top:0;z-index:2;background:#1e2832;padding:4px 0;display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:14px;}
.sc-layout-dialog h2{font-size:20px;margin:0;}.sc-layout-dialog p{font-size:12px;margin:6px 0 12px;color:#bfcad2;}
.sc-layout-dialog button,.sc-layout-dialog select{font:inherit;font-size:13px;border:1px solid #7e8a94;border-radius:6px;padding:6px 10px;background:#2d3944;color:#fff;}
.sc-paper-layout .sheet-bar--empty{background:#d7dadd!important;pointer-events:none;}
.sc-layout-example [data-layout-highlight]{background:#c9e2ed88!important;box-shadow:inset 0 0 0 2px #408aa7!important;}
.sc-layout-example .sc-selected-layout-line{outline:1px dashed #81959b;outline-offset:2px;}
.sc-layout-controls label{border-left:3px solid transparent;padding-left:7px;}
.sc-layout-controls label.is-layout-active{border-color:#75c6dc;background:#ffffff0b;}
.sc-layout-controls fieldset{border:1px solid #71818b;border-radius:8px;padding:10px;display:grid;gap:10px;min-width:0;}
.sc-layout-controls legend{font-size:13px;padding:0 6px;}.sc-layout-line-help{font-size:11px!important;line-height:1.5;}
.sc-layout-feedback{min-height:20px;color:#8bd3e6!important;font-size:13px!important;}
.sc-layout-example{position:sticky;top:54px;}
.sc-layout-body{display:grid;grid-template-columns:260px minmax(0,1fr);gap:20px;align-items:start;}
.sc-layout-controls{display:grid;gap:12px;}.sc-layout-controls label{display:grid;grid-template-columns:1fr auto;gap:5px 10px;font-size:13px;}.sc-layout-controls input[type=range]{grid-column:1/-1;width:100%;accent-color:#cdb275;}.sc-layout-controls select{grid-column:1/-1;}
.sc-layout-example{min-width:0;overflow:hidden;border-radius:8px;background:#10171e;padding:10px;}.sc-layout-example-viewport{overflow:auto;max-height:68vh;}.sc-layout-example-paper{width:794px;transform-origin:top left;}.sc-layout-example-paper .sheet-page{min-height:0;}.sc-layout-example-paper .sheet-bar-forms{position:relative;margin:0 calc(-1 * var(--sheet-bar-pad-x));overflow:hidden;min-height:0;}.sc-layout-example-paper .sheet-form-event{position:absolute;transform:translateY(-50%);height:auto;aspect-ratio:345/269;display:block;overflow:hidden;}.sc-layout-example-paper .sheet-form-event svg{display:block;width:100%;height:100%;}
.sc-layout-dialog footer{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-top:16px;}.sc-layout-dialog [role=status]{font-size:12px;color:#f1ce82;}
@media(max-width:700px){.sc-layout-body{grid-template-columns:1fr;}.sc-layout-example{position:static;}.sc-layout-controls fieldset{grid-column:1/-1;}.sc-layout-controls{grid-template-columns:1fr 1fr;}.sc-layout-dialog{padding:14px;}.sc-layout-example-viewport{max-height:48vh;}}
@media print{.sc-layout-dialog,.sc-layout-dialog::backdrop{display:none!important;}.sc-paper-layout .sheet-bar-num{min-height:0!important;}.sc-paper-layout.sc-hide-numbers .sheet-bar-num{display:none!important;}}
`;doc.head.appendChild(style);}
    function apply(host){host.classList.add('sc-paper-layout');host.classList.toggle('sc-hide-numbers',!value.showNumbers);host.classList.toggle('sc-hide-parts',!value.showParts);for(const name of Object.keys(ranges))host.style.setProperty('--sc-'+name,value[name]+'px');}
    function status(text){if(dialog)dialog.querySelector('[role=status]').textContent=text;}
    function save(){const result=C.storage.setAppSetting(key,{...value});status(result?.ok===false?'表示は更新しましたが、設定を保存できませんでした。':'このブラウザの表示設定を保存しました');return result;}
    function saveRows(){const result=C.storage.setAppSetting(rowKey,Array.from(rowProjects,([projectId,rows])=>({projectId,rows})));status(result?.ok===false?'行の表示は更新しましたが、設定を保存できませんでした。':'この譜面の行配置を保存しました');return result;}
    function set(patch,persist=true){value=normalizeLayout({...value,...patch});refreshSample();changed();if(persist)save();}
    function renderOptions(project){const rules=new Map((rowProjects.get(project.projectId)||[]).map(r=>[r.barId,r]));return {barsPerLine:value.barsPerLine,lineLayoutForBar(number){return rules.get(project.bars[number-1]?.id)||null;}};}
    function setLine(project,barId,columns,used){
        if(!project.bars.some(b=>b.id===barId))return {ok:false};
        let rows=(rowProjects.get(project.projectId)||[]).filter(r=>r.barId!==barId);
        if(columns!==null){const checked=normalizeLineRules([{barId,columns,used}]);if(!checked.length)return {ok:false};rows.push(checked[0]);}
        rowProjects.set(project.projectId,rows);refreshSample();changed();return saveRows();
    }
    function close(){if(dialog)dialog.close();}
    function open(host,options={}){
        if(dialog||!options.project)return;
        const sample=options.project,previous=doc.activeElement;
        let selectedNumber=options.selectedBarNumber||1,activeSetting=null;
        const targetSelectors={barsPerLine:'.sheet-line:not([data-line-custom])',chordHeight:'.sheet-bar-chord',titleSize:'.sheet-title',metaSize:'.sheet-meta',chordSize:'.sheet-bar-chord',strumSize:'.sheet-bar-strum',lyricsSize:'.sheet-bar-lyrics',doremiSize:'.sheet-bar-doremi',partSize:'.sheet-section-label',numberSize:'.sheet-bar-num',rowLayout:'.sc-selected-layout-line'};
        const names={barsPerLine:'1行の小節数',chordHeight:'コード行の高さ',titleSize:'曲名',metaSize:'曲情報',chordSize:'コード',strumSize:'ストローク',lyricsSize:'歌詞',doremiSize:'ドレミ',partSize:'セクション名',numberSize:'小節番号',rowLayout:'選択した行の配置'};
        dialog=doc.createElement('dialog');dialog.className='sc-layout-dialog';dialog.dataset.paperLayout='';dialog.setAttribute('aria-label','譜面の表示設定');
        const header=doc.createElement('header'),title=doc.createElement('h2'),dismiss=doc.createElement('button');title.textContent='譜面の表示設定';dismiss.type='button';dismiss.textContent='閉じる';header.append(title,dismiss);dialog.appendChild(header);
        const body=doc.createElement('div'),controls=doc.createElement('div'),preview=doc.createElement('div'),caption=doc.createElement('p'),feedback=doc.createElement('p'),viewport=doc.createElement('div'),frame=doc.createElement('div'),paper=doc.createElement('div');
        body.className='sc-layout-body';controls.className='sc-layout-controls';preview.className='sc-layout-example';caption.textContent='現在編集中の譜面（表示専用）。行をクリックすると、その行だけの配置を調整できます。';feedback.className='sc-layout-feedback';feedback.dataset.layoutFeedback='';viewport.className='sc-layout-example-viewport';paper.className='sc-layout-example-paper';viewport.appendChild(frame);frame.appendChild(paper);preview.append(caption,feedback,viewport);body.append(controls,preview);dialog.appendChild(body);
        function selectedLine(){return Array.from(paper.querySelectorAll('.sheet-line')).find(line=>line.querySelector('.sheet-bar[data-bar-number="'+selectedNumber+'"]'))||paper.querySelector('.sheet-line');}
        function mark(reveal=false){
            paper.querySelectorAll('[data-layout-highlight]').forEach(e=>e.removeAttribute('data-layout-highlight'));
            controls.querySelectorAll('[data-layout-field]').forEach(e=>e.classList.toggle('is-layout-active',e.dataset.layoutField===activeSetting));
            if(!activeSetting)return;const targets=paper.querySelectorAll(targetSelectors[activeSetting]);targets.forEach(e=>e.dataset.layoutHighlight=activeSetting);
            const visible=Array.from(targets).filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden');feedback.textContent=names[activeSetting]+'を調整中'+(visible.length?'':'（現在は表示されていません）');
            const line=selectedLine(),target=visible.find(e=>line?.contains(e))||visible[0];
            if(reveal&&target){const a=viewport.getBoundingClientRect(),b=target.getBoundingClientRect();if(b.top<a.top+4)viewport.scrollTop+=b.top-a.top-8;else if(b.bottom>a.bottom-4)viewport.scrollTop+=b.bottom-a.bottom+8;}
        }
        function activate(name){activeSetting=name;mark(true);}
        const inputs=[];
        function field(name,label,parent=controls){const row=doc.createElement('label'),text=doc.createElement('span');row.dataset.layoutField=name;text.textContent=label;row.appendChild(text);parent.appendChild(row);row.addEventListener('focusin',()=>activate(name));row.addEventListener('pointerdown',()=>activate(name));return row;}
        const row=field('barsPerLine','全体：1行の小節数'),select=doc.createElement('select');select.dataset.layoutSetting='barsPerLine';for(const [n,text] of [[0,'自動'],[1,'1小節'],[2,'2小節'],[3,'3小節'],[4,'4小節']]){const option=doc.createElement('option');option.value=n;option.textContent=text;select.appendChild(option);}select.value=value.barsPerLine;select.addEventListener('change',()=>{activeSetting='barsPerLine';set({barsPerLine:Number(select.value)});});row.appendChild(select);inputs.push(()=>select.value=value.barsPerLine);
        const lineGroup=doc.createElement('fieldset'),legend=doc.createElement('legend'),lineHelp=doc.createElement('p');legend.textContent='選択した行';lineGroup.appendChild(legend);controls.appendChild(lineGroup);
        const colsRow=field('rowLayout','横に並べる枠',lineGroup),colsInput=doc.createElement('select'),usedRow=field('rowLayout','この行に置く小節',lineGroup),usedInput=doc.createElement('select');colsInput.dataset.lineColumns='';usedInput.dataset.layoutLineUsed='';for(let n=1;n<=8;n++){const o=doc.createElement('option');o.value=n;o.textContent=n+'枠';colsInput.appendChild(o);}colsRow.appendChild(colsInput);usedRow.appendChild(usedInput);
        const lineReset=doc.createElement('button');lineReset.type='button';lineReset.textContent='この行を自動に戻す';lineReset.dataset.lineReset='';lineHelp.className='sc-layout-line-help';lineHelp.textContent='行の個別設定を優先します。余った枠は編集・再生なしの空き枠。続く実小節は次の行へ送ります。';lineGroup.append(lineHelp,lineReset);
        function syncLine(){const line=selectedLine();if(!line)return;const number=Number(line.dataset.lineStart),bar=sample.bars[number-1],rule=(rowProjects.get(sample.projectId)||[]).find(r=>r.barId===bar.id),columns=Number(line.dataset.lineCapacity);legend.textContent=number+'小節目からの行';colsInput.value=columns;usedInput.replaceChildren();for(let n=1;n<=columns;n++){const o=doc.createElement('option');o.value=n;o.textContent=n+'小節';usedInput.appendChild(o);}usedInput.value=rule?rule.used:Number(line.dataset.lineUsed);paper.querySelectorAll('.sheet-line').forEach(e=>e.classList.toggle('sc-selected-layout-line',e===line));}
        function changeLine(){const line=selectedLine();if(!line)return;activeSetting='rowLayout';selectedNumber=Number(line.dataset.lineStart);const columns=Number(colsInput.value),used=Math.min(Number(usedInput.value)||columns,columns),id=sample.bars[Number(line.dataset.lineStart)-1].id;setLine(sample,id,columns,used);}
        colsInput.addEventListener('change',changeLine);usedInput.addEventListener('change',changeLine);lineReset.addEventListener('click',()=>{const line=selectedLine();if(line)setLine(sample,sample.bars[Number(line.dataset.lineStart)-1].id,null);});
        for(const [name,label] of Object.entries(names).filter(([name])=>Object.hasOwn(ranges,name))){const row=field(name,label),output=doc.createElement('output'),input=doc.createElement('input');input.type='range';input.min=ranges[name][0];input.max=ranges[name][1];input.step=.5;input.dataset.layoutSetting=name;const sync=()=>{input.value=value[name];output.textContent=value[name]+'px';};sync();inputs.push(sync);input.addEventListener('input',()=>{activeSetting=name;set({[name]:Number(input.value)},false);sync();});input.addEventListener('change',save);row.append(output,input);}
        const footer=doc.createElement('footer'),reset=doc.createElement('button'),status=doc.createElement('span');reset.type='button';reset.textContent='全体設定を初期値に戻す';reset.dataset.layoutReset='';status.setAttribute('role','status');footer.append(reset,status);dialog.appendChild(footer);host.appendChild(dialog);
        function resize(){if(!dialog||!paper.isConnected)return;const scale=Math.min(1,viewport.clientWidth/794);paper.style.transform='scale('+scale+')';frame.style.height=Math.ceil(paper.offsetHeight*scale)+'px';mark(true);}
        refreshSample=()=>{if(!dialog)return;inputs.forEach(fn=>fn());const forms=options.showForms&&C.localPaperForms.view(sample);C.sheetRenderer.render(sample,paper,{...renderOptions(sample),hasFormsForBar:forms?forms.has:null,formsForBar:forms?forms.row:null});paper.querySelectorAll('[tabindex]').forEach(e=>e.removeAttribute('tabindex'));paper.querySelectorAll('.sheet-form-event').forEach(e=>{e.setAttribute('role','img');e.removeAttribute('aria-haspopup');});paper.querySelectorAll('.sheet-section-label').forEach(e=>{e.removeAttribute('role');e.removeAttribute('aria-pressed');});apply(paper);syncLine();mark();requestAnimationFrame(resize);};
        paper.addEventListener('click',e=>{const line=e.target.closest('.sheet-line');if(!line)return;selectedNumber=Number(line.dataset.lineStart);syncLine();activate('rowLayout');});
        reset.addEventListener('click',()=>{value={...DEFAULT_LAYOUT};refreshSample();changed();save();});dismiss.addEventListener('click',close);dialog.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}});dialog.addEventListener('close',()=>{const old=dialog;if(!old)return;dialog=null;old.remove();refreshSample=()=>{};changed();if(previous?.isConnected)previous.focus({preventScroll:true});});const observer=new ResizeObserver(resize);observer.observe(viewport);dialog.addEventListener('close',()=>observer.disconnect(),{once:true});dialog.showModal();refreshSample();
    }
    return {renderOptions,setLine,get value(){return {...value};},get isOpen(){return !!dialog?.open;},apply,set,open,close,onChange(fn){changed=fn;}};
}
