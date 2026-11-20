import {bindScoreZoom,bindOutsideDismiss,installScoreUI,movePaperPlayhead} from '../score-ui.mjs';
import {FONTS,setPresentationProperty,togglePresentationClass,TEXT_FIELDS,LINE_FIELDS,normalizeAppearance,applyAppearance,APPEARANCE_CSS,addTextTools,addInteractionColors} from './paper-appearance.mjs';
// Browser-local presentation preferences. Never edits a Project or its Session.
export function readGridRows(entries,project){
    const result=new Map();
    if(!Array.isArray(entries)||!entries.length||entries.length>project.bars.length)return result;
    const ids=new Set(project.bars.map(bar=>bar.id)),numBeats=project.songInfo.timeSignature.beats;
    for(const entry of entries){
        if(!ids.has(entry?.barId)||!entry.rows||result.has(entry.barId))continue;
        const rows={};
        for(const key of ['chord','strum','lyrics','doremi']){
            const grid=entry.rows[key];
            if(grid&&[1,2,4,8,16].includes(grid.unit)&&Array.isArray(grid.beats)&&grid.beats.length===numBeats&&
                grid.beats.every(lock=>lock===null||lock===8||lock===16))rows[key]={unit:grid.unit,beats:[...grid.beats]};
        }
        if(Object.keys(rows).length)result.set(entry.barId,rows);
    }
    return result;
}
export const META_FIELDS=Object.freeze({originalKey:'ORGキー',playKey:'Playキー',bpm:'BPM',timeSignature:'拍子',basicStrum:'基本ストローク'});
export function normalizeMetaFields(source){const out={};for(const key of Object.keys(META_FIELDS)){const field=source?.[key];if(!field||typeof field!=='object')continue;const v={};if(typeof field.visible==='boolean')v.visible=field.visible;if(Object.hasOwn(FONTS,field.font))v.font=field.font;if(typeof field.color==='string'&&/^#[0-9a-f]{6}$/i.test(field.color))v.color=field.color;if(typeof field.size==='number'&&Number.isFinite(field.size))v.size=Math.max(8,Math.min(24,field.size));out[key]=v;}return out;}
export const DEFAULT_LAYOUT=Object.freeze({barsPerLine:4,formScale:100,formListScale:100,titleSize:26,artistSize:16,metaSize:11,chordSize:14,strumSize:15,lyricsSize:12,doremiSize:11,lyricsSpacing:-1,doremiSpacing:-1,partSize:13,numberSize:9,showTitle:true,showArtist:true,showMeta:true,showNumbers:true,showParts:true,timingGrid:null,gridResolution:null,metaFields:Object.freeze({}),appearance:Object.freeze({text:Object.freeze({}),lines:Object.freeze({}),visibility:Object.freeze({})})});
const ranges={formScale:[60,140],formListScale:[60,160],titleSize:[18,40],artistSize:[10,26],metaSize:[9,18],chordSize:[12,28],strumSize:[10,24],lyricsSize:[6,24],doremiSize:[6,24],lyricsSpacing:[-3,3],doremiSpacing:[-3,3],partSize:[10,22],numberSize:[8,16]};
const sectionTracks=[['chords','コード','chordSize'],['forms','フォーム','formScale'],['strum','ストローク','strumSize'],['lyrics','歌詞','lyricsSize'],['doremi','メロディ','doremiSize']];
function normalizeSections(records){
    if(!Array.isArray(records)||records.length>2048)return [];
    const rules=new Map();
    for(const row of records){
        if(typeof row?.sectionId!=='string'||!row.sectionId||row.sectionId.length>160)continue;
        const rule={sectionId:row.sectionId};
        if(Number.isInteger(row.barsPerLine)&&row.barsPerLine>=1&&row.barsPerLine<=8)rule.barsPerLine=row.barsPerLine;
        for(const [flag,,key] of sectionTracks){
            if(typeof row.visibility?.[flag]==='boolean')(rule.visibility??={})[flag]=row.visibility[flag];
            if(Number.isFinite(row.sizes?.[key]))(rule.sizes??={})[key]=Math.max(ranges[key][0],Math.min(ranges[key][1],row.sizes[key]));
        }
        if(Object.keys(rule).length>1)rules.set(rule.sectionId,rule);
    }
    return [...rules.values()];
}
export function normalizeLayout(value){const out={...DEFAULT_LAYOUT},v=value&&typeof value==='object'?value:{};for(const [key,[min,max]] of Object.entries(ranges))if(typeof v[key]==='number'&&Number.isFinite(v[key]))out[key]=Math.max(min,Math.min(max,v[key]));if(Number.isInteger(v.barsPerLine)&&v.barsPerLine>=0&&v.barsPerLine<=8)out.barsPerLine=v.barsPerLine;for(const key of ['showTitle','showArtist','showMeta','showNumbers','showParts'])if(typeof v[key]==='boolean')out[key]=v[key];if(typeof v.timingGrid==='boolean')out.timingGrid=v.timingGrid;if([8,16].includes(v.gridResolution))out.gridResolution=v.gridResolution;out.appearance=normalizeAppearance(v.appearance);out.metaFields=normalizeMetaFields(v.metaFields);const sections=normalizeSections(v.sections);if(sections.length)out.sections=sections;return out;}
export function normalizeLineRules(rows){
    const result=new Map();if(!Array.isArray(rows)||rows.length>2048)return [];
    for(const row of rows)if(row&&typeof row.barId==='string'&&row.barId.length>0&&row.barId.length<=160&&Number.isInteger(row.columns)&&row.columns>=1&&row.columns<=8&&Number.isInteger(row.used)&&row.used>=1&&row.used<=row.columns)result.set(row.barId,{barId:row.barId,columns:row.columns,used:row.used});
    return Array.from(result.values());
}
export const FONT_KEYS=Object.freeze(Object.keys(ranges).filter(key=>key.endsWith('Size')));
function presetName(name){return typeof name==='string'?name.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,40):'';}
export function normalizeFontPresets(records){
    const names=new Map();if(!Array.isArray(records)||records.length>20)return [];
    for(const record of records){const name=presetName(record?.name),fonts=record?.fonts;if(!name||!fonts||!FONT_KEYS.filter(key=>key!=='artistSize').every(key=>typeof fonts[key]==='number'&&Number.isFinite(fonts[key]))||(fonts?.artistSize!==undefined&&!Number.isFinite(fonts.artistSize)))continue;
        const normalized=normalizeLayout(fonts);names.set(name,{name,fonts:Object.fromEntries(FONT_KEYS.filter(key=>fonts[key]!==undefined).map(key=>[key,normalized[key]]))});}
    return Array.from(names.values());
}
export function normalizeDisplayPresets(records){
    if(!Array.isArray(records)||records.length>20)return [];
    const result=new Map();for(const record of records){
        if(record?.type!=='display-settings-v1'){for(const legacy of normalizeFontPresets([record]))result.set(legacy.name,legacy);continue;}
        const name=presetName(record.name);if(!name||!record.layout||!Array.isArray(record.rows)||record.rows.length>2048)continue;
        const rows=record.rows.filter(r=>r&&Number.isInteger(r.barNumber)&&r.barNumber>=1&&r.barNumber<=2048&&Number.isInteger(r.columns)&&r.columns>=1&&r.columns<=8&&Number.isInteger(r.used)&&r.used>=1&&r.used<=r.columns).map(r=>({barNumber:r.barNumber,columns:r.columns,used:r.used,...(Number.isInteger(r.slotNumber)&&r.slotNumber>=1&&r.slotNumber<=4096?{slotNumber:r.slotNumber}:{})}));
        result.set(name,{name,type:'display-settings-v1',layout:normalizeLayout(record.layout),rows});
    }return Array.from(result.values());
}
const copy=x=>JSON.parse(JSON.stringify(x));
export function createPaperLayout(C,doc=document){
    installScoreUI(doc);
    const key='scorePaperLayoutV1',displayKey='scorePaperDisplayV2';let value=normalizeLayout(C.storage.getAppSetting(key)),dialog=null,changed=()=>{},refreshSample=()=>{},editing=null,previewAudio=null;
    const presetKey='scorePaperFontPresetsV1';let presets=normalizeDisplayPresets(C.storage.getAppSetting(presetKey));
    const rowKey='scorePaperRowsV1',rowProjects=new Map(),sectionProjects=new Map();
    const savedRows=C.storage.getAppSetting(rowKey);if(Array.isArray(savedRows))for(const record of savedRows)if(record&&typeof record.projectId==='string'&&record.projectId.length<=160)rowProjects.set(record.projectId,normalizeLineRules(record.rows));
    function revision(){return JSON.stringify([C.storage.getAppSetting(displayKey),C.storage.getAppSetting(key),C.storage.getAppSetting(rowKey),C.storage.getAppSetting(presetKey)]);}
    function restoreStored(){const saved=C.storage.getAppSetting(displayKey),modern=saved?.version===2;value=normalizeLayout(modern?saved.layout:C.storage.getAppSetting(key));presets=normalizeDisplayPresets(modern?saved.presets:C.storage.getAppSetting(presetKey));sectionProjects.clear();rowProjects.clear();const records=modern?saved.rows:C.storage.getAppSetting(rowKey);if(Array.isArray(records))for(const row of records)if(typeof row?.projectId==='string'){rowProjects.set(row.projectId,normalizeLineRules(row.rows));sectionProjects.set(row.projectId,normalizeSections(row.sections));}}
    restoreStored();let storedRevision=revision();
    // Typography/ink update existing rows; only geometry/track changes rebuild nodes.
    function structureKey(){return JSON.stringify([value.barsPerLine,value.timingGrid,value.gridResolution,value.appearance.visibility,Array.from(sectionProjects),Array.from(rowProjects)]);}
    function tracksKey(){return JSON.stringify([value.timingGrid,value.gridResolution,value.appearance.visibility,Array.from(sectionProjects)]);}
    let lastStructure=structureKey(),lastTracks=tracksKey();
    function notify(){const next=structureKey(),tracks=tracksKey(),structural=next!==lastStructure,reflowOnly=structural&&tracks===lastTracks;lastStructure=next;lastTracks=tracks;refreshSample(structural,reflowOnly);changed({structural,reflowOnly});}
    function bundle(){return {version:2,layout:{...value},rows:Array.from(new Set([...rowProjects.keys(),...sectionProjects.keys()]),projectId=>({projectId,rows:rowProjects.get(projectId)||[],sections:sectionProjects.get(projectId)||[]})),presets:copy(presets)};}
    function persist(){if(editing)return {ok:true,staged:true};if(revision()!==storedRevision)return {ok:false,error:'表示設定が別の画面で変更されています'};const result=C.storage.setAppSetting(displayKey,bundle());if(result?.ok!==false)storedRevision=revision();return result;}
    function begin(){if(editing)return false;if(revision()!==storedRevision){restoreStored();storedRevision=revision();}editing={before:JSON.parse(JSON.stringify(bundle())),revision:storedRevision};return true;}
    function cancel(){if(!editing)return;const before=editing.before;editing=null;value=normalizeLayout(before.layout);presets=normalizeDisplayPresets(before.presets);sectionProjects.clear();rowProjects.clear();for(const row of before.rows){rowProjects.set(row.projectId,row.rows);sectionProjects.set(row.projectId,row.sections||[]);}notify();}
    function commit(){
        if(!editing)return {ok:false,error:'表示設定が開かれていません'};
        if(revision()!==editing.revision)return {ok:false,error:'別の画面で表示設定が変更されました。キャンセルして開き直してください'};
        const result=C.storage.setAppSetting(displayKey,bundle());if(result?.ok===false)return {ok:false,error:'設定を保存できませんでした。調整内容を保持しています'};
        editing=null;storedRevision=revision();return {ok:true};
    }
    if(!doc.getElementById('sc-paper-layout-style')){const style=doc.createElement('style');style.id='sc-paper-layout-style';style.textContent=APPEARANCE_CSS+`
.sc-paper-layout .sheet-title{font-size:var(--sc-titleSize)!important;}
.sc-paper-layout .sheet-artist{font-size:var(--sc-artistSize)!important;}
.sc-paper-layout.sc-hide-title .sheet-title,.sc-paper-layout.sc-hide-artist .sheet-artist,.sc-paper-layout.sc-hide-meta .sheet-meta,.sc-paper-layout.sc-hide-title.sc-hide-artist .sheet-title-row,.sc-paper-layout.sc-hide-title.sc-hide-artist.sc-hide-meta .sheet-header{display:none!important;}
.sc-paper-layout.sc-hide-title .sheet-artist-separator,.sc-paper-layout.sc-hide-title .sheet-title-row:not(:has(.sheet-artist)),.sc-paper-layout.sc-hide-title.sc-hide-meta .sheet-header:not(:has(.sheet-artist)){display:none;}
.sc-paper-layout .sheet-meta{font-size:var(--sc-metaSize)!important;}
.sc-paper-layout .sheet-meta .sheet-meta-item[data-meta-field]{font-size:var(--sc-meta-field-size,inherit)!important;font-family:var(--sc-meta-field-font,inherit)!important;}
.sc-paper-layout .sheet-meta .sheet-meta-item[data-meta-ink],.sc-paper-layout .sheet-meta .sheet-meta-item[data-meta-ink] *{color:var(--sc-meta-field-color)!important;}
.sc-paper-layout .sheet-meta-item[hidden],.sc-paper-layout.sc-meta-empty .sheet-meta,.sc-paper-layout.sc-hide-title.sc-hide-artist.sc-meta-empty .sheet-header{display:none!important;}
.sc-meta-details{margin-top:8px;border-top:1px solid #ffffff20;padding-top:6px;}.sc-meta-details>summary{font-size:11px;color:#bfcad2;cursor:pointer;width:fit-content;}.sc-meta-details[open]>summary{margin-bottom:10px;}.sc-meta-details .sc-layout-field{margin-top:10px;}.sc-meta-details [data-meta-reset]{font-size:11px;padding:4px 7px;margin-top:10px;color:#bfcad2;background:transparent;border-color:transparent;}

.sc-paper-layout .sheet-section-label{font-size:var(--sc-partSize)!important;}
.sc-paper-layout.sc-hide-parts .sheet-section-label{display:none!important;}
.sc-paper-layout .sheet-bar-num{font-size:var(--sc-numberSize)!important;min-height:18px!important;line-height:1.3;}
.sc-paper-layout.sc-hide-numbers .sheet-bar-num,.sc-paper-layout.sc-hide-numbers [data-edit-selected-bar]{display:none!important;}
.sc-paper-layout .sheet-bar-chord{height:max(24px,calc(var(--sc-section-chordSize,var(--sc-chordSize)) * 1.45 + 2px));min-height:0!important;font-size:var(--sc-section-chordSize,var(--sc-chordSize))!important;align-items:center;padding:0!important;}
.sc-paper-layout .sheet-bar-chord>.sheet-timed-cell{line-height:1.2;}
.sc-paper-layout .sheet-bar-lyrics{font-size:var(--sc-section-lyricsSize,var(--sc-lyricsSize))!important;}
.sc-paper-layout .sheet-bar-doremi{font-size:var(--sc-section-doremiSize,var(--sc-doremiSize))!important;}
.sc-paper-layout .sheet-bar-strum{font-size:var(--sc-section-strumSize,var(--sc-strumSize))!important;column-gap:0;margin:0 calc(-1 * var(--sheet-bar-pad-x));padding:3px 0 0;border-radius:0;background:transparent;box-shadow:none;}
.sc-paper-layout .sheet-bar-strum>span:not([data-playback-band]){background:transparent;border-radius:0;box-shadow:none;}
.sc-paper-layout .sheet-bar-strum>span{font-size:inherit!important;}
.sc-paper-layout .sheet-bar-strum>[data-strum-state]{justify-content:center;}
.sc-paper-layout :is(.sheet-bar-lyrics,.sheet-bar-doremi)>.sheet-timed-cell{white-space:normal;overflow-wrap:anywhere;line-break:strict;font-feature-settings:"palt";}
.sc-paper-layout .sheet-bar-lyrics>.sheet-timed-cell{--sc-vocal-spacing:var(--sc-lyricsSpacing,-1px);letter-spacing:var(--sc-vocal-spacing);}
.sc-paper-layout .sheet-bar-doremi>.sheet-timed-cell{--sc-vocal-spacing:var(--sc-doremiSpacing,-1px);letter-spacing:var(--sc-vocal-spacing);}
.sheet-note-fa{display:inline-grid;grid-template-columns:.56em .44em;width:1em;line-height:1;vertical-align:baseline;text-align:left;white-space:nowrap;letter-spacing:0;font-feature-settings:normal;}
.sheet-note-fa>span{width:1em;transform-origin:left center;}
.sheet-note-fa>span:first-child{transform:scaleX(.82);}
.sheet-note-fa>span:last-child{align-self:end;font-size:.6em;transform:scaleX(.78);}
.sc-paper-layout .sheet-kana-pair{letter-spacing:calc(var(--sc-vocal-spacing) - .12em);}
.sc-paper-layout .sheet-bar-grid~.sheet-preset-strum{align-self:stretch;padding-top:0!important;}
.sc-paper-layout .sheet-bar-grid~.sheet-preset-strum>[data-strum-state]{align-self:stretch;padding-top:3px;}
.sc-paper-layout .sheet-bar-strum [data-strum-arrow]{height:1.2em!important;width:1em!important;}
.sc-paper-layout [data-edit-selected-bar]{font:600 9px/12px sans-serif!important;padding:2px 6px!important;top:2px!important;}
.sc-paper-layout .sheet-bar-forms{display:flex;align-items:center;justify-content:center;padding:4px 0!important;line-height:0;font-size:0;}
.sc-paper-layout .sheet-form-lane{flex:0 0 100%;min-width:0;}
.sc-paper-layout .sheet-form-lane{position:static;width:100%;margin:0;padding:0;line-height:0;}
.sc-paper-layout .sheet-line{grid-template-rows:repeat(var(--sheet-row-count),max-content);align-items:stretch;}
.sc-paper-layout .sheet-line>.sheet-bar{--sheet-lower-grid-display:grid;display:grid;grid-template-rows:subgrid;min-width:0;min-height:0;padding-bottom:0;row-gap:0;align-content:stretch;}
.sc-paper-layout .sheet-bar-row{align-items:center;}
.sc-paper-layout .sheet-bar-doremi{padding-block:2px;}
.sc-layout-dialog{box-sizing:border-box;position:fixed;inset:50% auto auto 50%;transform:translate(-50%,-50%);margin:0;width:min(1080px,calc(100vw - 32px));max-height:90vh;overflow:auto;padding:20px;border:1px solid #798b9a;border-radius:14px;background:#1e2832;color:#f7f4ec;}
.sc-layout-dialog::backdrop{background:#10182088;}
.sc-layout-dialog header{flex-wrap:wrap;position:sticky;top:0;z-index:2;background:#1e2832;padding:4px 0;display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:14px;box-shadow:0 -20px 0 0 #1e2832;}
.sc-layout-dialog h2{font-size:20px;margin:0;}.sc-layout-dialog p{font-size:12px;margin:6px 0 12px;color:#bfcad2;}
.sc-layout-dialog button,.sc-layout-dialog select{font:inherit;font-size:13px;border:1px solid #7e8a94;border-radius:6px;padding:6px 10px;background:#2d3944;color:#fff;}
.sc-paper-layout .sheet-bar--empty{background:repeating-linear-gradient(-45deg,transparent,transparent 6px,rgba(122,116,108,.06) 6px,rgba(122,116,108,.06) 7px)!important;}
.sc-layout-example:not(:has(.sc-layout-playing)) [data-layout-highlight]{background:#c9e2ed88!important;box-shadow:inset 0 0 0 2px #408aa7!important;}
.sc-layout-example .sc-selected-layout-line{outline:1px dashed #81959b;outline-offset:2px;}
.sc-layout-controls label{border-left:3px solid transparent;padding-left:7px;}
.sc-layout-controls label.is-layout-active{border-color:#75c6dc;background:#ffffff0b;}
.sc-layout-controls>[data-layout-reset]{justify-self:start;grid-column:1/-1;}.sc-layout-dialog footer:has([role=status]:empty){display:none;}.sc-layout-controls fieldset{border:1px solid #71818b;border-radius:8px;padding:10px;display:grid;gap:10px;min-width:0;}
.sc-layout-controls input[data-font-preset-name]{grid-column:1/-1;min-width:0;width:100%;box-sizing:border-box;font:inherit;padding:7px;border:1px solid #7e8a94;border-radius:6px;background:#16212b;color:#fff;}.sc-font-preset-actions{display:flex;gap:6px;flex-wrap:wrap;}.sc-font-preset-actions button{flex:1;white-space:nowrap;}
.sc-layout-controls legend{font-size:13px;padding:0 6px;}
.sc-layout-custom{grid-column:1/-1;min-width:0;}.sc-layout-custom summary{cursor:pointer;font-size:13px;padding:8px 10px;border:1px solid #71818b;border-radius:6px;}.sc-layout-custom[open] summary{margin-bottom:10px;}
.sc-layout-feedback{min-height:20px;color:#8bd3e6!important;font-size:13px!important;}
.sc-section-layout{min-width:0;border:1px solid #52616c;border-radius:6px;padding:7px;}
.sc-section-layout summary{cursor:pointer;font-size:13px;}.sc-section-layout>div{display:grid;gap:8px;margin-top:9px;font-size:12px;}
.sc-section-layout .sc-section-track{display:grid;grid-template-columns:minmax(0,1fr) auto 43px 16px;align-items:center;gap:3px;}
.sc-section-layout .sc-section-track select{grid-column:auto;}
.sc-section-layout select,.sc-section-layout input{min-width:0;font:inherit;padding:3px;}.sc-section-layout label{display:flex;justify-content:space-between;align-items:center;}
.sc-layout-example{position:sticky;top:54px;}
.sc-layout-body{display:grid;grid-template-columns:260px minmax(0,1fr);gap:20px;align-items:start;}
.sc-layout-controls{display:grid;gap:12px;}.sc-layout-controls label{display:grid;grid-template-columns:1fr auto;gap:5px 10px;font-size:13px;}.sc-layout-controls input[type=range]{grid-column:1/-1;width:100%;accent-color:#cdb275;}.sc-layout-controls select{grid-column:1/-1;min-width:0;width:100%;}
.sc-layout-example{min-width:0;overflow:hidden;border-radius:8px;background:#10171e;padding:10px;}.sc-layout-example-viewport{overflow:auto;max-height:68vh;}.sc-layout-example-paper{width:794px;transform-origin:top left;}.sc-layout-example-paper .sheet-page{min-height:0;}.sc-layout-example-paper .sheet-bar-forms{position:relative;margin:0 calc(-1 * var(--sheet-bar-pad-x));overflow:hidden;min-height:0;}.sc-layout-example-paper .sheet-form-event{position:absolute;transform:translateY(-50%);height:auto;aspect-ratio:auto;display:block;overflow:hidden;}.sc-layout-example-paper .sheet-form-event svg{display:block;width:100%;height:auto;}
.sc-layout-dialog footer{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;}.sc-layout-dialog footer button{white-space:nowrap;}.sc-layout-dialog [role=status]{flex-basis:100%;font-size:12px;color:#f1ce82;}
.sc-layout-actions{display:flex;gap:8px;margin-left:auto;}.sc-layout-dialog .sc-layout-storage-note{flex:1 1 100%;font-size:12px;line-height:1.6;margin:0;}.sc-layout-presets .sc-preset-storage-note{flex-basis:100%;font-size:12px;color:#bfcad2;margin:0;}.sc-layout-actions [data-layout-save]{background:#cdb275;color:#151c24;border-color:#cdb275;font-weight:700;}
.sc-layout-presets{grid-column:1/-1;min-width:0;border-top:1px solid #ffffff25;padding-top:12px;margin-top:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.sc-layout-presets select,.sc-layout-presets input{min-width:0;max-width:100%;box-sizing:border-box;flex:1 1 180px;font:inherit;font-size:13px;padding:7px 10px;border:1px solid #7e8a94;border-radius:6px;background:#16212b;color:#fff;}
.sc-layout-presets select{flex-basis:130px;width:auto;}
.sc-layout-presets button{white-space:nowrap;}.sc-preset-create{flex-basis:100%;display:flex;gap:8px;align-items:center;flex-wrap:wrap;}.sc-layout-presets [hidden]{display:none!important;}
@media(max-width:700px){.sc-layout-body{grid-template-columns:1fr;}.sc-layout-example{position:static;}.sc-layout-controls fieldset,.sc-section-layout{grid-column:1/-1;}.sc-layout-controls{grid-template-columns:1fr 1fr;}.sc-layout-dialog{padding:14px;}.sc-layout-example-viewport{max-height:48vh;}}
@media print{.sc-layout-dialog,.sc-layout-dialog::backdrop{display:none!important;}.sc-paper-layout .sheet-bar-num{min-height:0!important;}.sc-paper-layout.sc-hide-numbers .sheet-bar-num{display:none!important;}}
`;doc.head.appendChild(style);}
    const appliedSizes=new WeakMap();
    function apply(host){
        C.localPaperForms?.resizeList?.(host,value.formListScale);applyAppearance(host,value);setPresentationProperty(host,'--sc-form-list-scale',String(value.formListScale/100));togglePresentationClass(host,'sc-paper-layout',true);
        for(const [key,name] of [['showTitle','title'],['showArtist','artist'],['showMeta','meta']])togglePresentationClass(host,'sc-hide-'+name,!value[key]);
        togglePresentationClass(host,'sc-hide-numbers',!value.showNumbers);togglePresentationClass(host,'sc-hide-parts',!value.showParts);
        const old=appliedSizes.get(host),sizes=old?.page===host.firstElementChild?old.sizes:{};
        for(const name of Object.keys(ranges)){
            if(TEXT_FIELDS[name]){if(sizes[name]!==value[name]){host.querySelectorAll(TEXT_FIELDS[name][2]).forEach(row=>setPresentationProperty(row,'--sc-'+name,value[name]+'px'));sizes[name]=value[name];}}
            else setPresentationProperty(host,'--sc-'+name,value[name]+'px');
        }
        if(sizes.formScale!==value.formScale){C.localPaperForms?.resize(host,value.formScale);sizes.formScale=value.formScale;}
        const metaItems=host.querySelectorAll('[data-meta-field]');
        metaItems.forEach(item=>{const f=value.metaFields[item.dataset.metaField]||{};item.hidden=f.visible===false;setPresentationProperty(item,'--sc-meta-field-size',f.size===undefined?'inherit':f.size+'px');setPresentationProperty(item,'--sc-meta-field-font',FONTS[f.font||'default'][1]);setPresentationProperty(item,'--sc-meta-field-color',f.color||'inherit');item.toggleAttribute('data-meta-ink',!!f.color);});
        togglePresentationClass(host,'sc-meta-empty',metaItems.length>0&&[...metaItems].every(item=>item.hidden));
        appliedSizes.set(host,{page:host.firstElementChild,sizes});
    }
    function status(text){if(dialog)dialog.querySelector('[role=status]').textContent=text;}
    function save(){const result=persist();status(result?.ok===false?'設定を保存できませんでした。':'');return result;}
    function saveRows(){return save();}
    function set(patch,persist=true){value=normalizeLayout({...value,...patch});notify();return persist?save():{ok:true};}
    function saveFontPreset(name){
        name=presetName(name);if(!name)return {ok:false,error:'プリセット名を入力してください'};
        const existing=presets.some(p=>p.name===name);if(!existing&&presets.length>=20)return {ok:false,error:'プリセットは20個まで保存できます'};
        const next=presets.filter(p=>p.name!==name).concat({name,fonts:Object.fromEntries(FONT_KEYS.map(key=>[key,value[key]]))});
        const previous=presets;presets=next;const result=persist();if(result?.ok===false)presets=previous;if(result?.ok===false)return {ok:false,error:'プリセットを保存できませんでした。既存のプリセットは保持しています'};
        presets=next;return {ok:true,name,updated:existing};
    }
    function loadFontPreset(name){const preset=presets.find(p=>p.name===name);if(!preset?.fonts)return {ok:false,error:'呼び出す文字サイズプリセットを選択してください'};return set(preset.fonts);}
    function deleteFontPreset(name){
        if(!presets.some(p=>p.name===name))return {ok:false,error:'削除するプリセットを選択してください'};
        const next=presets.filter(p=>p.name!==name),previous=presets;presets=next;const result=persist();if(result?.ok===false)presets=previous;if(result?.ok===false)return {ok:false,error:'プリセットを削除できませんでした。内容を保持しています'};presets=next;return {ok:true};
    }
    function projectSlots(project){return C.structureOperations?.scoreSlots&&project.sections?project.sections.flatMap(s=>C.structureOperations.scoreSlots(project,s.id)):project.bars;}
    function saveDisplayPreset(name,project,visibility){
        name=presetName(name);if(!name)return {ok:false,error:'プリセット名を入力してください'};
        if(presets.some(p=>p.name===name))return {ok:false,error:'同じ名前があります。別の名前を入力してください'};
        if(presets.length>=20)return {ok:false,error:'プリセットは20個まで保存できます'};
        const slots=projectSlots(project),rows=(rowProjects.get(project.projectId)||[]).flatMap(r=>{const hole=project.extensions?.scoreLayoutV1?.holes.find(h=>h.id===r.barId),index=project.bars.findIndex(b=>b.id===(hole?hole.beforeBarId:r.barId)),slotIndex=hole?slots.findIndex(s=>s.id===r.barId):-1;return index<0&&slotIndex<0?[]:[{barNumber:Math.max(1,index+1),columns:r.columns,used:r.used,...(slotIndex>=0?{slotNumber:slotIndex+1}:{})}];});
        const layout=exportPresentation(project).layout;if(visibility)layout.appearance.visibility={...visibility,...layout.appearance.visibility};const previous=presets;presets=presets.concat({name,type:'display-settings-v1',layout,rows});const result=persist();if(result?.ok===false){presets=previous;return {ok:false,error:'プリセットを保存できませんでした'};}return {ok:true,name};
    }
    function loadDisplayPreset(name,project){
        const preset=presets.find(p=>p.name===name);if(!preset)return {ok:false,error:'プリセットを選択してください'};
        if(preset.fonts)return loadFontPreset(name);
        const slots=projectSlots(project),rows=preset.rows.flatMap(r=>{const anchor=r.slotNumber?slots[r.slotNumber-1]:project.bars[r.barNumber-1];return anchor?[{barId:anchor.id,columns:r.columns,used:r.used}]:[];});
        replacePresentation(project,{rows,layout:preset.layout});return persist();
    }
    function renderOptions(project){const rules=new Map((rowProjects.get(project.projectId)||[]).map(r=>[r.barId,r]));return {sectionRules:sectionProjects.get(project.projectId)||[],formsList:value.appearance.visibility.formList?C.localPaperForms?.list(project):null,visibility:{...value.appearance.visibility,...(value.timingGrid===null?{}:{timingGrid:value.timingGrid}),...(value.gridResolution===null?{}:{gridResolution:value.gridResolution})},barsPerLine:value.barsPerLine,lineLayoutForSlot(id,number){return rules.get(id)||rules.get(project.bars[number-1]?.id)||null;},lineLayoutForBar(number){return rules.get(project.bars[number-1]?.id)||null;}};}
    function setLine(project,barId,columns,used){
        if(!project.bars.some(b=>b.id===barId)&&!project.extensions?.scoreLayoutV1?.holes.some(h=>h.id===barId))return {ok:false};
        let rows=(rowProjects.get(project.projectId)||[]).filter(r=>r.barId!==barId);
        if(columns!==null){const checked=normalizeLineRules([{barId,columns,used}]);if(!checked.length)return {ok:false};rows.push(checked[0]);}
        rowProjects.set(project.projectId,rows);notify();return saveRows();
    }
    function close(saveChanges=false){if(!dialog)return;previewAudio?.stop();if(saveChanges){const result=commit();if(!result.ok){status(result.error);return;}}else cancel();dialog.close(saveChanges?'save':'cancel');}
    function open(host,options={}){
        if(dialog||!options.project)return;
        if(!begin())return;const sample=options.project,previous=doc.activeElement;
        let selectedNumber=null,activeSetting=null;
        const targetSelectors={formListScale:'.sc-form-list',timingGrid:'.sheet-bar-grid',barLine:'.sheet-line',beatLine:'.sheet-bar-grid>.is-beat',divisionLine:'.sheet-bar-grid>.is-8th,.sheet-bar-grid>.is-16th',barsPerLine:'.sheet-line:not([data-line-custom])',titleSize:'.sheet-title',artistSize:'.sheet-artist',metaSize:'.sheet-meta',partSize:'.sheet-section-label',numberSize:'.sheet-bar-num',chordSize:'.sheet-bar-chord',formScale:'.sheet-bar-forms',strumSize:'.sheet-bar-strum',lyricsSize:'.sheet-bar-lyrics',doremiSize:'.sheet-bar-doremi',rowLayout:'.sc-selected-layout-line'};
        const names={timingGrid:'グリッド線',barLine:'小節線',beatLine:'拍線',divisionLine:'表裏の線',barsPerLine:'1行の小節数',titleSize:'曲名',artistSize:'アーティスト名',metaSize:'曲情報',partSize:'セクション名',numberSize:'小節番号',chordSize:'コード',formScale:'フォーム',strumSize:'ストローク',lyricsSize:'歌詞',doremiSize:'ドレミ',rowLayout:'選択した行の配置',formListScale:'フォーム一覧'};
        dialog=doc.createElement('dialog');dialog.className='sc-layout-dialog';dialog.dataset.paperLayout='';dialog.setAttribute('aria-label','譜面の表示設定');
        let auditionPhase='idle';const previewPlay=doc.createElement('button');previewPlay.type='button';previewPlay.dataset.layoutPlay='';previewPlay.textContent='▶ 再生';previewPlay.title='設定を反映して最初から再生';
        const header=doc.createElement('header'),title=doc.createElement('h2'),dismiss=doc.createElement('button'),accept=doc.createElement('button'),actions=doc.createElement('div');title.textContent='譜面の表示設定';dismiss.type=accept.type='button';dismiss.textContent='キャンセル';accept.textContent='保存';accept.dataset.layoutSave='';dismiss.dataset.layoutCancel='';actions.className='sc-layout-actions';actions.append(previewPlay,dismiss,accept);header.append(title,actions);const storageNote=doc.createElement('p');storageNote.id='sc-layout-storage-note';storageNote.className='sc-layout-storage-note';storageNote.dataset.layoutStorageNote='';storageNote.textContent=options.storageNote||'表示設定はこのブラウザに保存され、曲のJSONにも書き出されます。';accept.setAttribute('aria-describedby',storageNote.id);header.appendChild(storageNote);dialog.appendChild(header);
        const body=doc.createElement('div'),controls=doc.createElement('div'),preview=doc.createElement('div'),caption=doc.createElement('p'),feedback=doc.createElement('p'),viewport=doc.createElement('div'),frame=doc.createElement('div'),paper=doc.createElement('div');
        body.className='sc-layout-body';controls.className='sc-layout-controls';preview.className='sc-layout-example';caption.textContent='譜面例。行を選ぶと、その行の配置を調整できます。';feedback.className='sc-layout-feedback';feedback.dataset.layoutFeedback='';viewport.className='sc-layout-example-viewport';paper.className='sc-layout-example-paper';viewport.appendChild(frame);frame.appendChild(paper);preview.append(caption,feedback,viewport);body.append(controls,preview);dialog.appendChild(body);
        function selectedLine(){if(selectedNumber===null)return null;return Array.from(paper.querySelectorAll('.sheet-line')).find(line=>line.querySelector('.sheet-bar[data-bar-number="'+selectedNumber+'"]'))||null;}
        function mark(reveal=false,measure=true){
            const targets=activeSetting?Array.from(paper.querySelectorAll(targetSelectors[activeSetting])):[],kept=new Set(targets);
            paper.querySelectorAll('[data-layout-highlight]').forEach(e=>{if(!kept.has(e))e.removeAttribute('data-layout-highlight');});
            controls.querySelectorAll('[data-layout-field]').forEach(e=>e.classList.toggle('is-layout-active',e.dataset.layoutField===activeSetting));
            if(!activeSetting)return;targets.forEach(e=>{if(e.dataset.layoutHighlight!==activeSetting)e.dataset.layoutHighlight=activeSetting;});
            if(!measure)return;
            const line=selectedLine(),visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
            const target=targets.find(e=>line?.contains(e)&&visible(e))||targets.find(visible);feedback.textContent=names[activeSetting]+'を調整中'+(target?'':'（現在は表示されていません）');
            if(reveal&&target){const a=viewport.getBoundingClientRect(),b=target.getBoundingClientRect();if(b.top<a.top+4)viewport.scrollTop+=b.top-a.top-8;else if(b.bottom>a.bottom-4)viewport.scrollTop+=b.bottom-a.bottom+8;}
        }
        function activate(name){activeSetting=name;mark(true);}
        const inputs=[];
        function field(name,label,parent=controls){const row=doc.createElement('div'),text=doc.createElement('span');row.className='sc-layout-field';row.dataset.layoutField=name;text.textContent=label;row.appendChild(text);parent.appendChild(row);const activateField=e=>{if(e.target.closest('[data-layout-field]')===row)activate(name);};row.addEventListener('focusin',activateField);row.addEventListener('pointerdown',activateField);return row;}
        const presetGroup=doc.createElement('div');presetGroup.className='sc-layout-presets';presetGroup.dataset.layoutPresets='';
        const presetSelect=doc.createElement('select');presetSelect.dataset.fontPresetSelect='';presetSelect.setAttribute('aria-label','表示プリセット');
        const presetNew=doc.createElement('button');presetNew.type='button';presetNew.textContent='新規保存';presetNew.dataset.presetNew='';
        const createPanel=doc.createElement('div');createPanel.dataset.presetCreate='';createPanel.hidden=true;createPanel.className='sc-preset-create';
        const presetInput=doc.createElement('input');presetInput.type='text';presetInput.maxLength=40;presetInput.dataset.fontPresetName='';presetInput.placeholder='プリセット名';presetInput.setAttribute('aria-label','プリセット名');
        const presetSave=doc.createElement('button'),presetAbort=doc.createElement('button'),presetDelete=doc.createElement('button');presetSave.type=presetAbort.type=presetDelete.type='button';presetSave.textContent='登録';presetAbort.textContent='やめる';presetDelete.textContent='選択中を削除';presetSave.dataset.fontPresetAction='save';presetDelete.dataset.fontPresetAction='delete';presetAbort.dataset.presetAbort='';createPanel.append(presetInput,presetSave,presetAbort,presetDelete);presetGroup.append(presetSelect,presetNew,createPanel);const presetNote=doc.createElement('p');presetNote.id='sc-preset-storage-note';presetNote.className='sc-preset-storage-note';presetNote.dataset.presetStorageNote='';presetNote.textContent='プリセット一覧は、このブラウザだけに保存されます。';presetNew.setAttribute('aria-describedby',presetNote.id);presetGroup.appendChild(presetNote);
        function syncPresets(selected=presetSelect.value){presetSelect.replaceChildren();const empty=doc.createElement('option');empty.value='';empty.textContent='プリセットを選択';presetSelect.appendChild(empty);for(const preset of presets){const o=doc.createElement('option');o.value=preset.name;o.textContent=preset.name+(preset.fonts?'（文字サイズのみ）':'');presetSelect.appendChild(o);}presetSelect.value=presets.some(p=>p.name===selected)?selected:'';presetDelete.hidden=!presetSelect.value;}
        presetNew.addEventListener('click',()=>{createPanel.hidden=false;presetInput.value='';presetInput.focus({preventScroll:true});dialog.scrollTop=dialog.scrollHeight;});presetAbort.addEventListener('click',()=>{createPanel.hidden=true;presetNew.focus({preventScroll:true});});
        presetSelect.addEventListener('change',()=>{if(presetSelect.value){loadDisplayPreset(presetSelect.value,sample);status('表示プリセットを呼び出しました。保存で反映します');}createPanel.hidden=true;syncPresets();});
        presetSave.addEventListener('click',()=>{const result=saveDisplayPreset(presetInput.value,sample,currentVisibility());if(result.ok){syncPresets(result.name);createPanel.hidden=true;presetNew.focus({preventScroll:true});}status(result.ok?'表示設定のプリセットを追加しました。保存で確定します':result.error);});
        presetDelete.addEventListener('click',()=>{const result=deleteFontPreset(presetSelect.value);if(result.ok){syncPresets('');createPanel.hidden=true;}status(result.ok?'プリセットを削除しました。保存で確定します':result.error);});syncPresets();if(options.mountPresets){presetGroup.replaceChildren();options.mountPresets(presetGroup);}
        const row=field('barsPerLine','全体：1行の小節数'),select=doc.createElement('select');select.dataset.layoutSetting='barsPerLine';select.setAttribute('aria-label','全体：1行の小節数');for(const [n,text] of Array.from({length:9},(_,i)=>[i,i?i+'小節':'自動'])){const option=doc.createElement('option');option.value=n;option.textContent=text;select.appendChild(option);}select.value=value.barsPerLine;select.addEventListener('change',()=>{activeSetting='barsPerLine';set({barsPerLine:Number(select.value)});});row.appendChild(select);inputs.push(()=>select.value=value.barsPerLine);
        if(sample.sections?.length){
            const panel=doc.createElement('details'),heading=doc.createElement('summary'),body=doc.createElement('div');
            panel.className='sc-section-layout';heading.textContent='セクション別の表示';panel.append(heading,body);controls.append(panel);
            function choice(label,choices){
                const input=doc.createElement('select');input.setAttribute('aria-label',label);
                for(const [id,text] of choices){const opt=doc.createElement('option');opt.value=id;opt.textContent=text;input.append(opt);}
                return input;
            }
            const target=choice('設定するセクション',sample.sections.map(s=>[s.id,s.name]));
            target.value=sample.bars[(options.selectedBarNumber||1)-1]?.sectionId||sample.sections[0].id;
            body.append(target);
            const rules=()=>sectionProjects.get(sample.projectId)||[];
            const current=()=>rules().find(r=>r.sectionId===target.value)||{sectionId:target.value};
            function change(edit){
                const next=copy(current());edit(next);
                sectionProjects.set(sample.projectId,normalizeSections([...rules().filter(r=>r.sectionId!==target.value),next]));
                notify();save();
            }
            const syncs=[],columns=choice('セクションの1行の小節数',[['','全体に従う'],...Array.from({length:8},(_,i)=>[i+1,(i+1)+'小節'])]);
            const lineLabel=doc.createElement('label');lineLabel.append('1行の小節数',columns);body.append(lineLabel);
            columns.onchange=()=>change(r=>{r.barsPerLine=Number(columns.value);});
            syncs.push(()=>columns.value=current().barsPerLine??'');
            for(const [flag,title,key] of sectionTracks){
                const line=doc.createElement('div'),label=doc.createElement('span'),size=doc.createElement('input');
                line.className='sc-section-track';label.textContent=title;
                const mode=choice(title+'の表示',[['','全体に従う'],['on','表示'],['off','非表示']]);
                mode.onchange=()=>change(r=>{(r.visibility??={})[flag]=mode.value===''?undefined:mode.value==='on';});
                size.type='number';[size.min,size.max]=ranges[key];size.step=flag==='forms'?5:.5;
                size.setAttribute('aria-label',title+'の大きさ');size.title='空欄で全体の大きさを使用';
                size.onchange=()=>{if(size.validity.valid)change(r=>{(r.sizes??={})[key]=size.value===''?undefined:size.valueAsNumber;});else size.reportValidity();};
                syncs.push(()=>{const rule=current();mode.value=rule.visibility?.[flag]===undefined?'':rule.visibility[flag]?'on':'off';size.value=rule.sizes?.[key]??'';size.placeholder=value[key];size.disabled=mode.value==='off';});
                const unit=doc.createElement('small');unit.textContent=flag==='forms'?'%':'px';line.append(label,mode,size,unit);body.append(line);
            }
            const resetSection=doc.createElement('button');resetSection.type='button';resetSection.textContent='このセクションを全体設定に戻す';
            resetSection.onclick=()=>change(r=>{delete r.barsPerLine;delete r.visibility;delete r.sizes;});body.append(resetSection);
            const sync=()=>{syncs.forEach(fn=>fn());resetSection.disabled=Object.keys(current()).length===1;};
            target.onchange=()=>{sync();const heading=Array.from(paper.querySelectorAll('.sheet-section-label')).find(h=>h.dataset.sectionId===target.value);if(heading)viewport.scrollTop+=heading.getBoundingClientRect().top-viewport.getBoundingClientRect().top;};
            inputs.push(sync);
        }
        const custom=doc.createElement('div');custom.className='sc-layout-custom';custom.dataset.layoutCustom='';custom.hidden=true;controls.appendChild(custom);
        const lineGroup=doc.createElement('fieldset'),legend=doc.createElement('legend');legend.textContent='選択した行';legend.dataset.layoutLineTitle='';lineGroup.appendChild(legend);custom.appendChild(lineGroup);
        const colsRow=field('rowLayout','横に並べる枠',lineGroup),colsInput=doc.createElement('select'),usedRow=field('rowLayout','この行に置く小節',lineGroup),usedInput=doc.createElement('select');colsInput.dataset.lineColumns='';colsInput.setAttribute('aria-label','横に並べる枠');usedInput.dataset.layoutLineUsed='';usedInput.setAttribute('aria-label','この行に置く小節');for(let n=1;n<=8;n++){const o=doc.createElement('option');o.value=n;o.textContent=n+'枠';colsInput.appendChild(o);}colsRow.appendChild(colsInput);usedRow.appendChild(usedInput);
        const lineReset=doc.createElement('button');lineReset.type='button';lineReset.textContent='この行を自動に戻す';lineReset.dataset.lineReset='';lineGroup.append(lineReset);
        function syncLine(){const line=selectedLine();custom.hidden=!line;paper.querySelectorAll('.sheet-line').forEach(e=>e.classList.toggle('sc-selected-layout-line',e===line));if(!line)return;const number=Number(line.dataset.lineStart),bar=sample.bars[number-1],rule=(rowProjects.get(sample.projectId)||[]).find(r=>r.barId===line.dataset.lineAnchor||r.barId===bar.id),columns=Number(line.dataset.lineCapacity);legend.textContent=number+'小節目からの行';colsInput.value=columns;usedInput.replaceChildren();for(let n=1;n<=columns;n++){const o=doc.createElement('option');o.value=n;o.textContent=n+'小節';usedInput.appendChild(o);}usedInput.value=rule?rule.used:Number(line.dataset.lineUsed);paper.querySelectorAll('.sheet-line').forEach(e=>e.classList.toggle('sc-selected-layout-line',e===line));}
        function changeLine(){const line=selectedLine();if(!line)return;activeSetting='rowLayout';selectedNumber=Number(line.dataset.lineStart);const columns=Number(colsInput.value),used=Math.min(Number(usedInput.value)||columns,columns),id=line.dataset.lineAnchor;setLine(sample,id,columns,used);}
        colsInput.addEventListener('change',changeLine);usedInput.addEventListener('change',changeLine);lineReset.addEventListener('click',()=>{const line=selectedLine();if(line)setLine(sample,line.dataset.lineAnchor,null);});
        function currentVisibility(){return {...(options.getVisibility?.()||{}),...value.appearance.visibility};}
        function visible(flag){return flag.startsWith('show')?value[flag]:flag==='formList'?currentVisibility()[flag]===true:currentVisibility()[flag]!==false;}
        function toggle(flag,checked){if(flag.startsWith('show'))set({[flag]:checked});else set({appearance:{...value.appearance,visibility:{...value.appearance.visibility,[flag]:checked}}});}
        function textPatch(key,patch){set({appearance:{...value.appearance,text:{...value.appearance.text,[key]:{...value.appearance.text[key],...patch}}}});}
        for(const [name,label] of Object.entries(names).filter(([name])=>Object.hasOwn(ranges,name))){
            const row=field(name,label),output=doc.createElement('output'),input=doc.createElement('input');
            if(TEXT_FIELDS[name]){row.replaceChildren();addTextTools({doc,row,name,label,get:()=>value.appearance,patch:textPatch,visible,toggle,syncs:inputs});}
            else {const check=doc.createElement('input');check.type='checkbox';const flag=name==='formListScale'?'formList':'forms';check.dataset.textVisible=flag;if(flag==='formList')check.dataset.layoutFormList='';check.setAttribute('aria-label',label+'を表示');check.addEventListener('change',()=>toggle(flag,check.checked));const heading=doc.createElement('div');heading.className='sc-text-heading';heading.append(row.firstChild,check);row.appendChild(heading);inputs.push(()=>check.checked=visible(flag));}
            input.type='range';input.min=ranges[name][0];input.max=ranges[name][1];input.step=['formScale','formListScale'].includes(name)?5:.5;input.setAttribute('aria-label',label+'の大きさ');if(name==='formScale')input.title='100%は1拍分。重なる図は上下に並びます';input.dataset.layoutSetting=name;const sync=()=>{input.value=value[name];output.textContent=value[name]+(['formScale','formListScale'].includes(name)?'%':'px');};sync();inputs.push(sync);input.addEventListener('input',()=>{activeSetting=name;set({[name]:Number(input.value)},false);sync();});input.addEventListener('change',save);const size=doc.createElement('div');size.className='sc-text-size';size.append(input,output);row.appendChild(size);
            if(name==='lyricsSize'||name==='doremiSize'){
                const key=name==='lyricsSize'?'lyricsSpacing':'doremiSpacing';
                const control=doc.createElement('label'),slider=doc.createElement('input'),amount=doc.createElement('output');
                control.className='sc-text-size';slider.type='range';slider.step=.5;
                [slider.min,slider.max]=ranges[key];slider.dataset.layoutSetting=key;
                slider.setAttribute('aria-label',label+'の字間');
                const syncSpacing=()=>{slider.value=value[key];amount.textContent=value[key]+'px';};
                slider.addEventListener('input',()=>{activeSetting=name;set({[key]:Number(slider.value)},false);syncSpacing();});
                slider.addEventListener('change',save);syncSpacing();inputs.push(syncSpacing);
                control.append('字間',slider,amount);row.appendChild(control);
            }
            if(name==='metaSize'){
                const details=doc.createElement('details'),summary=doc.createElement('summary');details.className='sc-meta-details';details.dataset.metaDetails='';summary.textContent='さらに詳細';details.appendChild(summary);row.appendChild(details);
                const patchMeta=(key,patch)=>set({metaFields:{...value.metaFields,[key]:{...value.metaFields[key],...patch}}});
                for(const [key,label]of Object.entries(META_FIELDS)){
                    if(key==='basicStrum')continue; // Keep older presentation settings readable.
                    const name='metaField-'+key;targetSelectors[name]='.sheet-meta-item[data-meta-field="'+key+'"]';names[name]=label;
                    const detailRow=field(name,label,details);detailRow.replaceChildren();addTextTools({doc,row:detailRow,name,label,definition:[key,'meta-'+key,targetSelectors[name],'#69635c'],get:()=>({text:value.metaFields}),patch:patchMeta,visible:()=>value.metaFields[key]?.visible!==false,toggle:(_,checked)=>patchMeta(key,{visible:checked}),syncs:inputs});
                    const size=doc.createElement('div'),slider=doc.createElement('input'),output=doc.createElement('output');size.className='sc-text-size';slider.type='range';slider.min=8;slider.max=24;slider.step=.5;slider.dataset.metaSize=key;slider.setAttribute('aria-label',label+'の大きさ');inputs.push(()=>{slider.value=value.metaFields[key]?.size??value.metaSize;output.textContent=slider.value+'px';});slider.addEventListener('input',()=>{activeSetting=name;patchMeta(key,{size:Number(slider.value)});});size.append(slider,output);detailRow.appendChild(size);
                }
                const reset=doc.createElement('button');reset.type='button';reset.textContent='個別設定をリセット';reset.dataset.metaReset='';reset.onclick=()=>set({metaFields:{}});details.appendChild(reset);
            }

        }
        addInteractionColors({doc,parent:controls,get:()=>value.appearance.interaction,patch:interaction=>set({appearance:{...value.appearance,interaction}}),syncs:inputs});
        const lines=doc.createElement('fieldset'),lineTitle=doc.createElement('legend');lines.className='sc-line-controls';lineTitle.textContent='縦の罫線';lines.appendChild(lineTitle);controls.appendChild(lines);
        for(const [name,[label,color,width,defaultStyle='solid']] of Object.entries(LINE_FIELDS)){
            const row=doc.createElement('div'),title=doc.createElement('span'),ink=doc.createElement('input'),style=doc.createElement('select'),weight=doc.createElement('input'),out=doc.createElement('output');row.className='sc-line-settings';row.dataset.layoutField=name+'Line';title.textContent=label;ink.type='color';ink.dataset.lineColor=name;ink.setAttribute('aria-label',label+'の色');weight.type='range';weight.min=0;weight.max=4;weight.step=.25;weight.dataset.lineWidth=name;weight.setAttribute('aria-label',label+'の太さ');style.dataset.lineStyle=name;style.setAttribute('aria-label',label+'の線種');for(const [id,text] of [['solid','実線'],['dashed','破線'],['dotted','点線']]){const o=doc.createElement('option');o.value=id;o.textContent=text;style.appendChild(o);}const patch=p=>{activeSetting=name+'Line';set({appearance:{...value.appearance,lines:{...value.appearance.lines,[name]:{color:'',width,style:defaultStyle,...value.appearance.lines[name],...p}}}});};ink.addEventListener('input',()=>patch({color:ink.value}));weight.addEventListener('input',()=>patch({width:Number(weight.value)}));style.addEventListener('change',()=>patch({style:style.value}));row.addEventListener('focusin',()=>activate(name+'Line'));inputs.push(()=>{const l=value.appearance.lines[name];ink.value=l?.color||color;weight.value=l?.width??width;style.value=l?.style||defaultStyle;out.textContent=(l?.width??width)+'px';});row.append(title,ink,style,weight,out);lines.appendChild(row);
        }
        const gridRow=field('timingGrid','グリッド線'),grid=doc.createElement('input'),resolution=doc.createElement('select');grid.type='checkbox';grid.dataset.layoutGrid='';grid.setAttribute('aria-label','グリッド線');resolution.dataset.layoutGridResolution='';resolution.setAttribute('aria-label','グリッド線の分割');for(const [n,label]of [[8,'8分'],[16,'16分']]){const o=doc.createElement('option');o.value=n;o.textContent=label;resolution.appendChild(o);}gridRow.append(grid,resolution);grid.onchange=()=>set({timingGrid:grid.checked});resolution.onchange=()=>set({gridResolution:Number(resolution.value)});inputs.push(()=>{const original=options.getVisibility?.()||{};grid.checked=value.timingGrid??original.timingGrid??true;resolution.value=value.gridResolution??original.gridResolution??8;resolution.disabled=!grid.checked;});
        const footer=doc.createElement('footer'),reset=doc.createElement('button'),statusText=doc.createElement('span');reset.type='button';reset.textContent='デフォルトに戻す';reset.dataset.layoutReset='';statusText.setAttribute('role','status');controls.prepend(reset);footer.append(statusText);controls.append(footer,presetGroup);host.appendChild(dialog);
        let auditionFrame=null,auditionBar=null;const auditionLine=doc.createElement('span');auditionLine.dataset.layoutPlayhead='';auditionLine.setAttribute('aria-hidden','true');paper.style.position='relative';
        function clearAudition(){if(auditionFrame!==null)cancelAnimationFrame(auditionFrame);auditionFrame=null;auditionLine.remove();auditionBar=null;paper.querySelectorAll('.sc-layout-playing').forEach(e=>e.classList.remove('sc-layout-playing'));}
        function paintAudition(){
            auditionFrame=null;
            if(!dialog?.open)return;
            const position=previewAudio?.position();
            if(position){
                const findBar=n=>paper.querySelector('.sheet-bar[data-bar-number="'+n+'"]');
                if(!auditionBar?.isConnected||Number(auditionBar.dataset.barNumber)!==position.barNumber){
                    auditionBar?.classList.remove('sc-layout-playing');
                    auditionBar=findBar(position.barNumber);
                    auditionBar?.classList.add('sc-layout-playing');
                }
                if(auditionBar){
                    const bounds=auditionBar.getBoundingClientRect(),outer=viewport.getBoundingClientRect();
                    movePaperPlayhead(auditionLine,paper,auditionBar,bounds,{fraction:position.tick/position.barTicks,seconds:position.barSeconds,
                        nextBar:()=>position.nextBarNumber && findBar(position.nextBarNumber)});
                    viewport.scrollTop=Math.round(viewport.scrollTop+(bounds.top+bounds.bottom-outer.top-outer.bottom)*.05);
                }
            }
            auditionFrame=requestAnimationFrame(paintAudition);
        }
        previewAudio=options.createPreviewAudio?.({isOpen:()=>!!dialog?.open,changed:phase=>{auditionPhase=phase;previewPlay.textContent=phase==='idle'?'▶ 再生':'■ 停止';previewPlay.setAttribute('aria-label',phase==='idle'?'再生':'停止');previewPlay.setAttribute('aria-pressed',String(phase!=='idle'));clearAudition();if(phase==='playing')auditionFrame=requestAnimationFrame(paintAudition);},message:text=>status(text)});previewPlay.hidden=!previewAudio;const toggleAudition=()=>{if(!previewAudio||!dialog?.open)return;if(auditionPhase!=='idle'){previewAudio.stop();clearAudition();}else{viewport.scrollTop=0;clearAudition();void previewAudio.play();}};previewPlay.onclick=toggleAudition;previewPlay.title='先頭から再生／停止（Space）';dialog.addEventListener('keydown',e=>{if(e.code!=='Space'&&e.key!==' ')return;if(e.isComposing||e.keyCode===229||e.repeat||e.ctrlKey||e.metaKey||e.altKey)return;if(e.target.closest('input,textarea,select,summary,[contenteditable="true"]')||e.target.closest('button')&&e.target!==previewPlay)return;e.preventDefault();e.stopPropagation();toggleAudition();});
        const silencePreview=()=>{if(doc.hidden)previewAudio?.stop();};doc.addEventListener('visibilitychange',silencePreview);const stopPreview=()=>previewAudio?.stop();doc.defaultView.addEventListener('pagehide',stopPreview);
        dialog.addEventListener('close',()=>{doc.removeEventListener('visibilitychange',silencePreview);doc.defaultView.removeEventListener('pagehide',stopPreview);clearAudition();const audio=previewAudio;previewAudio=null;void audio?.dispose();},{once:true});
        let zoom=1,resizeFrame=null;
        bindScoreZoom(preview,{read:()=>zoom,write:value=>{zoom=value;resize(false);},paper:()=>paper,scrollX:()=>viewport,scrollY:()=>viewport});
        function scheduleResize(){if(resizeFrame===null)resizeFrame=requestAnimationFrame(()=>{resizeFrame=null;resize();});}
        function resize(reveal=true){if(!dialog||!paper.isConnected)return;const scale=zoom*Math.min(1,viewport.clientWidth/794);frame.style.width=Math.ceil(794*scale)+'px';paper.style.transform='scale('+scale+')';frame.style.height=Math.ceil(paper.offsetHeight*scale)+'px';mark(reveal);}
        refreshSample=(structural=true,reflowOnly=false)=>{if(!dialog)return;inputs.forEach(fn=>fn());if(structural){if(options.renderSample){const {layout,rows}=exportPresentation(sample);options.renderSample(paper,{layout,rows,reuse:reflowOnly});}else C.sheetRenderer.render(sample,paper,{...(options.getRenderOptions?options.getRenderOptions():options.renderOptions),...renderOptions(sample),editableSlots:false,formsList:value.appearance.visibility.formList?C.localPaperForms?.list(sample,{interactive:false}):null,reuseBars:reflowOnly});paper.querySelectorAll('[tabindex]').forEach(e=>e.removeAttribute('tabindex'));paper.querySelectorAll('.sheet-form-event').forEach(e=>{e.setAttribute('role','img');e.removeAttribute('aria-haspopup');});paper.querySelectorAll('.sheet-section-label').forEach(e=>{e.removeAttribute('role');e.removeAttribute('aria-pressed');});}apply(paper);if(options.renderSample){paper.style.height='auto';paper.querySelectorAll('.sc-paper-layout').forEach(apply);}if(structural)syncLine();mark(false,false);scheduleResize();};
        function clearHighlight(){activeSetting=null;feedback.textContent='';mark();}
        preview.addEventListener('click',e=>{const line=e.target.closest('.sheet-line');selectedNumber=line&&Number(line.dataset.lineStart)>0?Number(line.dataset.lineStart):null;syncLine();clearHighlight();});
        dialog.addEventListener('click',e=>{if(e.target.closest('[data-layout-field],[data-layout-custom]'))return;clearHighlight();if(!e.target.closest('.sheet-line,button,input,select,summary')){selectedNumber=null;syncLine();}});
        reset.addEventListener('click',()=>{const forms=visible('forms');selectedNumber=null;value=normalizeLayout(DEFAULT_LAYOUT);value.appearance.visibility.forms=forms;rowProjects.delete(sample.projectId);sectionProjects.delete(sample.projectId);notify();save();});dismiss.addEventListener('click',()=>close());accept.addEventListener('click',()=>close(true));dialog.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}});dialog.addEventListener('close',()=>{const old=dialog;if(!old)return;dialog=null;old.remove();refreshSample=()=>{};if(editing)cancel();else notify();if(previous?.isConnected)previous.focus({preventScroll:true});options.onClose?.(old.returnValue==='save');});const observer=new ResizeObserver(scheduleResize);observer.observe(viewport);dialog.addEventListener('close',()=>{observer.disconnect();if(resizeFrame!==null)cancelAnimationFrame(resizeFrame);},{once:true});dialog.addEventListener('cancel',e=>{e.preventDefault();close();});bindOutsideDismiss(dialog,{close:()=>close()});dialog.showModal();refreshSample();return dialog;
    }
    function exportPresentation(project,visibility={}){
        const layout=copy(value),anchors=new Set(project.bars.map(b=>b.id).concat((project.extensions?.scoreLayoutV1?.holes||[]).map(h=>h.id)));
        const ids=new Set(project.sections?.map(s=>s.id));
        const sections=(sectionProjects.get(project.projectId)||[]).filter(rule=>ids.has(rule.sectionId));
        if(sections.length)layout.sections=copy(sections);
        for(const key of ['chords','forms','strum','lyrics','doremi'])if(typeof visibility[key]==='boolean'&&!Object.hasOwn(layout.appearance.visibility,key))layout.appearance.visibility[key]=visibility[key];
        if(typeof visibility.timingGrid==='boolean')layout.timingGrid=visibility.timingGrid;if([8,16].includes(visibility.gridResolution))layout.gridResolution=visibility.gridResolution;
        return {version:1,layout,rows:copy((rowProjects.get(project.projectId)||[]).filter(r=>anchors.has(r.barId))),zoom:1,flow:'responsive'};
    }
    function replacePresentation(project,presentation){value=normalizeLayout(presentation.layout);sectionProjects.set(project.projectId,value.sections||[]);delete value.sections;rowProjects.set(project.projectId,normalizeLineRules(presentation.rows||[]));notify();}
    return {readGridRows,importPresentation(project,presentation){if(presentation?.version!==1 || !presentation.layout || typeof presentation.layout!=='object')return;replacePresentation(project,presentation);return persist();},replacePresentation,exportPresentation,renderOptions,setLine,begin,commit,cancel,saveDisplayPreset,loadDisplayPreset,saveFontPreset,loadFontPreset,deleteFontPreset,get presets(){return copy(presets);},get value(){return copy(value);},get isOpen(){return !!dialog?.open;},apply,set,open,close,onChange(fn){changed=fn;}};
}
