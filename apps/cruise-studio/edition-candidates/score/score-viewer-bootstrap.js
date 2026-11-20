/* Register the reader before the Studio shell captures its workspace adapters. */
(() => {
    const studio = window.CruiseStudio;
    const load = () => import('./viewer-host.mjs?v='+studio.releaseFeatures.scoreVersion);
    let pending, instance, active = false;

    function ready() {
        if (!pending) {
            pending = load().then(module => {
                instance = module.mountStudioViewer(studio);
                return instance;
            }).catch(error => {
                pending = null;
                document.getElementById('score-viewer-host').textContent = '譜面ビューワーを開けませんでした。もう一度お試しください。';
                throw error;
            });
        }
        return pending;
    }

    studio.scoreViewer = Object.freeze({
        ready,
        load() {},
        activate() {
            active = true;
            ready().then(view => { if (active) view.activate(); }).catch(() => {});
        },
        deactivate() { active = false; instance?.deactivate(); },
        requestLeave(next) { return instance?.requestLeave(next) || false; },
        async completed(row) { return (await load()).showViewerExportComplete(studio,row); },
        async add(bytes,options) { return (await load()).saveToViewerLibrary(studio,bytes,options); },
        async pdf(project,presentation,options) { return (await load()).exportEditorPDF(studio,project,presentation,options); },
        async openEntry(id) {
            studio.shellHost.navigate('scoreViewer');
            if (studio.shellHost.getActiveWorkspace()!=='scoreViewer' && studio.toolWindow.getTool()!=='scoreViewer') return false;
            const view = await ready();
            const file = await (await load()).readViewerEntry(studio,id);
            return view.openBytes(file.bytes, {
                saved:true, name:file.kind==='pdf'?file.entry.title:undefined,
                entryId:file.entry.entryId, libraryTitle:file.entry.title
            });
        }
    });
})();
