// Data only. Never call serialization hooks or evaluate file-supplied markup/URLs.
export function insist(condition, code) { if (!condition) throw Error(code); }
export function assertJSON(value, depth = 0, seen = new Set()) {
    insist(depth < 48, 'json-depth');
    if (value === null || ['string', 'boolean'].includes(typeof value)) return;
    if (typeof value === 'number') { insist(Number.isFinite(value), 'non-json-number'); return; }
    insist(typeof value === 'object' && !seen.has(value), 'non-json-value');
    const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
    if (!array && proto !== null) {
        const ctor = Object.getOwnPropertyDescriptor(proto, 'constructor');
        insist(Object.getPrototypeOf(proto) === null && typeof ctor?.value === 'function' &&
            Function.prototype.toString.call(ctor.value) === Function.prototype.toString.call(Object), 'non-json-object');
    }
    for (let p = proto; p; p = Object.getPrototypeOf(p))
        insist(!Object.getOwnPropertyDescriptor(p, 'toJSON'), 'json-serialization-hook');
    seen.add(value);
    let count = 0;
    for (const key of Reflect.ownKeys(value)) {
        insist(typeof key === 'string' && key !== 'toJSON', 'non-json-key');
        if (array && key === 'length') continue;
        const d = Object.getOwnPropertyDescriptor(value, key);
        insist(Object.hasOwn(d, 'value') && d.enumerable, 'non-json-descriptor');
        if (array) insist(/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length, 'non-json-array-property');
        assertJSON(d.value, depth + 1, seen); count++;
    }
    if (array) insist(count === value.length, 'sparse-json-array');
    seen.delete(value);
}
export function record(value, allowed, required = allowed) {
    insist(value !== null && typeof value === 'object' && !Array.isArray(value), 'invalid-record');
    insist(Object.keys(value).every(k => allowed.includes(k)), 'unknown-field');
    insist(required.every(k => Object.hasOwn(value, k)), 'missing-field');
}
export function clone(value) { return JSON.parse(JSON.stringify(value)); }
export function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.values(value).forEach(freeze); Object.freeze(value);
    }
    return value;
}
// Sorted own keys; no locale, whitespace or original object insertion order involved.
export function canonicalJSON(value) {
    assertJSON(value);
    function encode(v) {
        if (v === null || typeof v !== 'object') return JSON.stringify(v);
        if (Array.isArray(v)) return '[' + Array.prototype.map.call(v, encode).join(',') + ']';
        return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + encode(v[k])).join(',') + '}';
    }
    return encode(value);
}
