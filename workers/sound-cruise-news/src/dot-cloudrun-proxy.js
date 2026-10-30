// No deployment configuration is wired here: this proxy is injected only in isolated tests.
export function createDotCloudRunProxy({origin,assertion,fetchImpl=fetch,timeoutMs=5000}) {
 let u;try{u=new URL(origin);if(u.protocol!=='https:'||u.origin!==origin||u.username||u.password)throw Error();}catch{throw Error('operator_not_configured');}
 if(typeof assertion!=='string'||!assertion||assertion.length>16000||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('operator_not_configured');
 async function get(path){
  const response=await fetchImpl(origin+path,{method:'GET',headers:{'Cf-Access-Jwt-Assertion':assertion,'Accept':'application/json'},redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
  if(response.status===404)return null;
  if(!response.ok||Number(response.headers.get('content-length'))>65536||!response.body)throw Error('operator_unavailable');
  const stream=response.body.getReader();let length=0,chunks=[];try{for(;;){const {done,value}=await stream.read();if(done)break;length+=value.byteLength;if(length>65536){await stream.cancel();throw Error('operator_unavailable');}chunks.push(value);}}finally{stream.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('operator_unavailable');}
 }
 return {list:({limit,cursor})=>get('/v1/dot-candidates?'+new URLSearchParams({limit:String(limit),...(cursor?{cursor}:{})})),detail:id=>get('/v1/dot-candidates/'+encodeURIComponent(id))};
}
