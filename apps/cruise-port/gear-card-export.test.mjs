import assert from 'node:assert/strict';
import test from 'node:test';
import { shareGearCardPng } from './gear-card-export.js';

const item = { manufacturer: 'Furch', name: 'Violet Gc-SM' };
const blob = new Blob(['png-data'], { type: 'image/png' });

test('shares a PNG file with the saved gear name', async () => {
    let shared;
    const result = await shareGearCardPng(blob, item, {
        navigatorObject: {
            canShare: ({ files }) => files.length === 1 && files[0].type === 'image/png',
            share: async (data) => { shared = data; }
        },
        downloadBlob: () => assert.fail('download should not run after sharing')
    });
    assert.equal(result, 'shared');
    assert.equal(shared.files[0].name, 'Violet Gc-SM.png');
    assert.equal(shared.title, 'Furch / Violet Gc-SM');
});

test('downloads PNG when file sharing is unavailable', async () => {
    let downloaded;
    const result = await shareGearCardPng(blob, { name: 'QA/機材' }, {
        navigatorObject: { canShare: () => false, share: async () => assert.fail('share should not run') },
        downloadBlob: (data, name) => { downloaded = { data, name }; }
    });
    assert.equal(result, 'downloaded');
    assert.equal(downloaded.data, blob);
    assert.equal(downloaded.name, 'QA_機材.png');
});

test('cancelled native sharing does not start a download', async () => {
    const result = await shareGearCardPng(blob, item, {
        navigatorObject: {
            canShare: () => true,
            share: async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); }
        },
        downloadBlob: () => assert.fail('cancel must not download')
    });
    assert.equal(result, 'cancelled');
});
