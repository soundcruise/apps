// Presentation only: both modes read the audio clock; neither changes musical
// ticks/BPM. Custom seconds per bar deliberately allow the page to lead/lag.
export function createScrollSpeed({value={},bpm,totalTicks}){
 let mode=value.mode==='custom'?'custom':'bpm',secondsPerBar=Number.isFinite(value.secondsPerBar)&&value.secondsPerBar>=.15&&value.secondsPerBar<=120?value.secondsPerBar:240/bpm;
 let cursor=Number.isFinite(value.cursorTick)?Math.max(0,Math.min(totalTicks,value.cursorTick)):null,lastTime=null;
 return Object.freeze({
  target(s){if(mode==='bpm'){cursor=s.tick;lastTime=null;return s.tick;}if(cursor===null)cursor=s.tick;if(lastTime!==null&&s.phase==='playing')cursor=Math.min(totalTicks,cursor+Math.max(0,s.time-lastTime)*1920/secondsPerBar);lastTime=s.phase==='playing'?s.time:null;return cursor;},
  configure(patch,s){if(patch.mode==='bpm'){mode='bpm';cursor=s.tick;}else if(patch.mode==='custom'){if(mode!=='custom')cursor=s.tick;mode='custom';}if(Number.isFinite(patch.secondsPerBar)&&patch.secondsPerBar>=.15&&patch.secondsPerBar<=120)secondsPerBar=patch.secondsPerBar;lastTime=null;},
  pause(){lastTime=null;},seek(tick){cursor=tick;lastTime=null;},
  snapshot(){return {mode,secondsPerBar,cursorTick:cursor};}
 });
}
