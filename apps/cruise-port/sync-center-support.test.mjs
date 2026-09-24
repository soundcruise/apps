import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Sync Center support row: the site's existing contact address, a subdued placement at the
// very bottom, and a prefilled template that never carries secrets or user data.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const editions = { standard: read('./index.html'), pro: read('./pro_9a3943176561/index.html') };
const OFFICIAL = 'soundcruise.inc@gmail.com';

function supportBlock(html) {
  const match = html.match(/<section class="sync-center-support"[\s\S]*?<\/section>/);
  assert.ok(match, 'support section exists');
  return match[0];
}

test('both editions place the support row at the bottom of the Sync Center view', () => {
  for (const [edition, html] of Object.entries(editions)) {
    const view = html.indexOf('id="sync-center-view"');
    const danger = html.indexOf('id="sync-center-account-delete"');
    const support = html.indexOf('class="sync-center-support"');
    const firstDialog = html.indexOf('<dialog id="sync-center-setup"');
    const viewEnd = html.indexOf('</main>', view);
    assert.ok(view < danger && danger < support && support < firstDialog && firstDialog < viewEnd, edition);
  }
  assert.equal(supportBlock(editions.standard), supportBlock(editions.pro), 'identical in Standard and Pro');
});

test('the report link uses the existing official contact with a safe prefilled template', () => {
  for (const html of [read('./privacy.html'), read('./terms.html')]) assert.match(html, new RegExp(`mailto:${OFFICIAL}`));
  const block = supportBlock(editions.standard);
  const href = block.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&');
  const url = new URL(href);
  assert.equal(url.protocol, 'mailto:');
  assert.equal(url.pathname, OFFICIAL);
  assert.deepEqual([...url.searchParams.keys()].sort(), ['body', 'subject']);
  assert.equal(url.searchParams.get('subject'), 'Cruise Port クラウド同期の不具合');
  const body = url.searchParams.get('body');
  assert.match(body, /困っているアプリ/);
  assert.match(body, /書かないでください/);
  assert.doesNotMatch(body, /scp1\.|sca1\.|sch1\.|SAR1|Bearer|credential|token/i, 'no secret-shaped or credential content');
  assert.match(block, /送信するまで何も送られません/);
  assert.doesNotMatch(block, /<script|onclick|fetch\(/, 'plain link; no new request path');
});

test('support styles stay subdued and keep a visible focus ring', () => {
  const css = read('./style.css');
  assert.match(css, /\.sync-center-support \{[^}]*color: var\(--port-muted\)/);
  assert.match(css, /\.sync-center-support-link:focus-visible \{ outline: 2px solid var\(--port-gold-bright\)/);
});
