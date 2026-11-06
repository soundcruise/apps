// Synthetic, deterministic input only. No recorded microphone audio.
export const GUITAR_NOTES = Object.freeze([
    ['E2', 82.406889], ['A2', 110], ['D3', 146.832384],
    ['G3', 195.997718], ['B3', 246.941651], ['E4', 329.627557]
]);
export function analyserSize(sampleRate) {
    let size = 4096;
    while (size < 32768 && size / sampleRate < .08) size *= 2;
    return size;
}
export function guitarSignal({ frequency, sampleRate, amplitude = .08, profile = 'clean', seed = 17, duration = 1.2, onset = .05, sustain = false }) {
    let state = seed >>> 0;
    const random = () => { state = (1664525 * state + 1013904223) >>> 0; return state / 2 ** 31 - 1; };
    return Float32Array.from({ length: Math.ceil(duration * sampleRate) }, (_, i) => {
        const noise = random(), t = i / sampleRate - onset;
        if (t < 0) return profile === 'hiss' ? amplitude * .4 * noise : 0;
        const attack = 1 - Math.exp(-t / .002);
        let value = 0;
        for (let harmonic = 1; harmonic <= 12; harmonic++) {
            const gain = profile === 'weak-fundamental' && harmonic === 1 ? .1 : 1 / harmonic;
            const stiffness = profile === 'inharmonic' ? .00003 : 0;
            const hz = frequency * harmonic * Math.sqrt(1 + stiffness * harmonic * harmonic);
            value += gain * Math.sin(2 * Math.PI * hz * t + harmonic * .37)
                * Math.exp(-(sustain ? Math.min(t, .4) : t) * (1 + .3 * harmonic));
        }
        // Short pick transient, fixed ambient hiss, and independently decaying partials.
        value = amplitude * (attack * value + noise * (.2 * Math.exp(-t / .008) + (profile === 'hiss' ? .4 : .002)));
        return profile === 'clipped' ? Math.max(-amplitude * .6, Math.min(amplitude * .6, value)) : value;
    });
}
export function frameAt(signal, sampleRate, endMs) {
    const frame = new Float32Array(analyserSize(sampleRate));
    const end = Math.min(signal.length, Math.round(endMs * sampleRate / 1000));
    const start = Math.max(0, end - frame.length);
    frame.set(signal.subarray(start, end), frame.length - (end - start));
    return frame;
}
