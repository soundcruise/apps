// CLI and browser enter the same authenticated service. No CLI-supplied human identity.
export async function operatorClient(origin,token,path,input,{fetcher=fetch}={}){
 if(!/^https:\/\/[a-z0-9.-]+$/.test(origin||'')||!token||token.length>16000||/[\s;]/.test(token))throw Error('operator_origin_and_access_session_required');
 const get=async(path,options={})=>{const response=await fetcher(origin+path,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Cookie:'CF_Authorization='+token,...options.headers},...options, ...(options.headers?{headers:{Cookie:'CF_Authorization='+token,...options.headers}}:{})});const data=await response.json();if(!response.ok)throw Error(data.error||'operator_request_failed');return data;};
 if(!input)return get(path);
 const session=await get('/api/session');return get('/api/cli-decision',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-News-CSRF':session.csrf},body:JSON.stringify(input)});
}
