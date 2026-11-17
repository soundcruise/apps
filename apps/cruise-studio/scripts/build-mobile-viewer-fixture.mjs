// Isolated static test copy. Never edits product entrypoints or the local worker.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {renderLocalPortViewer} from './local-port-viewer.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url)),local='/apps/score-viewer/local/';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
export function buildMobileViewerFixture({destination,origin}){
 const url=new URL(origin);if(url.origin!==origin||url.protocol!=='https:'||!/^127\.0\.0\.1$|^10\.\d+\.\d+\.\d+$|^192\.168\.\d+\.\d+$|^172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(url.hostname))throw Error('private-https-origin-required');
 const dest=path.resolve(destination);if(dest===root||dest.startsWith(root+path.sep))throw Error('external-temporary-destination-required');
 if(fs.existsSync(dest)&&fs.readdirSync(dest).length)throw Error('destination-not-empty');fs.mkdirSync(dest,{recursive:true,mode:0o700});
 const source=fs.readFileSync(path.join(root,local,'asset-list.js'),'utf8'),original=JSON.parse(source.split('self.VIEWER_LOCAL_ASSETS=')[1].trim().replace(/;$/,''));
 const entries=[];
 for(const asset of original.assets){
  let bytes=asset.path===local+'port.html'?Buffer.from(renderLocalPortViewer()):fs.readFileSync(path.join(root,asset.path));
  if(bytes.length!==asset.bytes||hash(bytes)!==asset.sha256)throw Error('source-asset-mismatch:'+asset.path);
  if(asset.path===local+'boot.mjs'){
   let text=bytes.toString().replace("location.origin!=='http://127.0.0.1:18874'",'location.origin!=='+JSON.stringify(origin));
   text=text.replace("import {mountMockSync} from './mock-sync.mjs';",'');
   text=text.replace("const mock=mountMockSync({button:document.getElementById('viewer-mock-sync'),view,...services});","const mock=null;document.getElementById('viewer-mock-sync')?.remove();");bytes=Buffer.from(text);
  }
  if(asset.path===local+'index.html')bytes=Buffer.from(bytes.toString().replace('<title>','<meta name="mobile-viewer-fixture" content="isolated"><title>'));
  const file=path.join(dest,asset.path);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);entries.push({path:asset.path,bytes:bytes.length,sha256:hash(bytes)});
 }
 const worker=fs.readFileSync(path.join(root,local,'sw.js'),'utf8').replaceAll('http://127.0.0.1:18874',origin).replaceAll('cruise.viewer.local.','cruise.viewer.mobile.fixture.');
 fs.writeFileSync(path.join(dest,local,'sw.js'),worker);
 const manifest={version:'mobile-fixture-'+hash(origin+JSON.stringify(entries)+worker).slice(0,12),assets:entries};fs.writeFileSync(path.join(dest,local,'asset-list.js'),'self.VIEWER_LOCAL_ASSETS='+JSON.stringify(manifest)+';\n');
 const allowed=[...entries.map(a=>a.path),local+'sw.js',local+'asset-list.js'];
 const result={origin,entry:local+'index.html',allowed,files:allowed.length,version:manifest.version};fs.writeFileSync(path.join(dest,'fixture-config.json'),JSON.stringify(result,null,2));return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(JSON.stringify(buildMobileViewerFixture({destination:process.argv[2],origin:process.argv[3]})));
