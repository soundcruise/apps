// Dormant IDB policy. No credential lookup, storage, network or product activation.
import { equal, fail, frozen } from './port-idb-authority-contract.mjs';
import { METRONOME_DEFAULTS, normalizeMetronomeSettings } from './metronome-store.js';
import { normalizeMetronomePreset, settingsFromMetronomePreset } from './metronome-presets-store.js';
export const AUTHORITY_ACTION_POLICY_VERSION = 1;
export const METRONOME_KEY = 'cruisePort.metronome';
export const PRESETS_KEY = 'cruisePort.metronomePresets';
export const AUTHORITY_ACTIONS = frozen({saveBpm:'standard',saveAdvanced:'pro',listPresets:'read-only',
    applyPresetStandard:'standard',applyPresetAdvanced:'pro',createPreset:'pro',deletePreset:'standard',ackDelete:'system'});
// Inventory only; these names do not grant a product permission.
export const UNIMPLEMENTED_AUTHORITY_ACTIONS = Object.freeze(['saveSettings','saveTuner','savePracticeMenus','savePracticeProgress',
    'savePracticeHistory','savePracticeCalendar','savePracticeMenuSets','saveGearList','saveGearCategories','saveMyApps',
    'saveAssetMetadata','saveSchemaVersion','queueSync','pushCloud']);
export const FIXTURE_ACTIONS = Object.freeze(['local','fixture-save']);
export function actionPolicy(action, fixtureAllowed=false) {
    if (Object.hasOwn(AUTHORITY_ACTIONS,action)) return AUTHORITY_ACTIONS[action];
    if (fixtureAllowed && FIXTURE_ACTIONS.includes(action)) return 'isolated-fixture';
    if (UNIMPLEMENTED_AUTHORITY_ACTIONS.includes(action) || FIXTURE_ACTIONS.includes(action)) return 'unimplemented';
    return 'unknown';
}
const object = raw => raw === null ? null : JSON.parse(raw);
const without = (value,keys) => Object.fromEntries(Object.entries(value).filter(([k])=>!keys.includes(k)));
const require = (condition,reason='action-semantics-invalid') => {if(!condition)throw fail(reason);};
export function assertActionSemantics(p, before, capability) {
    if(p.policy==='unknown')throw fail('unknown-action');
    if(p.policy==='unimplemented')throw fail('action-unimplemented');
    if(p.policy==='read-only')throw fail('read-only-action');
    if(p.policy==='isolated-fixture') { require(capability?.fixture===true,'fixture-capability-required');return; }
    const keys=Object.keys(p.changes);
    if(p.action==='ackDelete') {
        require(capability?.ack===true,'system-capability-required');
        require(keys.length===0 && p.acknowledgements.length>0 && p.operationData===null,'system-mutation-invalid');
        // The branded handle pins generation + exact intent keys/generations.
        return;
    }
    require(p.acknowledgements.length===0,'system-capability-required');
    if(['saveBpm','saveAdvanced','applyPresetStandard','applyPresetAdvanced'].includes(p.action)) {
        require(keys.every(k=>k===METRONOME_KEY),'action-target-invalid');
        require(!Object.hasOwn(p.changes,METRONOME_KEY)||p.changes[METRONOME_KEY]!==null);
        const old=object(before[METRONOME_KEY])||METRONOME_DEFAULTS;
        const next=object(p.changes[METRONOME_KEY]??before[METRONOME_KEY])||METRONOME_DEFAULTS;
        require(normalizeMetronomeSettings(next)!==null);
        const fields=p.policy==='pro'?['bpm','meter','rhythm','sound','volume','accents']:['bpm'];
        require(equal(without(old,fields),without(next,fields)));
        if(p.action.startsWith('applyPreset')) {
            require(p.operationData && equal(Object.keys(p.operationData),['presetId']) && typeof p.operationData.presetId==='string');
            require(p.dependencyKeys.includes(PRESETS_KEY),'preset-dependency-required');
            const preset=object(before[PRESETS_KEY])?.items?.find(item=>item.id===p.operationData.presetId);
            const settings=settingsFromMetronomePreset(preset);require(settings!==null,'preset-unavailable');
            require(p.policy==='standard'?next.bpm===settings.bpm:equal(normalizeMetronomeSettings(next),settings));
        } else require(p.operationData===null);
        return;
    }
    require(keys.every(k=>k===PRESETS_KEY),'action-target-invalid');
    require(p.operationData===null);
    const old=object(before[PRESETS_KEY])||{version:1,items:[]};
    const next=object(p.changes[PRESETS_KEY]??before[PRESETS_KEY]);
    require(next && equal(without(old,['items']),without(next,['items'])) && Array.isArray(next.items));
    const oldIds=new Set(old.items.map(i=>i.id)), newIds=new Set(next.items.map(i=>i.id));
    require(newIds.size===next.items.length);
    if(p.action==='createPreset') {
        require(next.items.length===old.items.length+1 && next.items.length<=50);
        const added=next.items.filter(i=>!oldIds.has(i.id));require(added.length===1 && normalizeMetronomePreset(added[0])!==null);
        require(equal(next.items.filter(i=>oldIds.has(i.id)),old.items));
    } else {
        require(p.action==='deletePreset' && next.items.length===old.items.length-1);
        require(equal(old.items.filter(i=>newIds.has(i.id)),next.items));
    }
}
