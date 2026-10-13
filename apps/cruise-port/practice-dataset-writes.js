import { writePortStore } from './port-dataset-storage.js?v=1.22.17';
import { savePracticeProgress } from './practice-menu-progress-store.js?v=1.22.17';
import { savePracticeHistory } from './practice-menu-history-store.js?v=1.22.17';
import { savePracticeMenus } from './practice-menu-store.js?v=1.22.17';

export function commitPracticeActivity(progress, history, storage) {
    return writePortStore(storage, ['cruisePort.practiceProgress', 'cruisePort.practiceHistory'], tx => {
        const first = savePracticeProgress(progress, tx);
        return first.ok ? savePracticeHistory(history, tx) : first;
    });
}
export function commitPracticeItemsAndProgress(items, progress, progressChanged, storage) {
    return writePortStore(storage, ['cruisePort.schemaVersion', 'cruisePort.practiceMenus', 'cruisePort.practiceProgress'], tx => {
        const first = progressChanged ? savePracticeProgress(progress, tx) : { ok: true };
        return first.ok ? savePracticeMenus(items, tx) : first;
    });
}
