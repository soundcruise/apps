import test from 'node:test';
import assert from 'node:assert/strict';
import {newsSourceDisplayName} from './news-ui.js';

test('AGM Interview and editorial sources share attribution without changing records', () => {
    for (const [path, sourceName] of [
        ['/interview/2026-0909-oishi-masayoshi/', 'AGM / Rittor Music'],
        ['/interview/2026-0824-takeuchi-annna/', 'AGM / Rittor Music'],
        ['/2026-1001-martin-crosroads-erickclapton-signature/', 'Acoustic Guitar Magazine'],
        ['/2026-0930-oshio-loveisallaround/', 'Acoustic Guitar Magazine'],
        ['/2026-0928-ortega-r24ro-rce24ro/', 'Acoustic Guitar Magazine'],
        ['/gears/2026-0916-yamaha-ls36-proto-ntx1200r/', 'Acoustic Guitar Magazine'],
        ['/news/future-product/', 'Future internal source name']
    ]) {
        const item = Object.freeze({id:path, sourceName, sourceUrl:`https://acousticguitarmagazine.jp${path}`, label:'Original headline', publishedAt:'2026-10-01', category:'artist_guitar'});
        const before = JSON.stringify(item);
        assert.equal(newsSourceDisplayName(item), 'ACOUSTIC GUITAR MAGAZINE');
        assert.equal(JSON.stringify(item), before);
    }
});

test('other publishers, internal articles and lookalike domains retain their attribution', () => {
    for (const sourceUrl of [undefined, 'invalid', 'https://www.shimamura.co.jp/news/', 'https://acousticguitarmagazine.jp.evil.example/', 'https://evil.example/acousticguitarmagazine.jp', 'https://guitarmagazine.jp/']) {
        assert.equal(newsSourceDisplayName({sourceUrl, sourceName:'Original source'}), 'Original source');
    }
    assert.equal(newsSourceDisplayName({sourceUrl:'https://www.acousticguitarmagazine.jp/news/',sourceName:'AGM'}),'ACOUSTIC GUITAR MAGAZINE');
});
