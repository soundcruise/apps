/* Studio bootstrap: Port services and preserved local creation workspaces. */
(function(){
    'use strict';
    var CS=window.CruiseStudio;
    CS.portPC=Object.freeze({version:'0.86.3'});
    CS.scoreWorkspace.prepare();
    CS.shellHost=CS.shell.init(CS);
    CS.scoreWorkspace.attach();
    CS.audio=CS.audioCoordinator.createCoordinator();
    CS.tuner.attach({audio:CS.audio,shell:CS.shellHost});
    CS.portMetronome.attach({audio:CS.audio,shell:CS.shellHost});
    CS.portPractice.attach({audio:CS.audio,shell:CS.shellHost});
    for(var owner of [CS.portGear,CS.portMyApps,CS.portNews,CS.portSync])owner.attach({shell:CS.shellHost});
    document.getElementById('studio-version').textContent='v'+CS.portPC.version;
    new ResizeObserver(()=>{var footer=document.querySelector('.studio-footer'),container=footer.parentElement;container.style.setProperty('--studio-footer-space',(footer.getBoundingClientRect().height+parseFloat(getComputedStyle(footer).marginTop)+parseFloat(getComputedStyle(container).rowGap))+'px');}).observe(document.querySelector('.studio-footer'));
    document.querySelector('[data-studio-footer-version]').textContent='v'+CS.portPC.version;
    document.getElementById('studio-footer-refresh').onclick=()=>document.getElementById('studio-refresh').click();
    new MutationObserver(()=>{document.querySelector('[data-footer-refresh-status]').textContent=document.getElementById('studio-refresh-status').textContent;}).observe(document.getElementById('studio-refresh-status'),{childList:true,subtree:true,characterData:true});
    document.getElementById('studio-info-open').onclick=()=>document.getElementById('studio-information').showModal();
    document.getElementById('home-cruise-sync').addEventListener('click', function(){CS.shellHost.navigate('portSync');});
    document.querySelectorAll('[data-home-workspace]').forEach(function(button){
        button.addEventListener('click',function(){CS.shellHost.navigate(button.dataset.homeWorkspace);});
    });
    document.querySelectorAll('[data-open-calendar]').forEach(function(button){button.addEventListener('click',function(){CS.portPractice.openCalendar();});});
    // Isolated host injection only; no production Project requests or Cloud bundle.
    if((location.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(location.hostname)||location.protocol==='https:'&&location.hostname.endsWith('.invalid'))&&globalThis.__SOUND_CRUISE_STUDIO_CLOUD__?.endpoint){
        import('./cloud/project-sync-host.mjs').then(function(m){CS.projectCloud=m.mountIsolatedProjectSync(CS,globalThis.__SOUND_CRUISE_STUDIO_CLOUD__);}).catch(function(){/* local editing remains available */});
    }
    // Only registered workspaces are navigable.
    function route(){var id=location.hash.slice(1);if(id)CS.shellHost.navigate(id);}
    window.addEventListener('hashchange',route);
    var initialRoute=false,entryObserver=new MutationObserver(function(){if(!initialRoute&&CS.entryAuth?.isAuthorized()){initialRoute=true;route();}});
    entryObserver.observe(document.documentElement,{attributes:true,attributeFilter:['data-studio-entry']});
    window.addEventListener('pagehide',function(){entryObserver.disconnect();},{once:true});
})();
