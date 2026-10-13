import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { parseRules, declaration, rootPalette, verifyProjection, renderProjectionCss } from './theme-source-reader.mjs';

const require = createRequire(import.meta.url);
const contract = require('../js/core/color-theme.js');
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const sourcePaths = ['../../cruise-port/style.css', '../../cruise-port/settings-store.js', '../../cruise-port/index.html', '../../cruise-port/pro_9a3943176561/index.html'];
const protectedSources = sourcePaths.map(read);
const [portCss, portSettings, portStandard, portPro] = protectedSources;
const projection = JSON.parse(read('../js/core/theme-projection.json'));
const projectionCss = read('../theme-projection.css');
const runtimeSource = read('../js/core/color-theme.js');
const html = read('../index.html');
const legacyCss = read('../theme.css');
const printCss = read('../print.css');
const ids = ['dark', 'charcoal', 'gray', 'light'];
const names = [
    'app-bg','surface','surface-deep','panel','panel-alt','panel-deep','elevated',
    'text-primary','text-muted','border-default','accent','accent-bright','accent-text',
    'control','control-hover','control-active','field','text-secondary','color-scheme',
    'border-subtle','border-strong','field-border','primary-action-background',
    'primary-action-top','primary-action-bottom','primary-action-text',
    'selected-bg','selected-border','selected-text','focus','focus-primary','focus-danger',
    'success','warning','danger','overlay','shadow-low','shadow-medium','shadow-high'
].map(name => '--studio-' + name);

function validate(value, source = portCss) {
    assert.deepEqual(value.themeIds, ids);
    assert.deepEqual(value.tokens.map(token => token.semanticToken).sort(), [...names].sort());
    assert.equal(new Set(value.tokens.map(token => token.semanticToken)).size, names.length);
    for (const token of value.tokens) {
        assert.deepEqual(Object.keys(token.sources), ids);
        assert.deepEqual(Object.keys(token.values), ids);
    }
    verifyProjection(value, source);
}
function store(initial = null, failure = '') {
    const data = new Map(initial === null ? [] : [[contract.STORAGE_KEY, initial]]);
    const reads = [], writes = [];
    return {
        data, reads, writes,
        getItem(key) { reads.push(key); if (failure === 'read') throw new Error('read denied'); return data.get(key) ?? null; },
        setItem(key, value) { if (failure === 'write') throw new Error('quota'); writes.push([key,value]); data.set(key,value); }
    };
}
function documentStub() {
    const attributes = {};
    const meta = { content: '#090806', setAttribute(key,value) { this[key] = value; } };
    return { attributes, meta,
        documentElement: { setAttribute(key,value) { attributes[key] = value; } },
        querySelector(selector) { assert.equal(selector, 'meta[name="theme-color"]'); return meta; }
    };
}
const token = name => projection.tokens.find(entry => entry.semanticToken === '--studio-' + name);

test('four IDs, Dark default, frozen metadata agree with Port settings', () => {
    assert.deepEqual(contract.listColorThemes().map(theme => theme.id), ids);
    const portIds = portSettings.match(/export const THEMES = Object.freeze\(\[([^\]]+)\]\)/)[1].match(/'([^']+)'/g).map(s=>s.slice(1,-1));
    assert.deepEqual(portIds, ids);
    assert.equal(contract.DEFAULT_THEME, 'dark');
    assert.match(portSettings, /export const DEFAULT_THEME = 'dark'/);
    assert.ok(Object.isFrozen(contract.listColorThemes()));
    assert.ok(contract.listColorThemes().every(Object.isFrozen));
});
test('resolver: supported values only; invalid input resolves to Dark', () => {
    for (const id of ids) assert.equal(contract.resolveColorTheme(id), id);
    for (const value of [null,undefined,'Dark','LIGHT','system','',1,true,{},['light']]) assert.equal(contract.resolveColorTheme(value),'dark');
});
test('all 39 tokens and 156 projections have exact source selector/property/literal/value', () => validate(projection));
test('CSS artifact is exactly the verified projection, without Port variables', () => {
    assert.equal(projectionCss, renderProjectionCss(projection));
    assert.doesNotMatch(projectionCss, /--port-|--paper-|@import/);
    for (const rule of parseRules(projectionCss)) {
        assert.ok(rule.selector.startsWith(':root'));
        assert.ok(Object.keys(rule.properties).every(name=>name.startsWith('--studio-')));
    }
});
test('root palettes retain actual Port Dark/Charcoal/Gray/Light values', () => {
    const expected = {
        dark: ['#080806','#12110f','#f3f0e8','#9b968a','dark'],
        charcoal: ['#424346','#4c4e52','#f2f1ed','#d2cec5','dark'],
        gray: ['#c8cbd0','#d8dbdf','#1d1f23','#4a4e55','light'],
        light: ['#f7f6f2','#ffffff','#1c1b18','#5f5b52','light']
    };
    for (const id of ids) assert.deepEqual(['app-bg','surface','text-primary','text-muted','color-scheme'].map(name=>token(name).values[id]),expected[id]);
});
test('new root override cannot silently leave an inherited projection stale', () => {
    assert.throws(()=>validate(projection,portCss+'\n:root[data-theme="charcoal"] { --port-gold: #000000; }'), /root override drift/);
});
test('source drift of a main palette or referenced channel is rejected', () => {
    for (const [from,to] of [['--port-bg: #080806','--port-bg: #000000'],['--port-accent-rgb: 205, 180, 116','--port-accent-rgb: 206, 180, 116']]) {
        assert.throws(()=>validate(projection,portCss.replace(from,to)),/drift/);
    }
});
test('state mappings keep musical judgement out of generic status', () => {
    assert.equal(token('success').values.dark,'#cfe6d4');
    assert.equal(token('warning').values.dark,'#ead39b');
    assert.equal(token('danger').values.dark,'#ffd3d6');
    assert.equal(token('success').values.gray,'#285c34');
    assert.equal(token('danger').values.light,'#9a2e38');
    assert.ok(projection.tokens.every(entry=>Object.values(entry.sources).every(source=>!source.selector.includes('tuner'))));
    assert.throws(()=>validate(projection,portCss.replace('color: #cfe6d4;', 'color: #000000;')),/source drift/);
});
test('primary gold gradient, foreground and both endpoints are preserved', () => {
    for (const id of ids) {
        assert.equal(token('primary-action-background').values[id],'linear-gradient(180deg, #e8d49d, #bfa25a)');
        assert.equal(token('primary-action-top').values[id],'#e8d49d');
        assert.equal(token('primary-action-bottom').values[id],'#bfa25a');
        assert.equal(token('primary-action-text').values[id],'#171208');
    }
    assert.throws(()=>validate(projection,portCss.replace('linear-gradient(180deg, #e8d49d, #bfa25a)','linear-gradient(180deg, #e8d49d, #000000)')),/source drift/);
});
test('selected state uses current theme channels rather than new colors', () => {
    assert.equal(token('selected-bg').values.dark,'rgba(205, 180, 116, 0.12)');
    assert.equal(token('selected-bg').values.light,'rgba(150, 116, 40, 0.12)');
    assert.equal(token('selected-text').values.gray,'#634c15');
});
test('ordinary / primary / danger focus remain separate source mappings', () => {
    assert.equal(token('focus').values.dark,'#e6d29b');
    assert.equal(token('focus').values.light,'#6b5318');
    assert.equal(token('focus-primary').values.dark,'#fff3bd');
    assert.equal(token('focus-danger').values.gray,'#8c2731');
});
test('modal overlay follows the documented component choice in each theme', () => {
    assert.deepEqual(token('overlay').values,{dark:'rgba(0, 0, 0, 0.75)',charcoal:'rgba(15, 15, 16, 0.55)',gray:'rgba(40, 42, 46, 0.45)',light:'rgba(20, 20, 18, 0.40)'});
});
test('shadow geometries and theme alpha agree with card/panel/dialog sources', () => {
    assert.equal(token('shadow-low').values.dark,'0 10px 24px rgba(0, 0, 0, 0.24)');
    assert.equal(token('shadow-low').values.charcoal,token('shadow-low').values.dark);
    assert.equal(token('shadow-medium').values.gray,'0 16px 36px rgba(0, 0, 0, 0.12)');
    assert.equal(token('shadow-high').values.light,'0 22px 60px rgba(0, 0, 0, 0.08)');
    assert.throws(()=>validate(projection,portCss.replace('0 22px 60px rgba(0, 0, 0, 0.48)','0 22px 60px rgba(0, 0, 0, 0.40)')),/source drift/);
});
test('theme-color agrees with Port runtime and both first-paint bootstraps', () => {
    for (const theme of contract.listColorThemes()) {
        const pattern = new RegExp(theme.id+": '"+theme.themeColor+"'");
        for (const source of [portSettings,portStandard,portPro]) assert.match(source,pattern);
    }
    assert.match(html, /<meta name="theme-color" content="#090806">/);
});
test('color-scheme agrees with Port, and is not globally imposed on legacy native controls', () => {
    const rules = parseRules(portCss);
    for (const theme of contract.listColorThemes()) assert.equal(theme.colorScheme,rootPalette(rules,theme.id)['color-scheme']);
    assert.doesNotMatch(projectionCss, /(?<!-)\bcolor-scheme\s*:/);
    assert.doesNotMatch(runtimeSource, /\.style\.colorScheme|setProperty\(['"]color-scheme/);
});
test('load keeps appSettings, Port, projects and absent/invalid theme unchanged', () => {
    for (const value of [null,'{}','{"colorTheme":"blue"}','{"colorTheme":"light","barLoupe":{"x":20}}','[]','null','{bad']) {
        const storage=store(value), before=[...storage.data];
        const runtime=contract.createColorThemeRuntime({storage});
        assert.equal(runtime.getColorTheme(),value?.includes('"light"')?'light':'dark');
        assert.deepEqual(storage.writes,[]); assert.deepEqual([...storage.data],before);
        assert.deepEqual(storage.reads,[contract.STORAGE_KEY]);
    }
});
test('explicit save changes only colorTheme and preserves latest Loupe / Pre-DTM / unknown fields', () => {
    const storage=store(JSON.stringify({preDtmSettings:{bass:'root'},barLoupe:{x:12},unknown:{keep:true}}));
    const runtime=contract.createColorThemeRuntime({storage});
    runtime.getColorTheme();
    storage.data.set(contract.STORAGE_KEY,JSON.stringify({preDtmSettings:{bass:'fifth'},barLoupe:{x:24},unknown:{keep:true}}));
    assert.equal(runtime.setColorTheme('charcoal').ok,true);
    assert.deepEqual(JSON.parse(storage.data.get(contract.STORAGE_KEY)),{preDtmSettings:{bass:'fifth'},barLoupe:{x:24},unknown:{keep:true},colorTheme:'charcoal'});
    assert.equal(storage.writes.length,1);
    assert.equal(storage.writes[0][0],contract.STORAGE_KEY);
});
test('absent settings can be saved without a new storage key; invalid ID saves Dark', () => {
    const storage=store(),runtime=contract.createColorThemeRuntime({storage});
    assert.deepEqual(runtime.setColorTheme('system'),{ok:true,theme:'dark',error:null});
    assert.deepEqual([...storage.data],[[contract.STORAGE_KEY,'{"colorTheme":"dark"}']]);
});
test('read failure / blocked storage getter resolve to Dark without writes', () => {
    const storage=store(null,'read');
    assert.equal(contract.createColorThemeRuntime({storage}).getColorTheme(),'dark');
    assert.equal(contract.createColorThemeRuntime({getStorage(){throw new Error('denied');}}).getColorTheme(),'dark');
    assert.deepEqual(storage.writes,[]);
});
test('save failure is reported; this runtime applies theme without damaging persisted settings', () => {
    const original='{"colorTheme":"dark","barLoupe":{"x":14}}';
    const storage=store(original,'write'),document=documentStub();
    const runtime=contract.createColorThemeRuntime({storage,document});
    assert.deepEqual(runtime.setColorTheme('gray'),{ok:false,theme:'gray',error:'quota'});
    assert.equal(runtime.getColorTheme(),'gray');
    assert.equal(document.attributes['data-theme'],'gray');
    assert.equal(storage.data.get(contract.STORAGE_KEY),original);
});
test('corrupt/array settings are never replaced when explicitly saving theme', () => {
    for (const raw of ['{bad','[]','null','42']) {
        const storage=store(raw),runtime=contract.createColorThemeRuntime({storage});
        assert.equal(runtime.setColorTheme('light').ok,false);
        assert.equal(storage.data.get(contract.STORAGE_KEY),raw);
        assert.deepEqual(storage.writes,[]);
    }
});
test('apply sets only data-theme/meta, normalizes invalid IDs and never saves', () => {
    const storage=store(),document=documentStub();
    const runtime=contract.createColorThemeRuntime({storage,document});
    assert.equal(runtime.applyColorTheme('light'),'light');
    assert.equal(document.meta.content,'#f7f6f2');
    assert.equal(runtime.applyColorTheme({}),'dark');
    assert.equal(document.attributes['data-theme'],'dark');
    assert.deepEqual(storage.reads,[]); assert.deepEqual(storage.writes,[]);
});
test('subscriptions fire for changes only, isolate subscribers, and unsubscribe', () => {
    const runtime=contract.createColorThemeRuntime({storage:store()});
    const values=[];runtime.getColorTheme();
    runtime.subscribeColorTheme(()=>{throw new Error('subscriber');});
    const off=runtime.subscribeColorTheme(value=>values.push(value));
    runtime.applyColorTheme('gray');runtime.applyColorTheme('gray');off();runtime.applyColorTheme('light');
    assert.deepEqual(values,['gray']);
    assert.throws(()=>runtime.subscribeColorTheme(null),TypeError);
});
test('script registration has no storage / DOM / timer / network / audio side effects', () => {
    const bomb=()=>{throw new Error('unexpected side effect');};
    const context={document:{documentElement:{setAttribute:bomb},querySelector:bomb},setTimeout:bomb,fetch:bomb,AudioContext:bomb};
    Object.defineProperty(context,'localStorage',{get:bomb});
    vm.runInNewContext(runtimeSource,context);
    assert.equal(context.CruiseStudio.colorTheme.resolveColorTheme('light'),'light');
});
test('actual entry bootstrap runs before stylesheets with exactly the runtime resolver', () => {
    const src=html.indexOf('src="js/core/color-theme.js?v=0.26.12"');
    const inline=html.match(/<script>\s*(CruiseStudio\.colorTheme[\s\S]*?)<\/script>/)[1];
    assert.ok(src>0 && html.indexOf(inline)<html.indexOf('rel="stylesheet"'));
    for (const value of [null,'{}',...ids.map(id=>JSON.stringify({colorTheme:id})),'{"colorTheme":"invalid"}','{bad','[]']) {
        const storage=store(value),document=documentStub();
        const context={localStorage:storage,document};vm.runInNewContext(runtimeSource,context);
        vm.runInNewContext(inline,context);
        const expected=contract.createColorThemeRuntime({storage:store(value)}).getColorTheme();
        assert.equal(document.attributes['data-theme'],expected);
        assert.equal(context.CruiseStudio.colorTheme.getColorTheme(),expected);
        assert.deepEqual(storage.writes,[]);
    }
});
test('bootstrap and runtime also agree when storage cannot be accessed', () => {
    const document=documentStub(),context={document};Object.defineProperty(context,'localStorage',{get(){throw new Error('blocked');}});
    vm.runInNewContext(runtimeSource,context);
    vm.runInNewContext(html.match(/<script>\s*(CruiseStudio\.colorTheme[\s\S]*?)<\/script>/)[1],context);
    assert.equal(document.attributes['data-theme'],'dark');
    assert.equal(context.CruiseStudio.colorTheme.getColorTheme(),'dark');
});
test('paper palette is theme-independent and keeps legacy music/paper values', () => {
    const rules=parseRules(legacyCss),root=rootPalette(rules,'dark');
    const fixed={'--paper-bg':'#fdfbf5','--paper-ink':'#2a2620','--paper-muted':'#6a645c','--paper-faint':'#9a948c','--paper-border':'#7a746c','--paper-chord':'#c0392b','--paper-lyrics':'#1e1a16','--paper-doremi':'#4a6fa5'};
    for(const [name,value] of Object.entries(fixed))assert.equal(root[name],value);
    for (const rule of rules) for (const name of Object.keys(rule.properties).filter(n=>n.startsWith('--paper-'))) assert.equal(rule.selector,':root');
    assert.doesNotMatch(projectionCss,/--paper-/);
});
test('paper selection / focus aliases retain exact previous screen values', () => {
    const rules=parseRules(legacyCss),root=rootPalette(rules,'dark');
    assert.equal(root['--paper-selection-bg'],'rgba(255, 159, 28, 0.08)');
    assert.equal(root['--paper-selection-border'],'rgba(255, 159, 28, 0.72)');
    assert.equal(root['--paper-focus'],'rgba(77, 150, 255, 0.65)');
    assert.equal(declaration(rules,'.sheet-bar.is-selected','background'),'var(--paper-selection-bg)');
    assert.equal(declaration(rules,'.sheet-bar:focus-visible','outline'),'2px solid var(--paper-focus)');
});
test('print remains white A4, hides Shell/Loupe/selection and has no Shell tokens', () => {
    assert.doesNotMatch(printCss,/--studio-|data-theme/);
    assert.match(printCss,/size: A4 portrait/);
    assert.match(printCss,/width: 210mm !important/);
    assert.match(printCss,/min-height: 297mm !important/);
    assert.match(printCss,/background: #ffffff !important/);
    assert.match(printCss,/\.slot-overlay,[\s\S]*?display: none !important/);
    assert.match(printCss,/\.sheet-bar\.is-selected \{\s*background: transparent !important;\s*box-shadow: none !important/);
});
test('Theme does not couple to Feature Metadata / Port runtime / Sync / project data', () => {
    assert.doesNotMatch(runtimeSource,/cruisePort\.settings|feature-registry|component-metadata|SoundCruise|fetch\(|matchMedia\(|\.reload\(/);
    for (const file of ['../js/core/feature-registry.mjs','../js/core/component-metadata.mjs']) assert.doesNotMatch(read(file),/color-theme|theme-projection/);
    assert.match(read('../js/core/song-model.js'),/APP_VERSION = '0.26.12'/);
    assert.match(read('../js/core/song-model.js'),/SCHEMA_VERSION = 1/);
});
test('Port source verification is read-only', () => {
    validate(projection);
    assert.deepEqual(sourcePaths.map(read),protectedSources);
});
test('projection deletion, wrong source and stale value are independently rejected', () => {
    const missing=structuredClone(projection);missing.tokens.pop();assert.throws(()=>validate(missing));
    const wrong=structuredClone(projection);wrong.tokens[0].sources.light.file='apps/cruise-studio/theme.css';assert.throws(()=>validate(wrong),/unapproved source/);
    const stale=structuredClone(projection);stale.tokens[0].values.dark='#000000';assert.throws(()=>validate(stale),/projection drift/);
});
