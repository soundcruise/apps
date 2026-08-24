'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var librarySource = fs.readFileSync(path.join(root, 'js/ui/library.js'), 'utf8');
var exportSource = fs.readFileSync(path.join(root, 'js/ui/chord-export.js'), 'utf8');
var featureSource = fs.readFileSync(path.join(root, 'js/core/feature-access.js'), 'utf8');
var themeSource = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');

assert(featureSource.includes('access.advancedExport = isProEdition();'), 'advancedExport uses the existing edition feature-access boundary');
assert(librarySource.includes("access.hasFeature('advancedExport')"), 'individual and folder export share the advancedExport check');
assert(librarySource.includes('id="cc-library-folder-export-btn"'), 'Pro folder controls include the export button below display controls');
assert(librarySource.includes('function downloadIconSvg()'), 'individual and folder export use one download icon');
assert(librarySource.includes('cc-lib-list-display-row cc-lib-list-monochrome-row'), 'folder monochrome controls and export icon share one row');
assert(librarySource.indexOf("'<button type=\"button\" class=\"cc-btn cc-btn-secondary cc-lib-edit-btn\"") < librarySource.indexOf("detailExportHtml +\n            '</div>'"), 'detail edit button appears before the export icon');
assert(librarySource.includes('書き出しを実行しますか？'), 'export requires the requested confirmation');
assert(librarySource.includes("confirmExport(folderExportButton"), 'folder export waits for confirmation');
assert(librarySource.includes("confirmExport(detailExportButton"), 'individual export waits for confirmation');
assert(librarySource.includes('function buildFolderExportSvg(folder, chords)'), 'folder PNG builds a dedicated self-contained SVG');
assert(librarySource.includes("escapeHtml(folder.name) + '</text>'"), 'folder name is rendered at the top of the folder PNG');
assert(librarySource.includes('window.ChordCruise.ui.fretboard.buildStaticSvg(diagramOptions)'), 'folder export reuses each card static SVG renderer');
assert(librarySource.includes('function listDiagramOptions(chord, options)'), 'live thumbnails and folder export share diagram options');
assert(librarySource.includes('columns: columns') && librarySource.includes('displayMode: mode') && librarySource.includes('monochrome: monochrome'), 'folder export receives columns, display mode, and monochrome state');
assert(librarySource.includes("globalDisplaySize('chordNameSize')"), 'folder export reflects the global chord-name size');
assert(librarySource.includes("globalDisplaySize('fretNumberSize')"), 'folder export reflects the global fret-number size');
assert(librarySource.includes("libraryCardFretNumberScale(globalDisplaySize('fretNumberSize'), columns)"), 'live list and folder PNG share the fixed fret-number table');
assert(librarySource.includes("globalDisplaySize('fretboardMarkerLabelSize')"), 'folder export reflects the global marker-label size');
assert(librarySource.includes('exportSvgPng(exportSvg, filename)'), 'folder SVG uses the existing SVG-to-PNG delivery path');
assert(exportSource.includes('function exportSvgPng(exportSvg, filename)'), 'the existing PNG converter exposes a composed-SVG entry point');
assert(librarySource.includes('.replace(/\\spreserveAspectRatio='), 'nested white-black SVG removes an existing aspect-ratio attribute before positioning');

assert(librarySource.includes("card.classList.toggle('cc-chordthumb-card--monochrome', monochrome)"), 'list cards receive a monochrome-only class');
assert(themeSource.includes('.cc-chordthumb-card--monochrome .cc-chordthumb-name'), 'monochrome list chord names have scoped styling');
assert(themeSource.includes('.cc-chordthumb-card--monochrome {') && themeSource.includes('background: #ffffff;'), 'the entire monochrome list card interior is white');
assert(themeSource.includes('.cc-chordthumb-card--monochrome .cc-chordthumb-board'), 'the monochrome title/board boundary is removed without affecting color cards');
assert(themeSource.includes('.cc-export-icon-btn') && themeSource.includes('.cc-download-icon'), 'both export locations use the compact download icon styling');
assert(themeSource.includes('flex-wrap: nowrap;'), 'mobile detail actions do not wrap when monochrome state text changes');
assert(themeSource.includes('flex: 0 0 38px;') && themeSource.includes('flex: 1 1 auto;'), 'mobile export icon and edit button keep a stable centered row');
assert(themeSource.includes('align-items: center;'), 'mobile detail actions remain vertically centered');
assert(librarySource.includes('xlarge: 28'), 'folder PNG synchronizes the enlarged xlarge list title');
assert(librarySource.includes('{ 1: 1.48, 2: 1.24, 3: 1.12, 4: 0.87 }'), 'folder PNG uses the same column-scale progression as the list');
assert(librarySource.includes('return Math.round(value * scale);'), 'folder PNG applies its column scale to every display size');

var baseTitleSizes = [16, 18, 20, 22, 28];
var columnScales = [1.48, 1.24, 1.12, 0.87];
columnScales.forEach(function (scale, columnIndex) {
    var values = baseTitleSizes.map(function (size) { return Math.round(size * scale); });
    values.forEach(function (value, sizeIndex) {
        if (sizeIndex > 0) assert(value > values[sizeIndex - 1], 'folder PNG size order is retained for column ' + (columnIndex + 1));
    });
    if (columnIndex > 0) {
        assert(Math.round(20 * scale) < Math.round(20 * columnScales[columnIndex - 1]), 'medium title becomes smaller as columns increase');
    }
});
assert.strictEqual(Math.round(20 * columnScales[0]), 30, 'one-column medium is approximately the former xlarge folder title');
assert(Math.abs(0.92 * columnScales[3] - 0.80) < 0.01, 'four-column medium is approximately the unscaled small title');

console.log('library-folder-export: Pro export gate, composed SVG settings, monochrome title, and stable mobile actions OK');
