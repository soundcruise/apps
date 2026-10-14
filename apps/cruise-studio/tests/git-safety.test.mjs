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

// Branch/worktree creation and commits below occur ONLY in this disposable repository.
// No production repository branches, worktrees, index, remote or protected files are mutated.
test('W1 worktree contracts: real isolated main/topic checkout, policy counterexamples and integration evidence', async t => {
    const tmp = mkdtempSync(join(tmpdir(), 'studio-w1-fixture-'));
    const root = join(tmp, 'main'), studio = join(tmp, 'studio');
    mkdirSync(root);
    const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } }).trim();
    const put = (cwd, path, text) => { mkdirSync(join(cwd, path, '..'), { recursive: true }); writeFileSync(join(cwd, path), text); };
    const commit = (cwd, message) => git(cwd, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', message);
    const clone = x => structuredClone(x);
    try {
        git(root, 'init', '--initial-branch=main');
        for (const p of [file, 'workers/sound-cruise-news/example.js']) { put(root, p, 'baseline\n'); git(root, 'add', '--', p); }
        commit(root, 'Fixture base');
        const base = git(root, 'rev-parse', 'HEAD');
        git(root, 'remote', 'add', 'origin', join(tmp, 'uncontacted-origin.git'));
        git(root, 'update-ref', 'refs/remotes/origin/main', base);
        git(root, 'worktree', 'add', '-b', 'codex/studio-w1', studio, base);
        const initial = readGit(studio);
        const registration = (mode, rootPath, branch) => ({ version: 1, mode, root: rootPath, commonDir: initial.commonDir,
            branch, baseSha: base, remote: 'origin', remoteFetchUrl: initial.remote.fetchUrl,
            remotePushUrl: initial.remote.pushUrls[0], targetRef: mode === 'topic-development' ? 'refs/heads/' + branch : 'refs/heads/main',
            ...(mode === 'topic-development' ? { expectedTopicSha: null } : {}) });
        const topic = registration('topic-development', initial.root, initial.branch);
        const topicBaseline = readGit(studio, undefined, topic);
        const mainContract = registration('main-development', readGit(root).root, 'main');
        const mainBaseline = readGit(root, undefined, mainContract);
        const observations = { main: { remote: 'origin', ref: 'refs/heads/main', sha: base },
            topic: { remote: 'origin', ref: topic.targetRef, sha: null } };
        const options = { baseline: topicBaseline, current: topicBaseline, contract: topic, allowedFiles: [file], observedRemote: observations };
        const run = patch => evaluateSafety({ ...options, ...patch });
        await t.test('1 registered main normal and 2 main remote divergence', () => {
            const opts = { baseline: mainBaseline, current: mainBaseline, contract: mainContract, allowedFiles: [file], observedRemote: observations };
            assert(evaluateSafety(opts).ok);
            rejects(evaluateSafety({ ...opts, phase: 'commit', observedRemote: { main: { ...observations.main, sha: next } } }), 'remote-mismatch');
        });
        await t.test('3 registered topic starts at known base', () => assert(run().ok));
        put(root, 'workers/sound-cruise-news/example.js', 'parallel NEWS draft\n');
        put(root, 'workers/sound-cruise-news/new.js', 'parallel new NEWS\n');
        const newsBefore = JSON.stringify(readGit(root).changes);
        await t.test('8 other-worktree NEWS dirty never enters Studio snapshot', () => {
            const current = readGit(studio, topicBaseline.head, topic);
            assert.deepEqual(current.changes, []); assert(run({ current }).ok);
        });
        await t.test('actual feature-metadata boundary runs against linked topic Git directory', () => {
            const env = { ...process.env, GIT_DIR: git(studio, 'rev-parse', '--absolute-git-dir'), GIT_WORK_TREE: studio, GIT_OPTIONAL_LOCKS: '0' };
            delete env.NODE_TEST_CONTEXT;
            const output = execFileSync(process.execPath, ['--test', fileURLToPath(new URL('./feature-metadata.test.mjs', import.meta.url))], { env, encoding: 'utf8' });
            assert.match(output, /(?:fail|not ok) 0/);
            assert.equal(JSON.stringify(readGit(root).changes), newsBefore);
        });
        put(studio, file, 'Studio W1 draft\n');
        await t.test('9 same-worktree NEWS/unknown dirty is rejected', () => {
            put(studio, 'workers/sound-cruise-news/local.js', 'unexpected\n');
            rejects(run({ current: readGit(studio, base, topic) }), 'unexpected-owner-change');
            rmSync(join(studio, 'workers/sound-cruise-news/local.js'));
        });
        git(studio, 'add', '--', file);
        const staged = readGit(studio, base, topic);
        await t.test('4 topic commit works without requiring HEAD equals changing main', () => {
            assert(run({ current: staged, phase: 'commit' }).ok);
            const advance = clone(staged); advance.originMain = next;
            const r = run({ current: advance, phase: 'commit' }); assert(r.ok); assert.equal(r.notices[0].code, 'remote-main-advanced');
        });
        commit(studio, 'Fixture Studio change');
        const current = readGit(studio, base, topic), topicHead = current.head;
        const request = { remote: 'origin', sourceRef: 'refs/heads/' + topic.branch, sourceSha: topicHead, targetRef: topic.targetRef, force: false };
        const pub = { current, phase: 'push', pushRequest: request };
        await t.test('5 topic postcommit and first publication exact ref pass', () => {
            assert(run({ current, phase: 'postcommit', commitBase: base }).ok); assert(run(pub).ok);
        });
        await t.test('6 unexpected remote topic update rejects; observations are mandatory', () => {
            rejects(run({ ...pub, observedRemote: { ...observations, topic: { ...observations.topic, sha: topicHead } } }), 'remote-topic-mismatch');
            rejects(run({ ...pub, observedRemote: undefined }), 'remote-topic-mismatch');
        });
        await t.test('7 main advance permits local work/topic publication but never implicitly integrates', () => {
            const advanced = { main: { ...observations.main, sha: next }, topic: observations.topic };
            assert(run({ current, observedRemote: advanced }).ok);
            const r = run({ ...pub, observedRemote: advanced }); assert(r.ok); assert(r.notices.length);
            rejects(run({ ...pub, contract: { ...topic, mode: 'main-integration', targetRef: 'refs/heads/main' } }), 'integration-not-approved');
        });
        const negatives = [
            ['10 staged NEWS contamination', 'unrelated-staged', o => o.current.changes.push(change('workers/sound-cruise-news/x.js', { staged: true, unstaged: false }))],
            ['11 shared file', 'unexpected-owner-change', o => o.current.changes.push(change('apps/shared/x.js'))],
            ['12 duplicate branch ownership', 'branch-ownership', o => o.current.worktrees.push({ root: '/other', branch: 'refs/heads/' + topic.branch, prunable: false })],
            ['13 base mismatch', 'base-mismatch', o => o.contract.baseSha = next],
            ['14 root mismatch', 'worktree-root-mismatch', o => o.contract.root = '/other'],
            ['15 incorrect registered ref', 'remote-ref-mismatch', o => o.contract.targetRef = 'refs/heads/codex/unregistered'],
            ['16 topic main push', 'push-destination-mismatch', o => o.pushRequest.targetRef = 'refs/heads/main'],
            ['wrong remote', 'push-destination-mismatch', o => o.pushRequest.remote = 'elsewhere'],
            ['wrong source ref', 'push-destination-mismatch', o => o.pushRequest.sourceRef = 'refs/heads/main'],
            ['stale source SHA', 'push-destination-mismatch', o => o.pushRequest.sourceSha = base],
            ['force request', 'push-destination-mismatch', o => o.pushRequest.force = true],
            ['unknown mode', 'invalid-contract', o => o.contract.mode = 'anything'],
            ['branch changed', 'branch-mismatch', o => o.current.branch = 'codex/other'],
            ['common directory changed', 'common-directory-mismatch', o => o.current.commonDir = '/other/.git'],
            ['remote URL changed', 'remote-identity-mismatch', o => o.current.remote.pushUrls = ['/elsewhere']],
            ['multiple push URLs', 'remote-identity-mismatch', o => o.current.remote.pushUrls.push('/elsewhere')],
            ['merge/rebase operation pending', 'git-operation-pending', o => o.current.operationPending = true],
            ['base not a commit', 'base-mismatch', o => o.current.base.exists = false],
            ['lost checkpoint ancestry', 'topic-checkpoint-divergence', o => o.current.history.ancestor = false],
            ['forbidden file in committed history', 'topic-history-scope', o => o.current.base.history.commits[0].files.push('apps/shared/x.js')],
            ['unreviewed merge in topic history', 'topic-history-scope', o => o.current.base.history.commits[0].parents.push(next)],
            ['cross-owner rename', 'unrelated-staged', o => o.current.changes.push(change(file, { staged: true, previousPath: 'apps/shared/x.js' }))],
            ['missing fresh main observation', 'remote-main-observation-missing', o => delete o.observedRemote.main],
            ['unknown target observation ref', 'remote-topic-mismatch', o => o.observedRemote.topic.ref = 'refs/heads/main']
        ];
        for (const [name, code, mutate] of negatives) await t.test(name, () => {
            const opts = clone({ ...options, ...pub }); mutate(opts); rejects(evaluateSafety(opts), code);
        });
        await t.test('existing topic remote must equal expected SHA and be ancestor', () => {
            const c = { ...topic, expectedTopicSha: base }, now = readGit(studio, base, c);
            const o = { main: observations.main, topic: { ...observations.topic, sha: base } };
            assert(run({ contract: c, current: now, phase: 'push', observedRemote: o, pushRequest: request }).ok);
            const broken = clone(now); broken.publicationBase.ancestor = false;
            rejects(run({ contract: c, current: broken, phase: 'push', observedRemote: o, pushRequest: request }), 'publication-not-fast-forward');
        });
        await t.test('18 release remains entire current-worktree clean, including approved originals', () => {
            assert(run({ current, phase: 'release' }).ok);
            const dirty = clone(current); dirty.changes.push(change('.claude/', { untracked: true, directory: true }));
            rejects(run({ current: dirty, phase: 'release' }), 'repository-not-clean');
        });
        await t.test('20 raw untracked original preservation checks content/state and cannot overlap intent', () => {
            const path = 'apps/cruise-studio/_proto/integrated-score/index.html';
            put(root, path, 'readonly mock original\n');
            const raw = readGit(root, undefined, mainContract), entry = raw.changes.find(x => x.path === path);
            const c = { ...mainContract, preservedUntracked: [{ path, sha256: entry.signature }] };
            const opts = { baseline: raw, current: clone(raw), contract: c, allowedFiles: [file] };
            const before = JSON.stringify(raw); assert(evaluateSafety(opts).ok); assert.equal(JSON.stringify(raw), before);
            for (const patch of [{ signature: '0'.repeat(64) }, { staged: true, untracked: false }, { untracked: false }]) {
                const now = clone(raw); Object.assign(now.changes.find(x => x.path === path), patch);
                rejects(evaluateSafety({ ...opts, current: now }), 'preserved-original-changed');
            }
            rejects(evaluateSafety({ ...opts, allowedFiles: [file, path] }), 'invalid-preservation');
            rejects(evaluateSafety({ ...opts, phase: 'release', observedRemote: observations }), 'repository-not-clean');
            rejects(evaluateSafety({ ...opts, contract: { ...mainContract } }), 'preexisting-studio-change');
            assert.equal(readGit(root).changes.find(x => x.path === path).signature, entry.signature);
            rmSync(join(root, path));
        });
        // Build reviewed merge evidence with commit-tree, never run merge or checkout.
        const tree = git(studio, 'rev-parse', 'HEAD^{tree}');
        const merged = git(studio, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
            'commit-tree', tree, '-p', base, '-p', topicHead, '-m', 'Reviewed fixture integration');
        git(studio, 'update-ref', 'refs/heads/' + topic.branch, merged, topicHead);
        const integration = { ...topic, mode: 'main-integration', targetRef: 'refs/heads/main',
            integrationApproval: { approvalId: 'fixture-human-review', baseSha: base, topicSha: topicHead, topicBaseSha: base, headSha: merged } };
        const integrated = readGit(studio, base, integration);
        const integrate = { baseline: topicBaseline, current: integrated, contract: integration, allowedFiles: [file], phase: 'push',
            observedRemote: observations, pushRequest: { ...request, sourceSha: merged, targetRef: 'refs/heads/main' } };
        await t.test('17 only explicit exact reviewed integration result can target main', () => {
            assert(evaluateSafety(integrate).ok, JSON.stringify(evaluateSafety(integrate)));
            rejects(evaluateSafety({ ...integrate, contract: { ...integration, integrationApproval: undefined } }), 'integration-not-approved');
            rejects(evaluateSafety({ ...integrate, phase: 'development' }), 'integration-review-only');
            rejects(evaluateSafety({ ...integrate, observedRemote: { main: { ...observations.main, sha: next } } }), 'remote-main-mismatch');
            const wrong = clone(integrate); wrong.contract.integrationApproval.headSha = topicHead;
            rejects(evaluateSafety(wrong), 'integration-not-approved');
        });
        await t.test('other-worktree NEWS bytes/status survive all fixture operations', () => {
            assert.equal(JSON.stringify(readGit(root).changes), newsBefore);
        });
    } finally { rmSync(tmp, { recursive: true, force: true }); }
});
