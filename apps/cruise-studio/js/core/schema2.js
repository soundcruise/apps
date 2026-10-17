/* Schema 2 canonical content. No DOM, storage, clock, audio or external service calls. */
(function(root,factory){
    if(typeof module==='object'&&module.exports)module.exports=factory();
    else (root.CruiseStudio=root.CruiseStudio||{}).schema2=factory();
})(typeof window==='object'?window:globalThis,function(){
    'use strict';
    var NAT={C:0,D:2,E:4,F:5,G:7,A:9,B:11}, SCALE=[0,2,4,5,7,9,11];
    var ORIGINS=['legacy-unknown','auto-assigned','user-set'], MAX_BYTES=8*1024*1024;
    function copy(x){return JSON.parse(JSON.stringify(x));}
    function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
    function integer(x){return Number.isSafeInteger(x);}
    function object(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);}
    function insist(ok,code){if(!ok)throw Error(code);}
    function keys(x,allowed){insist(object(x),'invalid-object');Object.keys(x).forEach(function(k){insist(allowed.includes(k),'unknown-field:'+k);});}
    // Form records serialize without losing required values. Keep generic keys()
    // unchanged: older Project records have different optional-field contracts.
    function formKeys(x, required){
        // validate() already inspected every original own descriptor via jsonValue.
        // Exact own-enumerable key coverage adds requiredness without repeating that scan.
        insist(object(x),'invalid-object');
        var own=Object.keys(x);
        own.forEach(function(k){insist(required.includes(k),'unknown-field:'+k);});
        insist(own.length===required.length,'missing-own-form-field');
        var proto=Object.getPrototypeOf(x);
        if(proto!==null && proto!==Object.prototype){
            var ctor=Object.getOwnPropertyDescriptor(proto,'constructor');
            insist(Object.getPrototypeOf(proto)===null && ctor && typeof ctor.value==='function' && Function.prototype.toString.call(ctor.value)===Function.prototype.toString.call(Object),'non-json-form-record');
        }
    }
    function pitchMidi(p){return object(p)&&Object.hasOwn(NAT,p.step)&&integer(p.alter)&&Math.abs(p.alter)<=2&&integer(p.octave)?12*(p.octave+1)+NAT[p.step]+p.alter:null;}
    function timing(origin,confirmed){return {timing:{onset:{origin:origin,confirmed:!!confirmed},duration:{origin:origin,confirmed:!!confirmed}}};}
    function checkTiming(p){
        keys(p,['timing','extensions']);keys(p.timing,['onset','duration']);
        ['onset','duration'].forEach(function(k){var a=p.timing[k];keys(a,['origin','confirmed']);insist(ORIGINS.includes(a.origin)&&typeof a.confirmed==='boolean','invalid-timing-provenance');});
    }
    // Inspect original data descriptors: never let JSON erase values or invoke user hooks.
    function assertJson(value) { jsonValue(value,0,new Set(),new Set()); }
    function jsonValue(value,depth,seen,prototypes) {
        prototypes = prototypes || new Set();
        if (value && typeof value === 'object') {
            // JSON reads toJSON through the complete prototype chain. Never read that property.
            for (var proto = value; proto && !prototypes.has(proto); proto = Object.getPrototypeOf(proto)) {
                insist(!Object.getOwnPropertyDescriptor(proto,'toJSON'), 'json-serialization-hook');
                insist(!Object.getOwnPropertyDescriptor(proto,Symbol.toStringTag), 'non-json-symbol');
                if (proto !== value) Reflect.ownKeys(proto).forEach(function(key){
                    var descriptor=Object.getOwnPropertyDescriptor(proto,key);
                    // Object.prototype's historical __proto__ accessor is never read here.
                    insist(Object.hasOwn(descriptor,'value') || (key==='__proto__' && Object.getPrototypeOf(proto)===null),'non-json-descriptor');
                });
                // Only prototypes can be reused; each value still receives its full own-data check.
                if (proto !== value) prototypes.add(proto);
            }
        }
        insist(depth<40,'json-depth');
        if(value===null||typeof value==='string'||typeof value==='boolean')return;
        if(typeof value==='number'){insist(Number.isFinite(value),'non-json-number');return;}
        insist(typeof value==='object'&&!seen.has(value),'non-json-value');seen.add(value);
        insist(Array.isArray(value)||Object.prototype.toString.call(value)==='[object Object]','non-json-object');
        var array = Array.isArray(value), count = 0, own = Reflect.ownKeys(value);
        for (var key of own) {
            insist(typeof key === 'string', 'non-json-symbol');
            if (array && key === 'length') continue;
            var d = Object.getOwnPropertyDescriptor(value, key);
            insist(Object.hasOwn(d, 'value') && d.enumerable, 'non-json-descriptor');
            if (array) insist(/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length, 'non-json-array-property');
            jsonValue(d.value, depth + 1, seen, prototypes); count++;
        }
        // Unique, in-range own array indices cover the array iff their count equals length.
        if (array) insist(count === value.length, 'sparse-json-array');
        seen.delete(value);
    }
    var STANDARD_TUNING=[64,59,55,50,45,40];
    function standardTuning(t){return Array.isArray(t)&&same(t,STANDARD_TUNING);}
    function formMaterial(m){
        formKeys(m,['id','encoding','snapshot','provenance']);
        insist(m.encoding==='studio-chord-form-v1','unsupported-form-encoding');
        var s=m.snapshot;formKeys(s,['capo','tuningMidi','maxAbsoluteFret','strings','barres','playability','ownerWarning']);
        insist(integer(s.capo)&&s.capo>=0&&s.capo<=11&&standardTuning(s.tuningMidi),'invalid-form-instrument');
        insist(integer(s.maxAbsoluteFret)&&s.maxAbsoluteFret>=s.capo&&s.maxAbsoluteFret<=36,'invalid-form-fret-bound');
        insist(Array.isArray(s.strings)&&s.strings.length===6,'invalid-form-strings');
        s.strings.forEach(function(n,i){
            formKeys(n,['string','kind'].concat(n.kind==='muted'?[]:['relativeFret','finger','fingeringWarning']));
            insist(n.string===i+1,'invalid-form-string-order');
            if(n.kind==='muted')return;
            insist(n.kind==='note'&&integer(n.relativeFret)&&n.relativeFret>=0&&n.relativeFret+s.capo<=s.maxAbsoluteFret,'invalid-form-note');
            insist([null,1,2,3,4,'T'].includes(n.finger)&&typeof n.fingeringWarning==='boolean','invalid-form-finger');
        });
        insist(s.strings.some(function(n){return n.kind==='note';})&&Array.isArray(s.barres),'invalid-form-barres');
        var claims=new Set();s.barres.forEach(function(b){
            formKeys(b,['finger','relativeFret','fromString','toString']);
            insist([1,2,3,4,'1','2','3','4'].includes(b.finger)&&integer(b.relativeFret)&&b.relativeFret>0&&b.relativeFret+s.capo<=s.maxAbsoluteFret&&integer(b.fromString)&&integer(b.toString)&&b.fromString>=1&&b.toString<=6&&b.fromString<b.toString,'invalid-form-barre');
            var key=JSON.stringify([String(b.finger),b.relativeFret,b.fromString,b.toString]);insist(!claims.has(key),'duplicate-form-barre');claims.add(key);
            [b.fromString,b.toString].forEach(function(i){var n=s.strings[i-1];insist(n.kind==='note'&&n.relativeFret===b.relativeFret&&String(n.finger)===String(b.finger),'invalid-form-barre-end');});
            insist(!s.strings.some(function(n){return n.kind==='note'&&n.string>b.fromString&&n.string<b.toString&&(n.relativeFret<b.relativeFret||String(n.finger)===String(b.finger)&&n.relativeFret!==b.relativeFret);}), 'invalid-form-barre-interior');
        });
        insist([null,'standard','advanced','limited','unknown'].includes(s.playability)&&(s.ownerWarning===null||typeof s.ownerWarning==='string'),'invalid-form-playability');
        var v=m.provenance;formKeys(v,['origin','ownerApp','ownerVersion','adapterVersion','sourceSymbol','shape','recommendationSource','generation','externalMaterialId']);
        insist(v.origin==='owner-recommendation'&&v.ownerApp==='chord-cruise'&&typeof v.ownerVersion==='string'&&/^\d+\.\d+\.\d+$/.test(v.ownerVersion)&&v.adapterVersion==='2','invalid-form-owner');
        insist(typeof v.sourceSymbol==='string'&&v.sourceSymbol.length>0&&v.sourceSymbol.length<=64&&['C','A','G','E','D'].includes(v.shape)&&['common','recommended'].includes(v.recommendationSource)&&v.externalMaterialId===null,'invalid-form-provenance');
        formKeys(v.generation,['minRelativeFret','maxRelativeFret']);var g=v.generation;
        insist(integer(g.minRelativeFret)&&integer(g.maxRelativeFret)&&g.minRelativeFret>=0&&g.maxRelativeFret>=g.minRelativeFret&&g.maxRelativeFret+s.capo<=s.maxAbsoluteFret,'invalid-form-generation');
        insist(s.strings.every(function(n){return n.kind==='muted'||n.relativeFret>=g.minRelativeFret&&n.relativeFret<=g.maxRelativeFret;}),'form-outside-generation');
    }
    function settings(value){
        keys(value,['showChords','showLyrics','showDoremi','showStrum','barsPerLine','paperSize','showTimingGrid','timingGridResolution','extensions']);
        ['showChords','showLyrics','showDoremi','showStrum'].forEach(function(k){insist(typeof value[k]==='boolean','invalid-setting:'+k);});
        insist(integer(value.barsPerLine)&&value.barsPerLine>=1&&value.barsPerLine<=16&&value.paperSize==='A4','invalid-paper-setting');
        if(value.showTimingGrid!==undefined)insist(typeof value.showTimingGrid==='boolean','invalid-grid-visibility');
        if(value.timingGridResolution!==undefined)insist([8,16].includes(value.timingGridResolution),'invalid-grid-resolution');
    }
    function arrangement(value){
        keys(value,['guitar','bass','drums','midiExport','extensions']);
        keys(value.guitar,['enabled','strumPatternId']);insist(typeof value.guitar.enabled==='boolean'&&(value.guitar.strumPatternId===null||typeof value.guitar.strumPatternId==='string'),'invalid-guitar-arrangement');
        ['bass','drums'].forEach(function(k){keys(value[k],['enabled','style']);insist(typeof value[k].enabled==='boolean'&&typeof value[k].style==='string','invalid-arrangement:'+k);});
        keys(value.midiExport,['format','includeClick']);insist([0,1].includes(value.midiExport.format)&&typeof value.midiExport.includeClick==='boolean','invalid-midi-setting');
    }
    function create(options){
        var theory=options.theory, spelling=options.spelling, legacy=options.legacy, scales=new Map(), legacyNotes=new WeakMap(), legacyChords=new WeakMap(), legacyBarIds=new WeakMap(), replacementBars=new WeakSet(), boundLegacyBars=new WeakSet(), legacyBars=new WeakSet();
        function scaleNotes(key){if(!scales.has(key)){if(scales.size>=32)scales.delete(scales.keys().next().value);scales.set(key,spelling.spellScaleNotes({tonicPc:theory.keyToSemitone(key),tonicName:key,scaleId:'major'}));}return scales.get(key);}
        function id(){var value=options.idFactory&&options.idFactory();insist(typeof value==='string'&&value.length>0,'secure-id-unavailable');return value;}
        function mid(ev,key,capo){
            insist(integer(ev.step)&&ev.step>=0&&ev.step<7&&integer(ev.alter)&&integer(ev.octave),'invalid-legacy-pitch');
            var n=theory.melodyEventToMidiNote(ev,key,capo);insist(integer(n)&&n>=0&&n<=127,'invalid-legacy-midi');return n;
        }
        function spelled(n,degree,key,alter){
            var scale=scaleNotes(key), note=scale[degree];
            insist(note,'invalid-spelling');var a=note.accidental+alter, o=(n-NAT[note.letter]-a)/12-1;
            var p={step:note.letter,alter:a,octave:o};insist(pitchMidi(p)===n&&n>=0&&n<=127,'unresolved-spelling');return p;
        }
        function chord(symbol,delta){
            var parsed=theory.parseBasicChordSymbol(symbol);
            if(!parsed)return null;
            var match=/^([A-G](?:#|b|♯|♭)?)(.*?)(?:\/([A-G](?:#|b|♯|♭)?))?$/.exec(symbol);
            if(!match)return null;
            if(delta===0)return symbol;
            return theory.transposeNote(match[1],delta)+match[2]+(match[3]?'/'+theory.transposeNote(match[3],delta):'');
        }
        function validate(p){
            try{
                jsonValue(p,0,new Set());
                keys(p,['schemaVersion','appVersion','projectId','createdAt','updatedAt','songInfo','sections','bars','instrument','solfege','materials','performance','notation','provenance','extensions']);
                insist(p.schemaVersion===2,'unsupported-schema');
                ['projectId','appVersion','createdAt','updatedAt'].forEach(function(k){insist(typeof p[k]==='string'&&p[k].length>0,'invalid-'+k);});
                insist(JSON.stringify(p).length*2<=MAX_BYTES,'project-budget');
                var ids=new Set();function unique(x){insist(typeof x==='string'&&x.length>0&&!ids.has(x),'duplicate-or-invalid-id');ids.add(x);}
                unique(p.projectId);keys(p.songInfo,['title','artist','originalKey','bpm','timeSignature','ticksPerBeat']);
                var si=p.songInfo;insist(typeof si.title==='string'&&typeof si.artist==='string'&&theory.keyToSemitone(si.originalKey)!==null,'invalid-song');
                keys(si.timeSignature,['beats','beatUnit']);insist(si.timeSignature.beats===4&&si.timeSignature.beatUnit===4&&si.ticksPerBeat===480,'unsupported-meter');
                insist(Number.isFinite(si.bpm)&&si.bpm>=20&&si.bpm<=400,'invalid-bpm');
                keys(p.instrument,['capo','tuning','stringOrder','maxAbsoluteFret']);insist(integer(p.instrument.capo)&&p.instrument.capo>=0&&p.instrument.capo<=11,'invalid-capo');
                insist((p.instrument.tuning===null||standardTuning(p.instrument.tuning))&&p.instrument.stringOrder==='high-to-low','unsupported-instrument');
                if(p.instrument.maxAbsoluteFret!==undefined)insist(integer(p.instrument.maxAbsoluteFret)&&p.instrument.maxAbsoluteFret>=p.instrument.capo&&p.instrument.maxAbsoluteFret<=36,'invalid-instrument-fret-bound');
                keys(p.solfege,['tonic','scale']);insist(p.solfege.scale==='major'&&pitchMidi(p.solfege.tonic)!==null,'invalid-solfege');
                keys(p.solfege.tonic,['step','alter','octave']);
                insist(Array.isArray(p.sections)&&p.sections.length>0&&Array.isArray(p.bars)&&p.bars.length<=2048,'invalid-structure');
                var sections=new Set();p.sections.forEach(function(s){keys(s,['id','name','lyricsHidden']);unique(s.id);sections.add(s.id);insist(typeof s.name==='string'&&typeof s.lyricsHidden==='boolean','invalid-section');});
                keys(p.materials,['forms','rhythms']);insist(Array.isArray(p.materials.forms)&&Array.isArray(p.materials.rhythms),'unsupported-material');
                var forms=new Set();p.materials.forms.forEach(function(m){formMaterial(m);unique(m.id);forms.add(m.id);});
                var chordIds=new Set();var materials=new Set(),legacyAliases=new Set();p.materials.rhythms.forEach(function(m){
                    keys(m,['id','encoding','snapshot','provenance']);unique(m.id);materials.add(m.id);insist(m.encoding==='studio-strum-v1','unsupported-rhythm-encoding');
                    keys(m.snapshot,['name','lengthTicks','slots']);insist(typeof m.snapshot.name==='string'&&m.snapshot.lengthTicks===1920&&Array.isArray(m.snapshot.slots),'invalid-rhythm');
                    var last=-1;m.snapshot.slots.forEach(function(e){keys(e,['id','tick','action','accent','durationTicks','tieToNext']);unique(e.id);insist(integer(e.tick)&&e.tick>last&&e.tick<1920&&e.tick>=0,'invalid-stroke-onset');last=e.tick;
                        insist(['down','up','mute','rest'].includes(e.action),'invalid-stroke-kind');if(e.durationTicks!==undefined)insist(integer(e.durationTicks)&&e.durationTicks>0&&e.tick+e.durationTicks<=1920,'invalid-stroke-duration');
                        ['accent','tieToNext'].forEach(function(k){if(e[k]!==undefined)insist(typeof e[k]==='boolean','invalid-stroke-flag');});});
                    keys(m.provenance,['origin','legacyId']);var alias=m.provenance.legacyId||m.id;insist(!legacyAliases.has(alias),'duplicate-rhythm-alias');legacyAliases.add(alias);if(m.provenance.legacyId!==undefined)insist(typeof m.provenance.legacyId==='string'&&m.provenance.legacyId.length>0,'invalid-legacy-rhythm-id');insist(ORIGINS.includes(m.provenance.origin),'invalid-material-provenance');
                });
                var bars=new Set();p.bars.forEach(function(b){
                    keys(b,['id','sectionId','melody','chords','lyrics']);unique(b.id);bars.add(b.id);insist(sections.has(b.sectionId),'missing-section');
                    ['melody','chords','lyrics'].forEach(function(k){insist(Array.isArray(b[k]),'invalid-events');});
                    var end=0;b.melody.slice().sort(function(a,z){return a.onsetTick-z.onsetTick;}).forEach(function(e){
                        keys(e,['id','kind','onsetTick','durationTicks','pitch','provenance']);unique(e.id);
                        insist(['note','rest'].includes(e.kind)&&integer(e.onsetTick)&&integer(e.durationTicks)&&e.onsetTick>=end&&e.onsetTick>=0&&e.durationTicks>0&&e.onsetTick+e.durationTicks<=1920,'invalid-melody-time');
                        end=e.onsetTick+e.durationTicks;checkTiming(e.provenance);
                        if(e.kind==='note'){keys(e.pitch,['step','alter','octave']);var n=pitchMidi(e.pitch);insist(integer(n)&&n>=0&&n<=127,'invalid-pitch');}
                        else insist(!Object.hasOwn(e,'pitch'),'rest-has-pitch');
                    });
                    b.chords.forEach(function(e){keys(e,['id','onsetTick','durationTicks','symbol','unresolved','provenance']);unique(e.id);chordIds.add(e.id);insist(integer(e.onsetTick)&&e.onsetTick>=0&&e.onsetTick<1920,'invalid-chord-time');
                        if(e.durationTicks!==undefined)insist(integer(e.durationTicks)&&e.durationTicks>0&&e.onsetTick+e.durationTicks<=1920,'invalid-chord-duration');
                        insist(typeof e.symbol==='string'&&typeof e.unresolved==='boolean','invalid-chord');keys(e.provenance,['origin','sourceBasis']);insist(ORIGINS.includes(e.provenance.origin),'invalid-chord-origin');if(e.provenance.sourceBasis){keys(e.provenance.sourceBasis,['playKey','capo']);insist(theory.keyToSemitone(e.provenance.sourceBasis.playKey)!==null&&integer(e.provenance.sourceBasis.capo)&&e.provenance.sourceBasis.capo>=0&&e.provenance.sourceBasis.capo<=11,'invalid-chord-basis');}
                        if(e.unresolved)insist(object(e.provenance.sourceBasis)&&integer(e.provenance.sourceBasis.capo),'unresolved-basis');
                    });
                    b.lyrics.forEach(function(e){keys(e,['id','onsetTick','text','provenance']);unique(e.id);insist(integer(e.onsetTick)&&e.onsetTick>=0&&e.onsetTick<1920&&typeof e.text==='string','invalid-lyric');keys(e.provenance,['origin']);insist(ORIGINS.includes(e.provenance.origin),'invalid-lyric-origin');});
                });
                keys(p.performance,['basicRhythmId','barRhythms','formBindings','strokeOverrides','arrangement']);
                insist(materials.has(p.performance.basicRhythmId)&&Array.isArray(p.performance.barRhythms),'missing-rhythm');
                insist(Array.isArray(p.performance.formBindings)&&Array.isArray(p.performance.strokeOverrides)&&!p.performance.strokeOverrides.length,'unsupported-performance');
                var formTargets=new Set();p.performance.formBindings.forEach(function(b){
                    formKeys(b,['id','chordEventId','materialId','playedStrings','mode','confirmation']);unique(b.id);
                    insist(chordIds.has(b.chordEventId)&&forms.has(b.materialId)&&!formTargets.has(b.chordEventId),'invalid-form-binding-reference');formTargets.add(b.chordEventId);
                    insist(b.mode==='fixed','unsupported-form-mode');var m=p.materials.forms.find(function(m){return m.id===b.materialId;});
                    insist(Array.isArray(b.playedStrings)&&b.playedStrings.length>0&&new Set(b.playedStrings).size===b.playedStrings.length&&b.playedStrings.every(function(i){return integer(i)&&i>=1&&i<=6&&m.snapshot.strings[i-1].kind==='note';}),'invalid-form-played-strings');
                    formKeys(b.confirmation,['status','basisKey']);insist(['confirmed','unconfirmed'].includes(b.confirmation.status)&&(b.confirmation.basisKey===null||typeof b.confirmation.basisKey==='string'&&b.confirmation.basisKey.length>0)&& (b.confirmation.status!=='confirmed'||typeof b.confirmation.basisKey==='string'),'invalid-form-confirmation');
                });
                var bindings=new Set();p.performance.barRhythms.forEach(function(b){keys(b,['id','barId','materialId']);unique(b.id);insist(bars.has(b.barId)&&materials.has(b.materialId)&&!bindings.has(b.barId),'invalid-rhythm-binding');bindings.add(b.barId);});
                arrangement(p.performance.arrangement);
                keys(p.notation,['settings','lineBreakAfter']);insist(object(p.notation.settings)&&Array.isArray(p.notation.lineBreakAfter)&&new Set(p.notation.lineBreakAfter).size===p.notation.lineBreakAfter.length&&p.notation.lineBreakAfter.every(function(x){return bars.has(x);}), 'invalid-notation');
                settings(p.notation.settings);
                keys(p.provenance,['migrationVersion','legacySource','legacyPitchBasis']);
                insist(p.provenance.migrationVersion==='studio-schema2-m1','unsupported-migration');
                keys(p.provenance.legacyPitchBasis,['playKey','originalKey','capo']);insist(theory.keyToSemitone(p.provenance.legacyPitchBasis.playKey)!==null&&theory.keyToSemitone(p.provenance.legacyPitchBasis.originalKey)!==null&&integer(p.provenance.legacyPitchBasis.capo)&&p.provenance.legacyPitchBasis.capo>=0&&p.provenance.legacyPitchBasis.capo<=11,'invalid-legacy-basis');
                if(p.provenance.legacySource!==undefined){keys(p.provenance.legacySource,['raw','migrationVersion']);insist(typeof p.provenance.legacySource.raw==='string'&&p.provenance.legacySource.migrationVersion==='studio-schema2-m1','invalid-legacy-source');insist(JSON.parse(p.provenance.legacySource.raw)?.schemaVersion===1,'invalid-legacy-source-schema');}
                return {ok:true,errors:[],warnings:[]};
            }catch(e){return {ok:false,errors:[e.message],warnings:[]};}
        }
        function migration(p,raw,newProject){
            try{
                assertJson(p);
                if(p.schemaVersion===2){var c=validate(p);insist(c.ok,c.errors.join('/'));return {ok:true,project:copy(p),migrated:false};}
                insist(p && p.schemaVersion===1,'unsupported-schema');jsonValue(p,0,new Set());
                keys(p,['schemaVersion','appVersion','projectId','createdAt','updatedAt','songInfo','sections','bars','strumPatterns','basicStrumPatternId','sheetSettings','arrangement']);
                insist(legacy.validateProject(p).ok,'invalid-legacy-project');
                if(p.songInfo?.timeSignature?.beats!==4||p.songInfo?.timeSignature?.beatUnit!==4||p.songInfo?.ticksPerBeat!==480)return {ok:true,project:copy(p),migrated:false,compatibility:'schema1-unsupported-meter'};
                keys(p,['schemaVersion','appVersion','projectId','createdAt','updatedAt','songInfo','sections','bars','strumPatterns','basicStrumPatternId','sheetSettings','arrangement']);
                keys(p.songInfo,['title','artist','originalKey','playKey','capo','bpm','timeSignature','ticksPerBeat']);
                insist(legacy.validateProject(p).ok,'invalid-legacy-project');
                insist(typeof raw==='string'&&same(JSON.parse(raw),p),'raw-source-mismatch');
                var si=p.songInfo;insist(integer(si.capo),'invalid-legacy-capo');
                var ids=new Set([p.projectId]);p.sections.forEach(function(s){insist(!ids.has(s.id),'duplicate-section');ids.add(s.id);});
                function next(kind,pos){var n=newProject?id():'m1:'+encodeURIComponent(p.projectId)+':'+kind+':'+pos;insist(!ids.has(n),'id-collision');ids.add(n);return n;}
                // Inconsistent keys cannot establish safe letter spelling. Keep the explicit v1 path.
                if(!theory.isKeyRelationConsistent(si.playKey,si.capo,si.originalKey))return {ok:true,project:copy(p),migrated:false,compatibility:'schema1-inconsistent-key'};
                var tonicMidi=60+theory.keyToSemitone(si.playKey)+si.capo;
                var tonic=spelled(tonicMidi,0,si.originalKey,0), materials=[], patterns=new Map();
                p.strumPatterns.forEach(function(m,mi){keys(m,['id','name','lengthTicks','slots']);insist(!patterns.has(m.id),'duplicate-legacy-rhythm-id');m.slots.forEach(function(e){keys(e,['tick','action','accent','durationTicks','tieToNext']);});var materialId=next('rhythm',mi);patterns.set(m.id,materialId);
                    var snap=copy(m);delete snap.id;snap.slots.forEach(function(e,ei){e.id=next('pattern-event',mi+':'+ei);});
                    materials.push({id:materialId,encoding:'studio-strum-v1',snapshot:snap,provenance:{origin:newProject?'auto-assigned':'legacy-unknown',legacyId:m.id}});});
                var sectionMap=new Map();p.sections.forEach(function(s){sectionMap.set(s.id,newProject?next('section',s.id):s.id);});
                var binds=[],breaks=[];
                var bars=p.bars.map(function(b,bi){
                    keys(b,['barNumber','sectionId','melody','chords','lyrics','strumOverride','lineBreakAfter']);var barId=next('bar',bi);
                    if(b.lineBreakAfter)breaks.push(barId);
                    if(b.strumOverride)binds.push({id:next('rhythm-instance',bi),barId:barId,materialId:patterns.get(b.strumOverride)});
                    return {id:barId,sectionId:sectionMap.get(b.sectionId),
                        melody:b.melody.map(function(e,ei){keys(e,['tick','durationTicks','step','alter','octave']);var n=mid(e,si.playKey,si.capo), pitch=spelled(n,e.step,si.originalKey,e.alter);insist(pitchMidi(pitch)===n,'midi-changed');return {id:next('melody',bi+':'+ei),kind:'note',onsetTick:e.tick,durationTicks:e.durationTicks,pitch:pitch,provenance:timing(newProject?'auto-assigned':'legacy-unknown',false)};}),
                        chords:b.chords.map(function(e,ei){keys(e,['tick','durationTicks','symbol']);var symbol=chord(e.symbol,si.capo), out={id:next('chord',bi+':'+ei),onsetTick:e.tick,symbol:symbol===null?e.symbol:symbol,unresolved:symbol===null,provenance:{origin:'legacy-unknown',sourceBasis:{playKey:si.playKey,capo:si.capo}}};if(e.durationTicks!==undefined)out.durationTicks=e.durationTicks;return out;}),
                        lyrics:b.lyrics.map(function(e,ei){keys(e,['tick','text']);return {id:next('lyric',bi+':'+ei),onsetTick:e.tick,text:e.text,provenance:{origin:'legacy-unknown'}};})};
                });
                var info=copy(si);delete info.playKey;delete info.capo;
                var result={schemaVersion:2,appVersion:p.appVersion,projectId:p.projectId,createdAt:p.createdAt,updatedAt:p.updatedAt,songInfo:info,sections:p.sections.map(function(s){return Object.assign({},s,{id:sectionMap.get(s.id)});}),bars:bars,
                    instrument:{capo:si.capo,tuning:null,stringOrder:'high-to-low'},solfege:{tonic:tonic,scale:'major'},materials:{forms:[],rhythms:materials},
                    performance:{basicRhythmId:patterns.get(p.basicStrumPatternId),barRhythms:binds,formBindings:[],strokeOverrides:[],arrangement:copy(p.arrangement)},
                    notation:{settings:copy(p.sheetSettings),lineBreakAfter:breaks},provenance:{migrationVersion:'studio-schema2-m1',legacyPitchBasis:{playKey:si.playKey,originalKey:si.originalKey,capo:si.capo}}};
                if(!newProject)result.provenance.legacySource={raw:raw,migrationVersion:'studio-schema2-m1'};
                var v=validate(result);insist(v.ok,v.errors.join('/'));return {ok:true,project:result,migrated:!newProject};
            }catch(e){return {ok:false,project:null,error:e.message};}
        }
        function readProjection(p, legacyPitch){
            if(p.schemaVersion===1)return p;
            var check=validate(p);
            if(!check.ok)throw Object.assign(new Error(check.errors.join('/')), {code:'invalid-project', diagnostics:check.errors.slice()});
            var si=copy(p.songInfo), capo=p.instrument.capo, tonic=pitchMidi(p.solfege.tonic), inputKey=p.solfege.tonic.step+spelling.formatAccidental(p.solfege.tonic.alter), playKey=theory.transposeNote(inputKey,-capo);
            insist(playKey!==null,'unsupported-input-tonic');
            var soundScale=scaleNotes(inputKey);
            si.playKey=playKey;si.capo=capo;
            var base=legacyPitch?60+theory.keyToSemitone(playKey)+capo:tonic;
            var aliases=new Map(p.materials.rhythms.map(function(m){return [m.id,m.provenance.legacyId||m.id];})), materialMap=new Map(), strums=p.materials.rhythms.map(function(m){var a=copy(m.snapshot);a.id=aliases.get(m.id);a.slots.forEach(function(s){delete s.id;});materialMap.set(m.id,a);return a;});
            var projection={schemaVersion:1,appVersion:p.appVersion,projectId:p.projectId,createdAt:p.createdAt,updatedAt:p.updatedAt,songInfo:si,sections:copy(p.sections),
                bars:p.bars.map(function(b,bi){return {barNumber:bi+1,sectionId:b.sectionId,chords:b.chords.map(function(e){var v={tick:e.onsetTick,symbol:e.unresolved?e.symbol:chord(e.symbol,-capo)};if(e.durationTicks!==undefined)v.durationTicks=e.durationTicks;return v;}),lyrics:b.lyrics.map(function(e){return {tick:e.onsetTick,text:e.text};}),
                    melody:b.melody.filter(function(e){return e.kind==='note';}).map(function(e){
                        var step=soundScale.findIndex(function(n){return n.letter===e.pitch.step;}), alter=e.pitch.alter-soundScale[step].accidental;
                        var octave=(pitchMidi(e.pitch)-base-SCALE[step]-alter)/12;
                        insist(integer(octave),'unresolved-solfege-projection');
                        return {tick:e.onsetTick,durationTicks:e.durationTicks,step:step,alter:alter,octave:octave};
                    }),strumOverride:p.performance.barRhythms.find(function(x){return x.barId===b.id;})? aliases.get(p.performance.barRhythms.find(function(x){return x.barId===b.id;}).materialId):null,lineBreakAfter:p.notation.lineBreakAfter.includes(b.id)};}),
                strumPatterns:strums,basicStrumPatternId:aliases.get(p.performance.basicRhythmId),sheetSettings:copy(p.notation.settings),arrangement:copy(p.performance.arrangement)};
            projection.bars.forEach(function(bar,i){Object.defineProperty(bar,'sourceId',{value:p.bars[i].id});});
            Object.defineProperty(projection,'sourceSchemaVersion',{value:2});return projection;
        }
        function reconcileDoremi(bar, events, parsed) {
            insist(legacyBars.has(bar),'ambiguous-melody-mapping');
            // Syntax errors precede count/extension intent, including the first empty-voice entry.
            insist(!parsed.warnings.length,parsed.warnings.join(' / '));
            if (!bar.melody.length) return; // First entry into an empty voice remains an explicit creation.
            insist(events.length===bar.melody.length && parsed.notes.length===events.length,'音数変更には明示操作が必要です');
            var ids=new Set(), end=-1;
            bar.melody.forEach(function(previous,index){
                var eventId=legacyNotes.get(previous);
                insist(eventId && !ids.has(eventId) && previous.tick>=end,'ambiguous-melody-mapping');
                // Bare solfege is pitch-only in an existing v2 voice. Explicit extensions
                // are safe only when the parser's exact duration already matches the note.
                // Display rounding (e.g. 180 ticks -> ド〜) is never a timing authority.
                insist(parsed.notes[index].extensions===0 || events[index].durationTicks===previous.durationTicks,'伸ばし記号の再配置には明示操作が必要です');
                ids.add(eventId);end=previous.tick+previous.durationTicks;
                legacyNotes.set(events[index],eventId);
            });
        }
        function editLegacy(project, edit) {
            if(project.schemaVersion===1)return edit(project);
            var before=readProjection(project), view=copy(before);
            view.bars.forEach(function(b,i){
                var canonical=project.bars[i],notes=canonical.melody.filter(function(e){return e.kind==='note';});
                Object.defineProperty(b,'sourceId',{value:canonical.id});legacyBars.add(b);legacyBarIds.set(b,canonical.id);if(project.performance.formBindings.some(function(x){return canonical.chords.some(function(e){return e.id===x.chordEventId;});}))boundLegacyBars.add(b);
                b.chords.forEach(function(e,j){legacyChords.set(e,canonical.chords[j].id);});
                b.melody.forEach(function(e,j){legacyNotes.set(e,notes[j].id);});
            });
            var outcome=edit(view);
            // sourceId is an internal non-enumerable bar mapping, never serialized.
            Object.keys(view).forEach(function(k){
                if(k==='bars')view.bars.forEach(function(b){Object.keys(b).forEach(function(field){assertJson(b[field]);});});
                else assertJson(view[k]);
            });
            if(same(before,view)&&view.bars.every(function(b,i){return legacyBarIds.get(b)===project.bars[i].id&&b.chords.every(function(e,j){return legacyChords.get(e)===project.bars[i].chords[j].id;});}))return outcome;
            // The legacy form editor changes representation, never the canonical sound by implication.
            var si=view.songInfo;
            if(si.playKey!==before.songInfo.playKey || si.capo!==before.songInfo.capo)throw Error('schema 2のキー・カポ変更は実音保持の明示操作が必要です。M1では変更を適用していません');
            if(!same(si.timeSignature,before.songInfo.timeSignature))throw Error('schema 2の拍子変更は未対応です。変更は適用していません');
            var canonicalInfo=copy(project.songInfo);canonicalInfo.title=si.title;canonicalInfo.artist=si.artist;canonicalInfo.bpm=si.bpm;canonicalInfo.originalKey=si.originalKey;
            // Translate only changed legacy collections. Unchanged pitch/timing is never re-parsed.
            var patterns=new Map(), oldMaterials=new Map(project.materials.rhythms.map(function(m){return [m.provenance.legacyId||m.id,m];}));
            var materials=view.strumPatterns.map(function(p){var old=oldMaterials.get(p.id), snap=copy(p);delete snap.id;
                var existing=old?old.snapshot:null;
                snap.slots.forEach(function(e,i){e.id=existing&&existing.slots[i]&&existing.slots[i].tick===e.tick?existing.slots[i].id:id();});
                var unchanged=old&&same(existing,snap);var m={id:unchanged?old.id:id(),encoding:'studio-strum-v1',snapshot:snap,provenance:old?copy(old.provenance):{origin:'user-set',legacyId:p.id}};patterns.set(p.id,m.id);return m;});
            var oldChords=new Map(),usedChords=new Set();project.bars.forEach(function(b){b.chords.forEach(function(e){oldChords.set(e.id,e);});});
            var retainedChords=new Set();view.bars.forEach(function(b){b.chords.forEach(function(e){var source=legacyChords.get(e);if(source)retainedChords.add(source);});});
            var bindings=[],breaks=[],bars=view.bars.map(function(b,bi){
                var old=project.bars.find(function(o){return o.id===legacyBarIds.get(b);}), prior=old?before.bars[project.bars.indexOf(old)]:null;
                var out=old?copy(old):{id:id(),sectionId:b.sectionId,melody:[],chords:[],lyrics:[]};out.sectionId=b.sectionId;
                if(!prior||!same(prior.chords,b.chords)||!b.chords.every(function(e,i){return legacyChords.get(e)===old.chords[i].id;})){
                    // Identity comes from this edit view's object mapping, never array position or symbol.
                    if(old&&!replacementBars.has(b)&&b.chords.some(function(e){return !legacyChords.has(e);})&&old.chords.some(function(e){return !retainedChords.has(e.id);}))insist(false,'ambiguous-chord-mapping');
                    out.chords=b.chords.map(function(e){var source=legacyChords.get(e),prev=source&&oldChords.get(source);insist(!source||prev&&!usedChords.has(source),'ambiguous-chord-mapping');if(source)usedChords.add(source);
                        var symbol=chord(e.symbol,si.capo),a={id:prev?prev.id:id(),onsetTick:e.tick,symbol:symbol===null?e.symbol:symbol,unresolved:symbol===null,provenance:prev&&e.symbol===(prev.unresolved?prev.symbol:chord(prev.symbol,-si.capo))?copy(prev.provenance):{origin:'user-set',sourceBasis:{playKey:si.playKey,capo:si.capo}}};if(e.durationTicks!==undefined)a.durationTicks=e.durationTicks;return a;});
                }else out.chords.forEach(function(e){insist(!usedChords.has(e.id),'ambiguous-chord-mapping');usedChords.add(e.id);});
                if(!prior||!same(prior.lyrics,b.lyrics))out.lyrics=b.lyrics.map(function(e){var prev=old&&old.lyrics.find(function(x){return x.onsetTick===e.tick;});return {id:prev?prev.id:id(),onsetTick:e.tick,text:e.text,provenance:{origin:'user-set'}};});
                if(!prior||!same(prior.melody,b.melody)){
                    if (old && old.melody.length) {
                        var notes=old.melody.filter(function(e){return e.kind==='note';}), byId=new Map(notes.map(function(e){return [e.id,e];})), used=new Set(), last=-1;
                        insist(notes.length===b.melody.length,'音数変更には明示操作が必要です');
                        var pitches=new Map();
                        b.melody.forEach(function(e){
                            var sourceId=legacyNotes.get(e), prev=byId.get(sourceId);
                            insist(prev && !used.has(sourceId) && prev.onsetTick>=last,'ambiguous-melody-mapping');
                            used.add(sourceId);last=prev.onsetTick+prev.durationTicks;
                            var inputKey=project.solfege.tonic.step+spelling.formatAccidental(project.solfege.tonic.alter);
                            insist(integer(e.step)&&e.step>=0&&e.step<7&&integer(e.alter)&&integer(e.octave),'invalid-solfege');
                            pitches.set(sourceId,spelled(pitchMidi(project.solfege.tonic)+SCALE[e.step]+e.alter+12*e.octave,e.step,inputKey,e.alter));
                        });
                        // Preserve the exact original event order, rests, gaps, time and provenance.
                        out.melody=old.melody.map(function(e){var result=copy(e);if(pitches.has(e.id))result.pitch=pitches.get(e.id);return result;});
                    } else {
                        out.melody=b.melody.map(function(e){
                            var inputKey=project.solfege.tonic.step+spelling.formatAccidental(project.solfege.tonic.alter);
                            insist(integer(e.step)&&e.step>=0&&e.step<7&&integer(e.alter)&&integer(e.octave),'invalid-solfege');
                            return {id:id(),kind:'note',onsetTick:e.tick,durationTicks:e.durationTicks,pitch:spelled(pitchMidi(project.solfege.tonic)+SCALE[e.step]+e.alter+12*e.octave,e.step,inputKey,e.alter),provenance:timing('auto-assigned',false)};
                        });
                    }
                }
                if(b.strumOverride){var prevBinding=old&&project.performance.barRhythms.find(function(x){return x.barId===old.id;});bindings.push({id:prevBinding?prevBinding.id:id(),barId:out.id,materialId:patterns.get(b.strumOverride)});}
                if(b.lineBreakAfter)breaks.push(out.id);return out;
            });
            var next=copy(project);next.songInfo=canonicalInfo;var oldSections=new Set(project.sections.map(function(s){return s.id;})),newSectionIds=new Map();
            next.sections=view.sections.map(function(s){var mapped=oldSections.has(s.id)?s.id:id();newSectionIds.set(s.id,mapped);return Object.assign({},s,{id:mapped});});bars.forEach(function(b){b.sectionId=newSectionIds.get(b.sectionId);});next.bars=bars;next.instrument.capo=si.capo;
            next.materials.rhythms=materials.filter(function(m){return !(m.provenance.legacyId||'').startsWith('strum_bar_') || m.id===patterns.get(view.basicStrumPatternId) || bindings.some(function(b){return b.materialId===m.id;});});next.performance.basicRhythmId=patterns.get(view.basicStrumPatternId);next.performance.barRhythms=bindings;
            var liveChords=new Set();next.bars.forEach(function(b){b.chords.forEach(function(e){liveChords.add(e.id);});});next.performance.formBindings=next.performance.formBindings.filter(function(b){return liveChords.has(b.chordEventId);});
            next.performance.arrangement=copy(view.arrangement);next.notation={settings:copy(view.sheetSettings),lineBreakAfter:breaks};
            var check=validate(next);insist(check.ok,check.errors.join('/'));
            Object.keys(project).forEach(function(k){if(!Object.hasOwn(next,k))delete project[k];});Object.keys(next).forEach(function(k){project[k]=next[k];});
            return outcome;
        }
        // Explicit canonical copy intent: retain source data, mint all destination IDs.
        function duplicateBar(project,barId){
            var check=validate(project);insist(check.ok,check.errors.join('/'));var index=project.bars.findIndex(function(b){return b.id===barId;});insist(index>=0,'missing-bar');
            var next=copy(project),source=next.bars[index],bar=copy(source),chordMap=new Map();bar.id=id();
            ['melody','lyrics','chords'].forEach(function(k){bar[k].forEach(function(e){var old=e.id;e.id=id();if(k==='chords')chordMap.set(old,e.id);});});
            next.bars.splice(index+1,0,bar);
            next.performance.formBindings=next.performance.formBindings.concat(project.performance.formBindings.filter(function(b){return chordMap.has(b.chordEventId);}).map(function(b){var result=copy(b);result.id=id();result.chordEventId=chordMap.get(b.chordEventId);result.confirmation.status='unconfirmed';return result;}));
            next.performance.barRhythms=next.performance.barRhythms.concat(project.performance.barRhythms.filter(function(b){return b.barId===barId;}).map(function(b){return {id:id(),barId:bar.id,materialId:b.materialId};}));
            if(next.notation.lineBreakAfter.includes(barId))next.notation.lineBreakAfter.push(bar.id);
            check=validate(next);insist(check.ok,check.errors.join('/'));Object.keys(next).forEach(function(k){project[k]=next[k];});return bar.id;
        }
        function reconcileChord(bar,events){if(!legacyBars.has(bar))return;if(bar.chords.length>1){insist(!boundLegacyBars.has(bar),'ambiguous-chord-mapping');replacementBars.add(bar);return;}if(bar.chords.length&&events.length){var source=legacyChords.get(bar.chords[0]);insist(source,'ambiguous-chord-mapping');legacyChords.set(events[0],source);}}
        return Object.freeze({duplicateBar:duplicateBar,reconcileChord:reconcileChord,validate:validate,migrate:migration,readProjection:readProjection,editLegacy:editLegacy,reconcileDoremi:reconcileDoremi,pitchMidi:pitchMidi,newId:id,timing:timing,chord:chord,assertJson:assertJson});
    }
    return Object.freeze({create:create,pitchMidi:pitchMidi,maxBytes:MAX_BYTES,timing:timing});
});
