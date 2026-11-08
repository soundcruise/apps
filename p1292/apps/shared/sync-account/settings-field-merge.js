(function installSettingsFieldMerge(global) {
  'use strict';

  const root = global.SoundCruiseMultiAppSync = global.SoundCruiseMultiAppSync || {};
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null ||
      Object.getPrototypeOf(value)?.constructor?.name === 'Object');
  const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (!plain(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }

  function equal(left, right) {
    return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
  }

  function pointer(parts) {
    return '/' + parts.map((part) => part.replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
  }

  function mergeSettingsFields(localValues, remoteValues, shadowValues = null, choices = {}) {
    if (!plain(localValues) || !plain(remoteValues) || (shadowValues !== null && !plain(shadowValues))) {
      throw new Error('settings_values_invalid');
    }
    const conflicts = [];
    let automaticCount = 0;

    function mergeNode(parts, localPresent, local, remotePresent, remote, shadowPresent, shadow) {
      if (localPresent && remotePresent && plain(local) && plain(remote) &&
          (!shadowPresent || plain(shadow))) {
        const result = Object.create(null);
        const keys = new Set([...Object.keys(local), ...Object.keys(remote),
          ...(shadowPresent ? Object.keys(shadow) : [])]);
        for (const key of [...keys].sort()) {
          if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            throw new Error('settings_field_invalid');
          }
          const child = mergeNode([...parts, key], own(local, key), local[key], own(remote, key), remote[key],
            shadowPresent && own(shadow, key), shadowPresent ? shadow[key] : undefined);
          if (child.present) result[key] = child.value;
        }
        return { present: true, value: result };
      }
      if (!localPresent && !remotePresent) {
        // A missing field is not evidence of a user deletion. Keep an unknown
        // shadow field until a future client can prove an explicit delete.
        return shadowPresent ? { present: true, value: clone(shadow) } : { present: false };
      }
      if (!localPresent || !remotePresent) {
        automaticCount += 1;
        return { present: true, value: clone(localPresent ? local : remote) };
      }
      if (equal(local, remote)) return { present: true, value: clone(local) };
      if (shadowPresent && equal(local, shadow)) {
        automaticCount += 1;
        return { present: true, value: clone(remote) };
      }
      if (shadowPresent && equal(remote, shadow)) {
        automaticCount += 1;
        return { present: true, value: clone(local) };
      }
      const path = pointer(parts);
      const choice = choices[path];
      conflicts.push({ path, field: parts.at(-1), local: clone(local), remote: clone(remote),
        selected: choice === 'local' || choice === 'remote' ? choice : null });
      return choice === 'local' || choice === 'remote'
        ? { present: true, value: clone(choice === 'local' ? local : remote) }
        : { present: false };
    }

    const result = mergeNode([], true, localValues, true, remoteValues, shadowValues !== null, shadowValues);
    const unresolved = conflicts.filter((field) => !field.selected);
    return Object.freeze({
      values: unresolved.length ? null : clone(result.value),
      conflicts: Object.freeze(conflicts.map(Object.freeze)),
      unresolved: unresolved.length,
      automaticCount
    });
  }

  root.mergeSettingsFields = mergeSettingsFields;
})(globalThis);
