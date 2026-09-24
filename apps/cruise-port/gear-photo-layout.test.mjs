import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Only the 1-column list enlarges its square thumbnail; 2–4 columns keep the full-width square.
const css = readFileSync(new URL('./style.css', import.meta.url), 'utf8');

test('1-column gear photos are a larger square that scales with the viewport', () => {
  assert.match(css, /\.gear-list-items\[data-columns="1"\] \.gear-card-photo \{ width: clamp\(84px, 26vw, 108px\); height: clamp\(84px, 26vw, 108px\); \}/);
  assert.match(css, /\.gear-card-photo \{\s*width: 84px;\s*height: 84px;\s*float: left;/, 'the base size remains the 84px fallback');
});

test('2–4 column gear photos keep their full-width square layout', () => {
  assert.match(css, /\.gear-list-items\[data-columns="2"\] \.gear-card-photo,\s*\.gear-list-items\[data-columns="3"\] \.gear-card-photo,\s*\.gear-list-items\[data-columns="4"\] \.gear-card-photo \{ float: none; display: block; width: 100%; height: auto; aspect-ratio: 1;/);
  assert.doesNotMatch(css, /data-columns="[234]"\] \.gear-card-photo \{[^}]*clamp\(/);
});
