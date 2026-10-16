/* Selection and Inspector own only UI state. All music edits use the issued M1 command. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CruiseStudio.melodyEditor=factory();})(typeof window==='object'?window:globalThis,function(){
    'use strict';
    var DURATIONS=[[1920,'全音符'],[960,'2分音符'],[480,'4分音符'],[240,'8分音符'],[120,'16分音符'],[1440,'付点2分'],[720,'付点4分'],[360,'付点8分'],[180,'付点16分']];
    function createController(o){
        var binding=null,sequence=0,own=false;
        function clear(){binding=null;}
        function identity(b){var s=o.owner.getSession(),t=o.owner.ticket(),c=o.getContext();return !!(s&&b&&s.sessionId===b.sessionId&&s.target.projectId===b.projectId&&t.generation===b.documentGeneration&&c.workspaceId==='sheetCruise'&&c.generation===b.workspaceGeneration);}
        function blocked(){var s=o.owner.getSession(),c=o.getContext();return !s||s.destroyed||s.inputPending||s.commitInFlight||s.conflict||s.externalUpdatePending||c.blocked;}
        function target(b){
            var s=o.owner.getSession();if(!identity(b))return null;
            var bar=s.draft.bars.find(function(x){return x.id===b.barId;});if(!bar)return null;
            if(b.eventId){var event=bar.melody.find(function(x){return x.id===b.eventId;});return event?{bar:bar,event:event}:null;}
            var gap=o.gaps(bar).find(function(g){return g.onsetTick===b.gap.onsetTick&&g.durationTicks===b.gap.durationTicks;});return gap?{bar:bar,gap:gap}:null;
        }
        function renew(){if(!binding||!target(binding)){clear();return;}binding.envelope=o.commands.capture(binding.barId,binding.eventId,binding.gap);binding.stale=false;}
        function select(t){
            var s=o.owner.getSession(),ticket=o.owner.ticket(),c=o.getContext(),source=t&&t.source;
            if(blocked()||!s||s.draft.schemaVersion!==2||!source||source.projectId!==s.target.projectId||source.sessionId!==s.sessionId||source.snapshotVersion!==s.snapshotVersion||source.generation!==ticket.generation||source.workspaceId!==c.workspaceId||source.workspaceGeneration!==c.generation)return {ok:false,code:'stale-selection'};
            var b={handle:Object.freeze({selectionId:++sequence}),projectId:s.target.projectId,sessionId:s.sessionId,documentGeneration:ticket.generation,workspaceGeneration:c.generation,barId:t.barId,eventId:t.eventId||null,gap:t.gap?Object.freeze({onsetTick:t.gap.onsetTick,durationTicks:t.gap.durationTicks}):null};
            if(!b.eventId&&!b.gap||!target(b))return {ok:false,code:'missing-target'};
            binding=b;renew();return {ok:true,handle:b.handle};
        }
        function view(){
            if(!binding)return null;if(!identity(binding)){clear();return null;}var value=target(binding);if(!value){clear();return null;}
            var s=o.owner.getSession(),barNumber=s.draft.bars.findIndex(function(b){return b.id===binding.barId;})+1;
            return {handle:binding.handle,barId:binding.barId,eventId:binding.eventId,barNumber:barNumber,event:value.event||null,gap:value.gap||null,bar:value.bar,
                blocked:!!blocked()||binding.stale||s.snapshotVersion!==binding.envelope.expectedSnapshotVersion,
                confirmed:o.gaps(value.bar).length===0&&value.bar.melody.every(function(e){return e.provenance.timing.onset.confirmed&&e.provenance.timing.duration.confirmed;})};
        }
        function execute(handle,type,payload){
            if(!binding||binding.handle!==handle||blocked()||binding.stale||!identity(binding))return {ok:false,code:'stale-selection'};
            var b=binding,s=o.owner.getSession(),old=target(b),ids=old?new Set(old.bar.melody.map(function(e){return e.id;})):null;
            if(!old)return {ok:false,code:'missing-target'};
            own=true;var result;
            try{result=o.commands.execute(type,b.envelope,payload);}finally{own=false;}
            if(result.ok){
                if(type==='melody.delete')clear();
                else if(b.gap&&['melody.insertRest','melody.confirmGap','melody.confirmBarTiming'].includes(type)){
                    var bar=s.draft.bars.find(function(x){return x.id===b.barId;}),created=bar&&bar.melody.find(function(e){return !ids.has(e.id)&&e.onsetTick===b.gap.onsetTick;});
                    if(created){binding=b;b.eventId=created.id;b.gap=null;renew();}else clear();
                }else{binding=b;renew();}
            }
            return result;
        }
        function changed(s,kind){
            if(!binding)return;if(!identity(binding)){clear();return;}
            if(s.sessionId!==binding.sessionId)return;
            if(['input','commit-start','commit-failure','validation'].includes(kind))return;
            if(s.inputPending){binding.stale=true;return;}
            if(['cancel','replace','external-adopt','external-pending','destroy'].includes(kind)){clear();return;}
            if(own||['undo','redo','commit-success'].includes(kind))renew();
            else if(s.snapshotVersion!==binding.envelope.expectedSnapshotVersion)binding.stale=true;
        }
        return Object.freeze({select:select,view:view,execute:execute,clear:clear,changed:changed});
    }
    function message(result){var code=result.error||result.code||'';
        if(/overlap/.test(code))return '次の音または休符に重なります。変更は適用していません。';
        if(/undo-budget/.test(code))return 'Undoの容量が不足しています。変更は適用していません。';
        if(/stale|revision|blocked|missing/.test(code))return '対象が更新されました。五線で選び直してください。変更は適用していません。';
        return '対応する音価・開始位置を指定してください。重複や小節の越境はできません。変更は適用していません。';
    }
    function mount(o){
        var C=o.C,doc=o.document,slot=doc.getElementById('sc-melody-inspector'),preview=doc.getElementById('sc-preview'),pane=slot.parentElement,uiHandle=null,nodes={},lastNode=null;
        function context(){return {workspaceId:C.shellHost.getActiveWorkspace(),generation:C.shellHost.getWorkspaceGeneration(),blocked:!!C.shellHost.modal.getActive()||C.shellHost.keyboard.isIMEBlocked({})};}
        var controller=createController({owner:C.documents,commands:C.melodyEditing,gaps:C.melodyCommands.gaps,getContext:context});
        function node(tag,text){var e=doc.createElement(tag);if(text!==undefined)e.textContent=text;return e;}
        function field(label,input){var l=node('label',label);l.appendChild(input);slot.appendChild(l);return input;}
        function button(text,fn){var b=node('button',text);b.type='button';b.className='btn-ghost';b.addEventListener('click',fn);slot.appendChild(b);return b;}
        function focusSelection(){var selected=preview.querySelector('[data-melody-target][aria-pressed="true"]');if(selected)selected.focus({preventScroll:true});else if(lastNode&&lastNode.isConnected)lastNode.focus({preventScroll:true});}
        function close(){controller.clear();uiHandle=null;slot.hidden=true;pane.removeAttribute('data-melody-editor-open');decorate();focusSelection();return true;}
        function apply(handle,type,payload){
            var result=controller.execute(handle,type,payload);refresh();
            if(!result.ok&&uiHandle===handle)nodes.error.textContent=message(result);
            if(result.ok&&type==='melody.delete'){
                var next=preview.querySelector('[data-melody-target]');if(next)next.focus({preventScroll:true});
            }
        }
        function build(v){
            uiHandle=v.handle;slot.replaceChildren();nodes={};
            nodes.heading=node('h3','メロディ Inspector');nodes.heading.tabIndex=-1;slot.appendChild(nodes.heading);
            nodes.close=button('閉じる（Esc）',close);nodes.close.classList.add('melody-editor-close');
            nodes.target=node('p');nodes.target.id='sc-melody-target';slot.appendChild(nodes.target);
            nodes.status=node('p');nodes.status.className='melody-editor-status';slot.appendChild(nodes.status);
            nodes.error=node('p');nodes.error.id='sc-melody-error';nodes.error.setAttribute('role','alert');slot.appendChild(nodes.error);
            var h=v.handle;nodes.duration=node('select');nodes.duration.id='sc-melody-duration';DURATIONS.forEach(function(d){var a=node('option',d[1]);a.value=d[0];nodes.duration.appendChild(a);});field('音価',nodes.duration);
            nodes.duration.addEventListener('change',function(){if(controller.view()?.handle!==h)return;nodes.error.textContent='';if(v.event)apply(h,'melody.setDuration',{durationTicks:Number(nodes.duration.value)});});
            if(v.gap){
                button('選んだ長さの休符を挿入',function(){apply(h,'melody.insertRest',{onsetTick:v.gap.onsetTick,durationTicks:Number(nodes.duration.value)});});
                button('空き全体を休符として確認',function(){apply(h,'melody.confirmGap',{});});
            }else{
                nodes.onset=node('input');nodes.onset.id='sc-melody-onset';nodes.onset.type='number';nodes.onset.min='0';nodes.onset.max='1890';nodes.onset.step='30';field('開始位置（tick / 480 = 1拍）',nodes.onset);
                button('開始位置を変更',function(){apply(h,'melody.move',{onsetTick:nodes.onset.value===''?null:Number(nodes.onset.value)});});
                if(v.event.kind==='note')button('休符にする',function(){apply(h,'melody.setKind',{kind:'rest'});});
                else{
                    var box=node('fieldset'),legend=node('legend','音符へ変換する実音を指定');box.appendChild(legend);slot.appendChild(box);
                    nodes.step=node('select');nodes.step.id='sc-melody-pitch-step';nodes.step.setAttribute('aria-label','実音の音名');['','C','D','E','F','G','A','B'].forEach(function(x){var a=node('option',x||'音名を選択');a.value=x;nodes.step.appendChild(a);});box.appendChild(nodes.step);
                    nodes.alter=node('select');nodes.alter.id='sc-melody-pitch-alter';nodes.alter.setAttribute('aria-label','臨時記号');[-2,-1,0,1,2].forEach(function(x){var a=node('option',String(x));a.value=x;nodes.alter.appendChild(a);});nodes.alter.value='0';box.appendChild(nodes.alter);
                    nodes.octave=node('input');nodes.octave.id='sc-melody-pitch-octave';nodes.octave.type='number';nodes.octave.min='-1';nodes.octave.max='9';nodes.octave.setAttribute('aria-label','実音octave');box.appendChild(nodes.octave);
                    button('指定した音符にする',function(){if(!nodes.step.value||nodes.octave.value===''){nodes.error.textContent='音名とoctaveを明示指定してください。変更は適用していません。';return;}apply(h,'melody.setKind',{kind:'note',pitch:{step:nodes.step.value,alter:Number(nodes.alter.value),octave:Number(nodes.octave.value)}});});
                }
                button('開始位置だけ確認',function(){apply(h,'melody.confirmEventTiming',{attributes:['onset']});});
                button('音価だけ確認',function(){apply(h,'melody.confirmEventTiming',{attributes:['duration']});});
                button('この音の時間を確認',function(){apply(h,'melody.confirmEventTiming',{attributes:['onset','duration']});});
                button('削除して空き時間に戻す',function(){apply(h,'melody.delete',{});});
            }
            button('空きを休符にして小節を確認',function(){apply(h,'melody.confirmBarTiming',{});});
            slot.appendChild(node('p','時間編集は非リップルです。後続の音は移動しません。保存は上部の「保存」から行ってください。'));
            slot.appendChild(node('p','三連符・小節またぎのタイ・五線の印刷は未対応です。五線は印刷されません。コード譜を印刷します。'));
        }
        function decorate(){var v=controller.view();preview.querySelectorAll('[data-melody-target]').forEach(function(e){var chosen=!!v&&e.dataset.barId===v.barId&&(v.eventId?e.dataset.eventId===v.eventId:e.dataset.gap===v.gap.onsetTick+':'+v.gap.durationTicks);e.setAttribute('aria-pressed',String(chosen));});}
        function refresh(){
            var v=controller.view();if(!v){var hadSelection=uiHandle!==null;slot.hidden=true;pane.removeAttribute('data-melody-editor-open');uiHandle=null;if(hadSelection)decorate();return;}
            // A note/rest conversion rebuilds only this Inspector; Loupe DOM is outside it.
            var kind=v.event?v.event.kind:'gap';if(uiHandle!==v.handle||slot.dataset.kind!==kind){build(v);slot.dataset.kind=kind;}
            slot.hidden=false;pane.dataset.melodyEditorOpen='true';var event=v.event||v.gap,t=event.onsetTick;
            nodes.target.textContent=v.barNumber+'小節目 · '+(1+t/480)+'拍目（'+t+' tick） · '+(v.event?(v.event.kind==='rest'?'休符':v.event.pitch.step+({0:'',1:'♯',2:'♯♯','-1':'♭','-2':'♭♭'}[v.event.pitch.alter])+v.event.pitch.octave+'（実音）'):'未確認の空き時間');
            function state(a){return a.confirmed?'確認済み':a.origin==='legacy-unknown'?'由来未確認':a.origin==='auto-assigned'?'自動・未確認':'手動・未確認';}
            nodes.status.textContent=v.event?'開始：'+state(v.event.provenance.timing.onset)+' / 音価：'+state(v.event.provenance.timing.duration):'空いている時間です。休符として確定するまで未確認です。';
            nodes.status.textContent+=' · 小節の時間：'+(v.confirmed?'確認済み':'未確認を含む');
            if(v.event){var current=String(v.event.durationTicks);if(!Array.from(nodes.duration.options).some(function(x){return x.value===current;})){var x=node('option','未対応の音価：'+current+' tick');x.value=current;x.disabled=true;nodes.duration.appendChild(x);}nodes.duration.value=current;if(doc.activeElement!==nodes.onset)nodes.onset.value=v.event.onsetTick;}
            else if(!nodes.duration.value||Number(nodes.duration.value)>v.gap.durationTicks)nodes.duration.value=String((DURATIONS.find(function(x){return x[0]<=v.gap.durationTicks;})||DURATIONS[DURATIONS.length-1])[0]);
            slot.querySelectorAll('button,select,input').forEach(function(e){if(e===nodes.close||e===doc.activeElement&&C.documents.getSession().inputPending)return;e.disabled=v.blocked;});decorate();
        }
        function select(t,n,enter){var result=controller.select(t);if(!result.ok)return false;lastNode=n;refresh();if(enter){nodes.heading.focus();slot.scrollIntoView({block:'nearest'});}return true;}
        function key(t,n,event){
            if(event.isComposing||event.keyCode===229||context().blocked)return;
            if(['ArrowLeft','ArrowRight','Enter',' '].includes(event.key)){
                event.preventDefault();event.stopPropagation();if(event.key==='Enter'||event.key===' '){select(t,n,true);return;}
                var list=Array.from(preview.querySelectorAll('[data-melody-target]')),at=list.indexOf(n),next=list[at+(event.key==='ArrowRight'?1:-1)];if(next){next.focus({preventScroll:true});next.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
            }
        }
        function composed(){window.setTimeout(refresh,0);}
        slot.addEventListener('compositionend',composed);
        var off=C.sessions.subscribe(function(s,kind){controller.changed(s,kind);refresh();});
        var docOff=C.documents.subscribe(function(){var v=controller.view();if(!v)refresh();});
        slot.addEventListener('keydown',function(e){if(e.key==='Escape'&&!e.isComposing&&e.keyCode!==229&&!context().blocked){e.preventDefault();e.stopPropagation();close();}});
        function deactivate(){controller.clear();refresh();}
        return Object.freeze({select:select,key:key,refresh:refresh,close:close,isOpen:function(){return !slot.hidden;},deactivate:deactivate,controller:controller,
            dispose:function(){off();docOff();slot.removeEventListener('compositionend',composed);deactivate();}});
    }
    return Object.freeze({createController:createController,mount:mount,durations:DURATIONS});
});
