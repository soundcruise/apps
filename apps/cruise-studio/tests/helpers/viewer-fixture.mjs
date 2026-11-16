import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import {createRequire} from 'node:module';
import {createUITestProject} from '../../scripts/create-ui-test-project.mjs';
import {createStudioViewerContract} from '../../js/modules/sheet-cruise/viewer-contract.mjs';
const require=createRequire(import.meta.url);
export function viewerFixture() {
    const realm={window:{CruiseStudio:{},ChordCruise:{},crypto:webcrypto},TextEncoder};
    for(const path of ['../../js/core/music-theory.js','../../js/core/song-model.js','../../../chord-cruise/js/core/music-theory.js'])
        vm.runInNewContext(readFileSync(new URL(path,import.meta.url),'utf8'),realm);
    const C=realm.window.CruiseStudio;C.schema2=require('../../js/core/schema2.js');C.rhythmSnapshots=require('../../js/core/rhythm-snapshot.js');C.model.configureSchema2();
    return {score:createUITestProject(),contract:createStudioViewerContract({schema:C.model.schema2,crypto:webcrypto}),
        metadata:{documentId:'library-fixture',revisionId:'revision-1',exportedAt:'2026-11-16T00:00:00.000Z',studioVersion:'0.145.0-dev.1'}};
}
