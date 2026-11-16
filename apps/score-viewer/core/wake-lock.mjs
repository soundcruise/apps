// Preference is distinct from actual acquisition. Late grants are released
// after pause/visibility/dispose; OS revocation never causes a request loop.
export function createScreenWakeLock({request,secure=true,visible=()=>true,changed=()=>{}}){
    let enabled=true,active=false,sentinel=null,pending=false,version=0,disposed=false,blocked=false,reason=null;
    const supported=secure&&typeof request==='function';
    const snapshot=()=>({enabled,active,supported,phase:!supported?'unsupported':sentinel?'held':pending?'requesting':reason||'idle'});
    const notify=()=>changed(snapshot());
    async function release(){const old=sentinel;sentinel=null;if(old)await old.release().catch(()=>{});}
    async function reconcile(){
        const desired=!disposed&&supported&&enabled&&active&&visible();
        if(!desired){version++;reason=null;await release();notify();return;}
        if(sentinel||pending||blocked)return;
        const ticket=++version;pending=true;reason=null;notify();
        try{const grant=await request('screen');
            if(ticket!==version||disposed||!enabled||!active||!visible()){await grant.release().catch(()=>{});return;}
            sentinel=grant;grant.addEventListener('release',()=>{if(sentinel!==grant)return;sentinel=null;blocked=true;reason='released';notify();},{once:true});
        }catch{if(ticket===version){blocked=true;reason='denied';}}
        finally{pending=false;notify();if(ticket!==version&&!disposed)void reconcile();}
    }
    return Object.freeze({snapshot,
        setEnabled(value){enabled=value===true;blocked=false;void reconcile();},
        setActive(value){if(active===(value===true))return;active=value===true;blocked=false;void reconcile();},
        visibilityChanged(){blocked=false;void reconcile();},
        retry(){blocked=false;void reconcile();},
        async dispose(){disposed=true;active=false;version++;await release();notify();}});
}
