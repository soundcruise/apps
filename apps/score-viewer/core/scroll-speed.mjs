// The visual cursor may follow the musical clock or advance at its own speed.
export function createScrollSpeed({value={},bpm,totalTicks,ticksPerBar=1920}){
    const positions=['smooth','start','center','end'];
    const validSpeed=seconds=>Number.isFinite(seconds)&&seconds>=.15&&seconds<=120;
    let origin=value.origin==='viewport'?'viewport':'score';
    let position=positions.includes(value.position)?value.position:'smooth';
    let enabled=value.enabled!==false;
    let mode=value.mode==='custom'?'custom':'bpm';
    let secondsPerBar=validSpeed(value.secondsPerBar)?value.secondsPerBar:ticksPerBar/480*60/bpm;
    let cursor=Number.isFinite(value.cursorTick)?Math.max(0,Math.min(totalTicks,value.cursorTick)):null;
    let lastTime=null;
    return Object.freeze({
        target(s){
            if(mode==='bpm'){cursor=s.tick;lastTime=null;return cursor;}
            if(cursor===null)cursor=s.tick;
            if(lastTime!==null&&s.phase==='playing')cursor+=Math.max(0,s.time-lastTime)*ticksPerBar/secondsPerBar;
            cursor=Math.max(s.range?.start??0,Math.min(s.range?.end??totalTicks,cursor));
            lastTime=s.phase==='playing'?s.time:null;
            return cursor;
        },
        configure(patch,s){
            if(['viewport','score'].includes(patch.origin))origin=patch.origin;
            if(positions.includes(patch.position))position=patch.position;
            if(typeof patch.enabled==='boolean'){enabled=patch.enabled;cursor=s.tick;}
            if(patch.mode==='bpm'||patch.mode==='custom'){
                if(mode!==patch.mode||patch.mode==='bpm')cursor=s.tick;
                mode=patch.mode;
            }
            if(validSpeed(patch.secondsPerBar))secondsPerBar=patch.secondsPerBar;
            lastTime=null;
        },
        pause(){lastTime=null;},
        seek(tick){cursor=tick;lastTime=null;},
        snapshot(){return {mode,secondsPerBar,cursorTick:cursor,enabled,origin,position};}
    });
}
