export const FEATURE_TUTORIAL_STEPS = Object.freeze({
    practice: [
        { target: '#practice-menu-add', title: 'まずはメニューを追加', text: 'ここから練習メニューを追加します。名前と練習時間（目安）を入力して保存します。※チュートリアル中は画面を操作できません。' },
        { target: '#practice-timer-toggle', title: 'タイマーで計る', text: '「練習スタート」で時間を計り始めます。一時停止・再開もできます。' },
        { target: '.practice-check', fallback: '.practice-list', title: '終わったらチェック', text: '練習したメニューは左の○でチェックします。1回の練習につき、そのメニューの通算回数が1回増えます。' },
        { target: '#practice-timer-stop', fallback: '.practice-timer-card', title: '練習を終了', text: '途中で終えるときは、画面上部の「練習終了」を押します。表示中のすべてのメニューにチェックが入った場合は自動的に完了します。', fallbackText: '練習スタート後は、ここに「練習終了」が表示されます。途中で終えるときに使用します。表示中のすべてのメニューにチェックが入った場合も完了します。' },
        { target: '#practice-history-open', title: '記録を見る', text: '練習の記録は、右上の音楽カレンダーから確認できます。', emptySelector: '.practice-menu-card', emptyText: '練習の記録は、右上の音楽カレンダーから確認できます。案内を終了したら、まずは練習メニューを1つ追加してみましょう。' }
    ],
    gear: [
        { target: '#gear-list-title-add', title: '機材を追加', text: 'ここから機材を追加します。名前・カテゴリと、どのリストに入れるかを選んで保存します。※チュートリアル中は画面を操作できません。' },
        { target: '.gear-list-tabs', title: 'リストを切り替える', text: '「自分の機材」は今持っている機材と手放した機材、「ほしい機材」はほしい機材、「全て」は全機材を表示します。' },
        { target: '.gear-category-toolbar', title: 'カテゴリで整理', text: 'カテゴリで表示を絞り込めます。右の「⋮」からカテゴリを追加できます。' },
        { target: '.gear-card', fallback: '#gear-list-content', title: '確認・編集', text: 'カードを押すと編集できます。「⋯」から購入・手放しなどの変更もできます。', emptySelector: '.gear-card', emptyText: 'カードを押すと編集できます。「⋯」から購入・手放しなどの変更もできます。案内を終了したら、まずは機材を1件追加してみましょう。' }
    ]
});

export function tutorialStepText(root, step, target) {
    if (step.fallbackText && !target.matches(step.target)) return step.fallbackText;
    if (step.emptySelector && !root.querySelector(step.emptySelector)) return step.emptyText;
    return step.text;
}

export function findTutorialTarget(root, step) {
    const visible = (selector) => selector && [...root.querySelectorAll(selector)].find((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && !element.closest('[hidden]');
    });
    return visible(step.target) || visible(step.fallback) || null;
}

export function tutorialPlacement(rect, viewport, bubble) {
    const padding = 12;
    const left = Math.max(4, Math.min(viewport.width - 4, rect.left - 4));
    const right = Math.max(left, Math.min(viewport.width - 4, rect.right + 4));
    const top = Math.max(4, Math.min(viewport.height - 4, rect.top - 4));
    const bottom = Math.max(top, Math.min(viewport.height - 4, rect.bottom + 4));
    const below = bottom + 10;
    const above = top - bubble.height - 10;
    const y = below + bubble.height <= viewport.height - padding ? below : above >= padding ? above : Math.max(padding, viewport.height - bubble.height - padding);
    const x = Math.max(padding, Math.min(viewport.width - bubble.width - padding, (left + right - bubble.width) / 2));
    return { left, right, top, bottom, bubbleX: x, bubbleY: y };
}

export function startFeatureTutorial(key, { root = globalThis.document, trigger } = {}) {
    const config = FEATURE_TUTORIAL_STEPS[key];
    if (!root || !config || root.querySelector('.port-tutorial[open]')) return false;
    const steps = config.filter((step) => findTutorialTarget(root, step));
    if (!steps.length) return false;
    const win = root.defaultView;
    const savedScroll = { left: win.scrollX, top: win.scrollY };
    const dialog = root.createElement('dialog');
    dialog.className = 'port-tutorial';
    dialog.setAttribute('aria-labelledby', 'port-tutorial-title');
    dialog.setAttribute('aria-describedby', 'port-tutorial-text');
    const shades = Array.from({ length: 4 }, () => {
        const shade = root.createElement('div');
        shade.className = 'port-tutorial-shade'; shade.setAttribute('aria-hidden', 'true');
        dialog.append(shade); return shade;
    });
    const spotlight = root.createElement('div');
    spotlight.className = 'port-tutorial-spotlight'; spotlight.setAttribute('aria-hidden', 'true');
    const bubble = root.createElement('section'); bubble.className = 'port-tutorial-bubble';
    const progress = root.createElement('span'); progress.className = 'port-tutorial-progress'; progress.setAttribute('aria-live', 'polite'); progress.setAttribute('aria-atomic', 'true');
    const title = root.createElement('h2'); title.id = 'port-tutorial-title';
    const text = root.createElement('p'); text.id = 'port-tutorial-text'; text.setAttribute('aria-live', 'polite'); text.setAttribute('aria-atomic', 'true');
    const actions = root.createElement('div'); actions.className = 'port-tutorial-actions';
    function button(label, attr, action) {
        const element = root.createElement('button'); element.type = 'button'; element.textContent = label;
        element.setAttribute(attr, ''); element.addEventListener('click', action); return element;
    }
    const x = button('×', 'data-tutorial-close', () => dialog.close()); x.className = 'port-tutorial-x'; x.setAttribute('aria-label', 'チュートリアルを閉じる');
    const back = button('戻る', 'data-tutorial-back', () => show(index - 1));
    const end = button('終了', 'data-tutorial-end', () => dialog.close());
    const next = button('次へ', 'data-tutorial-next', () => index === steps.length - 1 ? dialog.close() : show(index + 1));
    actions.append(back, end, next); bubble.append(progress, title, text, x, actions); dialog.append(spotlight, bubble); root.body.append(dialog);
    let index = 0, currentTarget, frame;
    function position() {
        if (!dialog.open || !currentTarget) return;
        const rect = currentTarget.getBoundingClientRect();
        const viewport = { width: win.innerWidth, height: win.innerHeight };
        const p = tutorialPlacement(rect, viewport, bubble.getBoundingClientRect());
        const place = (element, left, top, width, height) => Object.assign(element.style, { left: `${left}px`, top: `${top}px`, width: `${Math.max(0, width)}px`, height: `${Math.max(0, height)}px` });
        place(spotlight, p.left, p.top, p.right - p.left, p.bottom - p.top);
        place(shades[0], 0, 0, viewport.width, p.top);
        place(shades[1], 0, p.bottom, viewport.width, viewport.height - p.bottom);
        place(shades[2], 0, p.top, p.left, p.bottom - p.top);
        place(shades[3], p.right, p.top, viewport.width - p.right, p.bottom - p.top);
        Object.assign(bubble.style, { left: `${p.bubbleX}px`, top: `${p.bubbleY}px` });
    }
    function show(value) {
        index = Math.max(0, Math.min(steps.length - 1, value));
        currentTarget = findTutorialTarget(root, steps[index]);
        if (!currentTarget) { dialog.close(); return; }
        title.textContent = steps[index].title; text.textContent = tutorialStepText(root, steps[index], currentTarget);
        progress.textContent = `ステップ ${index + 1} / ${steps.length}：${steps[index].title}`;
        back.disabled = index === 0; next.textContent = index === steps.length - 1 ? '完了' : '次へ';
        const rect = currentTarget.getBoundingClientRect();
        if (rect.top < 12 || rect.bottom > win.innerHeight - 12) {
            const behavior = win.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
            currentTarget.scrollIntoView({ behavior, block: 'center', inline: 'nearest' });
        }
        position(); next.focus({ preventScroll: true });
    }
    const reposition = () => { win.cancelAnimationFrame(frame); frame = win.requestAnimationFrame(position); };
    const exit = () => dialog.close();
    const lockObserver = new win.MutationObserver(() => {
        if (root.body.classList.contains('pro-gate-active')) exit();
    });
    lockObserver.observe(root.body, { attributes: true, attributeFilter: ['class'] });
    win.addEventListener('resize', reposition); win.addEventListener('scroll', reposition, true); win.addEventListener('hashchange', exit);
    dialog.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab') return;
        const controls = [x, back, end, next].filter((control) => !control.disabled);
        const active = controls.indexOf(root.activeElement);
        event.preventDefault(); controls[(active + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
    });
    dialog.addEventListener('close', () => {
        lockObserver.disconnect();
        win.removeEventListener('resize', reposition); win.removeEventListener('scroll', reposition, true); win.removeEventListener('hashchange', exit);
        win.cancelAnimationFrame(frame); dialog.remove();
        win.scrollTo({ ...savedScroll, behavior: 'instant' });
        if (trigger?.isConnected && !root.body.classList.contains('pro-gate-active')) trigger.focus({ preventScroll: true });
    }, { once: true });
    dialog.showModal(); show(0); return true;
}
