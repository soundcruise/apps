export {outputContextTime} from '../../cruise-studio/js/modules/score-audio.mjs';
export function createOutputPosition(){let points=[];
 return Object.freeze({reset(){points=[];},observe(s){if(!Number.isFinite(s.time))return;const last=points.at(-1);if(last&&s.time<last.time)points=[];if(last&&last.time===s.time&&last.phase===s.phase&&last.bpm===s.bpm&&last.tick===s.tick)return;
  points.push({time:s.time,tick:s.tick,bpm:s.bpm,phase:s.phase,anchorTime:s.anchorTime,iteration:s.iteration||0,range:{...s.range},totalTicks:s.totalTicks});while(points.length>1024||points.length>2&&points[1].time<s.time-4)points.shift();},
  at(s,time){if(!['playing','ended'].includes(s.phase)||!points.length)return {...s};let p=points[0];for(const point of points){if(point.time>time)break;p=point;}let tick=p.tick,iteration=p.iteration;const start=p.range.start||0,end=p.range.end??p.totalTicks,loop=p.range.loop;
   if(p.phase==='playing')tick+=Math.max(0,time-Math.max(p.time,p.anchorTime??p.time))*p.bpm/60*480;
   if(loop&&end>start&&tick>=end){iteration+=1+Math.floor((tick-end)/(end-start));tick=start+(tick-end)%(end-start);}else tick=Math.min(end,tick);
   const ticksPerBar=s.ticksPerBar??1920;
   const barIndex=Math.max(0,Math.min(Math.ceil(s.totalTicks/ticksPerBar)-1,Math.floor(tick/ticksPerBar)));
   return {...s,outputBpm:p.bpm,tick,time,iteration,barIndex,tickInBar:tick-barIndex*ticksPerBar,barId:barIndex===s.barIndex?s.barId:null,phase:p.phase==='playing'&&(!loop&&tick>=end)?'ended':p.phase};
  },get size(){return points.length;}});
}
