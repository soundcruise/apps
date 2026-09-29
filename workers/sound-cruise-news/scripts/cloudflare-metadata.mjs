// Read-only deployment evidence. Authentication and secret values are never emitted.
import {readFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import {checkedConfig} from './remote-db.mjs';
export async function deploymentMetadata(){
 const config=await checkedConfig();
 const credentials=await readFile(homedir()+'/Library/Preferences/.wrangler/config/default.toml','utf8');
 const token=process.env.CLOUDFLARE_API_TOKEN||credentials.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
 if(!token)throw Error('cloudflare_authentication_missing');
 const base='https://api.cloudflare.com/client/v4/accounts/'+config.account_id+'/workers/scripts/'+config.name;
 const get=async path=>{
  const response=await fetch(base+path,{headers:{Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(15000)});
  const data=await response.json();if(!response.ok||!data.success)throw Error('cloudflare_metadata_error_'+response.status);return data.result;
 };
 const [settings,schedules,deployments]=await Promise.all([get('/settings'),get('/schedules'),get('/deployments')]);
 return {worker:config.name,account:config.account_id,bindings:settings.bindings.map(b=>({type:b.type,name:b.name,...(b.type==='d1'?{id:b.id}:b.type==='plain_text'?{value:b.text}: {})})),schedules,deployments};
}
