import {createScrollSpeed} from '../../../../score-viewer/core/scroll-speed.mjs';
import {createScrollMap,smoothFollow} from '../../../../score-viewer/core/scroll-follow.mjs';
import {createScrollSettings} from '../../../../score-viewer/ui/scroll-settings.mjs';

// The editor scrolls the Studio workspace (or the focused editor), with sticky
// controls consuming part of its viewport. Use the same musical map as the viewer.
export function createEditorScroll({host,paper,toolbar,transport,scrollRoot,song,playback,load,save,setTempo,toggle}){
    let model,modelKey,geometry,run,latest;
    function settings(){
        const {id,totalTicks,ticksPerBar}=song(),key=JSON.stringify([id,totalTicks,ticksPerBar]);
        if(key!==modelKey){
            modelKey=key;
            model=createScrollSpeed({value:load(id),totalTicks,ticksPerBar,bpm:playback().settings.bpm});
            geometry=null;
        }
        return model;
    }
    const panel=createScrollSettings({host,read:()=>settings().snapshot(),horizontal:()=>false,playback,setTempo,toggle,
        playingLabel:'■ 停止',following:()=>!run?.detached,resume:()=>rebase(),
        change(patch){
            const speed=settings();
            speed.configure(patch,latest||{tick:song().selectedTick});
            const {cursorTick,...preferences}=speed.snapshot();
            save(song().id,preferences);
            rebase();
            if(!run&&(patch.position||patch.origin||patch.enabled))alignSelection();
        }
    });
    function rebase(){
        if(run){run.origin=null;run.detached=false;run.lastTime=null;}
        panel.refresh();
    }
    function layout(){
        const rect=paper.getBoundingClientRect();
        if(!geometry){
            const {totalTicks,ticksPerBar}=song();
            const rows=Array.from(paper.querySelectorAll('.sheet-line[data-line-start]')).filter(row=>Number(row.dataset.lineStart)>0).map(row=>{
                const r=row.getBoundingClientRect();
                return {startTick:(Number(row.dataset.lineStart)-1)*ticksPerBar,top:r.top-rect.top,bottom:r.bottom-rect.top};
            });
            geometry=createScrollMap(rows,totalTicks);
        }
        return rect;
    }
    const y=root=>root===window?window.scrollY:root.scrollTop;
    function target(root,tick,position){
        const rect=layout(),area=root===window?{top:0,bottom:innerHeight}:root.getBoundingClientRect();
        const head=toolbar.getBoundingClientRect(),foot=transport.getBoundingClientRect();
        const top=Math.max(0,area.top,head.bottom)+12,bottom=Math.min(innerHeight,area.bottom,foot.top)-12;
        const height=Math.max(1,bottom-top);
        // Translate the map into workspace coordinates before clamping at the root.
        return y(root)+rect.top-top+geometry.target(tick,height,Infinity,position,-Infinity);
    }
    function move(root,value){root.scrollTo({top:Math.round(value),behavior:'instant'});}
    function alignSelection(){
        const s=settings().snapshot(),{selectedTick}=song();
        if(selectedTick!==null&&s.enabled&&s.origin==='score'&&s.position!=='smooth')
            move(scrollRoot(),target(scrollRoot(),selectedTick,s.position));
    }
    function stop(){
        run?.events.abort();run=null;latest=null;model?.pause();
    }
    function start(){
        stop();geometry=null;settings();
        const root=scrollRoot(),events=new AbortController();
        run={root,events,expected:y(root),origin:null,lastTime:null,detached:false};
        function detach(e){
            if(e.target.closest?.('dialog')||run.detached)return;
            run.detached=true;model?.pause();panel.refresh();
        }
        const opts={passive:true,signal:events.signal};
        root.addEventListener('wheel',detach,opts);root.addEventListener('touchmove',detach,opts);
        root.addEventListener('scroll',e=>{if(Math.abs(y(root)-run.expected)>1)detach(e);},opts);
        window.addEventListener('resize',()=>{geometry=null;run.origin=null;},opts);
        panel.refresh();
    }
    function frame(tick,time,range){
        if(!run)return;
        const speed=model,prefs=speed.snapshot(),root=run.root,now=y(root);
        if(!latest||tick<latest.tick){speed.seek(tick);run.origin=null;}
        latest={tick,time,range,phase:'playing'};
        if(!prefs.enabled||run.detached)return;
        const cursor=speed.target(latest);
        let dest;
        if(prefs.origin==='viewport'){
            if(!geometry)layout();
            if(!run.origin)run.origin={tick:cursor,offset:now};
            dest=run.origin.offset+(cursor-run.origin.tick)*geometry.pixelsPerTick;
        }else dest=target(root,cursor,prefs.position);
        const wallTime=performance.now()/1000;
        move(root,run.lastTime===null?dest:smoothFollow(now,dest,wallTime-run.lastTime));
        run.lastTime=wallTime;run.expected=y(root);
    }
    return {start,stop,frame,alignSelection,open:panel.open,refresh:panel.refresh,
        close:()=>{panel.close();stop();},invalidate:()=>{geometry=null;if(run)run.origin=null;}};
}
