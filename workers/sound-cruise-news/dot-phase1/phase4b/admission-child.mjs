import {createIsolatedAcceptance} from './isolated-acceptance.mjs';
import {admitDotCandidate} from '../../src/dot-admission.js';
import {SOURCES} from '../../src/registry.js';
let text='';for await(const chunk of process.stdin)text+=chunk;
const {path,detail,input,actor,now,pepper,loseAck}=JSON.parse(text),h=createIsolatedAcceptance({path,registry:SOURCES,pepper,now});
try{const result=await admitDotCandidate(h.store,{detail:async()=>detail},input,actor,now,SOURCES,pepper);if(loseAck&&result.status==='registered'&&!result.replayed)process.exit(73);console.log(JSON.stringify({result,pid:process.pid}));}finally{h.close()}
