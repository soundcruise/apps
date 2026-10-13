// Disposable browser fixture: actual shared gate/helper/crypto/IDB, local auth transport only.
const nativeWall=Date.now,nativeMono=performance.now.bind(performance);
let installed=false;
export async function installFormalProFixture(clock,{primary=false,budget=60000}={}){
 Date.now=()=>clock().wall??nativeWall();Object.defineProperty(performance,'now',{configurable:true,value:()=>clock().mono??nativeMono()});
 const authKey='soundCruiseProAuth';
 if(primary){localStorage.removeItem(authKey);localStorage.removeItem('soundCruiseProRevokePending');}
 await import('../../../shared/pro-device-session.js');
 if(!installed){
  const originalFetch=window.fetch.bind(window);window.fetch=async(url,options={})=>{
   const u=new URL(url,location.href);if(!u.pathname.startsWith('/v2/pro-auth/'))return originalFetch(url,options);
   const now=Date.now(),body=options.body?JSON.parse(options.body):{},auth=JSON.parse(localStorage.getItem(authKey)||'null');
   const result=u.pathname.endsWith('/challenge')?{ok:true,message:'isolated-native-pro-proof',challenge:'fixture',mac:'fixture'}:
    {ok:true,generation:auth?.generation??1,session:{version:3,serverTime:now,issuedAt:now,boundAt:now,lastValidatedAt:now,
     inactiveExpiresAt:now+90*86400000,accessExpiresAt:now+budget,offlineUntil:now+budget,revalidateAfter:now+budget,devicePublicKey:body.publicKey}};
   return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
  };
  await new Promise((ok,no)=>{const s=document.createElement('script');s.src='/apps/shared/pro-gate.js';s.onload=ok;s.onerror=no;document.head.append(s);});installed=true;
 }
 const client=SoundCruiseProDeviceSession.createClient({isCurrent:a=>JSON.parse(localStorage.getItem(authKey)||'null')?.credential===a.credential});
 const credential='scp1.123e4567-e89b-42d3-a456-426614174000.'+'A'.repeat(43),auth={v:2,credential,generation:1,sessionVersion:3,validatedAt:Date.now()};
 if(primary){localStorage.setItem(authKey,JSON.stringify(auth));localStorage.setItem('soundCruiseProOperationEpoch',crypto.randomUUID());}
 const current=JSON.parse(localStorage.getItem(authKey));if(!current)throw Error('fixture auth missing');
 const now=Date.now();if(primary){const publicKey=await client.publicKey();if(!await client.accept(current,{version:3,serverTime:now,issuedAt:now,boundAt:now,lastValidatedAt:now,
  inactiveExpiresAt:now+90*86400000,accessExpiresAt:now+budget,offlineUntil:now+budget,revalidateAfter:now+budget,devicePublicKey:publicKey}))throw Error('fixture receipt rejected');}
 return true;
}
