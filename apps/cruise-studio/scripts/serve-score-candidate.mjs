// Serve only the release manifest's files, with offline-only account and network boundaries.
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

export function serveScoreCandidate(directory, port = 0) {
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'RELEASE-MANIFEST.json')));
    if (manifest.channel !== 'local-score-release-candidate') throw Error('Score candidate required');
    const types = {html:'text/html',js:'text/javascript',mjs:'text/javascript',css:'text/css',json:'application/json',
        mp4:'video/mp4',webmanifest:'application/manifest+json',svg:'image/svg+xml',png:'image/png',woff2:'font/woff2',wasm:'application/wasm'};
    const server = http.createServer((request,response) => {
        const url = new URL(request.url,'http://127.0.0.1');
        let name = url.pathname.slice(1);
        if (!name) {
            response.writeHead(302,{Location:'/apps/cruise-studio/'});
            response.end();
            return;
        }
        if (name.endsWith('/')) name += 'index.html';
        if (!['GET','HEAD'].includes(request.method) || !Object.hasOwn(manifest.files,name)) {
            response.writeHead(404);response.end();return;
        }
        const file=path.join(directory,name);
        const size=fs.statSync(file).size;
        const headers={
            'Content-Length':size,
            'Content-Type':types[path.extname(name).slice(1)] || 'application/octet-stream',
            'Cache-Control':'no-store',
            'Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob: data:; worker-src 'self' blob:; connect-src 'self' blob: data:; form-action 'self'; object-src 'none'"
        };
        let range;
        if(name.endsWith('.mp4')){
            headers['Accept-Ranges']='bytes';
            if(request.headers.range){
                const match=/^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
                const start=match && (match[1]?Number(match[1]):Math.max(0,size-Number(match[2])));
                const end=match && (match[1] && match[2]?Math.min(Number(match[2]),size-1):size-1);
                if(!match || start>end || start>=size){
                    response.writeHead(416,{'Content-Range':'bytes */'+size});response.end();return;
                }
                range={start,end};
                headers['Content-Length']=end-start+1;
                headers['Content-Range']='bytes '+start+'-'+end+'/'+size;
            }
        }
        response.writeHead(range?206:200,headers);
        if (request.method === 'HEAD') response.end();
        else {
            const stream=fs.createReadStream(file,range);
            response.on('close',()=>stream.destroy());
            stream.pipe(response);
        }
    });
    return new Promise((resolve,reject) => {
        server.once('error',reject);
        server.listen(port,'127.0.0.1',() => resolve(server));
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const server = await serveScoreCandidate(process.argv[2],Number(process.argv[3] || 0));
    console.log('http://127.0.0.1:'+server.address().port+'/apps/cruise-studio/');
}
