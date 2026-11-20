const ROOT = '/apps/score-viewer/standalone/';
if (self.registration.scope !== new URL(ROOT, self.location.origin).href) throw Error('Unexpected viewer scope');
importScripts('./asset-list.js');
const manifest = self.VIEWER_ASSETS, prefix = 'cruise.viewer.standalone.', CACHE = prefix + manifest.version;
const entries = new Map(manifest.assets.map(asset => [asset.path, asset]));
importScripts('../core/offline-worker.js');
