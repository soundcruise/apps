/* クルーズスタジオ — arrangement-engine.js（Phase 5 MVP骨格）
   StudioProject → 伴奏イベント列（アコギ / ベース / ドラム）の純関数生成。
   「MIDIは曲データの変換」（APP_CONCEPT.md 4章）の実装。
   音は鳴らさない。生成イベントは絶対tick・MIDIノート番号・ベロシティを持ち、
   将来のSMF書き出し・Web Audio試聴はこのイベント列をそのまま使う（ADR-013）。
   グローバル名前空間 CruiseStudio.arrangement に登録する。 */
(function () {
    'use strict';

    function CS() { return window.CruiseStudio || {}; }

    // GMドラムマップ（ch10想定）
    var DRUM_MIDI = { kick: 36, snare: 38, hihat: 42 };
    // ベースの基準オクターブ: C2 = MIDI 36（E1〜D#2周辺に収める）
    var BASS_BASE_MIDI = 36;

    /**
     * 小節の開始絶対tickを事前計算する。
     * TODO(将来): 小節単位の拍子変更に対応するときはここで累積する。
     */
    function barStartTick(project, barIndex) {
        return barIndex * CS().model.getBarLengthTicks(project);
    }

    /**
     * ストロークパターンを取得する（小節のoverride → 基本パターン）。
     */
    function resolveStrumPattern(project, bar) {
        var id = bar.strumOverride || project.basicStrumPatternId;
        var found = null;
        (project.strumPatterns || []).forEach(function (pat) {
            if (pat.id === id) found = pat;
        });
        return found;
    }

    /**
     * アコギ: コード × ストロークパターン → ストロークイベント列。
     * 音高はコード記号のまま持つ（ボイシング展開は将来。TODO Phase 5本実装）。
     */
    function generateGuitarBar(project, bar, chordSymbol, startTick) {
        var pattern = resolveStrumPattern(project, bar);
        if (!pattern || !chordSymbol) return [];
        var barTicks = CS().model.getBarLengthTicks(project);
        var slots = (pattern.slots || []).slice().sort(function (a, b) { return a.tick - b.tick; });
        return slots.filter(function (slot) {
            return slot.action !== 'rest' && slot.tick < barTicks;
        }).map(function (slot, i, arr) {
            var nextTick = (i + 1 < arr.length) ? arr[i + 1].tick : barTicks;
            return {
                tick: startTick + slot.tick,
                durationTicks: Math.max(60, nextTick - slot.tick),
                symbol: chordSymbol,
                stroke: slot.action,            // 'down' | 'up' | 'mute'
                accent: !!slot.accent,
                velocity: slot.accent ? 108 : (slot.action === 'up' ? 84 : 96)
            };
        });
    }

    /**
     * ベース: コードのルート（オンコードならベース音）を8分で刻む。
     */
    function generateBassBar(project, chordParsed, startTick) {
        if (!chordParsed) return [];
        var theory = CS().theory;
        var si = project.songInfo;
        var noteNamePlay = chordParsed.bass || chordParsed.root; // 譜面上の音名（playKey基準）
        var concertName = theory.transposeNote(noteNamePlay, si.capo || 0); // 実音
        var semi = theory.keyToSemitone(concertName);
        if (semi === null) return [];
        var midi = BASS_BASE_MIDI + semi;
        var barTicks = CS().model.getBarLengthTicks(project);
        var events = [];
        for (var t = 0; t + 240 <= barTicks; t += 240) {
            var onBeat = (t % 960 === 0); // 1・3拍目を強め
            events.push({
                tick: startTick + t,
                durationTicks: 220,
                noteName: concertName,
                midi: midi,
                velocity: onBeat ? 106 : 92
            });
        }
        return events;
    }

    /**
     * ドラム: 基本8ビート（kick=1/3拍・snare=2/4拍・hihat=8分）。
     * TODO(将来): 4/4以外の拍子はhihatのみ全拍刻みへフォールバックを検証する。
     */
    function generateDrumBar(project, startTick) {
        var barTicks = CS().model.getBarLengthTicks(project);
        var events = [];
        for (var t = 0; t + 240 <= barTicks; t += 240) {
            events.push({ tick: startTick + t, part: 'hihat', midi: DRUM_MIDI.hihat, velocity: 78 });
        }
        for (var beat = 0; beat * 480 < barTicks; beat++) {
            var tick = startTick + beat * 480;
            if (beat % 2 === 0) {
                events.push({ tick: tick, part: 'kick', midi: DRUM_MIDI.kick, velocity: 112 });
            } else {
                events.push({ tick: tick, part: 'snare', midi: DRUM_MIDI.snare, velocity: 104 });
            }
        }
        return events.sort(function (a, b) { return a.tick - b.tick; });
    }

    /**
     * プロジェクト全体から伴奏イベントを生成する（純関数・プロジェクトは変更しない）。
     *
     * コードの継続規則: コード未入力の小節は直前のコードを継続する（リードシートの慣習）。
     * 曲頭からコードが一度も現れていない小節は休みとして生成をスキップする。
     *
     * @returns {{
     *   ok: boolean,
     *   meta: object,
     *   bars: Array<{barNumber, sectionId, chordSymbol, isCarriedOver, guitar, bass, drums}>,
     *   totals: {guitar: number, bass: number, drums: number, chordBars: number},
     *   warnings: string[]
     * }}
     */
    function generateArrangement(project) {
        var theory = CS().theory;
        var warnings = [];
        if (!project || !project.songInfo || !Array.isArray(project.bars)) {
            return { ok: false, meta: {}, bars: [], totals: { guitar: 0, bass: 0, drums: 0, chordBars: 0 }, warnings: ['プロジェクトが不正です'] };
        }
        var arr = project.arrangement || {};
        var enabled = {
            guitar: !arr.guitar || arr.guitar.enabled !== false,
            bass: !arr.bass || arr.bass.enabled !== false,
            drums: !arr.drums || arr.drums.enabled !== false
        };

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
                    warnings.push('解釈できないコードはベース生成をスキップします（例: ' + chordEv.symbol + '）');
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
                if (enabled.guitar) result.guitar = generateGuitarBar(project, bar, currentChordSymbol, startTick);
                if (enabled.bass) result.bass = generateBassBar(project, currentChordParsed, startTick);
            }
            if (enabled.drums) result.drums = generateDrumBar(project, startTick);

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
                bpm: project.songInfo.bpm,
                timeSignature: project.songInfo.timeSignature,
                ticksPerBeat: project.songInfo.ticksPerBeat,
                playKey: project.songInfo.playKey,
                originalKey: project.songInfo.originalKey,
                capo: project.songInfo.capo,
                enabled: enabled,
                generatedAt: new Date().toISOString()
            },
            bars: bars,
            totals: totals,
            warnings: warnings
        };
    }

    /**
     * ストロークパターンを8分スロットのグリフ列にする（プレビュー表示用）。
     * down=D / up=U / mute=x / 休み=・、アクセントは後ろに>。
     */
    function strumPatternToGlyphs(project, bar) {
        var pattern = resolveStrumPattern(project, bar);
        if (!pattern) return '';
        var barTicks = CS().model.getBarLengthTicks(project);
        var glyphs = [];
        for (var t = 0; t < barTicks; t += 240) {
            var hit = null;
            (pattern.slots || []).forEach(function (slot) {
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
        generateArrangement: generateArrangement,
        strumPatternToGlyphs: strumPatternToGlyphs
    };
})();
