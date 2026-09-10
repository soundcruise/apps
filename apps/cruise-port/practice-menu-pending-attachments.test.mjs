import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    appendPendingPracticeAttachments,
    savePendingPracticeAttachments,
    validatePendingPracticeAttachment
} from './practice-menu-pending-attachments.js';
import { PRACTICE_ATTACHMENT_LIMITS } from './practice-menu-attachment-store.js';

function file(name, size, type) {
    const blob = new Blob([new Uint8Array(size)], { type });
    Object.defineProperty(blob, 'name', { value: name });
    return blob;
}

test('pending validation keeps the existing image and general file limits', () => {
    assert.equal(validatePendingPracticeAttachment(file('photo.png', 1, 'image/png')).ok, true);
    assert.equal(validatePendingPracticeAttachment(file('empty.pdf', 0, 'application/pdf')).reason, 'empty-file');
    assert.equal(validatePendingPracticeAttachment(file('photo.png', PRACTICE_ATTACHMENT_LIMITS.imageBytes + 1, 'image/png')).reason, 'image-too-large');
    assert.equal(validatePendingPracticeAttachment(file('score.pdf', PRACTICE_ATTACHMENT_LIMITS.fileBytes + 1, 'application/pdf')).reason, 'file-too-large');
});

test('multiple files stay in memory with stable transient ids until explicitly saved', () => {
    let id = 0;
    const result = appendPendingPracticeAttachments([], [
        file('photo.png', 8, 'image/png'),
        file('score.pdf', 9, 'application/pdf')
    ], { idFactory: () => `pending-${++id}` });
    assert.equal(result.ok, true);
    assert.equal(result.addedCount, 2);
    assert.deepEqual(result.pending.map(({ pendingId, fileName, kind }) => ({ pendingId, fileName, kind })), [
        { pendingId: 'pending-1', fileName: 'photo.png', kind: 'image' },
        { pendingId: 'pending-2', fileName: 'score.pdf', kind: 'file' }
    ]);
});

test('pending selection stops at ten without writing attachments', () => {
    let writes = 0;
    const result = appendPendingPracticeAttachments(
        [],
        Array.from({ length: 11 }, (_, index) => file(`${index}.txt`, 1, 'text/plain')),
        { idFactory: () => String(++writes) }
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'limit-reached');
    assert.equal(result.pending.length, PRACTICE_ATTACHMENT_LIMITS.countPerPractice);
    assert.equal(writes, PRACTICE_ATTACHMENT_LIMITS.countPerPractice, 'only transient ids are created');
});

test('attachments are linked only after a practice id is supplied', async () => {
    const calls = [];
    const pending = appendPendingPracticeAttachments([], [file('score.pdf', 9, 'application/pdf')], { idFactory: () => 'pending-1' }).pending;
    assert.equal(calls.length, 0, 'selecting a pending file does not touch IndexedDB');
    const result = await savePendingPracticeAttachments({
        async addAttachment(practiceId, blob, options) {
            calls.push({ practiceId, blob, options });
            return { ok: true, record: { id: 'saved-1', practiceId } };
        }
    }, 'practice-1', pending);
    assert.equal(result.ok, true);
    assert.equal(result.savedRecords.length, 1);
    assert.deepEqual(calls.map(({ practiceId, options }) => ({ practiceId, options })), [
        { practiceId: 'practice-1', options: { fileName: 'score.pdf' } }
    ]);
});

test('partial attachment failure keeps successful records and identifies unsaved files', async () => {
    let call = 0;
    const pending = appendPendingPracticeAttachments([], [
        file('one.pdf', 1, 'application/pdf'),
        file('two.pdf', 1, 'application/pdf'),
        file('three.pdf', 1, 'application/pdf')
    ]).pending;
    const result = await savePendingPracticeAttachments({
        async addAttachment(practiceId) {
            call += 1;
            return call === 2
                ? { ok: false, reason: 'write-failed' }
                : { ok: true, record: { id: `saved-${call}`, practiceId } };
        }
    }, 'practice-1', pending);
    assert.equal(result.ok, false);
    assert.equal(result.savedRecords.length, 1);
    assert.equal(result.failed.fileName, 'two.pdf');
    assert.deepEqual(result.remaining.map(({ fileName }) => fileName), ['two.pdf', 'three.pdf']);
});

test('thrown attachment writes become a controlled failure without a phantom record', async () => {
    const pending = appendPendingPracticeAttachments([], [file('one.pdf', 1, 'application/pdf')]).pending;
    const result = await savePendingPracticeAttachments({
        async addAttachment() { throw new Error('quota'); }
    }, 'practice-1', pending);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'write-failed');
    assert.equal(result.savedRecords.length, 0);
    assert.equal(result.remaining.length, 1);
});

test('create form uses the existing file section with pending removal and the shared Pro lock', () => {
    const source = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
    const markup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    assert.match(markup, /id="practice-form-attachments"[\s\S]*id="practice-form-attachment-input"[^>]*multiple/);
    assert.match(source, /elements\.formAttachments\.hidden = false/);
    assert.match(source, /appendPendingPracticeAttachments\(state\.pendingCreateAttachments, files\)/);
    assert.match(source, /remove\.dataset\.attachmentAction = 'pending-delete'/);
    assert.match(source, /if \(!getCapabilities\(\)\.practiceFileWrite\) \{ requestToolPro\('practiceFile'\); return; \}/);
    assert.ok(source.indexOf('persist([...state.items, item])') < source.indexOf('savePendingPracticeAttachments(practiceAttachmentStore, item.id, pending)'), 'Practice persists before attachments');
    assert.ok(source.indexOf('savePendingPracticeAttachments(practiceAttachmentStore, item.id, pending)') < source.indexOf('if (attachmentResult.ok)'), 'attachment saving completes before choosing the post-create route');
    assert.match(source, /if \(attachmentResult\.ok\) \{[\s\S]*replacePracticeListRoute\(\);[\s\S]*state\.savedNotice[\s\S]*replacePracticeDetailRoute\(item\.id\)/);
    assert.match(source, /if \(view !== elements\.formView && state\.formMode === 'create'\) cleanupPendingPracticeAttachments\(\)/);
});
