/* Read-only Standard adapter. Chord Cruise owns all musical construction/spelling. */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.CruiseStudio.chordReadModel = factory();
})(globalThis, function () {
    'use strict';
    function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
    function createAdapter(options) {
        var theory = options.chordTheory, model = options.chordModel, parse = options.studioTheory.parseBasicChordSymbol;
        // Syntax bridge only; intervals and spelling always come from the released owner.
        var supported = Object.freeze({ '': 'maj', m: 'm', '7': '7', M7: 'maj7', maj7: 'maj7', m7: 'm7', sus4: 'sus4', add9: 'add9' });
        function analyze(symbol) {
            var original = typeof symbol === 'string' ? symbol : '';
            var text = original.trim(), tokens = parse(text);
            if (!text) return freeze({ status: 'empty', symbol: original });
            if (!tokens || /\s/.test(text) || !Object.hasOwn(supported, tokens.quality)) return freeze({ status: 'unsupported', symbol: original });
            var root = theory.parseSpelledNoteName(tokens.root), bass = tokens.bass ? theory.parseSpelledNoteName(tokens.bass) : null;
            if (!root || (tokens.bass && !bass)) return freeze({ status: 'unsupported', symbol: original });
            var key = supported[tokens.quality], quality = theory.QUALITIES[key], intervals, degrees;
            if (key === 'add9') {
                var major = theory.QUALITIES.maj;
                var custom = model.buildCustomChord({ rootPc: root.pc, third: major.intervals[1], fifth: major.intervals[2], seventh: null, tensions: [14], bassPc: null });
                intervals = custom.intervals; degrees = custom.degreeLabelsList;
            } else {
                if (!quality || !['basic', 'intermediate'].includes(quality.complexity)) return freeze({ status: 'unsupported', symbol: original });
                intervals = quality.intervals.slice(); degrees = theory.degreeLabelsForQuality(key, intervals);
            }
            var notes = theory.spellChordNotes({ rootPc: root.pc, rootName: tokens.root, intervals: intervals, degreeLabels: degrees });
            return freeze({ status: 'ready', symbol: original, rootName: root.name, qualityKey: key,
                notes: notes, degrees: degrees.slice(), bass: bass ? { name: bass.name, pc: bass.pc } : null,
                source: 'chord-cruise', readOnly: true });
        }
        function read(selection) {
            if (!selection || !selection.active) return freeze({ status: 'inactive' });
            if (selection.invalid) return freeze({ status: 'invalid' });
            if (selection.deleted) return freeze({ status: 'deleted' });
            if (!selection.barNumbers?.length) return freeze({ status: 'unselected' });
            if (selection.barNumbers.length !== 1 || selection.chords.length > 1) return freeze({ status: 'multiple' });
            if (selection.editing) return freeze({ status: 'editing', symbol: selection.chords[0]?.symbol || '',
                barNumber: selection.barNumbers[0], editing: true, dirty: !!selection.dirty, externalUpdatePending: !!selection.externalUpdatePending });
            var result = analyze(selection.chords[0]?.symbol || '');
            return freeze(Object.assign({}, result, { barNumber: selection.barNumbers[0], editing: !!selection.editing,
                dirty: !!selection.dirty, externalUpdatePending: !!selection.externalUpdatePending }));
        }
        return Object.freeze({ analyze: analyze, read: read });
    }
    return Object.freeze({ createAdapter: createAdapter });
});
