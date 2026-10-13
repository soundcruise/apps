// Disposable browser fixture: actual shared gate/helper/crypto/IDB, local auth transport only.
const nativeWall=Date.now,nativeMono=performance.now.bind(performance);
let installed=false;
let serverCredential=null;
let serverMode='healthy',leaseBudget=60000,renewAfter=60000,release,waiting=false;
export function proServerMode(mode){serverMode=mode;serverCredential=JSON.parse(localStorage.getItem('soundCruiseProAuth')||'null')?.credential;return true;}
export function proServerState(){return {mode:serverMode,waiting};}
export function proServerRelease(){release?.();return true;}
export async function installFormalProFixture(clock,{primary=false,budget=60000,revalidateBudget=budget,preservePending=false}={}){
 serverMode='healthy';leaseBudget=budget;renewAfter=revalidateBudget;
 Date.now=()=>clock().wall??nativeWall();Object.defineProperty(performance,'now',{configurable:true,value:()=>clock().mono??nativeMono()});
 const authKey='soundCruiseProAuth';
 if(primary){localStorage.removeItem(authKey);if(!preservePending)localStorage.removeItem('soundCruiseProRevokePending');}
 await import('../../../shared/pro-device-session.js');
 if(!installed){
  const originalFetch=window.fetch.bind(window);window.fetch=async(url,options={})=>{
   const u=new URL(url,location.href);if(!u.pathname.startsWith('/v2/pro-auth/'))return originalFetch(url,options);
   const requested=options.headers?.Authorization?.replace(/^Bearer /,'');
   const mode=serverCredential&&requested!==serverCredential?'healthy':serverMode;
   if(mode==='offline')throw Error('isolated offline');
   if(mode==='delayed-terminal'){waiting=true;await new Promise(r=>release=r);waiting=false;}
   if(mode==='terminal'||mode==='delayed-terminal')return new Response(JSON.stringify({ok:false,code:'invalid_credential'}),{status:401,headers:{'Content-Type':'application/json'}});
   if(mode==='503'||mode==='429')return new Response(JSON.stringify({ok:false,code:'server_unavailable'}),{status:Number(mode),headers:{'Content-Type':'application/json'}});
   const now=Date.now(),body=options.body?JSON.parse(options.body):{},auth=JSON.parse(localStorage.getItem(authKey)||'null');
   const result=u.pathname.endsWith('/challenge')?{ok:true,message:'isolated-native-pro-proof',challenge:'fixture',mac:'fixture'}:
    {ok:true,generation:auth?.generation??1,session:{version:3,serverTime:now,issuedAt:now,boundAt:now,lastValidatedAt:now,
     inactiveExpiresAt:now+90*86400000,accessExpiresAt:now+leaseBudget,offlineUntil:now+leaseBudget,revalidateAfter:now+renewAfter,devicePublicKey:body.publicKey}};
   return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
  };
  await new Promise((ok,no)=>{const s=document.createElement('script');s.src='/apps/shared/pro-gate.js';s.onload=ok;s.onerror=no;document.head.append(s);});installed=true;
 }
 const client=SoundCruiseProDeviceSession.createClient({isCurrent:a=>JSON.parse(localStorage.getItem(authKey)||'null')?.credential===a.credential});
 const credential='scp1.'+crypto.randomUUID()+'.'+'A'.repeat(43),auth={v:2,credential,generation:1,sessionVersion:3,validatedAt:Date.now()};
 if(primary){localStorage.setItem(authKey,JSON.stringify(auth));localStorage.setItem('soundCruiseProOperationEpoch',crypto.randomUUID());}
 const current=JSON.parse(localStorage.getItem(authKey));if(!current)throw Error('fixture auth missing');
 const now=Date.now();if(primary){const publicKey=await client.publicKey();if(!await client.accept(current,{version:3,serverTime:now,issuedAt:now,boundAt:now,lastValidatedAt:now,
  inactiveExpiresAt:now+90*86400000,accessExpiresAt:now+budget,offlineUntil:now+budget,revalidateAfter:now+revalidateBudget,devicePublicKey:publicKey}))throw Error('fixture receipt rejected');}
 return true;
}
