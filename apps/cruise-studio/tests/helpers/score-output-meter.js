// A silent parallel tap on the mixed Web Audio signal. Report threshold
// crossings and PCM on the audio clock, independent of main-thread callbacks.
class ScoreOutputMeter extends AudioWorkletProcessor {
    constructor() {
        super();
        this.samples = new Float32Array(4096);
        this.offset = 0;
    }
    process(inputs) {
        const channel = inputs[0]?.[0];
        if (channel) {
            if (this.offset === 0) this.startFrame = currentFrame;
            this.samples.set(channel, this.offset);
            this.offset += channel.length;
            if (this.offset === this.samples.length) {
                this.port.postMessage({samples:this.samples, frame:this.startFrame}, [this.samples.buffer]);
                this.samples = new Float32Array(4096);
                this.offset = 0;
            }
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
