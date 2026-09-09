import {
    PRACTICE_ATTACHMENT_LIMITS,
    isSafePracticeImagePreview
} from './practice-menu-attachment-store.js?v=0.24.0';

function createPendingAttachmentId() {
    return globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function validatePendingPracticeAttachment(file) {
    if (!(file instanceof Blob) || !file.size) return { ok: false, reason: 'empty-file' };
    const mimeType = typeof file.type === 'string' ? file.type.toLowerCase() : '';
    const image = isSafePracticeImagePreview(mimeType);
    const limit = image ? PRACTICE_ATTACHMENT_LIMITS.imageBytes : PRACTICE_ATTACHMENT_LIMITS.fileBytes;
    if (file.size > limit) return { ok: false, reason: image ? 'image-too-large' : 'file-too-large' };
    return { ok: true, kind: image ? 'image' : 'file', mimeType: mimeType || 'application/octet-stream' };
}

export function appendPendingPracticeAttachments(current, files, { idFactory = createPendingAttachmentId } = {}) {
    const pending = [...current];
    let addedCount = 0;
    for (const file of files) {
        if (pending.length >= PRACTICE_ATTACHMENT_LIMITS.countPerPractice) {
            return { ok: false, pending, addedCount, reason: 'limit-reached' };
        }
        const validation = validatePendingPracticeAttachment(file);
        if (!validation.ok) return { ...validation, pending, addedCount };
        pending.push({
            pendingId: idFactory(),
            blob: file,
            kind: validation.kind,
            mimeType: validation.mimeType,
            fileName: typeof file.name === 'string' && file.name.trim() ? file.name.trim() : '名称未設定ファイル',
            byteSize: file.size
        });
        addedCount += 1;
    }
    return { ok: true, pending, addedCount };
}

export async function savePendingPracticeAttachments(attachmentStore, practiceId, pending) {
    const savedRecords = [];
    for (let index = 0; index < pending.length; index += 1) {
        const entry = pending[index];
        let result;
        try {
            result = await attachmentStore.addAttachment(practiceId, entry.blob, { fileName: entry.fileName });
        } catch (_) {
            result = { ok: false, reason: 'write-failed' };
        }
        if (!result.ok) {
            return {
                ok: false,
                savedRecords,
                remaining: pending.slice(index),
                failed: entry,
                reason: result.reason
            };
        }
        savedRecords.push(result.record);
    }
    return { ok: true, savedRecords, remaining: [] };
}
