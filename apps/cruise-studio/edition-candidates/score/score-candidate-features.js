/* Candidate edition policy. Pro admission is independently enforced by Studio. */
Object.defineProperty(window.CruiseStudio, 'releaseFeatures', {
    value: Object.freeze({scoreVersion:"0.205.0-rc.3", creation:true, allows:id => id !== 'preDtm'})
});
