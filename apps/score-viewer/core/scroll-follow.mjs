// Geometry uses the active scrolling axis (rows vertically, bars horizontally).
export function createScrollMap(rows,totalTicks){
    const points=rows.filter(r=>Number.isFinite(r.startTick)&&Number.isFinite(r.top)).slice().sort((a,b)=>a.startTick-b.startTick);
    const last=points.at(-1);
    const pixelsPerTick=points.length?(last.bottom-points[0].top)/Math.max(1,totalTicks-points[0].startTick):0;
    return Object.freeze({pixelsPerTick,target(tick,span,maxScroll,position='smooth',minScroll=0){
        if(!points.length)return 0;
        let lo=0,hi=points.length;while(lo<hi){const mid=(lo+hi)>>>1;if(points[mid].startTick<=tick)lo=mid+1;else hi=mid;}
        const index=Math.max(0,lo-1),a=points[index],b=points[index+1]||{startTick:totalTicks,top:a.bottom};
        let offset;
        if(position==='smooth'){
            const fraction=Math.max(0,Math.min(1,(tick-a.startTick)/Math.max(1,b.startTick-a.startTick)));
            offset=a.top+(b.top-a.top)*fraction-span/3;
        }else{
            const room=Math.max(0,span-(a.bottom-a.top));
            offset=a.top-room*({start:0,center:.5,end:1}[position]??.5);
        }
        return Math.max(minScroll,Math.min(maxScroll,offset));
    }});
}
export function smoothFollow(current,target,elapsedSeconds){
    return current+(target-current)*(1-Math.exp(-Math.min(.1,Math.max(0,elapsedSeconds))/.12));
}
