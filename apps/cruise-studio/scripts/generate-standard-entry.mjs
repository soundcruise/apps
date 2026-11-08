import fs from 'node:fs';import {renderStandardEntry,renderStandardManifest} from './edition-layout.mjs';
const source=fs.readFileSync(new URL('../studio-template.html',import.meta.url),'utf8');

// This source directory is excluded; package step maps it to the reserved root URL.
fs.writeFileSync(new URL('../index.html',import.meta.url),renderStandardEntry(source));
fs.writeFileSync(new URL('../manifest.webmanifest',import.meta.url),renderStandardManifest('0.88.1'));
