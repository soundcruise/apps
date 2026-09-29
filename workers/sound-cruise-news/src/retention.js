import { NewsStore } from './store.js';
export async function scheduledPurge(_event,env,_ctx,now=Date.now()) {
 try {
  const counts=await new NewsStore(env.NEWS_DB).purge(now,{leadMs:3600000});
  await new NewsStore(env.NEWS_DB).recordHealth({sourceId:'retention',status:'healthy',reasonCode:'ok',checkedAt:now,successfulAt:now});
  console.log(JSON.stringify({event:'news_physical_purge',...counts}));
  return counts;
 }catch {
  try{await new NewsStore(env.NEWS_DB).recordHealth({sourceId:'retention',status:'error',reasonCode:'retention_purge_failed',checkedAt:now});}catch{/* DB may be unavailable; failed Cron remains visible. */}
  console.error(JSON.stringify({event:'news_physical_purge_failed'}));
  throw new Error('news_physical_purge_failed'); // visible failed Cron; never log DB content/errors.
 }
}
