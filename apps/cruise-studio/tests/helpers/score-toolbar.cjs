// Legacy behavior regressions still use their original controls. Reach moved
// controls through their visible summaries rather than clicking hidden elements.
async function toolbarControl(page,selector){
 const target=page.locator(selector);
 const parents=await target.evaluate(el=>{const result=[];for(let p=el.parentElement;p;p=p.parentElement)if(p.matches('details.sc-toolbar-menu,details.sc-transpose-tools')&&p.firstElementChild!==el)result.unshift(p.id?'#'+p.id:'.sc-transpose-tools');return result;});
 for(const selector of parents){const menu=page.locator(selector);if(await menu.getAttribute('open')===null)await menu.locator(':scope > summary').click();}
 return target;
}
module.exports={toolbarControl};
