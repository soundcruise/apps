// Builds a local input-assistance link. No HTTP, database write or confirmation.
import {readFile} from 'node:fs/promises';
import {validateDraftAssistance} from '../src/draft-assistance.js';
const [file,operatorOrigin]=process.argv.slice(2);
if(!file||!operatorOrigin)throw Error('Usage: node scripts/assisted-draft-link.mjs information.json https://operator.example');
const origin=new URL(operatorOrigin);
if(origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password||origin.protocol!=='https:'&&!(origin.protocol==='http:'&&origin.hostname==='127.0.0.1'))throw Error('operator origin required');
const text=await readFile(file,'utf8');if(Buffer.byteLength(text)>6000)throw Error('input too large');
const info=JSON.parse(text);validateDraftAssistance(info,info.url);
const fragment='#assistedDraft='+encodeURIComponent(JSON.stringify(info));if(fragment.length>12000)throw Error('link too large');
console.log(origin.origin+'/?assistedUrl='+encodeURIComponent(info.url)+fragment);
