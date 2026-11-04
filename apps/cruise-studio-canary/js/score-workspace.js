/* Reconnect preserved local schema2 editors. Port and Project Sync stay separate. */
(function () {
    'use strict';
    var C=window.CruiseStudio;
    function prepare() {
        var storage=null;
        try { storage=window.localStorage; } catch (_) { /* repository reports unavailable storage */ }
        C.model.configureSchema2();
        C.repository=C.projectRepository.createRepository({storage:storage,model:C.model,
            authorizeWrite:function(){return C.entryAuth ? C.entryAuth.check() : false;},
            canWrite:function(){return !!C.entryAuth?.isAuthorized();},
            snapshot:C.editing.snapshot,locks:navigator.locks,events:window,
            now:function(){return new Date().toISOString();},
            knownTargets:function(){return C.sessions ? C.sessions.listSessions().map(function(s){return s.target;}) : [];}
        });
        C.sessions=C.editing.createRegistry({repository:C.repository,validate:C.model.validateProject});
        C.repository.attach();
        C.documents=C.activeDocument.createOwner({registry:C.sessions,repository:C.repository,
            validate:C.model.validateProject,snapshot:C.editing.snapshot,openProject:C.sheetCruise.openProject,
            canSelect:function(){return !C.shellHost||(!C.shellHost.modal.getActive()&&!C.shellHost.keyboard.isIMEBlocked({}));}
        });
        C.app={openSheetCruise:function(){C.shellHost.navigate('sheetCruise');},openPreDtm:function(){C.shellHost.navigate('preDtm');},goHome:function(){C.shellHost.navigate('home');}};
        C.sheetCruise.init();
        C.preDtm.setProjectSourceProvider(function(){return C.documents.capture();});
        C.preDtm.setDocumentHost(C.documents,function(){
            if(C.documents.getSession())return;
            var id=C.storage.getCurrentProjectId(),projects=C.storage.listProjects();
            if(!id&&projects.length)id=projects[0].projectId;
            if(id)C.documents.select(id);
        });
        C.preDtm.init();
    }
    function attach() {
        var shell=C.shellHost;
        function context(){return {workspaceId:shell.getActiveWorkspace(),generation:shell.getWorkspaceGeneration(),blocked:!C.entryAuth?.isAuthorized()||!!shell.modal.getActive()||shell.keyboard.isIMEBlocked({})};}
        C.melodyEditing=C.melodyCommands.create({owner:C.documents,schema:C.model.schema2,repository:C.repository,getContext:context});
        C.musicConversion=C.structureConversion.createService({owner:C.documents,repository:C.repository,model:C.commonMusic,
            converter:C.commonMusic.createConverter({schema2:C.model.schema2,studioTheory:C.theory,chordTheory:window.ChordCruise.theory,validate:C.model.validateProject}),getContext:context});
        C.melodyInspector=C.melodyEditor.mount({C:C,document:document});
        C.chordInspector=C.chordPresentation.mount({document:document,window:window,selection:C.sheetCruise,
            adapter:C.chordReadModel.createAdapter({chordTheory:window.ChordCruise.theory,chordModel:window.ChordCruise.chordModel,studioTheory:C.theory})});
        C.sessions.subscribe(function(s){if(C.sessions.getActiveSession()===s){shell.setCommandTarget('editingSession',s);shell.setCommandTarget('activeDocument',s.target);}});
        shell.commands.register({id:'studio.save',target:function(c){return c.editingSession;},canExecute:function(c){return c.authorized&&c.activeWorkspaceId==='sheetCruise'&&!c.activeModal&&c.target.canCommit();},execute:function(c){C.sheetCruise.commitSession(c.target);return {consumed:true};}});
        shell.keyboard.bind({scope:'shell',commandId:'studio.save',matches:function(k){return k.primary&&!k.alt&&!k.shift&&k.key.toLowerCase()==='s';}});
        C.sheetCruise.connectHistoryCommands(shell);
    }
    C.scoreWorkspace=Object.freeze({prepare:prepare,attach:attach});
})();
