import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    HOME_HISTORY_MODE,
    safeDecodeRouteSegment,
    updateHomeHistory
} from './practice-menu-navigation.js';

class MemoryBrowserHistory {
    constructor(initialUrl = 'https://soundcruise.jp/apps/cruise-port/') {
        this.entries = [new URL(initialUrl)];
        this.index = 0;
        this.pushCount = 0;
        this.replaceCount = 0;
        this.location = {};
        for (const key of ['pathname', 'search', 'hash']) {
            Object.defineProperty(this.location, key, {
                get: () => this.entries[this.index][key]
            });
        }
    }

    get length() {
        return this.entries.length;
    }

    pushState(_state, _title, url) {
        this.entries.splice(this.index + 1);
        this.entries.push(new URL(url, this.entries[this.index]));
        this.index += 1;
        this.pushCount += 1;
    }

    replaceState(_state, _title, url) {
        this.entries[this.index] = new URL(url, this.entries[this.index]);
        this.replaceCount += 1;
    }

    pushHash(hash) {
        this.pushState(null, '', `${this.location.pathname}${this.location.search}${hash}`);
    }

    back() {
        if (this.index > 0) this.index -= 1;
    }

    forward() {
        if (this.index < this.entries.length - 1) this.index += 1;
    }
}

function replaceWithHome(browser) {
    updateHomeHistory({
        historyObject: browser,
        locationObject: browser.location,
        mode: HOME_HISTORY_MODE.replace
    });
}

{
    const browser = new MemoryBrowserHistory();
    browser.pushHash('#practice-menu/menu-1');
    browser.back();
    assert.equal(browser.location.hash, '', 'normal detail -> back returns home');
}

{
    const browser = new MemoryBrowserHistory();
    browser.pushHash('#practice-menu/menu-1');
    const lengthBeforeDelete = browser.length;
    replaceWithHome(browser);
    assert.equal(browser.location.hash, '', 'delete replaces the current detail entry with home');
    assert.equal(browser.length, lengthBeforeDelete, 'delete does not grow history');
    assert.equal(browser.pushCount, 1, 'delete does not add another push');
    assert.equal(browser.replaceCount, 1);

    browser.back();
    assert.equal(browser.location.hash, '', 'back cannot revisit the deleted detail route');
    browser.forward();
    assert.equal(browser.location.hash, '', 'forward cannot revisit the deleted detail route');
}

for (const staleHash of [
    '#practice-menu/deleted-id',
    '#practice-menu/never-existed-id',
    '#practice-menu/deleted-id/edit'
]) {
    const browser = new MemoryBrowserHistory('https://soundcruise.jp/apps/cruise-port/?source=test');
    browser.pushHash(staleHash);
    const lengthBeforeCorrection = browser.length;
    replaceWithHome(browser);
    assert.equal(browser.location.hash, '', `${staleHash} is corrected to home`);
    assert.equal(browser.location.search, '?source=test', 'home correction preserves the query');
    assert.equal(browser.length, lengthBeforeCorrection, 'stale correction does not grow history');
    browser.back();
    assert.notEqual(browser.location.hash, staleHash, 'back does not revisit a corrected stale route');
}

for (const encoded of ['%ZZ', '%', '%E0%A4%A']) {
    assert.equal(safeDecodeRouteSegment(encoded), null, `${encoded} fails closed without URIError`);
    const browser = new MemoryBrowserHistory();
    browser.pushHash(`#practice-menu/${encoded}`);
    const lengthBeforeCorrection = browser.length;
    replaceWithHome(browser);
    assert.equal(browser.location.hash, '');
    assert.equal(browser.length, lengthBeforeCorrection, 'invalid route correction does not grow history');
}

assert.equal(safeDecodeRouteSegment('menu%20name'), 'menu name');

const appSource = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
assert.match(appSource, /function replaceHomeRoute\(\)[\s\S]*HOME_HISTORY_MODE\.replace/);
assert.match(appSource, /function renderDetail\(id\)[\s\S]*if \(!item\) \{\s*replaceHomeRoute\(\)/);
assert.match(appSource, /function renderForm\(mode, id = null\)[\s\S]*mode === 'edit' && !item\)[\s\S]*replaceHomeRoute\(\)/);
assert.match(appSource, /function handleDelete\(\)[\s\S]*state\.items = deleteResult\.items;\s*replaceHomeRoute\(\)/);
assert.doesNotMatch(appSource, /decodeURIComponent\((?:editMatch|detailMatch|myAppsEditMatch)/);

console.log('practice-menu-navigation: push/replace, stale routes, back/forward, and safe decode passed');
