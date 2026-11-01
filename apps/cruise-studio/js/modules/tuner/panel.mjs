import { createRuntime } from './runtime.mjs?v=0.70.0';
const CS = globalThis.CruiseStudio;
function initialize() {
    // The memory-only runtime is retained solely for the score-side quick tool.
    CS.tunerRuntime = createRuntime({ coordinator: CS.audio });
    CS.tuner.attach({ audio: CS.audio, shell: CS.shellHost });
    CS.tunerView = Object.freeze({ async dispose() {
        const surface = await CS.tuner.dispose();
        const quick = await CS.tunerRuntime.dispose();
        return !surface.ok ? surface : quick;
    } });
}
if (CS.audio) initialize();
else document.addEventListener('DOMContentLoaded', initialize, { once: true });
