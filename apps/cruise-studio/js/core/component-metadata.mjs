// Studio is a reader of released versions. Only this side owns the projections.
import { CRUISE_PORT_APP_VERSION } from '../../../cruise-port/app-version.js?v=1.24.21';

function mirror(componentId, displayName, path, symbol, expectedValue) {
    return Object.freeze({
        componentId, displayName, appVersion: expectedValue,
        versionSource: Object.freeze({
            type: 'source-mirror', path, symbol,
            extraction: 'string-constant', expectedValue
        })
    });
}

const components = Object.freeze([
    Object.freeze({
        componentId: 'cruise-port', displayName: 'Cruise Port',
        appVersion: CRUISE_PORT_APP_VERSION,
        versionSource: Object.freeze({
            type: 'esm-import', path: 'apps/cruise-port/app-version.js',
            symbol: 'CRUISE_PORT_APP_VERSION', extraction: 'string-constant'
        })
    }),
    mirror('chord-cruise', 'Chord Cruise', 'apps/chord-cruise/js/app.js',
        'CHORD_CRUISE_APP_VERSION', '1.21.0'),
    mirror('pitch-cruise', 'Pitch Cruise', 'apps/pitch-cruise/script.js',
        'PITCH_TRAINER_APP_VERSION', '2.30.0'),
    mirror('fretboard-cruise', 'Fretboard Cruise', 'apps/fretboard_cruise/script.js',
        'FRETBOARD_CRUISE_APP_VERSION', '2.25.0'),
    mirror('rhythm-cruise', 'Rhythm Cruise', 'apps/rhythm-cruise/script.js',
        'RHYTHM_CRUISE_VERSION', '1.21.0'),
    mirror('cruise-studio', 'Cruise Studio', 'apps/cruise-studio/js/core/song-model.js',
        'APP_VERSION', '0.47.18')
]);

// The index is private; callers only receive deeply frozen descriptors.
const byId = new Map(components.map(component => [component.componentId, component]));

export function listComponents() { return components; }
export function getComponentMetadata(componentId) { return byId.get(componentId) ?? null; }
export function getAppVersion(componentId) { return getComponentMetadata(componentId)?.appVersion ?? null; }
