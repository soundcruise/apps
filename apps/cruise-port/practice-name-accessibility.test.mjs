import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./practice-menu-app.js', import.meta.url), 'utf8');
const start = source.indexOf('function syncPracticeNameControls(');
const handler = source.slice(start, source.indexOf('\nfunction ', start + 1));

for (const entry of ['index.html', 'pro_9a3943176561/index.html']) {
    for (const [mode, preset] of [['create', 'pitch'], ['create', 'custom'], ['edit', 'custom']]) {
        test(`${entry}: ${mode}/${preset} gives every visible name control its visible label`, () => {
            const html = readFileSync(new URL(entry, import.meta.url), 'utf8');
            // Reflect the shipped element attributes, then run the real mode-switch handler.
            const element = (id) => {
                const tag = html.match(new RegExp(`<[^>]+id="${id}"[^>]*>`))?.[0];
                assert.ok(tag, id);
                const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
                return { id, attrs, htmlFor: attrs.for, hidden: false, value: '' };
            };
            const elements = { nameLabel: element('practice-name-label'),
                namePresetInput: element('practice-name-preset'), nameInput: element('practice-name') };
            elements.namePresetInput.value = preset;
            vm.runInNewContext(handler + '\nsyncPracticeNameControls();', {
                elements, state: { formMode: mode }, PRACTICE_NAME_PRESET_CUSTOM: 'custom'
            });
            const labelText = html.match(/<label id="practice-name-label"[^>]*>([\s\S]*?)<\/label>/)[1]
                .replace(/<[^>]+>/g, '').trim();
            const name = control => control.attrs['aria-labelledby'] === elements.nameLabel.id
                || elements.nameLabel.htmlFor === control.id ? labelText : '';
            for (const control of [elements.namePresetInput, elements.nameInput].filter(el => !el.hidden)) {
                assert.match(name(control), /メニュー名/);
            }
            assert.equal(elements.nameInput.hidden, mode === 'create' && preset !== 'custom');
            if (mode === 'edit') assert.equal(elements.nameLabel.htmlFor, 'practice-name');
        });
    }
}
