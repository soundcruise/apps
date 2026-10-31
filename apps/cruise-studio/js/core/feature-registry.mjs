export { getComponentMetadata, getAppVersion, listComponents } from './component-metadata.mjs?v=0.53.1';

function freeze(value) {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
}

const portPolicy = key => ({ sourcePath: 'apps/cruise-port/cruise-port-capabilities.js', key });
const chordPolicy = key => ({ sourcePath: 'apps/chord-cruise/js/core/feature-access.js', key });
const portData = { dataOwner: 'port', syncOwner: 'port' };

function feature(featureId, ownerApp, supportedPresentations, extra = {}) {
    return {
        featureId, ownerApp, appVersionRef: ownerApp,
        supportedPresentations,
        // Only existing Studio presentations; a mobile UI/link is not a renderer.
        implementedPresentations: [],
        // An empty mapping/array means no recorded product-policy reference.
        // It NEVER means access is granted or all execution checks are satisfied.
        actionCapabilityRequirements: {},
        ...extra
    };
}

const features = freeze([
    feature('port.home', 'cruise-port', ['main'], { implementedPresentations: ['main'] }),
    feature('port.myApps', 'cruise-port', ['main', 'separate-workspace'], {
        ...portData, implementedPresentations: ['separate-workspace'],
        actionCapabilityRequirements: {
            createApp: [portPolicy('myAppsCreateLimit')],
            writeCustomIcon: [portPolicy('customMyAppIconWrite')]
        }
    }),
    feature('port.tuner', 'cruise-port', ['dock', 'drawer', 'separate-workspace'], {
        ...portData, implementedPresentations: ['separate-workspace'], requiredPermission: { startCapture: ['microphone'] }, audioRole: ['capture'],
        actionCapabilityRequirements: { changeCapo: [portPolicy('tunerCapo')] }
    }),
    feature('port.metronome', 'cruise-port', ['dock', 'drawer'], {
        ...portData, audioRole: ['click'], implementedPresentations: ['dock'],
        schemaRef: { kind: 'storage-schema', path: 'apps/cruise-port/metronome-store.js', symbol: 'METRONOME_SCHEMA_VERSION' },
        actionCapabilityRequirements: {
            changeBpm: [], advancedSettings: [portPolicy('metronomeAdvanced')],
            savePreset: [portPolicy('metronomePresetWrite')]
        }
    }),
    feature('port.practice', 'cruise-port', ['main', 'separate-workspace'], {
        ...portData, implementedPresentations: ['main'],
        actionCapabilityRequirements: {
            createMenu: [portPolicy('practiceMenuCreateLimit')],
            attachFile: [portPolicy('practiceFileWrite')]
        }
    }),
    feature('port.calendar', 'cruise-port', ['main', 'separate-workspace'], portData),
    feature('port.gear', 'cruise-port', ['main', 'inspector'], {
        ...portData, implementedPresentations: ['main'], actionCapabilityRequirements: { writePhoto: [portPolicy('gearPhotoWrite')] }
    }),
    feature('port.news', 'cruise-port', ['main', 'separate-workspace'], { implementedPresentations: ['main'] }),
    feature('port.settings', 'cruise-port', ['separate-workspace'], portData),
    feature('port.accountSync', 'cruise-port', ['separate-workspace'], {
        syncOwner: 'port', actionCapabilityRequirements: { syncOperations: [portPolicy('cloudSyncOperations')] }
    }),
    feature('chord.main', 'chord-cruise', ['inspector', 'tool-pane', 'separate-workspace'], {
        dataOwner: 'chord', syncOwner: 'chord', implementedPresentations: ['inspector'],
        actionCapabilityRequirements: {
            advancedQuality: [chordPolicy('advancedQuality')],
            advancedCaged: [chordPolicy('advancedCaged')],
            saveCustomChord: [chordPolicy('customChordSave')]
        }
    }),
    feature('chord.library', 'chord-cruise', ['tool-pane', 'separate-workspace'], {
        dataOwner: 'chord', syncOwner: 'chord',
        actionCapabilityRequirements: {
            libraryCapacity: [chordPolicy('unlimitedLibrary')],
            exportLibrary: [chordPolicy('advancedExport')],
            saveCustomChord: [chordPolicy('customChordSave')]
        }
    }),
    feature('pitch.training', 'pitch-cruise', ['separate-workspace'], {
        dataOwner: 'pitch', syncOwner: 'pitch', audioRole: ['training', 'preview']
    }),
    feature('fretboard.main', 'fretboard-cruise', ['separate-workspace'], {
        dataOwner: 'fretboard', syncOwner: 'fretboard', audioRole: ['training', 'preview']
    }),
    feature('rhythm.training', 'rhythm-cruise', ['separate-workspace'], {
        dataOwner: 'rhythm', syncOwner: 'rhythm', audioRole: ['training', 'click', 'capture', 'calibration'],
        requiredPermission: { microphoneInput: ['microphone'], microphoneCalibration: ['microphone'] }
    }),
    feature('studio.structure', 'cruise-studio', ['main'], {
        dataOwner: 'cruise-studio', implementedPresentations: ['main'],
        schemaRef: { kind: 'storage-schema', path: 'apps/cruise-studio/js/core/song-model.js', symbol: 'SCHEMA_VERSION' }
    }),
    feature('studio.preDtm', 'cruise-studio', ['main'], {
        dataOwner: 'cruise-studio', implementedPresentations: ['main'],
        schemaRef: { kind: 'storage-schema', path: 'apps/cruise-studio/js/core/song-model.js', symbol: 'SCHEMA_VERSION' }
        // Web Audio preview is not implemented yet: no current audioRole/Sync claim.
    })
]);

const byId = new Map(features.map(item => [item.featureId, item]));
export function getFeatureMetadata(featureId) { return byId.get(featureId) ?? null; }
export function listFeatures() { return features; }
