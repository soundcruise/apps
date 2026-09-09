import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('./metronome-app.js', import.meta.url), 'utf8');
const listener = source.slice(source.indexOf("    elements.toggle.addEventListener('click', async () => {"), source.indexOf('    if (!loadResult.ok)'));

test('metronome failed start keeps visible retry guidance after rendering playing state', async () => {
    for (const outcome of ['false', 'throw', 'success']) {
        let handler;
        let playing = false;
        const elements = { status: { textContent: '' }, toggle: { disabled: false, addEventListener: (_, callback) => { handler = callback; } } };
        const engine = {
            isPlaying: () => playing,
            async start() {
                if (outcome === 'throw') throw new Error('resume failed');
                playing = outcome === 'success';
                return playing;
            }
        };
        vm.runInNewContext(listener, { elements, engine, getSettings() {}, viewActive: true, document: { hidden: false },
            renderPlaying() { elements.status.textContent = playing ? '再生中' : '停止中'; } });
        await handler();
        assert.equal(elements.toggle.disabled, false);
        if (outcome === 'success') assert.equal(elements.status.textContent, '再生中');
        else assert.match(elements.status.textContent, /音声を開始できませんでした/);
    }
});
