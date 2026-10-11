/* Selected descriptor projection of core/feature-registry.mjs: source equality tested.
 * Keeps standalone Studio hosting without executing the Port graph at runtime. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.metronomeMetadata = factory();
})(globalThis, function () {
    function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
    return freeze({
    "featureId": "port.metronome",
    "ownerApp": "cruise-port",
    "appVersionRef": "cruise-port",
    "supportedPresentations": [
        "dock",
        "drawer"
    ],
    "implementedPresentations": [
        "dock"
    ],
    "actionCapabilityRequirements": {
        "changeBpm": [],
        "advancedSettings": [
            {
                "sourcePath": "apps/cruise-port/cruise-port-capabilities.js",
                "key": "metronomeAdvanced"
            }
        ],
        "savePreset": [
            {
                "sourcePath": "apps/cruise-port/cruise-port-capabilities.js",
                "key": "metronomePresetWrite"
            }
        ]
    },
    "dataOwner": "port",
    "syncOwner": "port",
    "audioRole": [
        "click"
    ],
    "schemaRef": {
        "kind": "storage-schema",
        "path": "apps/cruise-port/metronome-store.js",
        "symbol": "METRONOME_SCHEMA_VERSION"
    }
});
});
