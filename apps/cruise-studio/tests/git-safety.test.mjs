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

// All Batch objects below are created in independent repositories. These approvals/logs are
// deliberately synthetic test inputs, never production evidence or human release approval.
import { readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { evaluateBatchSafety, verifyToolingEvidence, BATCH_RELEASE_GATES } from '../scripts/git-safety.mjs';
const h256 = b => createHash('sha256').update(b).digest('hex');
const hjson = x => h256(JSON.stringify(x));
const cloneBatch = x => JSON.parse(JSON.stringify(x));
const batchScript = fileURLToPath(new URL('../scripts/git-safety.mjs', import.meta.url));
const rp = 'apps/rhythm-cruise/js/official-patterns.mjs';
const sp = 'apps/cruise-studio/js/component-metadata.mjs';
const tp = 'apps/cruise-studio/scripts/git-safety.mjs';
function batchFixture(t) {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'studio-batch-v2-'))), root = join(dir, 'repo'); mkdirSync(root);
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0' };
    for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE']) delete env[k];
    const git = (...args) => execFileSync('git', ['-C', root, ...args], { env, encoding: 'utf8' }).trim();
    git('init', '-q'); git('config', 'user.name', 'INDEPENDENT FIXTURE'); git('config', 'user.email', 'fixture@invalid.example');
    git('config', 'core.autocrlf', 'false'); git('symbolic-ref', 'HEAD', 'refs/heads/codex/batch-fixture');
    const url = 'https://fixture.invalid/apps.git'; git('remote', 'add', 'origin', url);
    const tree = (base, changes) => {
        const index = join(dir, 'temporary-index'); rmSync(index, { force: true });
        const run = (...args) => execFileSync('git', ['-C', root, ...args], { env: { ...env, GIT_INDEX_FILE: index }, encoding: 'utf8' }).trim();
        if (base) run('read-tree', base); else run('read-tree', '--empty');
        for (const [path, value] of Object.entries(changes)) {
            if (value === null) run('update-index', '--force-remove', '--', path);
            else {
                const blob = execFileSync('git', ['-C', root, 'hash-object', '-w', '--stdin'], { env, input: value, encoding: 'utf8' }).trim();
                run('update-index', '--add', '--cacheinfo', '100644,' + blob + ',' + path);
            }
        }
        return run('write-tree');
    };
    let serial = 0;
    const commit = (tr, parents) => git('commit-tree', tr, ...parents.flatMap(p => ['-p', p]), '-m', 'FIXTURE ONLY ' + serial++);
    const m0tree = tree(null, { [rp]: 'owner old\n', [sp]: 'Studio old\n', [tp]: 'tooling old\n',
        'apps/cruise-port/app-version.js': '1.24.0\n', 'workers/sound-cruise-news/main.js': 'NEWS preserved\n' });
    const m0 = commit(m0tree, []);
    const activate = sha => {
        const old = (() => { try { return git('rev-parse', '--verify', 'HEAD'); } catch { return null; } })();
        if (old) git('read-tree', '-u', '-m', old, sha); else git('read-tree', '--reset', '-u', sha);
        git('update-ref', 'refs/heads/codex/batch-fixture', sha);
    };
    activate(m0); git('update-ref', 'refs/remotes/origin/main', m0);
    const baseline = readGit(root);
    const rt = tree(m0, { [rp]: 'official nine patterns\n' }), r = commit(rt, [m0]);
    const studioCommits = []; let last = m0;
    for (let n = 1; n <= 9; n++) { last = commit(tree(last, { [sp]: `Studio compatibility ${n}\n` }), [last]); studioCommits.push(last); }
    const s = last, st = git('rev-parse', s + '^{tree}');
    const m1 = commit(rt, [m0, r]), ft = tree(rt, { [sp]: 'Studio compatibility 9\n' }), m2 = commit(ft, [m1, s]); activate(m2);
    const c = { version: 2, mode: 'main-integration-batch', root, commonDir: realpathSync(join(root, '.git')), branch: 'codex/batch-fixture',
        remoteFetchUrl: url, remotePushUrl: url, baseSha: m0, baseTree: m0tree,
        rhythm: { sha: r, tree: rt, base: m0, ref: 'refs/heads/codex/rhythm', commits: [r], allowedFiles: [rp] },
        studio: { sha: s, tree: st, base: m0, ref: 'refs/heads/codex/studio', commits: studioCommits, allowedFiles: [sp] },
        m1: { sha: m1, tree: rt, parents: [m0, r] }, m2: { sha: m2, tree: ft, parents: [m1, s] }, finalSha: m2, finalTree: ft,
        sourcePin: { commit: r, tree: rt, path: rp, sha256: h256('official nine patterns\n') } };
    let recordIndex = 0;
    const record = data => { const path = join(dir, `record-${recordIndex++}.json`); writeFileSync(path, JSON.stringify(data)); return { path, sha256: h256(readFileSync(path)) }; };
    const logPath = join(dir, 'synthetic.log'); writeFileSync(logPath, 'SYNTHETIC FIXTURE LOG — not production acceptance\n');
    const artifact = tr => record({ sourceTree: tr, files: [{ name: 'fixture.txt', path: logPath, sha256: h256(readFileSync(logPath)) }] });
    const regression = (tr, purpose) => ({ version: 1, purpose, sourceTree: tr,
        required: purpose === 'batch-release' ? [...BATCH_RELEASE_GATES] : ['studio-node', 'studio-browser'],
        runs: (purpose === 'batch-release' ? [...BATCH_RELEASE_GATES] : ['studio-node', 'studio-browser']).map(id => ({ id, sourceTree: tr,
            command: ['node', 'fixture-only'], environment: artifact(tr), source: artifact(tr), fixture: artifact(tr),
            startedAt: '2026-01-01T00:00:00Z', endedAt: '2026-01-01T00:00:01Z', exit: 0,
            counts: { pass: 1, fail: 0, skip: 0, cancelled: 0, todo: 0 }, log: { path: logPath, sha256: h256(readFileSync(logPath)) } })),
        noWrite: purpose === 'batch-release' ? { read: 0, preview: 0, apply: 0, clear: 0, undo: 0, redo: 0, rejection: 0, sharedCanWrite: false } : null,
        performance: purpose === 'batch-release' ? [1, 2, 3].map(process => ({ process: String(process), warmup: 3, measured: 20,
            rows: [8, 32, 64, 128].flatMap(bars => ['legacy', 'shared', 'distinct', 'chord-distinct'].flatMap(scenario => [false, true].map(saved =>
                ({ bars, scenario, saved, command: Array(20).fill(10), staff: Array(20).fill(100), completed: true })))) })) : null });
    const o = { contract: c, baseline, phase: 'push', evidence: record(regression(ft, 'batch-release')),
        observedRemote: { url, observedAt: new Date().toISOString(), exit: 0, command: ['git', 'ls-remote', 'origin', 'refs/heads/main', c.rhythm.ref, c.studio.ref],
            raw: `${m0}\trefs/heads/main\n${r}\t${c.rhythm.ref}\n${s}\t${c.studio.ref}\n` },
        pushRequest: { remote: 'origin', sourceRef: 'refs/heads/' + c.branch, sourceSha: m2, targetRef: 'refs/heads/main', force: false } };
    const approve = (options = o, purpose = 'batch-release') => {
        options.approval = record({ version: 1, purpose, reference: 'INDEPENDENT TEST ONLY', contractSha256: hjson(options.contract),
            baselineSha256: hjson(options.baseline), evidenceSha256: options.evidence.sha256 });
        options.trust = { approvalSha256: options.approval.sha256 };
    };
    approve();
    const evidence = mutate => { const e = JSON.parse(readFileSync(o.evidence.path)); mutate(e); o.evidence = record(e); approve(); };
    const rebuild = (m1Parents, m2Parents, changes = {}) => {
        const one = commit(c.m1.tree, m1Parents || [c.baseSha, c.rhythm.sha]);
        const twoTree = tree(c.m2.tree, changes), two = commit(twoTree, m2Parents || [one, c.studio.sha]);
        activate(two); c.m1 = { sha: one, tree: c.m1.tree, parents: m1Parents || [c.baseSha, c.rhythm.sha] };
        c.m2 = { sha: two, tree: twoTree, parents: m2Parents || [one, c.studio.sha] }; c.finalSha = two; c.finalTree = twoTree;
        o.pushRequest.sourceSha = two; approve();
    };
    return { dir, root, git, tree, commit, activate, o, c, record, approve, evidence, rebuild, regression };
}
test('Batch v2 real graph control, CLI capture/check, index/refs/source read-only', t => {
    const f = batchFixture(t), before = f.git('show-ref'), index = h256(readFileSync(join(f.root, '.git/index')));
    assert.equal(evaluateSafety(f.o).ok, true, JSON.stringify(evaluateSafety(f.o)));
    assert.equal(evaluateSafety({ ...f.o, phase: 'release' }).ok, true);
    const plan = join(f.dir, 'plan.json'), obs = join(f.dir, 'observation.json');
    writeFileSync(plan, JSON.stringify(f.o)); writeFileSync(obs, JSON.stringify(f.o.observedRemote));
    const result = JSON.parse(execFileSync(process.execPath, [batchScript, 'check', plan, 'push', obs, f.o.trust.approvalSha256], { cwd: f.root, encoding: 'utf8' }));
    assert(result.ok, JSON.stringify(result)); assert.equal(result.publicationExecuted, false);
    const capture = JSON.parse(execFileSync(process.execPath, [batchScript, 'capture', plan], { cwd: f.root, encoding: 'utf8' })); assert.equal(capture.head, f.c.finalSha);
    assert.equal(f.git('show-ref'), before); assert.equal(h256(readFileSync(join(f.root, '.git/index'))), index); assert.equal(f.git('status', '--porcelain'), '');
});
const batchNegatives = [
    ['01 approval missing', 'trusted-approval-mismatch', f => delete f.o.approval],
    ['02 ID only', 'trusted-approval-missing', f => { f.o.approval = { approvalId: 'yes' }; delete f.o.trust; }],
    ['03 approved main SHA', 'base-mismatch', f => { f.c.baseSha = f.c.rhythm.sha; f.approve(); }],
    ['04 R3 SHA', 'owner-contract-invalid', f => { f.c.rhythm.sha = f.c.studio.sha; f.approve(); }],
    ['05 ST SHA', 'owner-contract-invalid', f => { f.c.studio.sha = f.c.rhythm.sha; f.approve(); }],
    ['06 M1 first parent', 'batch-parent-mismatch', f => f.rebuild([f.c.rhythm.sha, f.c.baseSha])],
    ['07 M1 second parent', 'batch-parent-mismatch', f => f.rebuild([f.c.baseSha, f.c.studio.sha])],
    ['08 M2 first parent', 'batch-parent-mismatch', f => f.rebuild(null, [f.c.baseSha, f.c.studio.sha])],
    ['09 M2 second parent', 'batch-parent-mismatch', f => f.rebuild(null, [f.c.m1.sha, f.c.rhythm.sha])],
    ['10 reversed M2', 'batch-parent-mismatch', f => f.rebuild(null, [f.c.studio.sha, f.c.m1.sha])],
    ['11 third parent', 'batch-parent-mismatch', f => f.rebuild([f.c.baseSha, f.c.rhythm.sha, f.c.studio.sha])],
    ['12 extra intermediate', 'batch-parent-mismatch', f => { const extra = f.commit(f.c.m1.tree, [f.c.m1.sha]); f.rebuild(null, [extra, f.c.studio.sha]); }],
    ['13 unapproved same-scope resolution', 'batch-tree-mismatch', f => f.rebuild(null, null, { [sp]: 'unapproved resolution' })],
    ['14 Rhythm scope other owner', 'owner-contract-invalid', f => { f.c.rhythm.allowedFiles.push('apps/shared/x'); f.approve(); }],
    ['15 Studio scope other owner', 'owner-contract-invalid', f => { f.c.studio.allowedFiles.push(rp); f.approve(); }],
    ['16 Shared path content', 'batch-tree-mismatch', f => f.rebuild(null, null, { 'apps/shared/x': 'bad' })],
    ['16b Port content', 'batch-tree-mismatch', f => f.rebuild(null, null, { 'apps/cruise-port/app-version.js': 'bad' })],
    ['16c NEWS content', 'batch-tree-mismatch', f => f.rebuild(null, null, { 'workers/sound-cruise-news/main.js': 'bad' })],
    ['17 rename/delete', 'batch-tree-mismatch', f => f.rebuild(null, null, { [sp]: null, 'apps/cruise-studio/renamed.js': 'renamed' })],
    ['18 absent ancestor', 'owner-base-mismatch', f => { f.c.rhythm.base = f.c.rhythm.sha; f.approve(); }],
    ['19 history merge', 'owner-history-mismatch', f => { const q = f.commit(f.c.rhythm.tree, [f.c.baseSha, f.c.studio.sha]); f.c.rhythm.sha = q; f.c.rhythm.commits = [q]; f.approve(); }],
    ['20 Final SHA', 'final-mismatch', f => { f.c.finalSha = f.c.m1.sha; f.approve(); }],
    ['21 Final tree', 'final-mismatch', f => { f.c.finalTree = f.c.baseTree; f.approve(); }],
    ['22 source pin', 'source-pin-mismatch', f => { f.c.sourcePin.sha256 = '0'.repeat(64); f.approve(); }],
    ['23 evidence missing', 'evidence-record-invalid', f => { f.o.evidence = { path: '', sha256: '0'.repeat(64) }; f.approve(); }],
    ['24 evidence wrong tree', 'evidence-source-mismatch', f => f.evidence(e => e.sourceTree = f.c.baseTree)],
    ['25 required FAIL', 'required-result-failed', f => f.evidence(e => e.runs[0].counts.fail = 1)],
    ['26 skip', 'required-result-failed', f => f.evidence(e => e.runs[0].counts.skip = 1)],
    ['26b cancelled', 'required-result-failed', f => f.evidence(e => e.runs[0].counts.cancelled = 1)],
    ['26c todo', 'required-result-failed', f => f.evidence(e => e.runs[0].counts.todo = 1)],
    ['27 performance raw p95', 'performance-failed', f => f.evidence(e => e.performance[0].rows.find(r => r.bars === 64).command.fill(16.1))],
    ['28 no-write', 'no-write-failed', f => f.evidence(e => e.noWrite.preview = 1)],
    ['29 dirty tracked', 'batch-not-clean', f => writeFileSync(join(f.root, sp), 'dirty')],
    ['30 staged', 'batch-not-clean', f => { writeFileSync(join(f.root, sp), 'dirty'); f.git('add', '--', sp); }],
    ['30b untracked', 'batch-not-clean', f => writeFileSync(join(f.root, 'unknown'), 'dirty')],
    ['31 operation pending', 'git-operation-pending', f => writeFileSync(join(f.root, '.git/MERGE_HEAD'), f.c.rhythm.sha)],
    ['32 remote main advanced', 'remote-refs-mismatch', f => f.o.observedRemote.raw = f.o.observedRemote.raw.replace(f.c.baseSha, f.c.finalSha)],
    ['33 missing fresh observation', 'fresh-observation-missing', f => delete f.o.observedRemote],
    ['34 remote URL', 'remote-identity-mismatch', f => f.git('remote', 'set-url', 'origin', 'https://changed.invalid/repo')],
    ['35 target ref', 'push-destination-mismatch', f => f.o.pushRequest.targetRef = 'refs/heads/other'],
    ['36 source SHA', 'push-destination-mismatch', f => f.o.pushRequest.sourceSha = f.c.baseSha],
    ['37 force', 'push-destination-mismatch', f => f.o.pushRequest.force = true],
    ['38 intermediate publication', 'push-destination-mismatch', f => f.o.pushRequest.sourceSha = f.c.m1.sha],
    ['39 unknown mode', 'invalid-contract', f => f.c.mode = 'something'],
    ['40 unknown version', 'invalid-contract', f => f.c.version = 99],
    ['41 legacy fallback retains v1 rejection', 'invalid-contract', f => f.c.version = 1],
    ['42 v1 single merge cannot accept batch', 'integration-not-approved', f => {
        const c = { version: 1, mode: 'main-integration', ...Object.fromEntries(['root', 'commonDir', 'branch', 'baseSha', 'remoteFetchUrl', 'remotePushUrl'].map(k => [k, f.c[k]])),
            remote: 'origin', targetRef: 'refs/heads/main', integrationApproval: { approvalId: 'fixture', baseSha: f.c.baseSha, topicSha: f.c.studio.sha, topicBaseSha: f.c.studio.base, headSha: f.c.finalSha } };
        f.o.contract = c; f.o.allowedFiles = [sp]; f.o.current = readGit(f.root, c.baseSha, c); f.o.baseline = { ...f.o.baseline, base: { sha: c.baseSha, exists: true, history: { ancestor: true, commits: [] } } };
    }],
    ['path traversal', 'owner-contract-invalid', f => { f.c.rhythm.allowedFiles = ['apps/rhythm-cruise/../shared/x']; f.approve(); }],
    ['wildcard', 'owner-contract-invalid', f => { f.c.rhythm.allowedFiles = ['apps/rhythm-cruise/*']; f.approve(); }],
    ['duplicate path', 'owner-contract-invalid', f => { f.c.rhythm.allowedFiles.push(rp); f.approve(); }],
    ['unknown field', 'invalid-contract', f => f.c.permit = true],
    ['cohort missing', 'evidence-cohort-mismatch', f => f.evidence(e => e.runs.pop())],
    ['raw log replaced', 'raw-log-invalid', f => { const e = JSON.parse(readFileSync(f.o.evidence.path)); e.runs[0].log.sha256 = '0'.repeat(64); f.o.evidence = f.record(e); f.approve(); }],
    ['fixture missing', 'batch-read-failed', f => { const e = JSON.parse(readFileSync(f.o.evidence.path)); rmSync(e.runs[0].fixture.path); }],
    ['fixture digest replaced', 'artifact-invalid', f => f.evidence(e => e.runs[0].fixture.sha256 = '0'.repeat(64))],
    ['network failed cannot mean absent ref', 'fresh-observation-missing', f => f.o.observedRemote.exit = 1],
    ['stale observation', 'fresh-observation-missing', f => f.o.observedRemote.observedAt = '2020-01-01T00:00:00Z'],
    ['U topic Composite evidence is not Final release', 'evidence-source-mismatch', f => f.evidence(e => e.purpose = 'tooling-composite')],
    ['T missing independent trust', 'trusted-approval-missing', f => delete f.o.trust],
    ['T candidate rewrites expected digest but not trust', 'trusted-approval-mismatch', f => { f.o.approval = f.record({ approved: true }); }],
    ['T wrong action', 'approval-scope-mismatch', f => f.approve(f.o, 'tooling-composite')]
];
for (const [name, code, mutate] of batchNegatives) test('Batch negative ' + name, t => {
    const f = batchFixture(t); assert(evaluateSafety(f.o).ok, 'positive control'); mutate(f); rejects(evaluateSafety(f.o), code);
});

test('R/T/U/V tooling Evidence A+B uses real index, working bytes, committed tree and independent trust', async t => {
    const f = batchFixture(t); f.activate(f.c.baseSha);
    const c = { version: 1, mode: 'topic-development', root: f.root, commonDir: f.c.commonDir, branch: f.c.branch,
        baseSha: f.c.baseSha, remote: 'origin', remoteFetchUrl: f.c.remoteFetchUrl, remotePushUrl: f.c.remotePushUrl,
        targetRef: 'refs/heads/' + f.c.branch, expectedTopicSha: null };
    const baseline = readGit(f.root, undefined, c); writeFileSync(join(f.root, tp), 'tooling reviewed\n'); f.git('add', '--', tp);
    const tr = f.git('write-tree'), ct = f.tree(f.c.finalSha, { [tp]: 'tooling reviewed\n' });
    const binding = { baseSha: c.baseSha, topicTree: tr, compositeTree: ct, files: { [tp]: { mode: '100644', blob: f.git('rev-parse', ':' + tp), sha256: h256('tooling reviewed\n') } },
        diffSha256: h256(execFileSync('git', ['-C', f.root, 'diff', '--binary', '--full-index', '--no-renames', '--cached', c.baseSha, '--'])), commitSha: null };
    const e = { binding, inputs: [f.c.rhythm, f.c.studio].map(x => ({ sha: x.sha, tree: x.tree, base: x.base, files: x.allowedFiles })), regression: f.regression(ct, 'tooling-composite') };
    const opts = { contract: c, baseline, binding, allowedFiles: [tp], phase: 'commit', commitBase: c.baseSha,
        evidence: f.record(e), observedRemote: { main: { remote: 'origin', ref: 'refs/heads/main', sha: c.baseSha }, topic: { remote: 'origin', ref: c.targetRef, sha: null } } };
    f.approve(opts, 'tooling-composite');
    assert(verifyToolingEvidence(opts).ok, JSON.stringify(verifyToolingEvidence(opts)));
    await t.test('A/J/Q/S mutated base, diff, tree or remote cannot reuse evidence', () => {
        for (const field of ['baseSha', 'topicTree', 'compositeTree', 'diffSha256']) {
            const bad = cloneBatch(opts); bad.binding[field] = '0'.repeat(field === 'diffSha256' ? 64 : 40); assert(!verifyToolingEvidence(bad).ok, field);
        }
        const bad = cloneBatch(opts); bad.observedRemote.main.sha = f.c.rhythm.sha; rejects(verifyToolingEvidence(bad), 'tooling-main-mismatch');
    });
    const head = f.commit(tr, [c.baseSha]); f.activate(head); opts.phase = 'postcommit';
    assert(verifyToolingEvidence(opts).ok, JSON.stringify(verifyToolingEvidence(opts)));
    await t.test('R1 committed then unstaged edited', () => {
        writeFileSync(join(f.root, tp), 'post test edit\n'); rejects(verifyToolingEvidence(opts), 'tooling-git-safety-failed'); writeFileSync(join(f.root, tp), 'tooling reviewed\n');
    });
    await t.test('R2 clean different commit with old evidence; R3 SHA-only rewrite', () => {
        // R1 restored the exact bytes; refresh only their cached stat before switching trees.
        // Prove semantic cleanliness first: never overwrite dirty content to prepare a refusal test.
        const indexTree = f.git('write-tree');
        assert.equal(readFileSync(join(f.root, tp), 'utf8'), f.git('show', ':' + tp) + '\n');
        assert.equal(f.git('diff', '--name-only'), '');
        assert.equal(f.git('diff', '--cached', '--name-only'), '');
        f.git('update-index', '--refresh');
        assert.equal(f.git('write-tree'), indexTree);
        assert.equal(f.git('status', '--porcelain'), '');
        const other = f.commit(f.tree(c.baseSha, { [tp]: 'different approved-scope bytes\n' }), [c.baseSha]); f.activate(other);
        rejects(verifyToolingEvidence(opts), 'tooling-bytes-mismatch');
        const bad = cloneBatch(opts); bad.binding.commitSha = other; rejects(verifyToolingEvidence(bad), 'tooling-bytes-mismatch'); f.activate(head);
    });
    await t.test('T absent/ID-only/wrong-scope/self-rehashed approval', () => {
        const bad = cloneBatch(opts); delete bad.trust; rejects(verifyToolingEvidence(bad), 'trusted-approval-missing');
        bad.trust = opts.trust; bad.approval = { approvalId: 'yes' }; rejects(verifyToolingEvidence(bad), 'trusted-approval-mismatch');
        const wrong = cloneBatch(opts); f.approve(wrong, 'batch-release'); rejects(verifyToolingEvidence(wrong), 'approval-scope-mismatch');
    });
    await t.test('U Composite PASS never permits main target', () => {
        const bad = cloneBatch(opts); bad.phase = 'push'; bad.pushRequest = { remote: 'origin', sourceRef: 'refs/heads/' + c.branch, sourceSha: head, targetRef: 'refs/heads/main', force: false };
        rejects(verifyToolingEvidence(bad), 'tooling-git-safety-failed');
    });
    await t.test('V adding Composite cannot override failed v1; clean legacy release remains only clean', () => {
        const current = readGit(f.root, c.baseSha, c), bad = { ...opts, current, allowedFiles: [sp], phase: 'development' };
        rejects(evaluateSafety(bad), 'topic-history-scope');
        assert(evaluateSafety({ current, phase: 'release', evidence: opts.evidence }).ok);
        assert.equal(evaluateSafety({ current, phase: 'release', evidence: opts.evidence }).publicationExecuted, undefined);
    });
    await t.test('CLI evidence requires out-of-band digest, never trust inside plan', () => {
        const plan = join(f.dir, 'tooling-plan.json'), obs = join(f.dir, 'tooling-observed.json');
        writeFileSync(plan, JSON.stringify(opts)); writeFileSync(obs, JSON.stringify(opts.observedRemote));
        const run = args => { try { return { exit: 0, result: JSON.parse(execFileSync(process.execPath, args, { cwd: f.root, encoding: 'utf8' })) }; }
            catch (error) { return { exit: error.status, result: JSON.parse(error.stdout) }; } };
        const args = [batchScript, 'evidence', plan, 'postcommit', obs];
        rejects(run(args).result, 'trusted-approval-missing'); assert(run([...args, opts.trust.approvalSha256]).result.ok);
    });
});


// P2-01: push member order is not policy; exact keys, values and types still are.
const pushOrders = [
    ['normal', ['remote', 'sourceRef', 'sourceSha', 'targetRef', 'force']],
    ['reverse', ['force', 'targetRef', 'sourceSha', 'sourceRef', 'remote']],
    ['alphabetical', ['force', 'remote', 'sourceRef', 'sourceSha', 'targetRef']]
];
function orderedPush(request, order) {
    return Object.fromEntries([...order.filter(k => Object.hasOwn(request, k)),
        ...Object.keys(request).filter(k => !order.includes(k))].map(k => [k, request[k]]));
}
function assertPushApiAndCli(f, options, expectedCode = null) {
    const plan = join(f.dir, 'push-order-plan.json'), obs = join(f.dir, 'push-order-observation.json');
    writeFileSync(plan, JSON.stringify(options)); writeFileSync(obs, JSON.stringify(options.observedRemote));
    const api = evaluateSafety(options);
    let cli, status = 0;
    try {
        cli = JSON.parse(execFileSync(process.execPath, [batchScript, 'check', plan, 'push', obs,
            options.trust.approvalSha256], { cwd: f.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
    } catch (error) { status = error.status; cli = JSON.parse(error.stdout); }
    assert.deepEqual(cli, api);
    assert.equal(status, expectedCode ? 1 : 0);
    if (expectedCode) rejects(api, expectedCode); else assert.equal(api.ok, true);
}
test('P2 push key order preserves exact fields, approval and CLI contract', async t => {
    const f = batchFixture(t), original = cloneBatch(f.o);
    const approval = readFileSync(f.o.approval.path), evidence = readFileSync(f.o.evidence.path);
    const refs = f.git('show-ref'), index = h256(readFileSync(join(f.root, '.git/index')));
    for (const [name, order] of pushOrders) await t.test('valid ' + name, () => {
        const o = cloneBatch(original); o.pushRequest = orderedPush(o.pushRequest, order);
        assertPushApiAndCli(f, o);
    });
    const invalid = [
        ['01 wrong remote', r => r.remote = 'other'],
        ['02 wrong source ref', r => r.sourceRef = 'refs/heads/codex/other'],
        ['03 wrong Final', r => r.sourceSha = f.c.baseSha],
        ['04 wrong target', r => r.targetRef = 'refs/heads/codex/other'],
        ['05 force true', r => r.force = true],
        ['06 force string false', r => r.force = 'false'],
        ['07 force zero', r => r.force = 0],
        ['08 force null', r => r.force = null],
        ...['remote', 'sourceRef', 'sourceSha', 'targetRef', 'force'].map((key, i) =>
            [String(9 + i).padStart(2, '0') + ' missing ' + key, r => delete r[key]]),
        ['14 extra field', r => r.extra = false],
        ['15 unknown field', r => r.destination = 'main'],
        ['16 case difference', r => r.remote = 'Origin'],
        ['17 whitespace', r => r.targetRef = ' refs/heads/main '],
        ['18 M1 source', r => r.sourceSha = f.c.m1.sha],
        ['19 ST source', r => r.sourceSha = f.c.studio.sha],
        ['20 source target swapped', r => { [r.sourceRef, r.targetRef] = [r.targetRef, r.sourceRef]; }]
    ];
    assert.equal(invalid.length, 20);
    for (const [name, mutate] of invalid) await t.test(name, () => {
        for (const [, order] of pushOrders) {
            const o = cloneBatch(original); mutate(o.pushRequest); o.pushRequest = orderedPush(o.pushRequest, order);
            assertPushApiAndCli(f, o, 'push-destination-mismatch');
        }
    });
    assert.deepEqual(readFileSync(f.o.approval.path), approval);
    assert.deepEqual(readFileSync(f.o.evidence.path), evidence);
    assert.deepEqual(f.o, original); // No re-approval or changed candidate for member ordering.
    assert.equal(f.git('show-ref'), refs); assert.equal(h256(readFileSync(join(f.root, '.git/index'))), index);
});
test('P2 reordered valid push cannot bypass graph approval evidence remote or clean gates', async t => {
    const cases = [
        ['approval missing', 'trusted-approval-mismatch', f => delete f.o.approval],
        ['Final mismatch', 'final-mismatch', f => { f.c.finalSha = f.c.m1.sha; f.approve(); }],
        ['other owner blob', 'batch-tree-mismatch', f => f.rebuild(null, null, { 'apps/shared/unapproved': 'other owner' })],
        ['wrong Composite evidence', 'evidence-source-mismatch', f => f.evidence(e => e.sourceTree = f.c.baseTree)],
        ['main advanced', 'remote-refs-mismatch', f => f.o.observedRemote.raw = f.o.observedRemote.raw.replace(f.c.baseSha, f.c.finalSha)],
        ['dirty worktree', 'batch-not-clean', f => writeFileSync(join(f.root, sp), 'dirty')],
        ['force push', 'push-destination-mismatch', f => f.o.pushRequest.force = true]
    ];
    for (const [name, code, mutate] of cases) await t.test(name, st => {
        const f = batchFixture(st); assertPushApiAndCli(f, f.o);
        mutate(f);
        for (const [, order] of pushOrders) {
            const o = cloneBatch(f.o); o.pushRequest = orderedPush(o.pushRequest, order);
            assertPushApiAndCli(f, o, code);
        }
    });
});
