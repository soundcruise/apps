import {readFileSync} from 'node:fs';
import {DryRun} from './engine.mjs';
const inputs=JSON.parse(readFileSync(new URL('./fixtures/dot-report-14.json',import.meta.url),'utf8'));
const d=new DryRun([]), now='2026-10-29T16:30:00+09:00';
for(const input of inputs){const r=d.submit(input,now);console.log(JSON.stringify({id:input.candidate.candidate_id,status:r.status,freshness:r.freshness,blockers:r.evidence?.blockers,ready:r.ready}));}
for(const input of inputs)if(!d.submit(input,now).replayed)throw Error('replay_failed');
console.log(JSON.stringify({inputCount:inputs.length,stored:d.rows.length,replayCount:inputs.length,externalHttp:0,ready:0,published:0}));
