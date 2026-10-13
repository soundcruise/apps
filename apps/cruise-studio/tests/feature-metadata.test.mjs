import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
    getComponentMetadata, getAppVersion, listComponents,
    getFeatureMetadata, listFeatures
} from '../js/core/feature-registry.mjs?v=0.26.9';
import { extractAppVersion, verifyComponentVersion } from '../js/core/version-reader.mjs?v=0.26.9';

const root = new URL('../../../', import.meta.url);
const readSource = path => readFileSync(new URL(path, root), 'utf8');
const rule = { extraction: 'string-constant', symbol: 'VERSION' };

// Fixed feature-to-owner contracts, not selected from the metadata's claims.
const ownerExpectations = Object.fromEntries([
    [['port.home', 'port.news'], 'cruise-port', undefined, undefined],
    [['port.myApps', 'port.tuner', 'port.metronome', 'port.practice', 'port.calendar', 'port.gear', 'port.settings'], 'cruise-port', 'port', 'port'],
    [['port.accountSync'], 'cruise-port', undefined, 'port'],
    [['chord.main', 'chord.library'], 'chord-cruise', 'chord', 'chord'],
    [['pitch.training'], 'pitch-cruise', 'pitch', 'pitch'],
    [['fretboard.main'], 'fretboard-cruise', 'fretboard', 'fretboard'],
    [['rhythm.training'], 'rhythm-cruise', 'rhythm', 'rhythm'],
    [['studio.structure', 'studio.preDtm'], 'cruise-studio', 'cruise-studio', undefined]
].flatMap(([ids, ownerApp, dataOwner, syncOwner]) => ids.map(id => [id, { ownerApp, dataOwner, syncOwner }])));
const permissionExpectations = {
    'port.tuner': { startCapture: ['microphone'] },
    'rhythm.training': { microphoneInput: ['microphone'], microphoneCalibration: ['microphone'] }
};

function assertRequiredOwners(features) {
    const byId = new Map(features.map(feature => [feature.featureId, feature]));
    for (const [id, expected] of Object.entries(ownerExpectations)) {
        const feature = byId.get(id);
        assert.ok(feature, `Missing feature: ${id}`);
        for (const [key, value] of Object.entries(expected)) {
            if (value === undefined) assert.equal(Object.hasOwn(feature, key), false, `${id}.${key} must be absent`);
            else assert.equal(feature[key], value, `${id}.${key}`);
        }
    }
}

function assertRequiredPermissions(features) {
    const byId = new Map(features.map(feature => [feature.featureId, feature]));
    for (const [id, actions] of Object.entries(permissionExpectations)) {
        const feature = byId.get(id);
        assert.ok(feature, `Missing feature: ${id}`);
        for (const [action, permissions] of Object.entries(actions)) {
            assert.deepEqual(feature.requiredPermission?.[action], permissions, `${id}.${action} requires microphone`);
        }
    }
}

test('six unique components and all seventeen requested features', () => {
    const components = listComponents(), features = listFeatures();
    assert.equal(components.length, 6);
    assert.equal(new Set(components.map(item => item.componentId)).size, components.length);
    assert.deepEqual(features.map(item => item.featureId).sort(), [
        'port.home', 'port.myApps', 'port.tuner', 'port.metronome', 'port.practice',
        'port.calendar', 'port.gear', 'port.news', 'port.settings', 'port.accountSync',
        'chord.main', 'chord.library', 'pitch.training', 'fretboard.main',
        'rhythm.training', 'studio.structure', 'studio.preDtm'
    ].sort());
    assert.equal(new Set(features.map(item => item.featureId)).size, features.length);
});

test('known owners/version references and supported vs implemented presentations', () => {
    const allowed = new Set(['main', 'inspector', 'tool-pane', 'dock', 'drawer', 'dialog', 'separate-workspace']);
    for (const feature of listFeatures()) {
        assert.ok(getComponentMetadata(feature.ownerApp));
        assert.equal(feature.appVersionRef, feature.ownerApp);
        assert.ok(getAppVersion(feature.appVersionRef));
        assert.ok(feature.supportedPresentations.length);
        assert.equal(new Set(feature.supportedPresentations).size, feature.supportedPresentations.length);
        feature.supportedPresentations.forEach(value => assert.ok(allowed.has(value), value));
        feature.implementedPresentations.forEach(value => assert.ok(feature.supportedPresentations.includes(value)));
        assert.deepEqual(feature.implementedPresentations, feature.featureId === 'port.metronome' ? ['dock'] : feature.ownerApp === 'cruise-studio' ? ['main'] : []);
    }
});

test('all version projections and the imported Port value equal current source text', () => {
    for (const component of listComponents()) {
        const actual = verifyComponentVersion(component, readSource(component.versionSource.path));
        assert.equal(getAppVersion(component.componentId), actual);
        if (component.versionSource.type === 'source-mirror') {
            assert.equal(component.versionSource.expectedValue, actual);
        }
        assert.throws(() => verifyComponentVersion({ ...component, appVersion: '999.0.0' }, readSource(component.versionSource.path)));
    }
    assert.equal(getComponentMetadata('cruise-port').versionSource.type, 'esm-import');
    assert.equal(getAppVersion('cruise-studio'), '0.26.9');
});

test('literal extraction rejects execution, ambiguity, missing rules and quoted/comment decoys', () => {
    assert.equal(extractAppVersion('export const VERSION = "1.2.3"; // formal version', rule), '1.2.3');
    assert.equal(extractAppVersion('var VERSION = "1.2.3";\r\n', rule), '1.2.3');
    assert.equal(extractAppVersion('/*\nconst VERSION = "9.9.9";\n*/\nconst VERSION = "1.2.3";', rule), '1.2.3');
    assert.equal(extractAppVersion('const docs = `\nconst VERSION = "9.9.9";\n`;\nvar VERSION = "1.2.3";', rule), '1.2.3');
    for (const source of [
        '/*\nconst VERSION = "9.9.9";\n*/',
        'const docs = `\nconst VERSION = "9.9.9";\n`;',
        '// const VERSION = "9.9.9";',
        'const VERSION = runApplication();',
        'const VERSION = "1.2.3";\nconst VERSION = "2.3.4";',
        'const OTHER = "1.2.3";',
        'const VERSION = "1.2.3" + execute();'
    ]) assert.throws(() => extractAppVersion(source, rule));
    assert.throws(() => extractAppVersion('const VERSION = "1.2.3";', { ...rule, extraction: 'eval' }));
    assert.throws(() => extractAppVersion('', { ...rule, symbol: 'x);execute(' }));
});

test('version reader accepts simple single-quoted literals', () => {
    assert.equal(extractAppVersion("const VERSION = '1.2.3';", rule), '1.2.3');
});

test('version reader accepts simple double-quoted literals', () => {
    assert.equal(extractAppVersion('const VERSION = "1.2.3";', rule), '1.2.3');
});

test('version reader rejects continued expressions', () => {
    assert.throws(() => extractAppVersion("const VERSION = '1.2.3'\n    + '-beta';", rule), /Expected one literal declaration/);
});

test('version reader rejects expression initializers', () => {
    assert.throws(() => extractAppVersion('const VERSION = getVersion();', rule), /Expected one literal declaration/);
});

test('version reader requires the declaration semicolon', () => {
    for (const source of ["const VERSION = '1.2.3'", 'var VERSION = "1.2.3"\n', "const VERSION = '1.2.3' // no semicolon"]) {
        assert.throws(() => extractAppVersion(source, rule), /Expected one literal declaration/);
    }
});

test('regex fixtures either extract the real declaration or fail closed', () => {
    assert.equal(extractAppVersion("const format = /^v[0-9]/;\nconst VERSION = '1.2.3';", rule), '1.2.3');
    // Regex grammar is deliberately unsupported; a quote inside one may mask
    // the following declaration. Rejecting it is safer than inventing a value.
    assert.throws(() => extractAppVersion("const quote = /'/;\nconst VERSION = '1.2.3';", rule), /Expected one literal declaration/);
});

// Real policy consumers, independent of the descriptor construction. A key
// must both exist in its product policy and still be used by the real feature.
const consumers = {
    'port.myApps': {
        createApp: ['myAppsCreateLimit', 'apps/cruise-port/my-apps-capabilities.js'],
        writeCustomIcon: ['customMyAppIconWrite', 'apps/cruise-port/my-apps-icon-workflow.js']
    },
    'port.tuner': { changeCapo: ['tunerCapo', 'apps/cruise-port/tuner-app.js'] },
    'port.metronome': {
        advancedSettings: ['metronomeAdvanced', 'apps/cruise-port/metronome-app.js'],
        savePreset: ['metronomePresetWrite', 'apps/cruise-port/metronome-app.js']
    },
    'port.practice': {
        createMenu: ['practiceMenuCreateLimit', 'apps/cruise-port/practice-capabilities.js'],
        attachFile: ['practiceFileWrite', 'apps/cruise-port/practice-menu-app.js']
    },
    'port.gear': { writePhoto: ['gearPhotoWrite', 'apps/cruise-port/gear-photo-workflow.js'] },
    'port.accountSync': { syncOperations: ['cloudSyncOperations', 'apps/cruise-port/sync-center-ui.js'] },
    'chord.main': {
        advancedQuality: ['advancedQuality', 'apps/chord-cruise/js/core/feature-access.js'],
        advancedCaged: ['advancedCaged', 'apps/chord-cruise/js/core/feature-access.js'],
        saveCustomChord: ['customChordSave', 'apps/chord-cruise/js/ui/save-editor.js']
    },
    'chord.library': {
        libraryCapacity: ['unlimitedLibrary', 'apps/chord-cruise/js/core/storage.js'],
        exportLibrary: ['advancedExport', 'apps/chord-cruise/js/ui/library.js'],
        saveCustomChord: ['customChordSave', 'apps/chord-cruise/js/core/storage.js']
    }
};

function assertRequiredPolicies(features) {
    const byId = new Map(features.map(feature => [feature.featureId, feature]));
    for (const [id, actions] of Object.entries(consumers)) {
        const feature = byId.get(id);
        assert.ok(feature, `Missing feature: ${id}`);
        const sourcePath = id.startsWith('port.') ? 'apps/cruise-port/cruise-port-capabilities.js'
            : 'apps/chord-cruise/js/core/feature-access.js';
        for (const [action, [key]] of Object.entries(actions)) {
            assert.deepEqual(feature.actionCapabilityRequirements?.[action], [{ sourcePath, key }], `${id}.${action} required policy`);
        }
    }
    assert.deepEqual(byId.get('port.metronome')?.actionCapabilityRequirements?.changeBpm, [], 'changeBpm must exist with no listed policy');
}

test('action policy references are actual product keys with real consumers; no entitlement values', () => {
    assertRequiredPolicies(listFeatures());
    const portPath = 'apps/cruise-port/cruise-port-capabilities.js';
    const chordPath = 'apps/chord-cruise/js/core/feature-access.js';
    const standard = readSource(portPath).match(/const STANDARD = Object\.freeze\(\{([\s\S]*?)\}\);/)[1];
    const portKeys = new Set([...standard.matchAll(/^\s*(\w+):/gm)].map(match => match[1]));
    const names = readSource(chordPath).match(/var FEATURE_NAMES = \[([\s\S]*?)\];/)[1];
    const chordKeys = new Set([...names.matchAll(/'([^']+)'/g)].map(match => match[1]));
    for (const feature of listFeatures()) {
        for (const [action, refs] of Object.entries(feature.actionCapabilityRequirements)) {
            assert.ok(Array.isArray(refs));
            for (const ref of refs) {
                assert.deepEqual(Object.keys(ref).sort(), ['key', 'sourcePath']);
                assert.ok(ref.sourcePath === portPath || ref.sourcePath === chordPath);
                assert.ok((ref.sourcePath === portPath ? portKeys : chordKeys).has(ref.key), ref.key);
                const [key, path] = consumers[feature.featureId][action];
                assert.equal(ref.key, key);
                assert.match(readSource(path), new RegExp(`(?:\\.${key}\\b|hasFeature\\('${key}'\\))`));
            }
        }
    }
    assert.deepEqual(getFeatureMetadata('port.metronome').actionCapabilityRequirements.changeBpm, []);
    assert.match(readSource('apps/cruise-port/tool-capabilities.js'), /bpm: stored\.bpm/);
});

test('static data/Sync owners equal real adapter appIds; Studio is not a Sync participant', () => {
    assertRequiredOwners(listFeatures());
    const adapters = {
        port: 'apps/cruise-port/port-sync-adapter.js',
        chord: 'apps/chord-cruise/js/sync/sync-core.js',
        pitch: 'apps/pitch-cruise/sync/pitch-sync-adapter.js',
        fretboard: 'apps/fretboard_cruise/sync/fretboard-sync-adapter.js',
        rhythm: 'apps/rhythm-cruise/sync/rhythm-sync-adapter.js'
    };
    for (const [appId, path] of Object.entries(adapters)) {
        assert.match(readSource(path), new RegExp(`(?:const|var) APP_ID = '${appId}'`));
    }
});

test('critical presentation contracts include selected-bar Chord Inspector and existing Studio main', () => {
    const presentations = {
        'port.metronome': [['dock', 'drawer'], ['dock']],
        'port.tuner': [['dock', 'drawer', 'separate-workspace'], []],
        'chord.main': [['inspector', 'tool-pane', 'separate-workspace'], []],
        'chord.library': [['tool-pane', 'separate-workspace'], []],
        'studio.structure': [['main'], ['main']],
        'studio.preDtm': [['main'], ['main']]
    };
    for (const [id, [supported, implemented]] of Object.entries(presentations)) {
        assert.deepEqual(getFeatureMetadata(id).supportedPresentations, supported, id);
        assert.deepEqual(getFeatureMetadata(id).implementedPresentations, implemented, id);
    }
    assert.match(readSource('apps/cruise-studio/docs/SHELL_CONTRACT.md'), /選択小節のChord候補 \| Inspector/);
    assert.match(readSource('apps/cruise-studio/docs/FEATURE_METADATA.md'), /chord\.main \| inspector（選択小節）/);
});

test('storage schema refs are distinct from app versions, cache keys, Sync/API/build versions', () => {
    const model = readSource('apps/cruise-studio/js/core/song-model.js');
    assert.match(model, /var SCHEMA_VERSION = 1;/);
    assert.match(model, /var APP_VERSION = '0\.26\.9';/);
    const schema = getFeatureMetadata('studio.structure').schemaRef;
    assert.equal(schema.kind, 'storage-schema');
    assert.equal(schema.symbol, 'SCHEMA_VERSION');
    assert.equal(Object.hasOwn(schema, 'appVersion'), false);
    assert.equal(getFeatureMetadata('port.metronome').schemaRef.symbol, 'METRONOME_SCHEMA_VERSION');
    assert.match(readSource('apps/cruise-port/metronome-store.js'), /METRONOME_SCHEMA_VERSION = 3;/);
    assert.equal(Object.hasOwn(getComponentMetadata('cruise-studio'), 'schemaVersion'), false);
});

test('permissions are action requirements, never output/autoplay or actual results; roles may be plural', () => {
    assertRequiredPermissions(listFeatures());
    const roles = new Set(['click', 'preview', 'training', 'capture', 'calibration', 'playback']);
    for (const feature of listFeatures()) {
        feature.audioRole?.forEach(role => assert.ok(roles.has(role)));
        for (const permissions of Object.values(feature.requiredPermission ?? {})) {
            assert.deepEqual(permissions, ['microphone']);
        }
    }
    assert.equal(Object.hasOwn(getFeatureMetadata('port.metronome'), 'requiredPermission'), false);
    assert.equal(Object.hasOwn(getFeatureMetadata('pitch.training'), 'requiredPermission'), false);
    assert.equal(Object.hasOwn(getFeatureMetadata('studio.preDtm'), 'audioRole'), false);
    assert.match(readSource('apps/cruise-port/tuner-audio.js'), /getUserMedia\(TUNER_AUDIO_CONSTRAINTS\)/);
    assert.match(readSource('apps/rhythm-cruise/script.js'), /async function startMic\(\)/);
    assert.ok(getFeatureMetadata('rhythm.training').audioRole.length > 1);
});

test('memory mutation deleting required policies is rejected', () => {
    const mutated = structuredClone(listFeatures());
    mutated.forEach(feature => {
        feature.actionCapabilityRequirements = feature.featureId === 'port.metronome' ? { changeBpm: [] } : {};
    });
    assert.throws(() => assertRequiredPolicies(mutated), /required policy/);
    for (const [id, actions] of Object.entries(consumers)) {
        for (const action of Object.keys(actions)) {
            const missing = structuredClone(listFeatures());
            delete missing.find(feature => feature.featureId === id).actionCapabilityRequirements[action];
            assert.throws(() => assertRequiredPolicies(missing), /required policy/);
        }
    }
});

test('memory mutation deleting required microphone actions is rejected', () => {
    for (const [id, actions] of Object.entries(permissionExpectations)) {
        const missing = structuredClone(listFeatures());
        delete missing.find(feature => feature.featureId === id).requiredPermission;
        assert.throws(() => assertRequiredPermissions(missing), /requires microphone/);
        for (const action of Object.keys(actions)) {
            const missingAction = structuredClone(listFeatures());
            delete missingAction.find(feature => feature.featureId === id).requiredPermission[action];
            assert.throws(() => assertRequiredPermissions(missingAction), /requires microphone/);
        }
    }
});

test('memory mutation changing Port ownership to another real owner is rejected', () => {
    for (const keys of [['dataOwner'], ['syncOwner'], ['dataOwner', 'syncOwner']]) {
        const mutated = structuredClone(listFeatures());
        const metronome = mutated.find(feature => feature.featureId === 'port.metronome');
        keys.forEach(key => { metronome[key] = 'chord'; });
        assert.throws(() => assertRequiredOwners(mutated), /port\.metronome\.(dataOwner|syncOwner)/);
    }
});

test('descriptors contain only static allowed fields and are deeply immutable', () => {
    const allowed = new Set(['featureId', 'ownerApp', 'appVersionRef', 'supportedPresentations',
        'implementedPresentations', 'actionCapabilityRequirements', 'requiredPermission',
        'audioRole', 'schemaRef', 'dataOwner', 'syncOwner']);
    listFeatures().forEach(feature => Object.keys(feature).forEach(key => assert.ok(allowed.has(key), key)));
    function assertFrozen(value) {
        assert.notEqual(typeof value, 'function');
        if (value && typeof value === 'object') {
            assert.ok(Object.isFrozen(value));
            Object.values(value).forEach(assertFrozen);
        }
    }
    assertFrozen(listFeatures()); assertFrozen(listComponents());
    const componentFields = ['appVersion', 'componentId', 'displayName', 'versionSource'];
    listComponents().forEach(component => assert.deepEqual(Object.keys(component).sort(), componentFields));
    assert.throws(() => listFeatures().push({}));
    assert.throws(() => { getFeatureMetadata('port.metronome').actionCapabilityRequirements.savePreset[0].key = 'basic'; });
    assert.throws(() => { getComponentMetadata('cruise-studio').appVersion = '1.0.0'; });
});

test('unknown and prototype-like IDs are safe and return null', () => {
    for (const id of ['missing', '__proto__', 'constructor', 'toString', '', null, undefined, {}]) {
        assert.equal(getComponentMetadata(id), null);
        assert.equal(getFeatureMetadata(id), null);
        assert.equal(getAppVersion(id), null);
    }
});

test('fresh import uses no DOM, storage, permission, audio, network or timers; adds no globals', () => {
    const url = new URL('../js/core/feature-registry.mjs?v=0.26.9', import.meta.url).href;
    const reader = new URL('../js/core/version-reader.mjs?v=0.26.9', import.meta.url).href;
    execFileSync(process.execPath, ['--input-type=module', '-e', `
        import assert from 'node:assert/strict';
        for (const key of ['window', 'document', 'localStorage', 'sessionStorage', 'navigator',
            'fetch', 'XMLHttpRequest', 'AudioContext', 'webkitAudioContext', 'setTimeout',
            'setInterval', 'requestAnimationFrame', 'Worker', 'WebSocket']) {
            Object.defineProperty(globalThis, key, { configurable: true,
                get() { throw new Error('Forbidden import side effect: ' + key); } });
        }
        const before = Reflect.ownKeys(globalThis);
        const registry = await import(${JSON.stringify(url)});
        await import(${JSON.stringify(reader)});
        assert.equal(registry.listFeatures().length, 17);
        assert.deepEqual(Reflect.ownKeys(globalThis), before);
    `], { stdio: 'pipe' });
});

test('protected released apps/shared/Workers have no tracked modifications', () => {
    const output = execFileSync('git', ['diff', 'HEAD', '--name-only', '--',
        'apps/cruise-port/', 'apps/chord-cruise/', 'apps/pitch-cruise/',
        'apps/fretboard_cruise/', 'apps/rhythm-cruise/', 'apps/shared/', 'workers/'],
    { cwd: fileURLToPath(root), encoding: 'utf8' });
    assert.equal(output, '');
});
