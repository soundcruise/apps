// Registration only: importing the production Repository never imports/opens IDB.
const isolatedBackends = new WeakSet();
export function registerIsolatedRepositoryBackend(backend) {
    isolatedBackends.add(backend);
    return backend;
}
export const isIsolatedRepositoryBackend = backend => isolatedBackends.has(backend);
