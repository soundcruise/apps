// Offline QA of an existing research snapshot. No network, D1 writes or policy approval.
import {readFile} from 'node:fs/promises';
import {candidateFrom} from '../src/metadata.js';
import {getSource} from '../src/registry.js';
const [path]=process.argv.slice(2);if(!path)throw new Error('Existing Sleepfreaks research snapshot path required');
const text=await readFile(path,'utf8');if(text.length>1000000)throw new Error('snapshot_too_large');
const {items}=JSON.parse(text);if(!Array.isArray(items)||items.length>100)throw new Error('snapshot_invalid');
const results=[];
for(const entry of items){
 const result=await candidateFrom({title:entry.title,url:entry.link,date:entry.pubDate},getSource('sleepfreaks'),{isAllowed:()=>true},Date.parse('2026-09-28T12:00:00Z'),process.env.NEWS_HEADLINE_PEPPER);
 results.push(result.item?{label:result.item.label,category:result.item.category,eventType:result.item.eventType,status:'pending',reason:result.item.reviewReason}:{status:'rejected',reason:result.reason});
}
console.log(JSON.stringify({mode:'offline_quality_replay_only',policyAndRobotsApproval:false,requests:0,candidates:results.length,pending:results.filter(r=>r.status==='pending').length,rejected:results.filter(r=>r.status==='rejected').length,results},null,2));
