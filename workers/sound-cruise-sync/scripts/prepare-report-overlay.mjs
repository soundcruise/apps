// Preparation only: verifies frozen deployed modules, then composes the report wrapper.
// It never calls Cloudflare, uploads a Worker or exports secret binding values.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';
const [baseline,output]=process.argv.slice(2);if(!baseline||!output||fs.existsSync(output))throw Error('provide baseline directory and a new output directory');
const expected={
 'studio-canary-entry.js':'feab28be49b9a93c46295bc014c39b58d90b049a61cc428f1ba7698ff8b7303e',
 'ai-support-candidate.mjs':'7248d7a9a53e23e31d4b9ed6700b1a8999e22e5e1b8af9acde67be6c0ffce3be',
 'production-v148.mjs':'c3e2ecaa06731254201f02fe80d874fb6df9915a86d5e07d102bbd12956d7f7b'
};
for(const [file,hash] of Object.entries(expected))if(createHash('sha256').update(fs.readFileSync(path.join(baseline,file))).digest('hex')!==hash)throw Error('deployed artifact mismatch: '+file);
fs.mkdirSync(output,{recursive:true});for(const file of Object.keys(expected))fs.copyFileSync(path.join(baseline,file),path.join(output,file));
const factory=fileURLToPath(new URL('../src/report-release-entry.js',import.meta.url));
const {build}=createRequire(process.env.REPORT_BUILD_RUNTIME||new URL('../package.json',import.meta.url))('esbuild');
await build({entryPoints:[factory],bundle:true,format:'esm',platform:'browser',outfile:path.join(output,'reports-feature.mjs')});
fs.writeFileSync(path.join(output,'report-overlay.mjs'),`import existing from './studio-canary-entry.js';\nexport * from './studio-canary-entry.js';\nimport {createReportWorker} from './reports-feature.mjs';\nexport default createReportWorker(existing);\n`);
fs.writeFileSync(path.join(output,'wrangler.jsonc'),JSON.stringify({name:'studio-reports-overlay-dry-run-only',main:'report-overlay.mjs',no_bundle:true,find_additional_modules:true,rules:[{type:'ESModule',globs:['**/*.mjs','**/*.js'],fallthrough:true}],compatibility_date:'2026-09-01',vars:{STUDIO_REPORTS_ENABLED:'false',REPORT_INTAKE_ENABLED:'false',REPORT_AI_ENABLED:'false',REPORT_RETENTION_ENABLED:'false'}},null,2));
fs.writeFileSync(path.join(output,'BASELINE.json'),JSON.stringify({version:'ae8d9611-2f3c-45ee-b6ed-e537e8d4da0f',deployment:'2be01215-bfcc-4205-91ab-1e24a22a0d35',modules:expected,configuration:'Not a Production deployment config. Restore verified existing bindings, secrets, vars, routes and cron only after deployment approval.'},null,2));console.log(output);
