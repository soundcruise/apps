// Test-only FIFO exclusive lock manager. Production always uses native Web Locks.
// Share one instance between contexts in the same simulated storage partition.
export function createFixtureLocks() {
  const tails = new Map();
  return Object.freeze({
    request(name, options, callback) {
      if (typeof options === 'function') { callback = options; options = {}; }
      const previous = tails.get(name) || Promise.resolve();
      const task = previous.catch(() => {}).then(() => {
        if (options.signal?.aborted) throw options.signal.reason || new DOMException('Aborted', 'AbortError');
        return callback({ name, mode: options.mode || 'exclusive' });
      });
      const settled = task.catch(() => {});
      tails.set(name, settled);
      void settled.then(() => { if (tails.get(name) === settled) tails.delete(name); });
      return task;
    }
  });
}
