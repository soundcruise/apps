// Synthetic data only. Excluded from public packaging and unavailable off 18874.
export function createMockAccountBookshelf(location,marked){
    if(location.protocol!=='http:'||location.hostname!=='127.0.0.1'||location.port!=='18874'||!marked)
        throw Error('Mock bookshelf refused outside the dedicated local entry');
    const form=(frets,fingers,barres=[])=>({capo:0,tuningMidi:[64,59,55,50,45,40],maxAbsoluteFret:22,
        strings:frets.map((f,i)=>f===null?{string:i+1,kind:'muted'}:{string:i+1,kind:'note',relativeFret:f,finger:fingers[i],fingeringWarning:false}),
        barres,playability:'standard',ownerWarning:null});
    const catalogue={format:'sound-cruise/chord-forms',version:1,sourceApp:'chord-cruise',
        folders:[{id:'mock-basic',name:'基本コード（模擬）'},{id:'mock-forms',name:'別フォーム（模擬）'}],
        chords:[
            {id:'mock-C-open',folderId:'mock-basic',name:'C',form:form([0,1,0,2,3,null],[null,1,null,2,3,null])},
            {id:'mock-G7',folderId:'mock-basic',name:'G7',form:form([1,0,0,0,2,3],[1,null,null,null,2,3])},
            {id:'mock-Am',folderId:'mock-basic',name:'Am',form:form([0,1,2,2,0,null],[null,1,3,2,null,null])},
            {id:'mock-C-barre',folderId:'mock-forms',name:'C',form:form([3,5,5,5,3,null],[1,4,3,2,1,null],[{finger:1,relativeFret:3,fromString:1,toString:5}])}
        ]};
    const stamp=Object.freeze({phase:'ready',generation:'synthetic-account-1',revision:'synthetic-book-1'});
    return Object.freeze({kind:'mock',getState:()=>stamp,subscribe:()=>()=>{},
        async read({signal}={}){
            if(signal?.aborted)throw Error('Mock bookshelf cancelled');
            return {generation:stamp.generation,revision:stamp.revision,catalogue:JSON.parse(JSON.stringify(catalogue))};
        }});
}
