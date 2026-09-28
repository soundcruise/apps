import {readFile,writeFile,unlink} from 'node:fs/promises';
const path='.local/last-run.json';
export async function expireReport(now=Date.now()){
 try {const value=JSON.parse(await readFile(path,'utf8'));if(!Number.isFinite(Date.parse(value.at))||now-Date.parse(value.at)>90*86400000)await unlink(path);}catch(error){if(error.code!=='ENOENT')throw error;}
}
export async function writeReviewReport(store,reports=[]){
 await store.purge(Date.now());
 const candidates=(await store.candidates()).map(i=>({id:i.id,label:i.label,source:i.source_name,url:i.source_url,category:i.category,status:i.review_status,publishedAt:i.published_at}));
 const report={at:new Date().toISOString(),reports,candidates};
 await writeFile(path,JSON.stringify(report,null,2));return report;
}
