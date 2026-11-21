import {rangeForForm} from './form-range.mjs';
import {resolveCruiseAppHref} from '../../../../cruise-port/cruise-app-links.js';

export const bookDraftKey='cruiseStudio.pendingChordBookForm';

export function createBookForm(C,base,chord,settings,material,soundingSymbol){
    const {snapshot,provenance}=material,capo=snapshot.capo;
    const chordName=C.model.schema2.chord(soundingSymbol,-capo);
    const parsed=chordName&&C.theory.parseBasicChordSymbol(chordName);
    if(!parsed)throw Error('コード名を確認してから、もう一度保存してください。');
    const theory=base.theory,rootPc=theory.parseSpelledNoteName(parsed.root).pc;
    const tonicPc=settings.selectedKey;
    const mode=settings.scaleType,bassPc=parsed.bass?theory.parseSpelledNoteName(parsed.bass).pc:null;
    const degree=bassPc===null && ['3','7'].flatMap(type=>theory.getDiatonicChords(tonicPc,mode,type))
        .find(item=>item.rootPc===rootPc&&item.qualityKey===chord.qualityKey);
    const notes=snapshot.strings.filter(note=>note.kind==='note').map(note=>({
        string:note.string,fret:note.relativeFret,finger:note.finger,fingeringWarning:note.fingeringWarning,
        interval:(snapshot.tuningMidi[note.string-1]+note.relativeFret-rootPc+12)%12
    }));
    if(!notes.length)throw Error('保存する音を指板で選んでください。');
    return {chordName,shape:provenance.shape,tensionPcs:base.chordModel.tensionPcsForIntervals(rootPc,chord.tensionIntervals||chord.intervals),
        rootPc,bassPc,qualityKey:chord.qualityKey,intervals:chord.intervals,
        keyContext:degree?{tonicPc,mode,degreeLabel:degree.roman}:null,
        fretRange:rangeForForm(snapshot),notes,mutedStrings:snapshot.strings.filter(n=>n.kind==='muted').map(n=>n.string),
        memo:capo?'譜面ではカポ'+capo+'を使用':''};
}

export function localBookPage(edition=document.documentElement.dataset.studioEdition){
    return resolveCruiseAppHref('chord',edition)+'from-score.html';
}

export function openBookSave(record,edition=document.documentElement.dataset.studioEdition){
    const tab=window.open('about:blank','_blank');
    if(!tab)throw Error('コード本棚を開くには、このサイトのポップアップを許可してください。');
    try{
        tab.opener=null;
        tab.sessionStorage.setItem(bookDraftKey,JSON.stringify(record));
        tab.location.replace(localBookPage(edition));
    }catch(error){tab.close();throw error;}
}
