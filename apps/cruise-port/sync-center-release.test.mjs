import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { CRUISE_PORT_APP_VERSION } from './app-version.js';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const modules = readdirSync(new URL('.', import.meta.url)).filter(name => name.endsWith('.js'));
const edges = modules.flatMap(importer => [...read(importer).matchAll(/from ['"]\.\/([^'"?]+)\?v=([^'"]+)['"]/g)]
    .map(([, name, key]) => ({ importer, name, key })));
const changed = ['app-version.js', 'sync-center-controller.js', 'sync-center-device-detail.js',
    'sync-center-ui.js', 'sync-center-navigation.js', 'sync-center-orchestrator.js', 'tuner-app.js'];

test('Sync Center patch advances every changed module and transitive caller cache edge', () => {
    assert.equal(CRUISE_PORT_APP_VERSION, '1.31.0');
    for (const name of changed) {
        const incoming = edges.filter(edge => edge.name === name);
        assert.ok(incoming.length, `${name} has a public importer`);
        for (const edge of incoming) {
            assert.equal(edge.key, CRUISE_PORT_APP_VERSION, `${edge.importer} → ${name}`);
            for (const parent of edges.filter(item => item.name === edge.importer)) {
                assert.equal(parent.key, CRUISE_PORT_APP_VERSION, `${parent.importer} → ${edge.importer}`);
            }
        }
    }
    assert.match(read('index.html'), /practice-menu-app\.js\?v=1\.31\.0/);
    assert.match(read('pro_9a3943176561/index.html'), /pro-app-boot\.js\?v=1\.31\.0/);
    assert.match(read('pro-app-boot.js'), /practice-menu-app\.js\?v=1\.31\.0/);
});
