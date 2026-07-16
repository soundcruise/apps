/* クルーズスタジオ — song-model.js
   StudioProject（共通曲データ）の生成・検証・マイグレーション（Phase 1）。
   スキーマの正は DATA_MODEL.md。ここを変えるときは必ず DATA_MODEL.md と
   docs/DECISIONS.md を先に更新する。
   グローバル名前空間 CruiseStudio.model に登録する。 */
(function () {
    'use strict';

    var theory = window.CruiseStudio && window.CruiseStudio.theory;

    var APP_VERSION = '0.22.3';
    var SCHEMA_VERSION = 1;
    var TICKS_PER_BEAT = 480;

    function nowIso() {
        return new Date().toISOString();
    }

    function generateProjectId() {
        var rand = '';
        try {
            var buf = new Uint8Array(8);
            (window.crypto || {}).getRandomValues
                ? window.crypto.getRandomValues(buf)
                : buf.forEach(function (_, i) { buf[i] = Math.floor(Math.random() * 256); });
            rand = Array.prototype.map.call(buf, function (b) {
                return b.toString(16).padStart(2, '0');
            }).join('');
        } catch (_) {
            rand = Math.random().toString(16).slice(2, 18);
        }
        return 'csp_' + Date.now().toString(36) + '_' + rand;
    }

    function generateSectionId() {
        return 'sec_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function getDefaultSheetSettings() {
        return {
            showChords: true,
            showLyrics: true,
            showDoremi: true,
            showStrum: true,
            barsPerLine: 2,
            paperSize: 'A4',
            // タイミンググリッド（S1a）。表示専用のため schemaVersion は上げない。
            // 欠損時は sheet-renderer.js の resolveShowSettings() が既定値で補完する
            showTimingGrid: true,
            timingGridResolution: 8   // 8 | 16（全体設定。16分イベントを含む小節は自動で16分表示）
        };
    }

    function getDefaultArrangementSettings() {
        return {
            guitar: { enabled: true, strumPatternId: null }, // null = basicStrumPatternId
            bass: { enabled: true, style: 'root8' },
            drums: { enabled: true, style: '8beat' },
            midiExport: { format: 1, includeClick: false }
        };
    }

    // 8ビートの基本ストロークパターン（D _ D U _ U D U）
    function createDefaultStrumPattern() {
        return {
            id: 'strum_8beat_a',
            name: '8ビート基本',
            lengthTicks: TICKS_PER_BEAT * 4,
            slots: [
                { tick: 0, action: 'down', accent: true },
                { tick: 480, action: 'down', accent: false },
                { tick: 720, action: 'up', accent: false },
                { tick: 1200, action: 'up', accent: false },
                { tick: 1440, action: 'down', accent: false },
                { tick: 1680, action: 'up', accent: false }
            ]
        };
    }

    function createEmptyBar(barNumber, sectionId) {
        return {
            barNumber: barNumber,
            sectionId: sectionId,
            chords: [],
            lyrics: [],
            melody: [],
            strumOverride: null,
            lineBreakAfter: false
        };
    }

    /* ══════════ セクション・小節の操作（Phase 2B）══════════
       譜面クルーズのUIから呼ばれるが、モデル層に置くことで
       将来プレDTMクルーズや自動処理からも同じ操作を使えるようにする。 */

    /**
     * 1小節の長さ（tick）を返す。
     * TODO(将来): 小節単位の拍子変更（barごとの timeSignature override）に対応する。
     *             現状は songInfo.timeSignature のみを見る（Phase 2Bは4/4前提で開始）。
     */
    function getBarLengthTicks(project) {
        var ts = project && project.songInfo && project.songInfo.timeSignature;
        var beats = (ts && typeof ts.beats === 'number' && ts.beats > 0) ? ts.beats : 4;
        return beats * TICKS_PER_BEAT;
    }

    /**
     * bars をセクションの並び順にグループ化し直し、barNumber を1から振り直す。
     * セクション構造を操作したあとは必ずこれを通す。
     */
    function normalizeBarOrder(project) {
        var grouped = [];
        project.sections.forEach(function (sec) {
            project.bars.forEach(function (bar) {
                if (bar.sectionId === sec.id) grouped.push(bar);
            });
        });
        grouped.forEach(function (bar, i) {
            bar.barNumber = i + 1;
        });
        project.bars = grouped;
    }

    function getSectionBars(project, sectionId) {
        return project.bars.filter(function (bar) {
            return bar.sectionId === sectionId;
        });
    }

    function getSectionBarCount(project, sectionId) {
        return getSectionBars(project, sectionId).length;
    }

    /**
     * セクションの小節数を変更する。増えた分は末尾に空小節を足し、
     * 減った分は末尾から削る（既存小節の内容は保持する）。
     */
    function setSectionBarCount(project, sectionId, count) {
        var target = Math.min(64, Math.max(1, Math.round(count) || 1));
        var current = getSectionBars(project, sectionId);
        if (target > current.length) {
            for (var i = current.length; i < target; i++) {
                project.bars.push(createEmptyBar(0, sectionId)); // barNumberは normalize で振り直す
            }
        } else if (target < current.length) {
            var removeSet = current.slice(target);
            project.bars = project.bars.filter(function (bar) {
                return removeSet.indexOf(bar) === -1;
            });
        }
        normalizeBarOrder(project);
    }

    function addSection(project, name, barCount) {
        var section = {
            id: generateSectionId(),
            name: name || '新しいセクション',
            lyricsHidden: false
        };
        project.sections.push(section);
        var count = Math.min(64, Math.max(1, Math.round(barCount) || 4));
        for (var i = 0; i < count; i++) {
            project.bars.push(createEmptyBar(0, section.id));
        }
        normalizeBarOrder(project);
        return section;
    }

    /**
     * セクションとその小節を削除する。最後の1つは削除できない。
     * @returns {{ok: boolean, error: string|null}}
     */
    function removeSection(project, sectionId) {
        if (project.sections.length <= 1) {
            return { ok: false, error: '最後のセクションは削除できません' };
        }
        var exists = project.sections.some(function (sec) { return sec.id === sectionId; });
        if (!exists) {
            return { ok: false, error: 'セクションが見つかりません: ' + sectionId };
        }
        project.sections = project.sections.filter(function (sec) {
            return sec.id !== sectionId;
        });
        project.bars = project.bars.filter(function (bar) {
            return bar.sectionId !== sectionId;
        });
        normalizeBarOrder(project);
        return { ok: true, error: null };
    }

    function renameSection(project, sectionId, name) {
        project.sections.forEach(function (sec) {
            if (sec.id === sectionId) sec.name = String(name || '').trim() || '無題セクション';
        });
    }

    /**
     * 小節にコードを設定する（Phase 2Bは1小節1コード。ADR-008）。
     * 空文字はコードなしとして扱う。
     * TODO(Phase 2C以降): 小節内の複数コード（tick指定）に対応する。
     *                     データ構造は既に対応済みで、このUI用ヘルパーだけが1個制限。
     */
    function setBarChord(project, barNumber, symbol) {
        var bar = project.bars[barNumber - 1];
        if (!bar || bar.barNumber !== barNumber) {
            bar = project.bars.filter(function (b) { return b.barNumber === barNumber; })[0];
        }
        if (!bar) return;
        var s = String(symbol || '').trim();
        if (!s) {
            bar.chords = [];
        } else {
            bar.chords = [{ tick: 0, durationTicks: getBarLengthTicks(project), symbol: s }];
        }
    }

    function findBar(project, barNumber) {
        var bar = project.bars[barNumber - 1];
        if (bar && bar.barNumber === barNumber) return bar;
        return project.bars.filter(function (b) { return b.barNumber === barNumber; })[0] || null;
    }

    /**
     * 小節の歌詞をテキストとして返す（イベントをtick順に連結）。
     */
    function getBarLyricsText(bar) {
        if (!bar || !Array.isArray(bar.lyrics)) return '';
        return bar.lyrics.slice().sort(function (a, b) { return a.tick - b.tick; })
            .map(function (ev) { return ev.text; }).join('');
    }

    /**
     * 小節の歌詞をテキストで設定する。
     * MVPでは1小節分の文字列を tick:0 の単一イベントとして保存する（ADR-009）。
     * TODO(将来Phase): 音節ごとに複数イベントへ分割する入力に対応する。
     *                  イベントの形（{tick, text}）は変わらないため migration は不要。
     */
    function setBarLyricsText(project, barNumber, text) {
        var bar = findBar(project, barNumber);
        if (!bar) return;
        var t = String(text || '').trim();
        bar.lyrics = t ? [{ tick: 0, text: t }] : [];
    }

    /**
     * 歌詞セルのtext正規化（F2a / ADR-028）。前後の半角・全角空白をtrimする。
     * 空文字・空白のみ・「・」は削除入力として扱う（''を返す）。
     * 伸ばし記号「ー」「〜」は通常の文字として扱う（durationTicksは持たせない）。
     */
    function normalizeLyricSlotText(text) {
        var t = String(text === null || typeof text === 'undefined' ? '' : text);
        t = t.replace(/^[\s　]+|[\s　]+$/g, '');
        if (t === '' || t === '・') return '';
        return t;
    }

    /**
     * 小節の歌詞を、指定tick範囲（1セル分）単位で書き換える（F2a / ADR-028）。
     * bar.lyrics は引き続き [{tick, text}] のフラットな配列のまま（durationTicksは持たない）。
     * この関数はモデルの変更のみを行い、renderPreview・markDirty・保存は行わない
     * （呼び出し側のUI層が担当する）。
     * @param {number} slotTick セル開始tick（整数・0以上・小節長未満）
     * @param {number} slotTicks セル幅tick（正数。slotTick+slotTicksは小節長以下）
     * @param {string} text セルへ入力するテキスト（空・空白のみ・「・」は削除として扱う）
     * @returns {{ok: boolean, warnings: string[]}}
     */
    function setBarLyricSlot(project, barNumber, slotTick, slotTicks, text) {
        var warnings = [];
        var bar = findBar(project, barNumber);
        if (!bar) {
            warnings.push('小節が見つかりません: ' + barNumber);
            return { ok: false, warnings: warnings };
        }

        var barTicks = getBarLengthTicks(project);
        if (typeof slotTick !== 'number' || !Number.isInteger(slotTick) || slotTick < 0 || slotTick >= barTicks) {
            warnings.push('slotTick が不正です: ' + slotTick);
            return { ok: false, warnings: warnings };
        }
        if (typeof slotTicks !== 'number' || !(slotTicks > 0) || slotTick + slotTicks > barTicks) {
            warnings.push('slotTicks が不正です: ' + slotTicks);
            return { ok: false, warnings: warnings };
        }

        if (!Array.isArray(bar.lyrics)) bar.lyrics = [];
        var rangeStart = slotTick;
        var rangeEnd = slotTick + slotTicks;
        bar.lyrics = bar.lyrics.filter(function (ev) {
            return !(ev && typeof ev.tick === 'number' && ev.tick >= rangeStart && ev.tick < rangeEnd);
        });

        var normalized = normalizeLyricSlotText(text);
        if (normalized) {
            bar.lyrics.push({ tick: slotTick, text: normalized });
        }
        bar.lyrics.sort(function (a, b) { return a.tick - b.tick; });

        return { ok: true, warnings: warnings };
    }

    /**
     * 小節の歌詞を、指定解像度のセル配列として読み出す（F2a / ADR-028。projectは変更しない）。
     * 同一セルに複数イベントがある場合はtick順に連結し、eventCountを保持する
     * （既存のtick:0単一イベントの全文データも、そのまま先頭セルへ表示される＝
     * 自動分割はしない後方互換仕様）。
     * @param {number} resolution 8 または 16
     * @returns {Array<{text: string, eventCount: number, isMulti: boolean}>} 長さ=resolution
     */
    function getBarLyricSlots(project, barNumber, resolution) {
        var res = (resolution === 16) ? 16 : 8;
        var cells = [];
        for (var i = 0; i < res; i++) cells.push({ text: '', eventCount: 0, isMulti: false });

        var bar = findBar(project, barNumber);
        if (!bar || !Array.isArray(bar.lyrics) || bar.lyrics.length === 0) return cells;

        var barTicks = getBarLengthTicks(project);
        var slotTicks = barTicks / res;
        var sorted = bar.lyrics.slice().sort(function (a, b) { return a.tick - b.tick; });

        sorted.forEach(function (ev) {
            if (!ev || typeof ev.tick !== 'number') return;
            var idx = Math.floor(ev.tick / slotTicks);
            if (idx < 0) idx = 0;
            if (idx >= res) idx = res - 1;
            cells[idx].text += (ev.text || '');
            cells[idx].eventCount += 1;
        });
        cells.forEach(function (c) { c.isMulti = c.eventCount > 1; });
        return cells;
    }

    /**
     * 小節の歌詞を、呼び出し側が指定した任意のtick範囲配列ごとに読み出す（G2a）。
     * getBarLyricSlots() が解像度で均等分割した連番セルを返すのに対し、
     * こちらは任意の [{slotTick, slotTicks}] を渡せる純粋な読み出し関数。
     * G2b以降の拍別解像度混在（例: 8分セルの中に16分イベントが2個入る集約表示）に
     * 備えた土台で、projectは変更しない。
     * 各rangeは半開区間 [slotTick, slotTick + slotTicks) として扱い、その範囲内の
     * lyricsイベントをtick昇順で連結する。不正なrange（slotTick/slotTicksが数値でない・
     * slotTicksが正数でない等）は例外を投げず、そのrangeだけ空結果のまま返す。
     * @param {Array<{slotTick: number, slotTicks: number}>} ranges
     * @returns {Array<{text: string, eventCount: number, isMulti: boolean}>} rangesと同じ長さ
     */
    function getBarLyricSlotRanges(project, barNumber, ranges) {
        var safeRanges = Array.isArray(ranges) ? ranges : [];
        var results = safeRanges.map(function () {
            return { text: '', eventCount: 0, isMulti: false };
        });

        var bar = findBar(project, barNumber);
        if (!bar || !Array.isArray(bar.lyrics) || bar.lyrics.length === 0) return results;

        var sorted = bar.lyrics.slice().sort(function (a, b) { return a.tick - b.tick; });

        safeRanges.forEach(function (range, i) {
            if (!range || typeof range.slotTick !== 'number' || typeof range.slotTicks !== 'number' ||
                !(range.slotTicks > 0)) {
                return; // 不正rangeはそのまま空の結果にする（例外を投げない）
            }
            var rangeStart = range.slotTick;
            var rangeEnd = range.slotTick + range.slotTicks;
            sorted.forEach(function (ev) {
                if (!ev || typeof ev.tick !== 'number') return;
                if (ev.tick >= rangeStart && ev.tick < rangeEnd) {
                    results[i].text += (ev.text || '');
                    results[i].eventCount += 1;
                }
            });
        });
        results.forEach(function (r) { r.isMulti = r.eventCount > 1; });
        return results;
    }

    /**
     * 小節が16分表示を必要とするか判定する共通関数（F2a / ADR-028）。
     * tick%240!==0（またはdurationTicks%240!==0）のイベントが1つでもあれば16分表示を要求する。
     * strumSlots・lyrics・chords・melody のいずれからも判定でき、
     * sheet-renderer.jsのタイミンググリッド判定・小節ルーペの解像度判定の両方から
     * 共有参照する（F3でbar.melodyのdurationTicksもここで判定できる設計）。
     * @param {object} options
     * @param {Array} [options.strumSlots]
     * @param {Array} [options.lyrics]
     * @param {Array} [options.chords]
     * @param {Array} [options.melody]
     * @returns {boolean}
     */
    function barNeedsSixteenthResolution(options) {
        var opts = options || {};
        function hasOffGrid(events, checkDuration) {
            if (!Array.isArray(events)) return false;
            return events.some(function (ev) {
                if (!ev) return false;
                if (typeof ev.tick === 'number' && ev.tick % 240 !== 0) return true;
                if (checkDuration && typeof ev.durationTicks === 'number' && ev.durationTicks % 240 !== 0) return true;
                return false;
            });
        }
        if (hasOffGrid(opts.lyrics, false)) return true;
        if (hasOffGrid(opts.chords, false)) return true;
        if (hasOffGrid(opts.melody, true)) return true;
        if (hasOffGrid(opts.strumSlots, true)) return true;
        return false;
    }

    /**
     * 小節のドレミ（階名）をテキストで設定する。
     * 文字列は保存せず、パースして melody イベントへ正規化する（ADR-009）。
     * 配置規則: 音数（伸ばし含む）が8分で収まれば8分スロット、超えれば16分スロットに
     * 先頭から詰める。伸ばし記号は直前の音の durationTicks を1スロット延長する。
     * @returns {{warnings: string[]}}
     */
    function setBarDoremiText(project, barNumber, text) {
        var bar = findBar(project, barNumber);
        if (!bar) return { warnings: [] };
        var parsed = theory.parseDoremiString(text);
        var warnings = parsed.warnings.slice();
        var barTicks = getBarLengthTicks(project);

        var units = parsed.notes.reduce(function (n, note) { return n + 1 + note.extensions; }, 0);
        var slot = (units <= barTicks / 240) ? 240 : 120; // 8分で収まらなければ16分

        var events = [];
        var cursor = 0;
        var overflow = false;
        parsed.notes.forEach(function (note) {
            if (cursor >= barTicks) { overflow = true; return; }
            var dur = slot * (1 + note.extensions);
            if (cursor + dur > barTicks) {
                dur = barTicks - cursor; // 末尾は小節内に収める
                overflow = overflow || (note.extensions > 0);
            }
            events.push({
                tick: cursor,
                durationTicks: dur,
                step: note.step,
                alter: note.alter,
                octave: note.octave
            });
            cursor += dur;
        });
        if (overflow) warnings.push('小節に収まらない分は詰めるか省略しました');

        bar.melody = events;
        return { warnings: warnings };
    }

    /**
     * 小節のドレミをテキストとして返す（melodyイベントから再生成）。
     */
    function getBarDoremiText(bar) {
        if (!bar || !Array.isArray(bar.melody)) return '';
        return theory.melodyEventsToDoremiString(bar.melody);
    }

    /* ══════════ 基本ストローク（R1。ADR-018） ══════════
       ユーザーが記号（↓↑・〜x）で入力した曲全体のストロークを、
       専用パターン CUSTOM_BASIC_STRUM_ID として strumPatterns に保存する。
       文字列は保存せず slots が正（ADR-009と同じ思想）。
       既存プリセット（strum_8beat_a等）は削除しない。schemaVersionは1のまま。 */

    var CUSTOM_BASIC_STRUM_ID = 'strum_custom_basic';
    var BAR_STRUM_PATTERN_PREFIX = 'strum_bar_';

    function findStrumPattern(project, id) {
        var found = null;
        (project.strumPatterns || []).forEach(function (pat) {
            if (pat && pat.id === id) found = pat;
        });
        return found;
    }

    function getBeats(project) {
        var ts = project && project.songInfo && project.songInfo.timeSignature;
        return (ts && typeof ts.beats === 'number' && ts.beats > 0) ? ts.beats : 4;
    }

    function isManagedBarStrumId(id) {
        return typeof id === 'string' && id.indexOf(BAR_STRUM_PATTERN_PREFIX) === 0;
    }

    function buildManagedBarStrumId(barNumber) {
        return BAR_STRUM_PATTERN_PREFIX + String(barNumber);
    }

    function removeStrumPatternById(project, id) {
        if (!id || !Array.isArray(project.strumPatterns)) return;
        project.strumPatterns = project.strumPatterns.filter(function (pat) {
            return pat && pat.id !== id;
        });
    }

    function isStrumPatternReferenced(project, id) {
        if (!id || !Array.isArray(project.bars)) return false;
        return project.bars.some(function (bar) {
            return bar && bar.strumOverride === id;
        });
    }

    function isStrumPatternReferencedByOtherBar(project, id, ownerBar) {
        if (!id || !Array.isArray(project.bars)) return false;
        return project.bars.some(function (bar) {
            return bar && bar !== ownerBar && bar.strumOverride === id;
        });
    }

    function allocateBarStrumPatternId(project, bar) {
        var base = buildManagedBarStrumId(bar.barNumber);
        var id = base;
        var index = 2;
        while (findStrumPattern(project, id) && isStrumPatternReferencedByOtherBar(project, id, bar)) {
            id = base + '_' + index;
            index++;
        }
        return id;
    }

    function cleanupUnusedBarStrumPatterns(project) {
        if (!Array.isArray(project.strumPatterns)) return;
        project.strumPatterns = project.strumPatterns.filter(function (pat) {
            if (!pat || !isManagedBarStrumId(pat.id)) return true;
            return isStrumPatternReferenced(project, pat.id);
        });
    }

    function buildStrumSlotsFromText(project, text) {
        var parsed = theory.parseStrumString(text);
        var warnings = parsed.warnings.slice();
        var barTicks = getBarLengthTicks(project);
        var slotTicks = (parsed.tokens.length <= barTicks / 240) ? 240 : 120;
        var slots = [];
        var cursor = 0;
        var lastStroke = null;
        var overflow = false;
        var orphanExtend = false;

        parsed.tokens.forEach(function (token) {
            if (cursor >= barTicks) { overflow = true; return; }
            if (token.type === 'rest') {
                lastStroke = null;
                cursor += slotTicks;
                return;
            }
            if (token.type === 'extend') {
                if (lastStroke) {
                    lastStroke.durationTicks = Math.min(
                        barTicks - lastStroke.tick,
                        (lastStroke.durationTicks || slotTicks) + slotTicks);
                } else {
                    orphanExtend = true;
                }
                cursor += slotTicks;
                return;
            }
            var ev = { tick: cursor, durationTicks: slotTicks, action: token.action, accent: false };
            slots.push(ev);
            lastStroke = ev;
            cursor += slotTicks;
        });

        if (overflow) warnings.push('1小節に収まらない分は省略しました');
        if (orphanExtend) warnings.push('直前にストロークがない伸ばし記号（〜）は無視しました');

        return {
            tokens: parsed.tokens,
            slots: slots,
            warnings: warnings,
            barTicks: barTicks,
            beats: getBeats(project)
        };
    }

    /**
     * 基本ストロークを記号テキストで設定する。
     * 配置規則: 記号数（1記号=1マス）が8分で収まれば8分（240tick）、超えれば16分（120tick）。
     * 〜は直前のストロークの durationTicks を1マス延長。・はマスを空ける。
     * 空欄なら専用パターンを外して既定プリセットへ戻す（紙面のストローク段は消える）。
     * @returns {{warnings: string[]}}
     */
    function setBasicStrumText(project, text) {
        var built = buildStrumSlotsFromText(project, text);
        var warnings = built.warnings.slice();
        var barTicks = built.barTicks;

        if (!Array.isArray(project.strumPatterns)) project.strumPatterns = [];

        if (built.tokens.length === 0) {
            project.strumPatterns = project.strumPatterns.filter(function (pat) {
                return pat && pat.id !== CUSTOM_BASIC_STRUM_ID;
            });
            if (project.strumPatterns.length === 0) {
                project.strumPatterns.push(createDefaultStrumPattern());
            }
            if (project.basicStrumPatternId === CUSTOM_BASIC_STRUM_ID) {
                project.basicStrumPatternId = project.strumPatterns[0].id;
            }
            return { warnings: warnings };
        }

        var pattern = findStrumPattern(project, CUSTOM_BASIC_STRUM_ID);
        if (!pattern) {
            pattern = { id: CUSTOM_BASIC_STRUM_ID, name: '', lengthTicks: barTicks, slots: [] };
            project.strumPatterns.push(pattern);
        }
        pattern.lengthTicks = barTicks;
        pattern.slots = built.slots;
        // パターン名 = 正規化した記号列（紙面ヘッダーの「基本ストローク:」表示に使われる）
        pattern.name = theory.strumSlotsToString(built.slots, barTicks, built.beats);
        project.basicStrumPatternId = CUSTOM_BASIC_STRUM_ID;
        return { warnings: warnings };
    }

    /**
     * 基本ストロークを記号テキストとして返す（slotsから再生成。入力欄の初期値用）。
     * ユーザー入力のカスタムパターンが有効なときだけ返す（プリセットは''）。
     */
    function getBasicStrumText(project) {
        var slots = getBasicStrumSlots(project);
        if (!slots) return '';
        return theory.strumSlotsToString(slots, getBarLengthTicks(project), getBeats(project));
    }

    /**
     * 紙面のストローク段に表示すべきslot列を返す。
     * ユーザーが入力したカスタム基本ストロークが有効なときだけ配列を返し、
     * それ以外は null（プリセットを勝手に紙面へ印字しない: ADR-018）。
     */
    function getBasicStrumSlots(project) {
        if (!project || project.basicStrumPatternId !== CUSTOM_BASIC_STRUM_ID) return null;
        var pattern = findStrumPattern(project, CUSTOM_BASIC_STRUM_ID);
        if (!pattern || !Array.isArray(pattern.slots) || pattern.slots.length === 0) return null;
        return pattern.slots;
    }

    function getBarStrumOverrideText(project, barNumber) {
        var bar = findBar(project, barNumber);
        if (!bar || !bar.strumOverride) return '';
        var pattern = findStrumPattern(project, bar.strumOverride);
        if (!pattern || !Array.isArray(pattern.slots) || pattern.slots.length === 0) return '';
        return theory.strumSlotsToString(pattern.slots, getBarLengthTicks(project), getBeats(project));
    }

    function getBarEffectiveStrumSlots(project, barNumber) {
        var bar = findBar(project, barNumber);
        if (!bar) return null;
        if (bar.strumOverride) {
            var pattern = findStrumPattern(project, bar.strumOverride);
            if (pattern && Array.isArray(pattern.slots) && pattern.slots.length > 0) {
                return pattern.slots;
            }
        }
        return getBasicStrumSlots(project);
    }

    /**
     * 小節のストロークを slots 配列で直接設定する（D3aのセル編集が使う低レベルAPI）。
     * 小節専用パターンID管理（allocate/衝突回避/未参照掃除）はここに共通化してあり、
     * setBarStrumText() もこの関数の上に薄いパーサとして乗る。
     * slots が空配列なら override を外し、基本ストロークへ継承を戻す。
     * @param {Array<{tick:number, action:string, accent?:boolean, durationTicks?:number}>} slots
     * @returns {{inherited: boolean, patternId: string|null}}
     */
    function setBarStrumSlots(project, barNumber, slots) {
        var bar = findBar(project, barNumber);
        if (!bar) return { inherited: true, patternId: null };
        if (!Array.isArray(project.strumPatterns)) project.strumPatterns = [];

        var previousId = bar.strumOverride;
        var barTicks = getBarLengthTicks(project);
        var beats = getBeats(project);
        var cleanSlots = Array.isArray(slots) ? slots.filter(Boolean) : [];

        if (cleanSlots.length === 0) {
            bar.strumOverride = null;
            if (isManagedBarStrumId(previousId) && !isStrumPatternReferenced(project, previousId)) {
                removeStrumPatternById(project, previousId);
            }
            cleanupUnusedBarStrumPatterns(project);
            return { inherited: true, patternId: null };
        }

        var patternId = isManagedBarStrumId(previousId) ? previousId : allocateBarStrumPatternId(project, bar);
        var pattern = findStrumPattern(project, patternId);
        if (!pattern) {
            pattern = { id: patternId, name: '', lengthTicks: barTicks, slots: [] };
            project.strumPatterns.push(pattern);
        }
        pattern.lengthTicks = barTicks;
        pattern.slots = cleanSlots;
        pattern.name = theory.strumSlotsToString(cleanSlots, barTicks, beats) || ('bar ' + bar.barNumber);
        bar.strumOverride = patternId;

        if (previousId && previousId !== patternId &&
            isManagedBarStrumId(previousId) && !isStrumPatternReferenced(project, previousId)) {
            removeStrumPatternById(project, previousId);
        }
        cleanupUnusedBarStrumPatterns(project);
        return { inherited: false, patternId: patternId };
    }

    /**
     * 基本ストロークを記号テキストで設定する（既存のR1入力欄用）。
     * 文字列パース → slots生成 → setBarStrumSlots() の順に処理を委譲する。
     * @returns {{warnings: string[]}}
     */
    function setBarStrumText(project, barNumber, text) {
        var bar = findBar(project, barNumber);
        if (!bar) return { warnings: [], inherited: true, patternId: null };
        var built = buildStrumSlotsFromText(project, text);
        var res = setBarStrumSlots(project, barNumber, built.slots);
        return { warnings: built.warnings, inherited: res.inherited, patternId: res.patternId };
    }

    /**
     * 空のプロジェクトを生成する。
     * 初期セクションはイントロ/Aメロ/Bメロ/サビ（ユーザーが自由に変更できる）。
     */
    function createEmptyProject() {
        var defaults = [
            { name: 'イントロ', barCount: 4 },
            { name: 'Aメロ', barCount: 8 },
            { name: 'Bメロ', barCount: 8 },
            { name: 'サビ', barCount: 8 }
        ];
        var sections = [];
        var bars = [];
        var barNumber = 1;
        defaults.forEach(function (def) {
            var id = generateSectionId();
            sections.push({ id: id, name: def.name, lyricsHidden: false });
            for (var i = 0; i < def.barCount; i++) {
                bars.push(createEmptyBar(barNumber++, id));
            }
        });
        return {
            schemaVersion: SCHEMA_VERSION,
            appVersion: APP_VERSION,
            projectId: generateProjectId(),
            createdAt: nowIso(),
            updatedAt: nowIso(),
            songInfo: {
                title: '無題のプロジェクト',
                artist: '',
                originalKey: 'C',
                playKey: 'C',
                capo: 0,
                bpm: 100,
                timeSignature: { beats: 4, beatUnit: 4 },
                ticksPerBeat: TICKS_PER_BEAT
            },
            sections: sections,
            bars: bars,
            strumPatterns: [createDefaultStrumPattern()],
            basicStrumPatternId: 'strum_8beat_a',
            sheetSettings: getDefaultSheetSettings(),
            arrangement: getDefaultArrangementSettings()
        };
    }

    /**
     * 架空のサンプル曲を生成する。
     * 歌詞・メロディはこのアプリのために書き下ろした短い仮のもので、
     * 既存楽曲に由来しない（docs/DECISIONS.md ADR-006）。
     */
    function createSampleProject() {
        var p = createEmptyProject();
        p.songInfo.title = 'サンプルソング';
        p.songInfo.artist = 'Cruise Studio';
        p.songInfo.originalKey = 'C';
        p.songInfo.playKey = 'C';
        p.songInfo.capo = 0;
        p.songInfo.bpm = 100;

        p.sections = [
            { id: 'sec_a', name: 'Aメロ', lyricsHidden: false }
        ];

        // 4小節: C / G / Am / F。歌詞「かぜをうけて ふねがすすむ うみのむこう ひかるほうへ」
        var chordPlan = ['C', 'G', 'Am', 'F'];
        var lyricPlan = [
            ['か', 'ぜ', 'を', 'う', 'け', 'て'],
            ['ふ', 'ね', 'が', 'す', 'す', 'む'],
            ['う', 'み', 'の', 'む', 'こ', 'う'],
            ['ひ', 'か', 'る', 'ほ', 'う', 'へ']
        ];
        // 階名メロディ（step: 0=ド..6=シ）。シンプルな書き下ろしフレーズ
        var melodyPlan = [
            [2, 2, 3, 4, 4, 2],   // ミ ミ ファ ソ ソ ミ
            [1, 1, 2, 4, 4, 1],   // レ レ ミ ソ ソ レ
            [5, 5, 4, 2, 2, 0],   // ラ ラ ソ ミ ミ ド
            [3, 3, 2, 1, 1, 0]    // ファ ファ ミ レ レ ド
        ];
        // 6音を 1・2・2.5・3・3.5・4拍目に置く（8分混じり）
        var tickSlots = [0, 480, 720, 960, 1200, 1440];

        p.bars = chordPlan.map(function (symbol, barIdx) {
            var bar = createEmptyBar(barIdx + 1, 'sec_a');
            bar.chords = [{ tick: 0, durationTicks: TICKS_PER_BEAT * 4, symbol: symbol }];
            bar.lyrics = lyricPlan[barIdx].map(function (text, i) {
                return { tick: tickSlots[i], text: text };
            });
            bar.melody = melodyPlan[barIdx].map(function (step, i) {
                var nextTick = (i + 1 < tickSlots.length) ? tickSlots[i + 1] : TICKS_PER_BEAT * 4;
                return {
                    tick: tickSlots[i],
                    durationTicks: nextTick - tickSlots[i],
                    step: step,
                    alter: 0,
                    octave: 0
                };
            });
            bar.lineBreakAfter = (barIdx % 2 === 1); // 1行=2小節
            return bar;
        });

        p.updatedAt = nowIso();
        return p;
    }

    /**
     * プロジェクトを検証する。
     * @returns {{ok: boolean, errors: string[], warnings: string[]}}
     * errors: 保存・利用に支障がある問題 / warnings: 動くが確認すべき問題
     */
    function validateProject(project) {
        var errors = [];
        var warnings = [];

        function err(msg) { errors.push(msg); }
        function warn(msg) { warnings.push(msg); }

        if (!project || typeof project !== 'object') {
            return { ok: false, errors: ['プロジェクトがオブジェクトではありません'], warnings: [] };
        }
        if (project.schemaVersion !== SCHEMA_VERSION) {
            err('schemaVersion が ' + SCHEMA_VERSION + ' ではありません: ' + project.schemaVersion);
        }
        if (typeof project.projectId !== 'string' || !project.projectId) {
            err('projectId がありません');
        }

        var si = project.songInfo;
        if (!si || typeof si !== 'object') {
            err('songInfo がありません');
        } else {
            if (typeof si.title !== 'string') err('songInfo.title が文字列ではありません');
            if (theory) {
                if (theory.keyToSemitone(si.originalKey) === null) err('originalKey が不正です: ' + si.originalKey);
                if (theory.keyToSemitone(si.playKey) === null) err('playKey が不正です: ' + si.playKey);
            }
            if (typeof si.capo !== 'number' || si.capo < 0 || si.capo > 11) {
                err('capo は 0〜11 の数値にしてください: ' + si.capo);
            }
            if (typeof si.bpm !== 'number' || si.bpm < 20 || si.bpm > 400) {
                err('bpm は 20〜400 の数値にしてください: ' + si.bpm);
            }
            if (!si.timeSignature || typeof si.timeSignature.beats !== 'number' ||
                typeof si.timeSignature.beatUnit !== 'number') {
                err('timeSignature が不正です');
            }
            if (si.ticksPerBeat !== TICKS_PER_BEAT) {
                err('ticksPerBeat は ' + TICKS_PER_BEAT + ' 固定です: ' + si.ticksPerBeat);
            }
            if (theory && theory.keyToSemitone(si.originalKey) !== null &&
                theory.keyToSemitone(si.playKey) !== null &&
                typeof si.capo === 'number' &&
                !theory.isKeyRelationConsistent(si.playKey, si.capo, si.originalKey)) {
                warn('playKey + capo が originalKey と一致しません（' +
                    si.playKey + ' + capo' + si.capo + ' ≠ ' + si.originalKey + '）');
            }
        }

        if (!Array.isArray(project.sections) || project.sections.length === 0) {
            err('sections が空です');
        } else {
            var sectionIds = {};
            project.sections.forEach(function (sec, i) {
                if (!sec || typeof sec.id !== 'string' || !sec.id) {
                    err('sections[' + i + '].id がありません');
                } else if (sectionIds[sec.id]) {
                    err('セクションIDが重複しています: ' + sec.id);
                } else {
                    sectionIds[sec.id] = true;
                }
            });
        }

        var barTicks = (si && si.timeSignature && typeof si.timeSignature.beats === 'number')
            ? si.timeSignature.beats * TICKS_PER_BEAT
            : null;

        if (!Array.isArray(project.bars)) {
            err('bars が配列ではありません');
        } else {
            var knownSections = {};
            (project.sections || []).forEach(function (sec) {
                if (sec && sec.id) knownSections[sec.id] = true;
            });
            project.bars.forEach(function (bar, i) {
                var label = 'bars[' + i + ']';
                if (!bar || typeof bar !== 'object') { err(label + ' が不正です'); return; }
                if (bar.barNumber !== i + 1) {
                    warn(label + '.barNumber が連番ではありません: ' + bar.barNumber);
                }
                if (!knownSections[bar.sectionId]) {
                    err(label + '.sectionId が sections に存在しません: ' + bar.sectionId);
                }
                if (!(bar.strumOverride === null || typeof bar.strumOverride === 'string')) {
                    err(label + '.strumOverride は null または文字列にしてください');
                }
                ['chords', 'lyrics', 'melody'].forEach(function (kind) {
                    if (!Array.isArray(bar[kind])) {
                        err(label + '.' + kind + ' が配列ではありません');
                        return;
                    }
                    bar[kind].forEach(function (ev, j) {
                        var evLabel = label + '.' + kind + '[' + j + ']';
                        if (!ev || typeof ev.tick !== 'number' || ev.tick < 0) {
                            err(evLabel + '.tick が不正です');
                        } else if (barTicks !== null && ev.tick >= barTicks) {
                            err(evLabel + '.tick が小節長を超えています: ' + ev.tick);
                        }
                        if (kind === 'chords') {
                            if (theory && theory.parseBasicChordSymbol(ev.symbol) === null) {
                                warn(evLabel + ' のコード記号を解釈できません: ' + ev.symbol);
                            }
                        }
                        if (kind === 'lyrics' && typeof ev.text !== 'string') {
                            err(evLabel + '.text が文字列ではありません');
                        }
                        if (kind === 'melody') {
                            if (typeof ev.step !== 'number' || ev.step < 0 || ev.step > 6) {
                                err(evLabel + '.step は 0〜6 にしてください');
                            }
                            if (typeof ev.durationTicks !== 'number' || ev.durationTicks <= 0) {
                                err(evLabel + '.durationTicks が不正です');
                            }
                        }
                    });
                });
            });
        }

        var patternIds = {};
        if (!Array.isArray(project.strumPatterns)) {
            err('strumPatterns が配列ではありません');
        } else {
            project.strumPatterns.forEach(function (pat, i) {
                if (!pat || typeof pat.id !== 'string' || !pat.id) {
                    err('strumPatterns[' + i + '].id がありません');
                } else {
                    patternIds[pat.id] = true;
                }
            });
        }
        if (typeof project.basicStrumPatternId !== 'string' || !patternIds[project.basicStrumPatternId]) {
            err('basicStrumPatternId が strumPatterns に存在しません: ' + project.basicStrumPatternId);
        }
        if (Array.isArray(project.bars)) {
            project.bars.forEach(function (bar, i) {
                if (bar && bar.strumOverride && !patternIds[bar.strumOverride]) {
                    err('bars[' + i + '].strumOverride が strumPatterns に存在しません: ' + bar.strumOverride);
                }
            });
        }

        if (!project.sheetSettings || typeof project.sheetSettings !== 'object') {
            err('sheetSettings がありません');
        }
        if (!project.arrangement || typeof project.arrangement !== 'object') {
            err('arrangement がありません');
        }
        // proSettings は曲データに入れない方針（ADR-003）
        if ('proSettings' in project) {
            warn('proSettings は曲データに入れない方針です（cruiseStudio.appSettings 側で管理）');
        }

        return { ok: errors.length === 0, errors: errors, warnings: warnings };
    }

    /**
     * 旧スキーマのプロジェクトを現行スキーマへ変換する。
     * schemaVersion 1 が初版なので、現時点では補完のみ。
     * スキーマを上げるときは v(n)→v(n+1) の変換をここに追記し、既存の変換は消さない。
     * @returns {{ok: boolean, project: object|null, error: string|null}}
     */
    function migrateProject(project) {
        if (!project || typeof project !== 'object') {
            return { ok: false, project: null, error: 'プロジェクトがオブジェクトではありません' };
        }
        var v = project.schemaVersion;
        if (typeof v !== 'number') {
            return { ok: false, project: null, error: 'schemaVersion がありません' };
        }
        if (v > SCHEMA_VERSION) {
            return {
                ok: false, project: null,
                error: 'このデータは新しいスキーマ（v' + v + '）です。最新のクルーズスタジオで開いてください'
            };
        }
        var migrated = JSON.parse(JSON.stringify(project));

        // v1: 欠けているフィールドをデフォルト補完（前方互換のための安全網）
        if (!migrated.sheetSettings) migrated.sheetSettings = getDefaultSheetSettings();
        if (!migrated.arrangement) migrated.arrangement = getDefaultArrangementSettings();
        if (Array.isArray(migrated.bars)) {
            migrated.bars.forEach(function (bar) {
                if (bar && typeof bar.strumOverride === 'undefined') bar.strumOverride = null;
            });
        }

        // TODO(将来): if (migrated.schemaVersion === 1) { ...v2への変換... ; migrated.schemaVersion = 2; }

        migrated.schemaVersion = SCHEMA_VERSION;
        migrated.appVersion = APP_VERSION;
        return { ok: true, project: migrated, error: null };
    }

    window.CruiseStudio = window.CruiseStudio || {};
    window.CruiseStudio.model = {
        APP_VERSION: APP_VERSION,
        SCHEMA_VERSION: SCHEMA_VERSION,
        TICKS_PER_BEAT: TICKS_PER_BEAT,
        createEmptyProject: createEmptyProject,
        createSampleProject: createSampleProject,
        createEmptyBar: createEmptyBar,
        getBarLengthTicks: getBarLengthTicks,
        normalizeBarOrder: normalizeBarOrder,
        getSectionBars: getSectionBars,
        getSectionBarCount: getSectionBarCount,
        setSectionBarCount: setSectionBarCount,
        addSection: addSection,
        removeSection: removeSection,
        renameSection: renameSection,
        setBarChord: setBarChord,
        getBarLyricsText: getBarLyricsText,
        setBarLyricsText: setBarLyricsText,
        setBarLyricSlot: setBarLyricSlot,
        getBarLyricSlots: getBarLyricSlots,
        getBarLyricSlotRanges: getBarLyricSlotRanges,
        barNeedsSixteenthResolution: barNeedsSixteenthResolution,
        getBarDoremiText: getBarDoremiText,
        setBarDoremiText: setBarDoremiText,
        CUSTOM_BASIC_STRUM_ID: CUSTOM_BASIC_STRUM_ID,
        setBasicStrumText: setBasicStrumText,
        getBasicStrumText: getBasicStrumText,
        getBasicStrumSlots: getBasicStrumSlots,
        getBarStrumOverrideText: getBarStrumOverrideText,
        getBarEffectiveStrumSlots: getBarEffectiveStrumSlots,
        setBarStrumSlots: setBarStrumSlots,
        setBarStrumText: setBarStrumText,
        validateProject: validateProject,
        migrateProject: migrateProject,
        getDefaultSheetSettings: getDefaultSheetSettings,
        getDefaultArrangementSettings: getDefaultArrangementSettings
    };
})();
