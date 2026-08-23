'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var appRoot = path.join(__dirname, '..');
var librarySource = fs.readFileSync(path.join(appRoot, 'js/ui/library.js'), 'utf8');
var fretboardSource = fs.readFileSync(path.join(appRoot, 'js/ui/fretboard.js'), 'utf8');

global.window = { ChordCruise: {} };
require('../js/core/music-theory.js');
require('../js/core/caged-forms.js');

var caged = window.ChordCruise.caged;
var theory = window.ChordCruise.theory;
var legacyQualities = ['maj', 'm', '7', 'maj7', 'm7', 'm7b5', 'dim'];
var qualities = legacyQualities.concat(['aug', 'mMaj7', 'maj7sharp5', 'dim7']);
var shapes = ['C', 'A', 'G', 'E', 'D'];
var ranges = [{ start: 0, end: 13 }, { start: 12, end: 25 }];
var expectedOverrides = {
    maj: { 0: 'C', 2: 'D', 4: 'E', 5: 'E', 7: 'G', 9: 'A' },
    m: { 2: 'D', 4: 'E', 9: 'A' },
    '7': { 0: 'C', 2: 'D', 4: 'E', 7: 'G', 9: 'A' },
    maj7: { 0: 'C', 2: 'D', 4: 'E', 7: 'G', 9: 'A' },
    m7: { 2: 'D', 4: 'E', 9: 'A' }
};

var expectedRecommendedOverrides = {
    dim: { 11: 'A' }
};

var expectedByRange = {
    '0-13': {
        maj: ['C*', 'A', 'D*', 'A', 'E*', 'E*', 'E', 'G*', 'E', 'A*', 'A', 'A'],
        m: ['A', 'A', 'D*', 'A', 'E*', 'E', 'E', 'E', 'E', 'A*', 'A', 'A'],
        '7': ['C*', 'A', 'D*', 'A', 'E*', 'E', 'E', 'G*', 'E', 'A*', 'A', 'A'],
        maj7: ['C*', 'A', 'D*', 'A', 'E*', 'E', 'E', 'G*', 'E', 'A*', 'A', 'A'],
        m7: ['A', 'A', 'D*', 'A', 'E*', 'E', 'E', 'E', 'E', 'A*', 'A', 'A'],
        m7b5: ['A', 'A', 'A', 'A', 'A', 'E', 'E', 'E', 'E', 'E', 'E', 'A'],
        dim: ['A', 'A', 'A', 'A', 'A', 'E', 'E', 'E', 'E', 'E', 'E', 'A']
    },
    '12-25': {
        maj: ['C*', 'A', 'D*', 'A', 'E*', 'E*', 'E', 'G*', 'E', 'A*', 'A', 'A'],
        m: ['A', 'A', 'D*', 'A', 'E*', 'E', 'E', 'E', 'E', 'A*', 'A', 'A'],
        '7': ['C*', 'A', 'D*', 'A', 'E*', 'E', 'E', 'G*', 'E', 'A*', 'A', 'A'],
        maj7: ['C*', 'A', 'D*', 'A', 'E*', 'E', 'E', 'G*', 'E', 'A*', 'A', 'A'],
        m7: ['A', 'A', 'D*', 'A', 'E*', 'E', 'E', 'E', 'E', 'A*', 'A', 'A'],
        m7b5: ['A', 'A', 'A', 'A', 'A', 'E', 'E', 'E', 'E', 'E', 'E', 'A'],
        dim: ['A', 'A', 'A', 'A', 'E', 'E', 'E', 'E', 'E', 'E', 'E', 'A']
    }
};

ranges.forEach(function (range) {
    qualities.forEach(function (quality) {
        for (var rootPc = 0; rootPc < 12; rootPc++) {
            shapes.forEach(function (shape) {
                var candidate = caged.getForm(shape, quality, rootPc, range.end, range.start);
                if (!candidate.available) return;
                candidate.notes.forEach(function (note) {
                    var actualPc = (theory.OPEN_STRINGS[6 - note.string] + note.fret) % 12;
                    assert.strictEqual(actualPc, (rootPc + note.interval) % 12, 'actual note and interval must match');
                    assert(note.fret >= range.start && note.fret <= range.end, 'visible note must stay in range');
                });
            });
            var featured = caged.getCommonForm(quality, rootPc, range.end, range.start);
            assert(featured, quality + '/' + rootPc + ' should have a featured form');
            assert.deepStrictEqual(
                caged.getCommonForm(quality, rootPc, range.end, range.start),
                featured,
                'same input must always produce the same representative form'
            );
            var form = caged.getForm(featured.shape, quality, rootPc, range.end, range.start);
            assert.strictEqual(form.available, true, 'featured form must be selectable');
            assert(form.notes.length > 0, 'featured form must have visible notes');
            if (featured.source === 'recommended' && (featured.shape === 'E' || featured.shape === 'A')) {
                assert(featured.metrics.visibleNoteCount >= 3, 'preferred barre form must show enough notes');
                assert(featured.metrics.omittedNoteCount < 3, 'preferred barre form must not omit too many notes');
                assert(featured.metrics.warningCount * 2 <= featured.metrics.visibleNoteCount, 'preferred barre form must not have excessive warnings');
                assert.strictEqual(featured.metrics.bassRootFretted, true, 'preferred barre form must fret its lowest root');
                assert(featured.metrics.span <= 4, 'preferred barre form must not require an excessive stretch');
            }
        }
    });
});

Object.keys(expectedByRange).forEach(function (rangeKey) {
    var bounds = rangeKey.split('-').map(Number);
    legacyQualities.forEach(function (quality) {
        expectedByRange[rangeKey][quality].forEach(function (expected, rootPc) {
            var featured = caged.getCommonForm(quality, rootPc, bounds[1], bounds[0]);
            var actual = featured.shape + (featured.source === 'common' ? '*' : '');
            assert.strictEqual(actual, expected, rangeKey + ' ' + quality + '/' + rootPc);
        });
    });
});

[
    { rootPc: 5, quality: 'maj', shape: 'E', source: 'common' },
    { rootPc: 5, quality: 'm', shape: 'E' },
    { rootPc: 10, quality: 'maj', shape: 'A' },
    { rootPc: 10, quality: 'm', shape: 'A' },
    { rootPc: 11, quality: 'maj', shape: 'A' },
    { rootPc: 11, quality: 'm', shape: 'A' },
    { rootPc: 1, quality: 'maj', shape: 'A' },
    { rootPc: 1, quality: 'm', shape: 'A' },
    { rootPc: 6, quality: 'maj', shape: 'E' },
    { rootPc: 6, quality: 'm', shape: 'E' }
].forEach(function (expected) {
    var featured = caged.getCommonForm(expected.quality, expected.rootPc, 13, 0);
    assert.strictEqual(featured.shape, expected.shape);
    assert.strictEqual(featured.source, expected.source || 'recommended');
});

Object.keys(expectedOverrides).forEach(function (quality) {
    Object.keys(expectedOverrides[quality]).forEach(function (rootPcText) {
        var rootPc = Number(rootPcText);
        var featured = caged.getCommonForm(quality, rootPc, 13, 0);
        assert.strictEqual(featured.shape, expectedOverrides[quality][rootPc]);
        assert.strictEqual(featured.source, 'common');
    });
});

Object.keys(expectedRecommendedOverrides).forEach(function (quality) {
    Object.keys(expectedRecommendedOverrides[quality]).forEach(function (rootPcText) {
        var rootPc = Number(rootPcText);
        var featured = caged.getCommonForm(quality, rootPc, 13, 0);
        assert.strictEqual(featured.shape, expectedRecommendedOverrides[quality][rootPc]);
        assert.strictEqual(featured.source, 'recommended');
    });
});

// 一部音が0F未満になるGm G型も、表示可能音が残るため選択可能である。
var partialGm = caged.getForm('G', 'm', 7, 13, 0);
assert.strictEqual(partialGm.available, true);
assert.strictEqual(partialGm.hasOutOfRangeNotes, true);
assert(partialGm.notes.length > 0);

// 開放フォームは実音がない中間フレットも含め、0Fから連続したフォーム範囲で扱う。
[
    { label: 'G/G型', shape: 'G', quality: 'maj', rootPc: 7, blankFret: 1 },
    { label: 'A/A型', shape: 'A', quality: 'maj', rootPc: 9, blankFret: 1 },
    { label: 'C/C型', shape: 'C', quality: 'maj', rootPc: 0 },
    { label: 'E/E型', shape: 'E', quality: 'maj', rootPc: 4 },
    { label: 'D/D型', shape: 'D', quality: 'maj', rootPc: 2 },
    { label: 'Am/A型', shape: 'A', quality: 'm', rootPc: 9 },
    { label: 'Em/E型', shape: 'E', quality: 'm', rootPc: 4 },
    { label: 'Dm/D型', shape: 'D', quality: 'm', rootPc: 2 }
].forEach(function (expected) {
    var openForm = caged.getForm(expected.shape, expected.quality, expected.rootPc, 13, 0);
    assert.strictEqual(openForm.available, true, expected.label + ' must be available');
    assert.strictEqual(openForm.displayRange.includesOpen, true, expected.label + ' must include 0F');
    assert.strictEqual(openForm.displayRange.formStart, 0, expected.label + ' must start at 0F');
    assert.strictEqual(openForm.displayRange.viewportStart, 0, expected.label + ' must initially show 0F');
    assert.strictEqual(openForm.displayRange.min, 0, expected.label + ' highlight must start at 0F');
    assert(openForm.displayRange.viewportEnd >= openForm.displayRange.formEnd, expected.label + ' viewport must include the full form');
    assert(openForm.displayRange.actualNoteFrets.indexOf(0) !== -1, expected.label + ' must have an actual open note');
    if (expected.blankFret != null) {
        assert.strictEqual(openForm.displayRange.actualNoteFrets.indexOf(expected.blankFret), -1, expected.label + ' test requires an empty intermediate fret');
        assert(openForm.displayRange.formEnd > expected.blankFret, expected.label + ' form must span past the empty fret');
    }
});

var highMovable = caged.getForm('G', 'maj', 7, 25, 12);
assert.strictEqual(highMovable.available, true);
assert.strictEqual(highMovable.displayRange.includesOpen, false);
assert(highMovable.displayRange.formStart >= 12, 'high-fret movable form must not return to 0F');

// 本棚サムネイル／PNGの共通SVGでも、0F列と中間の空フレットを連続表示し、
// 正常な開放フォームに点線を描かない。
require('../js/ui/fretboard.js');
var fretboard = window.ChordCruise.ui.fretboard;
var gOpenForm = caged.getForm('G', 'maj', 7, 13, 0);
var gOpenRange = gOpenForm.displayRange;
var gOpenFrets = [];
for (var gFret = gOpenRange.formStart; gFret <= gOpenRange.formEnd; gFret++) gOpenFrets.push(gFret);
var gDiagramOptions = {
    frets: gOpenFrets,
    markers: gOpenForm.notes.map(function (note) {
        return { string: note.string, fret: note.fret, label: '', role: 'root' };
    }),
    mutedStrings: gOpenForm.mutedStrings,
    rangeHighlight: {
        minFret: gOpenRange.min,
        maxFret: gOpenRange.max,
        includesOpen: gOpenRange.includesOpen
    }
};
var gStaticSvg = fretboard.buildStaticSvg(gDiagramOptions);
assert(!gStaticSvg.includes('stroke-dasharray'), 'normal open-form SVG must not use dashed range borders');
[0, 1, 2, 3].forEach(function (fret) {
    assert(gStaticSvg.includes('>' + fret + '</text>'), 'open-form SVG must keep ' + fret + 'F as a display column');
});
var gExportSvg = fretboard.buildExportSvg('G', gDiagramOptions).svg;
assert(!gExportSvg.includes('stroke-dasharray'), 'open-form PNG source SVG must not use dashed range borders');

// 固定高の本棚サムネイル用白黒SVGだけは、上下のマーカー外周とフレット番号を
// 切らないためのviewBox安全余白を持つ。通常表示／PNGの座標系は変更しない。
var gMonochromeThumbnailSvg = fretboard.buildStaticSvg(Object.assign({}, gDiagramOptions, {
    monochrome: true,
    svgPadding: { top: 14, right: 4, bottom: 18, left: 4, fillMonochromeBackground: true }
}));
assert(gMonochromeThumbnailSvg.includes('viewBox="-4 -14 268 273"'), 'monochrome thumbnail must include safe SVG margins');
assert(gMonochromeThumbnailSvg.includes('class="cc-fb-mono-panel"'), 'monochrome thumbnail must keep its safety area white');
assert(gMonochromeThumbnailSvg.includes('class="cc-fb-mono-boundary" x="0"') && gMonochromeThumbnailSvg.includes('>0</text>'), 'non-library monochrome SVG must retain its existing 0F rendering');
var gMonochromeLibraryThumbnailSvg = fretboard.buildStaticSvg(Object.assign({}, gDiagramOptions, {
    monochrome: true,
    openStringNutOnly: true,
    monochromeViewportLeftCrop: 12,
    monochromeFretNumberYOffset: 5,
    svgPadding: { top: 14, right: 22, bottom: 18, left: 4, fillMonochromeBackground: true }
}));
assert(!gMonochromeLibraryThumbnailSvg.includes('class="cc-fb-mono-boundary" x="0"'), 'open-string library thumbnail must not draw a left 0F boundary');
assert(!gMonochromeLibraryThumbnailSvg.includes('>0</text>'), 'open-string library thumbnail must not label the nut as 0F');
assert(!/<rect x="0" y="[^"]+" width="260" height="[^"]+" fill="#333333" opacity="0\.92"\/>/.test(gMonochromeLibraryThumbnailSvg), 'open-string library thumbnail must not draw strings through the 0F column');
assert(/<rect x="69" y="[^"]+" width="191" height="[^"]+" fill="#333333" opacity="0\.92"\/>/.test(gMonochromeLibraryThumbnailSvg), 'open-string thumbnail must retain the natural nut-to-1F string span');
assert(gMonochromeLibraryThumbnailSvg.includes('x="61" y="21.45" width="8" height="181.95"'), 'open-string thumbnail must retain the natural marker-to-nut distance');
assert(gMonochromeLibraryThumbnailSvg.includes('class="cc-fb-mono-fret" x="129"'), 'open-string thumbnail must retain the natural 1F wire position');
assert(gMonochromeLibraryThumbnailSvg.includes('cx="32.5"'), 'open-string thumbnail must keep the open-string marker position');
assert(gMonochromeLibraryThumbnailSvg.includes('viewBox="8 -14 274 273"'), 'white-black library thumbnail must crop only the outer left viewport space');
assert(gMonochromeLibraryThumbnailSvg.includes('>1</text>') && gMonochromeLibraryThumbnailSvg.includes('y="234"'), 'white-black library thumbnail must lower fret numbers without moving markers');
assert(gMonochromeLibraryThumbnailSvg.includes('>1</text>'), 'open-string library thumbnail must retain 1F labels');
assert(librarySource.includes('diagramOptions.openStringNutOnly = true;'), 'library list thumbnails request nut-only open-string rendering in monochrome');
assert(!librarySource.includes('diagramOptions.compactOpenStringColumn = true;'), 'library list must not compact the internal open-string column');
assert(librarySource.includes('diagramOptions.monochromeViewportLeftCrop = 12;'), 'library list uses a white-black-only left viewport crop');
assert(librarySource.includes('if (monochrome && hasOpenColumn)'), 'library list applies the white-black open-string layout only when a 0F column exists');
assert(librarySource.includes('diagramOptions.openStringNutOnly = detailMonochrome && detailHasOpenColumn;'), 'library detail requests nut-only rendering only for white-black open-string forms');
assert(!librarySource.includes('diagramOptions.compactOpenStringColumn = detailMonochrome'), 'library detail must not compact the internal open-string column');
assert(librarySource.includes('diagramOptions.monochromeRightPadding = detailMonochrome && detailHasOpenColumn ? 18 : 0;'), 'library detail uses only white-black open-string outer right padding');
assert(fretboardSource.includes('opts.openStringNutOnly === true'), 'dynamic fretboard rendering forwards the nut-only option');
var thumbnailEdgeModel = fretboard.createModel({
    frets: [2, 3, 4, 5],
    monochrome: true,
    markers: [{ string: 1, fret: 2, label: '人' }, { string: 6, fret: 5, label: '小' }]
});
var safeViewTop = -14;
var safeViewBottom = 259;
assert(thumbnailEdgeModel.markers[0].y - 15 >= safeViewTop, 'top-string marker must remain inside the padded thumbnail viewBox');
assert(thumbnailEdgeModel.markers[1].y + 15 <= safeViewBottom, 'bottom-string marker must remain inside the padded thumbnail viewBox');
assert(202 + 5 + 22 <= safeViewBottom, 'fret-number area must remain inside the padded thumbnail viewBox');
assert(gStaticSvg.includes('viewBox="0 0 260 241"') && !gStaticSvg.includes('cc-fb-mono-panel'), 'color SVG must retain its existing viewport and background');
assert(gStaticSvg.includes('y="229"'), 'color SVG must retain its existing fret-number position');
var gMonochromeNoOpenSvg = fretboard.buildStaticSvg({
    frets: [1, 2, 3, 4],
    monochrome: true,
    markers: [{ string: 6, fret: 2, label: '人', role: 'third' }]
});
assert(gMonochromeNoOpenSvg.includes('viewBox="0 0 260 241"'), 'white-black forms without 0F must retain their existing viewport');
assert(gMonochromeNoOpenSvg.includes('y="229"'), 'white-black forms without 0F must retain the default fret-number position unless a first-fret barre needs clearance');
assert(librarySource.includes('function hasSixthStringMarker(diagramOptions)'), 'library list identifies every visible sixth-string marker for white-black number clearance');
assert(librarySource.includes('hasOpenColumn || hasFirstFretBarre(diagramOptions) || hasSixthStringMarker(diagramOptions)'), 'white-black thumbnail number clearance covers open strings, first-fret barres, and sixth-string markers');
assert(librarySource.includes('detailHasOpenColumn || hasFirstFretBarre(diagramOptions) || hasSixthStringMarker(diagramOptions)'), 'white-black detail uses the same sixth-string marker clearance');
assert(librarySource.includes('exportHasOpenColumn || hasFirstFretBarre(diagramOptions) || hasSixthStringMarker(diagramOptions)'), 'white-black PNG export uses the same sixth-string marker clearance');
var cDimBassMonochromeSvg = fretboard.buildStaticSvg({
    frets: [2, 3, 4],
    monochrome: true,
    monochromeFretNumberYOffset: 5,
    markers: [{ string: 6, fret: 2, label: '♭5', role: 'fifth', isOverlay: true, isBassCandidate: true }]
});
assert(cDimBassMonochromeSvg.includes('#e8c97a') && cDimBassMonochromeSvg.includes('y="234"'), 'sixth-string Bass overlay clears the fret-number row in white-black SVG');
var gMonochromeExportSvg = fretboard.buildExportSvg('G', Object.assign({}, gDiagramOptions, { monochrome: true })).svg;
assert(gMonochromeExportSvg.includes('viewBox="0 0 260 241"'), 'PNG source SVG must retain the normal viewport');
assert(gMonochromeExportSvg.includes('class="cc-fb-mono-boundary" x="0"') && gMonochromeExportSvg.includes('>0</text>'), 'PNG source must retain its existing 0F rendering');
assert(gExportSvg.includes('<text x="146" y="40" text-anchor="middle"'), 'default exported chord name must be centered with the fretboard');
{
    var chordNameTitleSizes = { xsmall: 26, small: 30, medium: 34, large: 38, xlarge: 42 };
    Object.keys(chordNameTitleSizes).forEach(function (size) {
        var titleSize = chordNameTitleSizes[size];
        var sizeSvg = fretboard.buildExportSvg('G', Object.assign({}, gDiagramOptions, { chordNameSize: size })).svg;
        assert(sizeSvg.includes('y="' + (titleSize + 6) + '" text-anchor="middle"'), size + ' exported chord name stays centered');
        assert(sizeSvg.includes('font-size:' + titleSize + 'px'), size + ' exported chord name uses its configured title size');
    });
}
var gMonochromeLibraryExportSvg = fretboard.buildExportSvg('G', Object.assign({}, gDiagramOptions, {
    monochrome: true,
    openStringNutOnly: true,
    monochromeViewportLeftCrop: 12,
    monochromeFretNumberYOffset: 5,
    svgPadding: { right: 18 }
})).svg;
assert(!gMonochromeLibraryExportSvg.includes('class="cc-fb-mono-boundary" x="0"'), 'white-black export must omit the 0F boundary like the library preview');
assert(!gMonochromeLibraryExportSvg.includes('>0</text>'), 'white-black export must omit the 0F label like the library preview');
assert(gMonochromeLibraryExportSvg.includes('x="61" y="21.45" width="8" height="181.95"'), 'white-black export must retain the natural marker-to-nut distance');
assert(gMonochromeLibraryExportSvg.includes('class="cc-fb-mono-fret" x="129"'), 'white-black export must retain natural 1F spacing');
assert(gMonochromeLibraryExportSvg.includes('y="234"'), 'white-black export must retain the white-black-only fret-number offset');

// 一覧専用の文字倍率は静的SVGだけへ渡し、未指定時／PNGの既定値を変えない。
var textScaleOptions = {
    frets: [2, 3, 4, 5],
    markers: [
        { string: 1, fret: 2, label: 'C', role: 'root' },
        { string: 2, fret: 3, label: '♭3', role: 'third' },
        { string: 6, fret: 5, label: '⚠', role: 'other', fingeringWarning: true }
    ]
};
var defaultTextScaleSvg = fretboard.buildStaticSvg(textScaleOptions);
var largeTextScaleSvg = fretboard.buildStaticSvg(Object.assign({}, textScaleOptions, {
    fretNumberScale: 1.12,
    markerLabelScale: 1.12
}));
var smallTextScaleSvg = fretboard.buildStaticSvg(Object.assign({}, textScaleOptions, {
    fretNumberScale: 0.85,
    markerLabelScale: 0.85
}));
var xlargeTextScaleSvg = fretboard.buildStaticSvg(Object.assign({}, textScaleOptions, {
    fretNumberScale: 1.25,
    markerLabelScale: 1.25
}));
assert.strictEqual(fretboard.markerLabelScaleForSize('xsmall'), 10.4 / 12, 'right-top xsmall marker-label scale is stable');
assert.strictEqual(fretboard.markerLabelScaleForSize('small'), 12.2 / 12, 'right-top small marker-label scale is stable');
assert.strictEqual(fretboard.markerLabelScaleForSize('medium'), 13.6 / 12, 'right-top medium marker-label scale is stable');
assert.strictEqual(fretboard.markerLabelScaleForSize('large'), 15.2 / 12, 'right-top large marker-label scale is stable');
assert.strictEqual(fretboard.markerLabelScaleForSize('xlarge'), 16.8 / 12, 'right-top xlarge marker-label scale is stable');
assert.strictEqual(fretboard.markerLabelScaleForSize('invalid'), 13.6 / 12, 'invalid marker-label size falls back to medium');
assert.strictEqual(fretboard.markerLabelFontSizeForSize('xsmall'), 10.4, 'xsmall PNG marker-label size is stable');
assert.strictEqual(fretboard.markerLabelFontSizeForSize('medium'), 13.6, 'medium PNG marker-label size is stable');
assert.strictEqual(fretboard.markerLabelFontSizeForSize('xlarge'), 16.8, 'xlarge PNG marker-label size is stable');
assert.strictEqual(fretboard.fretNumberScaleForSize('xsmall'), 12 / 13, 'xsmall PNG fret-number scale is stable');
assert.strictEqual(fretboard.fretNumberScaleForSize('medium'), 16 / 13, 'medium PNG fret-number scale is stable');
assert.strictEqual(fretboard.fretNumberScaleForSize('xlarge'), 20 / 13, 'xlarge PNG fret-number scale is stable');
assert(defaultTextScaleSvg.includes('font-size:13px'), 'static fret numbers remain 13px when no list scale is supplied');
assert(largeTextScaleSvg.includes('font-size:14.56px'), 'large fret-number scale applies to the 13px baseline');
assert(smallTextScaleSvg.includes('font-size:11.05px'), 'small fret-number scale applies to the 13px baseline');
assert(xlargeTextScaleSvg.includes('font-size:16.25px'), 'xlarge fret-number scale applies to the 13px baseline');
assert(largeTextScaleSvg.includes('font-size:13.44px'), 'large marker-label scale preserves the existing per-label baseline');
assert(smallTextScaleSvg.includes('font-size:12.75px'), 'small warning-label scale preserves the warning baseline');
assert(xlargeTextScaleSvg.includes('font-size:15px'), 'xlarge marker-label scale preserves the existing per-label baseline');
assert(xlargeTextScaleSvg.includes('font-size:18.75px'), 'xlarge warning-label scale preserves the warning baseline');
var unchangedPngTextScaleSvg = fretboard.buildExportSvg('G', textScaleOptions).svg;
assert(unchangedPngTextScaleSvg.includes('font-size:13px'), 'PNG source keeps the unscaled static fret-number baseline');
var xlargePngTextScaleSvg = fretboard.buildExportSvg('G', Object.assign({}, textScaleOptions, { markerLabelScale: 1.25 })).svg;
assert(xlargePngTextScaleSvg.includes('font-size:15px'), 'PNG source applies the explicit marker-label scale');
assert(xlargePngTextScaleSvg.includes('font-size:13px'), 'PNG source keeps fret-number size independent from marker-label scale');
var fiveStagePngSvg = fretboard.buildExportSvg('C', Object.assign({}, textScaleOptions, {
    chordNameSize: 'xlarge',
    fretNumberScale: fretboard.fretNumberScaleForSize('xlarge'),
    markerLabelFontSize: fretboard.markerLabelFontSizeForSize('xlarge')
})).svg;
assert(fiveStagePngSvg.includes('font-size:42px'), 'xlarge PNG chord name uses 42px');
assert(fiveStagePngSvg.includes('font-size:20px'), 'xlarge PNG fret numbers use 20px');
assert(fiveStagePngSvg.includes('font-size:16.8px'), 'xlarge PNG marker labels use 16.8px');

console.log('common-caged-forms: 12 roots x 11 qualities x 2 fret ranges OK');
