(function () {
    'use strict';

    /* コード説明辞書。キー内の度数機能（ディグリー）で引く。
       goesTo はダイアトニック度数のインデックス（0〜6）で持ち、
       表示時に現在のキー・和音数の実コード名へ変換する。 */

    var CHORD_INFO = {
        major: [
            { mood: '明るく安定した、曲の「家」にあたる響き。始まりにも終わりにも使われます。', goesTo: [3, 4, 5, 1] },
            { mood: '柔らかく少し切ない響き。Vコードへ向かう助走としてよく使われます。', goesTo: [4, 6, 0] },
            { mood: '切なさと浮遊感のある響き。メジャーキーの中のかくし味です。', goesTo: [5, 3] },
            { mood: '広がりと安心感のある響き。サビ前の盛り上げにもよく登場します。', goesTo: [0, 4, 1] },
            { mood: '緊張感があり、Iへ戻りたくなる響き。キーの推進力を生みます。', goesTo: [0, 5] },
            { mood: '切なく落ち着いた響き。メジャーキーの中のマイナーの入り口です。', goesTo: [3, 1, 4] },
            { mood: '不安定で緊張感が強く、すぐにIへ解決したくなる響きです。', goesTo: [0] }
        ],
        minor: [
            { mood: '暗く落ち着いた、マイナーキーの「家」にあたる響きです。', goesTo: [3, 5, 6, 4] },
            { mood: '不安定で切迫感のある響き。vやiへ向かう流れを作ります。', goesTo: [4, 0] },
            { mood: 'マイナーの中に差す明るさ。平行メジャーの響きです。', goesTo: [5, 3] },
            { mood: '深い哀愁のある響き。iへの流れを自然に作ります。', goesTo: [0, 6, 4] },
            { mood: '切ない緊張感のある響き。iへ戻る流れを生みます。', goesTo: [0, 5] },
            { mood: '温かく広がる響き。切なさの中の安らぎです。', goesTo: [2, 3, 6] },
            { mood: '開放感があり、iやIIIへ流れていく響きです。', goesTo: [2, 0] }
        ]
    };

    /**
     * @param {string} mode 'major' | 'minor'
     * @param {number} degreeIndex 0〜6
     * @returns {{mood: string, goesTo: number[]}|null}
     */
    function getInfo(mode, degreeIndex) {
        var list = CHORD_INFO[mode];
        if (!list || degreeIndex == null || degreeIndex < 0 || degreeIndex > 6) {
            return null;
        }
        return list[degreeIndex] || null;
    }

    window.ChordCruise = window.ChordCruise || {};
    window.ChordCruise.chordInfo = {
        getInfo: getInfo
    };
})();
