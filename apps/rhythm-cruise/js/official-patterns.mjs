/* Rhythm owner canonical basic catalog. No runtime, storage or authorization dependencies. */
// This is the single musical definition shared by the public API and classic UI.
const GROUPS = {
  "2": {
    "grid": "eighth",
    "noteDuration": "8",
    "cellCount": 8,
    "patternBars": 1,
    "states": [
      "hit",
      "rest",
      "tie"
    ],
    "beatLabels": [
      "1",
      "&",
      "2",
      "&",
      "3",
      "&",
      "4",
      "&"
    ],
    "dirs": [
      "down",
      "up",
      "down",
      "up",
      "down",
      "up",
      "down",
      "up"
    ],
    "motion": "alternate",
    "presets": [
      {
        "name": "基本の8ビート",
        "pattern": [
          "hit",
          "hit",
          "hit",
          "hit",
          "hit",
          "hit",
          "hit",
          "hit"
        ]
      },
      {
        "name": "裏だけ",
        "pattern": [
          "rest",
          "hit",
          "rest",
          "hit",
          "rest",
          "hit",
          "rest",
          "hit"
        ]
      },
      {
        "name": "1・3拍強調",
        "pattern": [
          "hit",
          "tie",
          "hit",
          "hit",
          "hit",
          "tie",
          "hit",
          "hit"
        ]
      },
      {
        "name": "2・4拍強調",
        "pattern": [
          "hit",
          "hit",
          "hit",
          "tie",
          "hit",
          "hit",
          "hit",
          "tie"
        ]
      },
      {
        "name": "王道の8分ストローク",
        "pattern": [
          "hit",
          "tie",
          "hit",
          "hit",
          "tie",
          "hit",
          "hit",
          "hit"
        ]
      }
    ]
  },
  "3": {
    "grid": "sixteenth",
    "noteDuration": "16",
    "cellCount": 16,
    "patternBars": 1,
    "states": [
      "hit",
      "rest",
      "tie"
    ],
    "beatLabels": [
      "1",
      "e",
      "&",
      "a",
      "2",
      "e",
      "&",
      "a",
      "3",
      "e",
      "&",
      "a",
      "4",
      "e",
      "&",
      "a"
    ],
    "dirs": [
      "down",
      "up",
      "down",
      "up",
      "down",
      "up",
      "down",
      "up",
      "down",
      "up",
      "down",
      "up",
      "down",
      "up",
      "down",
      "up"
    ],
    "motion": "alternate",
    "presets": [
      {
        "name": "16分の連続",
        "pattern": [
          "hit",
          "hit",
          "hit",
          "hit",
          "hit",
          "hit",
          "hit",
          "hit",
          "hit",
          "hit",
          "hit",
          "hit",
          "hit",
          "hit",
          "hit",
          "hit"
        ]
      },
      {
        "name": "8・16・16の繰り返し",
        "pattern": [
          "hit",
          "tie",
          "hit",
          "hit",
          "hit",
          "tie",
          "hit",
          "hit",
          "hit",
          "tie",
          "hit",
          "hit",
          "hit",
          "tie",
          "hit",
          "hit"
        ],
        "dirs": [
          "down",
          null,
          "up",
          "down",
          "down",
          null,
          "up",
          "down",
          "down",
          null,
          "up",
          "down",
          "down",
          null,
          "up",
          "down"
        ]
      },
      {
        "name": "16分のノリが入るストローク",
        "pattern": [
          "hit",
          "tie",
          "hit",
          "tie",
          "hit",
          "tie",
          "hit",
          "hit",
          "hit",
          "tie",
          "hit",
          "tie",
          "hit",
          "tie",
          "hit",
          "hit"
        ]
      },
      {
        "name": "16分王道のストローク",
        "pattern": [
          "hit",
          "tie",
          "tie",
          "tie",
          "hit",
          "tie",
          "hit",
          "hit",
          "tie",
          "hit",
          "hit",
          "tie",
          "hit",
          "tie",
          "hit",
          "hit"
        ]
      }
    ]
  }
};
const IDS = [
  "rhythm:create-basic:basic-eighth",
  "rhythm:create-basic:offbeat-eighth",
  "rhythm:create-basic:one-three-eighth",
  "rhythm:create-basic:two-four-eighth",
  "rhythm:create-basic:standard-eighth",
  "rhythm:create-basic:continuous-sixteenth",
  "rhythm:create-basic:eighth-two-sixteenths",
  "rhythm:create-basic:mixed-sixteenth",
  "rhythm:create-basic:standard-sixteenth"
];
function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
}
function clone(value) {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
    return value;
}
freeze(GROUPS); freeze(IDS);
const CATALOG = new Map();
let identityIndex = 0;
for (const stageN of [2, 3]) {
    const group = GROUPS[stageN];
    group.presets.forEach((preset, presetIndex) => {
        const cellTicks = group.grid === 'eighth' ? 12 : 6;
        const cells = preset.pattern.map((type, index) => {
            const explicit = Object.hasOwn(preset, 'dirs');
            const raw = explicit ? preset.dirs[index] : undefined;
            const chosen = explicit ? raw : (type === 'hit' ? group.dirs[index] : null);
            const direction = type === 'hit' && chosen === null ? group.dirs[index] : chosen;
            return { id: 'c' + String(index).padStart(2, '0'), tick: index * cellTicks, type,
                direction, directionBasis: explicit ? 'preset-explicit' : (type === 'hit' ? 'stage-default' : 'none'),
                legacyDirManual: type === 'hit' ? true : null };
        });
        const dto = freeze({ patternId: IDS[identityIndex++], patternRevision: 1, name: preset.name,
            encoding: 'rhythm-official-cells-v1', legacyRef: {stageN, presetIndex},
            meter: {beats: 4, beatUnit: 4}, tpq: 24, patternBars: 1, lengthTicks: 96,
            grid: group.grid, cellTicks, feel: 'straight',
            sourceDirections: {stage: clone(group.dirs), preset: preset.dirs ? clone(preset.dirs) : null},
            cells, semanticProfile: 'rhythm-create-basic-v1' });
        CATALOG.set(dto.patternId, dto);
    });
}
function fail(code) { return freeze({ok: false, error: {code}}); }
// Never read caller properties before inspecting their descriptors. Proxy traps may
// themselves run; exceptions are contained, not a claim of arbitrary Proxy purity.
function record(value, allowed) {
    if (value === undefined) return {};
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const proto = Object.getPrototypeOf(value);
    if (proto !== null && proto !== Object.prototype) return null;
    for (let cursor = value; cursor !== null; cursor = Object.getPrototypeOf(cursor)) {
        if (Object.getOwnPropertyDescriptor(cursor, 'toJSON')) return null;
    }
    const result = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
        if (typeof key !== 'string' || !allowed.includes(key)) return null;
        const d = Object.getOwnPropertyDescriptor(value, key);
        if (!Object.hasOwn(d, 'value') || !d.enumerable) return null;
        result[key] = d.value;
    }
    return result;
}
export function listOfficialPatterns(query) {
    try {
        const q = record(query, ['apiVersion', 'collection']);
        if (!q) return fail('invalid-argument');
        if (Object.hasOwn(q, 'apiVersion') && q.apiVersion !== 1) return fail('unsupported-api-version');
        if (Object.hasOwn(q, 'collection') && q.collection !== 'create-basic') return fail('unsupported-collection');
        return freeze({ok: true, apiVersion: 1, patterns: Array.from(CATALOG.values(), p => ({
            patternId: p.patternId, patternRevision: p.patternRevision, name: p.name, grid: p.grid, legacyRef: clone(p.legacyRef)
        }))});
    } catch (_) { return fail('invalid-argument'); }
}
export function getOfficialPattern(patternId, options) {
    try {
        if (typeof patternId !== 'string' || patternId.length > 128) return fail('invalid-argument');
        const q = record(options, ['apiVersion', 'patternRevision']);
        if (!q) return fail('invalid-argument');
        if (Object.hasOwn(q, 'apiVersion') && q.apiVersion !== 1) return fail('unsupported-api-version');
        if (Object.hasOwn(q, 'patternRevision') && (!Number.isSafeInteger(q.patternRevision) || q.patternRevision <= 0)) return fail('invalid-argument');
        if (!CATALOG.has(patternId)) return fail('unknown-pattern');
        const pattern = CATALOG.get(patternId);
        if (Object.hasOwn(q, 'patternRevision') && q.patternRevision !== pattern.patternRevision) return fail('unsupported-pattern-revision');
        return freeze({ok: true, apiVersion: 1, pattern: freeze(clone(pattern))});
    } catch (_) { return fail('invalid-argument'); }
}
// Owner-internal compatibility projection. Consumers use only the public API.
export function getCreateBasicStageDefinition(stageN) {
    return stageN === 2 || stageN === 3 ? clone(GROUPS[stageN]) : null;
}
