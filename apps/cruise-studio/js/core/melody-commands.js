/* Session-owned, memory-only melody commands. No independent history or persistence. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CruiseStudio.melodyCommands=factory();})(typeof window==='object'?window:globalThis,function(){
    'use strict';
    var TYPES=['melody.setDuration','melody.extendNote','melody.setTie','melody.insertRest','melody.setKind','melody.delete','melody.move','melody.confirmEventTiming','melody.confirmGap','melody.confirmBarTiming'];
    var DURATIONS=[1920,1440,960,720,480,360,240,180,120];
    function clone(x){return JSON.parse(JSON.stringify(x));}
    function reject(code){return {ok:false,code:code};}
    function gaps(bar,barTicks=1920){var end=0,out=[];bar.melody.slice().sort(function(a,b){return a.onsetTick-b.onsetTick;}).forEach(function(e){if(e.onsetTick>end)out.push({onsetTick:end,durationTicks:e.onsetTick-end});end=e.onsetTick+e.durationTicks;});if(end<barTicks)out.push({onsetTick:end,durationTicks:barTicks-end});return out;}
    function extensionDuration(bar,event,barTicks=1920){
        if(event?.kind!=='note'||event.onsetTick%30)return null;
        var end=bar.melody.reduce(function(limit,other){
            return other.onsetTick>event.onsetTick?Math.min(limit,other.onsetTick):limit;
        },barTicks);
        var duration=end-event.onsetTick;
        return duration>event.durationTicks&&duration%30===0?duration:null;
    }
    function create(options){
        var owner=options.owner,schema=options.schema,issued=new WeakSet();
        function capture(barId,eventId,gap){var s=owner.getSession(),doc=owner.ticket(),ctx=options.getContext();if(!s||s.draft.schemaVersion!==2)return null;
            if(gap){try{schema.assertJson(gap);}catch(_){return null;}}
            var t=Object.freeze({projectId:s.target.projectId,sessionId:s.sessionId,documentGeneration:doc.generation,workspaceGeneration:ctx.generation,
                workspaceId:ctx.workspaceId,expectedSnapshotVersion:s.snapshotVersion,expectedBaseRevision:s.baseRevision,barId:barId,eventId:eventId??null,gap:gap?Object.freeze(clone(gap)):null});issued.add(t);return t;}
        function current(e){var s=owner.getSession(),doc=owner.ticket(),ctx=options.getContext();
            return s&&e&&issued.has(e)&&!s.destroyed&&!s.commitInFlight&&!s.inputPending&&!s.conflict&&!s.externalUpdatePending&&!ctx.blocked&&ctx.workspaceId==='sheetCruise'&&
                s.draft.schemaVersion===2&&e.projectId===s.target.projectId&&e.sessionId===s.sessionId&&e.documentGeneration===doc.generation&&
                e.workspaceId===ctx.workspaceId&&e.workspaceGeneration===ctx.generation&&e.expectedSnapshotVersion===s.snapshotVersion&&e.expectedBaseRevision===s.baseRevision;
        }
        function execute(type,envelope,payload){
            if(!TYPES.includes(type))return reject('unsupported-command');
            if(!current(envelope))return reject('stale-or-blocked-command');
            var s=owner.getSession(),revision=options.repository.readRevision(s.target);
            if(!revision.ok||revision.revision!==s.baseRevision||(!revision.exists&&s.baseRevision!==null))return reject('external-revision');
            try { schema.assertJson(payload===undefined?{}:payload);payload=clone(payload===undefined?{}:payload); } catch(_){return reject('invalid-payload');}
            function fail(code){throw Error(code);}
            return s.runOperation(type,function(p){
                if(!current(envelope))fail('stale-command');
                var bar=p.bars.find(function(b){return b.id===envelope.barId;});if(!bar)fail('missing-bar');
                var barTicks=schema.barLength(p);
                var ev=bar.melody.find(function(e){return e.id===envelope.eventId;});
                function requireEvent(){if(!ev)fail('missing-event');}
                function supported(e){if(e.onsetTick%30||e.durationTicks%30)fail('unsupported-time');}
                function rest(interval){if(!Number.isSafeInteger(interval.onsetTick)||!Number.isSafeInteger(interval.durationTicks)||interval.onsetTick%30||interval.durationTicks%30)fail('unsupported-time');
                    return {id:schema.newId(),kind:'rest',onsetTick:interval.onsetTick,durationTicks:interval.durationTicks,provenance:schema.timing('user-set',true)};}
                if(type==='melody.setDuration'){requireEvent();if(!DURATIONS.includes(payload.durationTicks))fail('unsupported-duration');ev.durationTicks=payload.durationTicks;ev.provenance.timing.duration={origin:'user-set',confirmed:true};}
                else if(type==='melody.extendNote'){
                    requireEvent();
                    var duration=extensionDuration(bar,ev,barTicks);
                    if(duration===null)fail('no-extendable-gap');
                    ev.durationTicks=duration;
                    ev.provenance.timing.duration={origin:'user-set',confirmed:true};
                }
                else if(type==='melody.setTie'){
                    requireEvent();
                    if(payload.enabled===false)delete ev.tieToNext;
                    else{
                        var next=schema.melodyTieTarget(p,p.bars.findIndex(function(b){return b.id===bar.id;}),ev);
                        if(payload.enabled!==true||!next)fail('no-tie-target');
                        ev.tieToNext=next.id;
                    }
                }
                else if(type==='melody.insertRest'){if(!DURATIONS.includes(payload.durationTicks))fail('unsupported-duration');bar.melody.push(rest(payload));}
                else if(type==='melody.setKind'){requireEvent();if(!['note','rest'].includes(payload.kind))fail('invalid-kind');if(payload.kind===ev.kind)return;
                    if(payload.kind==='note'){if(!payload.pitch||schema.pitchMidi(payload.pitch)===null)fail('explicit-pitch-required');ev.pitch=clone(payload.pitch);}else {delete ev.pitch;delete ev.tieToNext;}ev.kind=payload.kind;}
                else if(type==='melody.delete'){requireEvent();bar.melody=bar.melody.filter(function(e){return e.id!==ev.id;});}
                else if(type==='melody.move'){requireEvent();if(!Number.isSafeInteger(payload.onsetTick)||payload.onsetTick%30)fail('unsupported-onset');ev.onsetTick=payload.onsetTick;ev.provenance.timing.onset={origin:'user-set',confirmed:true};}
                else if(type==='melody.confirmEventTiming'){requireEvent();supported(ev);if(!Array.isArray(payload.attributes)||!payload.attributes.length||payload.attributes.some(function(a){return !['onset','duration'].includes(a);}))fail('invalid-attributes');payload.attributes.forEach(function(a){ev.provenance.timing[a].confirmed=true;});}
                else if(type==='melody.confirmGap'){var gap=envelope.gap;if(!gap||!gaps(bar,barTicks).some(function(x){return x.onsetTick===gap.onsetTick&&x.durationTicks===gap.durationTicks;}))fail('stale-gap');bar.melody.push(rest(gap));}
                else if(type==='melody.confirmBarTiming'){bar.melody.forEach(supported);var empty=gaps(bar,barTicks);empty.forEach(function(g){bar.melody.push(rest(g));});bar.melody.forEach(function(e){e.provenance.timing.onset.confirmed=e.provenance.timing.duration.confirmed=true;});}
                // Session validates the original staged raw once before publication and Undo reservation.
                // Validating this entire Proxy here duplicates that boundary at much greater cost.
            },{requireUndo:true});
        }
        return Object.freeze({capture:capture,execute:execute,tieTarget:schema.melodyTieTarget});
    }
    return Object.freeze({create:create,gaps:gaps,extensionDuration:extensionDuration,types:Object.freeze(TYPES)});
});
