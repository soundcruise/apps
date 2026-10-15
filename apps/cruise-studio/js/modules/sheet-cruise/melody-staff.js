/* Screen-only engraving. Session/conversion retain ownership of identity and readiness. */
(function(){
    'use strict';
    function el(tag,cls,text){var x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;}
    function prepareVoice(bar,key){
        var VF=window.Vex.Flow,notes=bar.tokens.map(function(t){
            var accidental=t.pitch?{'-2':'bb','-1':'b','0':'','1':'#','2':'##'}[t.pitch.alter]:'';
            var key=t.pitch?t.pitch.step.toLowerCase()+accidental+'/'+t.pitch.octave:t.key;
            var n=new VF.StaveNote({clef:'treble',keys:[key],duration:t.duration+(t.kind==='rest'?'r':''),dots:t.dots,auto_stem:true});
            if(t.dots)VF.Dot.buildAndAttach([n],{all:true});return n;
        });
        var voice=new VF.Voice({num_beats:4,beat_value:4}).addTickables(notes);
        VF.Accidental.applyAccidentals([voice],key);
        new VF.Formatter().joinVoices([voice]).format([voice],0);
        var beams=VF.Beam.generateBeams(notes,{groups:[new VF.Fraction(1,4)]});
        return {voice:voice,notes:notes,beams:beams,spacing:notes.map(function(n,i){var m=n.getMetrics();
            return {tick:bar.tokens[i].onsetTick,left:m.modLeftPx+m.leftDisplacedHeadPx,
                right:Math.max(m.notePx,m.glyphWidth)+m.modRightPx+m.rightDisplacedHeadPx};})};
    }
    function combine(items,field){var out=[];items.forEach(function(item){var previous=out.find(function(t){return t.tick===item.tick;});if(previous)previous[field]+=' / '+item[field];else out.push(Object.assign({},item));});return out.sort(function(a,b){return a.tick-b.tick;});}
    function signatureWidth(key,start,first){var s=new window.Vex.Flow.Stave(0,0,400);
        if(start)s.addClef('treble').addKeySignature(key);if(first)s.addTimeSignature('4/4');return s.getNoteStartX();}
    function vertical(bar){var top=-12,bottom=12;bar.tokens.forEach(function(t){if(t.pitch){var d=t.pitch.octave*7+'CDEFGAB'.indexOf(t.pitch.step);
        top=Math.max(top,-12+Math.max(0,d-38)*5);bottom=Math.max(bottom,12+Math.max(0,30-d)*5);}});return {top:top,bottom:bottom};}
    function explanation(codes,bar){
        var list=Array.from(new Set(codes)),at=bar?'（'+bar+'小節目）':'';
        if(list.some(function(c){return /duration|coverage/.test(c);}))return 'この音の長さはまだ表示できません'+at+'。三連符などの音価は未対応です。コード譜で確認してください。';
        if(list.some(function(c){return /meter|time-signature|ppq/.test(c);}))return 'この拍子はまだ表示できません'+at+'。現在は4/4に対応しています。';
        if(list.some(function(c){return /pitch|key/.test(c);}))return '音高またはキーを確認してください'+at+'。対応する音名・調号で入力し直してください。';
        if(list.some(function(c){return /external|deleted|source/.test(c);}))return '曲の保存状態が変わりました。外部更新や競合を解決してから五線を更新してください。';
        if(list.includes('input-or-modal-pending'))return '入力またはダイアログの確定後に更新します。';
        if(list.some(function(c){return /budget/.test(c);}))return '表示できる量を超えています。小節数や文字数を減らして確認してください。';
        return '五線を生成できません'+at+'。コード譜で入力内容を確認してください。';
    }
    function create(options){
        var host=options.host,root=null,status=null,detail=null,grid=null,projectId=null,cells=[],cache=new Map(),engraving=new Map(),epoch=0,frame=null,lastSource=null;
        var metrics={bars:0,drawn:0,maxFrameMs:0,totalMs:0,source:null};
        var canvas=document.createElement('canvas'),measure=canvas.getContext('2d');
        function cancel(){epoch++;if(frame!==null)cancelAnimationFrame(frame);frame=null;}
        function invalidate(message){cancel();lastSource=null;if(root){root.classList.add('melody-unready');root.classList.remove('melody-pending');root.dataset.ready='false';status.textContent=message||'五線プレビューは更新待ちです';}}
        function retain(project){
            var C=CruiseStudio,s=C.documents.getSession(),t=C.documents.ticket(),a=lastSource;
            if(!a||!s||s.destroyed||s.conflict||s.externalUpdatePending||s.commitInFlight||s.draft.schemaVersion!==1)return false;
            var revision=C.repository.readRevision(s.target);
            return revision.ok&&revision.revision===s.baseRevision&&a.baseRevision===s.baseRevision&&a.sessionId===s.sessionId&&a.projectId===project.projectId&&
                a.generation===t.generation&&a.workspaceId===C.shellHost.getActiveWorkspace()&&a.workspaceGeneration===C.shellHost.getWorkspaceGeneration();
        }
        function prepare(project){
            var numbers=project.bars.map(function(b){return b.barNumber;}).join(',');
            if(root&&root.isConnected&&projectId===project.projectId&&root.dataset.bars===numbers)return;
            cache.clear();engraving.clear();lastSource=null;projectId=project.projectId;root=el('div','sheet-page melody-page');root.dataset.bars=numbers;
            root.appendChild(el('h2','melody-title'));root.appendChild(el('p','melody-caption'));
            status=el('p','melody-status');status.setAttribute('role','status');root.appendChild(status);
            var details=el('details','melody-details');details.appendChild(el('summary',null,'表示の詳細'));detail=el('pre');details.appendChild(detail);root.appendChild(details);
            grid=el('div','melody-grid');root.appendChild(grid);cells=[];
            if(project.bars.length<=CruiseStudio.melodyNotation.limits.bars)project.bars.forEach(function(b){
                var cell=el('div','sheet-bar melody-measure');cell.dataset.barNumber=b.barNumber;cell.tabIndex=0;
                cell.setAttribute('role','button');cell.setAttribute('aria-label',b.barNumber+'小節目のメロディ（ルーペで編集）');
                cell.appendChild(el('div','melody-bar-heading',b.barNumber+'小節目'));cells.push(cell);grid.appendChild(cell);
            });host.replaceChildren(root);
        }
        function failure(codes,bar,diagnostics,project){
            var grouped=new Map(),locations=[];
            (diagnostics||codes.map(function(code){return {code:code};})).forEach(function(d){
                var entry=grouped.get(d.code);if(!entry){entry={count:0,bars:new Set()};grouped.set(d.code,entry);}entry.count++;
                var index=d.sourceLocation&&d.sourceLocation.barIndex,sourceBar=project&&project.bars[index];
                if(sourceBar){entry.bars.add(sourceBar.barNumber);if(d.severity==='fatal')locations.push(sourceBar.barNumber);}
            });
            invalidate(explanation(codes,bar||Array.from(new Set(locations)).join('・')));
            detail.textContent=Array.from(grouped,function(pair){var code=pair[0],entry=pair[1];return code+
                (entry.bars.size?'（'+Array.from(entry.bars).join('・')+'小節目）':'')+(entry.count>1?' ×'+entry.count:'');}).join('\n');
        }
        function render(project){
            var started=performance.now(),timing={conversionMs:0,projectionMs:0,voicePreparationMs:0,widthMs:0,layoutMs:0,renderMs:0,domMs:0,rafWaitMs:0};
            cancel();if(!project){invalidate();return;}prepare(project);timing.domMs+=performance.now()-started;
            var keep=retain(project);root.classList.toggle('melody-unready',!keep);root.classList.toggle('melody-pending',keep);root.dataset.ready='false';
            status.textContent=keep?'入力中・確定後に更新（表示は直前の確定内容）':'五線を更新しています…';
            var token=epoch,queued=performance.now(),sliceStart=queued;
            frame=requestAnimationFrame(function(){
                frame=null;timing.rafWaitMs+=performance.now()-queued;sliceStart=performance.now();if(token!==epoch||!options.active())return;
                var conversionStart=performance.now(),service=CruiseStudio.musicConversion,result=service.convert();timing.conversionMs+=performance.now()-conversionStart;
                if(!result.ok){var fatal=result.diagnostics.filter(function(d){return d.severity==='fatal';}),codes=(fatal.length?fatal:result.diagnostics).map(function(d){return d.code;});
                    if(codes.every(function(c){return c==='input-or-modal-pending';})&&retain(project)&&!CruiseStudio.shellHost.modal.getActive())return;
                    failure(codes,null,result.diagnostics,project);return;}
                var projectionStart=performance.now(),score=CruiseStudio.melodyNotation.project(result);timing.projectionMs+=performance.now()-projectionStart;if(!score.ok){failure([score.code],score.barNumber);return;}
                var show=CruiseStudio.sheetRenderer.resolveShowSettings(project),available=Math.max(280,grid.clientWidth),bars=[],i=0,drawn=0,maxFrame=0;
                function current(){return token===epoch&&options.active()&&service.isCurrent(result);}
                function schedule(fn){var queuedAt=performance.now();frame=requestAnimationFrame(function(){timing.rafWaitMs+=performance.now()-queuedAt;sliceStart=performance.now();fn();});}
                function compute(){
                    frame=null;if(!current()){invalidate();return;}var begin=performance.now(),count=0;
                    try{while(i<score.measures.length&&count<16&&(performance.now()-sliceStart<8||!count)){
                        var original=score.measures[i],sec=project.sections.find(function(s){return s.id===original.sectionId;}),bar=Object.assign({},original,{
                            chords:show.chords?combine(original.chords,'symbol'):[],lyrics:show.lyrics&&!(sec&&sec.lyricsHidden)?combine(original.lyrics,'text'):[]});
                        var sig=JSON.stringify([score.key,bar]),stored=engraving.get(i);
                        if(!stored||stored.signature!==sig){var voiceStart=performance.now();stored={signature:sig,bundle:prepareVoice(bar,score.key),vertical:vertical(bar),rows:[]};timing.voicePreparationMs+=performance.now()-voiceStart;var widthStart=performance.now();
                            [[bar.chords,'symbol','600 16px Arial'],[bar.lyrics,'text','14px Arial']].forEach(function(row){measure.font=row[2];stored.rows.push(row[0].map(function(t){return {tick:t.tick,width:measure.measureText(t[row[1]]).width};}));});timing.widthMs+=performance.now()-widthStart;engraving.set(i,stored);}
                        bars.push({bar:bar,stored:stored,section:sec?sec.name:'',start:false,first:i===0});i++;count++;
                    }}catch(e){root.dataset.renderError=e.message;failure(['engraving-failure']);return;}
                    maxFrame=Math.max(maxFrame,performance.now()-sliceStart);if(i<score.measures.length){schedule(compute);return;}
                    arrange();
                }
                function arrange(){
                    var layoutStart=performance.now(),systems=[],index=0;
                    while(index<bars.length){var a=bars[index];a.start=true;
                        a.plan=CruiseStudio.melodyNotation.layout(a.stored.bundle.spacing,a.stored.rows,signatureWidth(score.key,true,a.first));
                        var row=[a],b=bars[index+1];
                        if(b&&b.bar.sectionId===a.bar.sectionId&&!project.bars[index].lineBreakAfter){
                            b.plan=CruiseStudio.melodyNotation.layout(b.stored.bundle.spacing,b.stored.rows,signatureWidth(score.key,false,false));
                            if(a.plan.minWidth+b.plan.minWidth<=available){row.push(b);}
                        }
                        var sum=row.reduce(function(n,x){return n+x.plan.minWidth;},0),extra=Math.max(0,available-sum)/row.length;
                        var top=Math.max.apply(null,row.map(function(x){return x.stored.vertical.top;})),bottom=Math.max.apply(null,row.map(function(x){return x.stored.vertical.bottom;}));
                        var chords=row.some(function(x){return x.bar.chords.length;}),lyrics=row.some(function(x){return x.bar.lyrics.length;});
                        row.forEach(function(x){x.plan=CruiseStudio.melodyNotation.layout(x.stored.bundle.spacing,x.stored.rows,signatureWidth(score.key,x.start,x.first),x.plan.minWidth+extra);
                            x.top=top;x.bottom=bottom;x.chordRow=chords;x.lyricRow=lyrics;});
                        systems.push(row);index+=row.length;
                    }
                    timing.layoutMs+=performance.now()-layoutStart;var domStart=performance.now();
                    // Reparent stable cells only; Loupe/input DOM is outside this subtree.
                    var oldRows=Array.from(grid.querySelectorAll(':scope > .melody-system')),used=[];
                    systems.forEach(function(row,n){var r=oldRows[n];if(!r||!r.classList.contains('melody-system'))r=el('div','melody-system');
                        r.style.gridTemplateColumns=row.map(function(x){return (Math.min(x.plan.width,available))+'px';}).join(' ');
                        row.forEach(function(x){var cell=cells[x.bar.index];var slot=row.indexOf(x);if(r.children[slot]!==cell)r.insertBefore(cell,r.children[slot]||null);cell.querySelector('.melody-bar-heading').textContent=x.bar.barNumber+' · '+x.section;});
                        Array.from(r.children).forEach(function(c){if(!row.some(function(x){return cells[x.bar.index]===c;}))c.remove();});if(grid.children[n]!==r)grid.insertBefore(r,grid.children[n]||null);used.push(r);
                    });Array.from(grid.children).forEach(function(r){if(!used.includes(r))r.remove();});timing.domMs+=performance.now()-domStart;i=0;if(performance.now()-sliceStart<4)paint();else schedule(paint);
                }
                function paint(){
                    frame=null;if(!current()){invalidate();return;}var begin=performance.now(),count=0;
                    try{while(i<bars.length&&count<16&&(performance.now()-sliceStart<8||!count)){
                        var x=bars[i],signature=JSON.stringify([x.stored.signature,x.plan,x.start,x.first,x.top,x.bottom,x.chordRow,x.lyricRow]);
                        if(cache.get(i)!==signature){var drawnTiming=draw(cells[i],x,score.key);timing.renderMs+=drawnTiming.renderMs;timing.domMs+=drawnTiming.domMs;cache.set(i,signature);drawn++;}i++;count++;
                    }}catch(e){root.dataset.renderError=e.message;failure(['engraving-failure']);return;}
                    maxFrame=Math.max(maxFrame,performance.now()-sliceStart);if(i<bars.length){schedule(paint);return;}if(!current()){invalidate();return;}
                    lastSource=score.source;root.classList.remove('melody-unready','melody-pending');root.dataset.ready='true';root.dataset.projectId=score.source.projectId;
                    root.querySelector('.melody-title').textContent=project.songInfo.title||'無題';
                    root.querySelector('.melody-caption').textContent='Key '+score.key+' / Capo '+score.capo+' / BPM '+project.songInfo.bpm+' / 4/4　コード名：押さえ方（Playキー）・五線：実音';
                    status.textContent='音の長さ：自動を含む（由来未確認） · 画面用プレビュー。印刷はコード譜です。';
                    detail.textContent='音価・休符は既存データからの表示です。原曲どおりかは未確認です。';
                    metrics={bars:i,drawn:drawn,maxFrameMs:maxFrame,totalMs:performance.now()-started,source:score.source,timing:timing};options.onLayout();
                }
                compute();
            });
        }
        return Object.freeze({render:render,invalidate:invalidate,metrics:function(){return JSON.parse(JSON.stringify(metrics));}});
    }
    function draw(cell,x,key){
        var renderStart=performance.now(),VF=window.Vex.Flow,bar=x.bar,bundle=x.stored.bundle,notes=bundle.notes,voice=bundle.voice,width=x.plan.width;
        var old=cell.querySelector('.melody-bar-content'),scrollLeft=old?old.querySelector('.melody-scroll').scrollLeft:0;
        var body=el('div','melody-bar-content'),scroll=el('div','melody-scroll'),paper=el('div','melody-bar-paper'),svgHost=el('div','melody-svg');
        paper.style.width=width+'px';var height=x.top+80+x.bottom,renderer=new VF.Renderer(svgHost,VF.Renderer.Backends.SVG);renderer.resize(width,height);
        var ctx=renderer.getContext(),stave=new VF.Stave(0,x.top,width);
        if(x.start)stave.addClef('treble').addKeySignature(key);if(x.first)stave.addTimeSignature('4/4');stave.setContext(ctx).draw();
        function anchor(t){return x.plan.anchors.find(function(a){return a.tick===t;}).x;}
        notes.forEach(function(n,i){n.setStave(stave);var tc=n.getTickContext();tc.setX(0);var offset=n.getAbsoluteX();tc.setX(anchor(bar.tokens[i].onsetTick)-offset);});
        // A full-measure rest is conventionally centred; its temporal event remains tick 0.
        if(notes.length===1&&bar.tokens[0].kind==='rest'&&bar.tokens[0].durationTicks===1920){var tc=notes[0].getTickContext();tc.setX(tc.getX()+(stave.getNoteStartX()+width-12)/2-notes[0].getAbsoluteX()-notes[0].getGlyphWidth()/2);}
        voice.draw(ctx,stave);bundle.beams.forEach(function(b){b.setContext(ctx).draw();});
        bar.tokens.forEach(function(t,i){if(t.tieTo!==null)new VF.StaveTie({first_note:notes[i],last_note:notes[t.tieTo],first_indices:[0],last_indices:[0]}).setContext(ctx).draw();});
        [[bar.chords,'melody-chords','symbol',x.chordRow],[bar.lyrics,'melody-lyrics','text',x.lyricRow]].forEach(function(row){
            if(row[1]==='melody-lyrics')paper.appendChild(svgHost);if(!row[3])return;var lane=el('div',row[1]);row[0].forEach(function(item){var text=el('span','melody-time-text',item[row[2]]);text.style.left=anchor(item.tick)+'px';text.dataset.tick=item.tick;lane.appendChild(text);});paper.appendChild(lane);
        });scroll.appendChild(paper);body.appendChild(scroll);
        if(width>cell.clientWidth+1)body.appendChild(el('div','melody-overflow-hint','横にスクロールして小節の後半を確認 →'));
        svgHost.querySelector('svg').setAttribute('aria-label',bar.barNumber+'小節目 メロディ五線');svgHost.dataset.staveY=x.top;
        svgHost.dataset.anchors=JSON.stringify(x.plan.anchors);svgHost.dataset.systemStart=String(x.start);svgHost.dataset.timeSignature=String(x.first);
        svgHost.dataset.notes=JSON.stringify(bar.tokens.filter(function(t){return t.kind==='note';}).map(function(t){return t.pitch.step+t.pitch.alter+'/'+t.pitch.octave+'@'+t.onsetTick+':'+t.durationTicks;}));
        var renderMs=performance.now()-renderStart,domStart=performance.now();
        if(old)old.replaceWith(body);else cell.appendChild(body);scroll.scrollLeft=scrollLeft;
        return {renderMs:renderMs,domMs:performance.now()-domStart};
    }
    window.CruiseStudio.melodyStaff=Object.freeze({create:create});
})();
