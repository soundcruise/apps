import { startFeatureTutorial } from './feature-tutorial.js?v=1.21.2';

export const FEATURE_HELP = Object.freeze({
    practice: {
        title: '練習メニューの使い方',
        description: '練習するメニューを登録し、タイマーで時間を計りながら、終わったものにチェックしていく機能です。記録は音楽カレンダーに残ります。',
        steps: [
            '「＋ 練習メニューを追加」で、メニュー名と練習時間（目安）を入力して保存します。',
            '「練習スタート」でタイマーを始めます。一時停止・再開もできます。',
            '練習したメニューは左の○を押してチェックします。1回の練習につき、そのメニューの通算回数が1回増えます。',
            '表示中の練習メニューすべてにチェックが入ると、その練習は完了します。',
            '途中で終える場合は、タイマー開始後に画面上部へ表示される「練習終了」を押します。',
            '練習時間や完了した内容は、右上の音楽カレンダーから確認できます。'
        ],
        note: '練習時間は目安で、タイマーの制限時間ではありません。終了画面で次へ進むとチェックは次回用に外れ、通算回数とカレンダー記録は残ります。下部の「ここで練習終了」からも同じ終了操作ができます。プリセットを使うと、練習するメニューの組み合わせを切り替えられます。'
    },
    gear: {
        title: '機材リストの使い方',
        description: '持っている機材、ほしい機材、手放した機材を、カテゴリ別に記録できます。',
        steps: [
            '「＋ 機材を追加」から、名前・カテゴリ・リストを設定して保存します。メーカー・価格・メモ・写真は任意です。',
            '上部のタブで表示を切り替えます。「自分の機材」は今持っている機材と手放した機材、「ほしい機材」はほしい機材、「全て」は全機材を表示します。',
            'カテゴリで表示を絞り込めます。カテゴリ右側の「⋮」から追加・名前変更・削除ができます。',
            '機材カードを押すと編集できます。カードの「⋯」から、状態に応じて「購入した」「手放した」「所有中に戻す」、編集・削除などの操作ができます。'
        ],
        note: 'ほしい機材には優先度を設定できます。列数を変えて一覧を見やすくしたり、表示中の一覧を書き出したりできます。'
    }
});

export function bindFeatureHelp(root = globalThis.document) {
    const dialog = root?.querySelector('#port-feature-help-dialog');
    if (!dialog || dialog.dataset.bound) return;
    dialog.dataset.bound = 'true';
    const title = dialog.querySelector('#port-feature-help-title');
    const description = dialog.querySelector('#port-feature-help-description');
    const steps = dialog.querySelector('#port-feature-help-steps');
    const note = dialog.querySelector('#port-feature-help-note');
    let activeKey, trigger;
    root.querySelectorAll('[data-feature-help]').forEach((button) => {
        button.addEventListener('click', () => {
            const help = FEATURE_HELP[button.dataset.featureHelp];
            if (!help || dialog.open) return;
            activeKey = button.dataset.featureHelp;
            trigger = button;
            title.textContent = help.title;
            description.textContent = help.description;
            steps.replaceChildren(...help.steps.map((text) => {
                const item = root.createElement('li');
                item.textContent = text;
                return item;
            }));
            note.textContent = help.note;
            dialog.showModal();
        });
    });
    const close = dialog.querySelector('[data-feature-help-close]');
    const tutorial = dialog.querySelector('[data-feature-tutorial]');
    close.addEventListener('click', () => dialog.close());
    tutorial.addEventListener('click', () => {
        dialog.close();
        startFeatureTutorial(activeKey, { root, trigger });
    });
    dialog.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab') return;
        if (event.shiftKey && root.activeElement === tutorial) {
            event.preventDefault(); close.focus();
        } else if (!event.shiftKey && root.activeElement === close) {
            event.preventDefault(); tutorial.focus();
        }
    });
    dialog.addEventListener('click', (event) => {
        const rect = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
}

bindFeatureHelp();
