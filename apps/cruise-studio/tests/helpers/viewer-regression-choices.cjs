// Legacy format/audio regression cases deliberately discard temporary files.
// New viewer-usability tests exercise cancel/save/discard without this helper.
exports.discardTemporaryViewerFiles=async context=>{
 const accept=page=>page.on('dialog',d=>d.accept());context.pages().forEach(accept);context.on('page',accept);
 return context.addInitScript(()=>{
 const discard=()=>{document.querySelector('[data-viewer-leave=discard]')?.click();document.querySelector('[data-export-complete=close]')?.click();document.querySelector('[data-export-choice=overwrite]')?.click();};
 document.addEventListener('DOMContentLoaded',()=>new MutationObserver(discard).observe(document.body,{childList:true,subtree:true}));
});
};
