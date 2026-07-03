/* クルーズスタジオ — arrangement-engine.js（v0.6.0）
   StudioProject + 伴奏設定 → 伴奏イベント列（アコギ / ベース / ドラム）の純関数生成。
   「MIDIは曲データの変換」（APP_CONCEPT.md 4章）の実装。プロジェクトは変更しない。

   各イベントは part / role / barNumber / absoluteTick / tickInBar / durationTicks /
   velocity を持ち、ベース・ドラムは MIDIノート番号まで持つ（ADR-013 / ADR-015）。
   アコギは stroke イベント（コード記号＋方向＋アクセント）で持ち、
   ボイシング展開（MIDIノート化）は将来フェーズで行う。

   伴奏設定（settings）は generateArrangement の引数。曲データには保存しない（ADR-014）。
   グローバル名前空間 CruiseStudio.arrangement に登録する。 */
(function () {
    'use strict';

    function CS() { return window.CruiseStudio || {}; }

    // GMドラムマップ（10chトラック想定）
    var DRUM_MIDI = { kick: 36, snare: 38, hihat: 42 };
    // ベースの基準オクターブ: C2 = MIDI 36
    var BASS_BASE_MIDI = 36;

    /* ══════════ 伴奏設定とパターンプリセット ══════════ */

    // アコギのストロークプリセット（4/4・1920tick基準。tickは小節ローカル）
    var GUITAR_PATTERNS = [
        { id: 'project', name: '曲の基本ストローク', slots: null }, // 曲側 strumPatterns を使う
        {
            id: '8beat-standard', name: '8ビート標準',
            slots: [
                { tick: 0, action: 'down', accent: true },
                { tick: 480, action: 'down', accent: false },
                { tick: 720, action: 'up', accent: false },
                { tick: 1200, action: 'up', accent: false },
                { tick: 1440, action: 'down', accent: false },
                { tick: 1680, action: 'up', accent: false }
            ]
        },
        {
            id: '8beat-light', name: '8ビート軽め',
            slots: [
                { tick: 0, action: 'down', accent: true },
                { tick: 720, action: 'up', accent: false },
                { tick: 1200, action: 'up', accent: false },
                { tick: 1680, action: 'up', accent: false }
            ]
        },
        {
            id: 'quarter', name: '4分刻み',
            slots: [
                { tick: 0, action: 'down', accent: true },
                { tick: 480, action: 'down', accent: false },
                { tick: 960, action: 'down', accent: false },
                { tick: 1440, action: 'down', accent: false }
            ]
        }
    ];

    var GUITAR_ACCENTS = [
        { id: 'soft', name: 'ソフト' },
        { id: 'normal', name: 'ノーマル' },
        { id: 'strong', name: 'ストロング' }
    ];

    var BASS_PATTERNS = [
        { id: 'root8', name: 'ルート8分' },
        { id: 'root4', name: 'ルート4分' },
        { id: 'root5', name: 'ルート＋5度（8分）' }
    ];

    var DRUM_PATTERNS = [
        { id: '8beat', name: '8ビート標準' },
        { id: 'four-floor', name: '4つ打ち' },
        { id: 'simple', name: 'シンプル' }
    ];

    function getDefaultSettings() {
        return {
            parts: { guitar: true, bass: true, drums: true },
            guitar: { pattern: 'project', accent: 'normal' },
            bass: { pattern: 'root8' },
            drums: { pattern: '8beat' }
        };
    }

    /**
     * 設定の欠損をデフォルトで補完する（保存済み設定の前方互換用）。
     */
    function normalizeSettings(settings) {
        var d = getDefaultSettings();
        var s = settings && typeof settings === 'object' ? settings : {};
        return {
            parts: {
                guitar: !s.parts || s.parts.guitar !== false,
                bass: !s.parts || s.parts.bass !== false,
                drums: !s.parts || s.parts.drums !== false
            },
            guitar: {
                pattern: (s.guitar && s.guitar.pattern) || d.guitar.pattern,
                accent: (s.guitar && s.guitar.accent) || d.guitar.accent
            },
            bass: { pattern: (s.bass && s.bass.pattern) || d.bass.pattern },
            drums: { pattern: (s.drums && s.drums.pattern) || d.drums.pattern }
        };
    }

    function findById(list, id) {
        var found = null;
        list.forEach(function (item) { if (item.id === id) found = item; });
        return found;
    }

    function clampVelocity(v) {
        return Math.min(127, Math.max(1, Math.round(v)));
    }

    /* ══════════ 共通ヘルパー ══════════ */

    function barStartTick(project, barIndex) {
        // TODO(将来): 小節単位の拍子変更に対応するときはここで累積する
        return barIndex * CS().model.getBarLengthTicks(project);
    }

    function resolveProjectStrumPattern(project, bar) {
        var id = bar.strumOverride || project.basicStrumPatternId;
        var found = null;
        (project.strumPatterns || []).forEach(function (pat) {
            if (pat.id === id) found = pat;
        });
        return found;
    }

    /**
     * アコギに使うストロークスロット列を返す（設定プリセット or 曲の基本パターン）。
     */
    function resolveGuitarSlots(project, bar, settings) {
        var preset = findById(GUITAR_PATTERNS, settings.guitar.pattern);
        if (preset && preset.slots) return preset.slots;
        var projectPattern = resolveProjectStrumPattern(project, bar);
        return projectPattern ? (projectPattern.slots || []) : [];
    }

    /* ══════════ パート生成 ══════════ */

    /**
     * アコギ: コード × ストロークスロット → ストロークイベント列。
     * MIDIノート化はしない（ボイシング展開は将来。ADR-015）。
     */
    function generateGuitarBar(project, bar, chordSymbol, startTick, settings) {
        if (!chordSymbol) return [];
        var barTicks = CS().model.getBarLengthTicks(project);
        var slots = resolveGuitarSlots(project, bar, settings)
            .slice().sort(function (a, b) { return a.tick - b.tick; });

        // アクセント強弱: ベロシティのスケーリング
        var accentMode = settings.guitar.accent;
        function velocityFor(slot) {
            var base = slot.accent ? 108 : (slot.action === 'up' ? 84 : 96);
            if (accentMode === 'soft') base -= 14;
            if (accentMode === 'strong') base += (slot.accent ? 12 : 8);
            return clampVelocity(base);
        }

        return slots.filter(function (slot) {
            return slot.action !== 'rest' && slot.tick < barTicks;
        }).map(function (slot, i, arr) {
            var nextTick = (i + 1 < arr.length) ? arr[i + 1].tick : barTicks;
            return {
                part: 'guitar',
                role: 'strum',
                barNumber: bar.barNumber,
                absoluteTick: startTick + slot.tick,
                tickInBar: slot.tick,
                durationTicks: Math.max(60, nextTick - slot.tick),
                chordSymbol: chordSymbol,
                stroke: slot.action,            // 'down' | 'up' | 'mute'
                accent: !!slot.accent,
                velocity: velocityFor(slot)
            };
        });
    }

    /**
     * ベース: コードのルート（オンコードならベース音）を設定パターンで刻む。
     * capo を加味した実音の noteName / MIDIノート番号を持つ。
     */
    function generateBassBar(project, bar, chordParsed, chordSymbol, startTick, settings) {
        if (!chordParsed) return [];
        var theory = CS().theory;
        var si = project.songInfo;
        var rootPlayName = chordParsed.bass || chordParsed.root;   // 譜面上の音名（playKey基準）
        var rootName = theory.transposeNote(rootPlayName, si.capo || 0); // 実音
        var rootSemi = theory.keyToSemitone(rootName);
        if (rootSemi === null) return [];
        var rootMidi = BASS_BASE_MIDI + rootSemi;
        var fifthName = theory.transposeNote(rootName, 7);
        var fifthMidi = rootMidi + 7;
        var barTicks = CS().model.getBarLengthTicks(project);

        function ev(tickInBar, durationTicks, role, name, midi, velocity) {
            return {
                part: 'bass',
                role: role,                     // 'root' | 'fifth'
                barNumber: bar.barNumber,
                absoluteTick: startTick + tickInBar,
                tickInBar: tickInBar,
                durationTicks: durationTicks,
                chordSymbol: chordSymbol,
                noteName: name,
                midi: midi,
                velocity: clampVelocity(velocity)
            };
        }

        var events = [];
        var pattern = settings.bass.pattern;
        if (pattern === 'root4') {
            for (var t4 = 0; t4 + 480 <= barTicks; t4 += 480) {
                events.push(ev(t4, 440, 'root', rootName, rootMidi, (t4 % 960 === 0) ? 106 : 96));
            }
        } else if (pattern === 'root5') {
            var useFifth = false;
            for (var t5 = 0; t5 + 240 <= barTicks; t5 += 240) {
                events.push(useFifth
                    ? ev(t5, 220, 'fifth', fifthName, fifthMidi, 90)
                    : ev(t5, 220, 'root', rootName, rootMidi, (t5 % 960 === 0) ? 106 : 94));
                useFifth = !useFifth;
            }
        } else { // 'root8'
            for (var t8 = 0; t8 + 240 <= barTicks; t8 += 240) {
                events.push(ev(t8, 220, 'root', rootName, rootMidi, (t8 % 960 === 0) ? 106 : 92));
            }
        }
        return events;
    }

    /**
     * ドラム: 設定パターンでイベント生成（GMノート番号・ベロシティ差付き）。
     * TODO(将来): 4/4以外の拍子はhihat刻みのみのフォールバックを検証する。
     */
    function generateDrumBar(project, bar, startTick, settings) {
        var barTicks = CS().model.getBarLengthTicks(project);
        var events = [];

        function ev(tickInBar, role, velocity) {
            return {
                part: 'drums',
                role: role,                     // 'kick' | 'snare' | 'hihat'
                barNumber: bar.barNumber,
                absoluteTick: startTick + tickInBar,
                tickInBar: tickInBar,
                durationTicks: 60,
                midi: DRUM_MIDI[role],
                velocity: clampVelocity(velocity)
            };
        }

        var pattern = settings.drums.pattern;
        if (pattern === 'four-floor') {
            for (var tf = 0; tf + 240 <= barTicks; tf += 240) {
                events.push(ev(tf, 'hihat', (tf % 480 === 0) ? 84 : 72));
            }
            for (var beatF = 0; beatF * 480 < barTicks; beatF++) {
                events.push(ev(beatF * 480, 'kick', 112));
                if (beatF % 2 === 1) events.push(ev(beatF * 480, 'snare', 100));
            }
        } else if (pattern === 'simple') {
            for (var ts = 0; ts + 480 <= barTicks; ts += 480) {
                events.push(ev(ts, 'hihat', 74));
            }
            events.push(ev(0, 'kick', 110));
            if (barTicks >= 1440) events.push(ev(960, 'snare', 98));
        } else { // '8beat'
            for (var t8 = 0; t8 + 240 <= barTicks; t8 += 240) {
                events.push(ev(t8, 'hihat', (t8 % 480 === 0) ? 82 : 72));
            }
            for (var beat = 0; beat * 480 < barTicks; beat++) {
                if (beat % 2 === 0) {
                    events.push(ev(beat * 480, 'kick', 112));
                } else {
                    events.push(ev(beat * 480, 'snare', 104));
                }
            }
        }
        return events.sort(function (a, b) { return a.absoluteTick - b.absoluteTick; });
    }

    /* ══════════ 全体生成 ══════════ */

    /**
     * プロジェクト全体から伴奏イベントを生成する（純関数・プロジェクトは変更しない）。
     *
     * コードの継続規則: コード未入力の小節は直前のコードを継続する（リードシートの慣習）。
     * 曲頭からコードが一度も現れていない小節は休みとして生成をスキップする。
     *
     * @param {object} project StudioProject
     * @param {object} [settings] 伴奏設定（省略時はデフォルト。normalizeSettingsで補完）
     */
    function generateArrangement(project, settings) {
        var theory = CS().theory;
        var warnings = [];
        if (!project || !project.songInfo || !Array.isArray(project.bars)) {
            return {
                ok: false, meta: {}, settings: normalizeSettings(settings), bars: [],
                totals: { guitar: 0, bass: 0, drums: 0, chordBars: 0 }, warnings: ['プロジェクトが不正です']
            };
        }
        var s = normalizeSettings(settings);

        var currentChordSymbol = null;
        var currentChordParsed = null;
        var hadRestWarning = false;
        var hadBadChordWarning = false;
        var totals = { guitar: 0, bass: 0, drums: 0, chordBars: 0 };

        var bars = project.bars.map(function (bar, i) {
            var startTick = barStartTick(project, i);
            var isCarriedOver = false;

            // MVPは1小節1コード（ADR-008）。先頭のコードイベントを採用する
            var chordEv = (bar.chords && bar.chords[0]) || null;
            if (chordEv && chordEv.symbol) {
                currentChordSymbol = chordEv.symbol;
                currentChordParsed = theory.parseBasicChordSymbol(chordEv.symbol);
                if (currentChordParsed === null && !hadBadChordWarning) {
                    warnings.push('解釈できないコードはベース生成（ルート推定）をスキップします（例: ' + chordEv.symbol + '）');
                    hadBadChordWarning = true;
                }
            } else if (currentChordSymbol) {
                isCarriedOver = true; // 直前コードを継続
            }

            var result = {
                barNumber: bar.barNumber,
                sectionId: bar.sectionId,
                startTick: startTick,
                chordSymbol: currentChordSymbol,
                isCarriedOver: isCarriedOver,
                guitar: [],
                bass: [],
                drums: []
            };

            if (!currentChordSymbol) {
                if (!hadRestWarning) {
                    warnings.push('曲頭にコードのない小節があるため、その区間は休みとして扱います');
                    hadRestWarning = true;
                }
            } else {
                totals.chordBars++;
                if (s.parts.guitar) result.guitar = generateGuitarBar(project, bar, currentChordSymbol, startTick, s);
                if (s.parts.bass) result.bass = generateBassBar(project, bar, currentChordParsed, currentChordSymbol, startTick, s);
            }
            if (s.parts.drums) result.drums = generateDrumBar(project, bar, startTick, s);

            totals.guitar += result.guitar.length;
            totals.bass += result.bass.length;
            totals.drums += result.drums.length;
            return result;
        });

        return {
            ok: true,
            meta: {
                projectId: project.projectId,
                title: project.songInfo.title,
                artist: project.songInfo.artist,
                bpm: project.songInfo.bpm,
                timeSignature: project.songInfo.timeSignature,
                ticksPerBeat: project.songInfo.ticksPerBeat,
                playKey: project.songInfo.playKey,
                originalKey: project.songInfo.originalKey,
                capo: project.songInfo.capo,
                midiExportTargets: ['bass', 'drums'],   // アコギはボイシング対応後（ADR-015）
                generatedAt: new Date().toISOString()
            },
            settings: s,
            bars: bars,
            totals: totals,
            warnings: warnings
        };
    }

    /**
     * 生成結果をパートごとのフラットなイベント配列にする（JSON書き出し・SMF変換用）。
     */
    function flattenEvents(arrangement) {
        var flat = { guitar: [], bass: [], drums: [] };
        (arrangement.bars || []).forEach(function (bar) {
            flat.guitar = flat.guitar.concat(bar.guitar);
            flat.bass = flat.bass.concat(bar.bass);
            flat.drums = flat.drums.concat(bar.drums);
        });
        return flat;
    }

    /**
     * アコギの実効スロットを8分グリフ列にする（プレビュー表示用）。
     * down=D / up=U / mute=x / 休み=・、アクセントは後ろに>。
     */
    function strumPatternToGlyphs(project, bar, settings) {
        var s = normalizeSettings(settings);
        var slots = resolveGuitarSlots(project, bar, s);
        if (!slots || slots.length === 0) return '';
        var barTicks = CS().model.getBarLengthTicks(project);
        var glyphs = [];
        for (var t = 0; t < barTicks; t += 240) {
            var hit = null;
            slots.forEach(function (slot) {
                if (slot.tick === t) hit = slot;
            });
            if (!hit || hit.action === 'rest') {
                glyphs.push('・');
            } else {
                var g = hit.action === 'down' ? 'D' : (hit.action === 'up' ? 'U' : 'x');
                if (hit.accent) g += '>';
                glyphs.push(g);
            }
        }
        return glyphs.join(' ');
    }

    window.CruiseStudio = window.CruiseStudio || {};
    window.CruiseStudio.arrangement = {
        GUITAR_PATTERNS: GUITAR_PATTERNS,
        GUITAR_ACCENTS: GUITAR_ACCENTS,
        BASS_PATTERNS: BASS_PATTERNS,
        DRUM_PATTERNS: DRUM_PATTERNS,
        getDefaultSettings: getDefaultSettings,
        normalizeSettings: normalizeSettings,
        generateArrangement: generateArrangement,
        flattenEvents: flattenEvents,
        strumPatternToGlyphs: strumPatternToGlyphs
    };
})();
