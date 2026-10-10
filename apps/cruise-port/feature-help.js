import { startFeatureTutorial } from './feature-tutorial.js?v=1.21.0';

export const FEATURE_HELP = Object.freeze({
    practice: {
        title: '練習メニューの使い方',
        description: '毎日の練習内容を登録して、一覧から進められる練習リストです。',
        steps: [
            '「練習メニューを追加」から、メニュー名と練習時間を入力して保存します。使用アプリやメモは必要に応じて選びます。',
            '「練習スタート」でタイマーを開始します。一時停止・再開もできます。',
            '一覧の項目名から詳細を確認します。使用アプリがある項目は「アプリへ」から開けます。',
            '練習した項目にチェックを入れると、通算回数が増えます。',
            '「ここで練習終了」でタイマーを止め、チェックを解除します。記録は音楽カレンダーで確認できます。'
        ],
        note: '詳細画面から編集できます。「並び替え」は項目が2件以上あるときに表示されます。プリセット横の「＋」で練習リストの組み合わせを作れます。'
    },
    gear: {
        title: '機材リストの使い方',
        description: '持っている機材や、ほしい機材などをまとめて管理できます。',
        steps: [
            '「＋ 機材を追加」から、機材の名前を入力します。',
            'リストで「自分の機材」「ほしい機材」「手放した機材」を選び、カテゴリを設定します。',
            '必要に応じてメーカー・価格・メモを入力し、「保存」を押します。',
            '一覧のタブやカテゴリで絞り込みます。機材カードを押すと編集できます。'
        ],
        note: 'カードの「⋯」から編集・削除や「購入した」「手放した」などの区分変更ができます。カテゴリ横の「⋯」でカテゴリを追加・変更できます。'
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
