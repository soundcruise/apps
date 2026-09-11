import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    HOME_HISTORY_MODE,
    PRACTICE_ROUTE_KIND,
    parsePracticeRoute,
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

function replaceWithPracticeList(browser) {
    browser.replaceState(null, '', `${browser.location.pathname}${browser.location.search}#practice-menu`);
}

{
    const browser = new MemoryBrowserHistory();
    browser.pushHash('#practice-menu');
    browser.pushHash('#practice-menu/new');
    replaceWithPracticeList(browser);
    assert.equal(browser.location.hash, '#practice-menu', 'successful create replaces the completed form with the Practice Menu list');
    browser.back();
    assert.equal(browser.location.hash, '#practice-menu', 'back after create cannot reopen the completed form');
    browser.forward();
    assert.equal(browser.location.hash, '#practice-menu', 'forward stays on the list without a form loop');
}

{
    const browser = new MemoryBrowserHistory();
    browser.pushHash('#practice-menu');
    browser.pushHash('#practice-menu/menu-1');
    browser.back();
    assert.equal(browser.location.hash, '#practice-menu', 'normal detail -> back returns the Practice Menu list');
}

{
    const browser = new MemoryBrowserHistory();
    browser.pushHash('#practice-menu');
    browser.pushHash('#practice-menu/menu-1');
    const lengthBeforeDelete = browser.length;
    replaceWithPracticeList(browser);
    assert.equal(browser.location.hash, '#practice-menu', 'delete replaces the current detail entry with the Practice Menu list');
    assert.equal(browser.length, lengthBeforeDelete, 'delete does not grow history');
    assert.equal(browser.pushCount, 2, 'delete does not add another push after list and detail navigation');
    assert.equal(browser.replaceCount, 1);

    browser.back();
    assert.equal(browser.location.hash, '#practice-menu', 'back cannot revisit the deleted detail route');
    browser.forward();
    assert.equal(browser.location.hash, '#practice-menu', 'forward returns the Practice Menu list without a loop');
}

for (const staleHash of [
    '#practice-menu/deleted-id',
    '#practice-menu/never-existed-id',
    '#practice-menu/deleted-id/edit'
]) {
    const browser = new MemoryBrowserHistory('https://soundcruise.jp/apps/cruise-port/?source=test');
    browser.pushHash(staleHash);
    const lengthBeforeCorrection = browser.length;
    replaceWithPracticeList(browser);
    assert.equal(browser.location.hash, '#practice-menu', `${staleHash} is corrected to the Practice Menu list`);
    assert.equal(browser.location.search, '?source=test', 'list correction preserves the query');
    assert.equal(browser.length, lengthBeforeCorrection, 'stale correction does not grow history');
    browser.back();
    assert.notEqual(browser.location.hash, staleHash, 'back does not revisit a corrected stale route');
}

for (const encoded of ['%ZZ', '%', '%E0%A4%A']) {
    assert.equal(safeDecodeRouteSegment(encoded), null, `${encoded} fails closed without URIError`);
    const browser = new MemoryBrowserHistory();
    browser.pushHash(`#practice-menu/${encoded}`);
    const lengthBeforeCorrection = browser.length;
    replaceWithPracticeList(browser);
    assert.equal(browser.location.hash, '#practice-menu');
    assert.equal(browser.length, lengthBeforeCorrection, 'invalid route correction does not grow history');
}

assert.equal(safeDecodeRouteSegment('menu%20name'), 'menu name');
assert.deepEqual(parsePracticeRoute('#practice-menu'), { kind: PRACTICE_ROUTE_KIND.list });
assert.deepEqual(parsePracticeRoute('#practice-menu/new'), { kind: PRACTICE_ROUTE_KIND.create });
assert.deepEqual(parsePracticeRoute('#practice-menu/calendar'), { kind: PRACTICE_ROUTE_KIND.calendar });
assert.deepEqual(parsePracticeRoute('#practice-menu/history'), { kind: PRACTICE_ROUTE_KIND.calendar });
assert.deepEqual(parsePracticeRoute('#practice-menu/hidden'), { kind: PRACTICE_ROUTE_KIND.hidden });
assert.deepEqual(parsePracticeRoute('#practice-menu/menu%20id'), { kind: PRACTICE_ROUTE_KIND.detail, id: 'menu id' });
assert.deepEqual(parsePracticeRoute('#practice-menu/menu%20id/edit'), { kind: PRACTICE_ROUTE_KIND.edit, id: 'menu id' });
assert.deepEqual(parsePracticeRoute('#practice-menu/%ZZ'), { kind: PRACTICE_ROUTE_KIND.invalid });
assert.equal(parsePracticeRoute('#metronome'), null);

{
    const browser = new MemoryBrowserHistory();
    browser.pushHash('#practice-menu');
    browser.pushHash('#practice-menu/calendar');
    browser.back();
    assert.equal(browser.location.hash, '#practice-menu', 'calendar back returns to the list');
    browser.forward();
    assert.equal(browser.location.hash, '#practice-menu/calendar');
}

{
    const browser = new MemoryBrowserHistory();
    browser.pushHash('#practice-menu');
    browser.pushHash('#practice-menu/hidden');
    browser.back();
    assert.equal(browser.location.hash, '#practice-menu', 'hidden list back returns to the main list');
}

const appSource = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
assert.match(appSource, /function replaceHomeRoute\(\)[\s\S]*HOME_HISTORY_MODE\.replace/);
assert.match(appSource, /function replacePracticeListRoute\(\)[\s\S]*history\.replaceState[\s\S]*#practice-menu/);
assert.match(appSource, /function replacePracticeDetailRoute\(id\)[\s\S]*history\.replaceState/);
const submitSource = appSource.slice(appSource.indexOf('async function handleSubmit'), appSource.indexOf('\nfunction cancelForm'));
const editSubmitSource = submitSource.slice(0, submitSource.indexOf("if (!guardPracticeCreation()) return;"));
const createSubmitSource = submitSource.slice(submitSource.indexOf("if (!guardPracticeCreation()) return;"));
assert.match(createSubmitSource, /savePendingPracticeAttachments\(practiceAttachmentStore, item\.id, pending\)[\s\S]*await refreshPracticeAttachmentCounts\(\{ renderList: false \}\)[\s\S]*if \(attachmentResult\.ok\)[\s\S]*replacePracticeListRoute\(\)/);
assert.match(createSubmitSource, /if \(attachmentResult\.ok\)[\s\S]*replacePracticeListRoute\(\)[\s\S]*state\.savedNotice[\s\S]*replacePracticeDetailRoute\(item\.id\)/);
assert.doesNotMatch(createSubmitSource, /if \(attachmentResult\.ok\)[\s\S]*state\.listNotice/);
assert.match(editSubmitSource, /state\.savedNotice = \{ id: state\.activeId, message: '変更を保存しました。' \};[\s\S]*replacePracticeDetailRoute\(state\.activeId\)/);
assert.match(appSource, /function renderDetail\(id\)[\s\S]*if \(!item\) \{\s*replacePracticeListRoute\(\)/);
assert.match(appSource, /function renderForm\(mode, id = null\)[\s\S]*mode === 'edit' && !item\)[\s\S]*replacePracticeListRoute\(\)/);
assert.match(appSource, /async function handleDelete\(\)[\s\S]*persistPracticeItemsAndProgress\(deleteResult\.items, nextProgress\)/);
assert.match(appSource, /PRACTICE_ROUTE_KIND\.calendar[\s\S]*renderPracticeHistory/);
assert.match(appSource, /PRACTICE_ROUTE_KIND\.hidden[\s\S]*renderPracticeHiddenList/);
assert.doesNotMatch(appSource, /decodeURIComponent\((?:editMatch|detailMatch|myAppsEditMatch)/);

console.log('practice-menu-navigation: push/replace, stale routes, back/forward, and safe decode passed');
