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
        '左で入力し、右の譜面で仕上がりを確かめます。',
        ['曲名とアーティスト名', '左上に入力すると、右の譜面の見出しが変わります。'],
        ['テンポ・拍子・キー', '左側でBPMと拍子を設定します。原曲キーとPlayキーもここで選べます。'],
        ['右の譜面', '曲名の下にあるBPM・拍子・キーを確認します。'],
        ['右上の「適用」', '入力した内容を曲に反映します。']
    ],
    instrument: [
        '曲の高さやカポの位置を変えたときのコードを確認できます。',
        ['変更方法を選ぶ', '同じ高さで別の押さえ方にするには「曲の高さを保ってカポを変える」を選びます。歌いやすい高さに変えるには「曲の高さを変える（移調）」を選びます。'],
        ['結果を確かめる', 'カポや原曲キーを選び、「変更後」のPlayキー（押さえるキー）を確認して「適用」を押します。']
    ],
    chordPreset: [
        'コード進行を選び、譜面のどの小節に入れるかを指定します。',
        ['上の「プリセット」', '使いたい進行を選びます。下の白いマスにコードが並びます。'],
        ['下の「曲の譜面」', '入力を始める小節をクリックすると、進行の長さに合わせて入力先に色が付きます。'],
        ['中央の「適用」', '横に表示された小節番号を確かめて押し、下の譜面でコードを確認します。'],
        ['右上の「OK」', '確認した進行を曲に反映します。']
    ],
    strumPreset: [
        'ストロークを選び、指定した小節に同じパターンを入れます。',
        ['上の「プリセット」', '使いたいパターンを選びます。上段の「再生」で試聴できます。'],
        ['下の「曲の譜面」', '入力したい最初の小節から最後の小節までドラッグします。セクション全体なら見出しをクリックします。'],
        ['中央の「適用」', '横に表示された小節番号を確かめて押し、下の譜面で矢印を確認します。'],
        ['右上の「OK」', '選んだ小節のストロークを、確認したパターンに置き換えます。']
    ],
    layout: [
        '左で見え方を変えると、右の譜面例に反映されます。',
        ['全体の小節数', '「自動」は譜面の幅に合わせます。数を固定するにはチェックを外して選びます。'],
        ['セクション別の表示', 'イントロなど一部だけ変えたいときに開き、対象を選びます。'],
        ['項目ごとの設定', '左の「曲名」などの欄で、チェックは表示の切り替え、スライダーは大きさの調整です。'],
        ['右の譜面例', '文字や段組みを確認します。特定の行だけ調整するときは、その行をクリックします。'],
        ['右上の「保存」', '表示設定を確定します。元の設定に戻って閉じるには「キャンセル」を押します。']
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

const illustratedGuides = {
    settings: {image:'song.png', width:1120, height:544, anchor:'song',
        alt:'曲情報。①曲名とアーティスト名、②BPM・拍子・キー、③右の譜面の見出し、④右上の適用。'},
    layout: {image:'display.png', width:1080, height:546, anchor:'view',
        alt:'譜面の表示設定。①全体の小節数、②セクション別の表示、③項目ごとの設定、④右の譜面例、⑤右上の保存。'},
    sections: {image:'sections.png', width:1050, height:430, anchor:'sections',
        alt:'セクション編集の画面。①上の列、②左の操作欄、③譜面の＋／−、④右上の適用。'},
    chordPreset: {image:'chords.png', width:960, height:589, anchor:'batch-chords',
        alt:'コード一括入力の画面。①王道進行、②入力先の4〜7小節、③適用、④OK。'},
    strumPreset: {image:'strokes.png', width:960, height:653, anchor:'batch-strokes',
        alt:'ストローク一括入力の画面。①基本の8分、②入力先の2〜3小節、③適用、④OK。'}
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
        const illustration = illustratedGuides[topic];
        if (illustration) {
            card.classList.add('sc-illustrated-help');
            const picture = append('img', '');
            picture.src = '/apps/cruise-studio/score-guide/' + illustration.image;
            picture.width = illustration.width;
            picture.height = illustration.height;
            picture.alt = illustration.alt;
            const steps = append('ol', '');
            for (const [label, detail] of guide.slice(1)) {
                const step = append('li', '', steps);
                append('strong', label, step);
                step.append('　' + detail);
            }
            const link = append('a', '詳しくはこちら（画像付きの取扱説明書）');
            link.href = '/apps/cruise-studio/score-guide/index.html#' + illustration.anchor;
            link.target = '_blank';
            link.rel = 'noopener';
            link.title = owner.getAttribute('aria-label') + 'の手順を新しいタブで開く';
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
