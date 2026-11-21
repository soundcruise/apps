export function bindScoreEditor(studio) {
    // Dock the editor in the existing Studio tool window.
    let mounted = null;
    function release(closeWindow = false) {
        if (!mounted) return;
        const previous = mounted; mounted = null;
        previous.observer.disconnect();
        previous.selector.removeEventListener('change', previous.onChoice, true);
        previous.option.remove();
        previous.parent.insertBefore(previous.node, previous.next?.parentNode === previous.parent ? previous.next : null);
        delete previous.window.dataset.sheetEditor;
        // Retain a width the user adjusted while editing; undo only our default.
        if (previous.defaultWidth && previous.shell.style.getPropertyValue('--studio-tool-width') === '600px')
            previous.shell.style.removeProperty('--studio-tool-width');
        previous.returned();
        if (closeWindow && !studio.toolWindow.getTool()) studio.toolWindow.close();
    }
    studio.localEditorPane = Object.freeze({
        mount(node, returned) {
            if (mounted) return mounted.node === node;
            if (!studio.entryAuth.isAuthorized() || studio.shellHost.getActiveWorkspace() !== 'sheetCruise' ||
                !studio.toolWindow || studio.toolWindow.getTool() || !node.isConnected) return false;
            const window = document.getElementById('studio-tool-window'), selector = document.getElementById('tool-window-select'),
                shell = document.getElementById('studio-shell'), slot = document.getElementById('tool-window-slot');
            if (!window || !selector || !slot) return false;
            if (window.hidden) document.getElementById('studio-tool-toggle').click();
            if (window.hidden || studio.toolWindow.getTool()) return false;
            const option = document.createElement('option'); option.value = 'local-sheet-editor'; option.textContent = '譜面編集';
            const current = {node, returned, parent: node.parentNode, next: node.nextSibling, window, selector, option, shell,
                defaultWidth: !shell.style.getPropertyValue('--studio-tool-width')};
            selector.append(option); selector.value = option.value; slot.append(node); window.dataset.sheetEditor = '';
            if (current.defaultWidth) shell.style.setProperty('--studio-tool-width', '600px');
            current.onChoice = event => {
                if (selector.value === option.value) { event.stopImmediatePropagation(); return; }
                release(false); // Let the existing Shell process the chosen tool.
            };
            selector.addEventListener('change', current.onChoice, true);
            current.observer = new MutationObserver(() => {
                if (mounted !== current) return;
                if (window.hidden || studio.toolWindow.getTool() || studio.shellHost.getActiveWorkspace() !== 'sheetCruise' ||
                    node.classList.contains('hidden')) release(!window.hidden && !studio.toolWindow.getTool());
            });
            current.observer.observe(window, {attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true});
            current.observer.observe(node, {attributes: true, attributeFilter: ['class']});
            mounted = current; return true;
        },
        unmount(node) { if (mounted?.node === node) release(true); }
    });
}
