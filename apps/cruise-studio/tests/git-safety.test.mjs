import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSafety, releasedBoundaryViolations, owner, readGit } from '../scripts/git-safety.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const file = 'apps/cruise-studio/tests/example.test.mjs';
const id = 'a'.repeat(40), next = 'b'.repeat(40);
const change = (path, patch = {}) => ({ path, staged: false, unstaged: true, untracked: false, directory: false, signature: 'original', ...patch });
const snapshot = (changes = []) => ({ version: 1, root: '/fixture', branch: 'main', head: id, originMain: id, changes });
function check(baseline, current, options = {}) {
    return evaluateSafety({ baseline, current, allowedFiles: [file], remoteHead: id, ...options });
}
function rejects(result, code) { assert(!result.ok); assert(result.failures.some(x => x.code === code), JSON.stringify(result)); }

test('clean development passes; functional boundary has an independent owner', () => {
    assert(check(snapshot(), snapshot()).ok);
    assert.deepEqual(releasedBoundaryViolations([]), []);
});
test('NEWS tracked and new file dirty are protected, not a functional failure', () => {
    const news = [change('workers/sound-cruise-news/src/any-new-feature.js'), change('workers/sound-cruise-news/test/future.test.js', { untracked: true, unstaged: false })];
    const baseline = snapshot(news), before = JSON.stringify(baseline);
    assert.deepEqual(releasedBoundaryViolations(news), []);
    assert(check(baseline, snapshot([...news, change(file)])).ok);
    assert.equal(JSON.stringify(baseline), before);
});
for (const path of ['apps/cruise-port/x.js', 'apps/shared/x.js', 'workers/sound-cruise-sync/x.js', 'root-config.json'])
    test('protected dependency detected: ' + path, () => {
        assert.deepEqual(releasedBoundaryViolations([change(path)]), [path]);
        rejects(check(snapshot(), snapshot([change(path)])), 'unexpected-owner-change');
    });
test('unexpected Studio file detected even though functional suite is scope independent', () => {
    rejects(check(snapshot(), snapshot([change('apps/cruise-studio/js/app.js')])), 'unexpected-studio-change');
});
test('preexisting Studio difference cannot be adopted as this task', () => {
    rejects(check(snapshot([change(file)]), snapshot([change(file)])), 'preexisting-studio-change');
});
for (const patch of [null, { signature: 'changed' }, { staged: true }, { unstaged: false }])
    test('NEWS disappearance/content/index/status drift rejects ' + JSON.stringify(patch), () => {
        const n = change('workers/sound-cruise-news/x.js');
        rejects(check(snapshot([n]), snapshot(patch ? [{ ...n, ...patch }] : [])), 'parallel-change-drift');
    });
test('new NEWS work after baseline requires stopping and remeasurement', () => {
    rejects(check(snapshot(), snapshot([change('workers/sound-cruise-news/new.js')])), 'unexpected-owner-change');
});
test('NEWS staged contamination rejects even with original content', () => {
    const n = change('workers/sound-cruise-news/x.js', { staged: true });
    rejects(check(snapshot(), snapshot([n])), 'unrelated-staged');
    rejects(check(snapshot([n]), snapshot([n])), 'baseline-staged');
});
test('cross-owner rename checks both old and new paths', () => {
    const c = change(file, { previousPath: 'workers/sound-cruise-news/x.js', staged: true });
    rejects(check(snapshot(), snapshot([c])), 'unexpected-owner-change');
    rejects(check(snapshot(), snapshot([c])), 'unrelated-staged');
});
test('known preexisting tooling directories kept as inventory; new unknown directory rejects', () => {
    const d = change('.claude/', { untracked: true, directory: true, unstaged: false });
    assert(check(snapshot([d]), snapshot([d])).ok);
    rejects(check(snapshot([change('apps/shared/new/', { untracked: true, directory: true })]), snapshot()), 'unknown-baseline-owner');
    rejects(check(snapshot([d]), snapshot([d, change('elsewhere/', { untracked: true, directory: true })])), 'unexpected-owner-change');
});
test('exact individually staged Studio change passes commit; partial/new unstaged fails', () => {
    const staged = change(file, { staged: true, unstaged: false });
    assert(check(snapshot(), snapshot([staged]), { phase: 'commit' }).ok);
    for (const c of [change(file), change(file, { staged: true }), change(file, { untracked: true })])
        rejects(check(snapshot(), snapshot([c]), { phase: 'commit' }), 'index-not-exact');
    rejects(check(snapshot(), snapshot(), { phase: 'commit' }), 'index-not-exact');
});
for (const remote of [undefined, '', 'bad', next]) test('fresh remote mismatch rejects: ' + remote, () => {
    rejects(check(snapshot(), snapshot([change(file, { staged: true, unstaged: false })]), { phase: 'commit', remoteHead: remote }), 'remote-mismatch');
});
test('remote agrees with origin but differs from HEAD also stops', () => {
    rejects(check(snapshot(), { ...snapshot(), originMain: next }, { phase: 'commit', remoteHead: next }), 'remote-divergence');
});
test('intervening linear NEWS commit may be reviewed only with ancestry, scope and remote agreement', () => {
    const current = { ...snapshot(), head: next, originMain: next,
        history: { ancestor: true, commits: [{ parents: [id], files: ['workers/sound-cruise-news/new.js'] }] } };
    assert(check(snapshot(), current, { remoteHead: next }).ok);
    for (const history of [null, { ancestor: false, commits: [] }, { ancestor: true, commits: [{ parents: [id, next], files: [] }] },
        { ancestor: true, commits: [{ parents: [id], files: ['apps/shared/x.js'] }] }])
        rejects(check(snapshot(), { ...current, history }), 'unreviewed-head-change');
});
test('postcommit/push require direct parent, Studio-only commit, empty index and remote parent', () => {
    const c = { ...snapshot(), head: next, parent: id, commitFiles: [file] };
    for (const phase of ['postcommit', 'push']) {
        assert(check(snapshot(), c, { phase, commitBase: id }).ok);
        rejects(check(snapshot(), { ...c, parent: next }, { phase, commitBase: id }), 'not-direct-child');
        rejects(check(snapshot(), { ...c, commitFiles: ['workers/sound-cruise-news/x.js'] }, { phase, commitBase: id }), 'commit-scope');
        rejects(check(snapshot(), { ...c, changes: [change(file)] }, { phase, commitBase: id }), 'postcommit-dirty');
    }
});
test('release gate retains entire-repository clean including NEWS and known untracked tools', () => {
    assert(evaluateSafety({ current: snapshot(), phase: 'release' }).ok);
    for (const c of [change(file), change('workers/sound-cruise-news/x.js'), change('.claude/', { untracked: true, directory: true })])
        rejects(evaluateSafety({ current: snapshot([c]), phase: 'release' }), 'repository-not-clean');
});
test('intent cannot authorize another owner, duplicate, traversal or an empty list', () => {
    for (const allowedFiles of [[], [file, file], ['workers/sound-cruise-news/x.js'], ['apps/cruise-studio/../../x']])
        rejects(check(snapshot(), snapshot(), { allowedFiles }), 'invalid-intent');
    assert.equal(owner('apps/cruise-studio-other/x'), 'protected');
});
test('invalid phase, baseline and repository identity fail closed', () => {
    rejects(check(snapshot(), snapshot(), { phase: 'typo' }), 'invalid-phase');
    rejects(check({ ...snapshot(), version: 2 }, snapshot()), 'invalid-baseline');
    rejects(check(snapshot(), { ...snapshot(), root: '/other' }), 'invalid-baseline');
    rejects(check(snapshot(), { ...snapshot(), branch: 'unrelated' }), 'branch-mismatch');
});
test('actual Git reader keeps NEWS hashes and detects rename/index changes in a disposable fixture', () => {
    const root = mkdtempSync(join(tmpdir(), 'studio-git-fixture-'));
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
    const put = (p, value) => { mkdirSync(join(root, p, '..'), { recursive: true }); writeFileSync(join(root, p), value); };
    const n = 'workers/sound-cruise-news/example.js';
    try {
        git('init', '--initial-branch=main');
        for (const p of [file, n]) { put(p, 'fixture\n'); git('add', '--', p); }
        git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Fixture baseline');
        git('update-ref', 'refs/remotes/origin/main', git('rev-parse', 'HEAD').trim());
        assert.equal(readGit(root).changes.length, 0);
        put(n, 'parallel NEWS draft\n');
        put('workers/sound-cruise-news/new/feature.js', 'untracked fixture\n');
        const baseline = readGit(root), before = JSON.stringify(baseline);
        assert.deepEqual(releasedBoundaryViolations(baseline.changes), []);
        // Run the actual metadata functional suite with its read-only Git query pointed at
        // this NEWS-dirty fixture; musical/source inputs still come from the formal repository.
        const childEnv = { ...process.env, GIT_DIR: join(root, '.git'), GIT_WORK_TREE: root };
        delete childEnv.NODE_TEST_CONTEXT;
        const functional = execFileSync(process.execPath, ['--test', fileURLToPath(new URL('./feature-metadata.test.mjs', import.meta.url))], {
            encoding: 'utf8', env: childEnv
        });
        assert.match(functional, /(?:fail|not ok) 0/);
        assert.equal(JSON.stringify(readGit(root)), before);
        put(file, 'Studio draft\n');
        const newFile = 'apps/cruise-studio/scripts/new.mjs';
        put(newFile, 'fixture\n');
        assert(readGit(root).changes.some(c => c.path === newFile && c.untracked));
        rejects(evaluateSafety({ baseline, current: readGit(root), allowedFiles: [file] }), 'unexpected-studio-change');
        rmSync(join(root, newFile));
        assert(evaluateSafety({ baseline, current: readGit(root), allowedFiles: [file] }).ok);
        assert.equal(JSON.stringify(readGit(root).changes.filter(c => owner(c.path) === 'news')),
            JSON.stringify(baseline.changes));
        git('add', '--', file);
        assert(evaluateSafety({ baseline, current: readGit(root), allowedFiles: [file], phase: 'commit', remoteHead: baseline.head }).ok);
        put('workers/sound-cruise-news/new/feature.js', 'changed later\n');
        rejects(evaluateSafety({ baseline, current: readGit(root), allowedFiles: [file] }), 'parallel-change-drift');
        assert.equal(JSON.stringify(baseline), before);
        renameSync(join(root, n), join(root, 'workers/sound-cruise-news/renamed.js'));
        git('add', '--', n, 'workers/sound-cruise-news/renamed.js');
        const staged = readGit(root).changes.filter(c => c.staged && owner(c.path) === 'news');
        assert(staged.length); // reader consumes NUL-separated rename source paths correctly
        rejects(evaluateSafety({ baseline, current: readGit(root), allowedFiles: [file] }), 'unrelated-staged');
        rejects(evaluateSafety({ current: readGit(root), phase: 'release' }), 'repository-not-clean');
    } finally { rmSync(root, { recursive: true, force: true }); }
});
