/* Port-owned UI routing only. No Sync, credential, repository or conflict writes. */
const guides = new WeakMap();
const sharedGuide = Symbol.for('soundCruise.syncAttentionGuide');
export function getAttentionGuide(win = globalThis) {
    const owner = win.SoundCruiseNativeSyncHost?.attentionWindow || win.CruisePortSyncAttentionHost?.owner || win;
    if (owner[sharedGuide]) return owner[sharedGuide];
    if (guides.has(owner)) return guides.get(owner);
    // Browser history is presentation state only; no localStorage/DB key or record copy.
    const seen = new Set(owner.history?.state?.cruiseSyncAttentionSeen || []);
    let busy = false;
    const mark = key => {
        seen.add(key);
        try { owner.history.replaceState({ ...owner.history.state, cruiseSyncAttentionSeen: [...seen] }, ''); } catch (_) {}
    };
    const guide = {
        mark,
        async open(issue, automatic = false) {
            if (!issue?.key || typeof issue.open !== 'function') return false;
            if (automatic && (busy || seen.has(issue.key) || owner.document?.hidden || issue.canOpen?.() === false)) return false;
            mark(issue.key);busy = true;
            try { await issue.open();return true; }
            finally { busy = false; }
        }
    };
    guides.set(owner, guide);owner[sharedGuide]=guide;return guide;
}
export function issueFingerprint(conflicts = [], session = null) {
    return JSON.stringify([conflicts.map(c => [c.conflictId || c.id, c.recordKey, c.local?.payloadHash,
        c.remote?.payloadHash || c.cloud?.payloadHash || c.server?.payloadHash, c.baseRevision ?? c.shadow?.revision]), !conflicts.length && session?.stage === 'awaiting_confirmation'
        ? [session.localSnapshot?.manifestHash,session.cloudSnapshot?.manifestHash,session.plan?.conflicts?.map(c=>[c.recordKey,c.kind,c.fields?.map(f=>f.field||f.path||f)])] : null]);
}
export function attentionKey(account,app,kind,conflicts=[],session=null){return JSON.stringify([account,app,kind,issueFingerprint(conflicts,session)]);}
export function managementOpen(win, appId) {
    const selector = {pitch:'#home-settings-btn',fretboard:'#btn-settings-home',rhythm:'#settings-btn',chord:'#cc-settings-btn'}[appId];
    const button = win.document.querySelector(selector);
    if (button && button.getClientRects().length) button.click();
    const panel = win.document.querySelector('[data-sync-join-entry-host]');
    const toggle = panel?.querySelector('[aria-expanded="false"]');toggle?.click();
    const action = panel?.querySelector('[data-sync-attention-open]') || panel?.querySelector('button');
    action?.focus({preventScroll:true});return true;
}
export function takeAttentionRequest(win) {
    const url = new URL(win.location.href);
    if (url.searchParams.get('sync-review') !== '1') return false;
    url.searchParams.delete('sync-review');
    win.history.replaceState(win.history.state,'',url.href);return true;
}
export function bindNativeAttention(win, host, {appId, key, open, automatic = true, current = () => true}) {
    if (!current()) return;
    const guide = getAttentionGuide(win);
    const canOpen = () => current() && !win.document.hidden &&
        ![...win.document.querySelectorAll('dialog[open], [role="dialog"]')].some(d =>
            d.getClientRects().length && !d.contains(host));
    const mayOpen=()=>canOpen()&&!win.document.querySelector('[data-sync-merge-preview]')?.getClientRects().length;
    const issue = {key, open, canOpen:mayOpen};
    win.SoundCruiseSyncAttention = {open:async()=>{if(!current())return false;guide.mark(key);return open();}};
    if (!host) {if(automatic)void guide.open(issue,true).catch(()=>{});return;}
    let button = host.querySelector('[data-sync-attention-open]');
    if (!button) {button=win.document.createElement('button');button.type='button';button.dataset.syncAttentionOpen=appId;
        button.className='sound-cruise-sync-button sound-cruise-sync-button--secondary';button.textContent='解決方法を確認';host.append(button);}
    if(button.classList.contains('sound-cruise-sync-button--primary')){if(!button.__attentionMarked){button.__attentionMarked=true;button.addEventListener('click',()=>guide.mark(host.__syncAttentionIssue?.key||key),true);}}
    else button.onclick=()=>guide.open(issue).catch(()=>{});
    host.__syncAttentionIssue = automatic ? issue : null;
    if(!host.__syncAttentionBound){host.__syncAttentionBound=true;
        const retry=()=>queueMicrotask(()=>{const pending=host.__syncAttentionIssue;if(host.isConnected&&pending)void guide.open(pending,true).catch(()=>{});});
        win.document.addEventListener('click',retry);win.document.addEventListener('visibilitychange',retry);}
    if (automatic) void guide.open(issue,true).catch(()=>{});
}
