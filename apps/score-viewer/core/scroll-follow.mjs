// Row geometry is measured once per reflow, never once per animation frame.
// Musical time, including silent bars, is independent of row height/padding.
export function createScrollMap(rows,totalTicks){
    const points=rows.filter(r=>Number.isFinite(r.startTick)&&Number.isFinite(r.top)).slice().sort((a,b)=>a.startTick-b.startTick);
    return Object.freeze({target(tick,viewportHeight,maxScroll){
        if(!points.length)return 0;
        let lo=0,hi=points.length;while(lo<hi){const mid=(lo+hi)>>>1;if(points[mid].startTick<=tick)lo=mid+1;else hi=mid;}
        const index=Math.max(0,lo-1),a=points[index],b=points[index+1]||{startTick:totalTicks,top:a.bottom};
        const fraction=Math.max(0,Math.min(1,(tick-a.startTick)/Math.max(1,b.startTick-a.startTick)));
        return Math.max(0,Math.min(maxScroll,a.top+(b.top-a.top)*fraction-viewportHeight/3));
    }});
}
export function smoothFollow(current,target,elapsedSeconds){
    return current+(target-current)*(1-Math.exp(-Math.min(.1,Math.max(0,elapsedSeconds))/.12));
}
