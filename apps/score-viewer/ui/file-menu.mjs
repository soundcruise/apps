export function mountFileMenu({button,open,files}){
 const doc=open.ownerDocument,menu=doc.createElement('details'),summary=doc.createElement('summary'),panel=doc.createElement('div');menu.className='sv-file-menu';summary.textContent='ファイルを開く';summary.setAttribute('aria-label','ファイルを開く');menu.append(summary,panel);open.before(menu);panel.append(files,open);files.textContent='ライブラリから開く';open.textContent='PCからファイルを開く';panel.addEventListener('click',e=>{if(e.target.closest('button'))menu.open=false;});
 return {sync(disabled){summary.setAttribute('aria-disabled',String(disabled));menu.inert=disabled;if(disabled)menu.open=false;}};
}
