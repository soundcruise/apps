import {bindOutsideDismiss} from '../score-ui.mjs';

const guides = {
    sections: [
        '上の列で編集したい部分を選んでから、左側か右の譜面で変更します。',
        ['上の列', '「Aメロ」「サビ」など、編集したいセクションをクリックします。'],
        ['左の操作欄', '名前や順番を変えます。繰り返すときは「コピー」→ 挿入先を選ぶ →「後ろに貼り付け」。'],
        ['譜面の＋／−', 'そのセクションの末尾の小節を増やす・減らすボタンです。'],
        ['右上の「適用」', '順番と小節数を確認し、変更を曲に反映します。']
    ],
    settings: [
        '曲名・テンポ・拍子など、曲全体に使う情報を設定します。',
        ['入力する', '左で曲名やBPMを入力し、右の譜面で確認します。'],
        ['確定する', '「適用」で曲に反映します。「譜面の全体編集」を選ぶと、入力を反映してセクション編集や一括入力に進めます。']
    ],
    instrument: [
        '曲の高さやカポの位置を変えたときのコードを確認できます。',
        ['変更方法を選ぶ', '同じ高さで別の押さえ方にするには「曲の高さを保ってカポを変える」を選びます。歌いやすい高さに変えるには「曲の高さを変える（移調）」を選びます。'],
        ['結果を確かめる', 'カポや原曲キーを選び、「変更後」のPlayキー（押さえるキー）を確認して「適用」を押します。']
    ],
    chordPreset: [
        '同じコード進行を、まとめて譜面に入力します。',
        ['進行と入力先', 'プリセットを選び、右の譜面で入力を始める小節をクリックします。セクション全体に繰り返すときはセクション名を選びます。'],
        ['確認して反映', '「適用」で譜面のプレビューを更新します。譜面を確認し、右上の「OK」で曲に反映します。']
    ],
    strumPreset: [
        '選んだ範囲に、同じストロークパターンを入力します。',
        ['パターンを選ぶ', 'プリセットを選びます。必要に応じてマスを選んでD（ダウン）やU（アップ）を入力し、再生して確かめます。'],
        ['範囲を選ぶ', '譜面をドラッグして開始と終了の小節を選びます。セクション全体ならセクション名を、曲全体なら「曲全て」を選びます。'],
        ['曲に反映', '「適用」でプレビューを確認し、「OK」で確定します。']
    ],
    layout: [
        '1行の小節数や、コード・歌詞などの見え方を調整します。',
        ['全体を整える', '左で表示項目や文字の大きさを変え、右の譜面例で確かめます。小節数の「自動」は譜面の幅に合わせます。'],
        ['一部だけ変える', '特定の行は譜面例でその行を選びます。セクション単位の調整は「セクション別の表示」から対象を選びます。'],
        ['設定を残す', '見え方が決まったら「保存」を押します。']
    ],
    history: [
        '変更の履歴から、以前の譜面を確認して戻せます。',
        ['確認する', '一覧で戻りたい時点を選び、譜面を確認します。「キャンセル」で現在の譜面に戻ります。'],
        ['戻す', '「決定」で影響を確認し、「この時点に戻す」で確定します。それより後の履歴は消えます。ファイルに反映するには曲を保存します。']
    ],
    catalogue: [
        '同じコードフォームが使われている箇所をまとめて変更します。',
        ['対象を確認', '画面上部の対象件数をクリックすると、該当する小節が分かります。'],
        ['まとめて反映', 'コード名や押さえ方を変更し、右下のボタンで選んだ箇所に反映します。']
    ]
};

export function addPageHelp(owner, before, topic) {
    const guide = guides[topic];
    if (!guide) return;
    const doc = owner.ownerDocument;
    const title = owner.getAttribute('aria-label') + 'の使い方';
    const trigger = doc.createElement('button');
    trigger.type = 'button';
    trigger.className = 'sc-page-help-trigger';
    trigger.textContent = '?';
    trigger.title = title;
    trigger.setAttribute('aria-label', title);
    trigger.setAttribute('aria-haspopup', 'dialog');
    before.before(trigger);
    trigger.addEventListener('click', () => {
        const card = doc.createElement('dialog');
        card.className = 'sc-page-help';
        card.setAttribute('aria-label', title);
        function append(tag, text, parent = card) {
            const node = doc.createElement(tag);
            node.textContent = text;
            parent.append(node);
            return node;
        }
        const head = append('header', '');
        append('h2', title, head);
        const close = append('button', '閉じる', head);
        close.type = 'button';
        append('p', guide[0]);
        if (topic === 'sections') {
            card.classList.add('sc-sections-help');
            const picture = append('img', '');
            picture.src = '/apps/cruise-studio/score-guide/sections.png';
            picture.width = 1050;
            picture.height = 430;
            picture.alt = 'セクション編集の画面。①上の列、②左の操作欄、③譜面の＋／−、④右上の適用。';
            const steps = append('ol', '');
            for (const [label, detail] of guide.slice(1)) {
                const step = append('li', '', steps);
                append('strong', label, step);
                step.append('　' + detail);
            }
            const link = append('a', '詳しくはこちら（画像付きの取扱説明書）');
            link.href = '/apps/cruise-studio/score-guide/index.html#sections';
            link.target = '_blank';
            link.rel = 'noopener';
            link.title = 'セクション編集の手順を新しいタブで開く';
        } else {
            const list = append('dl', '');
            for (const [label, detail] of guide.slice(1)) {
                append('dt', label, list);
                append('dd', detail, list);
            }
        }
        const dismiss = () => card.close();
        close.addEventListener('click', dismiss);
        owner.addEventListener('close', dismiss, {once:true});
        card.addEventListener('close', () => {
            owner.removeEventListener('close', dismiss);
            card.remove();
            if (owner.open) trigger.focus({preventScroll:true});
        }, {once:true});
        bindOutsideDismiss(card);
        card.addEventListener('keydown', event => event.stopPropagation());
        owner.after(card);
        card.showModal();
        close.focus({preventScroll:true});
    });
}
