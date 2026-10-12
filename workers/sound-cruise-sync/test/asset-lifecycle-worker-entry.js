// Bundled only by the isolated workerd test. Never imported by src/index.js.
import { handleRequest, handleScheduled } from '../src/app.js';
const dependencies = {
  readRuntimeControl: async () => ({rolloutMode:'open',admissionEnabled:true,dataWriteEnabled:true,dataReadEnabled:true,recoveryEnabled:true,cloudDeleteEnabled:true,generation:1,updatedAt:1}),
  authenticateDevice: async () => ({userId:'port-user-a',deviceId:'323e4567-e89b-42d3-a456-426614174000',appId:'port'})
};
export default { async fetch(request, env) {
  const path = new URL(request.url).pathname;
  if (path === '/__fixture__/waiting') return Response.json({waiting:(await env.SYNC_DB.prepare('SELECT phase FROM test_cleanup_gate').first()).phase==='waiting'});
  if (path === '/__fixture__/release') { await env.SYNC_DB.prepare("UPDATE test_cleanup_gate SET phase='released'").run(); return new Response('released'); }
  if (path === '/__fixture__/cleanup-immediate') {
    await handleScheduled(null,env,{createCleanupRepository:()=>({cleanup:async()=>({})})});
    return new Response('completed');
  }
  if (path === '/__fixture__/cleanup') {
    await handleScheduled(null,{...env,SYNC_ASSETS:{delete:async key=>{
      await env.SYNC_DB.prepare("UPDATE test_cleanup_gate SET phase='waiting'").run();
      while((await env.SYNC_DB.prepare('SELECT phase FROM test_cleanup_gate').first()).phase!=='released')
        await new Promise(resolve=>setTimeout(resolve,10));
      await env.SYNC_ASSETS.delete(key);
    }}},{createCleanupRepository:()=>({cleanup:async()=>({})})});
    return new Response('completed');
  }
  return handleRequest(request,{...env,SYNC_RATE_LIMITER:{limit:async()=>({success:true})}},null,dependencies);
} };
