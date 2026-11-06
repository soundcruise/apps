import fs from 'node:fs';import path from 'node:path';import {fileURLToPath}from'node:url';import{PRO_DIRECTORY,renderProEntry,renderProManifest}from'./edition-layout.mjs';
const studio=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(studio,PRO_DIRECTORY,'index.html');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,renderProEntry(fs.readFileSync(path.join(studio,'index.html'),'utf8')));console.log(output);

const version=fs.readFileSync(path.join(studio,'js/port-pc.js'),'utf8').match(/CS\.portPC=Object\.freeze\(\{version:'([^']+)'\}\)/)?.[1];if(!version)throw Error('studio-version-required');fs.writeFileSync(path.join(studio,PRO_DIRECTORY,'manifest.webmanifest'),renderProManifest(version));
