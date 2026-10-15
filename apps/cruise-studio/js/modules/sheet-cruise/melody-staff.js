/* Screen-only incremental VexFlow view. The conversion service owns identity and readiness. */
(function(){
    'use strict';
    function el(tag,cls,text){var x=document.createElement(tag);if(cls)x.className=cls;if(text!==undefined)x.textContent=text;return x;}
    function create(options){
        var host=options.host,root=null,status=null,grid=null,projectId=null,cells=[],cache=new Map(),epoch=0,frame=null;
        var metrics={bars:0,drawn:0,maxFrameMs:0,totalMs:0,source:null},started=0;
        function invalidate(message){epoch++;if(frame!==null)cancelAnimationFrame(frame);frame=null;
            if(root){root.classList.add('melody-unready');root.dataset.ready='false';status.textContent=message||'五線プレビューは更新待ちです';}}
        function prepare(project){
            var numbers=project.bars.map(function(b){return b.barNumber;}).join(',');
            if(root&&root.isConnected&&projectId===project.projectId&&root.dataset.bars===numbers)return;
            cache.clear();projectId=project.projectId;root=el('div','sheet-page melody-page');root.dataset.bars=numbers;
            root.appendChild(el('h2','melody-title',project.songInfo.title||'無題'));
            root.appendChild(el('p','melody-caption','メロディ五線プレビュー（実音・移調なし）／コードはPlayキー基準。五線は画面のみ、印刷は従来のコード譜です。'));
            status=el('p','melody-status');status.setAttribute('role','status');root.appendChild(status);
            grid=el('div','melody-grid');root.appendChild(grid);cells=[];
            if(project.bars.length<=CruiseStudio.melodyNotation.limits.bars)project.bars.forEach(function(b){
                var cell=el('div','sheet-bar melody-measure');cell.dataset.barNumber=b.barNumber;cell.tabIndex=0;
                cell.setAttribute('role','button');cell.setAttribute('aria-label',b.barNumber+'小節目のメロディ（ルーペで編集）');
                cell.appendChild(el('div','melody-bar-heading',b.barNumber+'小節目'));cells.push(cell);grid.appendChild(cell);
            });
            host.replaceChildren(root);
        }
        function render(project){
            invalidate();if(!project)return;
            prepare(project);root.querySelector('.melody-title').textContent=project.songInfo.title||'無題';
            invalidate('五線プレビューを更新しています…');var token=epoch;started=performance.now();
            frame=requestAnimationFrame(function(){
                frame=null;if(token!==epoch||!options.active())return;
                var service=CruiseStudio.musicConversion,result=service.convert();
                if(!result.ok){invalidate('生成不可：'+result.diagnostics.map(function(d){return d.code;}).join('、'));return;}
                var score=CruiseStudio.melodyNotation.project(result);
                if(!score.ok){invalidate('生成不可：'+score.code+'。対応範囲は4/4・480 PPQです。');return;}
                var i=0,drawn=0,maxFrame=0;
                function chunk(){
                    frame=null;if(token!==epoch||!options.active()||!service.isCurrent(result)){invalidate('五線プレビューは更新待ちです（入力・曲・外部状態を再確認してください）');return;}
                    var begin=performance.now(),count=0;
                    try{
                        while(i<score.measures.length&&count<4&&(performance.now()-begin<8||!count)){
                            var bar=score.measures[i],signature=JSON.stringify([score.key,bar]);
                            if(cache.get(i)!==signature){draw(cells[i],bar,score.key);cache.set(i,signature);drawn++;}
                            i++;count++;
                        }
                    }catch(error){invalidate('生成不可：記譜描画に失敗しました。コード譜で内容を確認してください');root.dataset.renderError=error.message;return;}
                    maxFrame=Math.max(maxFrame,performance.now()-begin);
                    if(i<score.measures.length){frame=requestAnimationFrame(chunk);return;}
                    if(!service.isCurrent(result)){invalidate();return;}
                    root.classList.remove('melody-unready');root.dataset.ready='true';root.dataset.projectId=score.source.projectId;
                    status.textContent='メロディ　⌜ 音の長さ：自動を含む（由来未確認）⌝／読み取り専用';
                    metrics={bars:i,drawn:drawn,maxFrameMs:maxFrame,totalMs:performance.now()-started,source:score.source};
                    options.onLayout();
                }
                chunk();
            });
        }
        return Object.freeze({render:render,invalidate:invalidate,metrics:function(){return JSON.parse(JSON.stringify(metrics));}});
    }
    function draw(cell,bar,key){
        var VF=window.Vex.Flow,body=el('div','melody-bar-content'),scroll=el('div','melody-scroll');
        var label=el('div','melody-timing','⌜ '+bar.timingLabel+' ⌝');body.appendChild(label);
        var paper=el('div','melody-bar-paper'),svgHost=el('div','melody-svg');
        var width=Math.max(330,bar.tokens.length*30+145,...bar.lyrics.map(function(l){return l.text.length*14+140;}));
        paper.style.width=width+'px';var top=50,bottom=40;
        bar.tokens.forEach(function(t){if(t.pitch){var d=t.pitch.octave*7+'CDEFGAB'.indexOf(t.pitch.step);top=Math.max(top,50+Math.max(0,d-38)*5);bottom=Math.max(bottom,40+Math.max(0,30-d)*5);}});
        var height=top+100+bottom,renderer=new VF.Renderer(svgHost,VF.Renderer.Backends.SVG);renderer.resize(width,height);
        var ctx=renderer.getContext(),stave=new VF.Stave(0,top,width-2);
        stave.addClef('treble').addKeySignature(key).addTimeSignature('4/4');stave.setContext(ctx).draw();
        var notes=bar.tokens.map(function(t){
            var accidental=t.pitch?{'-2':'bb','-1':'b','0':'','1':'#','2':'##'}[t.pitch.alter]:'';
            var key=t.pitch?t.pitch.step.toLowerCase()+accidental+'/'+t.pitch.octave:t.key;
            var n=new VF.StaveNote({clef:'treble',keys:[key],duration:t.duration+(t.kind==='rest'?'r':''),dots:t.dots,auto_stem:true});
            if(t.dots)VF.Dot.buildAndAttach([n],{all:true});return n;
        });
        var voice=new VF.Voice({num_beats:4,beat_value:4}).addTickables(notes);
        VF.Accidental.applyAccidentals([voice],key);
        new VF.Formatter().joinVoices([voice]).format([voice],width-stave.getNoteStartX()-24);
        var beams=VF.Beam.generateBeams(notes,{groups:[new VF.Fraction(1,4)]});
        voice.draw(ctx,stave);
        beams.forEach(function(b){b.setContext(ctx).draw();});
        bar.tokens.forEach(function(t,i){if(t.tieTo!==null)new VF.StaveTie({first_note:notes[i],last_note:notes[t.tieTo],first_indices:[0],last_indices:[0]}).setContext(ctx).draw();});
        var anchors=bar.tokens.map(function(t,i){return {tick:t.onsetTick,x:notes[i].getAbsoluteX()};});anchors.push({tick:1920,x:width-12});
        function x(t){var a=anchors[0];for(var j=1;j<anchors.length;j++){var b=anchors[j];if(t<=b.tick)return a.x+(b.x-a.x)*(t-a.tick)/(b.tick-a.tick);a=b;}return width-12;}
        var chords=el('div','melody-chords'),lyrics=el('div','melody-lyrics');
        [[bar.chords,chords,'symbol'],[bar.lyrics,lyrics,'text']].forEach(function(row){row[0].forEach(function(item){var text=el('span','melody-time-text',item[row[2]]);text.style.left=x(item.tick)+'px';text.dataset.tick=item.tick;row[1].appendChild(text);});});
        paper.append(chords,svgHost,lyrics);scroll.appendChild(paper);body.appendChild(scroll);
        var summary=bar.tokens.filter(function(t){return t.kind==='note';}).map(function(t){return t.pitch.step+t.pitch.alter+'/'+t.pitch.octave+'@'+t.onsetTick+':'+t.durationTicks;});
        svgHost.querySelector('svg').setAttribute('aria-label',bar.barNumber+'小節目 メロディ五線');
        svgHost.dataset.notes=JSON.stringify(summary);
        var old=cell.querySelector('.melody-bar-content');if(old)old.replaceWith(body);else cell.appendChild(body);
    }
    window.CruiseStudio.melodyStaff=Object.freeze({create:create});
})();
