import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('async function prepareAndOpenGearPhoto('), source.indexOf('function handleGearPhotoRemove('));

test('late gear photo decodes and DB reads do not reopen a crop editor after leaving or replacing the form', async () => {
    for (const name of ['prepareAndOpenGearPhoto', 'openStoredGearPhotoForReadjustment', 'handleGearPhotoReadjust']) {
        for (const leave of [false, true]) {
            let resolve;
            const pending = new Promise(r => { resolve = r; });
            let cleaned = 0, opened = 0;
            const generation = { form: 1 };
            const state = { photoProcessing: false, saving: false, photoAction: 'keep' };
            const prepared = { ok: true, blob: {}, cleanup: () => { cleaned += 1; } };
            const sandbox = { gearPhotoRenderGeneration: generation, gearState: state, guardImageWrite: () => true,
                elements: { gearPhotoStatus: { textContent: '' }, gearPhotoInput: { value: '' } },
                updateGearPhotoControls() {}, findGearItem: () => ({ photoSourceId: 'qa-source' }),
                prepareGearPhotoSource: () => pending,
                prepareMyAppIcon: () => name === 'handleGearPhotoReadjust' ? Promise.resolve(prepared) : pending,
                gearPhotoStore: { getPhoto: () => pending },
                openGearPhotoCropEditor: () => { opened += 1; } };
            vm.createContext(sandbox);
            vm.runInContext(functions, sandbox);
            const operation = vm.runInContext(`${name}({})`, sandbox);
            if (leave) { generation.form += 1; state.photoProcessing = false; }
            resolve(name === 'handleGearPhotoReadjust' ? { ok: true, record: { blob: {} } } : prepared);
            await operation;
            assert.equal(opened, leave ? 0 : 1, name);
            assert.equal(cleaned, leave && name !== 'handleGearPhotoReadjust' ? 1 : 0, name);
            assert.equal(state.photoProcessing, false);
        }
    }
});
