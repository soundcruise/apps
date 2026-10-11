// Tests constructing a complete remote record list must opt in to its full-dataset contract.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const context = {};
vm.runInNewContext(readFileSync(new URL('../port-sync-adapter.js', import.meta.url), 'utf8'), context);
export function fixtureFullSnapshot(snapshot) {
    return context.SoundCruisePortSync.fullSnapshot(snapshot.records);
}
