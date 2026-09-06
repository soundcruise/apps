import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseAndroidPlayPackage,
  parseIosAppStoreId,
  parseStoreIdentity
} from '../src/store-url.js';

test('iOS Store URL parser matches the frontend contract', async (t) => {
  const validCases = [
    ['JP URL', 'https://apps.apple.com/jp/app/example/id123456789', '123456789'],
    ['US URL', 'https://apps.apple.com/us/app/example/id987654321', '987654321'],
    ['language-region URL', 'https://apps.apple.com/en-us/app/example/id123456789', '123456789'],
    ['query and fragment', 'https://apps.apple.com/jp/app/example/id123456789?pt=1#details', '123456789'],
    ['no slug', 'https://apps.apple.com/app/id123456789', '123456789'],
    ['minimum digits', 'https://apps.apple.com/app/id123456', '123456']
  ];

  for (const [name, url, expected] of validCases) {
    await t.test(name, () => assert.equal(parseIosAppStoreId(url), expected));
  }

  const invalidCases = [
    ['invalid host', 'https://apple.com/app/id123456789'],
    ['lookalike host', 'https://apps.apple.com.evil.example/app/id123456789'],
    ['invalid protocol', 'http://apps.apple.com/app/id123456789'],
    ['credentials', 'https://user:pass@apps.apple.com/app/id123456789'],
    ['non-default port', 'https://apps.apple.com:444/app/id123456789'],
    ['missing ID', 'https://apps.apple.com/jp/app/example'],
    ['too-short ID', 'https://apps.apple.com/app/id12345'],
    ['non-numeric ID', 'https://apps.apple.com/app/id12345x'],
    ['encoded slash', 'https://apps.apple.com/app/example%2Fid123456789']
  ];

  for (const [name, url] of invalidCases) {
    await t.test(name, () => assert.equal(parseIosAppStoreId(url), null));
  }
});

test('Android Play URL parser matches the frontend contract', async (t) => {
  const validCases = [
    ['basic', 'https://play.google.com/store/apps/details?id=com.example.app', 'com.example.app'],
    ['extra query', 'https://play.google.com/store/apps/details?id=com.example.app&hl=ja&gl=JP', 'com.example.app'],
    ['underscore', 'https://play.google.com/store/apps/details?id=com.example.app_name', 'com.example.app_name']
  ];

  for (const [name, url, expected] of validCases) {
    await t.test(name, () => assert.equal(parseAndroidPlayPackage(url), expected));
  }

  const invalidCases = [
    ['invalid host', 'https://google.com/store/apps/details?id=com.example.app'],
    ['lookalike host', 'https://play.google.com.evil.example/store/apps/details?id=com.example.app'],
    ['invalid protocol', 'http://play.google.com/store/apps/details?id=com.example.app'],
    ['credentials', 'https://user:pass@play.google.com/store/apps/details?id=com.example.app'],
    ['non-default port', 'https://play.google.com:444/store/apps/details?id=com.example.app'],
    ['invalid path', 'https://play.google.com/apps/details?id=com.example.app'],
    ['missing ID', 'https://play.google.com/store/apps/details'],
    ['duplicate ID', 'https://play.google.com/store/apps/details?id=com.one.app&id=com.two.app'],
    ['invalid package', 'https://play.google.com/store/apps/details?id=invalid'],
    ['invalid segment', 'https://play.google.com/store/apps/details?id=com.example.-app']
  ];

  for (const [name, url] of invalidCases) {
    await t.test(name, () => assert.equal(parseAndroidPlayPackage(url), null));
  }
});

test('Store identities are generated only by the server parser', () => {
  assert.deepEqual(parseStoreIdentity('ios', 'https://apps.apple.com/jp/app/example/id1235601864'), {
    platform: 'ios',
    identifier: '1235601864',
    requestKey: 'ios:1235601864',
    canonicalStoreUrl: 'https://apps.apple.com/app/id1235601864'
  });
  assert.deepEqual(parseStoreIdentity('android', 'https://play.google.com/store/apps/details?id=com.spotify.music&hl=ja'), {
    platform: 'android',
    identifier: 'com.spotify.music',
    requestKey: 'android:com.spotify.music',
    canonicalStoreUrl: 'https://play.google.com/store/apps/details?id=com.spotify.music'
  });
  assert.equal(parseStoreIdentity('android', 'https://apps.apple.com/app/id123456789'), null);
  assert.equal(parseStoreIdentity('ios', 'https://play.google.com/store/apps/details?id=com.example.app'), null);
});
