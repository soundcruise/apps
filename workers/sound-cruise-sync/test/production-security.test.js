import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const sourceDirectory = path.join(import.meta.dirname, '../src');
const sources = fs.readdirSync(sourceDirectory)
  .filter((name) => name.endsWith('.js'))
  .map((name) => ({ name, source: fs.readFileSync(path.join(sourceDirectory, name), 'utf8') }));

test('production Worker source has no application logging surface for secrets or user payloads', () => {
  for (const file of sources) {
    assert.equal(/\bconsole\s*\./u.test(file.source), false, `${file.name} must not log request or secret material`);
  }
});

test('production source and config contain no Pilot asset or runtime injection path', () => {
  const combined = sources.map((file) => file.source).join('\n');
  const config = fs.readFileSync(path.join(import.meta.dirname, '../wrangler.jsonc'), 'utf8');
  assert.equal(combined.includes('PILOT_ASSETS'), false);
  assert.equal(combined.includes('/pilot/'), false);
  assert.equal(config.includes('PILOT_ASSETS'), false);
  assert.equal(config.includes('/pilot/'), false);
});
