const test = require('node:test');
const assert = require('node:assert/strict');
const {chromium, webkit, devices} = require('playwright');
const origin = 'http://127.0.0.1:18874';

async function checkToolbar(page, touch) {
    const bar = page.locator('.sv-toolbar:visible');
    const layout = bar.locator('[data-viewer-display-toggle]');
    const zoom = bar.locator(':scope > .sv-zoom');
    const reset = zoom.getByRole('button', {name:'倍率を100%に戻す'});
    assert(await layout.isVisible(), 'layout is accessible directly on the toolbar');
    assert(await zoom.isVisible(), 'zoom is accessible directly on the toolbar');
    const press = button => touch ? button.tap() : button.click();
    for (const flow of ['source', 'horizontal', 'responsive']) {
        await press(layout);
        const choice=bar.locator('[data-viewer-flow="'+flow+'"]');
        await press(choice);
        assert.equal(await layout.innerText(), {source:'元の配置',horizontal:'横',responsive:'画面幅'}[flow]);
        assert.equal(await choice.getAttribute('aria-pressed'),'true');
        assert(await bar.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
        assert.equal(await bar.locator('[aria-label="メニューの配置"]').inputValue(), flow);
    }
    await press(reset);
    await press(zoom.getByRole('button', {name:'譜面を拡大'}));
    assert(parseInt(await reset.innerText()) > 100);
    await press(reset);
    await press(zoom.getByRole('button', {name:'譜面を縮小'}));
    assert(parseInt(await reset.innerText()) < 100);
    await press(reset);
    const menu=bar.locator('.sv-main-menu');
    await press(menu.locator('summary'));
    assert(await menu.getByRole('button',{name:'全画面モード',exact:true}).isVisible());
    await press(menu.locator('summary'));
    assert.equal(await reset.innerText(), '100%');
    const geometry = await bar.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const controls = [...el.querySelectorAll(':scope > details > summary, :scope > label > select, :scope > button, :scope > .sv-zoom > button')].filter(n => n.offsetWidth);
        return {
            smallestWidth:Math.min(...controls.map(n=>n.getBoundingClientRect().width)),
            smallestHeight:Math.min(...controls.map(n=>n.getBoundingClientRect().height)),
            width:rect.width, height:rect.height, overflow:el.scrollWidth-el.clientWidth,
            reachable:controls.every(n => {
                const r = n.getBoundingClientRect();
                return r.left >= rect.left && r.right <= rect.right+1 &&
                    n.contains(document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2));
            })
        };
    });
    assert(geometry.reachable && geometry.overflow<=1 && geometry.height<=68 && (geometry.width>570 || (geometry.smallestWidth>=44 && geometry.smallestHeight>=44)), JSON.stringify(geometry));
    return geometry;
}

for (const name of ['chrome','webkit']) test('direct score controls in the Studio dock and on phones: '+name, async () => {
    const {viewerFixture} = await import('./helpers/viewer-fixture.mjs');
    const f=viewerFixture(), file=await f.contract.codec.encode(f.score,f.metadata);
    const browser = await (name==='chrome'?chromium.launch({channel:'chrome'}):webkit.launch());
    try {
        const desktop=await browser.newPage({viewport:{width:1440,height:900}});
        await desktop.goto(origin);
        await desktop.click('#studio-tool-toggle');
        await desktop.selectOption('#tool-window-select','scoreViewer');
        await desktop.locator('#studio-tool-window .sv-toolbar:visible').waitFor();
        assert(await desktop.evaluate(async text=>(await CruiseStudio.scoreViewer.ready()).openBytes(text),file.text));
        const dock=await checkToolbar(desktop,false);
        assert(dock.width<1050);
        const phone=await browser.newPage({...devices[name==='chrome'?'Pixel 7':'iPhone 13']});
        await phone.goto(origin+'/apps/score-viewer/local/');
        await phone.waitForFunction(()=>!!window.CruiseViewer);
        assert(await phone.evaluate(text=>CruiseViewer.view.openBytes(text),file.text));
        for(const width of [320,360,390,844]){
            await phone.setViewportSize({width,height:width===844?390:844});
            const size=await checkToolbar(phone,true);
            assert(size.height <= 68);
        }
    } finally { await browser.close(); }
});
