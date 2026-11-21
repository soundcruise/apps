import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolveCruiseAppHref} from '../../cruise-port/cruise-app-links.js';
export function chordBookEntry(edition,{fixture=false}={}){
    const directory=resolveCruiseAppHref('chord',edition);
    const template=new URL('../../..'+directory+'index.html',import.meta.url);
    const receiver=fixture?'/apps/cruise-studio/edition-candidates/score/book-save-entry.mjs':'/apps/chord-cruise/js/ui/from-score.mjs';
    let html=fs.readFileSync(template,'utf8')
        .replace(/<link[^>]*href="https:\/\/fonts\.[^"]+"[^>]*>/g,'')
        .replace(/<link rel="preconnect"[^>]*>/g,'')
        .replace(/<script src="[^"]*\/production-config\.js[^"]*"><\/script>/,'')
        .replace(/(ui\/save-editor|js\/app)\.js\?v=[^"]+/g,'$1.js?v=1.25.0-dev.1')
        .replace('</body>','<script type="module" src="'+receiver+'"></script></body>');
    if(fixture)html=html.replace(/<link rel="manifest"[^>]*>/,'');
    return {name:directory.slice(1)+'from-score.html',html};
}
if(process.argv[1]===fileURLToPath(import.meta.url))process.stdout.write(chordBookEntry('standard',{fixture:true}).html);
