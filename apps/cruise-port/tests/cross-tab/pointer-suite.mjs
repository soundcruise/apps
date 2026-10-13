// L3b-1 cross-process acceptance: two real renderers, native IndexedDB, isolated
// fixture DB names only. Pointer publication, supersession, crash and v1 upgrade.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const id = prefix => prefix + '-' + randomUUID().slice(0, 8);
export async function runPointerSuite({ evaluate, send, openTab, primaryTab, peerTab, token, paused, crashed, rounds = 3 }) {
    let primary = primaryTab.session; const peer = peerTab.session, results = [], record = (name, detail = {}) => results.push({ name, pass: true, ...detail });
    const call = (session, fn, arg) => evaluate(session, `crossTab.${fn}(${arg === undefined ? '' : JSON.stringify(arg)})`);
    const fresh = async () => {
        const generation = id('g');
        await call(primary, 'prepare', { scenario: 'save-save-same-key', role: 'primary', iterations: 1, generation });
        await call(peer, 'prepare', { scenario: 'save-save-same-key', role: 'peer', iterations: 1, generation });
        return generation;
    };
    const epoch = async () => (await call(peer, 'pointerState')).pointer.pointerEpoch;
    for (let round = 0; round < rounds; round++) {
        // A: the same migrationId published concurrently from two renderers.
        await fresh();
        const ga = id('ga'), ma = id('ma'), before = await epoch();
        await call(primary, 'pointerStage', { generation: ga, migrationId: ma });
        const a = await Promise.all([call(primary, 'pointerPublish', { generation: ga, migrationId: ma, operationId: 'same-'+ma, expectedPointerEpoch: before }),
            call(peer, 'pointerPublish', { generation: ga, migrationId: ma, operationId: 'same-'+ma, expectedPointerEpoch: before })]);
        assert.deepEqual(a.map(r => r.status).sort(), ['already-active', 'published']);
        assert.equal(await epoch(), before + 1);
        // B: different migrationIds race from the same expected pointer.
        const gx = id('gx'), gy = id('gy'), mx = id('mx'), my = id('my'), b0 = await epoch();
        await call(primary, 'pointerStage', { generation: gx, migrationId: mx }); await call(peer, 'pointerStage', { generation: gy, migrationId: my });
        const b = await Promise.all([call(primary, 'pointerPublish', { generation: gx, migrationId: mx, operationId: id('px'), expectedPointerEpoch: b0 }),
            call(peer, 'pointerPublish', { generation: gy, migrationId: my, operationId: id('py'), expectedPointerEpoch: b0 })]);
        assert.deepEqual(b.map(r => r.ok ? r.status : r.reason).sort(), ['pointer-stale', 'published']);
        const won = b[0].ok ? gx : gy, lost = b[0].ok ? gy : gx, state = await call(peer, 'pointerState', lost);
        assert.equal((await call(peer, 'pointerState')).pointer.activeGeneration, won); assert.equal(await epoch(), b0 + 1);
        assert.deepEqual([state.hydrate.state, state.hydrate.activity], ['sealed', 'inactive']);
        // C: pointer switch vs an old handle, both commit orders.
        for (const order of ['switch-first', 'save-first']) {
            await fresh(); const c0 = await epoch(), gc = id('gc'), mc = id('mc'), handle = id('old');
            await call(primary, 'pointerPrepareOld', handle); await call(peer, 'pointerStage', { generation: gc, migrationId: mc });
            if (order === 'switch-first') {
                assert.equal((await call(peer, 'pointerPublish', { generation: gc, migrationId: mc, operationId: id('pc'), expectedPointerEpoch: c0 })).status, 'published');
                assert.equal((await call(primary, 'pointerCommitOld', handle)).reason, 'generation-not-active');
            } else {
                assert.equal((await call(primary, 'pointerCommitOld', handle)).ok, true);
                assert.equal((await call(peer, 'pointerPublish', { generation: gc, migrationId: mc, operationId: id('pc'), expectedPointerEpoch: c0 })).status, 'published');
                const late = id('late'); await call(primary, 'pointerPrepareOld', late);
                assert.equal((await call(primary, 'pointerCommitOld', late)).reason, 'generation-not-active');
            }
        }
        record('A same migrationId / B different migrationId / C pointer switch vs old handle', { round });
    }
    // D: renderer crash inside the publication transaction (after the pointer put request succeeded).
    await fresh();
    const gd = id('gd'), md = id('md'), d0 = await epoch(), previous = (await call(peer, 'pointerState')).pointer.activeGeneration;
    await call(primary, 'pointerStage', { generation: gd, migrationId: md });
    await send('Debugger.enable', {}, primary);
    await send('Runtime.evaluate', { expression: `crossTab.pointerArmCrash();crossTab.pointerPublish(${JSON.stringify({ generation: gd, migrationId: md, operationId: 'crash-publish', expectedPointerEpoch: d0 })});'dispatched'`, returnByValue: true }, primary);
    for (let i = 0; i < 200 && !paused.has(primary); i++) await new Promise(r => setTimeout(r, 25));
    assert(paused.has(primary), 'publication checkpoint not reached');
    await send('Inspector.enable', {}, primary);
    await Promise.race([send('Page.crash', {}, primary), new Promise(r => setTimeout(r, 500))]);
    for (let i = 0; i < 100 && !crashed.has(primary); i++) await new Promise(r => setTimeout(r, 25));
    assert(crashed.has(primary), 'native renderer crash not observed');
    await send('Target.closeTarget', { targetId: primaryTab.target });
    const after = await call(peer, 'pointerState', gd), old = await call(peer, 'pointerState', previous);
    const committed = after.pointer.activeGeneration === gd;
    if (committed) assert.deepEqual([after.pointer.pointerEpoch, after.hydrate.state, old.hydrate.state], [d0 + 1, 'active', 'superseded']);
    else assert.deepEqual([after.pointer.pointerEpoch, after.pointer.activeGeneration, after.hydrate.state, old.hydrate.state], [d0, previous, 'sealed', 'active']);
    primaryTab = await openTab(); primary = primaryTab.session;
    await call(primary, 'claim', token);
    await call(primary, 'prepare', { scenario: 'save-save-same-key', role: 'peer', iterations: 1, generation: gd });
    const retry = await call(primary, 'pointerPublish', { generation: gd, migrationId: md, operationId: 'crash-publish', expectedPointerEpoch: d0 });
    assert.equal(retry.status, committed ? 'already-active' : 'published');
    assert.equal((await call(peer, 'pointerState')).pointer.pointerEpoch, d0 + 1);
    record('D renderer crash inside publication: atomic committed/aborted, retry publishes once', { outcome: committed ? 'committed-with-lost-response' : 'aborted' });
    // E: an open v1 connection during the v2 upgrade (handler closes / no handler blocks).
    const upgraded = 'sound-cruise-port-authority-v1-fixture-' + id('v1up'), blocked = 'sound-cruise-port-authority-v1-fixture-' + id('v1blk');
    await call(peer, 'v1Create', { name: upgraded, handler: true });
    assert.equal((await call(primary, 'v1Open', upgraded)).ok, true);
    assert.deepEqual(await call(peer, 'v1Events'), ['versionchange']);
    const up = await call(primary, 'v1Inspect', upgraded);
    assert.equal(up.version, 2); assert.deepEqual(up.journal.map(j => j.migrationId), ['m-keep']); assert.equal(up.roots.length, 1);
    assert.deepEqual(up.reservations.map(r => [r.operationId, r.origin]), [['pending', 'v1-journal']]); assert.deepEqual(up.pointer.map(p=>[p.key,p.pointerEpoch]), [['namespace',0]]);
    await call(peer, 'v1Create', { name: blocked, handler: false });
    assert.equal((await call(primary, 'v1Open', blocked)).reason, 'open-blocked');
    await call(peer, 'v1Close'); await new Promise(r => setTimeout(r, 100));
    const still = await call(primary, 'v1Inspect', blocked); assert.equal(still.version, 1); assert.equal(still.journal.length, 2);
    record('E v1 connection during upgrade: versionchange close upgrades and moves reservations; no handler blocks and keeps v1');
    // F: corrupt / missing pointer seen from the other renderer.
    const gf = await fresh(); await call(peer, 'pointerPrepareOld', 'before-corruption');
    const saved = await call(primary, 'pointerRaw', 'corrupt');
    const corrupt = await call(peer, 'pointerState', gf); assert.deepEqual([corrupt.pointerStatus, corrupt.hydrate.status], ['recovery-required', 'recovery-required']);
    assert.equal((await call(peer, 'pointerCommitOld', 'before-corruption')).reason, 'pointer-invalid');
    await call(primary, 'pointerRaw', 'delete');
    const missing = await call(peer, 'pointerState', gf); assert.deepEqual([missing.pointer, missing.hydrate.status, missing.hydrate.readOnly], [null, 'recovery-required', true]);
    assert.equal((await call(peer, 'pointerCommitOld', 'before-corruption')).reason, 'pointer-missing');
    await call(primary, 'pointerRaw', saved);
    record('F corrupt pointer is recovery-required; missing published pointer is recovery-required with old writes rejected');
    return { results, primaryTab };
}
