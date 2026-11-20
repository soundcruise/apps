// Isolated Pro sign-in using the same local Worker and D1 adapter as its contract tests.
// No real account, external challenge service or shared database is used.
import assert from 'node:assert/strict';
import {randomBytes, randomInt, randomUUID} from 'node:crypto';
import {createSqliteD1} from '../../../../workers/sound-cruise-sync/test/sqlite-d1.js';
import {handleProAuthRequest} from '../../../../workers/sound-cruise-sync/src/pro-auth-app.js';

export async function signIntoLocalPro(page,origin,t,ready=()=>CruiseStudio.entryAuth.isAuthorized()) {
    assert.equal(new URL(origin).hostname,'127.0.0.1');
    const db=createSqliteD1(),code=String(randomInt(10000)).padStart(4,'0'),challenge=randomUUID();
    t.after(()=>db.close());
    const limit={limit:async()=>({success:true})};
    const env={SYNC_DB:db,ALLOWED_ORIGINS:origin,PRO_PASSCODE_SLOT_A:code,
        PRO_LOCKOUT_PEPPER:randomBytes(32).toString('hex'),PRO_CREDENTIAL_PEPPER:randomBytes(32).toString('hex'),
        PRO_VERIFY_RATE_LIMITER:limit,SYNC_RATE_LIMITER:limit};
    const responses=[];
    await page.context().route(origin+'/v2/pro-auth/**',async route=>{
        const req=route.request(), headers=new Headers(await req.allHeaders());
        headers.set('Origin',origin);
        headers.set('CF-Connecting-IP','192.0.2.1');
        const response=await handleProAuthRequest(new Request(req.url(),{
            method:req.method(),headers,body:req.postData()||undefined
        }),env,{}, {verifyProTurnstile:async token=>({ok:token===challenge})});
        responses.push([new URL(req.url()).pathname,response.status]);
        await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
    });
    // Redirect only the Pro API transport to the loopback fixture, including after reload.
    function loopbackTransport() {
        const send=window.fetch.bind(window);
        window.fetch=(input,options)=>{
            const url=new URL(input instanceof Request?input.url:input,location.href);
            if(url.origin==='https://sound-cruise-sync.cruise-port-requests.workers.dev' && url.pathname.startsWith('/v2/pro-auth/'))
                return send(location.origin+url.pathname,options);
            return send(input,options);
        };
    }
    await page.context().addInitScript(loopbackTransport);
    await page.evaluate(loopbackTransport);
    await page.evaluate(token=>{window.__SOUND_CRUISE_ACCOUNT_TURNSTILE__={getToken:async()=>token};},challenge);
    await page.locator('#pro-gate-input').fill(code);
    await page.click('#pro-gate-submit');
    try {
        await page.waitForFunction(ready,null,{timeout:30000});
    } catch (error) {
        console.error('Local Pro entry',responses,await page.evaluate(()=>({
            state:window.CruiseStudio?.entryAuth?.read().phase,gate:document.querySelector('#pro-gate-error')?.textContent
        })));
        throw error;
    }
    assert(responses.some(([p,s])=>p.endsWith('/verify') && s===201));
}
