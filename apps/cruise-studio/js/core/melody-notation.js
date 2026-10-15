/* Pure engraving projection of a successful Common Music result. Never a saved model. */
(function(root,factory){
    if(typeof module==='object'&&module.exports)module.exports=factory();
    else root.CruiseStudio.melodyNotation=factory();
})(globalThis,function(){
    'use strict';
    var LIMITS=Object.freeze({bars:256,segmentsPerBar:128});
    var DURATIONS=[[1920,'w',0],[1440,'h',1],[960,'h',0],[720,'q',1],[480,'q',0],
        [360,'8',1],[240,'8',0],[180,'16',1],[120,'16',0],[90,'32',1],[60,'32',0],[30,'64',0]];
    var KEYS=['Cb','Gb','Db','Ab','Eb','Bb','F','C','G','D','A','E','B','F#','C#'];
    function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;}
    function failure(code){return freeze({ok:false,code:code});}
    function segment(onset,duration){
        if(!Number.isSafeInteger(onset)||!Number.isSafeInteger(duration)||onset<0||duration<=0||
            onset+duration>1920||onset%30||duration%30)return failure('unsupported-duration-grid');
        var result=[],end=onset+duration,t=onset;
        while(t<end){
            // Preserve off-beat attacks; split across the next beat instead of shifting time.
            var remaining=Math.min(end-t,t%480?480-t%480:end-t);
            var d=DURATIONS.find(function(x){return x[0]<=remaining;});
            if(!d)return failure('unsupported-duration-grid');
            result.push({onsetTick:t,durationTicks:d[0],duration:d[1],dots:d[2]});t+=d[0];
        }
        return freeze({ok:true,segments:result});
    }
    function project(result){
        if(!result||result.ok!==true||!result.model)return failure('conversion-not-ready');
        var m=result.model;
        if(m.modelVersion!==1||m.ppq!==480||m.meter?.beats!==4||m.meter?.beatUnit!==4)return failure('unsupported-meter-or-model');
        if(!Array.isArray(m.measures)||m.measures.length>LIMITS.bars)return failure('preview-budget');
        if(!KEYS.includes(m.keyContext?.originalKey))return failure('unsupported-key-signature');
        if(!m.source||typeof m.source.projectId!=='string'||typeof m.source.sessionId!=='string'||typeof m.source.snapshotVersion!=='string')return failure('invalid-source');
        var measures=[];
        for(var bar of m.measures){
            var voice=bar.voices?.melody;
            if(!voice||!Array.isArray(voice.events)||!Array.isArray(voice.silentIntervals))return failure('invalid-melody-voice');
            var tokens=[],sourceEvents=voice.events.concat(voice.silentIntervals).slice().sort(function(a,b){return a.onsetTick-b.onsetTick;});
            var cursor=0;
            for(var ev of sourceEvents){
                if(ev.onsetTick!==cursor)return failure('invalid-voice-coverage');
                var parts=segment(ev.onsetTick,ev.durationTicks);if(!parts.ok)return parts;
                var isRest=ev.kind==='silence',pitch=ev.pitch;
                if(!isRest&&(!pitch||!['C','D','E','F','G','A','B'].includes(pitch.step)||
                    !Number.isSafeInteger(pitch.octave)||!Number.isSafeInteger(pitch.alter)||Math.abs(pitch.alter)>2||
                    !Number.isSafeInteger(pitch.midi)||pitch.midi<0||pitch.midi>127))return failure('unsupported-pitch');
                var group=tokens.length;
                parts.segments.forEach(function(part,i){tokens.push({...part,kind:isRest?'rest':'note',
                    key:isRest?'b/4':pitch.step.toLowerCase()+'/'+pitch.octave,
                    pitch:isRest?null:{step:pitch.step,alter:pitch.alter,octave:pitch.octave,midi:pitch.midi},
                    eventIndex:isRest?null:ev.sourceLocation.eventIndex,tieFrom:!isRest&&i>0?group+i-1:null,
                    tieTo:!isRest&&i<parts.segments.length-1?group+i+1:null});});
                cursor=ev.onsetTick+ev.durationTicks;
            }
            if(cursor!==1920||tokens.length>LIMITS.segmentsPerBar)return failure('invalid-voice-coverage');
            if(bar.harmony.length+(bar.lyrics||[]).length>128)return failure('preview-text-budget');
            if(bar.harmony.reduce(function(n,h){return n+h.symbol.length;},0)+(bar.lyrics||[]).reduce(function(n,l){return n+l.text.length;},0)>2048)return failure('preview-text-budget');
            measures.push({index:bar.index,barNumber:bar.barNumber,sectionId:bar.sectionId,tokens:tokens,
                autoTiming:true,timingLabel:'音の長さ：自動を含む（由来未確認）',
                chords:bar.harmony.map(function(h){return {tick:h.onsetTick,symbol:h.symbol};}),
                lyrics:(bar.lyrics||[]).map(function(l){return {tick:l.onsetTick,text:l.text};})});
        }
        return freeze({ok:true,source:JSON.parse(JSON.stringify(m.source)),key:m.keyContext.originalKey,
            capo:m.keyContext.capo,chordBasis:'Playキー（フォーム）',pitchBasis:'実音・移調なし',measures:measures});
    }
    return Object.freeze({project:project,segment:segment,limits:LIMITS});
});
