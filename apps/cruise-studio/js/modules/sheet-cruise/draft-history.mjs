// Keep temporary editor history independent of the song's applied undo stack.
export function draftHistory(read, restore) {
    const snapshot = () => JSON.stringify(read());
    const initial = snapshot(), entries = [initial];
    let cursor = 0;
    function checkpoint() {
        const value = snapshot();
        if (entries[cursor] === value) return;
        entries.splice(cursor + 1);
        entries.push(value);
        if (entries.length > 101) entries.shift();
        cursor = entries.length - 1;
    }
    function shortcut(event) {
        if (event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
            event.altKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return false;
        event.preventDefault();
        event.stopPropagation();
        checkpoint();
        const next = cursor + (event.shiftKey ? 1 : -1);
        if (next >= 0 && next < entries.length) {
            cursor = next;
            restore(JSON.parse(entries[cursor]));
        }
        return true;
    }
    return {checkpoint, shortcut, dirty: () => snapshot() !== initial};
}

// Apply/save closes directly. Only dismissal (including the native Escape action)
// consults the current value. A page exit also protects an unapplied local draft.
export function guardDraft(dialog, dirty, close = () => dialog.close()) {
    const win = dialog.ownerDocument.defaultView;
    dialog.hasUnappliedScoreChanges = dirty;
    function dismiss() {
        if (!dirty() || win.confirm('この画面の変更を破棄しますか？')) close();
    }
    function unload(event) {
        if (dialog.open && dirty()) { event.preventDefault(); event.returnValue = ''; }
    }
    dialog.addEventListener('cancel',event => { event.preventDefault(); dismiss(); });
    win.addEventListener('beforeunload',unload);
    dialog.addEventListener('close',() => win.removeEventListener('beforeunload',unload),{once:true});
    return dismiss;
}
