/* Same public/native product fixtures, no synthetic resolution controller. */
import assert from 'node:assert/strict';
export async function acceptNativeAttention({source,id,page,output}) {
 const screen=id==='chord'?'[data-sync-merge-preview]':'[data-sync-conflict-resolution]';
 // Fretboard persists the active screen in course; opening Settings changes only that navigation value.
 const capture=()=>source.evaluate(async id=>{const s=id==='chord'?await ChordCruiseSync.pilotClient.openStore():SoundCruiseMultiAppSync.runtimes[id].store;
  return {local:Object.fromEntries(Object.entries(localStorage).filter(([k])=>id==='chord'?k.startsWith('chordCruise.'):id==='pitch'?k==='pitchTrainerSettings':id==='fretboard'?k==='fretboard_cruise_state':k==='rhythmCruiseSettings').map(([k,v])=>{if(id==='fretboard'){const data=JSON.parse(v);delete data.course;return[k,data];}return[k,v];})),
   pending:(await s.listOutbox()).map(o=>[o.operationId,o.payloadHash]),conflicts:(await s.listConflicts()).map(c=>[c.conflictId||c.id,c.recordKey])};},id);
 await source.locator(screen).waitFor({state:'visible'});
 const before=await capture();assert(before.conflicts.length,'genuine unresolved data, not an attention count alone');
 await page.screenshot({path:output+'/'+id+'-auto-attention.png'});
 await source.locator(screen).press('Escape');await source.locator(screen).waitFor({state:'hidden'});
 assert.deepEqual(await capture(),before,'Escape retains values, pending operations and conflicts');
 // Repaint the same actual issue, without initiating another Sync request.
 await source.evaluate(id=>{if(id==='chord')window.dispatchEvent(new CustomEvent('soundcruise:sync-status',{detail:{appId:id,state:'attention',count:1}}));
  else SoundCruiseMultiAppSync.runtimes[id].dispatchEvent(new CustomEvent('statechange',{detail:{state:'attention',reason:'conflict'}}));},id);
 await source.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 assert.equal(await source.locator(screen).isVisible(),false,'repaint after cancel never auto-reopens the same issue');
 const button=source.locator('[data-sync-attention-open]');
 if(!await source.locator('[data-sync-join-entry-host]').isVisible())await source.locator({pitch:'#home-settings-btn',fretboard:'#btn-settings-home',rhythm:'#settings-btn',chord:'#cc-settings-btn'}[id]).evaluate(e=>e.click());
 if(!await button.isVisible())await source.locator('[data-sync-join-entry-host] [aria-expanded=false]').click();await button.focus();await button.press('Enter');await source.locator(screen).waitFor({state:'visible'});
 assert.deepEqual(await capture(),before,'manual review never chooses Cloud/local or discards pending data');
 return {autoOpened:true,cancelPreserved:true,repaintStayedClosed:true,keyboardManualReopened:true};
}
