'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var pairingUi = fs.readFileSync(path.join(root, 'js/sync/sync-pairing-ui.js'), 'utf8');
var accountJoin = fs.readFileSync(path.join(root, 'js/sync/sync-account-orchestration.js'), 'utf8');
var accountCore = fs.readFileSync(path.join(root, '..', 'shared', 'sync-account', 'sync-account-core.js'), 'utf8');
var accountDb = fs.readFileSync(path.join(root, '..', 'shared', 'sync-account', 'sync-account-db.js'), 'utf8');
var dataDb = fs.readFileSync(path.join(root, '..', 'shared', 'sync-account', 'multi-app-sync-db.js'), 'utf8');
var accountTurnstile = fs.readFileSync(path.join(root, '..', 'shared', 'sync-account', 'sync-account-turnstile.js'), 'utf8');
var syncTurnstile = fs.readFileSync(path.join(root, 'js/sync/sync-turnstile.js'), 'utf8');
var portUi = fs.readFileSync(path.join(root, '..', 'cruise-port', 'sync-center-ui.js'), 'utf8');

assert(accountCore.includes('createSensitiveInputController'), 'shared sensitive input controller exists');
assert(accountCore.includes('RETRYABLE_SENSITIVE_FAILURES'), 'response-loss retry policy is explicit');
assert(accountCore.includes("'network_error'"), 'network failures remain retryable in request memory');

assert(pairingUi.includes('createSensitiveInputController(enrollmentInput)'), 'Enrollment input uses the controller');
assert(pairingUi.includes('enrollmentSecret.reject(started)'), 'Enrollment failure applies the retry policy');
assert(pairingUi.includes('enrollmentSecret.resolve()'), 'Enrollment success discards plaintext');

assert(pairingUi.includes('createSensitiveInputController(input)'), 'Pairing and Recovery inputs use the controller');
assert(pairingUi.includes('pairingSecret.take()'), 'Pairing clears its DOM input before transport');
assert(pairingUi.includes('pairingSecret.reject(paired)'), 'Pairing failure applies the retry policy');
assert(pairingUi.includes('pairingSecret.resolve()'), 'Pairing success discards plaintext');
assert(pairingUi.includes("result.textContent = '接続コードの有効期限が切れました。'"),
    'Pairing issue plaintext is removed when its server validity window ends');
assert(pairingUi.includes('recoverySecret.take()'), 'Recovery clears its DOM input before prepare');
assert(pairingUi.includes('recoverySecret.reject(prepared)'), 'Recovery failure applies the retry policy');
assert(pairingUi.includes('recoverySecret.resolve()'), 'Recovery prepare success discards plaintext');
assert(pairingUi.includes("output.removeAttribute('data-sync-sensitive')"),
    'saved replacement Recovery output loses its sensitive marker with its plaintext');
assert(pairingUi.includes("actions.textContent = '';\n                await onSaved();"),
    'saved Recovery output is removed before the next commit action');

assert(accountJoin.includes("input.setAttribute('data-sync-sensitive', 'join-code-input')"),
    'Chord Join input has the shared avoidance marker');
assert(accountJoin.includes('joinSecret.take()'), 'Chord Join clears the DOM before transport');
assert(accountJoin.includes('joinSecret.reject(reason)'), 'Chord response loss remains retryable in request memory');
assert(accountJoin.includes('input.remove()'), 'Chord complete phase removes its input');

assert(portUi.includes("globalThis.prompt('Multi-App QA Enrollment Codeを入力してください。')"),
    'QA Enrollment uses a transient browser prompt rather than a persistent field');
assert(!/localStorage|sessionStorage|indexedDB/.test(portUi), 'Port sensitive UI does not access browser storage');
assert(accountDb.includes('transient_secret_persistence_blocked'), 'Account storage rejects transient secrets');
assert(dataDb.includes('cross_plane_secret_persistence_blocked'), 'App data storage rejects control-plane secrets');
assert(!accountTurnstile.includes('console.'), 'Account Turnstile token is never logged');
assert(!syncTurnstile.includes('console.'), 'Chord Turnstile token is never logged');
assert(!/localStorage|sessionStorage|indexedDB|history\.|location\.(?:search|hash)/.test(accountTurnstile),
    'Account Turnstile token is not persisted or placed in navigation state');
assert(!/localStorage|sessionStorage|indexedDB|history\.|location\.(?:search|hash)/.test(syncTurnstile),
    'Chord Turnstile token is not persisted or placed in navigation state');

console.log('sync-sensitive-input-lifecycle: Join, Recovery, Pairing and Enrollment plaintext lifecycles passed');
