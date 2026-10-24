import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const source = read('pro-gate-help.js');
const expected = 'https://www.youtube.com/post/UgkxGGd0QKGyDd3-mMWvhusmK4ZvqmH8I6Er';
const entries = [
    '../pitch-cruise/pro_x9v7q2m8/index.html',
    '../fretboard_cruise/pro_a9f4k7q2m8z/index.html',
    '../rhythm-cruise/pro_r4m8k7n2q9x/index.html',
    '../chord-cruise/pro_k7m4q9v2x8/index.html',
    '../cruise-port/pro_9a3943176561/index.html'
];

function fixture(clipboard = { async writeText() {} }, pathname = '/apps/cruise-port/pro_9a3943176561/') {
    const listeners = new Map();
    const summary = { focused: false, focus() { this.focused = true; } };
    const input = { focused: false, selected: false, focus() { this.focused = true; }, select() { this.selected = true; } };
    Object.defineProperty(input, 'value', { get() { throw Error('Copy must never read an input'); } });
    const manual = { hidden: true, querySelector: () => input };
    const status = { textContent: '' };
    const content = { querySelector: selector => selector.includes('status') ? status : manual };
    const button = { disabled: false, closest: () => content,
        addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(handler); } };
    const details = { open: true, listeners: new Map(), querySelector: () => summary,
        addEventListener(type, handler) { this.listeners.set(type, handler); } };
    const guide = { hidden: true, listeners: new Map(), addEventListener(type, handler) { this.listeners.set(type, handler); } };
    const toggle = { attrs: { 'aria-expanded': 'false' }, focused: false, listeners: new Map(),
        setAttribute(name, value) { this.attrs[name] = value; }, focus() { this.focused = true; },
        addEventListener(type, handler) { this.listeners.set(type, handler); } };
    const container = { querySelector: () => guide,
        querySelectorAll: selector => selector.startsWith('details') ? [details] : selector.includes('number-toggle') ? [toggle] : [button] };
    const location = { pathname };
    for (const name of ['search', 'hash', 'href']) {
        Object.defineProperty(location, name, { get() { throw Error('Mail must not read URL data'); } });
    }
    const window = { navigator: clipboard ? { clipboard } : {}, location };
    for (const name of ['localStorage', 'fetch', 'SoundCruiseProDeviceSession']) {
        Object.defineProperty(window, name, { get() { throw Error('Help must not access authentication or network'); } });
    }
    vm.runInNewContext(source, { window, URL });
    window.SoundCruiseProPostHelp.bind(container);
    return { help: window.SoundCruiseProPostHelp, button, manual, input, status, details, summary, container, toggle, guide,
        async copy() { for (const listener of listeners.get('click')) await listener(); }, listeners };
}

test('all five primary actions open shared guidance instead of navigating directly to YouTube', () => {
    const { help } = fixture();
    assert.equal(help.POST_URL, expected);
    const markup = help.primaryLinkMarkup();
    assert.match(markup, /<button type="button"[^>]+data-pro-number-toggle/);
    assert.match(markup, /aria-expanded="false" aria-controls="pro-number-guide">番号はこちら<\/button>/);
    assert.doesNotMatch(markup, /href=|target=|youtube/);
    assert.equal((source.match(/https:\/\/www.youtube.com\/post\//g) || []).length, 1);
    assert.doesNotMatch(source, /m\.youtube|youtu\.be|window\.open|location\.replace|location\.href\s*=/);
    for (const entry of entries) {
        const html = read(entry);
        assert.ok(html.includes('pro-gate-help.js?v=4'), entry);
        assert.ok(html.indexOf('pro-gate-help.js?v=4') < html.indexOf('pro-gate.js?v=33'), entry);
        assert.doesNotMatch(html, /youtube\.com\/post\//, 'gate entries delegate to the shared definition');
    }
    const gate = read('pro-gate.js');
    assert.match(gate, /SoundCruiseProPostHelp\?\.primaryLinkMarkup\(\)/);
    assert.match(gate, /SoundCruiseProPostHelp\?\.helpMarkup\(\)/);
    assert.doesNotMatch(gate, /troubleshootHref|youtube\.com\/post\//);
});

test('all five app paths produce only the requested encoded contact template at the end of troubleshooting', () => {
    const names = ['音感クルーズ', '指板クルーズ', 'リズムクルーズ', 'コードクルーズ', 'Cruise Port'];
    for (const [index, entry] of entries.entries()) {
        const pathname = '/apps/' + entry.slice(3).replace('index.html', '');
        const markup = fixture(undefined, pathname).help.helpMarkup();
        const contact = markup.slice(markup.indexOf('<div class="pro-number-contact">'));
        assert.match(contact, /それでも番号が確認できない場合/);
        assert.match(contact, /メールで問い合わせる ↗<\/a>/);
        assert.match(contact, /<p class="pro-number-contact-address">soundcruise.inc@gmail.com<\/p>/);
        assert.ok(contact.endsWith('</div></div></details></div></section>'), 'contact is the final troubleshooting content');
        assert.ok(markup.indexOf('投稿URLは、ブラウザのアドレス欄へ直接貼り付けてください。') < markup.indexOf(contact));
        const href = contact.match(/href="([^"]+)"/)[1].replaceAll('&amp;', '&');
        assert.doesNotMatch(href, /[\u3000-\uffff\r\n]/, 'Japanese and newlines are encoded');
        const mailto = new URL(href);
        assert.equal(mailto.protocol, 'mailto:');
        assert.equal(mailto.pathname, 'soundcruise.inc@gmail.com');
        assert.equal(mailto.searchParams.get('subject'), 'アプリの4桁番号について');
        assert.equal(mailto.searchParams.get('body'), 'アプリ名：' + names[index] + '\r\n利用端末：\r\n困っている手順・状況：');
        assert.deepEqual([...mailto.searchParams.keys()], ['subject', 'body'], 'no other data included');
        assert.equal((markup.match(/mailto:/g) || []).length, 1);
    }
});

test('contact app identity is an allowlisted name, including standalone help, never arbitrary path data', () => {
    for (const path of ['/apps/pitch-cruise/pro_x9v7q2m8/troubleshoot.html', '/apps/fretboard_cruise/pro_a9f4k7q2m8z/troubleshoot.html']) {
        const markup = fixture(undefined, path).help.helpMarkup();
        const body = new URL(markup.match(/href="(mailto:[^"]+)"/)[1].replaceAll('&amp;', '&')).searchParams.get('body');
        assert.ok(body.startsWith('アプリ名：' + (path.includes('pitch-cruise') ? '音感クルーズ' : '指板クルーズ')));
    }
    const markup = fixture(undefined, '/apps/<script>alert(1)</script>/').help.helpMarkup();
    const href = markup.match(/href="(mailto:[^"]+)"/)[1].replaceAll('&amp;', '&');
    assert.ok(new URL(href).searchParams.get('body').startsWith('アプリ名：Cruise apps\r\n'));
    assert.doesNotMatch(markup, /<script>|alert\(1\)/);
});

test('contact styling supports touch, visible keyboard focus and selectable readable address', () => {
    const css = read('pro-gate.css');
    assert.match(css, /\.pro-post-help-content \.pro-number-contact-button\s*\{[^}]*min-height: 44px;[^}]*max-width: 100%;/);
    assert.match(css, /\.pro-number-contact-button:focus-visible/);
    assert.match(css, /\.pro-number-contact \.pro-number-contact-address\s*\{[^}]*font-size: 0\.75rem;[^}]*user-select: text;[^}]*overflow-wrap: anywhere;/);
    assert.doesNotMatch(source, /userAgent|deviceId|accountId|sessionToken|sendBeacon|XMLHttpRequest/);
    for (const path of ['../pitch-cruise/standard/index.html', '../fretboard_cruise/standard/index.html', '../rhythm-cruise/standard/index.html', '../chord-cruise/standard/index.html', '../cruise-port/index.html']) {
        assert.doesNotMatch(read(path), /shared\/pro-gate\.js\?/, 'Standard does not load the Pro gate');
    }
});

test('the shared basic guide has exactly three steps and detailed troubleshooting starts collapsed', () => {
    const markup = fixture().help.helpMarkup();
    assert.match(markup, /data-pro-number-guide hidden/);
    assert.doesNotMatch(markup, /番号の確認方法|<h[12]|aria-labelledby/);
    assert.equal((markup.match(/<li(?:\s[^>]*)?>/g) || []).length, 3);
    assert.match(markup, /<li class="pro-number-copy-step"><button[^>]+>1\. ここをタップしてURLをコピー<\/button>/);
    assert.equal((markup.match(/<ol/g) || []).length, 1);
    assert.equal((markup.match(/data-pro-post-copy/g) || []).length, 1);
    const basic = markup.slice(0, markup.indexOf('<details'));
    assert.match(basic, /Safari \/ Chromeなどのブラウザを開く/);
    assert.match(basic, /アドレス欄に貼り付けて投稿を見る/);
    assert.doesNotMatch(basic, /Googleアカウント|ログイン|YouTubeアプリ/);
    assert.match(markup, /<details[^>]+><summary>うまく見られない場合<\/summary>/);
    assert.doesNotMatch(markup.match(/<details[^>]+>/)[0], /\bopen\b/);
    assert.match(markup, /メンバーシップに登録しているGoogleアカウント/);
    assert.match(markup, /別のアカウントの場合は、メンバーアカウントへ切り替えて/);
    assert.match(markup, /readonly aria-label="投稿URL"/);
    assert.doesNotMatch(markup, /YouTubeアプリで開く|scp1\.|token|credential|パスワードはこちら/);
    assert.doesNotMatch(source, /localStorage|fetch\(|pro-auth|cookie|passcode/);
});

test('the Number button toggles its guide in place without navigation or moving focus', () => {
    const f = fixture();
    f.toggle.listeners.get('click')();
    assert.equal(f.guide.hidden, false);
    assert.equal(f.toggle.attrs['aria-expanded'], 'true');
    assert.equal(f.toggle.focused, false);
    f.toggle.listeners.get('click')();
    assert.equal(f.guide.hidden, true);
    assert.equal(f.toggle.attrs['aria-expanded'], 'false');
});

test('Escape closes the guide and returns focus without overriding nested troubleshooting', () => {
    const f = fixture();
    f.guide.hidden = false;
    f.guide.listeners.get('keydown')({ key: 'Escape', defaultPrevented: true });
    assert.equal(f.guide.hidden, false);
    let prevented = false;
    f.guide.listeners.get('keydown')({ key: 'Escape', preventDefault() { prevented = true; } });
    assert.equal(f.guide.hidden, true);
    assert.equal(f.toggle.attrs['aria-expanded'], 'false');
    assert.equal(f.toggle.focused, true);
    assert.equal(prevented, true);
});

test('Pitch and Fretboard reuse their existing URLs with one shared page body', () => {
    const pitch = read('../pitch-cruise/pro_x9v7q2m8/troubleshoot.html');
    const fretboard = read('../fretboard_cruise/pro_a9f4k7q2m8z/troubleshoot.html');
    assert.equal(pitch, fretboard);
    assert.match(pitch, /data-pro-post-help-page/);
    assert.match(pitch, /shared\/pro-gate-help.js\?v=4/);
    assert.doesNotMatch(pitch, /window\.open|よくある原因|<ol>|pro-gate.js/);
    assert.ok(pitch.length < 1000, 'old duplicated instructions are replaced by shared content');
    assert.match(read('../cruise-port/pro-access-content.js'), /MEMBER_POST_URL = globalThis.SoundCruiseProPostHelp.POST_URL/);
});

test('copy always writes exactly the public post URL and has readable success feedback', async () => {
    const copied = [];
    const f = fixture({ async writeText(value) { copied.push(value); } });
    await f.copy();
    assert.deepEqual(copied, [expected]);
    assert.equal(f.status.textContent, 'コピーしました');
    assert.equal(f.manual.hidden, true);
    assert.equal(f.button.disabled, false);
});

test('clipboard rejection gives selectable read-only URL and never disrupts authentication', async () => {
    const f = fixture({ async writeText() { throw Error('Permission denied'); } });
    await f.copy();
    assert.equal(f.manual.hidden, false);
    assert.equal(f.input.focused, true);
    assert.equal(f.input.selected, true);
    assert.match(f.status.textContent, /下のURLを選択/);
    assert.equal(f.button.disabled, false);
});

test('clipboard-unavailable browsers receive the same manual fallback', async () => {
    const f = fixture(null);
    await f.copy();
    assert.equal(f.manual.hidden, false);
    assert.equal(f.input.selected, true);
});

test('rebinding does not duplicate clipboard or keyboard actions', async () => {
    const copied = [];
    const f = fixture({ async writeText(value) { copied.push(value); } });
    f.help.bind(f.container);
    assert.equal(f.listeners.get('click').length, 1);
    await f.copy();
    assert.equal(copied.length, 1);
});

test('Escape collapses only open help and returns focus to its summary', () => {
    const f = fixture();
    let prevented = false;
    f.details.listeners.get('keydown')({ key: 'Escape', preventDefault() { prevented = true; } });
    assert.equal(f.details.open, false);
    assert.equal(f.summary.focused, true);
    assert.equal(prevented, true);
    assert.match(read('pro-gate.js'), /textarea, summary, \[tabindex\]/, 'the gate focus trap includes native summary');
});

test('the legacy Pitch loader also loads shared help without changing its session helper', () => {
    const legacy = read('../pitch-cruise/pro_x9v7q2m8/pro-gate-hash.js');
    assert.match(legacy, /pro-device-session.js\?v=7/);
    assert.match(legacy, /pro-gate-help.js\?v=4/);
    assert.match(legacy, /help.onerror = startGate/);
    assert.match(legacy, /pro-gate.js\?v=33/);
});
