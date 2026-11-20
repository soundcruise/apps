const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
const url=path=>new URL(path,self.location.origin).href;
let preparing=null;
async function valid(response,asset){return !!response&&response.status===200&&await digest(await response.clone().arrayBuffer())===asset.sha256;}
async function status(){const cache=await caches.open(CACHE);let count=0;for(const asset of manifest.assets)if(await valid(await cache.match(url(asset.path)),asset))count++;return {version:manifest.version,ready:count===manifest.assets.length,count,total:manifest.assets.length};}
async function prepare(){
    if(preparing)return preparing;
    preparing=(async()=>{const cache=await caches.open(CACHE);let next=0;
        async function run(){while(next<manifest.assets.length){const asset=manifest.assets[next++],key=url(asset.path);if(await valid(await cache.match(key),asset))continue;
            const response=await fetch(key,{cache:'no-store',credentials:'omit',redirect:'error'});if(!await valid(response,asset))throw Error('asset-verification-failed');await cache.put(key,response);
        }}
        await Promise.all(Array.from({length:4},run));const result=await status();if(!result.ready)throw Error('offline-incomplete');return result;
    })().finally(()=>preparing=null);return preparing;
}
self.addEventListener('install',event=>event.waitUntil(prepare())); // no skipWaiting: a running performance stays on its version
self.addEventListener('activate',event=>event.waitUntil((async()=>{
    const result=await status();if(!result.ready)throw Error('offline-incomplete');
    // Only our own caches. Other apps and their workers are not touched.
    for(const name of await caches.keys())if(name.startsWith(prefix)&&name!==CACHE)await caches.delete(name);
    await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
    const request=event.request,u=new URL(request.url);if(request.method!=='GET'||u.origin!==self.location.origin)return;
    const path=u.pathname===ROOT?ROOT+'index.html':u.pathname,asset=entries.get(path);if(!asset)return;
    // Stable versioned app snapshot; unknown URLs and APIs are never cached.
    event.respondWith((async()=>{const cache=await caches.open(CACHE),response=await cache.match(url(path));if(await valid(response,asset))return response;
        const fresh=await fetch(url(path),{cache:'no-store',credentials:'omit',redirect:'error'});if(!await valid(fresh,asset))throw Error('asset-verification-failed');await cache.put(url(path),fresh.clone());return fresh;
    })());
});
self.addEventListener('message',event=>{
    const client=event.source,port=event.ports[0];if(!port||!client?.url||!new URL(client.url).pathname.startsWith(ROOT))return;
    if(!['STATUS','PREPARE'].includes(event.data?.type))return;
    event.waitUntil((event.data.type==='PREPARE'?prepare():status()).then(result=>port.postMessage({ok:true,...result}),()=>port.postMessage({ok:false,error:'offline-preparation-failed'})));
});
