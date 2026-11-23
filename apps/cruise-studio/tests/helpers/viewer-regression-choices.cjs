// Legacy format/audio regression cases deliberately discard temporary files.
// New viewer-usability tests exercise cancel/save/discard without this helper.
exports.discardTemporaryViewerFiles=async context=>{
 const accept=page=>page.on('dialog',d=>d.accept());context.pages().forEach(accept);context.on('page',accept);
 return context.addInitScript(()=>{
 const discard=()=>{document.querySelector('[data-pdf-action=library-later]')?.click();document.querySelector('[data-viewer-leave=discard]')?.click();document.querySelector('[data-export-complete=close]')?.click();document.querySelector('[data-export-choice=overwrite]')?.click();document.querySelector('[data-export-choice=export-save]')?.click();};
 document.addEventListener('DOMContentLoaded',()=>new MutationObserver(discard).observe(document.body,{childList:true,subtree:true}));
});
};

exports.saveFromToolbar=async(p,kind='viewer')=>{const options=p.locator('.sv-device-options');if(await options.count()&&await options.evaluate(e=>e.open))await options.locator('summary').click();const b=p.locator('[data-'+kind+'-action=save]');if(await b.isVisible())await b.click();else{await p.locator('.sv-file-menu:visible').evaluate(e=>e.open=true);await p.getByRole('button',{name:kind==='pdf'?'ライブラリに追加':'この端末に保存',exact:true}).click();}};

exports.editNumberedCopy=async p=>{await p.waitForFunction(()=>!document.querySelector('[data-library-action=create-folder]').disabled);const row=p.locator('[data-library-entry]').filter({hasText:/\(\d+\)/}).first();await row.waitFor();if(await p.locator('.sv-library-editor').count())throw Error('Copy must not open an editor');await row.locator('[data-library-action=edit]').click();await p.locator('.sv-library-editor').waitFor();};

// Detailed display controls now live behind the same quick visibility menu as the editor.
module.exports.openDisplaySettings=async function(page){const menu=page.locator('.sv-display-menu:visible');if(await menu.count()&&!await menu.getAttribute('open'))await menu.locator(':scope>summary').click();await page.locator('[data-viewer-action=display]').click();};
