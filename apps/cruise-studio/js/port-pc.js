/* Release 1.0 bootstrap. No Project repository, model, editor or Cloud client. */
(function(){
    'use strict';
    var CS=window.CruiseStudio;
    CS.portPC=Object.freeze({version:'0.71.0'});
    CS.shellHost=CS.shell.init(CS);
    CS.audio=CS.audioCoordinator.createCoordinator();
    CS.tuner.attach({audio:CS.audio,shell:CS.shellHost});
    CS.portMetronome.attach({audio:CS.audio,shell:CS.shellHost});
    CS.portPractice.attach({audio:CS.audio,shell:CS.shellHost});
    for(var owner of [CS.portGear,CS.portMyApps,CS.portNews,CS.portSync])owner.attach({shell:CS.shellHost});
    document.getElementById('studio-version').textContent='v'+CS.portPC.version;
    document.querySelectorAll('[data-home-workspace]').forEach(function(button){
        button.addEventListener('click',function(){CS.shellHost.navigate(button.dataset.homeWorkspace);});
    });
    // Only the registered Port workspaces are navigable. Unknown/future hashes
    // remain Home, rather than loading modules or interpreting Project data.
    function route(){var id=location.hash.slice(1);if(id)CS.shellHost.navigate(id);}
    window.addEventListener('hashchange',route);
    var initialRoute=false,entryObserver=new MutationObserver(function(){if(!initialRoute&&CS.entryAuth?.isAuthorized()){initialRoute=true;route();}});
    entryObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-studio-entry']});
    window.addEventListener('pagehide',function(){entryObserver.disconnect();},{once:true});
})();
