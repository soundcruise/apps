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
    return {score:createUITestProject(),contract:createStudioViewerContract({schema:C.model.schema2,host:realm.window,crypto:webcrypto}),
        metadata:{documentId:'library-fixture',revisionId:'revision-1',exportedAt:'2026-11-16T00:00:00.000Z',studioVersion:'0.145.0-dev.1'}};
}

// One attack in bar 1 spans two barlines. The end of bar 3 is silent, so
// loop boundaries and extra attacks inside the tie can be measured separately.
export function tiedViewerFixture(beats = 4) {
    const fixture = viewerFixture();
    const {score} = fixture;
    const note = score.bars[0].melody[0];
    score.songInfo.title = beats + '/4の小節をまたぐタイの再生確認';
    score.songInfo.timeSignature = {beats, beatUnit:4};
    const barTicks = beats * score.songInfo.ticksPerBeat;
    score.songInfo.bpm = 240;
    for (const bar of score.bars) {
        bar.chords = [];
        bar.melody = [];
        bar.lyrics = bar.lyrics.filter(lyric => lyric.onsetTick < barTicks);
    }
    score.performance.formBindings = [];
    for (const rhythm of score.materials.rhythms) rhythm.snapshot.slots = [];
    score.bars[0].melody = [{...note, id:'test-tie-start', onsetTick:barTicks-480, durationTicks:480, tieToNext:'test-tie-middle'}];
    score.bars[1].melody = [{...note, id:'test-tie-middle', onsetTick:0, durationTicks:barTicks, tieToNext:'test-tie-end'}];
    score.bars[2].melody = [{...note, id:'test-tie-end', onsetTick:0, durationTicks:960}];
    return fixture;
}
