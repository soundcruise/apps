/* Candidate edition policy. Pro admission is independently enforced by Studio. */
Object.defineProperty(window.CruiseStudio, 'releaseFeatures', {
    value: Object.freeze({scoreVersion:"0.242.1-rc.1", creation:true, allows:id => id !== 'preDtm'})
});
