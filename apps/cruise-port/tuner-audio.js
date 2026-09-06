import {
    TUNER_ENGINE_DEFAULTS,
    createDetailedPitchDetector,
    createPitchDetector
} from './tuner-engine.js?v=1.1.2';

const ANALYSIS_INTERVAL_MS = 50;
const BASE_ANALYSER_SIZE = 4096;
const MAX_ANALYSER_SIZE = 32768;
const MIN_WINDOW_SECONDS = 0.08;

export const TUNER_AUDIO_STATES = Object.freeze({
    idle: 'idle',
    starting: 'starting',
    running: 'running',
    error: 'error',
    destroyed: 'destroyed'
});

export const TUNER_AUDIO_CONSTRAINTS = Object.freeze({
    audio: Object.freeze({
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: Object.freeze({ ideal: 1 })
    }),
    video: false
});

function errorDetails(error, fallbackCode = 'unknown') {
    const name = typeof error?.name === 'string' && error.name ? error.name : 'Error';
    const message = typeof error?.message === 'string' ? error.message : '';
    const explicitCode = typeof error?.code === 'string' && error.code ? error.code : null;
    const codes = {
        NotAllowedError: 'permission-denied',
        NotFoundError: 'no-device',
        NotReadableError: 'device-busy',
        SecurityError: 'insecure-context',
        OverconstrainedError: 'constraints',
        AbortError: 'aborted',
        NotSupportedError: 'unsupported'
    };
    return { code: codes[name] || explicitCode || fallbackCode, name, message };
}

function controllerError(code, message, name = 'Error') {
    return { code, name, message };
}

function chooseAnalyserSize(sampleRate) {
    let size = BASE_ANALYSER_SIZE;
    while (size < MAX_ANALYSER_SIZE && size / sampleRate < MIN_WINDOW_SECONDS) size *= 2;
    return size;
}

function stopStreamTracks(stream) {
    if (!stream || typeof stream.getTracks !== 'function') return;
    let tracks;
    try { tracks = stream.getTracks(); } catch (_) { return; }
    for (const track of tracks) {
        try { track.stop(); } catch (_) { /* Continue cleaning the remaining tracks. */ }
    }
}

function disconnectNode(node) {
    if (!node || typeof node.disconnect !== 'function') return;
    try { node.disconnect(); } catch (_) { /* The node may already be disconnected. */ }
}

function closeAudioContext(context) {
    if (!context || context.state === 'closed' || typeof context.close !== 'function') {
        return Promise.resolve();
    }
    try {
        return Promise.resolve(context.close()).catch(() => {});
    } catch (_) {
        return Promise.resolve();
    }
}

function defaultEnvironment() {
    const globalObject = globalThis;
    return {
        navigatorObject: globalObject.navigator,
        AudioContextClass: globalObject.AudioContext || globalObject.webkitAudioContext,
        documentTarget: globalObject.document,
        windowTarget: globalObject.window,
        isSecureContext: globalObject.isSecureContext,
        setTimeout: globalObject.setTimeout?.bind(globalObject),
        clearTimeout: globalObject.clearTimeout?.bind(globalObject),
        now: () => globalObject.performance?.now?.() ?? Date.now(),
        detectorFactory: createPitchDetector,
        detailedDetectorFactory: createDetailedPitchDetector
    };
}

const DIAGNOSTIC_SETTING_KEYS = Object.freeze([
    'sampleRate',
    'channelCount',
    'echoCancellation',
    'noiseSuppression',
    'autoGainControl'
]);

function selectDiagnosticValues(source) {
    const selected = {};
    for (const key of DIAGNOSTIC_SETTING_KEYS) {
        const value = source?.[key];
        if (typeof value === 'boolean' || typeof value === 'string' || Number.isFinite(value)) {
            selected[key] = value;
        }
    }
    return selected;
}

export function createTunerAudioController({
    onResult,
    onInputLevel,
    onDiagnostic,
    onStateChange,
    onError,
    diagnosticEnabled = false,
    rmsThreshold = TUNER_ENGINE_DEFAULTS.rmsThreshold,
    environment = {}
} = {}) {
    const platform = { ...defaultEnvironment(), ...environment };
    let currentRmsThreshold = Number.isFinite(rmsThreshold) && rmsThreshold >= 0
        ? rmsThreshold
        : TUNER_ENGINE_DEFAULTS.rmsThreshold;
    let status = TUNER_AUDIO_STATES.idle;
    let generation = 0;
    let startPromise = null;
    let stream = null;
    let source = null;
    let analyser = null;
    let context = null;
    let samples = null;
    let detector = null;
    let timerId = null;
    let trackSampleRate = null;
    let diagnosticTrackSettings = {};
    let diagnosticSupportedConstraints = {};
    let callbackErrorReported = false;
    const levelEnabled = typeof onInputLevel === 'function';
    const detailedDetectionEnabled = diagnosticEnabled || levelEnabled;
    const trackListeners = new Map();

    function getState() {
        return {
            status,
            sampleRate: context?.sampleRate ?? null,
            trackSampleRate,
            analyserFftSize: analyser?.fftSize ?? null,
            rmsThreshold: currentRmsThreshold,
            destroyed: status === TUNER_AUDIO_STATES.destroyed
        };
    }

    function notifyError(details) {
        if (typeof onError !== 'function') return;
        try { onError(details); } catch (_) { /* Consumer errors must not break cleanup. */ }
    }

    function reportCallbackError(error) {
        if (callbackErrorReported) return;
        callbackErrorReported = true;
        notifyError(errorDetails(error, 'callback-error'));
    }

    function notify(callback, value) {
        if (typeof callback !== 'function') return;
        try { callback(value); } catch (error) { reportCallbackError(error); }
    }

    function setStatus(nextStatus) {
        if (status === nextStatus) return;
        status = nextStatus;
        notify(onStateChange, getState());
    }

    function isCurrent(startGeneration) {
        return generation === startGeneration && status !== TUNER_AUDIO_STATES.destroyed;
    }

    function clearAnalysisTimer() {
        if (timerId === null) return;
        try { platform.clearTimeout?.(timerId); } catch (_) { /* Timer is already gone. */ }
        timerId = null;
    }

    function removeTrackListeners() {
        for (const [track, listener] of trackListeners) {
            try { track.removeEventListener?.('ended', listener); } catch (_) { /* noop */ }
        }
        trackListeners.clear();
    }

    function releaseResources() {
        generation += 1;
        clearAnalysisTimer();

        const oldStream = stream;
        const oldSource = source;
        const oldAnalyser = analyser;
        const oldContext = context;

        removeTrackListeners();
        stopStreamTracks(oldStream);
        disconnectNode(oldSource);
        disconnectNode(oldAnalyser);

        stream = null;
        source = null;
        analyser = null;
        context = null;
        samples = null;
        detector = null;
        trackSampleRate = null;
        diagnosticTrackSettings = {};
        diagnosticSupportedConstraints = {};

        return closeAudioContext(oldContext);
    }

    function stop() {
        const closePromise = releaseResources();
        if (status !== TUNER_AUDIO_STATES.destroyed) setStatus(TUNER_AUDIO_STATES.idle);
        return closePromise;
    }

    function fail(error, fallbackCode) {
        const details = errorDetails(error, fallbackCode);
        const closePromise = releaseResources();
        setStatus(TUNER_AUDIO_STATES.error);
        notifyError(details);
        return closePromise;
    }

    function scheduleAnalysis(delay = ANALYSIS_INTERVAL_MS) {
        if (status !== TUNER_AUDIO_STATES.running || typeof platform.setTimeout !== 'function') return;
        timerId = platform.setTimeout(runAnalysis, delay);
    }

    function runAnalysis() {
        timerId = null;
        if (status !== TUNER_AUDIO_STATES.running || !analyser || !samples || !detector || !context) return;

        const startedAt = platform.now();
        try {
            analyser.getFloatTimeDomainData(samples);
            const detection = detector(samples, context.sampleRate);
            const result = detailedDetectionEnabled ? detection.result : detection;
            notify(onResult, result);
            if (levelEnabled) {
                notify(onInputLevel, {
                    rms: detection.diagnostics.rms,
                    rmsDbfs: detection.diagnostics.rmsDbfs
                });
            }
            if (diagnosticEnabled) {
                notify(onDiagnostic, {
                    ...detection.diagnostics,
                    sampleRate: context.sampleRate,
                    fftSize: analyser.fftSize,
                    trackSettings: diagnosticTrackSettings,
                    supportedConstraints: diagnosticSupportedConstraints
                });
            }
        } catch (error) {
            void fail(error, 'analysis-failed');
            return;
        }

        if (status === TUNER_AUDIO_STATES.running) {
            const elapsed = Math.max(0, platform.now() - startedAt);
            scheduleAnalysis(Math.max(0, ANALYSIS_INTERVAL_MS - elapsed));
        }
    }

    function handleTrackEnded() {
        if (status !== TUNER_AUDIO_STATES.running && status !== TUNER_AUDIO_STATES.starting) return;
        void fail(controllerError('track-ended', 'The microphone track ended.', 'TrackEndedError'), 'track-ended');
    }

    function addTrackListeners(activeStream) {
        for (const track of activeStream.getTracks()) {
            const listener = () => handleTrackEnded();
            track.addEventListener?.('ended', listener);
            trackListeners.set(track, listener);
        }
    }

    async function startInternal(startGeneration) {
        const mediaDevices = platform.navigatorObject?.mediaDevices;
        if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') {
            const insecure = platform.isSecureContext === false;
            await fail(
                controllerError(
                    insecure ? 'insecure-context' : 'unsupported',
                    insecure ? 'Microphone access requires a secure context.' : 'getUserMedia is not available.',
                    insecure ? 'SecurityError' : 'NotSupportedError'
                ),
                insecure ? 'insecure-context' : 'unsupported'
            );
            return false;
        }
        if (typeof platform.AudioContextClass !== 'function') {
            await fail(controllerError('unsupported', 'AudioContext is not available.', 'NotSupportedError'), 'unsupported');
            return false;
        }

        let localContext = null;
        let localStream = null;
        let localSource = null;
        let localAnalyser = null;
        try {
            localContext = new platform.AudioContextClass();
            context = localContext;
            if (localContext.state !== 'running' && typeof localContext.resume === 'function') {
                try {
                    await localContext.resume();
                } catch (error) {
                    if (!isCurrent(startGeneration)) return false;
                    await fail(error, 'audio-resume-failed');
                    return false;
                }
            }
            if (!isCurrent(startGeneration)) {
                await closeAudioContext(localContext);
                return false;
            }
            if (!Number.isFinite(localContext.sampleRate) || localContext.sampleRate <= 0) {
                throw controllerError('audio-context-failed', 'AudioContext returned an invalid sample rate.');
            }

            localStream = await mediaDevices.getUserMedia(TUNER_AUDIO_CONSTRAINTS);
            if (!isCurrent(startGeneration)) {
                stopStreamTracks(localStream);
                await closeAudioContext(localContext);
                return false;
            }
            if (localContext.state !== 'running' && typeof localContext.resume === 'function') {
                try {
                    await localContext.resume();
                } catch (error) {
                    if (!isCurrent(startGeneration)) {
                        stopStreamTracks(localStream);
                        return false;
                    }
                    stopStreamTracks(localStream);
                    await fail(error, 'audio-resume-failed');
                    return false;
                }
                if (!isCurrent(startGeneration)) {
                    stopStreamTracks(localStream);
                    await closeAudioContext(localContext);
                    return false;
                }
            }

            const audioTracks = typeof localStream.getAudioTracks === 'function'
                ? localStream.getAudioTracks()
                : localStream.getTracks?.() || [];
            if (audioTracks.length === 0) {
                const noTrackError = new Error('The stream has no audio track.');
                noTrackError.name = 'NotFoundError';
                throw noTrackError;
            }

            localSource = localContext.createMediaStreamSource(localStream);
            localAnalyser = localContext.createAnalyser();
            localAnalyser.fftSize = chooseAnalyserSize(localContext.sampleRate);
            const localSamples = new Float32Array(localAnalyser.fftSize);
            const localDetector = detailedDetectionEnabled
                ? platform.detailedDetectorFactory({ rmsThreshold: currentRmsThreshold })
                : platform.detectorFactory({ rmsThreshold: currentRmsThreshold });
            localSource.connect(localAnalyser);

            if (!isCurrent(startGeneration)) {
                stopStreamTracks(localStream);
                disconnectNode(localSource);
                disconnectNode(localAnalyser);
                await closeAudioContext(localContext);
                return false;
            }

            stream = localStream;
            source = localSource;
            analyser = localAnalyser;
            samples = localSamples;
            detector = localDetector;
            let trackSettings = {};
            if (diagnosticEnabled) {
                try { trackSettings = selectDiagnosticValues(audioTracks[0].getSettings?.()); } catch (_) { /* Optional diagnostics. */ }
                try {
                    diagnosticSupportedConstraints = selectDiagnosticValues(mediaDevices.getSupportedConstraints?.());
                } catch (_) { /* Optional diagnostics. */ }
                diagnosticTrackSettings = trackSettings;
            }
            const settingsRate = diagnosticEnabled
                ? trackSettings.sampleRate
                : audioTracks[0].getSettings?.().sampleRate;
            trackSampleRate = Number.isFinite(settingsRate) ? settingsRate : null;
            addTrackListeners(localStream);
            setStatus(TUNER_AUDIO_STATES.running);
            scheduleAnalysis(0);
            return true;
        } catch (error) {
            if (!isCurrent(startGeneration)) {
                stopStreamTracks(localStream);
                await closeAudioContext(localContext);
                return false;
            }
            disconnectNode(localSource);
            disconnectNode(localAnalyser);
            if (localStream && stream !== localStream) stopStreamTracks(localStream);
            await fail(error);
            return false;
        }
    }

    function start() {
        if (status === TUNER_AUDIO_STATES.destroyed) {
            notifyError(controllerError('controller-destroyed', 'The controller has been destroyed.', 'InvalidStateError'));
            return Promise.resolve(false);
        }
        if (status === TUNER_AUDIO_STATES.running) return Promise.resolve(true);
        if (status === TUNER_AUDIO_STATES.starting && startPromise) return startPromise;

        const startGeneration = ++generation;
        callbackErrorReported = false;
        setStatus(TUNER_AUDIO_STATES.starting);
        const pending = startInternal(startGeneration);
        startPromise = pending.finally(() => {
            if (startPromise === wrapped) startPromise = null;
        });
        const wrapped = startPromise;
        return wrapped;
    }

    function setRmsThreshold(nextThreshold) {
        if (!Number.isFinite(nextThreshold) || nextThreshold < 0) return false;
        if (nextThreshold === currentRmsThreshold) return true;
        try {
            if (detector) {
                detector = detailedDetectionEnabled
                    ? platform.detailedDetectorFactory({ rmsThreshold: nextThreshold })
                    : platform.detectorFactory({ rmsThreshold: nextThreshold });
            }
            currentRmsThreshold = nextThreshold;
            return true;
        } catch (_) {
            return false;
        }
    }

    const handleVisibilityChange = () => {
        if (platform.documentTarget?.hidden) void stop();
    };
    const handlePageHide = () => { void stop(); };
    platform.documentTarget?.addEventListener?.('visibilitychange', handleVisibilityChange);
    platform.windowTarget?.addEventListener?.('pagehide', handlePageHide);

    function destroy() {
        if (status === TUNER_AUDIO_STATES.destroyed) return Promise.resolve();
        platform.documentTarget?.removeEventListener?.('visibilitychange', handleVisibilityChange);
        platform.windowTarget?.removeEventListener?.('pagehide', handlePageHide);
        const closePromise = releaseResources();
        setStatus(TUNER_AUDIO_STATES.destroyed);
        return closePromise;
    }

    return { start, stop, destroy, getState, setRmsThreshold };
}
