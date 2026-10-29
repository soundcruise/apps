import { createRuntime } from './runtime.mjs?v=0.47.21';
import { createReference, TUNING_PRESET_LIST, getTuningTargets, midiToNoteInfo } from './reference.mjs?v=0.47.21';
const CS = globalThis.CruiseStudio;
function initialize() {
    CS.tunerRuntime = createRuntime({ coordinator: CS.audio });
    CS.tunerReference = createReference({ coordinator: CS.audio });
    CS.tunerView = CS.tunerPresentation.mount({ document, shell: CS.shellHost, runtime: CS.tunerRuntime, reference: CS.tunerReference,
        tuning: { presets: TUNING_PRESET_LIST, targets: getTuningTargets, a4: midiToNoteInfo(69) }, coordinator: CS.audio, metronome: CS.metronomeM1 });
    CS.tuner.attach(CS.tunerView, CS.tunerRuntime);
}
if (CS.audio) initialize();
else document.addEventListener('DOMContentLoaded', initialize, { once: true });
