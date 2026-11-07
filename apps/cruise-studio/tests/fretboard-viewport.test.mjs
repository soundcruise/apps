import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/core/native-port-presentation.js', import.meta.url), 'utf8');

function fixture(appId, {pane = false, origin = 'null'} = {}) {
    const raf = [], observers = [], nodes = new Map();
    const shell = {}, main = {
        addEventListener() {}, removeEventListener() {},
        getBoundingClientRect: () => ({top: 0, height: 600})
    };
    let contentHeight = 650, writes = 0, inlineHeight = '';
    const child = {
        scrollHeight: 650,
        getBoundingClientRect: () => ({top: 0, height: contentHeight})
    };
    const doc = {
        documentElement: {dataset: {studioApp: appId}},
        body: {children: [child], getBoundingClientRect: () => ({bottom: contentHeight})},
        head: {append(node) {nodes.set(node.id, node);}},
        getElementById: id => nodes.get(id),
        querySelectorAll: () => [],
        createElement: () => ({remove() {nodes.delete(this.id);}})
    };
    const frame = {
        isConnected: true,
        contentDocument: doc,
        contentWindow: {
            location: {origin}, scrollY: 0,
            getComputedStyle: () => ({position: 'static', display: 'block', marginBottom: '0'})
        },
        style: {
            get height() {return inlineHeight;},
            set height(value) {inlineHeight = value; writes++;}
        },
        closest: selector => selector === '#studio-shell' ? shell : pane ? {} : null,
        getClientRects: () => [{}],
        getBoundingClientRect: () => ({height: parseFloat(inlineHeight) || 600, top: 0}),
        addEventListener() {}
    };
    let load;
    class Observer {
        constructor(callback) {this.callback = callback; observers.push(this);}
        observe(target) {this.target = target;}
        disconnect() {}
    }
    const rootDocument = {
        addEventListener(type, callback) {if (type === 'load') load = callback;},
        getElementById: id => id === 'studio-shell' ? shell : main,
        querySelectorAll: () => []
    };
    const root = {CruiseStudio: {}, document: rootDocument, addEventListener() {}};
    vm.runInNewContext(source, {
        window: root, document: rootDocument, location: {origin: 'https://fixture.invalid'},
        HTMLIFrameElement: class {static [Symbol.hasInstance](value) {return value === frame;}},
        MutationObserver: Observer, ResizeObserver: Observer,
        requestAnimationFrame: callback => raf.push(callback)
    });
    load({target: frame});
    return {
        frame, doc,
        get writes() {return writes;},
        update(height = contentHeight) {
            contentHeight = height; child.scrollHeight = height;
            // Studio shell changes/scroll can schedule sizing even for srcdoc, whose
            // location.origin is "null" and whose bind() returns before observing body.
            observers.find(observer => observer.target === shell).callback();
            while (raf.length) raf.shift()();
        }
    };
}

test('Fretboard retains its viewport across repeated parent updates and content height changes', () => {
    const f = fixture('fretboard');
    for (const height of [650, 487, 415, 800, 300]) f.update(height);
    assert.equal(f.frame.style.height, '');
    assert.equal(f.writes, 0);
    assert.equal(f.doc.getElementById('studio-center-height'), undefined);
});

test('late Fretboard admission removes an earlier content-height override and restores the original viewport', () => {
    const f = fixture('');
    f.update();
    assert.equal(f.frame.style.height, '652px');
    assert.ok(f.doc.getElementById('studio-center-height'));
    f.doc.documentElement.dataset.studioApp = 'fretboard';
    f.update(415);
    assert.equal(f.frame.style.height, '');
    assert.equal(f.doc.getElementById('studio-center-height'), undefined);
});

for (const appId of ['', 'pitch', 'rhythm', 'chord']) {
    test(`existing center content sizing remains unchanged for ${appId || 'Port'}`, () => {
        const f = fixture(appId, {origin: 'https://fixture.invalid'});
        f.update(850);
        assert.equal(f.frame.style.height, '852px');
        assert.ok(f.doc.getElementById('studio-center-height'));
        f.update(400);
        assert.equal(f.frame.style.height, '402px');
    });
}

test('pane scrolling remains owned by the native document', () => {
    const f = fixture('', {pane: true, origin: 'https://fixture.invalid'});
    f.update();
    assert.equal(f.writes, 0);
    assert.equal(f.doc.getElementById('studio-center-height'), undefined);
});
