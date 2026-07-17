(function () {
    'use strict';

    /* CAGEDフォーム辞書（移動可能フォーム）。
       各スロットは { s: 弦番号(1-6), o: ルートフレットからのオフセット, iv: コードルートからの度数(半音) }。
       fingers はバレーポジション基準の標準運指（1=人 2=中 3=薬 4=小 / 'T'=親）。
       openFingers は開放ポジション（rootFret === 0）専用の運指。開放コードでは
       バレー基準の運指が一般的な形と異なるため、こちらを優先適用する。
       開放弦（実フレット0）は描画時に運指なし扱いにする。
       fingeringWarning はコード構成音として正しい一方、既存の実用運指へ同時に
       組み込めない音を示す。finger とは分離してフォーム利用側へ複製する。
       playability は standard / advanced / limited。warning はフォーム選択時だけ表示する。 */

    var SHAPE_ORDER = ['C', 'A', 'G', 'E', 'D'];
    // 型として鳴らさない低音弦。品質ごとの辞書値とは分離し、全品質で一貫させる。
    // 実際にその弦を使う特殊ボイシングが将来追加された場合は、notes 側を優先する。
    var SHAPE_DEFAULT_MUTED_STRINGS = {
        C: [6],
        A: [6],
        G: [],
        E: [],
        D: [6, 5]
    };

    var FORMS = {
        E: {
            rootString: 6,
            qualities: {
                maj: {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: 2, iv: 7 }, { s: 4, o: 2, iv: 0 }, { s: 3, o: 1, iv: 4 }, { s: 2, o: 0, iv: 7 }, { s: 1, o: 0, iv: 0 }],
                    muted: [],
                    fingers: { 6: 1, 5: 3, 4: 4, 3: 2, 2: 1, 1: 1 },
                    openFingers: { 5: 2, 4: 3, 3: 1 }
                },
                m: {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: 2, iv: 7 }, { s: 4, o: 2, iv: 0 }, { s: 3, o: 0, iv: 3 }, { s: 2, o: 0, iv: 7 }, { s: 1, o: 0, iv: 0 }],
                    muted: [],
                    fingers: { 6: 1, 5: 3, 4: 4, 3: 1, 2: 1, 1: 1 },
                    openFingers: { 5: 2, 4: 3 }
                },
                '7': {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: 2, iv: 7 }, { s: 4, o: 0, iv: 10 }, { s: 3, o: 1, iv: 4 }, { s: 2, o: 0, iv: 7 }, { s: 1, o: 0, iv: 0 }],
                    muted: [],
                    fingers: { 6: 1, 5: 3, 4: 1, 3: 2, 2: 1, 1: 1 },
                    openFingers: { 5: 2, 3: 1 }
                },
                maj7: {
                    /* 中指が4-3弦をミニバレーする形（バレー表示で視認できる） */
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: 2, iv: 7 }, { s: 4, o: 1, iv: 11 }, { s: 3, o: 1, iv: 4 }, { s: 2, o: 0, iv: 7 }, { s: 1, o: 0, iv: 0 }],
                    muted: [],
                    fingers: { 6: 1, 5: 3, 4: 2, 3: 2, 2: 1, 1: 1 },
                    openFingers: { 5: 2, 4: 1, 3: 1 }
                },
                m7: {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: 2, iv: 7 }, { s: 4, o: 0, iv: 10 }, { s: 3, o: 0, iv: 3 }, { s: 2, o: 0, iv: 7 }, { s: 1, o: 0, iv: 0 }],
                    muted: [],
                    fingers: { 6: 1, 5: 3, 4: 1, 3: 1, 2: 1, 1: 1 },
                    openFingers: { 5: 2 }
                },
                m7b5: {
                    /* E型7thテンプレートをm7♭5へ変換し、従来の実用4音へ全弦を補う */
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: 1, iv: 6, fingeringWarning: true }, { s: 4, o: 0, iv: 10 }, { s: 3, o: 0, iv: 3 }, { s: 2, o: -1, iv: 6 }, { s: 1, o: 0, iv: 0, fingeringWarning: true }],
                    muted: [],
                    fingers: { 6: 2, 4: 3, 3: 4, 2: 1 },
                    warningStrings: [5, 1],
                    playability: 'advanced',
                    warning: 'フォーム全体の構成音を表示しています。⚠️の音は一般的な運指では同時に押さえることが難しい位置です。保存前編集で指を指定するか、音を消去できます。'
                },
                dim: {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: 1, iv: 6 }, { s: 4, o: 2, iv: 0, fingeringWarning: true }, { s: 3, o: 0, iv: 3 }, { s: 2, o: -1, iv: 6, fingeringWarning: true }, { s: 1, o: 0, iv: 0, fingeringWarning: true }],
                    muted: [],
                    fingers: { 6: 1, 5: 2, 3: 3 },
                    warningStrings: [4, 2, 1],
                    openFingers: { 6: 1, 5: 2, 3: 3 },
                    playability: 'advanced',
                    warning: 'フォーム全体の構成音を表示しています。⚠️の音は一般的な運指では同時に押さえることが難しい位置です。保存前編集で指を指定するか、音を消去できます。'
                }
            }
        },
        A: {
            rootString: 5,
            qualities: {
                maj: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 2, iv: 7 }, { s: 3, o: 2, iv: 0 }, { s: 2, o: 2, iv: 4 }, { s: 1, o: 0, iv: 7 }],
                    muted: [6],
                    fingers: { 5: 1, 4: 2, 3: 3, 2: 4, 1: 1 },
                    openFingers: { 4: 1, 3: 2, 2: 3 }
                },
                m: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 2, iv: 7 }, { s: 3, o: 2, iv: 0 }, { s: 2, o: 1, iv: 3 }, { s: 1, o: 0, iv: 7 }],
                    muted: [6],
                    fingers: { 5: 1, 4: 3, 3: 4, 2: 2, 1: 1 },
                    openFingers: { 4: 2, 3: 3, 2: 1 }
                },
                '7': {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 2, iv: 7 }, { s: 3, o: 0, iv: 10 }, { s: 2, o: 2, iv: 4 }, { s: 1, o: 0, iv: 7 }],
                    muted: [6],
                    fingers: { 5: 1, 4: 3, 3: 1, 2: 4, 1: 1 },
                    openFingers: { 4: 2, 2: 3 }
                },
                maj7: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 2, iv: 7 }, { s: 3, o: 1, iv: 11 }, { s: 2, o: 2, iv: 4 }, { s: 1, o: 0, iv: 7 }],
                    muted: [6],
                    fingers: { 5: 1, 4: 3, 3: 2, 2: 4, 1: 1 },
                    openFingers: { 4: 2, 3: 1, 2: 3 }
                },
                m7: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 2, iv: 7 }, { s: 3, o: 0, iv: 10 }, { s: 2, o: 1, iv: 3 }, { s: 1, o: 0, iv: 7 }],
                    muted: [6],
                    fingers: { 5: 1, 4: 3, 3: 1, 2: 2, 1: 1 },
                    openFingers: { 4: 2, 2: 1 }
                },
                m7b5: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 1, iv: 6 }, { s: 3, o: 0, iv: 10 }, { s: 2, o: 1, iv: 3 }, { s: 1, o: -1, iv: 6, fingeringWarning: true }],
                    muted: [6],
                    fingers: { 5: 1, 4: 3, 3: 2, 2: 4 },
                    warningStrings: [1],
                    openFingers: { 5: 1, 4: 3, 3: 1, 2: 4 },
                    playability: 'advanced',
                    warning: 'フォーム全体の構成音を表示しています。⚠️の音は一般的な運指では同時に押さえることが難しい位置です。保存前編集で指を指定するか、音を消去できます。'
                },
                dim: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: 1, iv: 6 }, { s: 3, o: 2, iv: 0 }, { s: 2, o: 1, iv: 3 }, { s: 1, o: -1, iv: 6, fingeringWarning: true }],
                    muted: [6],
                    fingers: { 5: 1, 4: 2, 3: 4, 2: 3 },
                    warningStrings: [1],
                    openFingers: { 5: 1, 4: 2, 3: 4, 2: 3 },
                    playability: 'advanced',
                    warning: 'フォーム全体の構成音を表示しています。⚠️の音は一般的な運指では同時に押さえることが難しい位置です。保存前編集で指を指定するか、音を消去できます。'
                }
            }
        },
        G: {
            rootString: 6,
            qualities: {
                maj: {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: -1, iv: 4 }, { s: 4, o: -3, iv: 7 }, { s: 3, o: -3, iv: 0 }, { s: 2, o: -3, iv: 4 }, { s: 1, o: 0, iv: 0 }],
                    muted: [],
                    fingers: { 6: 3, 5: 2, 4: 1, 3: 1, 2: 1, 1: 4 }
                },
                maj7: {
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: -1, iv: 4 }, { s: 4, o: -3, iv: 7 }, { s: 3, o: -3, iv: 0 }, { s: 2, o: -3, iv: 4 }, { s: 1, o: -1, iv: 11 }],
                    muted: [],
                    fingers: { 6: 3, 5: 2, 4: 1, 3: 1, 2: 1, 1: 4 },
                    openFingers: { 6: 3, 5: 2, 1: 1 }
                },
                '7': {
                    /* 1弦は小指。人差し指は4〜2弦のミニバレー（例: A7 = 5-4-2-2-2-3） */
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: -1, iv: 4 }, { s: 4, o: -3, iv: 7 }, { s: 3, o: -3, iv: 0 }, { s: 2, o: -3, iv: 4 }, { s: 1, o: -2, iv: 10 }],
                    muted: [],
                    fingers: { 6: 3, 5: 2, 4: 1, 3: 1, 2: 1, 1: 4 },
                    openFingers: { 6: 3, 5: 2, 1: 1 }
                },
                m: {
                    /* 低音4弦を推奨運指とし、高音側もG型の構成音として表示（例: Cm = 8-6-5-5-4-8） */
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: -2, iv: 3 }, { s: 4, o: -3, iv: 7 }, { s: 3, o: -3, iv: 0 }, { s: 2, o: -4, iv: 3, fingeringWarning: true }, { s: 1, o: 0, iv: 0, fingeringWarning: true }],
                    muted: [],
                    fingers: { 6: 4, 5: 2, 4: 1, 3: 1 },
                    warningStrings: [2, 1],
                    openFingers: { 6: 4, 5: 2, 4: 1, 3: 1 },
                    playability: 'advanced',
                    warning: 'フォーム全体の構成音を表示しています。⚠️の音は一般的な運指では同時に押さえることが難しい位置です。保存前編集で指を指定するか、音を消去できます。'
                },
                m7: {
                    /* G型7の弦役割を維持し、3・5・1・♭3・♭7へ置換（例: Dm7 = 10-8-7-7-6-8） */
                    slots: [{ s: 6, o: 0, iv: 0 }, { s: 5, o: -2, iv: 3 }, { s: 4, o: -3, iv: 7 }, { s: 3, o: -3, iv: 0 }, { s: 2, o: -4, iv: 3, fingeringWarning: true }, { s: 1, o: -2, iv: 10, fingeringWarning: true }],
                    muted: [],
                    fingers: { 6: 4, 5: 2, 4: 1, 3: 1 },
                    warningStrings: [2, 1],
                    openFingers: { 6: 4, 5: 2, 4: 1, 3: 1 },
                    playability: 'advanced',
                    warning: 'フォーム全体の構成音を表示しています。⚠️の音は一般的な運指では同時に押さえることが難しい位置です。保存前編集で指を指定するか、音を消去できます。'
                },
                m7b5: {
                    /* G型7の5度位置を♭5へ置換した完全形（例: Dm7♭5 = 10-8-6-7-6-8） */
                    slots: [{ s: 6, o: 0, iv: 0, fingeringWarning: true }, { s: 5, o: -2, iv: 3, fingeringWarning: true }, { s: 4, o: -4, iv: 6 }, { s: 3, o: -3, iv: 0 }, { s: 2, o: -4, iv: 3 }, { s: 1, o: -2, iv: 10 }],
                    muted: [],
                    fingers: { 4: 1, 3: 2, 2: 1, 1: 4 },
                    warningStrings: [6, 5],
                    playability: 'advanced',
                    warning: 'フォーム全体の構成音を表示しています。⚠️の音は一般的な運指では同時に押さえることが難しい位置です。保存前編集で指を指定するか、音を消去できます。'
                },
                dim: {
                    /* 最低ルートから小・中・人で押さえ、高音3弦を警告にする（例: Ddim = 10-8-6-7-6-10） */
                    slots: [{ s: 6, o: 0, iv: 0, fingeringWarning: true }, { s: 5, o: -2, iv: 3, fingeringWarning: true }, { s: 4, o: -4, iv: 6 }, { s: 3, o: -3, iv: 0 }, { s: 2, o: -4, iv: 3 }, { s: 1, o: 0, iv: 0 }],
                    muted: [],
                    fingers: { 6: 4, 5: 2, 4: 1 },
                    warningStrings: [3, 2, 1],
                    playability: 'advanced',
                    warning: 'フォーム全体の構成音を表示しています。⚠️の音は一般的な運指では同時に押さえることが難しい位置です。保存前編集で指を指定するか、音を消去できます。'
                }
            }
        },
        C: {
            rootString: 5,
            qualities: {
                maj: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: -1, iv: 4 }, { s: 3, o: -3, iv: 7 }, { s: 2, o: -2, iv: 0 }, { s: 1, o: -3, iv: 4 }],
                    muted: [6],
                    fingers: { 5: 4, 4: 3, 3: 1, 2: 2, 1: 1 },
                    openFingers: { 5: 3, 4: 2, 2: 1 }
                },
                maj7: {
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: -1, iv: 4 }, { s: 3, o: -3, iv: 7 }, { s: 2, o: -3, iv: 11 }, { s: 1, o: -3, iv: 4 }],
                    muted: [6],
                    fingers: { 5: 3, 4: 2, 3: 1, 2: 1, 1: 1 },
                    openFingers: { 5: 3, 4: 2 }
                },
                '7': {
                    /* 既存4音へ完全5度を補ったC型7thテンプレート（例: D7 = x-5-4-5-3-5） */
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: -1, iv: 4 }, { s: 3, o: 0, iv: 10 }, { s: 2, o: -2, iv: 0 }, { s: 1, o: 0, iv: 7, fingeringWarning: true }],
                    muted: [6],
                    fingers: { 5: 3, 4: 2, 3: 4, 2: 1 },
                    playability: 'limited',
                    warningMode: 'fingering',
                    warning: 'フォーム全体の構成音を表示しています。⚠️の音は一般的な運指では同時に押さえることが難しい位置です。保存前編集で指を指定するか、音を消去できます。'
                },
                m: {
                    /* C型メジャーの高音3度位置も♭3へ置換（例: Dm = x-5-3-2-3-1） */
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: -2, iv: 3 }, { s: 3, o: -3, iv: 7 }, { s: 2, o: -2, iv: 0, fingeringWarning: true }, { s: 1, o: -4, iv: 3, fingeringWarning: true }],
                    muted: [6],
                    fingers: { 5: 4, 4: 2, 3: 1 },
                    warningStrings: [2, 1],
                    openFingers: { 5: 4, 4: 2, 3: 1 },
                    playability: 'limited',
                    warning: 'フォーム全体の構成音を表示しています。⚠️の音は一般的な運指では同時に押さえることが難しい位置です。保存前編集で指を指定するか、音を消去できます。'
                },
                m7: {
                    /* C型7thテンプレートをm7へ変換（例: Dm7 = x-5-3-5-3-5） */
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: -2, iv: 3 }, { s: 3, o: 0, iv: 10 }, { s: 2, o: -2, iv: 0 }, { s: 1, o: 0, iv: 7, fingeringWarning: true }],
                    muted: [6],
                    fingers: { 5: 3, 4: 1, 3: 4, 2: 1 },
                    warningStrings: [1],
                    playability: 'limited',
                    warning: 'フォーム全体の構成音を表示しています。⚠️の音は一般的な運指では同時に押さえることが難しい位置です。保存前編集で指を指定するか、音を消去できます。'
                },
                m7b5: {
                    /* C型7thテンプレートをm7♭5へ変換（例: Dm7♭5 = x-5-3-5-3-4） */
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: -2, iv: 3 }, { s: 3, o: 0, iv: 10 }, { s: 2, o: -2, iv: 0 }, { s: 1, o: -1, iv: 6 }],
                    muted: [6],
                    fingers: { 5: 3, 4: 1, 3: 4, 2: 1, 1: 2 },
                    playability: 'advanced',
                    warning: 'ミニバレーを含む、押さえにくい上級者向けの形です。'
                },
                dim: {
                    /* C型メジャーの役割を1・♭3・♭5・1・♭3へ置換（例: Ddim = x-5-3-1-3-1） */
                    slots: [{ s: 5, o: 0, iv: 0 }, { s: 4, o: -2, iv: 3 }, { s: 3, o: -4, iv: 6 }, { s: 2, o: -2, iv: 0, fingeringWarning: true }, { s: 1, o: -4, iv: 3, fingeringWarning: true }],
                    muted: [6],
                    fingers: { 5: 4, 4: 2, 3: 1 },
                    warningStrings: [2, 1],
                    playability: 'advanced',
                    warning: 'フォーム全体の構成音を表示しています。⚠️の音は一般的な運指では同時に押さえることが難しい位置です。保存前編集で指を指定するか、音を消去できます。'
                }
            }
        },
        D: {
            rootString: 4,
            qualities: {
                maj: {
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 2, iv: 7 }, { s: 2, o: 3, iv: 0 }, { s: 1, o: 2, iv: 4 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 2, 2: 4, 1: 3 },
                    openFingers: { 3: 1, 2: 3, 1: 2 }
                },
                m: {
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 2, iv: 7 }, { s: 2, o: 3, iv: 0 }, { s: 1, o: 1, iv: 3 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 3, 2: 4, 1: 2 },
                    openFingers: { 3: 2, 2: 3, 1: 1 }
                },
                '7': {
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 2, iv: 7 }, { s: 2, o: 1, iv: 10 }, { s: 1, o: 2, iv: 4 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 3, 2: 2, 1: 4 },
                    openFingers: { 3: 2, 2: 1, 1: 3 }
                },
                maj7: {
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 2, iv: 7 }, { s: 2, o: 2, iv: 11 }, { s: 1, o: 2, iv: 4 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 2, 2: 3, 1: 4 },
                    openFingers: { 3: 1, 2: 1, 1: 1 }
                },
                m7: {
                    /* 人=4弦 / 薬=3弦 / 中=2-1弦ミニバレー（人差し指が最も低いフレット） */
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 2, iv: 7 }, { s: 2, o: 1, iv: 10 }, { s: 1, o: 1, iv: 3 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 3, 2: 2, 1: 2 },
                    openFingers: { 3: 2, 2: 1, 1: 1 }
                },
                m7b5: {
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 1, iv: 6 }, { s: 2, o: 1, iv: 10 }, { s: 1, o: 1, iv: 3 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 3, 2: 3, 1: 3 },
                    openFingers: { 3: 1, 2: 1, 1: 1 }
                },
                dim: {
                    slots: [{ s: 4, o: 0, iv: 0 }, { s: 3, o: 1, iv: 6 }, { s: 2, o: 3, iv: 0 }, { s: 1, o: 1, iv: 3 }],
                    muted: [6, 5],
                    fingers: { 4: 1, 3: 2, 2: 4, 1: 3 },
                    openFingers: { 3: 1, 2: 3, 1: 2 }
                }
            }
        }
    };

    /* 品質ごとに独立した音配置を持たせず、maj / 7 の弦役割を変換して生成する。
       o は基準intervalから目的intervalまでの半音差だけ移動するため、実音と
       intervalが常に一致する。運指と警告は品質定義側に残して音配置と分離する。 */
    var ROLE_TRANSFORMS = {
        m: { 0: 0, 4: 3, 7: 7 },
        dim: { 0: 0, 4: 3, 7: 6 },
        m7: { 0: 0, 4: 3, 7: 7, 10: 10 },
        m7b5: { 0: 0, 4: 3, 7: 6, 10: 10 }
    };

    function deriveSlots(templateSlots, transform, warningStrings) {
        var warned = warningStrings || [];
        return templateSlots.map(function (slot) {
            var targetInterval = transform[slot.iv];
            var next = {
                s: slot.s,
                o: slot.o + targetInterval - slot.iv,
                iv: targetInterval
            };
            if (warned.indexOf(slot.s) !== -1) next.fingeringWarning = true;
            return next;
        });
    }

    function applyRoleTemplates() {
        SHAPE_ORDER.forEach(function (shapeKey) {
            var qualities = FORMS[shapeKey].qualities;
            [['m', 'maj'], ['dim', 'maj'], ['m7', '7'], ['m7b5', '7']].forEach(function (pair) {
                var qualityKey = pair[0];
                var templateKey = pair[1];
                var def = qualities[qualityKey];
                var template = qualities[templateKey];
                def.slots = deriveSlots(template.slots, ROLE_TRANSFORMS[qualityKey], def.warningStrings);
                def.muted = template.muted.slice();
                if (def.warningStrings && def.warningStrings.length && def.warning) {
                    def.warningMode = 'fingering';
                }
            });
        });
    }

    applyRoleTemplates();

    /* 「定番フォーム」は、まず開放コード／標準ローコードとして広く定着している
       組み合わせを明示表で固定する。表に無いルート／品質は、実用的なE型→A型を
       優先し、両方が不適切なときだけ全型スコア比較へ進む。 */
    var COMMON_FORM_OVERRIDES = {
        maj: { 0: 'C', 2: 'D', 4: 'E', 5: 'E', 7: 'G', 9: 'A' },
        m: { 2: 'D', 4: 'E', 9: 'A' },
        '7': { 0: 'C', 2: 'D', 4: 'E', 7: 'G', 9: 'A' },
        maj7: { 0: 'C', 2: 'D', 4: 'E', 7: 'G', 9: 'A' },
        m7: { 2: 'D', 4: 'E', 9: 'A' }
    };

    // 「定番」とは断定しないが、運指上の実用性から優先したい既知ケース。
    // Bm♭5（内部qualityKeyはdim）はA型をおすすめとして案内する。
    var RECOMMENDED_FORM_OVERRIDES = {
        dim: { 11: 'A' }
    };

    function resolvedMutedStrings(shapeKey, formMutedStrings, allNotes) {
        var candidates = (SHAPE_DEFAULT_MUTED_STRINGS[shapeKey] || []).concat(formMutedStrings || []);
        var usedStrings = {};
        var seen = {};
        (allNotes || []).forEach(function (note) {
            usedStrings[note.string] = true;
        });
        return candidates.filter(function (stringNum) {
            if (stringNum < 1 || stringNum > 6 || seen[stringNum] || usedStrings[stringNum]) return false;
            seen[stringNum] = true;
            return true;
        }).sort(function (a, b) { return a - b; });
    }

    /**
     * 指定の型・品質・ルート音で実フォームを求める。
     * 全音が表示範囲に収まる配置を優先し、無い場合は最も多くの音を表示できる
     * 同型配置を選ぶ。範囲外の音は notes から除外し、フォーム自体は有効とする。
     * 表示範囲が0Fを含み、フォーム内の最低フレットが0Fになる場合だけ
     * openFingers を優先適用する。12F以降ではムーバブルフォーム用運指を使う。
     * @returns { available:true, shape, qualityKey, rootFret, notes:[{string,fret,interval,finger,fingeringWarning}],
     *            mutedStrings, fretRange:{min,max,includesOpen},
     *            displayRange:{actualNoteFrets,includesOpen,formStart,formEnd,viewportStart,viewportEnd} }
     *          または { available:false, reason:'quality'|'position' }
     */
    /**
     * 表示中の実音から、フォームとして扱う連続フレット範囲を求める。
     * 開放弦を含むフォームは、音のない中間フレットもフォーム内として
     * 0F から表示する。fretRange は保存データ互換のため実際の押弦範囲を
     * 保持し、この表示専用モデルとは分離する。
     */
    function getFormDisplayRange(notes, options) {
        var opts = options || {};
        var frets = [];
        var seen = {};
        (notes || []).forEach(function (note) {
            if (!note || typeof note.fret !== 'number' || note.fret < 0 || seen[note.fret]) return;
            seen[note.fret] = true;
            frets.push(note.fret);
        });
        frets.sort(function (a, b) { return a - b; });

        if (!frets.length) {
            return {
                actualNoteFrets: [],
                includesOpen: false,
                formStart: 0,
                formEnd: 0,
                viewportStart: 0,
                viewportEnd: 0,
                min: 0,
                max: 0
            };
        }

        var includesOpen = frets.indexOf(0) !== -1;
        var formStart = includesOpen ? 0 : frets[0];
        var formEnd = frets[frets.length - 1];
        var limit = typeof opts.maxFret === 'number' ? opts.maxFret : formEnd;
        var viewportStart = includesOpen ? 0 : formStart;
        var viewportEnd = includesOpen
            ? Math.min(limit, Math.max(formEnd + 1, 4))
            : formEnd;

        return {
            actualNoteFrets: frets,
            includesOpen: includesOpen,
            formStart: formStart,
            formEnd: formEnd,
            viewportStart: viewportStart,
            viewportEnd: viewportEnd,
            // rangeHighlight / 保存UIで既存の min/max 形式としても利用できるようにする。
            min: formStart,
            max: formEnd
        };
    }

    function getForm(shapeKey, qualityKey, rootPc, maxFret, minFret) {
        var shape = FORMS[shapeKey];
        var theory = window.ChordCruise.theory;
        if (!shape || !shape.qualities[qualityKey]) {
            return {
                available: false,
                reason: 'quality',
                message: shapeKey + '型では、この品質の実用フォームを登録していません。'
            };
        }
        var def = shape.qualities[qualityKey];
        var openPc = theory.OPEN_STRINGS[6 - shape.rootString];
        var limit = typeof maxFret === 'number' ? maxFret : 13;
        var lowerLimit = typeof minFret === 'number' ? minFret : 0;

        var minOffset = 0;
        var maxOffset = 0;
        def.slots.forEach(function (slot) {
            if (slot.o < minOffset) minOffset = slot.o;
            if (slot.o > maxOffset) maxOffset = slot.o;
        });

        var rootFret = null;
        var f;
        // 既存挙動を維持するため、まず全音が範囲内に収まる配置を探す。
        for (f = Math.max(0, lowerLimit - minOffset); f <= limit; f++) {
            if ((openPc + f) % 12 !== ((rootPc % 12) + 12) % 12) continue;
            if (f + minOffset < lowerLimit) continue;
            if (f + maxOffset > limit) continue;
            rootFret = f;
            break;
        }

        // 完全形が無いときは、範囲内に最も多くの音を残せる配置を採用する。
        // 同数ならルートが表示範囲内にある配置、さらに同条件なら低い配置を優先する。
        if (rootFret === null) {
            var bestCandidate = null;
            var firstCandidate = Math.max(0, lowerLimit - maxOffset);
            var lastCandidate = limit - minOffset;
            for (f = firstCandidate; f <= lastCandidate; f++) {
                if ((openPc + f) % 12 !== ((rootPc % 12) + 12) % 12) continue;
                var visibleCount = def.slots.reduce(function (count, slot) {
                    var slotFret = f + slot.o;
                    return count + (slotFret >= lowerLimit && slotFret <= limit ? 1 : 0);
                }, 0);
                if (visibleCount === 0) continue;
                var rootVisible = f >= lowerLimit && f <= limit;
                if (!bestCandidate ||
                        visibleCount > bestCandidate.visibleCount ||
                        (visibleCount === bestCandidate.visibleCount && rootVisible && !bestCandidate.rootVisible)) {
                    bestCandidate = { fret: f, visibleCount: visibleCount, rootVisible: rootVisible };
                }
            }
            if (bestCandidate) rootFret = bestCandidate.fret;
        }
        if (rootFret === null) {
            return { available: false, reason: 'position' };
        }

        // 開放ポジション（フォーム内の最低フレットが開放弦=0になる配置）では
        // 一般的な開放コード運指を優先する。E/A/D型は rootFret 0、C/G型は rootFret 3 が該当。
        var isOpenPosition = (lowerLimit === 0 && rootFret + minOffset === 0);
        var fingerSource = (isOpenPosition && def.openFingers) ? def.openFingers : def.fingers;

        var minFretUsed = null;
        var maxFretUsed = null;
        var includesOpen = false;
        var allNotes = def.slots.map(function (slot) {
            var fret = rootFret + slot.o;
            var finger = fret === 0 ? null : (fingerSource[slot.s] != null ? fingerSource[slot.s] : null);
            return {
                string: slot.s,
                fret: fret,
                interval: slot.iv,
                finger: finger,
                fingeringWarning: slot.fingeringWarning === true && finger === null && fret > 0
            };
        });
        var notes = allNotes.filter(function (note) {
            return note.fret >= lowerLimit && note.fret <= limit;
        });
        notes.forEach(function (note) {
            if (note.fret === 0) {
                includesOpen = true;
            } else {
                if (minFretUsed === null || note.fret < minFretUsed) minFretUsed = note.fret;
                if (maxFretUsed === null || note.fret > maxFretUsed) maxFretUsed = note.fret;
            }
        });

        var hasFingeringWarning = notes.some(function (note) {
            return note.fingeringWarning === true;
        });
        var warning = def.warning || '';
        if (def.warningMode === 'fingering' && !hasFingeringWarning) warning = '';
        var displayRange = getFormDisplayRange(notes, { maxFret: limit });

        return {
            available: true,
            shape: shapeKey,
            qualityKey: qualityKey,
            playability: def.playability || 'standard',
            warning: warning,
            rootFret: rootFret,
            usedOpenFingers: !!(isOpenPosition && def.openFingers),
            hasOutOfRangeNotes: notes.length !== allNotes.length,
            omittedNoteCount: allNotes.length - notes.length,
            notes: notes,
            // 表示範囲外で一時的に省略された音をミュート扱いにしないため、
            // visible notes ではなくフォーム全体の allNotes と照合する。
            mutedStrings: resolvedMutedStrings(shapeKey, def.muted, allNotes),
            fretRange: {
                min: minFretUsed === null ? 0 : minFretUsed,
                max: maxFretUsed === null ? 0 : maxFretUsed,
                includesOpen: includesOpen
            },
            displayRange: displayRange
        };
    }

    function scoreCommonCandidate(shapeKey, form) {
        var notes = form.notes || [];
        var fretted = notes.filter(function (note) { return note.fret > 0; });
        var minFret = fretted.length ? Math.min.apply(null, fretted.map(function (note) { return note.fret; })) : 0;
        var maxFret = fretted.length ? Math.max.apply(null, fretted.map(function (note) { return note.fret; })) : minFret;
        var warningCount = notes.filter(function (note) { return note.fingeringWarning === true; }).length;
        var lowestNote = notes.slice().sort(function (a, b) {
            return b.string - a.string || a.fret - b.fret;
        })[0];
        var bassRoot = !!lowestNote && lowestNote.interval === 0;
        var bassRootFretted = bassRoot && lowestNote.fret > 0 && lowestNote.finger != null;
        var playabilityPenalty = form.playability === 'limited' ? 36 : (form.playability === 'advanced' ? 14 : 0);
        var barreCount = detectBarres(notes).length;
        var score =
            (form.omittedNoteCount || 0) * 90 +
            warningCount * 24 +
            playabilityPenalty +
            minFret * 3 +
            Math.max(0, maxFret - minFret) * 5 +
            barreCount * 2 -
            notes.length * 2 -
            (bassRoot ? 10 : 0);
        return {
            score: score,
            minFret: minFret,
            span: Math.max(0, maxFret - minFret),
            warningCount: warningCount,
            omittedNoteCount: form.omittedNoteCount || 0,
            bassRoot: bassRoot,
            bassRootFretted: bassRootFretted,
            barreCount: barreCount,
            playability: form.playability || 'standard',
            visibleNoteCount: notes.length
        };
    }

    /* E/A型を優先できる最低限の安全条件。
       省略・⚠️・ストレッチ・最低ルートの運指を先に落とすため、単なる型の存在だけで
       不自然なフォームを選ばない。通常域では0〜5F、ハイフレットでは表示域の先頭から
       5F以内を「ローポジション側」とみなす。 */
    function isPracticalBarreCandidate(form, metrics, minFret, requireLowPosition) {
        var lowPositionLimit = (typeof minFret === 'number' ? minFret : 0) + 5;
        if (metrics.visibleNoteCount < 3 || metrics.omittedNoteCount >= 3) return false;
        if (metrics.warningCount * 2 > metrics.visibleNoteCount) return false;
        if (metrics.playability === 'limited' || metrics.span > 4) return false;
        if (!metrics.bassRootFretted) return false;
        if (requireLowPosition && metrics.minFret > lowPositionLimit) return false;
        return !!form;
    }

    /**
     * 表示中コードの定番／おすすめCAGEDフォームを1つ返す。
     * 明示表は source='common'。表外は実用的なローE型→A型を source='recommended'で
     * 優先し、両方不適切なときだけ純粋スコアのフォールバックを使う。
     * 表示可能音が3音未満、または省略が3音以上の候補しか無い場合は強調しない。
     */
    function getCommonForm(qualityKey, rootPc, maxFret, minFret) {
        if (typeof rootPc !== 'number' || !qualityKey) return null;
        var normalizedRoot = ((rootPc % 12) + 12) % 12;
        var candidates = SHAPE_ORDER.map(function (shapeKey) {
            var form = getForm(shapeKey, qualityKey, normalizedRoot, maxFret, minFret);
            if (!form.available || !form.notes || form.notes.length === 0) return null;
            return {
                shape: shapeKey,
                form: form,
                metrics: scoreCommonCandidate(shapeKey, form)
            };
        }).filter(Boolean);
        if (!candidates.length) return null;

        var overrideShape = COMMON_FORM_OVERRIDES[qualityKey] && COMMON_FORM_OVERRIDES[qualityKey][normalizedRoot];
        if (overrideShape) {
            var override = candidates.filter(function (candidate) { return candidate.shape === overrideShape; })[0];
            if (override) {
                return {
                    shape: override.shape,
                    source: 'common',
                    label: '一般的なフォーム',
                    metrics: override.metrics
                };
            }
        }

        var recommendedShape = RECOMMENDED_FORM_OVERRIDES[qualityKey] && RECOMMENDED_FORM_OVERRIDES[qualityKey][normalizedRoot];
        if (recommendedShape) {
            var recommendedOverride = candidates.filter(function (candidate) { return candidate.shape === recommendedShape; })[0];
            if (recommendedOverride && isPracticalBarreCandidate(recommendedOverride.form, recommendedOverride.metrics, minFret, false)) {
                return {
                    shape: recommendedOverride.shape,
                    source: 'recommended',
                    label: 'おすすめフォーム',
                    metrics: recommendedOverride.metrics
                };
            }
        }

        var eCandidate = candidates.filter(function (candidate) { return candidate.shape === 'E'; })[0];
        if (eCandidate && isPracticalBarreCandidate(eCandidate.form, eCandidate.metrics, minFret, true)) {
            return {
                shape: eCandidate.shape,
                source: 'recommended',
                label: 'おすすめフォーム',
                metrics: eCandidate.metrics
            };
        }

        var aCandidate = candidates.filter(function (candidate) { return candidate.shape === 'A'; })[0];
        if (aCandidate && isPracticalBarreCandidate(aCandidate.form, aCandidate.metrics, minFret, false)) {
            return {
                shape: aCandidate.shape,
                source: 'recommended',
                label: 'おすすめフォーム',
                metrics: aCandidate.metrics
            };
        }

        candidates.sort(function (a, b) {
            return a.metrics.score - b.metrics.score ||
                SHAPE_ORDER.indexOf(a.shape) - SHAPE_ORDER.indexOf(b.shape);
        });
        var best = candidates[0];
        if (best.metrics.visibleNoteCount < 3 || best.metrics.omittedNoteCount >= 3) return null;
        return {
            shape: best.shape,
            source: 'recommended',
            label: 'おすすめフォーム',
            metrics: best.metrics
        };
    }

    /** フォームのフレット範囲を「1〜3F＋開放」形式の文字列にする */
    function formatFretRange(fretRange) {
        if (!fretRange) return '';
        var base;
        if (fretRange.max === 0 && fretRange.includesOpen) {
            return '開放のみ';
        }
        // 0F を範囲として扱う新しい表示モデルでは、開放弦を重複表記しない。
        if (fretRange.includesOpen && fretRange.min === 0) {
            return '0〜' + fretRange.max + 'F';
        }
        if (fretRange.min === fretRange.max) {
            base = fretRange.min + 'F';
        } else {
            base = fretRange.min + '〜' + fretRange.max + 'F';
        }
        return fretRange.includesOpen ? base + '＋開放' : base;
    }

    /**
     * ノート列からバレー（同じ指で同フレットの複数弦を押さえる箇所）を検出する。
     * - 対象: fret > 0 かつ finger が null / undefined / 'T' でないノート
     * - 人差し指(1): 弦が非連続でも最低弦〜最高弦を1本のバレーとしてつなぐ
     * - 中指〜小指(2〜4): 連続する弦のみミニバレーにする（非連続は個別マーカーのまま）
     * 保存済みコードの notes からも導出できる（マイグレーション不要）。
     * @param {Array} notes [{string, fret, finger, ...}]
     * @returns {Array} [{ finger, fret, fromString, toString }]（fromString < toString）
     */
    function detectBarres(notes) {
        var groups = {};
        (notes || []).forEach(function (note) {
            if (!note || note.pendingDelete === true || typeof note.fret !== 'number' || note.fret <= 0) return;
            var finger = note.finger;
            if (finger === null || finger === undefined || finger === 'T') return;
            var key = finger + '@' + note.fret;
            if (!groups[key]) {
                groups[key] = { finger: finger, fret: note.fret, strings: [] };
            }
            if (groups[key].strings.indexOf(note.string) === -1) {
                groups[key].strings.push(note.string);
            }
        });

        var barres = [];
        Object.keys(groups).forEach(function (key) {
            var group = groups[key];
            if (group.strings.length < 2) return;
            var sorted = group.strings.slice().sort(function (a, b) { return a - b; });

            if (String(group.finger) === '1') {
                // 人差し指: 全体を1本のバレーにする
                barres.push({
                    finger: group.finger,
                    fret: group.fret,
                    fromString: sorted[0],
                    toString: sorted[sorted.length - 1]
                });
                return;
            }

            // 中指〜小指: 連続区間だけをミニバレーにする
            var runStart = sorted[0];
            var prev = sorted[0];
            var i;
            for (i = 1; i <= sorted.length; i++) {
                var current = sorted[i];
                if (current === prev + 1) {
                    prev = current;
                    continue;
                }
                if (prev > runStart) {
                    barres.push({
                        finger: group.finger,
                        fret: group.fret,
                        fromString: runStart,
                        toString: prev
                    });
                }
                runStart = current;
                prev = current;
            }
        });
        return barres;
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.caged = {
        SHAPE_ORDER: SHAPE_ORDER,
        SHAPE_DEFAULT_MUTED_STRINGS: SHAPE_DEFAULT_MUTED_STRINGS,
        FORMS: FORMS,
        COMMON_FORM_OVERRIDES: COMMON_FORM_OVERRIDES,
        RECOMMENDED_FORM_OVERRIDES: RECOMMENDED_FORM_OVERRIDES,
        getForm: getForm,
        getFormDisplayRange: getFormDisplayRange,
        getCommonForm: getCommonForm,
        formatFretRange: formatFretRange,
        detectBarres: detectBarres
    };
})();
