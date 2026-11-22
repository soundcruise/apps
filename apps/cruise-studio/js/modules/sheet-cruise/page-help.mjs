import {bindOutsideDismiss} from '../score-ui.mjs';

const guides = {
    editor: [
        '小節を選び、入力したい拍のマスをクリックします。',
        ['移動と表示する小節数', '通常のカードでは「1小節」〜「4小節」で表示数を選び、「前へ」「次へ」でその数ずつ移動します。'],
        ['入力するマス', '上からコード・ストローク・歌詞・メロディです。マス右下の数字を押すと、そのマスの音価を変更できます。'],
        ['行名の横の数字と▼', '数字で同じ行の音価をそろえます。▼でコード・フォームやメロディ鍵盤が開きます。'],
        ['マスの横幅', '「−／＋」で調整し、中央の倍率を押すと100%に戻ります。カードの右端は、マスの幅を保ったまま見える範囲を変えます。'],
        ['再生', '通常時は表示中の小節、最大化中は選んだ譜面の行を試聴します。'],
        ['最大化', '選んだ小節を強調し、その譜面の行を一番上に表示します。全小節を上下にスクロールできます。']
    ],
    audio: [
        '再生しながら、聞きたいパートの音量と拍のガイドを調整できます。',
        ['再生する音と音量', '聞きたいパートにチェックを入れ、スライダーで音量を決めます。チェックは下の再生カードと連動します。'],
        ['拍のガイド', '「メトロノーム」にチェックを入れると拍が鳴ります。「カウントイン」も選ぶと再生前に1小節数えます。繰り返しでも最初の1回だけ鳴ります。'],
        ['音と棒の同期', '聞こえる音と再生棒がずれるときに調整します。棒の表示だけが動き、演奏のテンポは保たれます。'],
        ['再生と完了', '「再生」で試し、調整が済んだら「完了」で譜面に戻ります。音設定はこのブラウザに記憶されます。']
    ],
    sections: [
        '上の列で編集したい部分を選んでから、左側か右の譜面で変更します。',
        ['上の列', '「Aメロ」「サビ」など、編集したいセクションをクリックします。'],
        ['左の操作欄', '名前や順番を変えます。繰り返すときは「コピー」→ 挿入先を選ぶ →「後ろに貼り付け」。コピーするパートを選び、「実行」を押します。'],
        ['譜面の＋／−', 'そのセクションの末尾の小節を増やす・減らすボタンです。'],
        ['右上の「適用」', '順番と小節数を確認し、変更を曲に反映します。']
    ],
    newSong: [
        '曲の情報を入力したら、この画面から小節の構成や伴奏を作れます。',
        ['曲名', '左上に曲のタイトルを入力します。'],
        ['BPM', 'テンポを入力します。拍子はその下で選びます。'],
        ['セクション編集', 'イントロやサビを並べ、小節数を決めます。'],
        ['コード一括入力', 'コード進行と入力先を選びます。'],
        ['ストローク一括入力', '伴奏パターンを決め、弾き方をまとめて入力します。'],
        ['右の譜面', '入力した内容を確認し、右上の「適用」で譜面に戻ります。']
    ],
    settings: [
        '左で入力し、右の譜面で仕上がりを確かめます。',
        ['曲名とアーティスト名', '左上に入力すると、右の譜面の見出しが変わります。'],
        ['テンポ・拍子・キー', '左側でBPMと拍子を設定します。原曲キーとPlayキーもここで選べます。'],
        ['右の譜面', '曲名の下にあるBPM・拍子・キーを確認します。'],
        ['右上の「適用」', '入力した内容を曲に反映します。']
    ],
    instrument: [
        '曲の高さを保って押さえ方を変えるか、曲の高さも変えるかを選びます。',
        ['上の選択欄', 'カポだけを変えたいときは「曲の高さを保ってカポを変える」、歌う高さを変えたいときは「曲の高さを変える（移調）」を選びます。'],
        ['中央の入力欄', 'カポの位置を数字で入力します。移調する場合は「原曲キー（実音）」も選べます。'],
        ['変更前・変更後の表', '実際に鳴るキーと、押さえるコードのキー（Playキー）を見比べます。'],
        ['右上の「適用」', '表の「変更後」の内容を曲に反映します。']
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
        ['全体の小節数', '「自動」は譜面の幅に合わせます。数を固定するにはチェックを外して選びます。小節編集を最大化したときも、この段組みに従います。'],
        ['セクション別の表示', 'イントロなど一部だけ変えたいときに開き、対象を選びます。'],
        ['項目ごとの設定', '左の「曲名」などの欄で、チェックは表示の切り替え、スライダーは大きさの調整です。'],
        ['右の譜面例', '文字や段組みを確認します。特定の行だけ調整するときは、その行をクリックします。'],
        ['右上の「保存」', '表示設定を確定します。元の設定に戻って閉じるには「キャンセル」を押します。']
    ],
    history: [
        '編集の履歴を選ぶと、その時点の譜面を確認できます。',
        ['下の一覧', '確認したい時点をクリックします。「現在」は履歴を開く前の位置です。'],
        ['一覧の上の説明', '今どの時点を表示しているかを確認し、背後の譜面を見比べます。見るだけなら「キャンセル」で戻れます。'],
        ['右上の「決定」', '戻す場合は、消える履歴の件数を確認し、「この時点に戻す」を押します。']
    ],
    catalogue: [
        '譜面で同じフォームを使っている箇所のコード名と押さえ方をまとめて変更します。',
        ['上の「対象の○箇所を確認」', 'クリックすると、変更する小節と拍が表示されます。'],
        ['コード名', '新しい名前を入力してEnterを押すか、下のコード候補を選びます。'],
        ['フォームの「詳細設定」', '押さえ方を変えるときはここで指板を開きます。運指は左のコード図でも変更できます。'],
        ['右下の「○箇所に反映」', 'コード図と対象件数を確認し、変更を譜面に反映します。']
    ]
};

const illustratedGuides = {
    editor: {image:'editor.png', width:960, height:311, anchor:'edit',
        alt:'小節編集。①移動と表示数、②入力マス、③行の音価とフォーム・鍵盤、④横方向の倍率、⑤再生、⑥最大化。'},
    audio: {image:'sound-settings.png', width:420, height:726, anchor:'sound-settings',
        alt:'音設定。①パート別の音量、②カウントインとメトロノーム、③音と棒の同期、④再生と完了。'},
    instrument: {image:'key-capo.png', width:580, height:552, anchor:'key-capo',
        alt:'キー・カポ。①変更方法、②カポの位置、③変更前と変更後の比較表、④適用。'},
    history: {image:'history-choose.png', width:350, height:220, anchor:'history',
        alt:'変更履歴。①選んだ時点、②表示中の履歴の説明、③決定。'},
    catalogue: {image:'catalogue-edit.png', width:920, height:530, anchor:'catalogue-edit',
        alt:'コードとフォームの一括編集。①対象の小節と拍、②コード名、③詳細設定、④5箇所に反映。'},
    newSong: {image:'lesson/song.png', width:1120, height:810, anchor:'lesson',
        alt:'新しい曲を作成。①曲名、②BPM、③セクション編集、④コード一括入力、⑤ストローク一括入力、⑥譜面プレビュー。'},
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

function addElement(parent, tag, text = '') {
    const element = parent.ownerDocument.createElement(tag);
    element.textContent = text;
    parent.append(element);
    return element;
}

export function appendIllustratedGuide(container, topic, title) {
    const guide = guides[topic];
    const illustration = illustratedGuides[topic];
    container.classList.add('sc-illustrated-help');
    addElement(container, 'p', guide[0]);
    const picture = addElement(container, 'img');
    picture.src = '/apps/cruise-studio/score-guide/' + illustration.image;
    picture.width = illustration.width;
    picture.height = illustration.height;
    picture.alt = illustration.alt;
    const steps = addElement(container, 'ol');
    for (const [label, detail] of guide.slice(1)) {
        const step = addElement(steps, 'li');
        addElement(step, 'strong', label);
        step.append('　' + detail);
    }
    const link = addElement(container, 'a', '詳しくはこちら（画像付きの取扱説明書）');
    link.href = '/apps/cruise-studio/score-guide/index.html#' + illustration.anchor;
    link.target = '_blank';
    link.rel = 'noopener';
    link.title = title + 'の手順を新しいタブで開く';
}

export function addPageHelp(owner, before, topic, pageName = owner.getAttribute('aria-label')) {
    if (!guides[topic]) return;
    const doc = owner.ownerDocument;
    const title = pageName + 'の使い方';
    const trigger = doc.createElement('button');
    trigger.type = 'button';
    trigger.className = 'sc-page-help-trigger';
    trigger.textContent = '？';
    trigger.title = title;
    trigger.setAttribute('aria-label', title);
    trigger.setAttribute('aria-haspopup', 'dialog');
    before.before(trigger);
    trigger.addEventListener('click', () => {
        const card = doc.createElement('dialog');
        card.className = 'sc-page-help';
        card.dataset.helpTopic = topic;
        card.setAttribute('aria-label', title);
        const head = addElement(card, 'header');
        addElement(head, 'h2', title);
        const close = addElement(head, 'button', '閉じる');
        close.type = 'button';
        appendIllustratedGuide(card, topic, pageName);
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
