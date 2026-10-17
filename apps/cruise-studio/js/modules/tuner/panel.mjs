import { createRuntime } from './runtime.mjs?v=0.43.1';
const CS = globalThis.CruiseStudio;
function initialize() {
    CS.tunerRuntime = createRuntime({ coordinator: CS.audio });
    CS.tunerView = CS.tunerPresentation.mount({ document, shell: CS.shellHost, runtime: CS.tunerRuntime, coordinator: CS.audio, metronome: CS.metronomeM1 });
    CS.tuner.attach(CS.tunerView, CS.tunerRuntime);
}
if (CS.audio) initialize();
else document.addEventListener('DOMContentLoaded', initialize, { once: true });
