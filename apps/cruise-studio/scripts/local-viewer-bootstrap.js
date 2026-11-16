// Loopback-only entry scaffolding. Not referenced or packaged by either product.
(function(){
    if(location.protocol!=='http:'||location.hostname!=='127.0.0.1'||location.port!=='18874'||!document.querySelector('meta[name="local-ui-fixture"]'))throw Error('Local viewer refused outside its dedicated origin');
    var C=window.CruiseStudio,pending=null,instance=null,active=false;
    function ready(){if(!pending)pending=import('./local-viewer-studio.mjs?v=0.149.0-dev.1').then(function(m){instance=m.mountStudioViewer(C);return instance;}).catch(function(error){pending=null;var host=document.getElementById('score-viewer-host');host.textContent='譜面ビューワーを開けませんでした。もう一度お試しください。';throw error;});return pending;}
    C.scoreViewer=Object.freeze({load:function(){},activate:function(){active=true;ready().then(function(view){if(active)view.activate();}).catch(function(){});},deactivate:function(){active=false;instance?.deactivate();},ready:ready});
})();
