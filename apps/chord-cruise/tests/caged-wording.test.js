const assert = require('assert');
const fs = require('fs');
const path = require('path');

const exploreSource = fs.readFileSync(path.resolve(__dirname, '../js/ui/explore.js'), 'utf8');

assert(exploreSource.includes('このコードはCAGEDフォーム未対応のため、型フォームを表示していません。'), 'qualityKey null uses user-facing CAGED wording');
assert(!exploreSource.includes('このコードは品質が辞書と完全一致しないため、型フォームを表示していません。'), 'internal dictionary wording is removed');
assert(exploreSource.includes('このコードは現在、全体表示のみ対応しています。'), 'whole-fretboard fallback wording remains');
assert(exploreSource.includes('このフォームは現在の表示範囲に収まらないため、全体表示にしています。'), 'out-of-range wording remains');
assert(exploreSource.includes('運指は未定義です。保存で編集できます。'), 'undefined fingering wording remains');
assert(exploreSource.includes("type === 'undefined' ? '運指未定義' : '⚠️ 運指'"), 'warning wording remains separate from undefined fingering');

console.log('caged-wording: user-facing fallback wording updated without changing existing notices OK');
