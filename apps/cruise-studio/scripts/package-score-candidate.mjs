/* Assemble the local score release candidate, independently of the published Studio build. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {packagePortPC} from './package-port-pc.mjs';
import {PRO_DIRECTORY} from './edition-layout.mjs';
import {renderOwnerBundle} from './generate-local-chord-owner.mjs';

const repo=fileURLToPath(new URL('../../../',import.meta.url));
const studio='apps/cruise-studio/', viewer='apps/score-viewer/', standalone=viewer+'standalone/';
const candidate=studio+'edition-candidates/score/';
const version='0.205.0-rc.2';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');

function enableScore(html,edition) {
    const panel='<section id="screen-score-viewer" class="screen hidden" hidden inert tabindex="-1" aria-label="譜面ビューワー"><header class="screen-header"><h1>譜面ビューワー</h1><button type="button" class="sv-dock-button" data-open-tool="scoreViewer">右窓で表示</button><a class="sv-standalone-link" href="/'+standalone+'?from='+edition+'">スマホ・オフライン画面</a></header><div id="score-viewer-host"></div></section>';
    const icon='<img class="home-port-icon" src="/'+studio+'assets/tool-sheet.svg" alt="">';
    return html.replace(/((?:theme|print|melody-editor)\.css|(?:melody-editor|melody-commands|melody-staff|melody-notation|schema2|common-music-model|editing-session|score-workspace|operation-adapter|song-model|sheet-renderer|sheet-cruise)\.js)\?v=[^"]+/g,'$1?v='+version)
        .replace(/<button\b[^>]*data-(?:home-)?workspace="sheetCruise"[^>]*>[\s\S]*?<\/button>/g,button=>
        button.replace(' disabled aria-disabled="true" data-coming-soon','').replace('<small class="coming-soon-label">Coming soon…</small>',''))
        .replace(/js\/core\/release-features\.js\?v=[^"]+/,'js/core/score-candidate-features.js?v='+version)
        .replace(/(<select id="sc-time-sig">[\s\S]*?<option value="4\/4">4\/4<\/option>)(\s*<\/select>)\s*<span class="form-note">他の拍子は将来対応<\/span>/,'$1<option value="3/4">3/4</option>$2')
        .replace('<section id="screen-home"',panel+'<section id="screen-home"')
        .replace(/(<button[^>]*data-home-workspace="portNews"[\s\S]*?<\/button>)/,'$1<button type="button" id="open-score-viewer" data-home-workspace="scoreViewer">'+icon+'<strong>譜面ビューワー</strong><span class="home-tool-tip">演奏用の譜面を開く</span></button>')
        .replace(/(<button[^>]*data-workspace="portNews"[\s\S]*?<\/button>)/,'$1<button type="button" data-workspace="scoreViewer" title="譜面ビューワー">'+icon.replace('class="home-port-icon"','class="nav-icon home-port-icon"')+'譜面ビューワー<span>演奏用の譜面を読む</span></button>')
        .replace(/<link[^>]*href="https:\/\/fonts\.[^"]+"[^>]*>/g,'')
        .replace('</head>','<link rel="stylesheet" href="/'+studio+'assets/chord-owner/fonts.css"><link rel="stylesheet" href="/'+viewer+'ui/viewer.css?v='+version+'"></head>')
        .replace(/(<script src="[^"]*js\/shell\.js[^"]*"><\/script>)/,'<script src="/'+studio+'js/score-viewer-bootstrap.js?v='+version+'"></script><script type="module" src="/'+studio+'js/score-editor-entry.mjs?v='+version+'"></script>$1');
}

export function packageScoreCandidate(output) {
    const base=packagePortPC(output);
    const files=base.files;
    function put(name,bytes) {
        const target=path.join(output,name);
        fs.mkdirSync(path.dirname(target),{recursive:true});
        fs.writeFileSync(target,bytes);
        files[name]=hash(bytes);
    }
    function copy(name,target=name){put(target,fs.readFileSync(path.join(repo,name)));}
    function copyTree(dir,accept=()=>true) {
        const names=[];
        for(const relative of fs.readdirSync(path.join(repo,dir),{recursive:true}).sort()){
            const name=path.posix.join(dir,relative);
            if(fs.statSync(path.join(repo,name)).isFile()&&accept(name)){copy(name);names.push(name);}
        }
        return names;
    }
    for(const name of ['score-editor-entry.mjs','score-viewer-bootstrap.js','score-candidate-features.js']){
        const destination=studio+(name==='score-candidate-features.js'?'js/core/':'js/')+name;
        copy(candidate+name,destination);
    }
    for(const [edition,entry] of [['standard',studio+'index.html'],['pro',studio+PRO_DIRECTORY+'/index.html']]){
        const html=enableScore(fs.readFileSync(path.join(output,entry),'utf8'),edition);
        put(entry,html);
        // Include all resources fetched by these entry documents, including adjacent app icons and Pro's gate.
        for(const [,reference] of html.matchAll(/<(?:script|img|link)\b[^>]*?\b(?:src|href)="([^"]+)"/g)){
            const url=new URL(reference,'https://candidate.invalid/'+entry);
            if(url.origin!=='https://candidate.invalid')continue;
            const name=url.pathname.slice(1);
            if(files[name]||name===studio+'js/chord-owner.mjs')continue;
            copy(name);
        }
    }
    copyTree(studio+'js/modules/sheet-cruise',name=>/\.m?js$/.test(name));
    copyTree(studio+'js/modules/chord',name=>/\.m?js$/.test(name));
    copyTree(studio+'assets/chord-owner');
    copy(studio+'js/score-editor-integration.mjs');
    copy(studio+'js/viewer-host.mjs');
    put(studio+'js/chord-owner.mjs',renderOwnerBundle({includeBookTransfer:false}));
    copy('apps/cruise-port/app-version.js');
    copy('apps/cruise-port/cruise-app-links.js');
    copy('apps/cruise-port/cruise-port-edition.js');
    copy('apps/rhythm-cruise/js/official-patterns.mjs');
    copy('apps/chord-cruise/js/ui/fretboard.js');
    copyTree(studio+'vendor/guitar');
    copyTree(studio+'vendor/piano');
    copyTree(viewer+'ui');copyTree(viewer+'core');
    copyTree(viewer+'vendor/html2canvas');
    const pdf=copyTree(viewer+'vendor/pdfjs');
    for(const name of ['index.html','boot.mjs','manifest.webmanifest','sw.js'])copy(candidate+'standalone/'+name,standalone+name);
    for(const name of ['icon-192.png','icon-512.png','offline.mjs','local.css']){
        const target=name==='local.css'?'standalone.css':name;
        copy(viewer+'local/'+name,standalone+target);
    }
    const index=standalone+'index.html';
    put(index,fs.readFileSync(path.join(output,index),'utf8').replace('</head>','<meta name="pro-entry" content="/'+studio+PRO_DIRECTORY+'/"></head>'));
    // Only the reader's static dependency closure is eligible for offline use.
    const seen=new Set();
    const queue=[index,standalone+'manifest.webmanifest',standalone+'icon-192.png',standalone+'icon-512.png',
        viewer+'core/offline-worker.js',studio+'vendor/piano/salamander-bank.js',studio+'vendor/guitar/acoustic-bank.js',
        ...pdf.filter(name=>/\.(?:mjs|bcmap|ttf|pfb|wasm|icc)$/.test(name))];
    while(queue.length){
        const name=queue.pop();
        if(seen.has(name))continue;
        if(!files[name]||/\/scripts\/|\/shared\/|\/cloud\/|\/sync\/|project-repository|editing-session/.test(name))throw Error('Unexpected offline dependency: '+name);
        seen.add(name);
        if(name.startsWith(viewer+'vendor/'))continue;
        const content=fs.readFileSync(path.join(output,name),'utf8');
        const refs=name.endsWith('.html')?content.matchAll(/<(?:script|img|link)\b[^>]*?\b(?:src|href)="([^"]+)"/g):
            /\.m?js$/.test(name)?content.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*)['"]((?:\.{1,2}\/|\/)[^'"]+)['"]/g):
            name.endsWith('.css')?content.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g):[];
        for(const [,ref] of refs){
            const url=new URL(ref,'https://candidate.invalid/'+name);
            if(url.origin==='https://candidate.invalid')queue.push(url.pathname.slice(1));
        }
    }
    const assets=[...seen].sort().map(name=>({path:'/'+name,sha256:files[name],bytes:fs.statSync(path.join(output,name)).size}));
    const cacheVersion=version+'-'+hash(JSON.stringify(assets)+files[standalone+'sw.js']).slice(0,12);
    put(standalone+'asset-list.js','self.VIEWER_ASSETS='+JSON.stringify({version:cacheVersion,assets})+';\n');
    for(const name of ['LICENSE','NOTICE','SECURITY-AND-AI-POLICY.md'])copy(name);
    const manifest={...base,version,channel:'local-score-release-candidate',standardPublished:undefined,
        scoreEditions:['standard','pro'],viewerEntry:standalone+'index.html',files,productionReady:false};
    fs.writeFileSync(path.join(output,'RELEASE-MANIFEST.json'),JSON.stringify(manifest,null,2)+'\n');
    return manifest;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    const flag=process.argv.indexOf('--out');
    if(flag<0||!process.argv[flag+1])throw Error('Specify --out with a new external directory');
    const m=packageScoreCandidate(path.resolve(process.argv[flag+1]));console.log(m.version,Object.keys(m.files).length,'files');
}
