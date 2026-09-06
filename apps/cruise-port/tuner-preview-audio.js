// Acoustic-guitar synthesis values intentionally mirror pitch-cruise/script.js AudioEngine.playAcousticGuitar().
export const TUNER_PREVIEW_DEFAULTS = Object.freeze({
    duration: 1,
    sustainTime: 0.5,
    velocity: 0.7,
    releaseSeconds: 0.06
});

function defaultEnvironment() {
    const globalObject = globalThis;
    return {
        AudioContextClass: globalObject.AudioContext || globalObject.webkitAudioContext,
        documentTarget: globalObject.document,
        windowTarget: globalObject.window,
        navigatorObject: globalObject.navigator
    };
}

function safelyCall(callback) {
    try { callback?.(); } catch (_) { /* Audio nodes may already be stopped or disconnected. */ }
}

export function createTunerPreviewAudioController({ environment = {} } = {}) {
    const platform = { ...defaultEnvironment(), ...environment };
    let context = null;
    let activePlayback = null;

    function requestPlaybackAudioSession() {
        try {
            if (platform.navigatorObject?.audioSession) platform.navigatorObject.audioSession.type = 'playback';
        } catch (_) { /* Audio Session is optional. */ }
    }

    async function ensureContext() {
        if (!platform.AudioContextClass) return null;
        if (!context || context.state === 'closed') context = new platform.AudioContextClass();
        if (context.state === 'suspended' && typeof context.resume === 'function') {
            try { await context.resume(); } catch (_) { return null; }
        }
        return context;
    }

    function stop(releaseSeconds = TUNER_PREVIEW_DEFAULTS.releaseSeconds) {
        if (!activePlayback || !context) return false;
        const playback = activePlayback;
        activePlayback = null;
        const now = context.currentTime;
        const stopAt = now + Math.max(0, releaseSeconds);
        safelyCall(() => playback.outputGain.gain.cancelScheduledValues(now));
        safelyCall(() => playback.outputGain.gain.setValueAtTime(playback.outputGainValue, now));
        safelyCall(() => playback.outputGain.gain.linearRampToValueAtTime(0.0001, stopAt));
        safelyCall(() => playback.source.stop(stopAt));
        return true;
    }

    async function suspend() {
        if (!context || context.state === 'closed' || typeof context.suspend !== 'function') return;
        try { await context.suspend(); } catch (_) { /* Suspension is a best-effort lifecycle cleanup. */ }
    }

    function buildBuffer(audioContext, frequency) {
        const { duration, sustainTime, velocity } = TUNER_PREVIEW_DEFAULTS;
        const sampleRate = audioContext.sampleRate;
        const detuneRatio = 1 + (Math.random() - 0.5) * 0.003;
        const freq = frequency * detuneRatio;
        const sustainSamples = Math.ceil(sampleRate * sustainTime);
        const totalSamples = Math.ceil(sampleRate * (duration + sustainTime));
        const delayLength = Math.max(2, Math.round(sampleRate / freq));
        const output = new Float32Array(totalSamples);
        const delayLine = new Float32Array(delayLength);
        const excitationAmplitude = 0.5 + velocity * 0.5;
        const filterCoeff = 0.40 + velocity * 0.20;
        const freqDecayCorrection = 1.0 - (freq / 8000) * 0.05;
        const decayFactor = Math.pow(0.001, 1 / sustainSamples) * freqDecayCorrection;

        for (let index = 0; index < delayLength; index += 1) {
            delayLine[index] = (Math.random() * 2 - 1) * excitationAmplitude;
        }

        let writePosition = 0;
        let previousSample = 0;
        for (let index = 0; index < totalSamples; index += 1) {
            const currentSample = delayLine[writePosition];
            const filtered = filterCoeff * currentSample + (1 - filterCoeff) * previousSample;
            previousSample = currentSample;
            delayLine[writePosition] = filtered * decayFactor;
            output[index] = currentSample;
            writePosition = (writePosition + 1) % delayLength;
        }

        const pickSamples = Math.min(Math.ceil(sampleRate * 0.006), totalSamples);
        for (let index = 0; index < pickSamples; index += 1) {
            const envelope = Math.exp(-index / Math.max(1, sampleRate * 0.0018));
            output[index] += (Math.random() * 2 - 1) * (0.055 + velocity * 0.06) * envelope;
        }

        const fadeStartSample = Math.floor(totalSamples * 0.80);
        for (let index = fadeStartSample; index < totalSamples; index += 1) {
            const position = (index - fadeStartSample) / (totalSamples - fadeStartSample);
            output[index] *= 0.5 * (1 + Math.cos(Math.PI * position));
        }

        const buffer = audioContext.createBuffer(1, totalSamples, sampleRate);
        buffer.copyToChannel(output, 0);
        return buffer;
    }

    async function play(target) {
        if (!Number.isFinite(target?.targetFrequency) || target.targetFrequency <= 0) return false;
        requestPlaybackAudioSession();
        const audioContext = await ensureContext();
        if (!audioContext) return false;
        stop();

        const source = audioContext.createBufferSource();
        source.buffer = buildBuffer(audioContext, target.targetFrequency);

        const bodyRes1 = audioContext.createBiquadFilter();
        bodyRes1.type = 'peaking'; bodyRes1.frequency.value = 100; bodyRes1.Q.value = 1.5; bodyRes1.gain.value = 4;
        const bodyRes2 = audioContext.createBiquadFilter();
        bodyRes2.type = 'peaking'; bodyRes2.frequency.value = 180; bodyRes2.Q.value = 2; bodyRes2.gain.value = 3;
        const bodyRes3 = audioContext.createBiquadFilter();
        bodyRes3.type = 'peaking'; bodyRes3.frequency.value = 240; bodyRes3.Q.value = 1.2; bodyRes3.gain.value = 1.8;
        const presence = audioContext.createBiquadFilter();
        presence.type = 'peaking'; presence.frequency.value = 2000; presence.Q.value = 1; presence.gain.value = 2;
        const highCut = audioContext.createBiquadFilter();
        highCut.type = 'lowpass'; highCut.frequency.value = 6000; highCut.Q.value = 0.7;
        const outputGain = audioContext.createGain();
        const outputGainValue = 0.25 + TUNER_PREVIEW_DEFAULTS.velocity * 0.35;
        outputGain.gain.value = outputGainValue;

        source.connect(bodyRes1);
        bodyRes1.connect(bodyRes2);
        bodyRes2.connect(bodyRes3);
        bodyRes3.connect(presence);
        presence.connect(highCut);
        highCut.connect(outputGain);
        outputGain.connect(audioContext.destination);

        const startTime = audioContext.currentTime;
        const playback = { source, outputGain, outputGainValue };
        activePlayback = playback;
        source.onended = () => {
            if (activePlayback === playback) activePlayback = null;
        };
        source.start(startTime);
        source.stop(startTime + TUNER_PREVIEW_DEFAULTS.duration + TUNER_PREVIEW_DEFAULTS.sustainTime);
        return true;
    }

    const stopForHiddenDocument = () => {
        if (platform.documentTarget?.hidden) {
            stop();
            void suspend();
        }
    };
    const stopForPageHide = () => {
        stop();
        void suspend();
    };
    platform.documentTarget?.addEventListener?.('visibilitychange', stopForHiddenDocument);
    platform.windowTarget?.addEventListener?.('pagehide', stopForPageHide);

    return {
        play,
        stop,
        suspend,
        getState: () => ({
            hasContext: Boolean(context),
            playing: Boolean(activePlayback),
            contextState: context?.state || 'none'
        }),
        destroy() {
            stop();
            platform.documentTarget?.removeEventListener?.('visibilitychange', stopForHiddenDocument);
            platform.windowTarget?.removeEventListener?.('pagehide', stopForPageHide);
            if (context?.state !== 'closed' && typeof context?.close === 'function') {
                try { void context.close(); } catch (_) { /* noop */ }
            }
            context = null;
        }
    };
}
