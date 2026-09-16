import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appsRoot = new URL('../../', import.meta.url);
const read = (path) => readFileSync(new URL(path, appsRoot), 'utf8');
const bases = ['chord-cruise', 'pitch-cruise', 'fretboard_cruise', 'rhythm-cruise', 'cruise-port'];

test('all five Privacy Policies describe the current optional cloud-sync data lifecycle', () => {
  for (const base of bases) {
    const text = read(`${base}/privacy.html`);
    for (const phrase of [
      '氏名・メールアドレスなど、個人を直接特定する情報の登録は必要ありません',
      'Cloudflare Workers', 'Cloudflare D1', 'Cloudflare Turnstile',
      '7日', '90日', '365日', '端末内'
    ]) assert.match(text, new RegExp(phrase), `${base}: ${phrase}`);
    assert.doesNotMatch(text, /個人情報は一切取得しません|個人情報を一切処理しません|完全匿名です|すべて暗号化されています/);
  }
});

test('all five Terms describe the optional Sync contract without overpromising', () => {
  for (const base of bases) {
    const text = read(`${base}/terms.html`);
    for (const phrase of ['クラウド同期', '任意', '完全', '復旧コード', 'credential', '環境の同期解除', '7日', '端末内']) {
      assert.match(text, new RegExp(phrase), `${base}: ${phrase}`);
    }
  }
});

test('four app Information pages and Port settings use the same legal link order', () => {
  for (const base of ['chord-cruise', 'pitch-cruise', 'fretboard_cruise', 'rhythm-cruise']) {
    const text = read(`${base}/info.html`);
    assert.match(text, /legal-links\.css\?v=1/);
    assert.match(text, /sound-cruise-info-links/);
    assert(text.indexOf('>利用規約<') < text.indexOf('>プライバシーポリシー<'));
    assert(text.indexOf('>プライバシーポリシー<') < text.indexOf('>お問い合わせ<'));
  }
  for (const path of ['cruise-port/index.html', 'cruise-port/pro_9a3943176561/index.html']) {
    const text = read(path);
    assert.match(text, /legal-links\.css\?v=1/);
    assert.match(text, /sound-cruise-info-links/);
    assert(text.indexOf('>利用規約<') < text.indexOf('>プライバシーポリシー<'));
    assert(text.indexOf('>プライバシーポリシー<') < text.indexOf('>お問い合わせ<'));
  }
});
