/* Loopback-only, viewer-local scope. Never caches credentials or API traffic. */
if(self.location.origin!=='http://127.0.0.1:18874'||self.registration.scope!=='http://127.0.0.1:18874/apps/score-viewer/local/')throw Error('Local viewer scope refused');
importScripts('./asset-list.js');
const manifest=self.VIEWER_LOCAL_ASSETS,prefix='cruise.viewer.local.',CACHE=prefix+manifest.version,ROOT='/apps/score-viewer/local/',entries=new Map(manifest.assets.map(a=>[a.path,a]));
importScripts('../core/offline-worker.js');
