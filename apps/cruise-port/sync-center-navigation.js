import { SYNC_CENTER_ROUTE } from './sync-center-controller.js?v=0.37.0';

export const SYNC_CENTER_SOURCE_KEY = 'cruisePortSyncCenterSource';

export function restoreInitialSyncCenterRoute({ enabled, requested, historyObject, locationObject }) {
    if (!enabled || !requested) return false;
    historyObject.replaceState({ ...historyObject.state, [SYNC_CENTER_SOURCE_KEY]: 'direct' }, '',
        `${locationObject.pathname}${locationObject.search}${SYNC_CENTER_ROUTE}`);
    return true;
}

export function openSyncCenter(historyObject) {
    historyObject.pushState({ ...historyObject.state, [SYNC_CENTER_SOURCE_KEY]: 'settings' }, '', SYNC_CENTER_ROUTE);
}

export function returnToSyncCenterSource({ historyObject, locationObject }) {
    if (historyObject.state?.[SYNC_CENTER_SOURCE_KEY] === 'settings') {
        historyObject.back();
        return 'back';
    }
    historyObject.replaceState(historyObject.state, '', `${locationObject.pathname}${locationObject.search}#settings`);
    return 'replace';
}
