/* Release capability, independent of Account/Pro authorization. No persisted overrides. */
(()=>{const blocked=new Set(['sheetCruise','preDtm']);Object.defineProperty(window.CruiseStudio,'releaseFeatures',{value:Object.freeze({creation:false,allows:id=>!blocked.has(id)}),writable:false,configurable:false});})();
