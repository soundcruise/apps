// Local operator use only. Database path is restricted by openStore; no network.
import {readFileSync} from 'node:fs';import {openStore,ingest} from './store.mjs';
if(process.argv.length!==4){console.error('Usage: node import.mjs <isolated staging.sqlite> <candidate JSON file>');process.exit(2);}
let input;try{input=JSON.parse(readFileSync(process.argv[3],'utf8'));}catch{console.error('invalid_json_file');process.exit(2);}
const items=Array.isArray(input)?input:[input];if(items.length>50){console.error('batch_limit');process.exit(2);}const db=openStore(process.argv[2]);for(const item of items)console.log(JSON.stringify(ingest(db,item,new Date().toISOString())));db.close();
