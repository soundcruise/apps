import {openStore,ingest} from './store.mjs';import {readFileSync} from 'node:fs';
const db=openStore(process.argv[2]);const fixture=JSON.parse(readFileSync(new URL('../fixtures/dot-report-14.json',import.meta.url),'utf8'))[0];if(process.argv[3]==='changed')fixture.candidate.entity.brand='Different';const r=ingest(db,fixture,'2026-10-29T16:30:00+09:00');console.log(JSON.stringify(r));db.close();
