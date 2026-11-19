// A silent parallel tap on the mixed Web Audio signal. Report threshold
// crossings in audio frames, independent of main-thread callbacks.
class ScoreOutputMeter extends AudioWorkletProcessor {
    process(inputs) {
        const channel = inputs[0]?.[0];
        if (channel) {
            const audible = channel.some(value => Math.abs(value) > .001);
            if (audible !== this.audible) {
                this.port.postMessage({time: currentFrame / sampleRate, audible});
                this.audible = audible;
            }
        }
        return true;
    }
}
registerProcessor('score-output-meter', ScoreOutputMeter);
