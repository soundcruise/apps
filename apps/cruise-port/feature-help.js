export const FEATURE_HELP = Object.freeze({
    practice: {
        title: '練習メニューの使い方',
        description: '普段の練習内容を登録して、自分用の練習リストを作れます。追加した項目は、あとから編集や並び替えができます。クルーズappsやMy Appsを登録すれば、メニューから開けます。'
    },
    gear: {
        title: '機材リストの使い方',
        description: '自分の機材、ほしい機材、手放した機材を記録できます。機材を追加して、カテゴリごとに整理しましょう。メモやURLを残して、必要なときに一覧から確認できます。'
    }
});

export function bindFeatureHelp(root = globalThis.document) {
    const dialog = root?.querySelector('#port-feature-help-dialog');
    if (!dialog || dialog.dataset.bound) return;
    dialog.dataset.bound = 'true';
    const title = dialog.querySelector('#port-feature-help-title');
    const description = dialog.querySelector('#port-feature-help-description');
    root.querySelectorAll('[data-feature-help]').forEach((button) => {
        button.addEventListener('click', () => {
            const help = FEATURE_HELP[button.dataset.featureHelp];
            if (!help || dialog.open) return;
            title.textContent = help.title;
            description.textContent = help.description;
            dialog.showModal();
        });
    });
    const close = dialog.querySelector('[data-feature-help-close]');
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', (event) => {
        if (event.key === 'Tab') {
            event.preventDefault();
            close.focus();
        }
    });
    dialog.addEventListener('click', (event) => {
        const rect = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
    // Native dialog handles Escape and focus restoration; the only control stays tabbable.
}

bindFeatureHelp();
