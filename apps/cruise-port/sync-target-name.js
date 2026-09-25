// One display-name resolver for every Sync Center surface (ⓘ detail, target management, detach
// confirmation, rename dialog). Priority: the user's own name (userLabel) → the label registered
// when the target joined → a display-only short ID. The device ID stays the only identity; a name
// is never used for matching, and duplicate names are allowed (the short ID then tells them apart).

export const USER_LABEL_MAX = 40;

// Same rules as the Worker (normalizeSyncTargetUserLabel): C0/C1 controls (includes newlines and
// tabs), U+2028/U+2029, and bidi marks/embeddings/overrides/isolates are rejected. Built from code
// points so the source carries no raw control characters.
const FORBIDDEN_RANGES = [[0x0, 0x1f], [0x7f, 0x9f], [0x2028, 0x2029], [0x61c, 0x61c], [0x200e, 0x200f],
    [0x202a, 0x202e], [0x2066, 0x2069]];
const FORBIDDEN = new RegExp(`[${FORBIDDEN_RANGES
    .map(([from, to]) => `${String.fromCodePoint(from)}-${String.fromCodePoint(to)}`).join('')}]`, 'u');

// { ok: true, value: string | null } (null resets to the registered name) or { ok: false, reason }.
export function normalizeUserLabel(value) {
    if (value == null) return { ok: true, value: null };
    if (typeof value !== 'string') return { ok: false, reason: 'invalid' };
    if (typeof value.isWellFormed === 'function' && !value.isWellFormed()) return { ok: false, reason: 'invalid' };
    if (FORBIDDEN.test(value)) return { ok: false, reason: 'characters' };
    const normalized = value.normalize('NFC').trim();
    if (!normalized) return { ok: true, value: null };
    return [...normalized].length <= USER_LABEL_MAX ? { ok: true, value: normalized } : { ok: false, reason: 'length' };
}

export function userLabelLength(value) {
    return typeof value === 'string' ? [...value.normalize('NFC').trim()].length : 0;
}

// Display-only short IDs from the device ID (not a credential). Each starts at 4 characters and
// grows only as far as needed to differ from every other target in the same list.
export function shortTargetIds(ids) {
    const normalized = ids.map((id) => (typeof id === 'string' ? id.replace(/[^0-9a-z]/gi, '').toUpperCase() : ''));
    return normalized.map((value, index) => {
        if (!value) return null;
        for (let length = Math.min(4, value.length); length <= value.length; length += 1) {
            const prefix = value.slice(0, length);
            if (!normalized.some((other, otherIndex) => otherIndex !== index && other.startsWith(prefix))) return prefix;
        }
        return value;
    });
}

function cleanName(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// targets: [{ id, userLabel?, registeredLabel? }] from one list (one app's targets, or the Port
// environments). Returns, per target:
//   name        what the row shows (「Pixel」 is shown as Pixel; a registered label as 登録名「…」)
//   reference   how guidance refers to it (「Pixel」 / 登録名「…」 / 同期先 XXXX)
//   secondary   a short second line when it helps: 登録時 <label> · XXXX, or 同期先 XXXX
//   identifiable whether the name alone singles it out in this list
export function describeSyncTargetNames(targets) {
    const list = Array.isArray(targets) ? targets : [];
    const shortIds = shortTargetIds(list.map((target) => target?.id));
    const names = list.map((target) => cleanName(target?.userLabel) || cleanName(target?.registeredLabel));
    return list.map((target, index) => {
        const userLabel = cleanName(target?.userLabel);
        const registeredLabel = cleanName(target?.registeredLabel);
        const displayName = names[index];
        const shortId = shortIds[index];
        const shortText = `同期先 ${shortId || '（IDなし）'}`;
        const identifiable = displayName != null && names.filter((value) => value === displayName).length === 1;
        const name = userLabel || (registeredLabel ? `登録名「${registeredLabel}」` : shortText);
        let secondary = null;
        if (userLabel) {
            secondary = registeredLabel && registeredLabel !== userLabel
                ? `登録時 ${registeredLabel} · ${shortId || 'IDなし'}` : shortText;
        } else if (registeredLabel && !identifiable) {
            secondary = shortText;
        }
        return Object.freeze({
            id: target?.id ?? null,
            name,
            displayName,
            userLabel,
            registeredLabel,
            shortId,
            secondary,
            identifiable,
            reference: identifiable ? (userLabel ? `「${userLabel}」` : name) : shortText
        });
    });
}
