// L2a pure physical contract. No storage, network, Account or product activation.
import { PORT_DATASET_KEYS, PORT_DATASET_CATALOG, PORT_DATASET_PROTOCOL, PORT_DELETE_INTENTS,
    assertPortForwardCompatible, preservePortFields } from './port-dataset-repository.js';
import { AUTHORITY_WRITER_PROTOCOL } from '../shared/sync-account/writer-authority.mjs';
import { canonical, equal, safeEvidence } from './port-migration-contract.mjs';
export { assertPortReferentialIntegrity } from './port-referential-integrity.mjs';
export { PORT_DATASET_KEYS, PORT_DELETE_INTENTS, canonical, equal };
export const AUTHORITY_DB_NAME = 'sound-cruise-port-authority-v1';
// Physical schema inside the v1 major DB. Upgrades are additive whitelisted steps only.
export const AUTHORITY_DB_VERSION = 2;
export const AUTHORITY_STORE_SCHEMA = 1;
export const AUTHORIZATION_MARGIN_MS = 30000;
export const V1_STORE_KEYS = Object.freeze({ records: Object.freeze(['generation','logicalKey','version']),
    manifests: Object.freeze(['generation','manifestId']), head: 'generation', control: 'generation',
    journal: 'migrationId', oplog: Object.freeze(['generation','operationId']), roots: Object.freeze(['generation','rootId']) });
// v2: one partition-wide active pointer, and operation reservations separated from migration journals.
export const STORE_KEYS = Object.freeze({ ...V1_STORE_KEYS, pointer: 'key', reservations: Object.freeze(['generation','operationId']) });
export const COMMIT_STORES = Object.freeze(['pointer','head','control','manifests','records','oplog']);
export const POINTER_KEY = 'active';
export const CONTROL_STATES = Object.freeze(['staging','prepared','sealed','active','superseded','recovery-required']);
export const RESERVED_JOURNAL_PREFIX = 'operation-';
export const fail = code => Object.assign(new Error(code), { code });
export const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };
export const identifier = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw fail('invalid-identity'); return value; };
const object = value => !!value && Object.getPrototypeOf(value) === Object.prototype;
const positive = value => Number.isSafeInteger(value) && value > 0;
const exactKeys = (value, keys) => object(value) && equal(Object.keys(value).sort(), [...keys].sort());
export function assertJSONEvidence(value) {
    if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value))return;
    if(!value||typeof value!=='object'||!Array.isArray(value)&&!object(value))throw fail('non-json-evidence');
    Object.values(value).forEach(assertJSONEvidence);
}

// SHA-256 (FIPS 180-4), synchronous integrity digest only, never authorization.
// Request callbacks cannot await WebCrypto. Tests compare this implementation to
// Node crypto and browser SubtleCrypto, including UTF-8 and padding boundaries.
const K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
const rotate = (n, bits) => (n >>> bits) | (n << (32 - bits));
export function hashText(text) {
    const input = new TextEncoder().encode(text), bytes = new Uint8Array(Math.ceil((input.length + 9) / 64) * 64);
    bytes.set(input); bytes[input.length] = 128;
    const view = new DataView(bytes.buffer), bits = input.length * 8;
    view.setUint32(bytes.length - 8, Math.floor(bits / 0x100000000)); view.setUint32(bytes.length - 4, bits >>> 0);
    const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], w = new Uint32Array(64);
    for (let offset = 0; offset < bytes.length; offset += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
        for (let i = 16; i < 64; i++) {
            const a = w[i-15], b = w[i-2];
            w[i] = (w[i-16] + (rotate(a,7)^rotate(a,18)^(a>>>3)) + w[i-7] + (rotate(b,17)^rotate(b,19)^(b>>>10))) >>> 0;
        }
        let [a,b,c,d,e,f,g,j] = h;
        for (let i = 0; i < 64; i++) {
            const t1 = (j + (rotate(e,6)^rotate(e,11)^rotate(e,25)) + ((e&f)^((~e)&g)) + K[i] + w[i]) >>> 0;
            const t2 = ((rotate(a,2)^rotate(a,13)^rotate(a,22)) + ((a&b)^(a&c)^(b&c))) >>> 0;
            j=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
        }
        [a,b,c,d,e,f,g,j].forEach((n,i)=>{ h[i]=(h[i]+n)>>>0; });
    }
    return h.map(n=>n.toString(16).padStart(8,'0')).join('');
}
export const digest = value => hashText(canonical(value));
export function intents(raw) {
    const value = JSON.parse(raw || '{}');
    if (!object(value)) throw fail('delete-intent-invalid');
    for (const [key, entry] of Object.entries(value)) {
        if (['__proto__','prototype','constructor'].includes(key) || !object(entry) || typeof entry.generation !== 'string' || !entry.generation)
            throw fail('delete-intent-generation-required');
    }
    return value;
}
export function validateDataset(values) {
    if (!exactKeys(values, PORT_DATASET_KEYS)) throw fail('partial-dataset');
    if (Object.values(values).some(raw=>raw !== null && typeof raw !== 'string')) throw fail('invalid-dataset');
    assertPortForwardCompatible(values); intents(values[PORT_DELETE_INTENTS]);
}
export function assertRetainedFields(before, after, keys) {
    for (const key of keys) {
        if (key === PORT_DELETE_INTENTS || before[key] === null || after[key] === null || PORT_DATASET_CATALOG[key]?.scalar) continue;
        const old = JSON.parse(before[key]), next = JSON.parse(after[key]);
        if (!equal(preservePortFields(old, next), next)) throw fail('field-loss');
    }
}
export function validateControl(c) {
    assertJSONEvidence(c);
    if (!object(c) || c.schemaVersion !== 1 || c.repositoryProtocol !== PORT_DATASET_PROTOCOL || c.writerProtocol !== AUTHORITY_WRITER_PROTOCOL ||
        !positive(c.epoch) || !positive(c.fenceEpoch) || !CONTROL_STATES.includes(c.state) ||
        ['suspended','fenceRevoked','identityInvalidated','recoveryRequired'].some(k=>typeof c[k] !== 'boolean')) throw fail('control-invalid');
    identifier(c.generation);
    const i = c.identity;
    if (!object(i) || i.appId !== 'port' || i.datasetOwner !== 'port' || typeof i.partitionId !== 'string' || !i.partitionId ||
        !['unbound-local','bound-account'].includes(i.ownership) || (i.ownership === 'unbound-local' ? i.accountId !== null :
        typeof i.accountId !== 'string' || !i.accountId || !positive(i.accountGeneration) || !positive(i.membershipGeneration) ||
        typeof i.membershipId !== 'string' || !i.membershipId)) throw fail('control-identity-invalid');
    safeEvidence(c);
}
export function assertWritableControl(current, expected) {
    validateControl(current);
    if (current.state !== 'active' || current.recoveryRequired) throw fail('recovery-required');
    if (current.suspended) throw fail('writes-suspended');
    if (current.fenceRevoked || current.identityInvalidated) throw fail('authority-invalidated');
    if (current.epoch !== expected.epoch || current.fenceEpoch !== expected.fenceEpoch || !equal(current.identity, expected.identity)) throw fail('control-stale');
}
export function validateHead(head) {
    if (!exactKeys(head,['schemaVersion','repositoryProtocol','writerProtocol','generation','seq','manifestId','revision','operationId','controlEpoch']) || head.schemaVersion !== 1 || head.repositoryProtocol !== PORT_DATASET_PROTOCOL || head.writerProtocol !== AUTHORITY_WRITER_PROTOCOL ||
        !positive(head.seq) || !positive(head.controlEpoch)) throw fail('head-invalid');
    for (const field of ['generation','manifestId','revision','operationId']) identifier(head[field]);
}
// The single partition-wide statement of which generation is the Port authority.
// A localStorage sentinel or a control row saying "active" never substitutes for it.
export function validatePointer(p) {
    assertJSONEvidence(p);
    if (!exactKeys(p,['key','schemaVersion','partitionId','pointerEpoch','activeGeneration','namespaceVersion','repositoryProtocol',
        'writerProtocol','migrationId','publication','previousGeneration','operationId']) || p.key !== POINTER_KEY || p.schemaVersion !== 1 ||
        typeof p.partitionId !== 'string' || !p.partitionId || !positive(p.pointerEpoch) || p.namespaceVersion !== 1 ||
        p.repositoryProtocol !== PORT_DATASET_PROTOCOL || p.writerProtocol !== AUTHORITY_WRITER_PROTOCOL ||
        !exactKeys(p.publication,['kind','manifestId','headSeq','sealHash','controlEpoch']) ||
        !['migration','isolated-fixture'].includes(p.publication.kind) || !positive(p.publication.headSeq) ||
        !positive(p.publication.controlEpoch) || !/^[a-f0-9]{64}$/.test(p.publication.sealHash)) throw fail('pointer-invalid');
    for (const field of ['activeGeneration','migrationId','operationId']) identifier(p[field]);
    identifier(p.publication.manifestId);
    if (p.previousGeneration !== null) identifier(p.previousGeneration);
    if (p.previousGeneration === p.activeGeneration) throw fail('pointer-invalid');
}
export const reservationKey = (generation, operationId) => RESERVED_JOURNAL_PREFIX + digest([generation, operationId]);
export function validateReservation(r, generation, operationId) {
    assertJSONEvidence(r);
    if (!exactKeys(r,['generation','operationId','schemaVersion','kind','fingerprint','action','policy','targetKeys','origin']) ||
        r.schemaVersion !== 1 || r.generation !== generation || r.operationId !== operationId ||
        !['operation-identity','publication','seal'].includes(r.kind) || !/^[a-f0-9]{64}$/.test(r.fingerprint) ||
        !['v2','v1-journal'].includes(r.origin) || (r.origin === 'v1-journal' ? r.kind !== 'operation-identity' ||
        r.action !== null || r.policy !== null || r.targetKeys !== null : typeof r.action !== 'string' || typeof r.policy !== 'string' ||
        !Array.isArray(r.targetKeys) || r.targetKeys.some(k => typeof k !== 'string'))) throw fail('reservation-invalid');
    identifier(r.generation); identifier(r.operationId);
}
export function validateManifest(m, head) {
    assertJSONEvidence(m);
    if (!exactKeys(m,['schemaVersion','generation','manifestId','seq','revision','parentManifestId','versions','recordDigests','deleteIntents','digest']) || m.schemaVersion !== 1 || !positive(m.seq) || !exactKeys(m.versions, PORT_DATASET_KEYS) || !exactKeys(m.recordDigests, PORT_DATASET_KEYS) ||
        PORT_DATASET_KEYS.some(k=>m.versions[k] !== null && !positive(m.versions[k]) || (m.versions[k] === null ? m.recordDigests[k] !== null : !/^[a-f0-9]{64}$/.test(m.recordDigests[k]))) ||
        !object(m.deleteIntents) || m.parentManifestId !== null && typeof m.parentManifestId !== 'string') throw fail('manifest-invalid');
    for (const field of ['generation','manifestId','revision']) identifier(m[field]);
    if (m.parentManifestId !== null) identifier(m.parentManifestId);
    const {digest: checksum, ...body} = m;
    if (checksum !== digest(body)) throw fail('manifest-digest-invalid');
    intents(JSON.stringify(m.deleteIntents));
    if (head && (m.generation !== head.generation || m.manifestId !== head.manifestId || m.seq !== head.seq || m.revision !== head.revision)) throw fail('head-manifest-mismatch');
}
export function validateRecord(record, generation, logicalKey, version, expectedDigest) {
    if (!exactKeys(record,['schemaVersion','generation','logicalKey','version','raw','digest']) || record.schemaVersion !== 1 || record.generation !== generation || record.logicalKey !== logicalKey || record.version !== version ||
        record.raw !== null && typeof record.raw !== 'string' || record.digest !== digest({generation, logicalKey, version, raw: record.raw}) ||
        record.digest !== expectedDigest) throw fail('record-invalid');
}
export function validateOplog(log, generation, operationId) {
    if (!object(log) || log.schemaVersion !== 1 || log.generation !== generation || log.operationId !== operationId ||
        !/^[a-f0-9]{64}$/.test(log.fingerprint) || !log.result || log.result.ok !== true || log.result.status !== 'committed' ||
        !positive(log.result.seq) || !Number.isFinite(log.result.authorizedAt)) throw fail('oplog-invalid');
    identifier(log.result.manifestId); identifier(log.result.revision);
    if (log.result.operationId !== operationId || log.result.generation !== generation || log.result.publish !== false) throw fail('oplog-invalid');
    safeEvidence(log);
}
// Keep the original fingerprint inference/order so a response-loss request from
// L2b can still replay after this fix. CAS and payload identity are distinct.
export const fingerprintDependencies = keys => [...new Set(keys.flatMap(k=>({
    'cruisePort.practiceMenus':['cruisePort.practiceMenuSets'],
    'cruisePort.practiceMenuSets':['cruisePort.practiceMenus'],
    'cruisePort.syncAssetMetadata':['cruisePort.gearList','cruisePort.myApps','cruisePort.practiceMenus'],
    'cruisePort.gearList':['cruisePort.syncAssetMetadata'], 'cruisePort.myApps':['cruisePort.syncAssetMetadata']
}[k] || [])))];
// Attachment/menu edges are validated on the current merged candidate in both
// directions. Explicit caller/read dependencies are never removed.
export const inferredDependencies = keys => [...new Set(keys.flatMap(key=>fingerprintDependencies([key])
    .filter(dependency=>key!=='cruisePort.syncAssetMetadata'||dependency!=='cruisePort.practiceMenus')))];
export function mergeDeleteIntents(before, next, requested, base, acknowledgements, generation) {
    const merged = structuredClone(intents(before[PORT_DELETE_INTENTS]));
    if (requested !== undefined) {
        const originalIntents = intents(base[PORT_DELETE_INTENTS]);
        for (const [key, intent] of Object.entries(intents(requested))) {
            const original = originalIntents[key];
            if (equal(intent, original)) continue; // an old snapshot is not a new intent
            if (merged[key] !== undefined && !equal(merged[key], original)) throw fail('delete-intent-conflict');
            merged[key] = intent;
        }
    }
    for (const {key, generation: acknowledged} of acknowledgements) if (merged[key]?.generation === acknowledged) delete merged[key];
    const remove = key => { merged[key] = { generation }; };
    for (const [key, spec] of Object.entries(PORT_DATASET_CATALOG)) {
        if (before[key] === next[key]) continue;
        const old = JSON.parse(before[key] || 'null'), value = JSON.parse(next[key] || 'null');
        if (spec.singleton) { if (value === null && old !== null) remove(spec.singleton); else if (old === null && value !== null) delete merged[spec.singleton]; }
        if (!spec.field) continue;
        const prior = old?.[spec.field] || [], rows = value?.[spec.field] || [], ids = new Set(rows.map(r=>r.id)), oldIds = new Set(prior.map(r=>r.id));
        for (const id of ids) if (!oldIds.has(id)) delete merged[`${spec.type}/${id}`];
        for (const id of oldIds) if (!ids.has(id)) remove(`${spec.type}/${id}`);
        if (spec.order) { if (!ids.size && oldIds.size) remove(spec.order); else if (ids.size && !oldIds.size) delete merged[spec.order]; }
        if (spec.type === 'gear_item') for (const status of ['owned','wishlist','sold']) {
            const a = prior.some(r=>r.status===status), b = rows.some(r=>r.status===status);
            if (a && !b) remove(`gear_order/${status}`); else if (!a && b) delete merged[`gear_order/${status}`];
        }
    }
    const assetKey='cruisePort.syncAssetMetadata';
    if(before[assetKey]!==next[assetKey]) {
        const old=JSON.parse(before[assetKey]||'null')?.attachments||{}, rows=JSON.parse(next[assetKey]||'null')?.attachments||{};
        for(const id of Object.keys(rows)) if(!Object.hasOwn(old,id)) delete merged[`practice_attachment/${id}`];
        for(const id of Object.keys(old)) if(!Object.hasOwn(rows,id)) remove(`practice_attachment/${id}`);
        const oldOwners=new Set(Object.values(old).map(e=>e.practiceId)), owners=new Set(Object.values(rows).map(e=>e.practiceId));
        for(const owner of oldOwners) if(!owners.has(owner)) remove(`practice_attachment_set/${owner}`);
        for(const owner of owners) if(!oldOwners.has(owner)) delete merged[`practice_attachment_set/${owner}`];
    }
    return merged;
}
